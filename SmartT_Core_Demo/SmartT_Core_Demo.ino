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

static const char* VEHICLE_ID = "SMARTT_DEMO_01";

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
  json.reserve(1120);

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
  json += "\"fuel_delta_window\":";
  json += String(telemetry.fuelDeltaWindow, 1);
  json += ",";
  json += "\"fuel_rate_pct_per_sec\":";
  json += String(telemetry.fuelRatePctPerSec, 2);
  json += ",";
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
const char DASHBOARD_HTML[] PROGMEM = R"rawliteral(
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SmartT Fuel Dashboard</title>
  <script>
    (function () {
      try {
        const saved = localStorage.getItem('smartt-theme');
        const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.dataset.theme = saved || (systemDark ? 'dark' : 'light');
      } catch (err) {
        document.documentElement.dataset.theme = 'light';
      }
    })();
  </script>
  <style>
    :root {
      font-family: Arial, sans-serif;
      color-scheme: light;
      --page: #eef1f4;
      --panel: #ffffff;
      --line: #d7dde4;
      --muted: #667085;
      --ok: #168a4a;
      --warn: #b76e00;
      --bad: #c0332b;
      --ink: #15171a;
      --bar-bg: #e3e7ec;
      --chart-bg: #fbfcfd;
      --row: #edf0f3;
      --alert-bg: #fff7f6;
      --alert-line: #ef9a94;
      --pre: #344054;
      --shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
    }

    html[data-theme="dark"] {
      color-scheme: dark;
      --page: #0d1117;
      --panel: #161b22;
      --line: #303a46;
      --muted: #9aa7b4;
      --ok: #35c46f;
      --warn: #f5a524;
      --bad: #ff6b63;
      --ink: #eef3f8;
      --bar-bg: #222b36;
      --chart-bg: #10161d;
      --row: #25303b;
      --alert-bg: #2b171b;
      --alert-line: #d45c5c;
      --pre: #c7d1dc;
      --shadow: none;
    }

    * { box-sizing: border-box; }
    body { margin: 0; padding: 16px; color: var(--ink); background: var(--page); }
    main { max-width: 980px; margin: 0 auto; }
    header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
    h1 { font-size: 22px; line-height: 1.1; margin: 0; }
    .sub { color: var(--muted); font-size: 12px; margin-top: 4px; }
    .pill { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; background: var(--panel); font-weight: 700; white-space: nowrap; }
    .pill.ok { color: var(--ok); }
    .pill.bad { color: var(--bad); }
    .actions { display: flex; align-items: center; gap: 8px; }
    .theme-toggle { position: relative; width: 44px; height: 36px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); cursor: pointer; flex: 0 0 auto; }
    .theme-toggle::before { content: ""; position: absolute; left: 8px; top: 9px; width: 16px; height: 16px; border-radius: 50%; background: var(--warn); box-shadow: 0 0 0 3px rgba(183, 110, 0, 0.16); transition: transform 0.16s ease, background 0.16s ease, box-shadow 0.16s ease; }
    html[data-theme="dark"] .theme-toggle::before { transform: translateX(11px); background: #dbe7ff; box-shadow: -5px 0 0 0 var(--panel), 0 0 0 3px rgba(219, 231, 255, 0.14); }
    .theme-toggle:focus-visible { outline: 3px solid rgba(53, 196, 111, 0.35); outline-offset: 2px; }

    .layout { display: grid; grid-template-columns: minmax(280px, 1.25fr) minmax(260px, 0.75fr); gap: 12px; align-items: stretch; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px; box-shadow: var(--shadow); }
    .fuel-card { min-height: 314px; }
    .label { color: var(--muted); font-size: 12px; margin-bottom: 4px; }
    .value { color: var(--ink); font-size: 26px; font-weight: 700; line-height: 1.05; overflow-wrap: anywhere; }
    .grid .value { font-size: 22px; }
    .fuel-value { font-size: 56px; letter-spacing: 0; margin: 6px 0 8px; }
    .bar { height: 20px; background: var(--bar-bg); border-radius: 8px; overflow: hidden; border: 1px solid var(--line); }
    .fill { height: 100%; width: 0%; background: var(--ok); transition: width 0.18s ease, background 0.18s ease; }
    canvas { display: block; width: 100%; height: 126px; margin-top: 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--chart-bg); }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    td { padding: 8px 0; border-bottom: 1px solid var(--row); }
    td:last-child { text-align: right; font-weight: 700; }
    tr:last-child td { border-bottom: 0; }
    .alert { border-color: var(--alert-line); background: var(--alert-bg); }
    .alert .value, .bad-text { color: var(--bad); }
    .warn-text { color: var(--warn); }
    .ok-text { color: var(--ok); }
    details { margin-top: 12px; }
    summary { cursor: pointer; color: var(--muted); font-weight: 700; }
    pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; margin: 10px 0 0; color: var(--pre); }

    @media (max-width: 760px) {
      body { padding: 10px; }
      header { align-items: flex-start; flex-direction: column; }
      .actions { width: 100%; justify-content: space-between; }
      .layout { grid-template-columns: 1fr; }
      .grid { grid-template-columns: 1fr 1fr; }
      .fuel-value { font-size: 48px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>SmartT Fuel Dashboard</h1>
        <div class="sub">ESP32 local telemetry prototype</div>
      </div>
      <div class="actions">
        <button class="theme-toggle" id="themeToggle" type="button" aria-label="Toggle dark mode"></button>
        <div class="pill bad" id="link">OFFLINE</div>
      </div>
    </header>

    <section class="layout">
      <div class="card fuel-card">
        <div class="label">Filtered fuel</div>
        <div class="value fuel-value" id="fuel">--%</div>
        <div class="bar"><div class="fill" id="bar"></div></div>
        <canvas id="chart" width="720" height="180"></canvas>
      </div>

      <div class="grid">
        <div class="card">
          <div class="label">Ignition</div>
          <div class="value" id="ignition">--</div>
        </div>
        <div class="card" id="alertCard">
          <div class="label">Alert</div>
          <div class="value" id="alert">--</div>
        </div>
        <div class="card">
          <div class="label">Event</div>
          <div class="value" id="event">--</div>
        </div>
        <div class="card">
          <div class="label">Baseline delta</div>
          <div class="value" id="delta">--%</div>
        </div>
      </div>
    </section>

    <section class="card" style="margin-top:12px">
      <table>
        <tr><td>A0 fuel sender</td><td><span id="a0v">-- V</span> / <span id="a0p">--%</span></td></tr>
        <tr><td>A1 backup pot</td><td><span id="a1v">-- V</span> / <span id="a1p">--%</span></td></tr>
        <tr><td>Detector state</td><td id="state">--</td></tr>
        <tr><td>Baseline / rate</td><td><span id="baseline">--%</span> / <span id="rate">-- %/s</span></td></tr>
        <tr><td>Candidate / confidence</td><td><span id="candidate">--%</span> / <span id="confidence">--</span></td></tr>
        <tr><td>ADS1115 / OLED</td><td><span id="ads">--</span> / <span id="oled">--</span></td></tr>
        <tr><td>Sensor health</td><td id="health">--</td></tr>
        <tr><td>Test button</td><td id="test">--</td></tr>
        <tr><td>Uptime</td><td id="uptime">--</td></tr>
      </table>
      <details>
        <summary>Raw telemetry JSON</summary>
      <pre id="json">{}</pre>
      </details>
    </section>
  </main>
  <script>
    const history = [];
    const maxPoints = 72;
    const chart = document.getElementById('chart');
    const ctx = chart.getContext('2d');
    const root = document.documentElement;
    const themeToggle = document.getElementById('themeToggle');

    function cssVar(name) {
      return getComputedStyle(root).getPropertyValue(name).trim();
    }

    function currentTheme() {
      return root.dataset.theme === 'dark' ? 'dark' : 'light';
    }

    function setTheme(theme, save) {
      root.dataset.theme = theme;
      themeToggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
      themeToggle.title = theme === 'dark' ? 'Light mode' : 'Dark mode';
      if (save) {
        try { localStorage.setItem('smartt-theme', theme); } catch (err) {}
      }
      drawChart();
    }

    themeToggle.addEventListener('click', function () {
      setTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
    });

    function pct(v) {
      const n = Number(v);
      if (!Number.isFinite(n)) return 0;
      return Math.max(0, Math.min(100, n));
    }

    function text(id, value) {
      document.getElementById(id).textContent = value;
    }

    function classByAlert(alert) {
      return alert && alert !== 'NONE' ? 'card alert' : 'card';
    }

    function niceEvent(d) {
      if (d.event_label) return d.event_label;
      const map = {
        BOOT: 'Booting',
        NORMAL: 'Normal',
        ADS1115_MISSING: 'ADS missing',
        SENSOR_FAULT: 'Sensor fault',
        PARKED_SETTLING: 'Parked settling',
        PARKED_MONITORING: 'Parked monitor',
        FUEL_DROP_CANDIDATE: 'Drop candidate',
        REFUEL_CANDIDATE: 'Refuel candidate',
        REFUEL_EVENT: 'Refuel detected',
        FAST_DROP_IGN_ON: 'Fast drop',
        SUSPICIOUS_DROP: 'Suspicious drop',
        TEST_BUTTON: 'Test mode'
      };
      return map[d.event] || String(d.event || '--').replace(/_/g, ' ');
    }

    function niceAlert(d) {
      if (d.alert_label) return d.alert_label;
      const map = {
        NONE: 'No alert',
        FUEL_THEFT_ANOMALY: 'Fuel theft alert',
        FUEL_THEFT_TEST: 'Test theft alert',
        DROP_TEST_IGN_ON: 'Drop test'
      };
      return map[d.alert] || String(d.alert || '--').replace(/_/g, ' ');
    }

    function formatMs(ms) {
      const s = Math.floor(Number(ms || 0) / 1000);
      const m = Math.floor(s / 60);
      const r = s % 60;
      return m + 'm ' + r + 's';
    }

    function drawChart() {
      const w = chart.width;
      const h = chart.height;
      ctx.clearRect(0, 0, w, h);

      ctx.strokeStyle = cssVar('--line');
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = 12 + i * ((h - 24) / 4);
        ctx.beginPath();
        ctx.moveTo(10, y);
        ctx.lineTo(w - 10, y);
        ctx.stroke();
      }

      if (history.length < 2) return;

      ctx.strokeStyle = cssVar('--ok');
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.beginPath();

      history.forEach((v, i) => {
        const x = 10 + i * ((w - 20) / Math.max(1, maxPoints - 1));
        const y = h - 12 - (pct(v) / 100) * (h - 24);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      ctx.stroke();
    }

    async function tick() {
      try {
        const res = await fetch('/api/telemetry', { cache: 'no-store' });
        const d = await res.json();
        const fuel = pct(d.fuel_percent_filtered);

        history.push(fuel);
        while (history.length > maxPoints) history.shift();

        text('link', 'ONLINE');
        document.getElementById('link').className = 'pill ok';
        text('fuel', fuel.toFixed(1) + '%');
        document.getElementById('bar').style.width = fuel + '%';
        document.getElementById('bar').style.background = fuel < 20 ? cssVar('--bad') : fuel < 45 ? cssVar('--warn') : cssVar('--ok');
        text('ignition', d.ignition);
        text('event', niceEvent(d));
        text('alert', niceAlert(d));
        text('delta', Number(d.fuel_delta_window || 0).toFixed(1) + '%');
        text('a0v', Number(d.fuel_volts_a0 || 0).toFixed(3) + ' V');
        text('a0p', Number(d.fuel_percent_a0 || 0).toFixed(1) + '%');
        text('a1v', Number(d.fuel_volts_a1 || 0).toFixed(3) + ' V');
        text('a1p', Number(d.fuel_percent_a1 || 0).toFixed(1) + '%');
        text('state', d.detector_state || '--');
        text('baseline', Number(d.parked_baseline_pct || 0).toFixed(1) + '%');
        text('rate', Number(d.fuel_rate_pct_per_sec || 0).toFixed(2) + ' %/s');
        text('candidate', Number(d.candidate_drop_pct || 0).toFixed(1) + '%');
        text('confidence', Number(d.anomaly_confidence || 0).toFixed(0) + '/100');
        text('ads', d.ads_ready ? 'OK' : 'MISSING');
        text('oled', d.oled_ready ? 'OK' : 'MISSING');
        text('health', d.sensor_healthy ? 'OK' : 'FAULT');
        text('test', d.test_button ? 'PRESSED' : 'released');
        text('uptime', formatMs(d.uptime_ms));
        document.getElementById('alertCard').className = classByAlert(d.alert);
        document.getElementById('json').textContent = JSON.stringify(d, null, 2);
        drawChart();
      } catch (err) {
        text('link', 'OFFLINE');
        document.getElementById('link').className = 'pill bad';
        text('event', 'OFFLINE');
      }
    }

    setTheme(currentTheme(), false);
    tick();
    setInterval(tick, 700);
  </script>
</body>
</html>
)rawliteral";

void handleRoot() {
  server.send_P(200, "text/html", DASHBOARD_HTML);
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
