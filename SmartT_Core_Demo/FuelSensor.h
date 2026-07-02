#pragma once

#include <Arduino.h>
#include <Adafruit_ADS1X15.h>
#include "Types.h"

class FuelSensor {
public:
  bool begin();
  void read(DashboardState& state);
  void updateHealth(DashboardState& state, uint32_t now);

private:
  Adafruit_ADS1115 ads_;
  uint32_t lastSensorChangeMs_ = 0;
  float lastSensorCheckFuelPct_ = 0.0f;

  float readAdsVoltage(uint8_t channel, int16_t& rawOut);
  float voltageToPercent(float volts, float emptyVolts, float fullVolts) const;
  float voltageToPercentUnclamped(float volts, float emptyVolts, float fullVolts) const;
  float selectedFuelPercentUnclamped(const FuelTelemetry& fuel) const;
};
