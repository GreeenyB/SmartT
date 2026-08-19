"""Explainable backend evidence fusion for SmartT.

The backend can strengthen or surface a review candidate, never blindly replace
hard sensor/physics/context gates from the edge.
"""
from __future__ import annotations

from typing import Any, Dict, List


def _f(obj: Dict[str, Any], *path: str, default: float = 0.0) -> float:
    cur: Any = obj
    try:
        for key in path:
            cur = cur[key]
        return default if cur is None else float(cur)
    except (KeyError, TypeError, ValueError):
        return default


def _b(obj: Dict[str, Any], *path: str, default: bool = False) -> bool:
    cur: Any = obj
    try:
        for key in path:
            cur = cur[key]
        return bool(cur)
    except (KeyError, TypeError):
        return default


def fuse_decision(
    payload: Dict[str, Any],
    ml: Dict[str, Any],
    residual: Dict[str, Any],
) -> Dict[str, Any]:
    edge_event = str(payload.get("event", "NORMAL"))
    edge_conf = _f(payload, "confidence")
    reasons: List[str] = list(payload.get("reasons") or [])

    quality = _f(payload, "fuel", "quality")
    slosh = _f(payload, "intelligence", "slosh_score")
    cp = _f(payload, "intelligence", "change_point_score")
    threshold = max(0.05, _f(payload, "intelligence", "dynamic_threshold_l", default=0.5))
    edge_unexplained = _f(payload, "intelligence", "unexplained_loss_l")
    edge_expected_available = _b(payload, "intelligence", "expected_available")

    mode = str((payload.get("context") or {}).get("mode", "UNKNOWN"))
    ignition_known = _b(payload, "context", "ignition_known")
    ignition_on = _b(payload, "context", "ignition_on")

    anomaly = ml.get("anomaly_score")
    anomaly = None if anomaly is None else float(anomaly)
    ml_slosh = ml.get("slosh_probability")
    ml_slosh = None if ml_slosh is None else float(ml_slosh)

    backend_residual_available = bool(residual.get("available", False))
    backend_unexplained = float(residual.get("unexplained_loss_l", 0.0) or 0.0)

    if edge_expected_available:
        residual_available = True
        unexplained = edge_unexplained
        residual_source = "EDGE"
    elif backend_residual_available:
        residual_available = True
        unexplained = backend_unexplained
        residual_source = str(residual.get("source") or "BACKEND")
    else:
        residual_available = False
        unexplained = 0.0
        residual_source = "UNAVAILABLE"

    final_event = edge_event
    confidence = edge_conf

    # ML anomaly is soft evidence only when the sensor itself is trustworthy.
    if anomaly is not None and anomaly >= 0.80 and quality >= 0.65:
        if "ml_behavior_anomaly" not in reasons:
            reasons.append("ml_behavior_anomaly")
        confidence = min(100.0, confidence + 6.0 * min(1.0, anomaly))

    # A learned slosh probability only suppresses false positives; it never
    # creates a theft event. Physical edge slosh still has priority.
    if ml_slosh is not None and ml_slosh >= 0.80:
        if "ml_slosh_evidence" not in reasons:
            reasons.append("ml_slosh_evidence")
        if final_event in {"SUSPICIOUS_FUEL_LOSS", "DROP_CANDIDATE"}:
            confidence = max(0.0, confidence - 12.0 * ml_slosh)

    # Hard physical/context gate for the stronger theft label.
    if edge_event == "SUSPICIOUS_FUEL_LOSS":
        strong_physical = (
            mode == "PARKED STABLE"
            and ignition_known
            and not ignition_on
            and residual_available
            and unexplained >= threshold
            and slosh <= 0.35
            and quality >= 0.65
            and not (ml_slosh is not None and ml_slosh >= 0.80)
        )
        if strong_physical:
            final_event = "FUEL_THEFT_ANOMALY"
            confidence = max(confidence, 88.0)
            for reason in (
                "vehicle_stationary",
                "engine_off",
                "unexplained_loss",
            ):
                if reason not in reasons:
                    reasons.append(reason)

    # Statistics + ML may surface an event the edge did not confirm, but the
    # backend deliberately calls it REVIEW, not theft.
    if edge_event == "NORMAL" and quality >= 0.70 and slosh <= 0.35:
        if cp >= 0.90 and anomaly is not None and anomaly >= 0.90 and mode == "PARKED STABLE":
            final_event = "ANOMALY_REVIEW"
            confidence = max(confidence, 72.0)
            for reason in ("change_point", "ml_behavior_anomaly", "vehicle_stationary"):
                if reason not in reasons:
                    reasons.append(reason)

        if (
            residual_available
            and unexplained >= threshold
            and anomaly is not None
            and anomaly >= 0.80
            and mode in {"MOVING SMOOTH", "MOVING ROUGH"}
        ):
            final_event = "UNEXPLAINED_FUEL_LOSS_REVIEW"
            confidence = max(confidence, 74.0)
            for reason in ("unexplained_loss", "ml_behavior_anomaly"):
                if reason not in reasons:
                    reasons.append(reason)

    # Sensor/calibration/data-quality/sloshing states retain priority over ML.
    if edge_event in {"SENSOR_FAULT", "CALIBRATION_REQUIRED", "DATA_QUALITY_WARNING", "SLOSHING"}:
        final_event = edge_event

    confidence = round(max(0.0, min(100.0, confidence)), 1)
    return {
        "final_event": final_event,
        "confidence": confidence,
        "reasons": reasons,
        "edge_event": edge_event,
        "edge_confidence": edge_conf,
        "ml_anomaly_score": anomaly,
        "ml_anomaly_scope": ml.get("anomaly_scope"),
        "ml_slosh_probability": ml_slosh,
        "residual_source": residual_source,
        "unexplained_loss_l": round(unexplained, 6),
        "model_version": ml.get("model_version"),
    }
