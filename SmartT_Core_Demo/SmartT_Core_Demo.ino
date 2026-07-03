#include <Arduino.h>
#include <Wire.h>

#include "Config.h"
#include "Types.h"
#include "FuelSensor.h"
#include "FuelFilter.h"
#include "GpsContext.h"
#include "EventDetector.h"
#include "OledView.h"
#include "WebDashboard.h"
#include "LocalServerClient.h"

DashboardState dashboard;
FuelSensor fuelSensor;
FuelFilter fuelFilter;
GpsContext gpsContext;
EventDetector eventDetector;
OledView oledView;

#if SMARTT_ENABLE_WIFI_DASHBOARD
WebServer server(80);
WebDashboard webDashboard(server);
#if SMARTT_ENABLE_LOCAL_SERVER_PUSH
LocalServerClient localServerClient;
#endif
#endif

uint32_t lastSampleMs = 0;
uint32_t lastSerialMs = 0;
uint32_t lastOledMs = 0;

void readVehicleInputs() {
  dashboard.vehicle.ignitionOn = (digitalRead(PIN_IGNITION) == LOW);
  dashboard.vehicle.testPressed = (digitalRead(PIN_TEST_BUTTON) == LOW);
}

void updateFuelAndContext(uint32_t now) {
  readVehicleInputs();
  fuelSensor.read(dashboard);
  fuelFilter.update(dashboard, now);
  fuelSensor.updateHealth(dashboard, now);
  gpsContext.update(dashboard, now);
  eventDetector.update(dashboard, now);
}

void updateAlertLed() {
#if SMARTT_ENABLE_ALERT_LED
  bool active = (dashboard.currentEvent.alert != "NONE") ||
                (eventDetector.state() == DETECTOR_DROP_CANDIDATE) ||
                (eventDetector.state() == DETECTOR_THEFT_ALERT);
  digitalWrite(PIN_ALERT_LED, active ? HIGH : LOW);
#endif
}

void printBootSummary() {
  Serial.println();
  Serial.println("SmartT Core Demo");
  Serial.println("Pins: ADS1115 I2C 21/22, OLED SPI 5/23/17/16/18, ignition 19, test 4, GPS UART2 13/14");
  Serial.println("GPIO2 is not used.");
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  printBootSummary();

  pinMode(PIN_IGNITION, INPUT_PULLUP);
  pinMode(PIN_TEST_BUTTON, INPUT_PULLUP);

#if SMARTT_ENABLE_ALERT_LED
  pinMode(PIN_ALERT_LED, OUTPUT);
  digitalWrite(PIN_ALERT_LED, LOW);
#endif

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.setClock(I2C_CLOCK_HZ);

  gpsContext.begin();
  Serial.print("GPS UART2: RX GPIO");
  Serial.print(PIN_GPS_RX);
  Serial.print(" TX GPIO");
  Serial.println(PIN_GPS_TX);

  dashboard.sensor.adsReady = fuelSensor.begin();
  if (dashboard.sensor.adsReady) {
    Serial.println("ADS1115 OK at 0x48, gain +/-4.096V");
  } else {
    Serial.println("ADS1115 not found. Check I2C wiring and ADDR -> GND.");
  }

  dashboard.sensor.oledReady = oledView.begin();
  if (!dashboard.sensor.oledReady) {
    Serial.println("OLED init failed. Serial JSON will still run.");
  }

#if SMARTT_ENABLE_WIFI_DASHBOARD
  webDashboard.begin(dashboard);
#if SMARTT_ENABLE_LOCAL_SERVER_PUSH
  localServerClient.begin();
#endif
#endif

  uint32_t now = millis();
  readVehicleInputs();
  fuelSensor.read(dashboard);
  fuelFilter.update(dashboard, now);
  fuelSensor.updateHealth(dashboard, now);
  gpsContext.update(dashboard, now);
  eventDetector.begin(dashboard, now);
  eventDetector.update(dashboard, now);
  updateAlertLed();
  oledView.draw(dashboard);
}

void loop() {
  uint32_t now = millis();

#if SMARTT_ENABLE_WIFI_DASHBOARD
  webDashboard.handleClient();
#endif

  gpsContext.read();

  if (now - lastSampleMs >= SAMPLE_INTERVAL_MS) {
    lastSampleMs = now;
    updateFuelAndContext(now);
    updateAlertLed();
  }

  if (now - lastSerialMs >= SERIAL_INTERVAL_MS) {
    lastSerialMs = now;
#if SMARTT_ENABLE_WIFI_DASHBOARD
    String telemetryJson = webDashboard.telemetryJson();
    Serial.println(telemetryJson);
#if SMARTT_ENABLE_LOCAL_SERVER_PUSH
    localServerClient.maybePost(telemetryJson, now);
#endif
#else
    Serial.println("{}");
#endif
  }

  if (now - lastOledMs >= OLED_INTERVAL_MS) {
    lastOledMs = now;
    oledView.draw(dashboard);
  }
}
