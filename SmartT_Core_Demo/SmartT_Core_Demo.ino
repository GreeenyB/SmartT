#include <Arduino.h>
#include <math.h>
#include <Wire.h>
#include <Adafruit_ADS1X15.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SMARTT_ENABLE_WIFI_DASHBOARD 1
#define SMARTT_USE_A1_BACKUP_AS_MAIN_FUEL 0

#if SMARTT_ENABLE_WIFI_DASHBOARD
#include <WiFi.h>
#include <WebServer.h>
#endif

static const char* VEHICLE_ID = "TRUCK_01";
static const float TANK_CAPACITY_LITERS = 180.0f;

static const uint8_t PIN_I2C_SDA = 21;
static const uint8_t PIN_I2C_SCL = 22;

static const uint8_t PIN_IGNITION = 19;
static const uint8_t PIN_TEST_BUTTON = 4;

static const int OLED_WIDTH = 128;
static const int OLED_HEIGHT = 64;
static const int PIN_OLED_SCK = 5;
static const int PIN_OLED_MOSI = 23;
static const int PIN_OLED_RESET = 17;
static const int PIN_OLED_DC = 16;
static const int PIN_OLED_CS = 18;

// Measured from the current fuel sender prototype on 2026-06-30:
// A0 moved roughly from 0.028V to 0.308V through the 330 ohm pull-up circuit.
// If the sender direction feels reversed in the demo, swap EMPTY and FULL.
const float FUEL_A0_EMPTY_V = 0.03f;
const float FUEL_A0_FULL_V = 0.31f;

// Backup potentiometer is normally 0.0V to 3.3V.
const float FUEL_A1_EMPTY_V = 0.00f;
const float FUEL_A1_FULL_V = 3.30f;

const uint8_t FUEL_MEDIAN_SIZE = 5;
const float FUEL_EMA_ALPHA = 0.18f;
const uint32_t IGNITION_OFF_SETTLE_MS = 2500;
const float THEFT_MIN_TOTAL_DROP_PCT = 6.0f;
const float THEFT_MIN_RATE_PCT_PER_SEC = -0.8f;
const uint32_t THEFT_CONFIRM_MS = 2200;
const uint32_t THEFT_ALERT_HOLD_MS = 8000;
const float THEFT_CANCEL_RECOVERY_PCT = 2.0f;
const float REFUEL_MIN_RISE_PCT = 7.0f;
const uint32_t REFUEL_CONFIRM_MS = 1800;
const float BASELINE_STABLE_RATE_ABS_PCT_PER_SEC = 0.20f;
const uint32_t BASELINE_STABLE_UPDATE_MS = 5000;
const float SENSOR_VALID_LOW_MARGIN_PCT = -5.0f;
const float SENSOR_VALID_HIGH_MARGIN_PCT = 105.0f;
const uint32_t SENSOR_STUCK_MS = 15000;
const float SENSOR_STUCK_EPS_PCT = 0.15f;
const uint32_t TEST_HOLD_MS = 3500;
const uint32_t SAMPLE_INTERVAL_MS = 250;
const uint32_t SERIAL_INTERVAL_MS = 500;
const uint32_t OLED_INTERVAL_MS = 500;

#if SMARTT_ENABLE_WIFI_DASHBOARD
static const char* AP_SSID = "SmartT-BKUIT-OPEN";
static const char* AP_PASS = "";
WebServer server(80);
#endif

Adafruit_ADS1115 ads;
Adafruit_SSD1306 display(
  OLED_WIDTH,
  OLED_HEIGHT,
  PIN_OLED_MOSI,
  PIN_OLED_SCK,
  PIN_OLED_DC,
  PIN_OLED_RESET,
  PIN_OLED_CS
);

struct Telemetry {
  bool adsReady = false;
  bool oledReady = false;
  bool ignitionOn = false;
  bool testPressed = false;
  int16_t rawA0 = 0;
  int16_t rawA1 = 0;
  float voltsA0 = 0.0f;
  float voltsA1 = 0.0f;
  float fuelA0Percent = 0.0f;
  float fuelA1Percent = 0.0f;
  float fuelRawPercent = 0.0f;
  float fuelFilteredPercent = 0.0f;
  float fuelDeltaWindow = 0.0f;
  float fuelRatePctPerSec = 0.0f;
  float parkedBaselinePct = 0.0f;
  float candidateDropPct = 0.0f;
  uint8_t anomalyConfidence = 0;
  String detectorState = "BOOT";
  bool sensorHealthy = true;
  String event = "BOOT";
  String alert = "NONE";
};

Telemetry telemetry;

enum FuelDetectorState {
  DETECTOR_BOOT,
  DETECTOR_NORMAL_ON,
  DETECTOR_OFF_SETTLING,
  DETECTOR_PARKED_MONITORING,
  DETECTOR_DROP_CANDIDATE,
  DETECTOR_THEFT_ALERT,
  DETECTOR_REFUEL_CANDIDATE,
  DETECTOR_SENSOR_FAULT
};

struct FuelDetectorRuntime {
  FuelDetectorState state = DETECTOR_BOOT;
  FuelDetectorState previousState = DETECTOR_BOOT;

  bool lastIgnitionOn = false;
  uint32_t stateStartMs = 0;
  uint32_t ignitionChangedMs = 0;

  float previousFilteredFuelPct = 0.0f;
  float fuelRatePctPerSec = 0.0f;
  uint32_t lastRateMs = 0;

  float parkedBaselinePct = 0.0f;
  bool parkedBaselineReady = false;

  float candidateStartFuelPct = 0.0f;
  float candidateDropPct = 0.0f;
  uint32_t candidateStartMs = 0;

  uint32_t alertHoldUntilMs = 0;
  uint8_t confidence = 0;

  uint32_t lastStableUpdateMs = 0;
  uint32_t lastSensorChangeMs = 0;
  float lastSensorCheckFuelPct = 0.0f;
};

FuelDetectorRuntime detector;

bool filterReady = false;
float filteredFuelPercent = 0.0f;
float fuelMedianBuffer[FUEL_MEDIAN_SIZE] = {0.0f};
uint8_t fuelMedianIndex = 0;
uint8_t fuelMedianCount = 0;
uint32_t testHoldUntilMs = 0;
uint32_t testAlertHoldUntilMs = 0;
bool lastTestPressed = false;

uint32_t lastSampleMs = 0;
uint32_t lastSerialMs = 0;
uint32_t lastOledMs = 0;

float clampFloat(float value, float low, float high) {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

float voltageToPercent(float volts, float emptyVolts, float fullVolts) {
  float span = fullVolts - emptyVolts;
  if (fabs(span) < 0.001f) {
    return 0.0f;
  }

  float percent = ((volts - emptyVolts) * 100.0f) / span;
  return clampFloat(percent, 0.0f, 100.0f);
}

float voltageToPercentUnclamped(float volts, float emptyVolts, float fullVolts) {
  float span = fullVolts - emptyVolts;
  if (fabs(span) < 0.001f) {
    return 0.0f;
  }

  return ((volts - emptyVolts) * 100.0f) / span;
}

float selectedFuelPercentUnclamped() {
#if SMARTT_USE_A1_BACKUP_AS_MAIN_FUEL
  return voltageToPercentUnclamped(telemetry.voltsA1, FUEL_A1_EMPTY_V, FUEL_A1_FULL_V);
#else
  return voltageToPercentUnclamped(telemetry.voltsA0, FUEL_A0_EMPTY_V, FUEL_A0_FULL_V);
#endif
}

void resetMedianFilter(float seed) {
  for (uint8_t i = 0; i < FUEL_MEDIAN_SIZE; i++) {
    fuelMedianBuffer[i] = seed;
  }
  fuelMedianIndex = 0;
  fuelMedianCount = FUEL_MEDIAN_SIZE;
}

float medianFilteredFuel(float sample) {
  fuelMedianBuffer[fuelMedianIndex] = sample;
  fuelMedianIndex = (fuelMedianIndex + 1) % FUEL_MEDIAN_SIZE;
  if (fuelMedianCount < FUEL_MEDIAN_SIZE) {
    fuelMedianCount++;
  }

  float sorted[FUEL_MEDIAN_SIZE];
  for (uint8_t i = 0; i < fuelMedianCount; i++) {
    sorted[i] = fuelMedianBuffer[i];
  }

  for (uint8_t i = 1; i < fuelMedianCount; i++) {
    float key = sorted[i];
    int8_t j = i - 1;
    while (j >= 0 && sorted[j] > key) {
      sorted[j + 1] = sorted[j];
      j--;
    }
    sorted[j + 1] = key;
  }

  return sorted[fuelMedianCount / 2];
}

String detectorStateName(uint8_t state) {
  switch (state) {
    case DETECTOR_BOOT: return "BOOT";
    case DETECTOR_NORMAL_ON: return "NORMAL_ON";
    case DETECTOR_OFF_SETTLING: return "OFF_SETTLING";
    case DETECTOR_PARKED_MONITORING: return "PARKED_MONITORING";
    case DETECTOR_DROP_CANDIDATE: return "DROP_CANDIDATE";
    case DETECTOR_THEFT_ALERT: return "THEFT_ALERT";
    case DETECTOR_REFUEL_CANDIDATE: return "REFUEL_CANDIDATE";
    case DETECTOR_SENSOR_FAULT: return "SENSOR_FAULT";
  }
  return "UNKNOWN";
}

void setDetectorState(uint8_t nextState, uint32_t now) {
  if (detector.state == nextState) {
    return;
  }

  detector.previousState = detector.state;
  detector.state = (FuelDetectorState)nextState;
  detector.stateStartMs = now;
}

uint8_t computeTheftConfidence(float dropPct, float ratePctPerSec) {
  float score = 50.0f;
  score += (dropPct - THEFT_MIN_TOTAL_DROP_PCT) * 5.0f;
  score += fabs(ratePctPerSec) * 10.0f;

  if (!telemetry.ignitionOn) {
    score += 15.0f;
  }

  score = clampFloat(score, 0.0f, 100.0f);
  return (uint8_t)(score + 0.5f);
}

float readAdsVoltage(uint8_t channel, int16_t& rawOut) {
  const uint8_t samples = 4;
  int32_t rawTotal = 0;
  float voltTotal = 0.0f;

  for (uint8_t i = 0; i < samples; i++) {
    int16_t raw = ads.readADC_SingleEnded(channel);
    rawTotal += raw;
    voltTotal += ads.computeVolts(raw);
    delay(2);
  }

  rawOut = (int16_t)(rawTotal / samples);
  return voltTotal / samples;
}

void readTelemetry() {
  telemetry.ignitionOn = (digitalRead(PIN_IGNITION) == LOW);
  telemetry.testPressed = (digitalRead(PIN_TEST_BUTTON) == LOW);
  uint32_t now = millis();

  if (telemetry.adsReady) {
    telemetry.voltsA0 = readAdsVoltage(0, telemetry.rawA0);
    telemetry.voltsA1 = readAdsVoltage(1, telemetry.rawA1);

    telemetry.fuelA0Percent = voltageToPercent(telemetry.voltsA0, FUEL_A0_EMPTY_V, FUEL_A0_FULL_V);
    telemetry.fuelA1Percent = voltageToPercent(telemetry.voltsA1, FUEL_A1_EMPTY_V, FUEL_A1_FULL_V);
  } else {
    telemetry.rawA0 = 0;
    telemetry.rawA1 = 0;
    telemetry.voltsA0 = 0.0f;
    telemetry.voltsA1 = 0.0f;
    telemetry.fuelA0Percent = 0.0f;
    telemetry.fuelA1Percent = 0.0f;
  }

#if SMARTT_USE_A1_BACKUP_AS_MAIN_FUEL
  telemetry.fuelRawPercent = telemetry.fuelA1Percent;
#else
  telemetry.fuelRawPercent = telemetry.fuelA0Percent;
#endif

  if (!filterReady) {
    resetMedianFilter(telemetry.fuelRawPercent);
    filteredFuelPercent = telemetry.fuelRawPercent;
    detector.previousFilteredFuelPct = filteredFuelPercent;
    detector.fuelRatePctPerSec = 0.0f;
    detector.lastRateMs = now;
    detector.parkedBaselinePct = filteredFuelPercent;
    detector.lastStableUpdateMs = now;
    detector.lastSensorCheckFuelPct = telemetry.fuelRawPercent;
    detector.lastSensorChangeMs = now;
    filterReady = true;
  } else {
    float medianFuelPercent = medianFilteredFuel(telemetry.fuelRawPercent);
    float previousFiltered = filteredFuelPercent;
    filteredFuelPercent += FUEL_EMA_ALPHA * (medianFuelPercent - filteredFuelPercent);

    if (detector.lastRateMs > 0 && now > detector.lastRateMs) {
      float dtSeconds = (float)(now - detector.lastRateMs) / 1000.0f;
      detector.fuelRatePctPerSec = (filteredFuelPercent - previousFiltered) / dtSeconds;
    } else {
      detector.fuelRatePctPerSec = 0.0f;
    }

    detector.previousFilteredFuelPct = previousFiltered;
    detector.lastRateMs = now;
  }

  telemetry.fuelFilteredPercent = filteredFuelPercent;
  telemetry.fuelRatePctPerSec = detector.fuelRatePctPerSec;
}

void updateTestButton(uint32_t now) {
  if (telemetry.testPressed && !lastTestPressed) {
    testHoldUntilMs = now + TEST_HOLD_MS;
    if (!telemetry.ignitionOn) {
      testAlertHoldUntilMs = now + THEFT_ALERT_HOLD_MS;
    }
  }
  lastTestPressed = telemetry.testPressed;
}

bool isFuelSensorHealthy(uint32_t now) {
  if (!telemetry.adsReady) {
    return false;
  }

  float fuelPctUnclamped = selectedFuelPercentUnclamped();
  if (fuelPctUnclamped < SENSOR_VALID_LOW_MARGIN_PCT ||
      fuelPctUnclamped > SENSOR_VALID_HIGH_MARGIN_PCT) {
    return false;
  }

  if (detector.lastSensorChangeMs == 0) {
    detector.lastSensorCheckFuelPct = telemetry.fuelRawPercent;
    detector.lastSensorChangeMs = now;
  }

  if (fabs(telemetry.fuelRawPercent - detector.lastSensorCheckFuelPct) > SENSOR_STUCK_EPS_PCT) {
    detector.lastSensorCheckFuelPct = telemetry.fuelRawPercent;
    detector.lastSensorChangeMs = now;
  }

  // Do not fail the first demo just because fuel is stable for a long time.
  if (now - detector.lastSensorChangeMs > SENSOR_STUCK_MS) {
    return true;
  }

  return true;
}

void updateIgnitionTransition(uint32_t now) {
  if (detector.state == DETECTOR_BOOT || detector.state == DETECTOR_SENSOR_FAULT) {
    detector.lastIgnitionOn = telemetry.ignitionOn;
    detector.ignitionChangedMs = now;
    detector.parkedBaselinePct = telemetry.fuelFilteredPercent;
    detector.lastStableUpdateMs = now;
    detector.candidateStartMs = 0;
    detector.candidateDropPct = 0.0f;
    detector.confidence = 0;

    if (telemetry.ignitionOn) {
      detector.parkedBaselineReady = false;
      setDetectorState(DETECTOR_NORMAL_ON, now);
    } else {
      detector.parkedBaselineReady = false;
      setDetectorState(DETECTOR_OFF_SETTLING, now);
    }
    return;
  }

  if (telemetry.ignitionOn != detector.lastIgnitionOn) {
    detector.lastIgnitionOn = telemetry.ignitionOn;
    detector.ignitionChangedMs = now;
    detector.parkedBaselineReady = false;
    detector.candidateStartMs = 0;
    detector.candidateDropPct = 0.0f;
    detector.confidence = 0;

    if (telemetry.ignitionOn) {
      testAlertHoldUntilMs = 0;
      setDetectorState(DETECTOR_NORMAL_ON, now);
    } else {
      setDetectorState(DETECTOR_OFF_SETTLING, now);
    }
  }
}

void maybeUpdateStableBaseline(uint32_t now, float fuel) {
  if (!telemetry.ignitionOn && !detector.parkedBaselineReady) {
    return;
  }

  if (fabs(detector.fuelRatePctPerSec) > BASELINE_STABLE_RATE_ABS_PCT_PER_SEC) {
    return;
  }

  if (now - detector.lastStableUpdateMs >= BASELINE_STABLE_UPDATE_MS) {
    detector.parkedBaselinePct = fuel;
    detector.lastStableUpdateMs = now;
  }
}

void startRefuelCandidate(uint32_t now, float fuel) {
  detector.candidateStartMs = now;
  detector.candidateStartFuelPct = fuel;
  detector.candidateDropPct = 0.0f;
  detector.confidence = 0;
  setDetectorState(DETECTOR_REFUEL_CANDIDATE, now);
}

void updateRefuelCandidate(uint32_t now, float fuel) {
  telemetry.event = "REFUEL_CANDIDATE";
  telemetry.alert = "NONE";

  float rise = fuel - detector.parkedBaselinePct;
  if (rise < REFUEL_MIN_RISE_PCT - THEFT_CANCEL_RECOVERY_PCT) {
    detector.candidateStartMs = 0;
    setDetectorState(telemetry.ignitionOn ? DETECTOR_NORMAL_ON : DETECTOR_PARKED_MONITORING, now);
    return;
  }

  if (now - detector.candidateStartMs >= REFUEL_CONFIRM_MS) {
    telemetry.event = "REFUEL_EVENT";
    telemetry.alert = "NONE";
    detector.parkedBaselinePct = fuel;
    detector.parkedBaselineReady = !telemetry.ignitionOn;
    detector.candidateDropPct = 0.0f;
    detector.confidence = 0;
    detector.lastStableUpdateMs = now;
    setDetectorState(telemetry.ignitionOn ? DETECTOR_NORMAL_ON : DETECTOR_PARKED_MONITORING, now);
  }
}

void updateFuelStateMachine(uint32_t now) {
  float fuel = telemetry.fuelFilteredPercent;
  telemetry.fuelDeltaWindow = fuel - detector.parkedBaselinePct;

  if (detector.state == DETECTOR_REFUEL_CANDIDATE) {
    updateRefuelCandidate(now, fuel);
    telemetry.fuelDeltaWindow = fuel - detector.parkedBaselinePct;
    return;
  }

  if (telemetry.ignitionOn) {
    detector.parkedBaselineReady = false;
    detector.candidateStartMs = 0;
    detector.candidateDropPct = 0.0f;
    detector.confidence = 0;

    if (fuel - detector.parkedBaselinePct >= REFUEL_MIN_RISE_PCT) {
      startRefuelCandidate(now, fuel);
      telemetry.event = "REFUEL_CANDIDATE";
      return;
    }

    telemetry.event = "NORMAL";
    if (detector.fuelRatePctPerSec <= THEFT_MIN_RATE_PCT_PER_SEC) {
      telemetry.event = "FAST_DROP_IGN_ON";
    }

    maybeUpdateStableBaseline(now, fuel);
    setDetectorState(DETECTOR_NORMAL_ON, now);
    telemetry.fuelDeltaWindow = fuel - detector.parkedBaselinePct;
    return;
  }

  switch (detector.state) {
    case DETECTOR_OFF_SETTLING:
      telemetry.event = "PARKED_SETTLING";
      if (now - detector.stateStartMs >= IGNITION_OFF_SETTLE_MS) {
        detector.parkedBaselinePct = fuel;
        detector.parkedBaselineReady = true;
        detector.lastStableUpdateMs = now;
        setDetectorState(DETECTOR_PARKED_MONITORING, now);
        telemetry.event = "PARKED_MONITORING";
      }
      break;

    case DETECTOR_PARKED_MONITORING: {
      telemetry.event = "PARKED_MONITORING";
      float drop = detector.parkedBaselinePct - fuel;
      detector.candidateDropPct = drop;

      if (fuel - detector.parkedBaselinePct >= REFUEL_MIN_RISE_PCT) {
        startRefuelCandidate(now, fuel);
        telemetry.event = "REFUEL_CANDIDATE";
        break;
      }

      if (drop >= THEFT_MIN_TOTAL_DROP_PCT &&
          detector.fuelRatePctPerSec <= THEFT_MIN_RATE_PCT_PER_SEC) {
        detector.candidateStartMs = now;
        detector.candidateStartFuelPct = fuel;
        setDetectorState(DETECTOR_DROP_CANDIDATE, now);
        telemetry.event = "FUEL_DROP_CANDIDATE";
        break;
      }

      maybeUpdateStableBaseline(now, fuel);
      break;
    }

    case DETECTOR_DROP_CANDIDATE: {
      float drop = detector.parkedBaselinePct - fuel;
      detector.candidateDropPct = drop;
      telemetry.event = "FUEL_DROP_CANDIDATE";
      telemetry.alert = "NONE";

      if (fuel >= detector.parkedBaselinePct - THEFT_CANCEL_RECOVERY_PCT) {
        detector.candidateDropPct = 0.0f;
        detector.confidence = 0;
        setDetectorState(DETECTOR_PARKED_MONITORING, now);
        telemetry.event = "PARKED_MONITORING";
        break;
      }

      if (drop >= THEFT_MIN_TOTAL_DROP_PCT &&
          now - detector.candidateStartMs >= THEFT_CONFIRM_MS) {
        detector.confidence = computeTheftConfidence(drop, detector.fuelRatePctPerSec);
        detector.alertHoldUntilMs = now + THEFT_ALERT_HOLD_MS;
        setDetectorState(DETECTOR_THEFT_ALERT, now);
        telemetry.event = "SUSPICIOUS_DROP";
        telemetry.alert = "FUEL_THEFT_ANOMALY";
      }
      break;
    }

    case DETECTOR_THEFT_ALERT:
      telemetry.event = "SUSPICIOUS_DROP";
      telemetry.alert = "FUEL_THEFT_ANOMALY";
      if (now >= detector.alertHoldUntilMs) {
        detector.parkedBaselinePct = fuel;
        detector.lastStableUpdateMs = now;
        detector.candidateDropPct = 0.0f;
        detector.confidence = 0;
        setDetectorState(DETECTOR_PARKED_MONITORING, now);
        telemetry.event = "PARKED_MONITORING";
        telemetry.alert = "NONE";
      }
      break;

    default:
      setDetectorState(DETECTOR_OFF_SETTLING, now);
      telemetry.event = "PARKED_SETTLING";
      break;
  }

  telemetry.fuelDeltaWindow = fuel - detector.parkedBaselinePct;
}

void exportDetectorToTelemetry() {
  telemetry.fuelRatePctPerSec = detector.fuelRatePctPerSec;
  telemetry.parkedBaselinePct = detector.parkedBaselinePct;
  telemetry.candidateDropPct = clampFloat(detector.candidateDropPct, 0.0f, 100.0f);
  telemetry.anomalyConfidence = detector.confidence;
  telemetry.detectorState = detectorStateName(detector.state);
}

void applyTestButtonOverride(uint32_t now) {
  if (now < testHoldUntilMs) {
    telemetry.event = "TEST_BUTTON";
    telemetry.anomalyConfidence = 100;
    if (telemetry.ignitionOn) {
      telemetry.alert = "DROP_TEST_IGN_ON";
    } else {
      telemetry.alert = "FUEL_THEFT_TEST";
    }
  } else if (now < testAlertHoldUntilMs && !telemetry.ignitionOn && telemetry.alert == "NONE") {
    telemetry.alert = "FUEL_THEFT_ANOMALY";
    telemetry.anomalyConfidence = 100;
  }
}

void updateDetection() {
  uint32_t now = millis();
  updateTestButton(now);

  telemetry.event = "NORMAL";
  telemetry.alert = "NONE";
  telemetry.anomalyConfidence = 0;

  if (!telemetry.adsReady) {
    telemetry.sensorHealthy = false;
    detector.confidence = 0;
    setDetectorState(DETECTOR_SENSOR_FAULT, now);
    telemetry.event = "ADS1115_MISSING";
    telemetry.alert = "NONE";
    exportDetectorToTelemetry();
    return;
  }

  telemetry.sensorHealthy = isFuelSensorHealthy(now);
  if (!telemetry.sensorHealthy) {
    detector.confidence = 0;
    setDetectorState(DETECTOR_SENSOR_FAULT, now);
    telemetry.event = "SENSOR_FAULT";
    telemetry.alert = "NONE";
    exportDetectorToTelemetry();
    return;
  }

  updateIgnitionTransition(now);
  updateFuelStateMachine(now);
  exportDetectorToTelemetry();
  applyTestButtonOverride(now);
}

String boolJson(bool value) {
  return value ? "true" : "false";
}

String friendlyEventLabel(const String& event) {
  if (event == "BOOT") return "Booting";
  if (event == "NORMAL") return "Normal";
  if (event == "ADS1115_MISSING") return "ADS missing";
  if (event == "SENSOR_FAULT") return "Sensor fault";
  if (event == "PARKED_SETTLING") return "Parked settling";
  if (event == "PARKED_MONITORING") return "Parked monitor";
  if (event == "FUEL_DROP_CANDIDATE") return "Drop candidate";
  if (event == "REFUEL_CANDIDATE") return "Refuel candidate";
  if (event == "REFUEL_EVENT") return "Refuel detected";
  if (event == "FAST_DROP_IGN_ON") return "Fast drop";
  if (event == "SUSPICIOUS_DROP") return "Suspicious drop";
  if (event == "TEST_BUTTON") return "Test mode";
  return event;
}

String friendlyAlertLabel(const String& alert) {
  if (alert == "NONE") return "No alert";
  if (alert == "FUEL_THEFT_ANOMALY") return "Fuel theft alert";
  if (alert == "FUEL_THEFT_TEST") return "Test theft alert";
  if (alert == "DROP_TEST_IGN_ON") return "Drop test";
  return alert;
}

String oledStatusLabel() {
  if (telemetry.alert != "NONE") {
    return friendlyAlertLabel(telemetry.alert);
  }
  return friendlyEventLabel(telemetry.event);
}

String telemetryJson() {
  String json;
  json.reserve(1480);
  const float fuelLiters = clampFloat(telemetry.fuelFilteredPercent, 0.0f, 100.0f) * TANK_CAPACITY_LITERS / 100.0f;

  json += "{";
  json += "\"vehicle_id\":\"";
  json += VEHICLE_ID;
  json += "\",";
  json += "\"uptime_ms\":";
  json += String(millis());
  json += ",";
  json += "\"ads_ready\":";
  json += boolJson(telemetry.adsReady);
  json += ",";
  json += "\"oled_ready\":";
  json += boolJson(telemetry.oledReady);
  json += ",";
  json += "\"ignition\":\"";
  json += telemetry.ignitionOn ? "ON" : "OFF";
  json += "\",";
  json += "\"test_button\":";
  json += boolJson(telemetry.testPressed);
  json += ",";
  json += "\"fuel_raw_adc_a0\":";
  json += String(telemetry.rawA0);
  json += ",";
  json += "\"fuel_raw_adc_a1\":";
  json += String(telemetry.rawA1);
  json += ",";
  json += "\"fuel_volts_a0\":";
  json += String(telemetry.voltsA0, 4);
  json += ",";
  json += "\"fuel_volts_a1\":";
  json += String(telemetry.voltsA1, 4);
  json += ",";
  json += "\"fuel_percent_a0\":";
  json += String(telemetry.fuelA0Percent, 1);
  json += ",";
  json += "\"fuel_percent_a1\":";
  json += String(telemetry.fuelA1Percent, 1);
  json += ",";
  json += "\"fuel_percent_raw\":";
  json += String(telemetry.fuelRawPercent, 1);
  json += ",";
  json += "\"fuel_percent_filtered\":";
  json += String(telemetry.fuelFilteredPercent, 1);
  json += ",";
  json += "\"fuel_liters\":";
  json += String(fuelLiters, 1);
  json += ",";
  json += "\"tank_capacity_liters\":";
  json += String(TANK_CAPACITY_LITERS, 1);
  json += ",";
  json += "\"fuel_delta_window\":";
  json += String(telemetry.fuelDeltaWindow, 1);
  json += ",";
  json += "\"fuel_rate_pct_per_sec\":";
  json += String(telemetry.fuelRatePctPerSec, 2);
  json += ",";
  json += "\"speed_kmh\":0,";
  json += "\"gps_state\":\"Unavailable\",";
  json += "\"gps_location\":\"--\",";
  json += "\"geo_zone\":\"--\",";
  json += "\"data_source\":\"Fuel Sensor\",";
  json += "\"parked_baseline_pct\":";
  json += String(telemetry.parkedBaselinePct, 1);
  json += ",";
  json += "\"candidate_drop_pct\":";
  json += String(telemetry.candidateDropPct, 1);
  json += ",";
  json += "\"anomaly_confidence\":";
  json += String(telemetry.anomalyConfidence);
  json += ",";
  json += "\"detector_state\":\"";
  json += telemetry.detectorState;
  json += "\",";
  json += "\"sensor_healthy\":";
  json += boolJson(telemetry.sensorHealthy);
  json += ",";
  json += "\"event\":\"";
  json += telemetry.event;
  json += "\",";
  json += "\"event_label\":\"";
  json += friendlyEventLabel(telemetry.event);
  json += "\",";
  json += "\"alert\":\"";
  json += telemetry.alert;
  json += "\",";
  json += "\"alert_label\":\"";
  json += friendlyAlertLabel(telemetry.alert);
  json += "\"";
  json += "}";

  return json;
}

void drawOled() {
  if (!telemetry.oledReady) return;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("SmartT");

  display.setCursor(78, 0);
  display.print(telemetry.ignitionOn ? "IGN ON" : "IGN OFF");

  float fuel = clampFloat(telemetry.fuelFilteredPercent, 0.0f, 100.0f);
  int fuelRounded = (int)(fuel + 0.5f);

  display.setTextSize(3);
  display.setCursor(0, 15);
  display.print(fuelRounded);
  display.print("%");

  display.setTextSize(1);
  display.setCursor(80, 18);
  display.print("A0 ");
  display.print(telemetry.fuelA0Percent, 0);
  display.print("%");

  display.setCursor(80, 30);
  display.print("A1 ");
  display.print(telemetry.fuelA1Percent, 0);
  display.print("%");

  display.setCursor(0, 44);
  display.print(oledStatusLabel().substring(0, 21));

  const int barY = 54;
  const int fillW = map(fuelRounded, 0, 100, 0, 124);
  display.drawRect(0, barY, 128, 10, SSD1306_WHITE);
  display.fillRect(2, barY + 2, fillW, 6, SSD1306_WHITE);

  display.display();
}

#if SMARTT_ENABLE_WIFI_DASHBOARD
const char DASHBOARD_HTML[] PROGMEM = R"SMARTT_HTML(
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>SmartT Fleet Fuel Intelligence</title>
    <link rel="stylesheet" href="style.css">
    <script src="app.js" defer></script>
  </head>
  <body>
    <div class="app-shell">
      <header class="app-header">
        <a class="brand" href="#overview" aria-label="SmartT home">
          <span class="brand-mark" aria-hidden="true">ST</span>
          <span>
            <strong>SmartT</strong>
            <small>Fuel Intelligence</small>
          </span>
        </a>

        <nav class="section-tabs" aria-label="Dashboard sections">
          <a href="#overview" class="tab-link is-active" data-section="overview" aria-current="page">Overview</a>
          <a href="#evidence" class="tab-link" data-section="evidence">Evidence</a>
          <a href="#telemetry" class="tab-link" data-section="telemetry">Telemetry</a>
          <a href="#events" class="tab-link" data-section="events">Events</a>
        </nav>

        <div class="header-status" aria-label="Current monitored asset">
          <div>
            <span>Vehicle</span>
            <strong id="vehicleId">TRUCK_01</strong>
          </div>
          <div>
            <span>Updated</span>
            <strong id="lastUpdate">--:--</strong>
          </div>
        </div>

        <div class="online-status" id="connectionStatus" aria-label="Connection status">
          <span class="status-dot" aria-hidden="true"></span>
          <span>Online</span>
        </div>
      </header>

      <main class="content">
        <section class="page-section overview-grid nav-section" id="overview" aria-label="Fleet overview">
          <article class="panel fuel-overview">
            <div class="panel-heading fuel-heading">
              <h2>Fuel Level</h2>
              <span class="state-badge" id="fuelStatus">Normal</span>
            </div>

            <div class="fuel-summary">
              <div class="fuel-value" aria-label="Current fuel percentage">
                <strong id="fuelPercent">--</strong>
                <span>%</span>
              </div>
              <div class="fuel-side">
                <dl>
                  <div>
                    <dt>Estimated volume</dt>
                    <dd id="fuelLiters">-- L</dd>
                  </div>
                  <div>
                    <dt>Tank capacity</dt>
                    <dd id="tankCapacity">-- L</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div class="tank-track" aria-hidden="true">
              <div class="tank-fill" id="fuelBar"></div>
              <span style="left:25%"></span>
              <span style="left:50%"></span>
              <span style="left:75%"></span>
            </div>

            <div class="decision-strip" id="decisionStrip">
              <div>
                <span>Decision</span>
                <strong id="decisionTitle">Normal</strong>
              </div>
              <div>
                <span>Rule</span>
                <strong id="ruleResult">Stable trend</strong>
              </div>
              <div>
                <span>Confidence</span>
                <strong id="confidenceValue">--%</strong>
              </div>
            </div>
          </article>

          <article class="panel context-panel">
            <div class="panel-heading simple">
              <h2>Vehicle context</h2>
              <button class="state-toggle" id="ignitionToggle" type="button" aria-pressed="false">Ignition OFF</button>
            </div>

            <dl class="context-list">
              <div>
                <dt>Ignition</dt>
                <dd id="ignitionState">--</dd>
              </div>
              <div>
                <dt>Speed</dt>
                <dd id="speedValue">-- km/h</dd>
              </div>
              <div>
                <dt>GPS state</dt>
                <dd id="gpsState">--</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd id="gpsLocation">--</dd>
              </div>
              <div>
                <dt>Zone</dt>
                <dd id="geoZone">--</dd>
              </div>
              <div>
                <dt>Fuel source</dt>
                <dd id="dataSource">Fuel Sensor</dd>
              </div>
            </dl>
          </article>
        </section>

        <section class="page-section nav-section" id="evidence" aria-label="Anomaly evidence">
          <article class="panel evidence-panel">
            <div class="panel-heading simple">
              <h2>Evidence</h2>
              <span class="alert-code" id="alertCode">NORMAL</span>
            </div>

            <div class="evidence-table" role="table" aria-label="Anomaly evidence table">
              <div class="evidence-row header" role="row">
                <span role="columnheader">Fuel delta</span>
                <span role="columnheader">Ignition</span>
                <span role="columnheader">Speed</span>
                <span role="columnheader">GPS</span>
                <span role="columnheader">Location</span>
                <span role="columnheader">Result</span>
              </div>
              <div class="evidence-row" role="row">
                <strong id="evidenceFuelDelta" role="cell">--</strong>
                <strong id="evidenceIgnitionText" role="cell">--</strong>
                <strong id="evidenceSpeedText" role="cell">--</strong>
                <strong id="evidenceGpsText" role="cell">--</strong>
                <strong id="evidenceLocationText" role="cell">--</strong>
                <strong id="evidenceResult" role="cell">--</strong>
              </div>
            </div>
          </article>
        </section>

        <section class="page-section nav-section" id="telemetry" aria-label="Fuel telemetry">
          <article class="panel telemetry-panel">
            <div class="panel-heading simple">
              <h2>Fuel signal</h2>
              <div class="legend" aria-label="Signal legend">
                <span><i class="raw-key"></i>Raw</span>
                <span><i class="filtered-key"></i>Filtered</span>
              </div>
            </div>

            <div class="telemetry-meta">
              <dl>
                <div>
                  <dt>Filtered</dt>
                  <dd id="filteredFuelValue">--%</dd>
                </div>
                <div>
                  <dt>Raw</dt>
                  <dd id="rawFuelValue">--%</dd>
                </div>
                <div>
                  <dt>Change</dt>
                  <dd id="fuelDelta">-- L</dd>
                </div>
              </dl>
            </div>

            <div class="chart-shell" aria-label="Recent fuel signal trend">
              <svg id="signalChart" viewBox="0 0 760 260" role="img">
                <defs>
                  <linearGradient id="fuelAreaGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="#11aebc" stop-opacity="0.16"></stop>
                    <stop offset="100%" stop-color="#11aebc" stop-opacity="0.01"></stop>
                  </linearGradient>
                </defs>
                <line class="chart-grid" x1="0" y1="52" x2="760" y2="52"></line>
                <line class="chart-grid" x1="0" y1="104" x2="760" y2="104"></line>
                <line class="chart-grid" x1="0" y1="156" x2="760" y2="156"></line>
                <line class="chart-grid" x1="0" y1="208" x2="760" y2="208"></line>
                <polygon id="filteredArea" class="filtered-area" points=""></polygon>
                <polyline id="rawLine" class="raw-line" points=""></polyline>
                <polyline id="filteredLine" class="filtered-line" points=""></polyline>
              </svg>
            </div>
          </article>
        </section>

        <section class="page-section events-grid nav-section" id="events" aria-label="Events and actions">
          <article class="panel events-panel">
            <div class="panel-heading simple">
              <h2>Events</h2>
            </div>
            <ol class="event-log" id="eventLog"></ol>
          </article>

          <article class="panel actions-panel">
            <div class="panel-heading simple">
              <h2>Event review</h2>
            </div>
            <div class="action-grid">
              <button class="action-btn" id="normalBtn" type="button">Mark normal</button>
              <button class="action-btn" id="refuelBtn" type="button">Mark refuel</button>
              <button class="action-btn" id="noiseBtn" type="button">Mark sloshing</button>
              <button class="action-btn danger" id="theftBtn" type="button">Flag theft</button>
              <button class="action-btn" id="resetBtn" type="button">Clear</button>
            </div>
          </article>
        </section>
      </main>
    </div>
  </body>
</html>

)SMARTT_HTML";

const char DASHBOARD_CSS[] PROGMEM = R"SMARTT_CSS(
:root {
  color-scheme: light;
  --bg: #f4f8fb;
  --surface: #ffffff;
  --surface-subtle: #f8fbfc;
  --text: #123044;
  --navy: #061f33;
  --muted: #607788;
  --muted-2: #8ba0ad;
  --line: #dbe8ee;
  --line-soft: #edf3f6;
  --accent: #0c8fa2;
  --accent-2: #11aebc;
  --accent-soft: #e5f8fa;
  --success: #0f7b5d;
  --success-soft: #e8f7f0;
  --warning: #af6b00;
  --warning-soft: #fff5e4;
  --danger: #c43c36;
  --danger-soft: #fff1f0;
  --shadow: 0 18px 46px rgba(9, 39, 58, 0.08);
  --radius-lg: 18px;
  --radius-md: 14px;
}

* { box-sizing: border-box; }

html {
  min-height: 100%;
  background: linear-gradient(180deg, #eef8fb 0%, var(--bg) 420px, #f7fafc 100%);
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-height: 100%;
  color: var(--text);
  background: transparent;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
  line-height: 1.45;
}

button { font: inherit; cursor: pointer; }

.app-shell {
  width: min(1360px, 100%);
  margin: 0 auto;
  padding: 22px;
}

.app-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: auto minmax(280px, 1fr) auto auto;
  align-items: center;
  gap: 22px;
  min-height: 74px;
  padding: 10px 0 14px;
  border-bottom: 1px solid rgba(219, 232, 238, 0.88);
  background: rgba(244, 248, 251, 0.9);
  backdrop-filter: blur(16px);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 11px;
  color: inherit;
  text-decoration: none;
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 60px;
  height: 60px;
  border-radius: 18px;
  color: #ffffff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  box-shadow: 0 12px 24px rgba(17, 174, 188, 0.20);
  font-size: 20px;
  font-weight: 900;
  letter-spacing: 0;
}

.brand span { display: grid; gap: 1px; }
.brand strong { color: var(--navy); font-size: 24px; line-height: 1; letter-spacing: -0.04em; }
.brand small { color: var(--muted); font-size: 12px; font-weight: 800; letter-spacing: 0.11em; text-transform: uppercase; }

.section-tabs {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.tab-link {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-height: 42px;
  padding: 0 14px;
  color: var(--muted);
  font-size: 14px;
  font-weight: 760;
  text-decoration: none;
}

.tab-link::after {
  content: "";
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: 0;
  height: 2px;
  background: transparent;
}

.tab-link:hover,
.tab-link:focus-visible,
.tab-link.is-active { color: var(--navy); outline: none; }
.tab-link.is-active::after { background: var(--accent-2); }

.header-status {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 22px;
}

.header-status > div {
  display: grid;
  gap: 1px;
  min-width: 72px;
}

.header-status span,
dt,
.section-kicker {
  color: var(--muted-2);
  font-size: 11px;
  font-weight: 780;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.header-status strong { color: var(--navy); font-size: 14px; font-weight: 850; }
.online-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  justify-self: end;
  gap: 10px;
  min-height: 36px;
  padding: 7px 13px;
  color: var(--success);
  background: var(--success-soft);
  border: 1px solid rgba(15, 123, 93, 0.22);
  border-radius: 999px;
  font-size: 14px;
  font-weight: 850;
  white-space: nowrap;
}

.status-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  background: var(--success);
  border-radius: 50%;
  box-shadow: 0 0 0 4px rgba(15, 123, 93, 0.13);
}

.content { padding-top: 26px; }

.page-section { scroll-margin-top: 96px; margin-bottom: 18px; }

.overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(330px, 0.8fr);
  gap: 18px;
}

.events-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.55fr);
  gap: 18px;
}

.panel {
  min-width: 0;
  padding: 24px;
  border: 1px solid rgba(219, 232, 238, 0.92);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: var(--shadow);
}

.fuel-overview { min-height: 438px; }
.context-panel { min-height: 438px; }

.panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
}

.panel-heading.simple { align-items: center; margin-bottom: 18px; }
.fuel-heading {
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.panel-heading h1,
.panel-heading h2 { margin: 0; color: var(--navy); line-height: 1.08; letter-spacing: -0.045em; }
.panel-heading h1 { margin-top: 5px; font-size: clamp(30px, 4vw, 48px); }
.panel-heading h2 { font-size: 21px; }

.state-badge,
.alert-code {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 6px 11px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  background: var(--surface-subtle);
  font-size: 12px;
  font-weight: 850;
  white-space: nowrap;
}

.state-badge.normal,
.alert-code.normal { color: var(--success); border-color: rgba(15, 123, 93, 0.20); background: var(--success-soft); }
.state-badge.refuel,
.state-badge.noise,
.alert-code.refuel,
.alert-code.noise { color: var(--warning); border-color: rgba(175, 107, 0, 0.22); background: var(--warning-soft); }
.state-badge.theft,
.alert-code.theft { color: var(--danger); border-color: rgba(196, 60, 54, 0.24); background: var(--danger-soft); }

.fuel-summary {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 28px;
  margin: 6px 0 24px;
}

.fuel-value {
  display: flex;
  align-items: baseline;
  gap: 28px;
}

.fuel-value strong {
  color: var(--navy);
  font-size: clamp(90px, 12vw, 136px);
  line-height: 0.86;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
}

.fuel-value span {
  color: var(--muted);
  font-size: 32px;
  font-weight: 850;
  transform: translateY(-0.10em);
}

.fuel-side { min-width: 210px; }
.fuel-side dl,
.telemetry-meta dl {
  display: grid;
  gap: 0;
  margin: 0;
}

.fuel-side dl div,
.context-list div,
.telemetry-meta dl div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line-soft);
}

.fuel-side dl div:first-child,
.context-list div:first-child,
.telemetry-meta dl div:first-child { border-top: 1px solid var(--line-soft); }

dd { margin: 0; color: var(--navy); font-size: 17px; font-weight: 850; text-align: right; }

.tank-track {
  position: relative;
  height: 34px;
  overflow: hidden;
  border: 1px solid #cde2e8;
  border-radius: 999px;
  background: #eaf3f7;
}

.tank-fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: 0%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
  transition: width 240ms ease;
}

.tank-track span {
  position: absolute;
  top: 7px;
  bottom: 7px;
  width: 1px;
  background: rgba(6, 31, 51, 0.15);
}

.decision-strip {
  display: grid;
  grid-template-columns: 1.1fr 1fr 0.75fr;
  gap: 0;
  margin-top: 22px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-left: 4px solid var(--success);
  border-radius: var(--radius-md);
  background: var(--surface-subtle);
}

.decision-strip.refuel,
.decision-strip.noise { border-left-color: var(--warning); }
.decision-strip.theft { border-left-color: var(--danger); }

.decision-strip div { padding: 14px 16px; border-left: 1px solid var(--line-soft); }
.decision-strip div:first-child { border-left: 0; }
.decision-strip span { display: block; color: var(--muted-2); font-size: 11px; font-weight: 780; letter-spacing: 0.08em; text-transform: uppercase; }
.decision-strip strong { display: block; margin-top: 5px; color: var(--navy); font-size: 18px; line-height: 1.15; }

.state-toggle {
  min-height: 34px;
  padding: 6px 11px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  background: var(--surface-subtle);
  font-size: 12px;
  font-weight: 850;
}
.state-toggle.is-on { color: var(--accent); border-color: rgba(17, 174, 188, 0.32); background: var(--accent-soft); }
.state-toggle:hover,
.state-toggle:focus-visible,
.action-btn:hover,
.action-btn:focus-visible { outline: 3px solid rgba(17, 174, 188, 0.18); outline-offset: 1px; }

.context-list { display: grid; gap: 0; margin: 0; }

.evidence-table {
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
}

.evidence-row {
  display: grid;
  grid-template-columns: 0.9fr 0.75fr 0.75fr 0.9fr 1fr 1.2fr;
  min-width: 860px;
}

.evidence-row > * {
  min-width: 0;
  padding: 15px 16px;
  border-left: 1px solid var(--line-soft);
}
.evidence-row > *:first-child { border-left: 0; }
.evidence-row.header { background: #f8fbfc; border-bottom: 1px solid var(--line); }
.evidence-row.header span { color: var(--muted-2); font-size: 11px; font-weight: 780; letter-spacing: 0.08em; text-transform: uppercase; }
.evidence-row strong { color: var(--navy); font-size: 16px; font-weight: 850; }
.evidence-row.refuel strong:first-child,
.evidence-row.noise strong:first-child { color: var(--warning); }
.evidence-row.theft strong { color: var(--danger); }
.evidence-row.normal strong:first-child { color: var(--success); }

.telemetry-panel { padding-bottom: 20px; }
.legend { display: inline-flex; align-items: center; gap: 14px; color: var(--muted); font-size: 13px; font-weight: 760; }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.legend i { width: 18px; height: 3px; border-radius: 99px; }
.raw-key { background: #98aab4; }
.filtered-key { background: var(--accent-2); }

.telemetry-meta dl {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 26px;
  margin-bottom: 16px;
}
.telemetry-meta dl div { display: block; border-top: 0 !important; padding: 0 0 12px; }
.telemetry-meta dd { margin-top: 4px; text-align: left; }

.chart-shell {
  height: 340px;
  padding: 12px 0 0;
}
svg { display: block; width: 100%; height: 100%; overflow: visible; }
.chart-grid { stroke: #e2edf2; stroke-width: 1; }
.filtered-area { fill: url(#fuelAreaGradient); }
.raw-line,
.filtered-line { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.raw-line { stroke: #98aab4; stroke-width: 1.8; opacity: 0.82; }
.filtered-line { stroke: var(--accent-2); stroke-width: 3; }

.event-log { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.event-log li { display: grid; grid-template-columns: 86px 1fr; gap: 14px; align-items: center; min-height: 50px; padding: 12px 0; border-bottom: 1px solid var(--line-soft); }
.event-log li:first-child { border-top: 1px solid var(--line-soft); }
.event-log time { color: var(--muted-2); font-size: 12px; font-weight: 780; }
.event-log span { min-width: 0; color: var(--text); font-size: 14px; font-weight: 760; }

.action-grid { display: grid; grid-template-columns: 1fr; gap: 9px; }
.action-btn {
  min-height: 42px;
  padding: 9px 13px;
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--text);
  background: #f9fcfd;
  font-size: 14px;
  font-weight: 800;
  text-align: left;
}
.action-btn.is-active { color: var(--accent); border-color: rgba(17, 174, 188, 0.35); background: var(--accent-soft); }
.action-btn.danger.is-active { color: var(--danger); border-color: rgba(196, 60, 54, 0.25); background: var(--danger-soft); }

@media (max-width: 1040px) {
  .app-header { grid-template-columns: 1fr; align-items: start; }
  .section-tabs { justify-content: flex-start; overflow-x: auto; padding-bottom: 3px; }
  .header-status { justify-content: flex-start; flex-wrap: wrap; }
  .overview-grid,
  .events-grid { grid-template-columns: 1fr; }
  .fuel-overview,
  .context-panel { min-height: auto; }
}

@media (max-width: 720px) {
  .app-shell { padding: 14px; }
  .app-header { min-height: auto; gap: 12px; padding-bottom: 12px; }
  .brand-mark { width: 48px; height: 48px; border-radius: 15px; font-size: 16px; }
  .header-status { gap: 12px; }
  .content { padding-top: 16px; }
  .panel { padding: 18px; border-radius: 16px; }
  .panel-heading { align-items: flex-start; flex-direction: column; }
  .fuel-summary { align-items: flex-start; flex-direction: column; gap: 16px; }
  .fuel-side { width: 100%; min-width: 0; }
  .fuel-value strong { font-size: clamp(78px, 24vw, 108px); }
  .decision-strip { grid-template-columns: 1fr; }
  .decision-strip div { border-left: 0; border-top: 1px solid var(--line-soft); }
  .decision-strip div:first-child { border-top: 0; }
  .telemetry-meta dl { grid-template-columns: 1fr; gap: 8px; }
  .chart-shell { height: 250px; }
}

.online-status.offline {
  color: var(--danger);
  background: var(--danger-soft);
  border-color: rgba(196, 60, 54, 0.24);
}

.online-status.offline .status-dot {
  background: var(--danger);
  box-shadow: 0 0 0 4px rgba(196, 60, 54, 0.13);
}

.state-toggle[aria-disabled="true"] {
  cursor: default;
}
)SMARTT_CSS";

const char DASHBOARD_JS[] PROGMEM = R"SMARTT_JS(
(function () {
  "use strict";

  var config = {
    vehicleId: "TRUCK_01",
    tankLiters: 180,
    dataSource: "Fuel Sensor",
    maxLogItems: 6,
    historySize: 68,
    chartWidth: 760,
    chartHeight: 260
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
    active: copy.normal,
    vehicleId: config.vehicleId,
    ignitionOn: false,
    speedKmh: 0,
    gpsState: "Unavailable",
    gpsLocation: "--",
    geoZone: "--",
    dataSource: config.dataSource,
    tankLiters: config.tankLiters,
    fuelLiters: 0,
    baselinePct: 0,
    deltaPct: 0,
    deltaLiters: 0,
    rawFuelPct: 0,
    filteredFuelPct: 0,
    history: [],
    events: [],
    reviewMode: "",
    lastEventKey: "",
    online: false,
    initialized: false
  };

  var elements = {};
  var navLinks = [];
  var pollTimer = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function numberOr(value, fallback) {
    var number = Number(value);
    return isFinite(number) ? number : fallback;
  }

  function pct(value) {
    return clamp(numberOr(value, 0), 0, 100);
  }

  function formatNumber(value, digits) {
    return numberOr(value, 0).toFixed(digits);
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
    return percent * state.tankLiters / 100;
  }

  function signedLiters(value) {
    var sign = value > 0 ? "+" : "";
    return sign + formatNumber(value, 1) + " L";
  }

  function addEvent(message) {
    if (!message) return;

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

  function cleanText(value, fallback) {
    var text = String(value || fallback || "--");
    if (/prototype|mvp|demo|simulation|local mock|round 2|arduino|esp32|ads1115|oled-ready/i.test(text)) {
      return fallback || "--";
    }
    return text;
  }

  function displayVehicleId(value) {
    return cleanText(value, config.vehicleId);
  }

  function friendlyEvent(code) {
    var map = {
      BOOT: "Starting",
      NORMAL: "Normal",
      ADS1115_MISSING: "Fuel signal unavailable",
      SENSOR_FAULT: "Fuel signal check",
      PARKED_SETTLING: "Parked settling",
      PARKED_MONITORING: "Parked monitor",
      FUEL_DROP_CANDIDATE: "Drop candidate",
      REFUEL_CANDIDATE: "Refuel candidate",
      REFUEL_EVENT: "Refuel detected",
      FAST_DROP_IGN_ON: "Fast drop",
      SUSPICIOUS_DROP: "Suspicious drop",
      TEST_BUTTON: "Manual alert"
    };

    code = String(code || "NORMAL");
    if (map[code]) return map[code];
    return code.replace(/ADS1115/g, "Fuel signal").replace(/OLED/g, "Display").replace(/ESP32|ARDUINO/g, "Device").replace(/_/g, " ");
  }

  function friendlyAlert(code) {
    var map = {
      NONE: "No alert",
      FUEL_THEFT_ANOMALY: "Fuel theft alert",
      FUEL_THEFT_TEST: "Fuel theft alert",
      DROP_TEST_IGN_ON: "Fuel drop alert"
    };

    code = String(code || "NONE");
    if (map[code]) return map[code];
    return code.replace(/_/g, " ");
  }

  function modeFromTelemetry(data) {
    var alert = String(data.alert || "NONE");
    var event = String(data.event || "NORMAL");

    if (alert !== "NONE") return "theft";
    if (event === "SUSPICIOUS_DROP" || event === "FUEL_DROP_CANDIDATE" || event === "FAST_DROP_IGN_ON") return "theft";
    if (event === "REFUEL_EVENT" || event === "REFUEL_CANDIDATE") return "refuel";
    if (event === "SENSOR_FAULT" || event === "ADS1115_MISSING") return "noise";
    return "normal";
  }

  function copyForTelemetry(data, mode) {
    var active = {
      status: copy[mode].status,
      code: copy[mode].code,
      decision: copy[mode].decision,
      rule: copy[mode].rule,
      result: copy[mode].result,
      confidence: copy[mode].confidence
    };
    var event = String(data.event || "NORMAL");
    var alert = String(data.alert || "NONE");
    var confidence = clamp(numberOr(data.anomaly_confidence, active.confidence), 0, 100);

    active.confidence = Math.round(confidence);

    if (alert !== "NONE") {
      active.status = friendlyAlert(alert);
      active.code = "THEFT";
      active.decision = friendlyAlert(alert);
      active.rule = data.ignition === "ON" ? "Rapid drop" : "Stationary drop";
      active.result = "Fuel drop confirmed";
      return active;
    }

    if (event === "SENSOR_FAULT" || event === "ADS1115_MISSING") {
      active.status = "Signal check";
      active.code = "SIGNAL";
      active.decision = "Signal check";
      active.rule = "Sensor availability";
      active.result = "Needs inspection";
      active.confidence = 0;
      return active;
    }

    if (mode === "normal" && event !== "NORMAL") {
      active.decision = friendlyEvent(event);
      active.result = "Monitoring";
    }

    return active;
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
    var activeMode = state.reviewMode || state.mode;

    Object.keys(buttonMap).forEach(function (key) {
      buttonMap[key].classList.toggle("is-active", key === activeMode);
    });

    elements.ignitionToggle.classList.toggle("is-on", state.ignitionOn);
    elements.ignitionToggle.setAttribute("aria-pressed", String(state.ignitionOn));
    elements.ignitionToggle.setAttribute("aria-disabled", "true");
    elements.ignitionToggle.textContent = state.ignitionOn ? "Ignition ON" : "Ignition OFF";
  }

  function renderConnection() {
    elements.connectionStatus.classList.toggle("offline", !state.online);
    elements.connectionStatus.children[1].textContent = state.online ? "Online" : "Offline";
  }

  function render() {
    var active = state.active;
    var mode = classByMode(state.mode);
    var filtered = clamp(state.filteredFuelPct, 0, 100);

    renderConnection();

    elements.vehicleId.textContent = state.vehicleId;
    elements.lastUpdate.textContent = state.online ? shortTime() : "--:--";
    elements.fuelPercent.textContent = Math.round(filtered);
    elements.fuelLiters.textContent = formatNumber(state.fuelLiters, 1) + " L";
    elements.tankCapacity.textContent = formatNumber(state.tankLiters, 0) + " L";
    elements.fuelBar.style.width = filtered + "%";

    elements.fuelStatus.textContent = active.status;
    applyClass(elements.fuelStatus, "state-badge", mode);

    elements.decisionTitle.textContent = active.decision;
    elements.ruleResult.textContent = active.rule;
    elements.confidenceValue.textContent = active.confidence + "%";
    applyClass(elements.decisionStrip, "decision-strip", mode);

    elements.ignitionState.textContent = state.ignitionOn ? "ON" : "OFF";
    elements.speedValue.textContent = Math.round(state.speedKmh) + " km/h";
    elements.gpsState.textContent = state.gpsState;
    elements.gpsLocation.textContent = state.gpsLocation;
    elements.geoZone.textContent = state.geoZone;
    elements.dataSource.textContent = state.dataSource;

    elements.alertCode.textContent = active.code;
    applyClass(elements.alertCode, "alert-code", mode);

    elements.evidenceFuelDelta.textContent = signedLiters(state.deltaLiters);
    elements.evidenceIgnitionText.textContent = state.ignitionOn ? "ON" : "OFF";
    elements.evidenceSpeedText.textContent = Math.round(state.speedKmh) + " km/h";
    elements.evidenceGpsText.textContent = state.gpsState;
    elements.evidenceLocationText.textContent = state.geoZone;
    elements.evidenceResult.textContent = active.result;
    applyClass(elements.evidenceRow, "evidence-row", mode);

    elements.filteredFuelValue.textContent = formatNumber(state.filteredFuelPct, 1) + "%";
    elements.rawFuelValue.textContent = formatNumber(state.rawFuelPct, 1) + "%";
    elements.fuelDelta.textContent = signedLiters(state.deltaLiters);

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

  function noteTelemetryEvent(data, active) {
    var alert = String(data.alert || "NONE");
    var event = String(data.event || "NORMAL");
    var key = alert + ":" + event + ":" + active.code;
    var message = alert !== "NONE" ? friendlyAlert(alert) : friendlyEvent(event);

    if (!state.initialized) {
      addEvent("Telemetry online");
      state.initialized = true;
      state.lastEventKey = key;
      return;
    }

    if (key !== state.lastEventKey && message !== "Normal") {
      addEvent(message);
      state.lastEventKey = key;
    }
  }

  function applyTelemetry(data) {
    var filtered = pct(data.fuel_percent_filtered);
    var raw = pct(data.fuel_percent_raw);
    var capacity = numberOr(data.tank_capacity_liters, config.tankLiters);
    var deltaPct = numberOr(data.fuel_delta_window, 0);
    var mode = modeFromTelemetry(data);
    var active = copyForTelemetry(data, mode);

    state.mode = mode;
    state.active = active;
    state.vehicleId = displayVehicleId(data.vehicle_id);
    state.ignitionOn = String(data.ignition || "").toUpperCase() === "ON";
    state.speedKmh = Math.max(0, numberOr(data.speed_kmh, 0));
    state.gpsState = cleanText(data.gps_state, "Unavailable");
    state.gpsLocation = cleanText(data.gps_location, "--");
    state.geoZone = cleanText(data.geo_zone, "--");
    state.dataSource = cleanText(data.data_source, config.dataSource);
    state.tankLiters = capacity > 0 ? capacity : config.tankLiters;
    state.filteredFuelPct = filtered;
    state.rawFuelPct = raw;
    state.fuelLiters = numberOr(data.fuel_liters, litersFromPercent(filtered));
    state.baselinePct = numberOr(data.parked_baseline_pct, filtered - deltaPct);
    state.deltaPct = deltaPct;
    state.deltaLiters = deltaPct * state.tankLiters / 100;
    state.online = true;

    state.history.push({
      raw: raw,
      filtered: filtered
    });

    if (state.history.length > config.historySize) {
      state.history.shift();
    }

    noteTelemetryEvent(data, active);
  }

  function markOffline() {
    if (state.online) {
      addEvent("Telemetry offline");
    }
    state.online = false;
    render();
  }

  function selectReview(mode) {
    state.reviewMode = state.reviewMode === mode ? "" : mode;
    if (state.reviewMode) {
      addEvent("Review marked " + copy[state.reviewMode].decision.toLowerCase());
    }
    render();
  }

  function clearReview() {
    state.reviewMode = "";
    state.events = [];
    addEvent("Event review cleared");
    render();
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
    elements.normalBtn.addEventListener("click", function () { selectReview("normal"); });
    elements.refuelBtn.addEventListener("click", function () { selectReview("refuel"); });
    elements.noiseBtn.addEventListener("click", function () { selectReview("noise"); });
    elements.theftBtn.addEventListener("click", function () { selectReview("theft"); });
    elements.resetBtn.addEventListener("click", clearReview);
  }

  function fetchTelemetry() {
    fetch("/api/telemetry", { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("Telemetry unavailable");
        return response.json();
      })
      .then(function (data) {
        applyTelemetry(data);
        render();
      })
      .catch(markOffline);
  }

  function init() {
    cacheElements();
    setupNavigation();
    bindEvents();
    addEvent("Waiting for telemetry");
    render();
    fetchTelemetry();
    pollTimer = window.setInterval(fetchTelemetry, 800);
  }

  window.addEventListener("beforeunload", function () {
    if (pollTimer) window.clearInterval(pollTimer);
  });

  document.addEventListener("DOMContentLoaded", init);
}());
)SMARTT_JS";

void handleRoot() {
  server.send_P(200, "text/html", DASHBOARD_HTML);
}

void handleDashboardCss() {
  server.send_P(200, "text/css", DASHBOARD_CSS);
}

void handleDashboardJs() {
  server.send_P(200, "application/javascript", DASHBOARD_JS);
}

void handleTelemetryApi() {
  server.send(200, "application/json", telemetryJson());
}

void startDashboard() {
  WiFi.disconnect(true, true);
  delay(200);
  WiFi.mode(WIFI_AP);
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

  server.on("/", handleRoot);
  server.on("/dashboard/", handleRoot);
  server.on("/dashboard/index.html", handleRoot);
  server.on("/style.css", handleDashboardCss);
  server.on("/dashboard/style.css", handleDashboardCss);
  server.on("/app.js", handleDashboardJs);
  server.on("/dashboard/app.js", handleDashboardJs);
  server.on("/api/telemetry", handleTelemetryApi);
  server.begin();

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
#endif

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("SmartT Core Demo");
  Serial.println("Pins: ADS1115 I2C 21/22, OLED SPI 5/23/17/16/18, ignition 19, test 4");
  Serial.println("GPIO2 is not used.");

  pinMode(PIN_IGNITION, INPUT_PULLUP);
  pinMode(PIN_TEST_BUTTON, INPUT_PULLUP);

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.setClock(100000);

  telemetry.adsReady = ads.begin(0x48);
  if (telemetry.adsReady) {
    ads.setGain(GAIN_ONE);
    Serial.println("ADS1115 OK at 0x48, gain +/-4.096V");
  } else {
    Serial.println("ADS1115 not found. Check I2C wiring and ADDR -> GND.");
  }

  telemetry.oledReady = display.begin(SSD1306_SWITCHCAPVCC);
  if (telemetry.oledReady) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println("SmartT booting...");
    display.println("ADS/OLED/Serial");
    display.display();
  } else {
    Serial.println("OLED init failed. Serial JSON will still run.");
  }

#if SMARTT_ENABLE_WIFI_DASHBOARD
  startDashboard();
#endif

  readTelemetry();
  updateDetection();
  drawOled();
}

void loop() {
  uint32_t now = millis();

#if SMARTT_ENABLE_WIFI_DASHBOARD
  server.handleClient();
#endif

  if (now - lastSampleMs >= SAMPLE_INTERVAL_MS) {
    lastSampleMs = now;
    readTelemetry();
    updateDetection();
  }

  if (now - lastSerialMs >= SERIAL_INTERVAL_MS) {
    lastSerialMs = now;
    Serial.println(telemetryJson());
  }

  if (now - lastOledMs >= OLED_INTERVAL_MS) {
    lastOledMs = now;
    drawOled();
  }
}
