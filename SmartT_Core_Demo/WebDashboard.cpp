#include "WebDashboard.h"

#if SMARTT_ENABLE_WIFI_DASHBOARD

#include <string.h>
#include "DashboardAssets.h"

WebDashboard::WebDashboard(WebServer& server) : server_(server) {}

void WebDashboard::begin(DashboardState& state) {
  state_ = &state;

  WiFi.disconnect(true, true);
  delay(200);

  const bool hasStaConfig = SMARTT_HAS_SECRETS &&
                            strlen(SMARTT_WIFI_SSID) > 0 &&
                            strlen(SMARTT_SERVER_URL) > 0;

  WiFi.mode(hasStaConfig ? WIFI_AP_STA : WIFI_AP);
  WiFi.setSleep(false);

  IPAddress apIp(192, 168, 4, 1);
  IPAddress apGateway(192, 168, 4, 1);
  IPAddress apSubnet(255, 255, 255, 0);
  WiFi.softAPConfig(apIp, apGateway, apSubnet);

  const size_t passLen = strlen(AP_PASS);
  bool apStarted = false;

  if (passLen == 0) {
    apStarted = WiFi.softAP(AP_SSID, nullptr, 6, 0, 4);
  } else if (passLen >= 8) {
    apStarted = WiFi.softAP(AP_SSID, AP_PASS, 6, 0, 4);
  } else {
    Serial.println("Dashboard AP password is shorter than 8 chars; starting open AP instead.");
    apStarted = WiFi.softAP(AP_SSID, nullptr, 6, 0, 4);
  }

  delay(300);

  if (hasStaConfig) {
    Serial.print("Connecting STA Wi-Fi: ");
    Serial.print(SMARTT_WIFI_SSID);
    WiFi.begin(SMARTT_WIFI_SSID, SMARTT_WIFI_PASSWORD);

    uint32_t startMs = millis();
    while (WiFi.status() != WL_CONNECTED && (millis() - startMs) < WIFI_CONNECT_TIMEOUT_MS) {
      delay(250);
      Serial.print(".");
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
      Serial.print("STA Wi-Fi IP: ");
      Serial.println(WiFi.localIP());
    } else {
      Serial.println("STA Wi-Fi timeout; dashboard AP fallback remains available.");
    }
  } else {
    Serial.println("STA Wi-Fi not configured; dashboard AP fallback only.");
  }

  server_.on("/", [this]() { handleRoot(); });
  server_.on("/dashboard/", [this]() { handleRoot(); });
  server_.on("/dashboard/index.html", [this]() { handleRoot(); });
  server_.on("/style.css", [this]() { handleDashboardCss(); });
  server_.on("/dashboard/style.css", [this]() { handleDashboardCss(); });
  server_.on("/app.js", [this]() { handleDashboardJs(); });
  server_.on("/dashboard/app.js", [this]() { handleDashboardJs(); });
  server_.on("/api/telemetry", [this]() { handleTelemetryApi(); });
  server_.begin();

  Serial.print("Dashboard AP start: ");
  Serial.println(apStarted ? "OK" : "FAILED");
  Serial.print("Dashboard AP SSID: ");
  Serial.println(AP_SSID);
  Serial.print("Dashboard password: ");
  if (passLen == 0 || passLen < 8) {
    Serial.println("(none)");
  } else {
    Serial.println(AP_PASS);
  }
  Serial.print("Dashboard URL: http://");
  Serial.println(WiFi.softAPIP());
}

void WebDashboard::handleClient() {
  server_.handleClient();
}

void WebDashboard::handleRoot() {
  server_.send_P(200, "text/html", DASHBOARD_HTML);
}

void WebDashboard::handleDashboardCss() {
  server_.send_P(200, "text/css", DASHBOARD_CSS);
}

void WebDashboard::handleDashboardJs() {
  server_.send_P(200, "application/javascript", DASHBOARD_JS);
}

void WebDashboard::handleTelemetryApi() {
  server_.send(200, "application/json", telemetryJson());
}

String WebDashboard::telemetryJson() const {
  String json;
  json.reserve(3600);

  if (state_ == nullptr) {
    return "{}";
  }

  const DashboardState& state = *state_;
  const FuelTelemetry& fuel = state.fuel;
  const GpsTelemetry& gps = state.gps;
  const FuelEvent& event = state.currentEvent;

  bool first = true;
  json += "{";
  appendStringField(json, first, "device_id", SMARTT_DEVICE_ID);
  appendStringField(json, first, "deviceId", SMARTT_DEVICE_ID);
  appendStringField(json, first, "vehicle_id", state.vehicleId);
  appendStringField(json, first, "vehicleId", state.vehicleId);
  appendNumberField(json, first, "uptime_ms", String(millis()));
  appendBoolField(json, first, "ads_ready", state.sensor.adsReady);
  appendBoolField(json, first, "oled_ready", state.sensor.oledReady);
  appendStringField(json, first, "ignition", state.vehicle.ignitionOn ? "ON" : "OFF");
  appendBoolField(json, first, "ignitionOn", state.vehicle.ignitionOn);
  appendBoolField(json, first, "test_button", state.vehicle.testPressed);
  appendNumberField(json, first, "fuel_raw_adc_a0", String(fuel.rawA0));
  appendNumberField(json, first, "fuel_raw_adc_a1", String(fuel.rawA1));
  appendNumberField(json, first, "fuel_volts_a0", String(fuel.voltsA0, 4));
  appendNumberField(json, first, "fuel_volts_a1", String(fuel.voltsA1, 4));
  appendNumberField(json, first, "fuel_percent_a0", String(fuel.percentA0, 1));
  appendNumberField(json, first, "fuel_percent_a1", String(fuel.percentA1, 1));
  appendNumberField(json, first, "fuel_percent_raw", String(fuel.rawPercent, 1));
  appendNumberField(json, first, "fuel_percent_filtered", String(fuel.filteredPercent, 1));
  appendNumberField(json, first, "fuelPercent", String(fuel.filteredPercent, 1));
  appendNumberField(json, first, "fuel_liters", String(fuel.liters, 1));
  appendNumberField(json, first, "fuelLiters", String(fuel.liters, 1));
  appendNumberField(json, first, "tank_capacity_liters", String(state.tankCapacityLiters, 1));
  appendNumberField(json, first, "fuel_delta_window", String(fuel.deltaPercent, 1));
  appendNumberField(json, first, "fuel_delta_percent", String(event.deltaPercent, 1));
  appendNumberField(json, first, "fuelDeltaPercent", String(event.deltaPercent, 1));
  appendNumberField(json, first, "fuel_delta_liters", String(event.deltaLiters, 1));
  appendNumberField(json, first, "fuelDeltaLiters", String(event.deltaLiters, 1));
  appendNumberField(json, first, "fuel_rate_pct_per_sec", String(fuel.ratePercentPerSec, 2));
  appendNumberField(json, first, "fuel_rate_percent_per_sec", String(fuel.ratePercentPerSec, 2));
  appendNumberField(json, first, "fuelRatePercentPerSec", String(fuel.ratePercentPerSec, 2));
  appendNumberField(json, first, "fuel_rate_raw_pct_per_sec", String(fuel.rawRatePercentPerSec, 2));
  appendNumberField(json, first, "signal_stability", String(fuel.signalStability, 0));
  appendNumberField(json, first, "signalStability", String(fuel.signalStability, 0));
  appendNumberField(json, first, "sloshing_score", String(fuel.sloshingScore, 0));
  appendNumberField(json, first, "sloshingScore", String(fuel.sloshingScore, 0));
  appendNumberField(json, first, "speed_kmh", String(gps.speedKmh, 0));
  appendNumberField(json, first, "speedKmh", String(gps.speedKmh, 1));
  appendStringField(json, first, "gps_state", gps.state);
  appendStringField(json, first, "gpsState", gps.state);
  appendStringField(json, first, "gps_location", gpsLocationText(state));
  appendStringField(json, first, "geo_zone", "--");
  appendStringField(json, first, "data_source", "Fuel Sensor");
  appendStringField(json, first, "source_type", SMARTT_SOURCE_TYPE);
  appendStringField(json, first, "sourceType", SMARTT_SOURCE_TYPE);
  appendNumberField(json, first, "parked_baseline_pct", String(fuel.parkedBaselinePercent, 1));
  appendNumberField(json, first, "candidate_drop_pct", String(fuel.candidateDropPercent, 1));
  appendNumberField(json, first, "anomaly_confidence", String(event.confidence));
  appendNumberField(json, first, "confidence", String(event.confidence));
  appendStringField(json, first, "detector_state", state.detectorStateText);
  appendStringField(json, first, "detectorState", state.detectorStateText);
  appendStringField(json, first, "rule_result", event.ruleResult);
  appendStringField(json, first, "ruleResult", event.ruleResult);
  appendStringField(json, first, "current_event", event.message);
  appendStringField(json, first, "currentEvent", event.code);
  appendBoolField(json, first, "sensor_healthy", state.sensor.healthy);
  appendStringField(json, first, "sensor_status", state.sensor.status);
  appendBoolField(json, first, "gps_fix", gps.fix);
  appendBoolField(json, first, "gpsFix", gps.fix);
  appendNumberField(json, first, "gps_lat", String(gps.lat, 6));
  appendNumberField(json, first, "gpsLat", String(gps.lat, 6));
  appendNumberField(json, first, "gps_lon", String(gps.lon, 6));
  appendNumberField(json, first, "gpsLon", String(gps.lon, 6));
  appendNumberField(json, first, "gps_speed_kmh", String(gps.speedKmh, 1));
  appendNumberField(json, first, "gps_satellites", String(gps.satellites));
  appendStringField(json, first, "gps_time", gps.timeText);
  appendBoolField(json, first, "gps_data_fresh", gps.dataFresh);
  appendBoolField(json, first, "gps_speed_fresh", gps.speedFresh);
  appendNumberField(json, first, "gps_location_age_ms", String(gps.locationAgeMs));
  appendNumberField(json, first, "gps_speed_age_ms", String(gps.speedAgeMs));
  appendStringField(json, first, "gps_motion_state", gps.motionState);
  appendStringField(json, first, "gpsMotionState", gps.motionState);
  appendBoolField(json, first, "gps_stationary", gps.stationary);
  appendBoolField(json, first, "gps_moving", gps.moving);
  appendBoolField(json, first, "gps_used_in_decision", gps.usedInDecision);
  appendStringField(json, first, "gps_decision_context", gps.decisionContext);
  appendStringField(json, first, "event", event.code);
  appendStringField(json, first, "event_label", friendlyEventLabel(event.code));
  appendStringField(json, first, "eventLabel", friendlyEventLabel(event.code));
  appendStringField(json, first, "alert", event.alert);
  appendStringField(json, first, "alert_label", friendlyAlertLabel(event.alert));

  appendComma(json, first);
  json += "\"recent_events\":[";
  for (uint8_t i = 0; i < state.recentEventCount; i++) {
    if (i > 0) json += ",";
    const FuelEvent& logEvent = state.recentEvents[i];
    bool eventFirst = true;
    json += "{";
    appendStringField(json, eventFirst, "message", logEvent.message);
    appendStringField(json, eventFirst, "code", logEvent.code);
    appendStringField(json, eventFirst, "alert", logEvent.alert);
    appendNumberField(json, eventFirst, "delta_percent", String(logEvent.deltaPercent, 1));
    appendNumberField(json, eventFirst, "delta_liters", String(logEvent.deltaLiters, 1));
    appendNumberField(json, eventFirst, "confidence", String(logEvent.confidence));
    appendNumberField(json, eventFirst, "timestamp_ms", String(logEvent.timestampMs));
    json += "}";
  }
  json += "]";
  json += "}";

  return json;
}

String WebDashboard::boolJson(bool value) const {
  return value ? "true" : "false";
}

String WebDashboard::friendlyEventLabel(const String& event) const {
  if (event == "BOOT") return "Booting";
  if (event == "WARMING_UP") return "Warming up";
  if (event == "NORMAL") return "Normal";
  if (event == "ADS1115_MISSING") return "ADS missing";
  if (event == "SENSOR_FAULT") return "Sensor fault";
  if (event == "PARKED_SETTLING") return "Parked settling";
  if (event == "PARKED_MONITORING") return "Parked monitor";
  if (event == "SLOSHING_DETECTED") return "Sloshing detected";
  if (event == "FUEL_DROP_CANDIDATE") return "Drop candidate";
  if (event == "REFUEL_CANDIDATE") return "Refuel candidate";
  if (event == "REFUEL_EVENT") return "Refuel detected";
  if (event == "FAST_DROP_IGN_ON") return "Fast drop";
  if (event == "FUEL_DROP_WHILE_MOVING") return "Fuel drop while moving";
  if (event == "GPS_MOVING_IGN_OFF") return "GPS moving, ignition off";
  if (event == "GPS_UNAVAILABLE_FALLBACK") return "GPS unavailable fallback";
  if (event == "SUSPICIOUS_DROP") return "Suspicious drop";
  if (event == "TEST_BUTTON") return "Test mode";
  return event;
}

String WebDashboard::friendlyAlertLabel(const String& alert) const {
  if (alert == "NONE") return "No alert";
  if (alert == "FUEL_THEFT_ANOMALY") return "Fuel theft alert";
  if (alert == "FUEL_THEFT_TEST") return "Test theft alert";
  if (alert == "DROP_TEST_IGN_ON") return "Drop test";
  return alert;
}

String WebDashboard::gpsLocationText(const DashboardState& state) const {
  if (!state.gps.dataFresh) {
    return "--";
  }

  String location;
  location.reserve(24);
  location += String(state.gps.lat, 6);
  location += ", ";
  location += String(state.gps.lon, 6);
  return location;
}

void WebDashboard::appendComma(String& json, bool& first) const {
  if (first) {
    first = false;
  } else {
    json += ",";
  }
}

void WebDashboard::appendEscaped(String& json, const String& value) const {
  for (uint16_t i = 0; i < value.length(); i++) {
    char c = value.charAt(i);
    if (c == '"' || c == '\\') {
      json += '\\';
      json += c;
    } else if ((uint8_t)c < 32) {
      json += ' ';
    } else {
      json += c;
    }
  }
}

void WebDashboard::appendStringField(String& json, bool& first, const char* key, const String& value) const {
  appendComma(json, first);
  json += "\"";
  json += key;
  json += "\":\"";
  appendEscaped(json, value);
  json += "\"";
}

void WebDashboard::appendNumberField(String& json, bool& first, const char* key, const String& value) const {
  appendComma(json, first);
  json += "\"";
  json += key;
  json += "\":";
  json += value;
}

void WebDashboard::appendBoolField(String& json, bool& first, const char* key, bool value) const {
  appendComma(json, first);
  json += "\"";
  json += key;
  json += "\":";
  json += boolJson(value);
}

#endif
