from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from statistics import median
from typing import Iterable

import numpy as np


@dataclass(frozen=True)
class DetectorConfig:
    sample_period_s: float = 0.25
    startup_ignore_s: float = 2.5
    off_settle_s: float = 2.5
    theft_min_drop_pct: float = 5.0
    theft_min_rate_pct_per_s: float = -0.55
    theft_max_recovery_rate_pct_per_s: float = 0.20
    theft_confirm_s: float = 2.2
    alert_hold_s: float = 8.0
    theft_cancel_recovery_pct: float = 2.0
    refuel_min_rise_pct: float = 7.0
    refuel_confirm_s: float = 1.8
    slosh_event_score: float = 60.0
    slosh_suppress_score: float = 72.0
    slosh_clear_score: float = 38.0


class DetectorReference:
    """Host reference for the firmware FSM, not a compiled firmware substitute.

    It mirrors the production thresholds, median/EMA/rate path, ignition and GPS
    gates, candidate confirmation, baseline direction guard, and alert hold. It
    uses Python containers and accepts already calibrated percent samples, so ADC
    acquisition and Arduino timing rollover are outside this reference.
    """

    def __init__(self, config: DetectorConfig = DetectorConfig()) -> None:
        self.config = config
        self.reset()

    def reset(self) -> None:
        self.state = "BOOT"
        self.event = "BOOT"
        self.alert = "NONE"
        self.started = False
        self.last_ignition = False
        self.state_started_s = 0.0
        self.baseline = 0.0
        self.baseline_ready = False
        self.candidate_started_s = 0.0
        self.candidate_worst_drop = 0.0
        self.candidate_drop = 0.0
        self.alert_until_s = 0.0
        self.confirmed_while_off = False
        self.last_stable_update_s = 0.0
        self.filtered = 0.0
        self.rate = 0.0
        self._rate_ema = 0.0
        self._median: deque[float] = deque(maxlen=5)
        self._stability: deque[float] = deque(maxlen=10)
        self.sloshing_score = 0.0
        self.signal_stability = 100.0
        self.new_alerts: list[tuple[float, bool]] = []

    def _transition(self, state: str, timestamp_s: float) -> None:
        if self.state != state:
            self.state = state
            self.state_started_s = timestamp_s

    def _clear_candidate(self) -> None:
        self.candidate_started_s = 0.0
        self.candidate_worst_drop = 0.0
        self.candidate_drop = 0.0

    def _filter(self, raw: float, timestamp_s: float) -> None:
        if not self.started:
            self.filtered = raw
            self._median.extend([raw] * 5)
            self._stability.extend([raw] * 10)
            self.started = True
            return
        self._median.append(raw)
        previous = self.filtered
        self.filtered += 0.18 * (median(self._median) - self.filtered)
        raw_rate = (self.filtered - previous) / self.config.sample_period_s
        self._rate_ema += 0.25 * (raw_rate - self._rate_ema)
        self.rate = self._rate_ema
        self._stability.append(self.filtered)
        self._update_stability()

    def _update_stability(self) -> None:
        values = list(self._stability)
        if len(values) < 2:
            return
        steps = np.diff(values)
        directions = np.sign(np.where(np.abs(steps) > 0.05, steps, 0.0))
        nonzero = directions[directions != 0]
        changes = int(np.sum(nonzero[1:] != nonzero[:-1])) if len(nonzero) > 1 else 0
        value_range = float(max(values) - min(values))
        mean_abs_step = float(np.mean(np.abs(steps)))
        sustained = abs(values[-1] - values[0])
        instability = value_range * 6.0 + mean_abs_step * 10.0 + changes * 4.0
        oscillation = value_range * 8.0 + mean_abs_step * 14.0 + changes * 8.0 - sustained * 6.0
        self.signal_stability = 100.0 - min(100.0, max(0.0, instability))
        self.sloshing_score = min(100.0, max(0.0, oscillation))

    def _gps_allows(self, gps_fresh: bool, gps_moving: bool) -> bool:
        return not (gps_fresh and gps_moving)

    def _signal_looks_sloshy(self) -> bool:
        if self.sloshing_score < self.config.slosh_event_score:
            return False
        sustained = abs(self.filtered - self.baseline)
        return sustained < self.config.theft_min_drop_pct or abs(self.rate) < abs(self.config.theft_min_rate_pct_per_s)

    def step(self, timestamp_s: float, raw_fuel_percent: float, ignition_on: bool,
             gps_fresh: bool = False, gps_moving: bool = False,
             sensor_valid: bool = True) -> dict[str, object]:
        if np.isfinite(raw_fuel_percent):
            self._filter(float(raw_fuel_percent), timestamp_s)

        self.event = "NORMAL"
        self.alert = "NONE"
        new_alert = False

        if timestamp_s < self.config.startup_ignore_s or not self.started:
            self.event = "WARMING_UP"
            return self.snapshot(timestamp_s, new_alert)

        if not sensor_valid or not np.isfinite(raw_fuel_percent) or not (-5.0 <= raw_fuel_percent <= 105.0):
            self.confirmed_while_off = False
            self._clear_candidate()
            self._transition("SENSOR_FAULT", timestamp_s)
            self.event = "SENSOR_FAULT"
            return self.snapshot(timestamp_s, new_alert)

        if self.state in {"BOOT", "SENSOR_FAULT"}:
            self.last_ignition = ignition_on
            self.baseline = self.filtered
            self.baseline_ready = False
            self._clear_candidate()
            self._transition("NORMAL_ON" if ignition_on else "OFF_SETTLING", timestamp_s)
        elif ignition_on != self.last_ignition:
            self.last_ignition = ignition_on
            self.baseline_ready = False
            if ignition_on:
                if not (self.state == "THEFT_ALERT" and self.confirmed_while_off and timestamp_s < self.alert_until_s):
                    self._clear_candidate()
                    self._transition("NORMAL_ON", timestamp_s)
            else:
                self._clear_candidate()
                self._transition("OFF_SETTLING", timestamp_s)

        if self.state == "THEFT_ALERT":
            if not self.confirmed_while_off:
                self._clear_candidate()
                self._transition("NORMAL_ON" if ignition_on else "PARKED_MONITORING", timestamp_s)
            elif timestamp_s < self.alert_until_s:
                self.event = "SUSPICIOUS_DROP"
                self.alert = "FUEL_THEFT_ANOMALY"
                return self.snapshot(timestamp_s, new_alert)
            else:
                self.confirmed_while_off = False
                self.baseline = self.filtered
                self.baseline_ready = not ignition_on
                self._clear_candidate()
                self._transition("NORMAL_ON" if ignition_on else "PARKED_MONITORING", timestamp_s)

        if ignition_on:
            if self.state == "DROP_CANDIDATE":
                self._clear_candidate()
            self._transition("NORMAL_ON", timestamp_s)
            if self.rate <= self.config.theft_min_rate_pct_per_s:
                self.event = "FAST_DROP_IGN_ON"
            return self.snapshot(timestamp_s, new_alert)

        if self.state == "OFF_SETTLING":
            self.event = "PARKED_SETTLING"
            if timestamp_s - self.state_started_s >= self.config.off_settle_s:
                self.baseline = self.filtered
                self.baseline_ready = True
                self.last_stable_update_s = timestamp_s
                self._transition("PARKED_MONITORING", timestamp_s)
            return self.snapshot(timestamp_s, new_alert)

        drop = self.baseline - self.filtered
        rise = self.filtered - self.baseline

        if self.state == "REFUEL_CANDIDATE":
            self.event = "REFUEL_CANDIDATE"
            if rise < self.config.refuel_min_rise_pct - self.config.theft_cancel_recovery_pct:
                self._transition("PARKED_MONITORING", timestamp_s)
            elif timestamp_s - self.candidate_started_s >= self.config.refuel_confirm_s:
                self.event = "REFUEL_EVENT"
                self.baseline = self.filtered
                self.baseline_ready = True
                self._clear_candidate()
                self._transition("PARKED_MONITORING", timestamp_s)
            return self.snapshot(timestamp_s, new_alert)

        if self.state == "SLOSHING":
            if (drop >= self.config.theft_min_drop_pct and
                    self.rate <= self.config.theft_min_rate_pct_per_s and
                    self._gps_allows(gps_fresh, gps_moving)):
                self.candidate_started_s = timestamp_s
                self.candidate_drop = drop
                self.candidate_worst_drop = drop
                self._transition("DROP_CANDIDATE", timestamp_s)
            elif self.sloshing_score <= self.config.slosh_clear_score:
                self._transition("PARKED_MONITORING", timestamp_s)
            else:
                self.event = "SLOSHING_DETECTED"
                return self.snapshot(timestamp_s, new_alert)

        if self.state == "DROP_CANDIDATE":
            drop = self.baseline - self.filtered
            self.candidate_drop = drop
            self.candidate_worst_drop = max(self.candidate_worst_drop, drop)
            self.event = "FUEL_DROP_CANDIDATE"
            if self.filtered >= self.baseline - self.config.theft_cancel_recovery_pct:
                self._clear_candidate()
                self._transition("PARKED_MONITORING", timestamp_s)
            elif (self.sloshing_score >= self.config.slosh_suppress_score and
                  drop <= self.candidate_worst_drop - self.config.theft_cancel_recovery_pct):
                self._clear_candidate()
                self._transition("SLOSHING", timestamp_s)
                self.event = "SLOSHING_DETECTED"
            elif not self._gps_allows(gps_fresh, gps_moving):
                self._clear_candidate()
                self._transition("PARKED_MONITORING", timestamp_s)
                self.event = "FUEL_DROP_WHILE_MOVING"
            elif (not ignition_on and timestamp_s - self.candidate_started_s >= self.config.theft_confirm_s and
                  drop >= self.config.theft_min_drop_pct and
                  self.rate <= self.config.theft_max_recovery_rate_pct_per_s):
                self.confirmed_while_off = True
                self.alert_until_s = timestamp_s + self.config.alert_hold_s
                self._transition("THEFT_ALERT", timestamp_s)
                self.event = "SUSPICIOUS_DROP"
                self.alert = "FUEL_THEFT_ANOMALY"
                self.new_alerts.append((timestamp_s, ignition_on))
                new_alert = True
            return self.snapshot(timestamp_s, new_alert)

        self._transition("PARKED_MONITORING", timestamp_s)
        self.event = "PARKED_MONITORING"
        if rise >= self.config.refuel_min_rise_pct:
            self.candidate_started_s = timestamp_s
            self._transition("REFUEL_CANDIDATE", timestamp_s)
            self.event = "REFUEL_CANDIDATE"
        elif self._signal_looks_sloshy():
            self._transition("SLOSHING", timestamp_s)
            self.event = "SLOSHING_DETECTED"
        elif (drop >= self.config.theft_min_drop_pct and
              self.rate <= self.config.theft_min_rate_pct_per_s and
              self._gps_allows(gps_fresh, gps_moving)):
            self.candidate_started_s = timestamp_s
            self.candidate_drop = drop
            self.candidate_worst_drop = drop
            self._transition("DROP_CANDIDATE", timestamp_s)
            self.event = "FUEL_DROP_CANDIDATE"
        elif (self.filtered >= self.baseline and self.filtered - self.baseline <= 1.5 and
              abs(self.rate) <= 0.15 and self.signal_stability >= 65.0 and
              timestamp_s - self.last_stable_update_s >= 5.0):
            self.baseline = self.filtered
            self.last_stable_update_s = timestamp_s
        return self.snapshot(timestamp_s, new_alert)

    def snapshot(self, timestamp_s: float, new_alert: bool) -> dict[str, object]:
        return {
            "timestamp_s": timestamp_s,
            "state": self.state,
            "event": self.event,
            "alert": self.alert,
            "new_alert": new_alert,
            "filtered_fuel_percent": self.filtered,
            "fuel_rate_percent_per_sec": self.rate,
            "parked_baseline_percent": self.baseline,
            "candidate_drop_percent": self.candidate_drop,
            "sloshing_score": self.sloshing_score,
            "signal_stability": self.signal_stability,
        }


def run_rows(rows: Iterable[dict[str, object]]) -> dict[str, object]:
    detector = DetectorReference()
    events: list[str] = []
    first_alert_s: float | None = None
    sensor_fault = False
    for row in rows:
        raw_value = row.get("raw_fuel_percent", "")
        raw = float(raw_value) if raw_value not in (None, "") else float("nan")
        result = detector.step(
            float(row["timestamp_s"]), raw, bool(int(row["ignition"])),
            bool(int(row["gps_fresh"])), bool(int(row["gps_moving"])),
            bool(int(row["sensor_valid"])),
        )
        events.append(str(result["event"]))
        sensor_fault = sensor_fault or result["state"] == "SENSOR_FAULT"
        if result["new_alert"] and first_alert_s is None:
            first_alert_s = float(result["timestamp_s"])
    if first_alert_s is not None:
        prediction = "DRAIN"
    elif "REFUEL_EVENT" in events:
        prediction = "REFUEL"
    elif "SLOSHING_DETECTED" in events:
        prediction = "SLOSHING"
    else:
        prediction = "NORMAL"
    return {
        "prediction": prediction,
        "first_alert_s": first_alert_s,
        "sensor_fault": sensor_fault,
        "new_alerts": detector.new_alerts,
        "events": events,
    }
