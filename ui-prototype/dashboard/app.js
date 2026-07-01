(function () {
  "use strict";

  var config = {
    vehicleId: "TRUCK_01",
    tankLiters: 180,
    dataSource: "Fuel Sensor",
    maxLogItems: 6,
    historySize: 68,
    chartWidth: 760,
    chartHeight: 260,
    baseLocation: {
      stationary: "10.7721, 106.6578",
      moving: "10.7768, 106.6602"
    }
  };

  var copy = {
    normal: {
      status: "Normal",
      code: "NORMAL",
      decision: "Normal",
      rule: "Stable trend",
      result: "No anomaly",
      confidence: 94
    },
    refuel: {
      status: "Refuel",
      code: "REFUEL",
      decision: "Refuel",
      rule: "Positive delta",
      result: "Fuel added",
      confidence: 91
    },
    noise: {
      status: "Sloshing",
      code: "NOISE",
      decision: "Sloshing",
      rule: "Filtered fluctuation",
      result: "Signal noise",
      confidence: 79
    },
    theft: {
      status: "Theft suspected",
      code: "THEFT",
      decision: "Theft suspected",
      rule: "Stationary drop",
      result: "Fuel drop confirmed",
      confidence: 96
    }
  };

  var state = {
    mode: "normal",
    vehicleId: config.vehicleId,
    ignitionOn: false,
    speedKmh: 0,
    gpsState: "Stationary",
    gpsLocation: config.baseLocation.stationary,
    geoZone: "Depot A",
    baselinePct: 64.2,
    fuelPct: 64.2,
    rawFuelPct: 64.2,
    filteredFuelPct: 64.2,
    tick: 0,
    history: [],
    events: []
  };

  var elements = {};
  var navLinks = [];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatNumber(value, digits) {
    return Number(value).toFixed(digits);
  }

  function nowTime() {
    return new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function shortTime() {
    return new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function litersFromPercent(percent) {
    return percent * config.tankLiters / 100;
  }

  function fuelDeltaLiters() {
    return litersFromPercent(state.filteredFuelPct - state.baselinePct);
  }

  function signedLiters(value) {
    var sign = value > 0 ? "+" : "";
    return sign + formatNumber(value, 1) + " L";
  }

  function addEvent(message) {
    state.events.unshift({
      time: nowTime(),
      message: message
    });

    if (state.events.length > config.maxLogItems) {
      state.events.length = config.maxLogItems;
    }
  }

  function classByMode(mode) {
    if (mode === "theft") return "theft";
    if (mode === "refuel") return "refuel";
    if (mode === "noise") return "noise";
    return "normal";
  }

  function applyClass(element, baseClass, modifier) {
    element.className = baseClass;
    if (modifier) element.classList.add(modifier);
  }

  function setMode(mode) {
    state.mode = mode;
    state.baselinePct = state.filteredFuelPct;

    if (mode === "normal") {
      addEvent("Fuel stable");
    } else if (mode === "refuel") {
      state.ignitionOn = false;
      state.speedKmh = 0;
      state.gpsState = "Stationary";
      state.gpsLocation = config.baseLocation.stationary;
      state.geoZone = "Fuel station";
      addEvent("Refuel event");
    } else if (mode === "noise") {
      addEvent("Signal fluctuation");
    } else if (mode === "theft") {
      state.ignitionOn = false;
      state.speedKmh = 0;
      state.gpsState = "Stationary";
      state.gpsLocation = config.baseLocation.stationary;
      state.geoZone = "Depot A";
      addEvent("Stationary fuel drop");
    }

    render();
  }

  function resetView() {
    state.mode = "normal";
    state.ignitionOn = false;
    state.speedKmh = 0;
    state.gpsState = "Stationary";
    state.gpsLocation = config.baseLocation.stationary;
    state.geoZone = "Depot A";
    state.baselinePct = 64.2;
    state.fuelPct = 64.2;
    state.rawFuelPct = 64.2;
    state.filteredFuelPct = 64.2;
    state.tick = 0;
    state.history = [];
    state.events = [];

    seedHistory();
    state.baselinePct = state.filteredFuelPct;
    addEvent("System online");
    addEvent("GPS fix acquired");
    render();
  }

  function toggleIgnition() {
    state.ignitionOn = !state.ignitionOn;
    state.speedKmh = state.ignitionOn ? 18 : 0;
    state.gpsState = state.ignitionOn ? "Moving" : "Stationary";
    state.gpsLocation = state.ignitionOn ? config.baseLocation.moving : config.baseLocation.stationary;
    state.geoZone = state.ignitionOn ? "District route" : "Depot A";
    addEvent(state.ignitionOn ? "Ignition ON" : "Ignition OFF");
    render();
  }

  function updateFuelTarget() {
    var drift = Math.sin(state.tick / 5) * 0.05;

    if (state.mode === "refuel") {
      state.fuelPct = clamp(state.fuelPct + 0.82, 0, 92);
    } else if (state.mode === "theft") {
      state.fuelPct = clamp(state.fuelPct - 0.75, 18, 100);
    } else if (state.mode === "noise") {
      state.fuelPct = clamp(state.fuelPct + Math.sin(state.tick * 1.44) * 1.14, 0, 100);
    } else {
      state.fuelPct = clamp(state.fuelPct + drift, 0, 100);
    }
  }

  function updateVehicleContext() {
    if (state.mode === "theft") {
      state.ignitionOn = false;
      state.speedKmh = 0;
      state.gpsState = "Stationary";
      state.gpsLocation = config.baseLocation.stationary;
      state.geoZone = "Depot A";
      return;
    }

    if (state.mode === "refuel") {
      state.ignitionOn = false;
      state.speedKmh = 0;
      state.gpsState = "Stationary";
      state.gpsLocation = config.baseLocation.stationary;
      state.geoZone = "Fuel station";
      return;
    }

    if (state.ignitionOn) {
      state.speedKmh = 18 + Math.round(Math.sin(state.tick / 4) * 5);
      state.gpsState = "Moving";
      state.gpsLocation = config.baseLocation.moving;
      state.geoZone = "District route";
      return;
    }

    state.speedKmh = 0;
    state.gpsState = "Stationary";
    state.gpsLocation = config.baseLocation.stationary;
    state.geoZone = "Depot A";
  }

  function updateTelemetry() {
    state.tick += 1;
    updateFuelTarget();

    var noise = Math.sin(state.tick * 1.8) * 0.36;
    if (state.mode === "noise") {
      noise += Math.sin(state.tick * 3.1) * 2.05;
    }

    state.rawFuelPct = clamp(state.fuelPct + noise, 0, 100);
    state.filteredFuelPct = state.filteredFuelPct + (state.rawFuelPct - state.filteredFuelPct) * 0.18;
    updateVehicleContext();

    state.history.push({
      raw: state.rawFuelPct,
      filtered: state.filteredFuelPct
    });

    if (state.history.length > config.historySize) {
      state.history.shift();
    }
  }

  function buildPolyline(values, key) {
    if (!values.length) return "";

    var lastIndex = Math.max(values.length - 1, 1);
    return values.map(function (item, index) {
      var x = (index / lastIndex) * config.chartWidth;
      var y = config.chartHeight - (clamp(item[key], 0, 100) / 100) * config.chartHeight;
      return formatNumber(x, 1) + "," + formatNumber(y, 1);
    }).join(" ");
  }

  function buildArea(values, key) {
    var line = buildPolyline(values, key);
    if (!line) return "";
    return "0," + config.chartHeight + " " + line + " " + config.chartWidth + "," + config.chartHeight;
  }

  function renderLog() {
    elements.eventLog.innerHTML = "";

    state.events.forEach(function (event) {
      var item = document.createElement("li");
      var time = document.createElement("time");
      var text = document.createElement("span");

      time.textContent = event.time;
      text.textContent = event.message;
      item.appendChild(time);
      item.appendChild(text);
      elements.eventLog.appendChild(item);
    });
  }

  function renderActions() {
    var buttonMap = {
      normal: elements.normalBtn,
      refuel: elements.refuelBtn,
      noise: elements.noiseBtn,
      theft: elements.theftBtn
    };

    Object.keys(buttonMap).forEach(function (key) {
      buttonMap[key].classList.toggle("is-active", key === state.mode);
    });

    elements.ignitionToggle.classList.toggle("is-on", state.ignitionOn);
    elements.ignitionToggle.setAttribute("aria-pressed", String(state.ignitionOn));
    elements.ignitionToggle.textContent = state.ignitionOn ? "Ignition ON" : "Ignition OFF";
  }

  function render() {
    var active = copy[state.mode];
    var mode = classByMode(state.mode);
    var liters = litersFromPercent(state.filteredFuelPct);
    var delta = fuelDeltaLiters();

    elements.vehicleId.textContent = state.vehicleId;
    elements.lastUpdate.textContent = shortTime();
    elements.fuelPercent.textContent = Math.round(state.filteredFuelPct);
    elements.fuelLiters.textContent = formatNumber(liters, 1) + " L";
    elements.tankCapacity.textContent = config.tankLiters + " L";
    elements.fuelBar.style.width = clamp(state.filteredFuelPct, 0, 100) + "%";

    elements.fuelStatus.textContent = active.status;
    applyClass(elements.fuelStatus, "state-badge", mode);

    elements.decisionTitle.textContent = active.decision;
    elements.ruleResult.textContent = active.rule;
    elements.confidenceValue.textContent = active.confidence + "%";
    applyClass(elements.decisionStrip, "decision-strip", mode);

    elements.ignitionState.textContent = state.ignitionOn ? "ON" : "OFF";
    elements.speedValue.textContent = state.speedKmh + " km/h";
    elements.gpsState.textContent = state.gpsState;
    elements.gpsLocation.textContent = state.gpsLocation;
    elements.geoZone.textContent = state.geoZone;
    elements.dataSource.textContent = config.dataSource;

    elements.alertCode.textContent = active.code;
    applyClass(elements.alertCode, "alert-code", mode);

    elements.evidenceFuelDelta.textContent = signedLiters(delta);
    elements.evidenceIgnitionText.textContent = state.ignitionOn ? "ON" : "OFF";
    elements.evidenceSpeedText.textContent = state.speedKmh + " km/h";
    elements.evidenceGpsText.textContent = state.gpsState;
    elements.evidenceLocationText.textContent = state.geoZone;
    elements.evidenceResult.textContent = active.result;
    applyClass(elements.evidenceRow, "evidence-row", mode);

    elements.filteredFuelValue.textContent = formatNumber(state.filteredFuelPct, 1) + "%";
    elements.rawFuelValue.textContent = formatNumber(state.rawFuelPct, 1) + "%";
    elements.fuelDelta.textContent = signedLiters(delta);

    elements.rawLine.setAttribute("points", buildPolyline(state.history, "raw"));
    elements.filteredLine.setAttribute("points", buildPolyline(state.history, "filtered"));
    elements.filteredArea.setAttribute("points", buildArea(state.history, "filtered"));

    renderActions();
    renderLog();
  }

  function setActiveNav(sectionId) {
    navLinks.forEach(function (link) {
      var isActive = link.getAttribute("data-section") === sectionId;
      link.classList.toggle("is-active", isActive);

      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function setupNavigation() {
    navLinks = Array.prototype.slice.call(document.querySelectorAll(".tab-link[data-section]"));

    navLinks.forEach(function (link) {
      link.addEventListener("click", function (event) {
        var sectionId = link.getAttribute("data-section");
        var target = document.getElementById(sectionId);
        if (!target) return;

        event.preventDefault();
        setActiveNav(sectionId);
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    if ("IntersectionObserver" in window) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            setActiveNav(entry.target.id);
          }
        });
      }, {
        root: null,
        rootMargin: "-36% 0px -54% 0px",
        threshold: 0
      });

      document.querySelectorAll(".nav-section").forEach(function (section) {
        observer.observe(section);
      });
    }
  }

  function seedHistory() {
    for (var index = 0; index < config.historySize; index += 1) {
      updateTelemetry();
    }
  }

  function cacheElements() {
    [
      "vehicleId",
      "connectionStatus",
      "lastUpdate",
      "fuelStatus",
      "fuelPercent",
      "fuelLiters",
      "tankCapacity",
      "fuelBar",
      "decisionStrip",
      "decisionTitle",
      "ruleResult",
      "confidenceValue",
      "ignitionToggle",
      "ignitionState",
      "speedValue",
      "gpsState",
      "gpsLocation",
      "geoZone",
      "dataSource",
      "alertCode",
      "evidenceFuelDelta",
      "evidenceIgnitionText",
      "evidenceSpeedText",
      "evidenceGpsText",
      "evidenceLocationText",
      "evidenceResult",
      "filteredFuelValue",
      "rawFuelValue",
      "fuelDelta",
      "filteredArea",
      "rawLine",
      "filteredLine",
      "eventLog",
      "normalBtn",
      "refuelBtn",
      "noiseBtn",
      "theftBtn",
      "resetBtn"
    ].forEach(function (id) {
      elements[id] = document.getElementById(id);
      if (!elements[id]) {
        throw new Error("Missing UI element: " + id);
      }
    });

    elements.evidenceRow = document.querySelector(".evidence-row:not(.header)");
    if (!elements.evidenceRow) {
      throw new Error("Missing evidence row");
    }
  }

  function bindEvents() {
    elements.normalBtn.addEventListener("click", function () { setMode("normal"); });
    elements.refuelBtn.addEventListener("click", function () { setMode("refuel"); });
    elements.noiseBtn.addEventListener("click", function () { setMode("noise"); });
    elements.theftBtn.addEventListener("click", function () { setMode("theft"); });
    elements.resetBtn.addEventListener("click", resetView);
    elements.ignitionToggle.addEventListener("click", toggleIgnition);
  }

  function init() {
    cacheElements();
    setupNavigation();
    bindEvents();
    resetView();

    window.setInterval(function () {
      updateTelemetry();
      render();
    }, 850);
  }

  document.addEventListener("DOMContentLoaded", init);
}());
