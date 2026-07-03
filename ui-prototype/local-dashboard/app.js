(function () {
  "use strict";

  var SAMPLE = window.SMARTT_SAMPLE || { scenarios: {} };
  var state = {
    dataset: null,
    mode: "sample",
    range: "today",
    scenarioKey: SAMPLE.defaultScenario || "parked_drop",
    vehicleId: "",
    selectedEventId: "",
    showEvents: true,
    map: null,
    currentMarker: null,
    eventLayer: null,
    currentLatLng: null,
    chartEvents: [],
    needsMapFit: true,
    refreshTimer: null,
    liveAttempted: false
  };

  var els = {};
  var detailFields = {};
  var contextFields = {};
  var fullDateFormatter = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  var compactTimeFormatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  function $(id) {
    return document.getElementById(id);
  }

  function pick(source, names) {
    if (!source) return undefined;
    for (var i = 0; i < names.length; i += 1) {
      if (Object.prototype.hasOwnProperty.call(source, names[i]) && source[names[i]] !== undefined && source[names[i]] !== null && source[names[i]] !== "") {
        return source[names[i]];
      }
    }
    return undefined;
  }

  function numberOr(value, fallback) {
    if (value === undefined || value === null || value === "") return fallback;
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function boolValue(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    var text = String(value || "").trim().toLowerCase();
    return text === "true" || text === "1" || text === "on" || text === "yes";
  }

  function parseTimestamp(value) {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === "number") {
      var millis = value > 1000000000000 ? value : value * 1000;
      var numericDate = new Date(millis);
      return Number.isNaN(numericDate.getTime()) ? null : numericDate;
    }
    if (!value) return null;
    var text = String(value);
    var date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatFull(value) {
    var date = parseTimestamp(value);
    return date ? fullDateFormatter.format(date).replace(/\sGMT.*$/, "") : "--";
  }

  function formatCompact(value, reference) {
    var date = parseTimestamp(value);
    if (!date) return "--";
    var ref = reference || new Date();
    if (date.toDateString() === ref.toDateString()) {
      return "Today, " + compactTimeFormatter.format(date);
    }
    return fullDateFormatter.format(date).replace(/\sGMT.*$/, "");
  }

  function formatPercent(value, digits) {
    var number = numberOr(value, null);
    if (number === null) return "--";
    return number.toFixed(digits === undefined ? 1 : digits) + "%";
  }

  function formatLiters(value, signed) {
    var number = numberOr(value, null);
    if (number === null) return "--";
    var sign = signed && number > 0 ? "+" : "";
    return sign + number.toFixed(1) + " L";
  }

  function formatNumber(value, suffix) {
    var number = numberOr(value, null);
    if (number === null) return "--";
    return number.toFixed(1).replace(/\.0$/, "") + (suffix || "");
  }

  function humanize(value) {
    var text = String(value || "").trim();
    if (!text) return "--";
    return text
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function mergeRawJson(row) {
    var raw = pick(row, ["raw_json", "rawJson"]);
    if (typeof raw !== "string") return row || {};
    try {
      var parsed = JSON.parse(raw);
      return Object.assign({}, parsed, row);
    } catch (err) {
      return row || {};
    }
  }

  function normalizeDecision(row) {
    var eventText = String(pick(row, ["currentEvent", "current_event", "eventLabel", "event_label", "event", "detectorState", "detector_state"]) || "Fuel stable");
    var searchable = eventText.replace(/[_-]+/g, " ");
    if (/candidate/i.test(searchable)) return humanize(eventText);
    if (/theft|suspicious|stationary drop|fuel drop/i.test(searchable)) return "Theft suspected";
    if (/refuel/i.test(searchable)) return "Refuel detected";
    if (/slosh|noise/i.test(searchable)) return "Sloshing detected";
    if (/sensor|fault|ads/i.test(searchable)) return "Sensor fault";
    return eventText === "NORMAL" || eventText === "NORMAL_ON" ? "Fuel stable" : humanize(eventText);
  }

  function normalizeEventLabel(eventType, label) {
    var typeText = String(eventType || "");
    var labelText = String(label || "");
    if (/CANDIDATE/i.test(typeText) && !/candidate/i.test(labelText)) {
      return humanize(typeText);
    }
    return labelText || humanize(typeText);
  }

  function normalizeTelemetry(input, index) {
    var row = mergeRawJson(input);
    var timestamp = pick(row, ["timestamp", "created_at", "createdAt", "time", "gps_time"]);
    var date = parseTimestamp(timestamp);
    var fuelPercent = numberOr(pick(row, ["fuelPercent", "fuel_percent", "fuel_percent_filtered", "filteredFuelPercent"]), null);
    var tankCapacity = numberOr(pick(row, ["tankCapacityLiters", "tank_capacity_liters"]), SAMPLE.tankCapacityLiters || 180);
    var fuelLiters = numberOr(pick(row, ["fuelLiters", "fuel_liters"]), fuelPercent === null ? null : fuelPercent * tankCapacity / 100);

    return {
      id: "t-" + (pick(row, ["id"]) || index),
      timestamp: timestamp,
      date: date,
      deviceId: pick(row, ["deviceId", "device_id"]) || "--",
      vehicleId: pick(row, ["vehicleId", "vehicle_id"]) || "SMT-001",
      vehicleLabel: pick(row, ["vehicleLabel", "vehicle_label"]) || "Fleet vehicle",
      sourceType: pick(row, ["sourceType", "source_type", "data_source"]) || "ANALOG_ADS1115",
      tankCapacityLiters: tankCapacity,
      fuelPercent: fuelPercent,
      fuelLiters: fuelLiters,
      fuelRatePercentPerSec: numberOr(pick(row, ["fuelRatePercentPerSec", "fuel_rate_percent_per_sec", "fuel_rate_pct_per_sec"]), 0),
      ignition: boolValue(pick(row, ["ignition", "ignitionOn", "ignition_on"])),
      gpsFix: boolValue(pick(row, ["gpsFix", "gps_fix", "gps_data_fresh"])),
      gpsLat: numberOr(pick(row, ["gpsLat", "gps_lat", "lat"]), null),
      gpsLon: numberOr(pick(row, ["gpsLon", "gps_lon", "lon", "lng"]), null),
      gpsState: pick(row, ["gpsState", "gps_state"]) || "--",
      gpsMotionState: pick(row, ["gpsMotionState", "gps_motion_state", "motionState", "motion_state"]) || "--",
      speedKmh: numberOr(pick(row, ["speedKmh", "speed_kmh", "gps_speed_kmh"]), 0),
      detectorState: pick(row, ["detectorState", "detector_state", "event"]) || "NORMAL",
      currentEvent: normalizeDecision(row),
      confidence: numberOr(pick(row, ["confidence", "anomaly_confidence"]), null),
      signalStability: numberOr(pick(row, ["signalStability", "signal_stability"]), null),
      sloshingScore: numberOr(pick(row, ["sloshingScore", "sloshing_score"]), null),
      ruleResult: pick(row, ["ruleResult", "rule_result", "gps_decision_context"]) || "Stable trend",
      fuelDeltaLiters: numberOr(pick(row, ["fuelDeltaLiters", "fuel_delta_liters", "delta_liters"]), null),
      fuelDeltaPercent: numberOr(pick(row, ["fuelDeltaPercent", "fuel_delta_percent", "delta_percent"]), null)
    };
  }

  function normalizeEvent(input, index) {
    var row = mergeRawJson(input);
    var timestamp = pick(row, ["timestamp", "created_at", "createdAt", "time"]);
    var eventType = pick(row, ["eventType", "event_type", "event", "detectorState", "detector_state", "code"]) || "EVENT";
    var label = pick(row, ["eventLabel", "event_label", "label", "message", "currentEvent", "current_event"]);
    if (!label || /^[A-Z0-9_]+$/.test(String(label))) label = humanize(eventType);
    label = normalizeEventLabel(eventType, label);

    return {
      id: String(pick(row, ["eventId", "event_id", "id"]) || "e-" + index + "-" + timestamp + "-" + eventType),
      timestamp: timestamp,
      date: parseTimestamp(timestamp),
      deviceId: pick(row, ["deviceId", "device_id"]) || "--",
      vehicleId: pick(row, ["vehicleId", "vehicle_id"]) || "SMT-001",
      eventType: String(eventType),
      eventLabel: String(label),
      fuelBeforePercent: numberOr(pick(row, ["fuelBeforePercent", "fuel_before_percent"]), null),
      fuelAfterPercent: numberOr(pick(row, ["fuelAfterPercent", "fuel_after_percent", "fuelPercent", "fuel_percent"]), null),
      fuelBeforeLiters: numberOr(pick(row, ["fuelBeforeLiters", "fuel_before_liters"]), null),
      fuelAfterLiters: numberOr(pick(row, ["fuelAfterLiters", "fuel_after_liters", "fuelLiters", "fuel_liters"]), null),
      fuelDeltaPercent: numberOr(pick(row, ["fuelDeltaPercent", "fuel_delta_percent", "delta_percent"]), null),
      fuelDeltaLiters: numberOr(pick(row, ["fuelDeltaLiters", "fuel_delta_liters", "delta_liters"]), null),
      ignition: boolValue(pick(row, ["ignition", "ignitionOn", "ignition_on"])),
      gpsState: pick(row, ["gpsState", "gps_state"]) || "--",
      gpsMotionState: pick(row, ["gpsMotionState", "gps_motion_state", "motionState", "motion_state"]) || "--",
      gpsLat: numberOr(pick(row, ["gpsLat", "gps_lat", "lat"]), null),
      gpsLon: numberOr(pick(row, ["gpsLon", "gps_lon", "lon", "lng"]), null),
      speedKmh: numberOr(pick(row, ["speedKmh", "speed_kmh", "gps_speed_kmh"]), 0),
      signalStability: numberOr(pick(row, ["signalStability", "signal_stability"]), null),
      sloshingScore: numberOr(pick(row, ["sloshingScore", "sloshing_score"]), null),
      confidence: numberOr(pick(row, ["confidence", "anomaly_confidence"]), null),
      ruleResult: pick(row, ["ruleResult", "rule_result", "evidenceSummary", "evidence_summary"]) || "--"
    };
  }

  function normalizeDataset(payload, mode) {
    payload = payload || {};
    var telemetryRows = Array.isArray(payload.telemetry) ? payload.telemetry : [];
    var eventRows = Array.isArray(payload.events) ? payload.events : [];
    if (payload.latest) telemetryRows = telemetryRows.concat([payload.latest]);

    var telemetry = telemetryRows
      .map(normalizeTelemetry)
      .filter(function (row) { return row.date && row.fuelPercent !== null; })
      .sort(function (a, b) { return a.date - b.date; });

    var dedupedTelemetry = [];
    var seenTelemetry = {};
    telemetry.forEach(function (row) {
      var key = row.vehicleId + "|" + row.date.toISOString();
      if (!seenTelemetry[key]) {
        seenTelemetry[key] = true;
        dedupedTelemetry.push(row);
      }
    });

    var events = eventRows
      .map(normalizeEvent)
      .filter(function (row) { return row.date; })
      .sort(function (a, b) { return a.date - b.date; });

    return {
      mode: mode,
      label: payload.label || (mode === "live" ? "Live server mode" : "Sample data"),
      vehicle: payload.vehicle || {},
      telemetry: dedupedTelemetry,
      events: events
    };
  }

  function sampleDataset(key) {
    var scenarios = SAMPLE.scenarios || {};
    var scenario = scenarios[key] || scenarios[SAMPLE.defaultScenario] || scenarios.parked_drop || Object.values(scenarios)[0] || {};
    return normalizeDataset({
      label: scenario.label || "Sample data",
      vehicle: scenario.vehicle || {},
      telemetry: scenario.telemetry || [],
      events: scenario.events || []
    }, "sample");
  }

  function canTryApi() {
    var host = window.location.hostname;
    return window.location.protocol.indexOf("http") === 0 && (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "");
  }

  function fetchJson(path) {
    return fetch(path, { cache: "no-store" }).then(function (response) {
      if (!response.ok) throw new Error("Request unavailable");
      return response.json();
    });
  }

  function asArray(payload, keys) {
    if (Array.isArray(payload)) return payload;
    for (var i = 0; i < keys.length; i += 1) {
      if (Array.isArray(payload[keys[i]])) return payload[keys[i]];
    }
    return [];
  }

  function loadLiveData() {
    return Promise.all([
      fetchJson("/api/latest"),
      fetchJson("/api/history"),
      fetchJson("/api/events")
    ]).then(function (responses) {
      var latestPayload = responses[0] || {};
      var historyPayload = responses[1] || {};
      var eventsPayload = responses[2] || {};
      var latest = latestPayload.latest || latestPayload.item || latestPayload;
      var history = asArray(historyPayload, ["items", "history", "telemetry"]);
      var events = asArray(eventsPayload, ["items", "events"]);
      var dataset = normalizeDataset({
        label: "Live server mode",
        vehicle: latestPayload.vehicle || {},
        latest: latest && Object.keys(latest).length ? latest : null,
        telemetry: history,
        events: events
      }, "live");

      if (!dataset.telemetry.length) {
        throw new Error("No telemetry yet");
      }
      return dataset;
    });
  }

  function currentVehicleRows() {
    var dataset = state.dataset;
    if (!dataset) return [];
    return dataset.telemetry.filter(function (row) {
      return !state.vehicleId || row.vehicleId === state.vehicleId;
    });
  }

  function latestTelemetry() {
    var rows = currentVehicleRows();
    return rows.length ? rows[rows.length - 1] : null;
  }

  function selectedVehicleEvents() {
    var dataset = state.dataset;
    if (!dataset) return [];
    return dataset.events.filter(function (row) {
      return !state.vehicleId || row.vehicleId === state.vehicleId;
    });
  }

  function referenceDate() {
    var latest = latestTelemetry();
    if (latest && latest.date) return latest.date;
    var events = selectedVehicleEvents();
    return events.length ? events[events.length - 1].date : new Date();
  }

  function rangeWindow() {
    var ref = referenceDate();
    var start = null;
    var end = new Date(ref.getTime());
    if (state.range === "today") {
      start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
      end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    } else if (state.range === "7" || state.range === "30") {
      start = new Date(ref.getTime() - Number(state.range) * 24 * 60 * 60 * 1000);
    }
    return { start: start, end: end };
  }

  function inRange(row) {
    if (state.range === "all") return true;
    if (!row.date) return false;
    var windowRange = rangeWindow();
    if (windowRange.start && row.date < windowRange.start) return false;
    if (windowRange.end && row.date > windowRange.end) return false;
    return true;
  }

  function filteredTelemetry() {
    return currentVehicleRows().filter(inRange);
  }

  function filteredEvents() {
    return selectedVehicleEvents().filter(inRange);
  }

  function eventSearchText(event) {
    return (event.eventType + " " + event.eventLabel + " " + event.ruleResult)
      .replace(/[_-]+/g, " ")
      .toLowerCase();
  }

  function isCandidateEvent(event) {
    return /candidate/.test(eventSearchText(event));
  }

  function isConfirmedSuspiciousEvent(event) {
    if (isCandidateEvent(event)) return false;
    var type = String(event.eventType || "").toUpperCase();
    var text = eventSearchText(event);
    return ["SUSPICIOUS_DROP", "THEFT_ALERT", "FUEL_THEFT_ANOMALY"].indexOf(type) !== -1 ||
      /theft suspected|stationary fuel drop|stationary drop confirmed|fuel theft|suspicious loss/.test(text);
  }

  function isConfirmedRefuelEvent(event) {
    if (isCandidateEvent(event)) return false;
    var type = String(event.eventType || "").toUpperCase();
    var text = eventSearchText(event);
    return type === "REFUEL_EVENT" || /refuel detected|refuel confirmed/.test(text);
  }

  function eventCategory(event) {
    var text = eventSearchText(event);
    if (isCandidateEvent(event)) return "candidate";
    if (isConfirmedSuspiciousEvent(event)) return "danger";
    if (isConfirmedRefuelEvent(event)) return "refuel";
    if (/slosh|noise|unstable/.test(text)) return "slosh";
    if (/sensor|fault|ads/.test(text)) return "fault";
    return "normal";
  }

  function colorForEvent(event) {
    var category = eventCategory(event);
    if (category === "danger") return "#d84f32";
    if (category === "refuel") return "#14896c";
    if (category === "candidate") return "#b87610";
    if (category === "slosh") return "#c98212";
    if (category === "fault") return "#4f5d6b";
    return "#087ea4";
  }

  function categoryLabel(category) {
    return {
      danger: "Alert",
      refuel: "Refuel",
      candidate: "Pending",
      slosh: "Noise",
      fault: "Signal",
      normal: "Event"
    }[category] || "Event";
  }

  function incidentStateLabel(category) {
    return {
      danger: "Confirmed alert",
      refuel: "Confirmed refuel",
      candidate: "Pending confirmation",
      slosh: "Filtered movement fluctuation",
      fault: "Signal review",
      normal: "Operational event"
    }[category] || "Operational event";
  }

  function hasCoordinates(row) {
    return Number.isFinite(row.gpsLat) && Number.isFinite(row.gpsLon);
  }

  function nearestFuelPercent(event) {
    var rows = currentVehicleRows();
    if (!rows.length) return null;
    var best = rows[0];
    rows.forEach(function (row) {
      if (Math.abs(row.date - event.date) < Math.abs(best.date - event.date)) {
        best = row;
      }
    });
    return best.fuelPercent;
  }

  function setText(id, value) {
    if (els[id]) els[id].textContent = value;
  }

  function vehicleOptions() {
    var dataset = state.dataset;
    if (!dataset) return [];
    var seen = {};
    dataset.telemetry.concat(dataset.events).forEach(function (row) {
      if (row.vehicleId) seen[row.vehicleId] = true;
    });
    return Object.keys(seen).sort();
  }

  function syncVehicleSelector() {
    var options = vehicleOptions();
    if (!options.length) options = ["SMT-001"];
    if (!state.vehicleId || options.indexOf(state.vehicleId) === -1) state.vehicleId = options[0];

    var previous = els.vehicleSelect.value;
    els.vehicleSelect.innerHTML = "";
    options.forEach(function (vehicleId) {
      var option = document.createElement("option");
      option.value = vehicleId;
      option.textContent = vehicleId;
      els.vehicleSelect.appendChild(option);
    });
    els.vehicleSelect.value = state.vehicleId || previous || options[0];
  }

  function renderStatus() {
    var latest = latestTelemetry();
    var isLive = state.mode === "live";
    els.serverStatus.className = isLive ? "status-pill live" : "status-pill sample";
    els.serverStatus.innerHTML = "<span></span>" + (isLive ? "Server online" : "Sample data");
    els.dataMode.className = isLive ? "status-pill live" : "status-pill sample";
    els.dataMode.innerHTML = "<span></span>" + (isLive ? "Live APIs" : "Sample data");
    els.scenarioSelect.disabled = isLive;
    els.scenarioSelect.title = isLive ? "Live server data is active" : "";
    els.scenarioSelect.closest(".scenario-control").classList.toggle("is-disabled", isLive);
    els.lastTelemetry.textContent = latest ? formatFull(latest.date) : "--";
    els.headerVehicle.textContent = state.vehicleId || "--";
    els.headerDecision.textContent = latest ? latest.currentEvent : "--";
  }

  function renderKpis() {
    var latest = latestTelemetry();
    var events = filteredEvents();
    var refuels = events.filter(isConfirmedRefuelEvent);
    var lastRefuel = refuels.length ? refuels[refuels.length - 1] : null;
    var suspiciousLoss = events.reduce(function (total, event) {
      if (!isConfirmedSuspiciousEvent(event)) return total;
      var liters = numberOr(event.fuelDeltaLiters, 0);
      return liters < 0 ? total + Math.abs(liters) : total;
    }, 0);
    var suspiciousCard = els.kpiSuspicious ? els.kpiSuspicious.closest(".kpi-card") : null;
    if (suspiciousCard) suspiciousCard.classList.toggle("has-warning", suspiciousLoss > 0);

    setText("kpiFuel", latest ? Math.round(latest.fuelPercent) + "%" : "--");
    setText("kpiFuelSub", latest ? formatLiters(latest.fuelLiters, false) + " estimated" : "No telemetry");
    setText("kpiDecision", latest ? latest.currentEvent : "--");
    setText("kpiDecisionSub", latest ? latest.ruleResult : "--");
    setText("kpiEvents", String(events.length));
    setText("kpiEventsSub", state.range === "all" ? "All data" : "Selected range");
    setText("kpiSuspicious", suspiciousLoss > 0 ? suspiciousLoss.toFixed(1) + " L" : "0.0 L");
    setText("kpiSuspiciousSub", suspiciousLoss > 0 ? "Confirmed drops only" : "No suspicious loss");
    setText("kpiRefuel", lastRefuel ? formatLiters(lastRefuel.fuelDeltaLiters, true) : "--");
    setText("kpiRefuelSub", lastRefuel ? formatFull(lastRefuel.date) : "No refuel in range");

    if (!latest) {
      setText("kpiStatus", "No telemetry");
      setText("kpiStatusSub", "Waiting for data");
      return;
    }

    if (state.mode === "sample") {
      setText("kpiStatus", "Sample data");
      setText("kpiStatusSub", formatFull(latest.date));
      return;
    }

    var recent = Math.abs(new Date() - latest.date) <= 10 * 60 * 1000;
    setText("kpiStatus", recent ? "Device online" : "No recent data");
    setText("kpiStatusSub", "Server online, " + formatFull(latest.date));
  }

  function updateRangeButtons() {
    document.querySelectorAll(".range-button").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.range === state.range);
    });
  }

  function setContext(name, value) {
    if (contextFields[name]) contextFields[name].textContent = value;
  }

  function renderLiveContext() {
    var latest = latestTelemetry();
    Object.keys(contextFields).forEach(function (name) {
      contextFields[name].textContent = "--";
    });

    if (!latest) return;
    setContext("ignition", latest.ignition ? "ON" : "OFF");
    setContext("gpsState", latest.gpsState);
    setContext("motionState", latest.gpsMotionState);
    setContext("speed", formatNumber(latest.speedKmh, " km/h"));
    setContext("signalStability", latest.signalStability === null ? "--" : Math.round(latest.signalStability) + "%");
    setContext("sloshingScore", latest.sloshingScore === null ? "--" : Math.round(latest.sloshingScore) + "%");
    setContext("confidence", latest.confidence === null ? "--" : Math.round(latest.confidence) + "%");
    setContext("sourceType", latest.sourceType || "--");
  }

  function drawTimeline() {
    var canvas = els.fuelChart;
    var ctx = canvas.getContext("2d");
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var canvasHeight = Math.max(320, Math.floor(rect.height || 390));
    canvas.width = Math.max(320, Math.floor(rect.width * dpr));
    canvas.height = Math.floor(canvasHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var width = Math.max(320, rect.width);
    var height = canvasHeight;
    var pad = { left: 56, right: 24, top: 42, bottom: 56 };
    var plotW = width - pad.left - pad.right;
    var plotH = height - pad.top - pad.bottom;
    var points = filteredTelemetry();
    var events = filteredEvents();
    state.chartEvents = [];

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#fbfdfe";
    ctx.fillRect(pad.left, pad.top, plotW, plotH);

    ctx.strokeStyle = "#dde7ef";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#657789";
    ctx.font = "12px system-ui, sans-serif";

    if (!points.length) {
      ctx.fillStyle = "#657789";
      ctx.fillText("No telemetry in selected range", pad.left, height / 2);
      return;
    }

    var fuels = points.map(function (point) { return point.fuelPercent; });
    var minFuel = Math.max(0, Math.floor(Math.min.apply(null, fuels) - 4));
    var maxFuel = Math.min(100, Math.ceil(Math.max.apply(null, fuels) + 4));
    if (maxFuel - minFuel < 8) {
      maxFuel = Math.min(100, maxFuel + 4);
      minFuel = Math.max(0, minFuel - 4);
    }
    var minTime = points[0].date.getTime();
    var maxTime = points[points.length - 1].date.getTime();
    if (minTime === maxTime) {
      minTime -= 60 * 1000;
      maxTime += 60 * 1000;
    }

    function xFor(date) {
      return pad.left + ((date.getTime() - minTime) / (maxTime - minTime)) * plotW;
    }

    function yFor(fuel) {
      return pad.top + (1 - (fuel - minFuel) / (maxFuel - minFuel || 1)) * plotH;
    }

    ctx.fillStyle = "#10263b";
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.fillText("Fuel level (%)", pad.left, 24);

    ctx.fillStyle = "#657789";
    ctx.font = "12px system-ui, sans-serif";

    for (var i = 0; i <= 4; i += 1) {
      var fuel = minFuel + ((maxFuel - minFuel) / 4) * i;
      var y = yFor(fuel);
      ctx.setLineDash(i === 0 ? [] : [4, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillText(Math.round(fuel) + "%", 8, y + 4);
    }

    ctx.strokeStyle = "#cbd8e2";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + plotH);
    ctx.lineTo(width - pad.right, pad.top + plotH);
    ctx.stroke();

    events.forEach(function (event) {
      if (event.date.getTime() < minTime || event.date.getTime() > maxTime) return;
      var x = xFor(event.date);
      ctx.strokeStyle = colorForEvent(event);
      ctx.globalAlpha = event.id === state.selectedEventId ? 0.36 : 0.18;
      ctx.lineWidth = event.id === state.selectedEventId ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + plotH);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    ctx.strokeStyle = "#087ea4";
    ctx.lineWidth = 3;
    ctx.beginPath();
    points.forEach(function (point, index) {
      var x = xFor(point.date);
      var y = yFor(point.fuelPercent);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    points.forEach(function (point) {
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#087ea4";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(xFor(point.date), yFor(point.fuelPercent), 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    events.forEach(function (event) {
      if (event.date.getTime() < minTime || event.date.getTime() > maxTime) return;
      var fuelAtEvent = nearestFuelPercent(event);
      if (fuelAtEvent === null) return;
      var x = xFor(event.date);
      var y = yFor(fuelAtEvent);
      var color = colorForEvent(event);
      var category = eventCategory(event);
      ctx.fillStyle = category === "candidate" ? "#fff8ea" : color;
      ctx.strokeStyle = category === "candidate" ? color : "#ffffff";
      ctx.lineWidth = event.id === state.selectedEventId ? 3 : 2;
      ctx.beginPath();
      ctx.arc(x, y, event.id === state.selectedEventId ? 8 : 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (event.id === state.selectedEventId) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.stroke();
      }
      state.chartEvents.push({ id: event.id, x: x, y: y });
    });

    ctx.fillStyle = "#657789";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(formatCompact(points[0].date, referenceDate()), pad.left, height - 16);
    ctx.textAlign = "right";
    ctx.fillText(formatCompact(points[points.length - 1].date, referenceDate()), width - pad.right, height - 16);
    ctx.textAlign = "left";
  }

  function createCell(row, text, className) {
    var cell = document.createElement("td");
    if (className) cell.className = className;
    cell.textContent = text;
    row.appendChild(cell);
    return cell;
  }

  function renderEventTable() {
    var rows = filteredEvents().slice().sort(function (a, b) { return b.date - a.date; });
    els.eventsTable.innerHTML = "";

    if (!rows.length) {
      var emptyRow = document.createElement("tr");
      var emptyCell = document.createElement("td");
      emptyCell.colSpan = 7;
      emptyCell.className = "empty-state";
      emptyCell.textContent = "No fuel events in the selected range.";
      emptyRow.appendChild(emptyCell);
      els.eventsTable.appendChild(emptyRow);
      return;
    }

    rows.forEach(function (event) {
      var category = eventCategory(event);
      var row = document.createElement("tr");
      row.tabIndex = 0;
      row.className = ["event-row-" + category, event.id === state.selectedEventId ? "is-selected" : ""].filter(Boolean).join(" ");
      row.dataset.eventId = event.id;
      row.addEventListener("click", function () { selectEvent(event.id); });
      row.addEventListener("keydown", function (keyboardEvent) {
        if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
          keyboardEvent.preventDefault();
          selectEvent(event.id);
        }
      });

      createCell(row, formatFull(event.date));
      createCell(row, event.vehicleId);

      var eventCell = document.createElement("td");
      var badge = document.createElement("span");
      badge.className = "event-badge " + category;
      badge.textContent = event.eventLabel;
      eventCell.appendChild(badge);
      row.appendChild(eventCell);

      createCell(row, formatLiters(event.fuelDeltaLiters, true));
      createCell(row, event.gpsState);
      createCell(row, event.confidence === null ? "--" : Math.round(event.confidence) + "%");
      createCell(row, event.ruleResult || "--", "evidence-cell");
      els.eventsTable.appendChild(row);
    });
  }

  function selectedEvent() {
    var events = filteredEvents();
    var selected = events.find(function (event) { return event.id === state.selectedEventId; });
    if (selected) return selected;
    if (!events.length) return null;
    selected = events.slice().sort(function (a, b) { return b.date - a.date; })[0];
    state.selectedEventId = selected.id;
    return selected;
  }

  function fuelDetail(percent, liters) {
    if (percent === null && liters === null) return "--";
    var parts = [];
    if (percent !== null) parts.push(formatPercent(percent));
    if (liters !== null) parts.push(formatLiters(liters, false));
    return parts.join(" / ");
  }

  function setDetail(name, value) {
    if (detailFields[name]) detailFields[name].textContent = value;
  }

  function renderDetail() {
    var event = selectedEvent();
    Object.keys(detailFields).forEach(function (name) {
      detailFields[name].textContent = "--";
    });

    if (!event) {
      els.detailTitle.textContent = "No event selected";
      els.detailToken.textContent = "--";
      els.detailToken.className = "event-token";
      els.detailPanel.className = "panel detail-panel";
      return;
    }

    var category = eventCategory(event);
    els.detailTitle.textContent = event.eventLabel;
    els.detailToken.textContent = categoryLabel(category);
    els.detailToken.className = "event-token " + category;
    els.detailPanel.className = "panel detail-panel " + category;
    setDetail("heroState", incidentStateLabel(category));
    setDetail("heroDeltaLiters", formatLiters(event.fuelDeltaLiters, true));
    setDetail("heroConfidence", event.confidence === null ? "--" : Math.round(event.confidence) + "%");
    setDetail("heroRuleResult", event.ruleResult || "--");
    setDetail("eventType", humanize(event.eventType));
    setDetail("vehicleId", event.vehicleId);
    setDetail("timestamp", formatFull(event.date));
    setDetail("fuelBefore", fuelDetail(event.fuelBeforePercent, event.fuelBeforeLiters));
    setDetail("fuelAfter", fuelDetail(event.fuelAfterPercent, event.fuelAfterLiters));
    setDetail("deltaPercent", formatPercent(event.fuelDeltaPercent));
    setDetail("deltaLiters", formatLiters(event.fuelDeltaLiters, true));
    setDetail("ignition", event.ignition ? "ON" : "OFF");
    setDetail("gpsState", event.gpsState);
    setDetail("motionState", event.gpsMotionState);
    setDetail("speed", formatNumber(event.speedKmh, " km/h"));
    setDetail("signalStability", event.signalStability === null ? "--" : Math.round(event.signalStability) + "%");
    setDetail("sloshingScore", event.sloshingScore === null ? "--" : Math.round(event.sloshingScore) + "%");
    setDetail("confidence", event.confidence === null ? "--" : Math.round(event.confidence) + "%");
    setDetail("signalConfidence", event.confidence === null ? "--" : Math.round(event.confidence) + "%");
    setDetail("ruleResult", event.ruleResult || "--");
    setDetail("coordinates", hasCoordinates(event) ? event.gpsLat.toFixed(5) + ", " + event.gpsLon.toFixed(5) : "--");
  }

  function popupLine(label, value) {
    return "<div><span>" + escapeHtml(label) + "</span><strong>" + escapeHtml(value) + "</strong></div>";
  }

  function currentPopup(latest) {
    return '<div class="popup-content">' +
      "<h3>" + escapeHtml(latest.vehicleId) + "</h3>" +
      popupLine("Fuel", formatPercent(latest.fuelPercent)) +
      popupLine("Decision", latest.currentEvent) +
      popupLine("Ignition", latest.ignition ? "ON" : "OFF") +
      popupLine("GPS", latest.gpsState) +
      popupLine("Last telemetry", formatFull(latest.date)) +
      "</div>";
  }

  function eventPopup(event) {
    return '<div class="popup-content">' +
      "<h3>" + escapeHtml(event.eventLabel) + "</h3>" +
      popupLine("State", categoryLabel(eventCategory(event))) +
      popupLine("Vehicle", event.vehicleId) +
      popupLine("Time", formatFull(event.date)) +
      popupLine("Delta", formatLiters(event.fuelDeltaLiters, true)) +
      popupLine("Confidence", event.confidence === null ? "--" : Math.round(event.confidence) + "%") +
      popupLine("GPS", event.gpsState) +
      popupLine("Evidence", event.ruleResult || "--") +
      "</div>";
  }

  function markerStyleForEvent(event) {
    var category = eventCategory(event);
    var color = colorForEvent(event);
    var isSelected = event.id === state.selectedEventId;
    var options = {
      radius: isSelected ? 8 : 6,
      weight: isSelected ? 3 : 2,
      color: color,
      fillColor: color,
      fillOpacity: 0.72
    };

    if (category === "candidate") {
      options.weight = isSelected ? 3 : 2.5;
      options.fillColor = "#fff8ea";
      options.fillOpacity = 0.28;
      options.dashArray = "4 3";
    }

    return options;
  }

  function showMapFallback(message) {
    els.mapFallback.classList.remove("hidden");
    els.mapFallbackText.textContent = message;
  }

  function hideMapFallback() {
    els.mapFallback.classList.add("hidden");
  }

  function ensureMap() {
    if (state.map) return true;
    if (!window.L) {
      showMapFallback("Leaflet could not load. Coordinates and event evidence remain available.");
      return false;
    }

    state.map = L.map("map", {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true
    });

    var tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      minZoom: 3,
      attribution: "&copy; OpenStreetMap contributors"
    });

    var tileErrors = 0;
    tiles.on("tileerror", function () {
      tileErrors += 1;
      if (tileErrors > 2) {
        showMapFallback("Some OpenStreetMap tiles are not loading. Coordinates remain available.");
      }
    });
    tiles.addTo(state.map);

    setTimeout(function () { state.map.invalidateSize(); }, 80);
    setTimeout(function () { state.map.invalidateSize(); }, 350);
    window.addEventListener("resize", function () {
      if (state.map) state.map.invalidateSize();
    });
    return true;
  }

  function clearMapLayers() {
    if (!state.map) return;
    if (state.currentMarker) {
      state.map.removeLayer(state.currentMarker);
      state.currentMarker = null;
    }
    if (state.eventLayer) {
      state.map.removeLayer(state.eventLayer);
      state.eventLayer = null;
    }
  }

  function mapBounds(includeEvents) {
    var points = [];
    var latest = latestTelemetry();
    if (latest && hasCoordinates(latest)) points.push([latest.gpsLat, latest.gpsLon]);
    if (includeEvents && state.showEvents) {
      filteredEvents().forEach(function (event) {
        if (hasCoordinates(event)) points.push([event.gpsLat, event.gpsLon]);
      });
    }
    return points;
  }

  function fitMap(includeEvents) {
    if (!state.map) return;
    var points = mapBounds(includeEvents);
    if (!points.length) return;
    if (points.length === 1) {
      state.map.setView(points[0], 15);
      return;
    }
    state.map.fitBounds(points, { padding: [34, 34], maxZoom: 15 });
  }

  function renderMap() {
    if (!ensureMap()) return;
    clearMapLayers();
    var latest = latestTelemetry();
    var events = filteredEvents();

    if (!latest || !hasCoordinates(latest)) {
      showMapFallback("Current coordinates are not available yet.");
      return;
    }
    hideMapFallback();

    state.currentLatLng = [latest.gpsLat, latest.gpsLon];
    state.currentMarker = L.circleMarker(state.currentLatLng, {
      radius: 10,
      weight: 3,
      color: "#087ea4",
      fillColor: "#15b8c7",
      fillOpacity: 0.88
    }).addTo(state.map).bindPopup(currentPopup(latest));

    state.eventLayer = L.layerGroup();
    events.forEach(function (event) {
      if (!hasCoordinates(event)) return;
      var marker = L.circleMarker([event.gpsLat, event.gpsLon], markerStyleForEvent(event)).bindPopup(eventPopup(event));
      marker.on("click", function () { selectEvent(event.id); });
      state.eventLayer.addLayer(marker);
    });

    if (state.showEvents) {
      state.eventLayer.addTo(state.map);
    }

    if (state.needsMapFit) {
      fitMap(true);
      state.needsMapFit = false;
    }
  }

  function renderAll() {
    if (!state.dataset) return;
    syncVehicleSelector();
    updateRangeButtons();
    renderStatus();
    renderKpis();
    renderLiveContext();
    renderDetail();
    renderEventTable();
    drawTimeline();
    renderMap();
  }

  function selectEvent(id) {
    state.selectedEventId = id;
    renderDetail();
    renderEventTable();
    drawTimeline();
    renderMap();
  }

  function applyDataset(dataset, mode) {
    state.dataset = dataset;
    state.mode = mode || dataset.mode || "sample";
    state.selectedEventId = "";
    state.needsMapFit = true;
    renderAll();
  }

  function useSampleData(key) {
    state.mode = "sample";
    state.scenarioKey = key || state.scenarioKey;
    els.scenarioSelect.value = state.scenarioKey;
    applyDataset(sampleDataset(state.scenarioKey), "sample");
  }

  function refreshLive() {
    state.liveAttempted = true;
    return loadLiveData()
      .then(function (dataset) {
        applyDataset(dataset, "live");
      })
      .catch(function () {
        if (!state.dataset || state.mode !== "sample") {
          useSampleData(state.scenarioKey);
        }
      });
  }

  function exportCsv() {
    var header = [
      "timestamp",
      "vehicle_id",
      "event_type",
      "event_label",
      "delta_liters",
      "delta_percent",
      "ignition",
      "gps_state",
      "gps_lat",
      "gps_lon",
      "confidence",
      "rule_result"
    ];
    var rows = filteredEvents().map(function (event) {
      return [
        event.date ? event.date.toISOString() : "",
        event.vehicleId,
        event.eventType,
        event.eventLabel,
        event.fuelDeltaLiters,
        event.fuelDeltaPercent,
        event.ignition ? "ON" : "OFF",
        event.gpsState,
        event.gpsLat,
        event.gpsLon,
        event.confidence,
        event.ruleResult
      ];
    });
    var csv = [header].concat(rows).map(function (row) {
      return row.map(function (cell) {
        return '"' + String(cell === undefined || cell === null ? "" : cell).replace(/"/g, '""') + '"';
      }).join(",");
    }).join("\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "smartt_events_" + state.vehicleId + "_" + state.range + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function bindEvents() {
    document.querySelectorAll(".range-button").forEach(function (button) {
      button.addEventListener("click", function () {
        state.range = button.dataset.range;
        state.selectedEventId = "";
        state.needsMapFit = true;
        renderAll();
      });
    });

    els.vehicleSelect.addEventListener("change", function () {
      state.vehicleId = els.vehicleSelect.value;
      state.selectedEventId = "";
      state.needsMapFit = true;
      renderAll();
    });

    els.scenarioSelect.addEventListener("change", function () {
      useSampleData(els.scenarioSelect.value);
    });

    els.showEventsToggle.addEventListener("change", function () {
      state.showEvents = els.showEventsToggle.checked;
      state.needsMapFit = true;
      renderMap();
    });

    els.recenterBtn.addEventListener("click", function () {
      if (!state.map || !state.currentLatLng) return;
      state.map.setView(state.currentLatLng, 15);
      if (state.currentMarker) state.currentMarker.openPopup();
    });

    els.fitEventsBtn.addEventListener("click", function () {
      fitMap(true);
    });

    els.openMapsBtn.addEventListener("click", function () {
      var latest = latestTelemetry();
      if (!latest || !hasCoordinates(latest)) return;
      var url = "https://www.openstreetmap.org/?mlat=" + encodeURIComponent(latest.gpsLat) + "&mlon=" + encodeURIComponent(latest.gpsLon) + "#map=17/" + encodeURIComponent(latest.gpsLat) + "/" + encodeURIComponent(latest.gpsLon);
      window.open(url, "_blank", "noopener");
    });

    els.exportBtn.addEventListener("click", exportCsv);

    els.fuelChart.addEventListener("click", function (event) {
      var rect = els.fuelChart.getBoundingClientRect();
      var x = event.clientX - rect.left;
      var y = event.clientY - rect.top;
      var hit = state.chartEvents.find(function (point) {
        return Math.hypot(point.x - x, point.y - y) <= 11;
      });
      if (hit) selectEvent(hit.id);
    });

    window.addEventListener("resize", drawTimeline);
  }

  function cacheElements() {
    [
      "serverStatus",
      "dataMode",
      "lastTelemetry",
      "headerVehicle",
      "headerDecision",
      "vehicleSelect",
      "scenarioSelect",
      "exportBtn",
      "fuelChart",
      "eventsTable",
      "detailTitle",
      "detailToken",
      "mapFallback",
      "mapFallbackText",
      "recenterBtn",
      "fitEventsBtn",
      "showEventsToggle",
      "openMapsBtn",
      "detailPanel"
    ].forEach(function (id) {
      els[id] = $(id);
    });

    [
      "kpiFuel",
      "kpiFuelSub",
      "kpiDecision",
      "kpiDecisionSub",
      "kpiEvents",
      "kpiEventsSub",
      "kpiSuspicious",
      "kpiSuspiciousSub",
      "kpiRefuel",
      "kpiRefuelSub",
      "kpiStatus",
      "kpiStatusSub"
    ].forEach(function (id) {
      els[id] = $(id);
    });

    document.querySelectorAll("[data-detail]").forEach(function (node) {
      detailFields[node.dataset.detail] = node;
    });

    document.querySelectorAll("[data-context]").forEach(function (node) {
      contextFields[node.dataset.context] = node;
    });
  }

  function init() {
    cacheElements();
    bindEvents();
    els.scenarioSelect.value = state.scenarioKey;

    if (canTryApi()) {
      refreshLive().then(function () {
        state.refreshTimer = window.setInterval(refreshLive, 15000);
      });
    } else {
      useSampleData(state.scenarioKey);
    }
  }

  window.addEventListener("beforeunload", function () {
    if (state.refreshTimer) window.clearInterval(state.refreshTimer);
  });

  document.addEventListener("DOMContentLoaded", init);
}());
