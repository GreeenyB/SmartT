#include <cassert>
#include <iostream>

#include "EventDetector.h"

namespace {

DashboardState healthyState(bool ignitionOn) {
  DashboardState state;
  state.vehicle.ignitionOn = ignitionOn;
  state.sensor.adsReady = true;
  state.sensor.healthy = true;
  state.fuel.filterReady = true;
  state.fuel.rawPercent = 70.0f;
  state.fuel.filteredPercent = 70.0f;
  state.fuel.ratePercentPerSec = 0.0f;
  state.fuel.signalStability = 100.0f;
  state.fuel.sloshingScore = 0.0f;
  state.gps.speedFresh = false;
  return state;
}

void prepareParked(EventDetector& detector, DashboardState& state) {
  detector.begin(state, 0);
  detector.update(state, 3000);
  detector.update(state, 5750);
  assert(detector.state() == DETECTOR_PARKED_MONITORING);
}

void testIgnitionOnNeverStartsTheft() {
  DashboardState state = healthyState(true);
  EventDetector detector;
  detector.begin(state, 0);
  detector.update(state, 3000);
  state.fuel.filteredPercent = 60.0f;
  state.fuel.ratePercentPerSec = -2.0f;
  detector.update(state, 3250);
  detector.update(state, 6000);
  assert(detector.state() == DETECTOR_NORMAL_ON);
  assert(state.currentEvent.code == "FAST_DROP_IGN_ON");
  assert(state.currentEvent.alert == "NONE");
}

void testIgnitionTransitionCancelsCandidate() {
  DashboardState state = healthyState(false);
  EventDetector detector;
  prepareParked(detector, state);
  state.fuel.filteredPercent = 63.0f;
  state.fuel.ratePercentPerSec = -1.2f;
  detector.update(state, 6000);
  assert(detector.state() == DETECTOR_DROP_CANDIDATE);
  state.vehicle.ignitionOn = true;
  detector.update(state, 6250);
  detector.update(state, 9000);
  assert(detector.state() == DETECTOR_NORMAL_ON);
  assert(state.currentEvent.alert == "NONE");
}

void testConfirmedOffAlertKeepsExistingHold() {
  DashboardState state = healthyState(false);
  EventDetector detector;
  prepareParked(detector, state);
  state.fuel.filteredPercent = 62.0f;
  state.fuel.ratePercentPerSec = -1.2f;
  detector.update(state, 6000);
  state.fuel.ratePercentPerSec = 0.0f;
  detector.update(state, 8250);
  assert(detector.state() == DETECTOR_THEFT_ALERT);
  assert(state.currentEvent.alert == "FUEL_THEFT_ANOMALY");
  state.vehicle.ignitionOn = true;
  detector.update(state, 8500);
  assert(detector.state() == DETECTOR_THEFT_ALERT);
  assert(state.currentEvent.alert == "FUEL_THEFT_ANOMALY");
  detector.update(state, 16500);
  assert(detector.state() == DETECTOR_NORMAL_ON);
  assert(state.currentEvent.alert == "NONE");
}

void testSensorFaultCannotBeTheft() {
  DashboardState state = healthyState(false);
  EventDetector detector;
  prepareParked(detector, state);
  state.sensor.healthy = false;
  state.fuel.filteredPercent = 20.0f;
  state.fuel.ratePercentPerSec = -20.0f;
  detector.update(state, 6000);
  assert(detector.state() == DETECTOR_SENSOR_FAULT);
  assert(state.currentEvent.alert == "NONE");
}

void testFreshHighSpeedSuppressesBeforeMotionDebounce() {
  DashboardState state = healthyState(false);
  EventDetector detector;
  prepareParked(detector, state);
  state.gps.speedFresh = true;
  state.gps.speedKmh = 24.0f;
  state.gps.moving = false;
  state.fuel.filteredPercent = 61.0f;
  state.fuel.ratePercentPerSec = -1.5f;
  detector.update(state, 6000);
  detector.update(state, 9000);
  assert(detector.state() != DETECTOR_THEFT_ALERT);
  assert(state.currentEvent.alert == "NONE");
}

void testManualHoldNeverUsesNaturalTheftIdentity() {
  DashboardState state = healthyState(false);
  EventDetector detector;
  prepareParked(detector, state);
  state.vehicle.testPressed = true;
  detector.update(state, 6000);
  assert(state.currentEvent.alert == "FUEL_THEFT_TEST");
  state.vehicle.testPressed = false;
  detector.update(state, 6500);
  assert(state.currentEvent.alert == "FUEL_THEFT_TEST");
}

}  // namespace

int main() {
  testIgnitionOnNeverStartsTheft();
  testIgnitionTransitionCancelsCandidate();
  testConfirmedOffAlertKeepsExistingHold();
  testSensorFaultCannotBeTheft();
  testFreshHighSpeedSuppressesBeforeMotionDebounce();
  testManualHoldNeverUsesNaturalTheftIdentity();
  std::cout << "Firmware EventDetector host tests passed\n";
  return 0;
}
