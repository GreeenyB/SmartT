#pragma once

#include <Arduino.h>
#include "Types.h"

class EventDetector {
public:
  void begin(DashboardState& state, uint32_t now);
  void update(DashboardState& state, uint32_t now);
  DetectorState state() const { return state_; }

private:
  DetectorState state_ = DETECTOR_BOOT;
  DetectorState previousState_ = DETECTOR_BOOT;
  bool lastIgnitionOn_ = false;
  uint32_t stateStartMs_ = 0;
  uint32_t ignitionChangedMs_ = 0;

  float parkedBaselinePct_ = 0.0f;
  bool parkedBaselineReady_ = false;
  float candidateStartFuelPct_ = 0.0f;
  float candidateReferenceFuelPct_ = 0.0f;
  float candidateDropPct_ = 0.0f;
  float candidateWorstDropPct_ = 0.0f;
  uint32_t candidateStartMs_ = 0;

  uint32_t alertHoldUntilMs_ = 0;
  uint8_t confidence_ = 0;
  uint32_t lastStableUpdateMs_ = 0;
  uint32_t testHoldUntilMs_ = 0;
  uint32_t testAlertHoldUntilMs_ = 0;
  bool lastTestPressed_ = false;

  FuelEvent eventLog_[EVENT_LOG_SIZE];
  uint8_t eventLogCount_ = 0;
  uint8_t eventLogNext_ = 0;
  String lastLoggedMessage_ = "";

  void setDetectorState(DetectorState nextState, uint32_t now);
  void setCurrentEvent(DashboardState& state, const char* code, const char* alert,
                       const char* ruleResult, float deltaPercent, uint8_t confidence,
                       uint32_t now);
  const char* eventMessage(const char* code, const char* alert) const;
  void maybeLogCurrentEvent(DashboardState& state);
  void logEvent(DashboardState& state, const FuelEvent& event);
  void syncEventLog(DashboardState& state);

  void updateTestButton(const DashboardState& state, uint32_t now);
  void updateIgnitionTransition(DashboardState& state, uint32_t now);
  void maybeUpdateStableBaseline(const DashboardState& state, uint32_t now, float fuel);
  void startRefuelCandidate(DashboardState& state, uint32_t now, float fuel);
  void updateRefuelCandidate(DashboardState& state, uint32_t now, float fuel);
  void updateFuelStateMachine(DashboardState& state, uint32_t now);
  void applyTestButtonOverride(DashboardState& state, uint32_t now);
  void exportDetectorToState(DashboardState& state);

  bool gpsAllowsParkedTheftDecision(DashboardState& state);
  bool signalLooksSloshy(const DashboardState& state) const;
  uint8_t computeTheftConfidence(DashboardState& state, float dropPct, float ratePctPerSec);
  uint8_t computeRefuelConfidence(const DashboardState& state, float risePct) const;
  uint8_t computeSloshingConfidence(const DashboardState& state) const;
};
