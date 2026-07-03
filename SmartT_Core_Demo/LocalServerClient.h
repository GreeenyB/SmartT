#pragma once

#include <Arduino.h>
#include "Config.h"

#if SMARTT_ENABLE_WIFI_DASHBOARD && SMARTT_ENABLE_LOCAL_SERVER_PUSH

class LocalServerClient {
public:
  LocalServerClient();
  void begin();
  void maybePost(const String& telemetryJson, uint32_t now);

private:
  bool enabled_;
  bool connectedLogged_;
  uint32_t lastPostMs_;
  uint32_t lastConnectAttemptMs_;
  uint32_t lastErrorLogMs_;
  String postUrl_;

  void maintainWifi(uint32_t now);
  bool shouldLog(uint32_t now);
};

#endif
