#include "EventDetector.h"

#include <math.h>
#include <string.h>

float clampFloat(float value, float low, float high) {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

String detectorStateName(DetectorState state) {
  switch (state) {
    case DETECTOR_BOOT: return "BOOT";
    case DETECTOR_NORMAL_ON: return "NORMAL_ON";
    case DETECTOR_OFF_SETTLING: return "OFF_SETTLING";
    case DETECTOR_PARKED_MONITORING: return "PARKED_MONITORING";
    case DETECTOR_SLOSHING: return "SLOSHING";
    case DETECTOR_DROP_CANDIDATE: return "DROP_CANDIDATE";
    case DETECTOR_THEFT_ALERT: return "THEFT_ALERT";
    case DETECTOR_REFUEL_CANDIDATE: return "REFUEL_CANDIDATE";
    case DETECTOR_SENSOR_FAULT: return "SENSOR_FAULT";
  }
  return "UNKNOWN";
}

void EventDetector::begin(DashboardState& state, uint32_t now) {
  state_ = DETECTOR_BOOT;
  previousState_ = DETECTOR_BOOT;
  stateStartMs_ = now;
  ignitionChangedMs_ = now;
  parkedBaselinePct_ = state.fuel.filteredPercent;
  lastStableUpdateMs_ = now;
  confidence_ = 0;
  setCurrentEvent(state, "BOOT", "NONE", "Boot", 0.0f, 0, now);
  maybeLogCurrentEvent(state);
  exportDetectorToState(state);
}

void EventDetector::update(DashboardState& state, uint32_t now) {
  if (now < STARTUP_DETECTION_IGNORE_MS || !state.fuel.filterReady) {
    state.sensor.healthy = state.sensor.adsReady;
    state.sensor.status = state.sensor.adsReady ? "WARMING_UP" : "ADS_MISSING";
    confidence_ = 0;
    setCurrentEvent(state, "WARMING_UP", "NONE", "Warm-up", 0.0f, 0, now);
    exportDetectorToState(state);
    return;
  }

  updateTestButton(state, now);

  confidence_ = 0;
  setCurrentEvent(state, "NORMAL", "NONE", "Stable trend", 0.0f, 0, now);

  if (!state.sensor.adsReady) {
    state.sensor.healthy = false;
    confidence_ = 0;
    setDetectorState(DETECTOR_SENSOR_FAULT, now);
    setCurrentEvent(state, "ADS1115_MISSING", "NONE", "Sensor availability", 0.0f, 0, now);
    exportDetectorToState(state);
    maybeLogCurrentEvent(state);
    return;
  }

  if (!state.sensor.healthy) {
    confidence_ = 0;
    setDetectorState(DETECTOR_SENSOR_FAULT, now);
    setCurrentEvent(state, "SENSOR_FAULT", "NONE", "Sensor range check", 0.0f, 0, now);
    exportDetectorToState(state);
    maybeLogCurrentEvent(state);
    return;
  }

  updateIgnitionTransition(state, now);
  updateFuelStateMachine(state, now);
  exportDetectorToState(state);
  applyTestButtonOverride(state, now);
  maybeLogCurrentEvent(state);
}

void EventDetector::setDetectorState(DetectorState nextState, uint32_t now) {
  if (state_ == nextState) {
    return;
  }

  previousState_ = state_;
  state_ = nextState;
  stateStartMs_ = now;
}

void EventDetector::setCurrentEvent(DashboardState& state, const char* code, const char* alert,
                                    const char* ruleResult, float deltaPercent,
                                    uint8_t confidence, uint32_t now) {
  state.currentEvent.code = code;
  state.currentEvent.alert = alert;
  state.currentEvent.ruleResult = ruleResult;
  state.currentEvent.message = eventMessage(code, alert);
  state.currentEvent.deltaPercent = deltaPercent;
  state.currentEvent.deltaLiters = deltaPercent * state.tankCapacityLiters / 100.0f;
  state.currentEvent.ratePercentPerSec = state.fuel.ratePercentPerSec;
  state.currentEvent.confidence = confidence;
  state.currentEvent.timestampMs = now;
}

const char* EventDetector::eventMessage(const char* code, const char* alert) const {
  if (strcmp(alert, "FUEL_THEFT_ANOMALY") == 0 ||
      strcmp(alert, "FUEL_THEFT_TEST") == 0 ||
      strcmp(code, "SUSPICIOUS_DROP") == 0) {
    return "Theft suspected";
  }
  if (strcmp(code, "BOOT") == 0) return "System online";
  if (strcmp(code, "REFUEL_EVENT") == 0) return "Refuel detected";
  if (strcmp(code, "SLOSHING_DETECTED") == 0) return "Sloshing detected";
  if (strcmp(code, "FUEL_DROP_CANDIDATE") == 0) return "Stationary fuel drop";
  if (strcmp(code, "NORMAL") == 0 || strcmp(code, "PARKED_MONITORING") == 0) return "Fuel stable";
  if (strcmp(code, "ADS1115_MISSING") == 0 || strcmp(code, "SENSOR_FAULT") == 0) return "Signal check";
  return code;
}

void EventDetector::maybeLogCurrentEvent(DashboardState& state) {
  const String& code = state.currentEvent.code;
  if (code == "WARMING_UP" || code == "PARKED_SETTLING" ||
      code == "REFUEL_CANDIDATE" || code == "FAST_DROP_IGN_ON" ||
      code == "FUEL_DROP_WHILE_MOVING" || code == "GPS_MOVING_IGN_OFF") {
    return;
  }

  const String& message = state.currentEvent.message;
  if (message.length() == 0) {
    return;
  }

  if (message == lastLoggedMessage_) {
    return;
  }

  logEvent(state, state.currentEvent);
  lastLoggedMessage_ = message;
}

void EventDetector::logEvent(DashboardState& state, const FuelEvent& event) {
  eventLog_[eventLogNext_] = event;
  eventLogNext_ = (eventLogNext_ + 1) % EVENT_LOG_SIZE;
  if (eventLogCount_ < EVENT_LOG_SIZE) {
    eventLogCount_++;
  }
  syncEventLog(state);
}

void EventDetector::syncEventLog(DashboardState& state) {
  state.recentEventCount = eventLogCount_;
  for (uint8_t i = 0; i < eventLogCount_; i++) {
    uint8_t index = (eventLogNext_ + EVENT_LOG_SIZE - 1 - i) % EVENT_LOG_SIZE;
    state.recentEvents[i] = eventLog_[index];
  }
}

void EventDetector::updateTestButton(const DashboardState& state, uint32_t now) {
  if (state.vehicle.testPressed && !lastTestPressed_) {
    testHoldUntilMs_ = now + TEST_HOLD_MS;
    if (!state.vehicle.ignitionOn) {
      testAlertHoldUntilMs_ = now + THEFT_ALERT_HOLD_MS;
    }
  }
  lastTestPressed_ = state.vehicle.testPressed;
}

void EventDetector::updateIgnitionTransition(DashboardState& state, uint32_t now) {
  if (state_ == DETECTOR_BOOT || state_ == DETECTOR_SENSOR_FAULT) {
    lastIgnitionOn_ = state.vehicle.ignitionOn;
    ignitionChangedMs_ = now;
    parkedBaselinePct_ = state.fuel.filteredPercent;
    lastStableUpdateMs_ = now;
    candidateStartMs_ = 0;
    candidateDropPct_ = 0.0f;
    candidateWorstDropPct_ = 0.0f;
    confidence_ = 0;

    if (state.vehicle.ignitionOn) {
      parkedBaselineReady_ = false;
      setDetectorState(DETECTOR_NORMAL_ON, now);
    } else {
      parkedBaselineReady_ = false;
      setDetectorState(DETECTOR_OFF_SETTLING, now);
    }
    return;
  }

  if (state.vehicle.ignitionOn != lastIgnitionOn_) {
    lastIgnitionOn_ = state.vehicle.ignitionOn;
    ignitionChangedMs_ = now;
    parkedBaselineReady_ = false;
    candidateStartMs_ = 0;
    candidateDropPct_ = 0.0f;
    candidateWorstDropPct_ = 0.0f;
    confidence_ = 0;

    if (state.vehicle.ignitionOn) {
      testAlertHoldUntilMs_ = 0;
      setDetectorState(DETECTOR_NORMAL_ON, now);
    } else {
      setDetectorState(DETECTOR_OFF_SETTLING, now);
    }
  }
}

void EventDetector::maybeUpdateStableBaseline(const DashboardState& state, uint32_t now, float fuel) {
  if (state.vehicle.ignitionOn || !parkedBaselineReady_) {
    return;
  }

  if (fabs(state.fuel.ratePercentPerSec) > BASELINE_STABLE_RATE_ABS_PCT_PER_SEC) {
    return;
  }

  if (state.fuel.signalStability < SIGNAL_STABILITY_MIN_STABLE) {
    return;
  }

  if (fabs(fuel - parkedBaselinePct_) > BASELINE_MAX_DRIFT_UPDATE_PCT) {
    return;
  }

  if (now - lastStableUpdateMs_ >= BASELINE_STABLE_UPDATE_MS) {
    parkedBaselinePct_ = fuel;
    lastStableUpdateMs_ = now;
  }
}

void EventDetector::startRefuelCandidate(DashboardState& state, uint32_t now, float fuel) {
  candidateStartMs_ = now;
  candidateStartFuelPct_ = fuel;
  candidateReferenceFuelPct_ = parkedBaselinePct_;
  candidateDropPct_ = 0.0f;
  candidateWorstDropPct_ = 0.0f;
  confidence_ = computeRefuelConfidence(state, fuel - candidateReferenceFuelPct_);
  setDetectorState(DETECTOR_REFUEL_CANDIDATE, now);
}

void EventDetector::updateRefuelCandidate(DashboardState& state, uint32_t now, float fuel) {
  float rise = fuel - candidateReferenceFuelPct_;
  confidence_ = computeRefuelConfidence(state, rise);
  setCurrentEvent(state, "REFUEL_CANDIDATE", "NONE", "Rise confirming", rise, confidence_, now);

  if (rise < REFUEL_MIN_RISE_PCT - THEFT_CANCEL_RECOVERY_PCT) {
    candidateStartMs_ = 0;
    confidence_ = 0;
    setDetectorState(state.vehicle.ignitionOn ? DETECTOR_NORMAL_ON : DETECTOR_PARKED_MONITORING, now);
    return;
  }

  bool elapsed = now - candidateStartMs_ >= REFUEL_CONFIRM_MS;
  bool stabilized = fabs(state.fuel.ratePercentPerSec) <= REFUEL_STABILIZE_RATE_ABS_PCT_PER_SEC ||
                    state.fuel.signalStability >= SIGNAL_STABILITY_MIN_STABLE ||
                    rise >= REFUEL_MIN_RISE_PCT * 1.5f;

  if (elapsed && stabilized) {
    confidence_ = computeRefuelConfidence(state, rise);
    parkedBaselinePct_ = fuel;
    parkedBaselineReady_ = !state.vehicle.ignitionOn;
    candidateDropPct_ = 0.0f;
    candidateWorstDropPct_ = 0.0f;
    candidateStartMs_ = 0;
    lastStableUpdateMs_ = now;
    setCurrentEvent(state, "REFUEL_EVENT", "NONE", "Rise confirmed", rise, confidence_, now);
    setDetectorState(state.vehicle.ignitionOn ? DETECTOR_NORMAL_ON : DETECTOR_PARKED_MONITORING, now);
  }
}

void EventDetector::updateFuelStateMachine(DashboardState& state, uint32_t now) {
  float fuel = state.fuel.filteredPercent;
  state.fuel.deltaPercent = fuel - parkedBaselinePct_;
  state.fuel.deltaLiters = state.fuel.deltaPercent * state.tankCapacityLiters / 100.0f;

  if (state_ == DETECTOR_REFUEL_CANDIDATE) {
    updateRefuelCandidate(state, now, fuel);
    return;
  }

  if (state.vehicle.ignitionOn) {
    parkedBaselineReady_ = false;
    candidateStartMs_ = 0;
    candidateDropPct_ = 0.0f;
    candidateWorstDropPct_ = 0.0f;
    confidence_ = 0;

    if (fuel - parkedBaselinePct_ >= REFUEL_MIN_RISE_PCT) {
      startRefuelCandidate(state, now, fuel);
      setCurrentEvent(state, "REFUEL_CANDIDATE", "NONE", "Rise confirming",
                      fuel - parkedBaselinePct_, confidence_, now);
      return;
    }

    if (signalLooksSloshy(state)) {
      confidence_ = computeSloshingConfidence(state);
      setDetectorState(DETECTOR_SLOSHING, now);
      setCurrentEvent(state, "SLOSHING_DETECTED", "NONE", "Signal unstable",
                      state.fuel.deltaPercent, confidence_, now);
      return;
    }

    setDetectorState(DETECTOR_NORMAL_ON, now);
    if (state.fuel.ratePercentPerSec <= THEFT_MIN_RATE_PCT_PER_SEC) {
      setCurrentEvent(state, "FAST_DROP_IGN_ON", "NONE", "Rapid drop while on",
                      state.fuel.deltaPercent, 0, now);
    } else {
      setCurrentEvent(state, "NORMAL", "NONE", "Stable trend", state.fuel.deltaPercent, 0, now);
    }
    return;
  }

  switch (state_) {
    case DETECTOR_OFF_SETTLING:
      setCurrentEvent(state, "PARKED_SETTLING", "NONE", "Ignition off settling",
                      state.fuel.deltaPercent, 0, now);
      if (now - stateStartMs_ >= IGNITION_OFF_SETTLE_MS) {
        parkedBaselinePct_ = fuel;
        parkedBaselineReady_ = true;
        lastStableUpdateMs_ = now;
        setDetectorState(DETECTOR_PARKED_MONITORING, now);
        setCurrentEvent(state, "PARKED_MONITORING", "NONE", "Parked baseline ready",
                        0.0f, 0, now);
      }
      break;

    case DETECTOR_SLOSHING:
      if (state.fuel.sloshingScore <= SLOSHING_SCORE_CLEAR) {
        setDetectorState(DETECTOR_PARKED_MONITORING, now);
        setCurrentEvent(state, "PARKED_MONITORING", "NONE", "Signal settled",
                        state.fuel.deltaPercent, 0, now);
      } else {
        confidence_ = computeSloshingConfidence(state);
        setCurrentEvent(state, "SLOSHING_DETECTED", "NONE", "Signal unstable",
                        state.fuel.deltaPercent, confidence_, now);
      }
      break;

    case DETECTOR_PARKED_MONITORING: {
      setCurrentEvent(state, "PARKED_MONITORING", "NONE", "Parked monitor",
                      state.fuel.deltaPercent, 0, now);
      float drop = parkedBaselinePct_ - fuel;
      candidateDropPct_ = drop;

      if (fuel - parkedBaselinePct_ >= REFUEL_MIN_RISE_PCT) {
        startRefuelCandidate(state, now, fuel);
        setCurrentEvent(state, "REFUEL_CANDIDATE", "NONE", "Rise confirming",
                        fuel - parkedBaselinePct_, confidence_, now);
        break;
      }

      if (signalLooksSloshy(state)) {
        confidence_ = computeSloshingConfidence(state);
        setDetectorState(DETECTOR_SLOSHING, now);
        setCurrentEvent(state, "SLOSHING_DETECTED", "NONE", "Signal unstable",
                        state.fuel.deltaPercent, confidence_, now);
        break;
      }

      if (drop >= THEFT_MIN_TOTAL_DROP_PCT &&
          state.fuel.ratePercentPerSec <= THEFT_MIN_RATE_PCT_PER_SEC) {
        if (!gpsAllowsParkedTheftDecision(state)) {
          setCurrentEvent(state, "FUEL_DROP_WHILE_MOVING", "NONE", "GPS motion context",
                          -drop, 0, now);
          break;
        }

        candidateStartMs_ = now;
        candidateStartFuelPct_ = fuel;
        candidateDropPct_ = drop;
        candidateWorstDropPct_ = drop;
        setDetectorState(DETECTOR_DROP_CANDIDATE, now);
        setCurrentEvent(state, "FUEL_DROP_CANDIDATE", "NONE", "Stationary drop confirming",
                        -drop, computeTheftConfidence(state, drop, state.fuel.ratePercentPerSec), now);
        break;
      }

      if (state.gps.speedFresh && state.gps.moving) {
        state.gps.decisionContext = "GPS_MOVING_WITH_IGNITION_OFF";
        state.gps.usedInDecision = true;
        setCurrentEvent(state, "GPS_MOVING_IGN_OFF", "NONE", "GPS motion context",
                        state.fuel.deltaPercent, 0, now);
      }

      maybeUpdateStableBaseline(state, now, fuel);
      break;
    }

    case DETECTOR_DROP_CANDIDATE: {
      float drop = parkedBaselinePct_ - fuel;
      candidateDropPct_ = drop;
      if (drop > candidateWorstDropPct_) {
        candidateWorstDropPct_ = drop;
      }
      uint8_t candidateConfidence = computeTheftConfidence(state, drop, state.fuel.ratePercentPerSec);
      setCurrentEvent(state, "FUEL_DROP_CANDIDATE", "NONE", "Stationary drop confirming",
                      -drop, candidateConfidence, now);

      if (fuel >= parkedBaselinePct_ - THEFT_CANCEL_RECOVERY_PCT ||
          state.fuel.ratePercentPerSec > THEFT_MAX_RECOVERY_RATE_PCT_PER_SEC) {
        candidateDropPct_ = 0.0f;
        candidateWorstDropPct_ = 0.0f;
        confidence_ = 0;
        setDetectorState(DETECTOR_PARKED_MONITORING, now);
        setCurrentEvent(state, "PARKED_MONITORING", "NONE", "Drop recovered", 0.0f, 0, now);
        break;
      }

      if (state.fuel.sloshingScore >= SLOSHING_SCORE_SUPPRESS_THEFT &&
          drop < candidateWorstDropPct_ + THEFT_CANCEL_RECOVERY_PCT) {
        candidateDropPct_ = 0.0f;
        candidateWorstDropPct_ = 0.0f;
        confidence_ = computeSloshingConfidence(state);
        setDetectorState(DETECTOR_SLOSHING, now);
        setCurrentEvent(state, "SLOSHING_DETECTED", "NONE", "Signal unstable",
                        -drop, confidence_, now);
        break;
      }

      if (!gpsAllowsParkedTheftDecision(state)) {
        candidateDropPct_ = 0.0f;
        candidateWorstDropPct_ = 0.0f;
        confidence_ = 0;
        setDetectorState(DETECTOR_PARKED_MONITORING, now);
        setCurrentEvent(state, "FUEL_DROP_WHILE_MOVING", "NONE", "GPS motion context",
                        -drop, 0, now);
        break;
      }

      bool confirmedDuration = now - candidateStartMs_ >= THEFT_CONFIRM_MS;
      bool sustainedDrop = drop >= THEFT_MIN_TOTAL_DROP_PCT;
      bool notRecovering = state.fuel.ratePercentPerSec <= THEFT_MAX_RECOVERY_RATE_PCT_PER_SEC;

      if (confirmedDuration && sustainedDrop && notRecovering) {
        confidence_ = computeTheftConfidence(state, drop, state.fuel.ratePercentPerSec);
        alertHoldUntilMs_ = now + THEFT_ALERT_HOLD_MS;
        setDetectorState(DETECTOR_THEFT_ALERT, now);
        setCurrentEvent(state, "SUSPICIOUS_DROP", "FUEL_THEFT_ANOMALY",
                        "Stationary drop confirmed", -drop, confidence_, now);
      }
      break;
    }

    case DETECTOR_THEFT_ALERT:
      setCurrentEvent(state, "SUSPICIOUS_DROP", "FUEL_THEFT_ANOMALY",
                      "Stationary drop confirmed", -candidateDropPct_, confidence_, now);
      if (now >= alertHoldUntilMs_) {
        parkedBaselinePct_ = fuel;
        lastStableUpdateMs_ = now;
        candidateDropPct_ = 0.0f;
        candidateWorstDropPct_ = 0.0f;
        confidence_ = 0;
        setDetectorState(DETECTOR_PARKED_MONITORING, now);
        setCurrentEvent(state, "PARKED_MONITORING", "NONE", "Alert hold complete", 0.0f, 0, now);
      }
      break;

    default:
      setDetectorState(DETECTOR_OFF_SETTLING, now);
      setCurrentEvent(state, "PARKED_SETTLING", "NONE", "Ignition off settling",
                      state.fuel.deltaPercent, 0, now);
      break;
  }

  state.fuel.deltaPercent = fuel - parkedBaselinePct_;
  state.fuel.deltaLiters = state.fuel.deltaPercent * state.tankCapacityLiters / 100.0f;
}

void EventDetector::applyTestButtonOverride(DashboardState& state, uint32_t now) {
  if (now < testHoldUntilMs_) {
    if (state.vehicle.ignitionOn) {
      setCurrentEvent(state, "TEST_BUTTON", "DROP_TEST_IGN_ON", "Manual test",
                      state.fuel.deltaPercent, 100, now);
    } else {
      setCurrentEvent(state, "TEST_BUTTON", "FUEL_THEFT_TEST", "Manual test",
                      state.fuel.deltaPercent, 100, now);
    }
  } else if (now < testAlertHoldUntilMs_ &&
             !state.vehicle.ignitionOn &&
             state.currentEvent.alert == "NONE") {
    setCurrentEvent(state, "SUSPICIOUS_DROP", "FUEL_THEFT_ANOMALY", "Manual hold",
                    state.fuel.deltaPercent, 100, now);
  }
}

void EventDetector::exportDetectorToState(DashboardState& state) {
  state.detectorState = state_;
  state.detectorStateText = detectorStateName(state_);
  state.fuel.parkedBaselinePercent = parkedBaselinePct_;
  state.fuel.candidateDropPercent = clampFloat(candidateDropPct_, 0.0f, 100.0f);
  state.fuel.deltaPercent = state.fuel.filteredPercent - parkedBaselinePct_;
  state.fuel.deltaLiters = state.fuel.deltaPercent * state.tankCapacityLiters / 100.0f;
  if (confidence_ > state.currentEvent.confidence) {
    state.currentEvent.confidence = confidence_;
  }
  syncEventLog(state);
}

bool EventDetector::gpsAllowsParkedTheftDecision(DashboardState& state) {
  if (!state.gps.speedFresh) {
    state.gps.decisionContext = "GPS_UNAVAILABLE_FALLBACK";
    state.gps.usedInDecision = false;
    return true;
  }

  state.gps.usedInDecision = true;

  if (state.gps.moving) {
    state.gps.decisionContext = "GPS_MOVING_SUPPRESSES_PARKED_THEFT";
    return false;
  }

  if (state.gps.stationary) {
    state.gps.decisionContext = "GPS_SUPPORTS_PARKED_THEFT";
    return true;
  }

  state.gps.decisionContext = "GPS_SLOW_OR_UNCERTAIN";
  return true;
}

bool EventDetector::signalLooksSloshy(const DashboardState& state) const {
  if (state.fuel.sloshingScore < SLOSHING_SCORE_EVENT) {
    return false;
  }

  float sustainedDelta = fabs(state.fuel.deltaPercent);
  return sustainedDelta < THEFT_MIN_TOTAL_DROP_PCT ||
         fabs(state.fuel.ratePercentPerSec) < fabs(THEFT_MIN_RATE_PCT_PER_SEC);
}

uint8_t EventDetector::computeTheftConfidence(DashboardState& state, float dropPct, float ratePctPerSec) {
  float score = 50.0f;
  score += (dropPct - THEFT_MIN_TOTAL_DROP_PCT) * 5.0f;
  score += fabs(ratePctPerSec) * 10.0f;

  if (!state.vehicle.ignitionOn) {
    score += 15.0f;
  }

  if (state.gps.speedFresh) {
    state.gps.usedInDecision = true;

    if (state.gps.stationary) {
      score += 10.0f;
      state.gps.decisionContext = "GPS_SUPPORTS_PARKED_THEFT";
    } else if (state.gps.moving) {
      score -= 30.0f;
      state.gps.decisionContext = "GPS_MOVING_SUPPRESSES_PARKED_THEFT";
    }
  } else {
    state.gps.decisionContext = "GPS_UNAVAILABLE_FALLBACK";
  }

  score += (state.fuel.signalStability - 50.0f) * 0.12f;
  score -= state.fuel.sloshingScore * 0.15f;

  return (uint8_t)(clampFloat(score, 0.0f, 100.0f) + 0.5f);
}

uint8_t EventDetector::computeRefuelConfidence(const DashboardState& state, float risePct) const {
  float score = 55.0f;
  score += (risePct - REFUEL_MIN_RISE_PCT) * 4.0f;
  score += (state.fuel.signalStability - 50.0f) * 0.15f;
  score -= state.fuel.sloshingScore * 0.10f;

  if (state.fuel.ratePercentPerSec >= -0.10f) {
    score += 10.0f;
  }

  return (uint8_t)(clampFloat(score, 0.0f, 100.0f) + 0.5f);
}

uint8_t EventDetector::computeSloshingConfidence(const DashboardState& state) const {
  float score = state.fuel.sloshingScore;
  if (state.fuel.signalStability < SIGNAL_STABILITY_MIN_STABLE) {
    score += 10.0f;
  }
  return (uint8_t)(clampFloat(score, 0.0f, 100.0f) + 0.5f);
}
