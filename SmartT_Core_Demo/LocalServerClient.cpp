#include "LocalServerClient.h"

#if SMARTT_ENABLE_WIFI_DASHBOARD

#include <HTTPClient.h>
#include <WiFi.h>
#include <string.h>

void LocalServerClient::begin() {
  enabled_ = SMARTT_HAS_SECRETS &&
             strlen(SMARTT_WIFI_SSID) > 0 &&
             strlen(SMARTT_SERVER_URL) > 0;

  Serial.print("Local server telemetry: ");
  Serial.println(enabled_ ? "enabled" : "disabled");

  if (enabled_) {
    Serial.print("Local server URL: ");
    Serial.println(SMARTT_SERVER_URL);
  }
}

bool LocalServerClient::shouldPost(uint32_t now) const {
  if (!enabled_ || WiFi.status() != WL_CONNECTED) {
    return false;
  }

  return lastPostMs_ == 0 || (now - lastPostMs_ >= SERVER_POST_INTERVAL_MS);
}

void LocalServerClient::post(const String& payload, uint32_t now) {
  lastPostMs_ = now;

  if (!enabled_ || WiFi.status() != WL_CONNECTED) {
    serverOnline_ = false;
    lastPostStatus_ = 0;
    return;
  }

  HTTPClient http;
  http.setTimeout(SERVER_HTTP_TIMEOUT_MS);

  if (!http.begin(SMARTT_SERVER_URL)) {
    serverOnline_ = false;
    lastPostStatus_ = -1;
    return;
  }

  http.addHeader("Content-Type", "application/json");
  int status = http.POST(payload);
  http.end();

  lastPostStatus_ = status;
  serverOnline_ = status >= 200 && status < 300;
}

#endif
