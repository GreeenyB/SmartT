#pragma once

#include <Arduino.h>
#include "Types.h"

class FuelFilter {
public:
  void update(DashboardState& state, uint32_t now);
  bool ready() const { return ready_; }

private:
  bool ready_ = false;
  float filteredFuelPercent_ = 0.0f;
  float fuelRatePctPerSec_ = 0.0f;
  uint32_t lastRateMs_ = 0;

  float medianBuffer_[FUEL_MEDIAN_SIZE] = {0.0f};
  uint8_t medianIndex_ = 0;
  uint8_t medianCount_ = 0;

  float stabilityWindow_[FUEL_STABILITY_WINDOW_SIZE] = {0.0f};
  uint8_t stabilityIndex_ = 0;
  uint8_t stabilityCount_ = 0;

  void reset(float seed, uint32_t now);
  float medianFilteredFuel(float sample);
  void addStabilitySample(float sample);
  float stabilitySampleAt(uint8_t chronologicalIndex) const;
  void updateStabilityMetrics(FuelTelemetry& fuel) const;
};
