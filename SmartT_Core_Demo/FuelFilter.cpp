#include "FuelFilter.h"

#include <math.h>

void FuelFilter::update(DashboardState& state, uint32_t now) {
  FuelTelemetry& fuel = state.fuel;

  if (!ready_) {
    reset(fuel.rawPercent, now);
    fuel.filteredPercent = filteredFuelPercent_;
    fuel.rawRatePercentPerSec = 0.0f;
    fuel.ratePercentPerSec = 0.0f;
    fuel.filterReady = true;
    fuel.liters = clampFloat(fuel.filteredPercent, 0.0f, 100.0f) *
                  state.tankCapacityLiters / 100.0f;
    updateStabilityMetrics(fuel);
    return;
  }

  float medianFuelPercent = medianFilteredFuel(fuel.rawPercent);
  float previousFiltered = filteredFuelPercent_;
  filteredFuelPercent_ += FUEL_EMA_ALPHA * (medianFuelPercent - filteredFuelPercent_);

  float rawRate = 0.0f;
  if (lastRateMs_ > 0 && now > lastRateMs_) {
    float dtSeconds = (float)(now - lastRateMs_) / 1000.0f;
    rawRate = (filteredFuelPercent_ - previousFiltered) / dtSeconds;
  }

  fuelRatePctPerSec_ += RATE_EMA_ALPHA * (rawRate - fuelRatePctPerSec_);
  lastRateMs_ = now;

  addStabilitySample(filteredFuelPercent_);

  fuel.filteredPercent = filteredFuelPercent_;
  fuel.rawRatePercentPerSec = rawRate;
  fuel.ratePercentPerSec = fuelRatePctPerSec_;
  fuel.filterReady = true;
  fuel.liters = clampFloat(fuel.filteredPercent, 0.0f, 100.0f) *
                state.tankCapacityLiters / 100.0f;
  updateStabilityMetrics(fuel);
}

void FuelFilter::reset(float seed, uint32_t now) {
  filteredFuelPercent_ = seed;
  fuelRatePctPerSec_ = 0.0f;
  lastRateMs_ = now;

  for (uint8_t i = 0; i < FUEL_MEDIAN_SIZE; i++) {
    medianBuffer_[i] = seed;
  }
  medianIndex_ = 0;
  medianCount_ = FUEL_MEDIAN_SIZE;

  for (uint8_t i = 0; i < FUEL_STABILITY_WINDOW_SIZE; i++) {
    stabilityWindow_[i] = seed;
  }
  stabilityIndex_ = 0;
  stabilityCount_ = FUEL_STABILITY_WINDOW_SIZE;
  ready_ = true;
}

float FuelFilter::medianFilteredFuel(float sample) {
  medianBuffer_[medianIndex_] = sample;
  medianIndex_ = (medianIndex_ + 1) % FUEL_MEDIAN_SIZE;
  if (medianCount_ < FUEL_MEDIAN_SIZE) {
    medianCount_++;
  }

  float sorted[FUEL_MEDIAN_SIZE];
  for (uint8_t i = 0; i < medianCount_; i++) {
    sorted[i] = medianBuffer_[i];
  }

  for (uint8_t i = 1; i < medianCount_; i++) {
    float key = sorted[i];
    int8_t j = i - 1;
    while (j >= 0 && sorted[j] > key) {
      sorted[j + 1] = sorted[j];
      j--;
    }
    sorted[j + 1] = key;
  }

  return sorted[medianCount_ / 2];
}

void FuelFilter::addStabilitySample(float sample) {
  stabilityWindow_[stabilityIndex_] = sample;
  stabilityIndex_ = (stabilityIndex_ + 1) % FUEL_STABILITY_WINDOW_SIZE;
  if (stabilityCount_ < FUEL_STABILITY_WINDOW_SIZE) {
    stabilityCount_++;
  }
}

float FuelFilter::stabilitySampleAt(uint8_t chronologicalIndex) const {
  if (stabilityCount_ < FUEL_STABILITY_WINDOW_SIZE) {
    return stabilityWindow_[chronologicalIndex];
  }

  return stabilityWindow_[(stabilityIndex_ + chronologicalIndex) % FUEL_STABILITY_WINDOW_SIZE];
}

void FuelFilter::updateStabilityMetrics(FuelTelemetry& fuel) const {
  if (stabilityCount_ < 2) {
    fuel.signalStability = 100.0f;
    fuel.sloshingScore = 0.0f;
    return;
  }

  float minValue = stabilitySampleAt(0);
  float maxValue = minValue;
  float firstValue = minValue;
  float previous = minValue;
  float totalAbsStep = 0.0f;
  int8_t previousDirection = 0;
  uint8_t directionChanges = 0;

  for (uint8_t i = 1; i < stabilityCount_; i++) {
    float value = stabilitySampleAt(i);
    if (value < minValue) {
      minValue = value;
    }
    if (value > maxValue) {
      maxValue = value;
    }

    float step = value - previous;
    float absStep = fabs(step);
    totalAbsStep += absStep;

    int8_t direction = 0;
    if (absStep > 0.05f) {
      direction = step > 0.0f ? 1 : -1;
    }

    if (direction != 0 && previousDirection != 0 && direction != previousDirection) {
      directionChanges++;
    }
    if (direction != 0) {
      previousDirection = direction;
    }

    previous = value;
  }

  float lastValue = stabilitySampleAt(stabilityCount_ - 1);
  float range = maxValue - minValue;
  float meanAbsStep = totalAbsStep / (float)(stabilityCount_ - 1);
  float sustainedChange = fabs(lastValue - firstValue);

  float instability = range * 6.0f + meanAbsStep * 10.0f + directionChanges * 4.0f;
  float oscillation = range * 8.0f + meanAbsStep * 14.0f +
                      directionChanges * 8.0f - sustainedChange * 6.0f;

  fuel.signalStability = 100.0f - clampFloat(instability, 0.0f, 100.0f);
  fuel.sloshingScore = clampFloat(oscillation, 0.0f, 100.0f);
}
