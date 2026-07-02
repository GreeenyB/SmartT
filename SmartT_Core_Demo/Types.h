#pragma once

#include <Arduino.h>
#include "Config.h"

enum DetectorState : uint8_t {
  DETECTOR_BOOT,
  DETECTOR_NORMAL_ON,
  DETECTOR_OFF_SETTLING,
  DETECTOR_PARKED_MONITORING,
  DETECTOR_SLOSHING,
  DETECTOR_DROP_CANDIDATE,
  DETECTOR_THEFT_ALERT,
  DETECTOR_REFUEL_CANDIDATE,
  DETECTOR_SENSOR_FAULT
};

struct FuelTelemetry {
  int16_t rawA0 = 0;
  int16_t rawA1 = 0;
  float voltsA0 = 0.0f;
  float voltsA1 = 0.0f;
  float percentA0 = 0.0f;
  float percentA1 = 0.0f;
  float rawPercent = 0.0f;
  float filteredPercent = 0.0f;
  float liters = 0.0f;
  float deltaPercent = 0.0f;
  float deltaLiters = 0.0f;
  float ratePercentPerSec = 0.0f;
  float rawRatePercentPerSec = 0.0f;
  float parkedBaselinePercent = 0.0f;
  float candidateDropPercent = 0.0f;
  float signalStability = 100.0f;
  float sloshingScore = 0.0f;
  bool filterReady = false;
};

struct GpsTelemetry {
  float lat = 0.0f;
  float lon = 0.0f;
  float speedKmh = 0.0f;
  uint8_t satellites = 0;
  bool fix = false;
  String timeText = "--";
  bool dataFresh = false;
  bool speedFresh = false;
  bool stationary = false;
  bool moving = false;
  bool usedInDecision = false;
  uint32_t locationAgeMs = 0;
  uint32_t speedAgeMs = 0;
  String state = "Acquiring";
  String motionState = "UNKNOWN";
  String decisionContext = "GPS_NOT_USED";
};

struct VehicleContext {
  bool ignitionOn = false;
  bool testPressed = false;
};

struct SensorHealth {
  bool adsReady = false;
  bool oledReady = false;
  bool healthy = true;
  String status = "BOOT";
};

struct FuelEvent {
  String code = "BOOT";
  String message = "System online";
  String alert = "NONE";
  String ruleResult = "Boot";
  float deltaPercent = 0.0f;
  float deltaLiters = 0.0f;
  float ratePercentPerSec = 0.0f;
  uint8_t confidence = 0;
  uint32_t timestampMs = 0;
};

struct DashboardState {
  String vehicleId = VEHICLE_ID;
  float tankCapacityLiters = TANK_CAPACITY_LITERS;
  FuelTelemetry fuel;
  GpsTelemetry gps;
  VehicleContext vehicle;
  SensorHealth sensor;
  DetectorState detectorState = DETECTOR_BOOT;
  String detectorStateText = "BOOT";
  FuelEvent currentEvent;
  FuelEvent recentEvents[EVENT_LOG_SIZE];
  uint8_t recentEventCount = 0;
};

float clampFloat(float value, float low, float high);
String detectorStateName(DetectorState state);
