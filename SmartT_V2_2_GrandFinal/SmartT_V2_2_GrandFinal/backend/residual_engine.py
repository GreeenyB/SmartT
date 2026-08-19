"""Stateful expected-consumption / fuel-residual tracker for SmartT.

The edge already computes an exact zero-consumption residual when engine OFF is
known and can integrate OBD PID 0x5E when supported.  The backend extends this
idea with an optional learned consumption rate, but never invents a target when
neither CAN nor a trained model is available.
"""
from __future__ import annotations

from dataclasses import dataclass
from threading import Lock
from typing import Any, Dict, Optional


def _group(payload: Dict[str, Any], name: str) -> Dict[str, Any]:
    value = payload.get(name)
    return value if isinstance(value, dict) else {}


def _float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


@dataclass
class _DeviceState:
    last_uptime_ms: int = 0
    baseline_l: Optional[float] = None
    expected_accum_l: float = 0.0


class ResidualTracker:
    def __init__(self) -> None:
        self._states: Dict[str, _DeviceState] = {}
        self._lock = Lock()

    def reset(self, device_id: Optional[str] = None) -> None:
        with self._lock:
            if device_id is None:
                self._states.clear()
            else:
                self._states.pop(device_id, None)

    def update(self, payload: Dict[str, Any], learned_lph: Optional[float]) -> Dict[str, Any]:
        device_id = str(payload.get("device_id") or "unknown")
        uptime_ms = int(payload.get("uptime_ms", 0) or 0)
        fuel = _group(payload, "fuel")
        intel = _group(payload, "intelligence")
        context = _group(payload, "context")
        can = _group(payload, "can")

        calibrated = bool(fuel.get("calibrated", False))
        baseline_ready = bool(intel.get("baseline_ready", False))
        quality = _float(fuel.get("quality"))
        current_l = _float(fuel.get("volume_l"))
        baseline_l = _float(intel.get("baseline_l"))
        dynamic_threshold_l = max(0.05, _float(intel.get("dynamic_threshold_l"), 0.5))

        with self._lock:
            state = self._states.setdefault(device_id, _DeviceState())

            if not calibrated or not baseline_ready or quality < 0.40:
                state.last_uptime_ms = uptime_ms
                state.baseline_l = baseline_l if baseline_ready else None
                state.expected_accum_l = 0.0
                return {
                    "available": False,
                    "source": "UNAVAILABLE",
                    "expected_rate_lph": None,
                    "expected_consumption_l": 0.0,
                    "observed_drop_l": 0.0,
                    "unexplained_loss_l": 0.0,
                }

            reset_required = False
            if state.last_uptime_ms and uptime_ms < state.last_uptime_ms:
                reset_required = True  # device reboot / monotonic counter restart
            if state.baseline_l is None:
                reset_required = True
            elif abs(baseline_l - state.baseline_l) > max(0.20, 0.35 * dynamic_threshold_l):
                reset_required = True  # refuel/rebase/new parked baseline

            if reset_required:
                state.expected_accum_l = 0.0
                state.last_uptime_ms = uptime_ms
                state.baseline_l = baseline_l

            dt_s = 0.0
            if state.last_uptime_ms and uptime_ms >= state.last_uptime_ms:
                dt_ms = uptime_ms - state.last_uptime_ms
                if dt_ms <= 10_000:
                    dt_s = dt_ms / 1000.0

            ignition_known = bool(context.get("ignition_known", False))
            ignition_on = bool(context.get("ignition_on", False))
            can_rate_valid = bool(can.get("fuel_rate_valid", False))
            can_rate_lph = max(0.0, _float(can.get("fuel_rate_lph")))

            source = "UNAVAILABLE"
            expected_rate_lph: Optional[float] = None
            if ignition_known and not ignition_on:
                source = "ENGINE_OFF_ZERO"
                expected_rate_lph = 0.0
            elif can_rate_valid:
                source = "CAN_PID_5E"
                expected_rate_lph = can_rate_lph
            elif learned_lph is not None:
                source = "ML_REGRESSION"
                expected_rate_lph = max(0.0, float(learned_lph))

            if expected_rate_lph is not None and dt_s > 0.0:
                state.expected_accum_l += expected_rate_lph * dt_s / 3600.0

            state.last_uptime_ms = uptime_ms
            state.baseline_l = baseline_l

            observed_drop_l = max(0.0, baseline_l - current_l)
            available = expected_rate_lph is not None
            unexplained = max(0.0, observed_drop_l - state.expected_accum_l) if available else 0.0

            return {
                "available": available,
                "source": source,
                "expected_rate_lph": expected_rate_lph,
                "expected_consumption_l": round(state.expected_accum_l, 6),
                "observed_drop_l": round(observed_drop_l, 6),
                "unexplained_loss_l": round(unexplained, 6),
            }
