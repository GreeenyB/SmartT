#include "FuelSensor.h"

#include <math.h>

bool FuelSensor::begin() {
  bool ready = ads_.begin(ADS1115_ADDRESS);
  if (ready) {
    ads_.setGain(GAIN_ONE);
  }
  return ready;
}

void FuelSensor::read(DashboardState& state) {
  FuelTelemetry& fuel = state.fuel;

  if (state.sensor.adsReady) {
    fuel.voltsA0 = readAdsVoltage(0, fuel.rawA0);
    fuel.voltsA1 = readAdsVoltage(1, fuel.rawA1);

    fuel.percentA0 = voltageToPercent(fuel.voltsA0, FUEL_A0_EMPTY_V, FUEL_A0_FULL_V);
    fuel.percentA1 = voltageToPercent(fuel.voltsA1, FUEL_A1_EMPTY_V, FUEL_A1_FULL_V);
  } else {
    fuel.rawA0 = 0;
    fuel.rawA1 = 0;
    fuel.voltsA0 = 0.0f;
    fuel.voltsA1 = 0.0f;
    fuel.percentA0 = 0.0f;
    fuel.percentA1 = 0.0f;
  }

#if SMARTT_USE_A1_BACKUP_AS_MAIN_FUEL
  fuel.rawPercent = fuel.percentA1;
#else
  fuel.rawPercent = fuel.percentA0;
#endif

  fuel.liters = clampFloat(fuel.filteredPercent, 0.0f, 100.0f) *
                state.tankCapacityLiters / 100.0f;
}

void FuelSensor::updateHealth(DashboardState& state, uint32_t now) {
  FuelTelemetry& fuel = state.fuel;
  SensorHealth& sensor = state.sensor;

  if (!sensor.adsReady) {
    sensor.healthy = false;
    sensor.status = "ADS_MISSING";
    return;
  }

  float fuelPctUnclamped = selectedFuelPercentUnclamped(fuel);
  if (fuelPctUnclamped < SENSOR_VALID_LOW_MARGIN_PCT ||
      fuelPctUnclamped > SENSOR_VALID_HIGH_MARGIN_PCT) {
    sensor.healthy = false;
    sensor.status = "OUT_OF_RANGE";
    return;
  }

  if (lastSensorChangeMs_ == 0) {
    lastSensorCheckFuelPct_ = fuel.rawPercent;
    lastSensorChangeMs_ = now;
  }

  if (fabs(fuel.rawPercent - lastSensorCheckFuelPct_) > SENSOR_STUCK_EPS_PCT) {
    lastSensorCheckFuelPct_ = fuel.rawPercent;
    lastSensorChangeMs_ = now;
    sensor.healthy = true;
    sensor.status = "OK";
    return;
  }

  // A long flat reading is valid for a parked fuel tank; report it without faulting.
  if (now - lastSensorChangeMs_ > SENSOR_STUCK_MS) {
    sensor.healthy = true;
    sensor.status = "STABLE_SIGNAL";
    return;
  }

  sensor.healthy = true;
  sensor.status = "OK";
}

float FuelSensor::readAdsVoltage(uint8_t channel, int16_t& rawOut) {
  int32_t rawTotal = 0;
  float voltTotal = 0.0f;

  for (uint8_t i = 0; i < ADS1115_SAMPLE_COUNT; i++) {
    int16_t raw = ads_.readADC_SingleEnded(channel);
    rawTotal += raw;
    voltTotal += ads_.computeVolts(raw);
    delay(2);
  }

  rawOut = (int16_t)(rawTotal / ADS1115_SAMPLE_COUNT);
  return voltTotal / ADS1115_SAMPLE_COUNT;
}

float FuelSensor::voltageToPercent(float volts, float emptyVolts, float fullVolts) const {
  return clampFloat(voltageToPercentUnclamped(volts, emptyVolts, fullVolts), 0.0f, 100.0f);
}

float FuelSensor::voltageToPercentUnclamped(float volts, float emptyVolts, float fullVolts) const {
  float span = fullVolts - emptyVolts;
  if (fabs(span) < 0.001f) {
    return 0.0f;
  }

  return ((volts - emptyVolts) * 100.0f) / span;
}

float FuelSensor::selectedFuelPercentUnclamped(const FuelTelemetry& fuel) const {
#if SMARTT_USE_A1_BACKUP_AS_MAIN_FUEL
  return voltageToPercentUnclamped(fuel.voltsA1, FUEL_A1_EMPTY_V, FUEL_A1_FULL_V);
#else
  return voltageToPercentUnclamped(fuel.voltsA0, FUEL_A0_EMPTY_V, FUEL_A0_FULL_V);
#endif
}
