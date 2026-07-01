#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>

static const char* AP_SSID = "SmartT-Test";

WebServer server(80);

void handleRoot() {
  server.send(200, "text/html",
              "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
              "<title>SmartT WiFi Test</title>"
              "<style>body{font-family:Arial,sans-serif;margin:24px;background:#f4f6f7;color:#15171a}"
              ".box{max-width:520px;background:white;border:1px solid #d7dde4;border-radius:8px;padding:16px}"
              "h1{font-size:22px;margin:0 0 8px}.ok{color:#168a4a;font-weight:700}</style></head>"
              "<body><div class='box'><h1>SmartT WiFi Test</h1>"
              "<p class='ok'>ESP32 web server is running.</p>"
              "<p>Open <b>http://192.168.4.1</b></p>"
              "</div></body></html>");
}

void handlePing() {
  server.send(200, "application/json", "{\"ok\":true,\"device\":\"SmartT-Test\"}");
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("SmartT WiFi AP Test");
  Serial.println("This test does not use ADS1115 or OLED.");

  WiFi.disconnect(true, true);
  delay(200);
  WiFi.mode(WIFI_AP);
  WiFi.setSleep(false);

  // Open AP for connection testing. Use the main sketch for password-protected demo.
  bool ok = WiFi.softAP(AP_SSID, nullptr, 6, 0, 4);
  delay(300);

  server.on("/", handleRoot);
  server.on("/ping", handlePing);
  server.begin();

  Serial.print("AP start: ");
  Serial.println(ok ? "OK" : "FAILED");
  Serial.print("SSID: ");
  Serial.println(AP_SSID);
  Serial.print("Password: ");
  Serial.println("(none)");
  Serial.print("URL: http://");
  Serial.println(WiFi.softAPIP());
}

void loop() {
  server.handleClient();

  static uint32_t lastPrintMs = 0;
  uint32_t now = millis();
  if (now - lastPrintMs >= 2000) {
    lastPrintMs = now;
    Serial.print("Connected clients: ");
    Serial.println(WiFi.softAPgetStationNum());
  }
}
