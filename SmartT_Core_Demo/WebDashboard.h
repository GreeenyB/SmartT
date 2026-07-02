#pragma once

#include "Config.h"

#if SMARTT_ENABLE_WIFI_DASHBOARD

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include "Types.h"

class WebDashboard {
public:
  explicit WebDashboard(WebServer& server);
  void begin(DashboardState& state);
  void handleClient();
  String telemetryJson() const;

private:
  WebServer& server_;
  DashboardState* state_ = nullptr;

  void handleRoot();
  void handleDashboardCss();
  void handleDashboardJs();
  void handleTelemetryApi();

  String boolJson(bool value) const;
  String friendlyEventLabel(const String& event) const;
  String friendlyAlertLabel(const String& alert) const;
  String gpsLocationText(const DashboardState& state) const;
  void appendComma(String& json, bool& first) const;
  void appendEscaped(String& json, const String& value) const;
  void appendStringField(String& json, bool& first, const char* key, const String& value) const;
  void appendNumberField(String& json, bool& first, const char* key, const String& value) const;
  void appendBoolField(String& json, bool& first, const char* key, bool value) const;
};

#endif
