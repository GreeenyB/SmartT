from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Any

import numpy as np

from ml.config import MIN_WINDOW_COVERAGE, MODEL_PATH, SAMPLE_JITTER_TOLERANCE_SECONDS, SAMPLE_PERIOD_SECONDS
from ml.features.window_features import FEATURE_NAMES, expected_sample_count, feature_vector, resample_window


def _value(payload: dict[str, Any], *names: str, default: Any = None) -> Any:
    for name in names:
        if name in payload and payload[name] not in (None, ""):
            return payload[name]
    return default


def _number(payload: dict[str, Any], *names: str, default: float = 0.0) -> float:
    try:
        return float(_value(payload, *names, default=default))
    except (TypeError, ValueError):
        return default


def _boolean(payload: dict[str, Any], *names: str, default: bool = False) -> bool:
    value = _value(payload, *names, default=default)
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _timestamp_seconds(value: str | None) -> float:
    if value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
        except ValueError:
            pass
    return datetime.now(timezone.utc).timestamp()


class ShadowInference:
    """Optional local-server inference that never creates or changes an alert."""

    def __init__(self, enabled: bool, model_path: Path = MODEL_PATH) -> None:
        self.enabled = enabled
        self.model_path = Path(model_path)
        self.bundle: dict[str, Any] | None = None
        self.error: str | None = None
        self.buffers: dict[str, deque[dict[str, object]]] = defaultdict(lambda: deque(maxlen=240))
        self.lock = RLock()
        if enabled:
            self._load()

    def _load(self) -> None:
        try:
            if not self.model_path.exists():
                raise FileNotFoundError(f"model artifact not found: {self.model_path}")
            import joblib
            bundle = joblib.load(self.model_path)
            if list(bundle.get("feature_names", [])) != FEATURE_NAMES:
                raise ValueError("model feature schema does not match runtime schema")
            self.bundle = bundle
        except Exception as exc:  # fail open: ingestion remains authoritative
            self.bundle = None
            self.error = f"{type(exc).__name__}: {exc}"

    def status(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "available": self.bundle is not None,
            "model_version": self.bundle.get("model_version") if self.bundle else None,
            "error": self.error,
            "mode": "SHADOW_ONLY",
        }

    def _row(self, payload: dict[str, Any], created_at: str) -> dict[str, object]:
        filtered = _number(payload, "fuel_percent", "fuelPercent", "fuel_percent_filtered", default=0.0)
        raw_value = _value(payload, "fuel_percent_raw", "fuelRawPercent", "raw_fuel_percent", default=None)
        speed = _number(payload, "speed_kmh", "speedKmh", "gps_speed_kmh", default=0.0)
        gps_fix = _boolean(payload, "gps_fix", "gpsFix", default=False)
        data_fresh = _boolean(payload, "gps_data_fresh", "gpsDataFresh", default=gps_fix)
        speed_fresh = _boolean(payload, "gps_speed_fresh", "gpsSpeedFresh", default=False)
        motion = str(_value(payload, "gps_motion_state", "gpsMotionState", default="")).upper()
        sensor_healthy = _boolean(payload, "sensor_healthy", "sensorHealthy", default=True)
        return {
            "timestamp_s": _timestamp_seconds(created_at),
            "raw_fuel_percent": "" if raw_value is None else float(raw_value),
            "filtered_fuel_percent": filtered,
            "ignition": int(_boolean(payload, "ignition", "ignitionOn", "ignition_on", default=False)),
            "gps_speed_kmh": speed,
            "gps_available": int(gps_fix),
            "gps_data_fresh": int(data_fresh), "gps_speed_fresh": int(speed_fresh),
            "gps_stationary": int(speed_fresh and (motion == "STATIONARY" or speed <= 3.0)),
            "gps_moving": int(speed_fresh and (motion == "MOVING" or speed >= 8.0)),
            "sensor_valid": int(sensor_healthy),
        }

    def observe(self, vehicle_id: str, payload: dict[str, Any], created_at: str) -> dict[str, Any] | None:
        if not self.enabled:
            return None
        with self.lock:
            row = self._row(payload, created_at)
            buffer = self.buffers[vehicle_id]
            buffer.append(row)
            if self.bundle is None:
                return {**self.status(), "prediction": None, "drain_probability": None, "anomaly_score": None}
            window_seconds = float(self.bundle.get("window_seconds", 16.0))
            sample_period_s = float(self.bundle.get("sample_period_s", SAMPLE_PERIOD_SECONDS))
            min_coverage = float(self.bundle.get("min_coverage", MIN_WINDOW_COVERAGE))
            newest = float(row["timestamp_s"])
            window_start = newest - window_seconds
            selected = [item for item in buffer if float(item["timestamp_s"]) >= window_start - sample_period_s]
            if not selected:
                return {**self.status(), "warming_up": True, "prediction": None,
                        "drain_probability": None, "anomaly_score": None,
                        "data_quality": {"coverage": 0.0, "expected_samples": expected_sample_count(window_seconds, sample_period_s)}}
            complete_duration = float(selected[0]["timestamp_s"]) <= window_start + SAMPLE_JITTER_TOLERANCE_SECONDS
            prepared = resample_window(selected, sample_period_s, window_start_s=window_start, window_end_s=newest)
            vector = feature_vector(prepared, sample_period_s)
            coverage = float(vector["sample_coverage"])
            if not complete_duration or coverage < min_coverage:
                return {**self.status(), "warming_up": True, "prediction": None,
                        "drain_probability": None, "anomaly_score": None,
                        "data_quality": {"coverage": coverage, "expected_samples": expected_sample_count(window_seconds, sample_period_s),
                                         "observed_samples": int(round(coverage * len(prepared))), "complete_duration": complete_duration}}
            x = np.array([[vector[name] for name in FEATURE_NAMES]], dtype=np.float64)
            classifier = self.bundle["classifier"]
            probabilities = classifier.predict_proba(x)[0]
            classes = [str(value) for value in classifier.classes_]
            raw_prediction = classes[int(np.argmax(probabilities))]
            threshold = float(self.bundle.get("abstain_threshold", 0.0))
            prediction = raw_prediction if float(np.max(probabilities)) >= threshold else "UNKNOWN"
            drain_probability = float(probabilities[classes.index("DRAIN")])
            anomaly_score = float(-self.bundle["anomaly_model"].score_samples(x)[0])
            return {
                **self.status(),
                "warming_up": False,
                "prediction": prediction, "ml_prediction": prediction, "ml_raw_prediction": raw_prediction,
                "ml_raw_probability": float(np.max(probabilities)), "probabilities": dict(zip(classes, map(float, probabilities))),
                "drain_probability": drain_probability,
                "anomaly_score": anomaly_score,
                "data_quality": {"coverage": coverage, "expected_samples": expected_sample_count(window_seconds, sample_period_s),
                                 "observed_samples": int(round(coverage * len(prepared))), "complete_duration": True},
            }
