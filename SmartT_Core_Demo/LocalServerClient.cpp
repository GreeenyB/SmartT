#include "LocalServerClient.h"

#if SMARTT_ENABLE_WIFI_DASHBOARD && SMARTT_ENABLE_LOCAL_SERVER_PUSH

#include <HTTPClient.h>
#include <WiFi.h>

namespace {

bool hasText(const char* text) {
  return text != nullptr && text[0] != '\0';
}

String normalizedIngestUrl() {
  String url = SMARTT_SERVER_URL;
  url.trim();
  while (url.endsWith("/")) {
    url.remove(url.length() - 1);
  }
  if (url.length() > 0 && !url.endsWith("/api/ingest")) {
    url += "/api/ingest";
  }
  return url;
}

}  // namespace

LocalServerClient::LocalServerClient()
  : enabled_(false),
    connectedLogged_(false),
    lastPostMs_(0),
    lastConnectAttemptMs_(0),
    lastErrorLogMs_(0),
    postUrl_("") {}

void LocalServerClient::begin() {
  if (!hasText(SMARTT_WIFI_SSID) || !hasText(SMARTT_SERVER_URL)) {
    Serial.println("Local server push disabled. Configure SMARTT_WIFI_SSID and SMARTT_SERVER_URL in Secrets.h to enable it.");
    return;
  }

  postUrl_ = normalizedIngestUrl();
  if (postUrl_.length() == 0) {
    Serial.println("Local server push disabled. SMARTT_SERVER_URL is empty.");
    return;
  }

  enabled_ = true;
  WiFi.mode(WIFI_AP_STA);
  WiFi.setSleep(false);
  WiFi.begin(SMARTT_WIFI_SSID, SMARTT_WIFI_PASS);
  lastConnectAttemptMs_ = millis();

  Serial.print("Local server push target: ");
  Serial.println(postUrl_);
}

void LocalServerClient::maybePost(const String& telemetryJson, uint32_t now) {
  if (!enabled_) {
    return;
  }

  maintainWifi(now);
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  if (lastPostMs_ != 0 && now - lastPostMs_ < SMARTT_LOCAL_SERVER_POST_INTERVAL_MS) {
    return;
  }
  lastPostMs_ = now;

  HTTPClient http;
  http.setTimeout(SMARTT_LOCAL_SERVER_HTTP_TIMEOUT_MS);
  if (!http.begin(postUrl_)) {
    if (shouldLog(now)) {
      Serial.println("Local server push skipped: invalid URL.");
    }
    return;
  }

  http.addHeader("Content-Type", "application/json");
  int status = http.POST(telemetryJson);
  http.end();

  if ((status < 200 || status >= 300) && shouldLog(now)) {
    Serial.print("Local server push failed, HTTP status ");
    Serial.println(status);
  }
}

void LocalServerClient::maintainWifi(uint32_t now) {
  if (WiFi.status() == WL_CONNECTED) {
    if (!connectedLogged_) {
      connectedLogged_ = true;
      Serial.print("Local server Wi-Fi connected, IP ");
      Serial.println(WiFi.localIP());
    }
    return;
  }

  connectedLogged_ = false;
  if (lastConnectAttemptMs_ != 0 && now - lastConnectAttemptMs_ < SMARTT_WIFI_RECONNECT_INTERVAL_MS) {
    return;
  }

  lastConnectAttemptMs_ = now;
  WiFi.mode(WIFI_AP_STA);
  WiFi.begin(SMARTT_WIFI_SSID, SMARTT_WIFI_PASS);
  if (shouldLog(now)) {
    Serial.println("Local server Wi-Fi reconnect scheduled.");
  }
}

bool LocalServerClient::shouldLog(uint32_t now) {
  if (lastErrorLogMs_ != 0 && now - lastErrorLogMs_ < SMARTT_WIFI_RECONNECT_INTERVAL_MS) {
    return false;
  }
  lastErrorLogMs_ = now;
  return true;
}

#endif
