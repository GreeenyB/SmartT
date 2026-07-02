(function () {
  "use strict";

  var POLL_MS = 2000;
  var DEFAULT_CENTER = [10.7769, 106.7009];

  var elements = {
    serverStatus: document.getElementById("serverStatus"),
    lastTelemetryTime: document.getElementById("lastTelemetryTime"),
    fuelPercent: document.getElementById("fuelPercent"),
    fuelLiters: document.getElementById("fuelLiters"),
    currentEvent: document.getElementById("currentEvent"),
    ruleResult: document.getElementById("ruleResult"),
    ignitionState: document.getElementById("ignitionState"),
    detectorState: document.getElementById("detectorState"),
    gpsState: document.getElementById("gpsState"),
    gpsMotionState: document.getElementById("gpsMotionState"),
    confidence: document.getElementById("confidence"),
    signalStability: document.getElementById("signalStability"),
    sloshingScore: document.getElementById("sloshingScore"),
    historyCount: document.getElementById("historyCount"),
    eventCount: document.getElementById("eventCount"),
    eventRows: document.getElementById("eventRows"),
    chart: document.getElementById("fuelChart"),
    mapStatus: document.getElementById("mapStatus"),
    mapFallback: document.getElementById("mapFallback"),
    coordinateText: document.getElementById("coordinateText"),
    speedText: document.getElementById("speedText")
  };

  var mapState = {
    map: null,
    latestMarker: null,
    eventLayer: null,
    ready: false,
    tileFailed: false,
    centered: false
  };

  function get(row, keys, fallback) {
    if (!row) return fallback;
    for (var i = 0; i < keys.length; i += 1) {
      var value = row[keys[i]];
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return fallback;
  }

  function asNumber(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function asBool(value) {
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    var text = String(value || "").toLowerCase();
    return text === "true" || text === "1" || text === "on" || text === "yes";
  }

  function fmtNumber(value, digits, suffix) {
    var number = asNumber(value);
    if (number === null) return "--" + (suffix || "");
    return number.toFixed(digits) + (suffix || "");
  }

  function fmtTime(value) {
    if (!value) return "--";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function fmtDateTime(value) {
    if (!value) return "--";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString([], {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function eventLabel(value) {
    var code = String(value || "").toUpperCase();
    if (code.indexOf("REFUEL") !== -1) return "Refuel";
    if (code.indexOf("SLOSH") !== -1) return "Slosh";
    if (code.indexOf("FAULT") !== -1 || code.indexOf("ADS1115") !== -1) return "Sensor fault";
    if (code.indexOf("THEFT") !== -1 || code.indexOf("SUSPICIOUS") !== -1) return "Theft suspected";
    if (code.indexOf("DROP") !== -1) return "Stationary drop";
    if (code === "NORMAL" || code === "NONE" || code === "--" || !code) return "Normal";
    return String(value).replace(/_/g, " ");
  }

  function eventClass(label) {
    var text = String(label || "").toLowerCase();
    if (text.indexOf("refuel") !== -1) return "refuel";
    if (text.indexOf("slosh") !== -1) return "slosh";
    if (text.indexOf("fault") !== -1) return "fault";
    if (text.indexOf("theft") !== -1) return "theft";
    if (text.indexOf("drop") !== -1) return "drop";
    return "normal";
  }

  function setServerState(online, latestAt) {
    elements.serverStatus.textContent = online ? "Online" : "Offline";
    elements.serverStatus.classList.toggle("online", online);
    elements.serverStatus.classList.toggle("offline", !online);
    elements.lastTelemetryTime.textContent = fmtDateTime(latestAt);
  }

  async function fetchJson(url) {
    var response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(url + " returned " + response.status);
    return response.json();
  }

  function updateCurrent(latest) {
    var fuelPercent = get(latest, ["fuel_percent", "fuelPercent"], null);
    var fuelLiters = get(latest, ["fuel_liters", "fuelLiters"], null);
    var currentEvent = get(latest, ["current_event", "currentEvent", "event"], "--");
    var ignition = get(latest, ["ignition", "ignitionOn"], null);
    var confidence = get(latest, ["confidence"], null);
    var signal = get(latest, ["signal_stability", "signalStability"], null);
    var slosh = get(latest, ["sloshing_score", "sloshingScore"], null);

    elements.fuelPercent.textContent = fmtNumber(fuelPercent, 1, "%");
    elements.fuelLiters.textContent = fmtNumber(fuelLiters, 1, " L");
    elements.currentEvent.textContent = eventLabel(currentEvent);
    elements.ruleResult.textContent = get(latest, ["rule_result", "ruleResult"], "--");

    if (ignition === null) {
      elements.ignitionState.textContent = "--";
    } else {
      elements.ignitionState.textContent = asBool(ignition) ? "ON" : "OFF";
    }

    elements.detectorState.textContent = get(latest, ["detector_state", "detectorState"], "--");
    elements.gpsState.textContent = get(latest, ["gps_state", "gpsState"], "--");
    elements.gpsMotionState.textContent = get(latest, ["gps_motion_state", "gpsMotionState"], "--");
    elements.confidence.textContent = fmtNumber(confidence, 0, "%");
    elements.signalStability.textContent = fmtNumber(signal, 0, "%");
    elements.sloshingScore.textContent = "slosh " + fmtNumber(slosh, 0, "%");
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var ratio = window.devicePixelRatio || 1;
    var width = Math.max(320, Math.floor(rect.width));
    var height = Math.max(220, Math.floor(rect.height));
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, width: width, height: height };
  }

  function drawChart(history, events) {
    var setup = setupCanvas(elements.chart);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    var padding = { top: 20, right: 18, bottom: 34, left: 46 };
    var chartWidth = width - padding.left - padding.right;
    var chartHeight = height - padding.top - padding.bottom;
    var points = (history || [])
      .map(function (row) {
        return {
          time: new Date(get(row, ["created_at", "createdAt"], null)).getTime(),
          fuel: asNumber(get(row, ["fuel_percent", "fuelPercent"], null))
        };
      })
      .filter(function (point) {
        return Number.isFinite(point.time) && point.fuel !== null;
      });

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#fbfdff";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "#d7e0ea";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#66758b";
    ctx.font = "12px Segoe UI, Arial, sans-serif";

    for (var grid = 0; grid <= 4; grid += 1) {
      var y = padding.top + (chartHeight * grid) / 4;
      var label = String(100 - grid * 25) + "%";
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.fillText(label, 8, y + 4);
    }

    if (points.length < 2) {
      ctx.fillStyle = "#66758b";
      ctx.textAlign = "center";
      ctx.fillText("Waiting for fuel history", width / 2, height / 2);
      ctx.textAlign = "left";
      return;
    }

    var minTime = points[0].time;
    var maxTime = points[points.length - 1].time;
    if (maxTime <= minTime) maxTime = minTime + 1;

    function xFor(time) {
      return padding.left + ((time - minTime) / (maxTime - minTime)) * chartWidth;
    }

    function yFor(fuel) {
      var clamped = Math.max(0, Math.min(100, fuel));
      return padding.top + (1 - clamped / 100) * chartHeight;
    }

    var gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    gradient.addColorStop(0, "rgba(33, 103, 212, 0.16)");
    gradient.addColorStop(1, "rgba(0, 164, 200, 0.02)");

    ctx.beginPath();
    points.forEach(function (point, index) {
      var x = xFor(point.time);
      var y = yFor(point.fuel);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(xFor(points[points.length - 1].time), height - padding.bottom);
    ctx.lineTo(xFor(points[0].time), height - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    points.forEach(function (point, index) {
      var x = xFor(point.time);
      var y = yFor(point.fuel);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#2167d4";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = "#10233f";
    ctx.textAlign = "left";
    ctx.fillText(fmtTime(points[0].time), padding.left, height - 10);
    ctx.textAlign = "right";
    ctx.fillText(fmtTime(points[points.length - 1].time), width - padding.right, height - 10);
    ctx.textAlign = "left";

    (events || []).forEach(function (event) {
      var eventTime = new Date(get(event, ["created_at", "createdAt"], null)).getTime();
      var eventFuel = asNumber(get(event, ["fuel_percent", "fuelPercent"], null));
      if (!Number.isFinite(eventTime) || eventTime < minTime || eventTime > maxTime) return;
      var y = eventFuel === null ? padding.top + chartHeight * 0.12 : yFor(eventFuel);
      ctx.beginPath();
      ctx.arc(xFor(eventTime), y, 4, 0, Math.PI * 2);
      ctx.fillStyle = eventClass(get(event, ["event_label", "eventLabel", "event_type"], "")) === "refuel" ? "#14804a" : "#bb2f2f";
      ctx.fill();
    });
  }

  function showMapFallback(message) {
    elements.mapFallback.textContent = message;
    elements.mapFallback.classList.remove("hidden");
  }

  function hideMapFallback() {
    if (!mapState.tileFailed) {
      elements.mapFallback.classList.add("hidden");
    }
  }

  function initMap() {
    if (mapState.ready || mapState.map || !document.getElementById("map")) return;
    if (!window.L) {
      elements.mapStatus.textContent = "Map unavailable";
      showMapFallback("Map unavailable. Coordinates remain available when GPS is fixed.");
      return;
    }

    try {
      mapState.map = window.L.map("map", {
        zoomControl: true,
        attributionControl: true
      }).setView(DEFAULT_CENTER, 12);

      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
      })
        .on("tileerror", function () {
          mapState.tileFailed = true;
          elements.mapStatus.textContent = "Map unavailable";
          showMapFallback("Map unavailable. Coordinates remain available below.");
        })
        .addTo(mapState.map);

      mapState.eventLayer = window.L.layerGroup().addTo(mapState.map);
      mapState.ready = true;
    } catch (error) {
      elements.mapStatus.textContent = "Map unavailable";
      showMapFallback("Map unavailable. Coordinates remain available when GPS is fixed.");
    }
  }

  function validCoordinate(lat, lon, fix) {
    return asBool(fix) && lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  }

  function updateMap(latest, events) {
    initMap();

    var lat = asNumber(get(latest, ["gps_lat", "gpsLat"], null));
    var lon = asNumber(get(latest, ["gps_lon", "gpsLon", "gps_lng", "gpsLng"], null));
    var fix = get(latest, ["gps_fix", "gpsFix"], false);
    var speed = get(latest, ["speed_kmh", "speedKmh"], null);
    var gpsState = get(latest, ["gps_state", "gpsState"], "No GPS fix");
    var hasFix = validCoordinate(lat, lon, fix);

    elements.coordinateText.textContent = hasFix ? lat.toFixed(6) + ", " + lon.toFixed(6) : "--";
    elements.speedText.textContent = fmtNumber(speed, 1, " km/h");

    if (!hasFix) {
      elements.mapStatus.textContent = gpsState === "--" ? "No GPS fix" : gpsState;
      showMapFallback(gpsState === "Acquiring" ? "GPS acquiring" : "No GPS fix");
      return;
    }

    elements.mapStatus.textContent = "GPS fixed";
    if (!mapState.tileFailed) hideMapFallback();

    if (!mapState.ready || !window.L) {
      showMapFallback("GPS fixed: " + lat.toFixed(6) + ", " + lon.toFixed(6));
      return;
    }

    var latestLatLng = [lat, lon];
    if (!mapState.latestMarker) {
      mapState.latestMarker = window.L.circleMarker(latestLatLng, {
        radius: 8,
        weight: 2,
        color: "#2167d4",
        fillColor: "#00a4c8",
        fillOpacity: 0.9
      }).addTo(mapState.map);
    } else {
      mapState.latestMarker.setLatLng(latestLatLng);
    }
    mapState.latestMarker.bindTooltip("Latest position");

    if (!mapState.centered) {
      mapState.map.setView(latestLatLng, 15);
      mapState.centered = true;
    } else {
      mapState.map.panTo(latestLatLng, { animate: true, duration: 0.4 });
    }

    mapState.eventLayer.clearLayers();
    (events || []).slice(0, 20).forEach(function (event) {
      var eventLat = asNumber(get(event, ["gps_lat", "gpsLat"], null));
      var eventLon = asNumber(get(event, ["gps_lon", "gpsLon"], null));
      if (eventLat === null || eventLon === null || Math.abs(eventLat) > 90 || Math.abs(eventLon) > 180) return;
      window.L.circleMarker([eventLat, eventLon], {
        radius: 5,
        weight: 1,
        color: "#bb2f2f",
        fillColor: "#c85f16",
        fillOpacity: 0.8
      })
        .bindTooltip(eventLabel(get(event, ["event_label", "event_type"], "")))
        .addTo(mapState.eventLayer);
    });
  }

  function updateEvents(events) {
    elements.eventCount.textContent = String((events || []).length) + " events";
    if (!events || events.length === 0) {
      elements.eventRows.innerHTML = '<tr><td colspan="5" class="empty-cell">No events recorded</td></tr>';
      return;
    }

    elements.eventRows.innerHTML = events
      .slice(0, 100)
      .map(function (event) {
        var label = get(event, ["event_label", "eventLabel"], null) || eventLabel(get(event, ["event_type", "eventType"], ""));
        var cls = eventClass(label);
        var delta = get(event, ["fuel_delta_liters", "fuelDeltaLiters"], null);
        var gps = get(event, ["gps_state", "gpsState"], "--");
        var confidence = get(event, ["confidence"], null);
        return (
          "<tr>" +
          "<td>" + fmtDateTime(get(event, ["created_at", "createdAt"], null)) + "</td>" +
          '<td><span class="event-chip ' + cls + '">' + escapeHtml(label) + "</span></td>" +
          "<td>" + fmtNumber(delta, 1, " L") + "</td>" +
          "<td>" + escapeHtml(gps) + "</td>" +
          "<td>" + fmtNumber(confidence, 0, "%") + "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function refresh() {
    try {
      var results = await Promise.all([
        fetchJson("/api/health"),
        fetchJson("/api/latest"),
        fetchJson("/api/history?limit=500"),
        fetchJson("/api/events?limit=100")
      ]);
      var health = results[0];
      var latest = results[1] || {};
      var history = results[2] || [];
      var events = results[3] || [];

      setServerState(true, health.latestTelemetryAt);
      updateCurrent(latest);
      elements.historyCount.textContent = String(history.length) + " rows";
      drawChart(history, events);
      updateMap(latest, events);
      updateEvents(events);
    } catch (error) {
      setServerState(false, null);
      showMapFallback("Server offline");
    }
  }

  window.addEventListener("resize", function () {
    fetchJson("/api/history?limit=500")
      .then(function (history) {
        return fetchJson("/api/events?limit=100").then(function (events) {
          drawChart(history || [], events || []);
        });
      })
      .catch(function () {});
    if (mapState.map) {
      window.setTimeout(function () {
        mapState.map.invalidateSize();
      }, 100);
    }
  });

  refresh();
  window.setInterval(refresh, POLL_MS);
})();
