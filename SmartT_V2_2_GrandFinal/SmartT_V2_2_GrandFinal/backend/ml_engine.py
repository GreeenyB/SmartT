"""Optional learning-based evidence for SmartT.

Models are deliberately subordinate to physical/context gates.  If optional ML
dependencies or trained model files are missing, the backend remains fully
functional with deterministic/statistical evidence.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import json
import math
import re
from threading import RLock
from typing import Any, Dict, Optional

try:
    import joblib  # type: ignore
    import numpy as np  # type: ignore
    ML_RUNTIME_AVAILABLE = True
except Exception:
    joblib = None
    np = None
    ML_RUNTIME_AVAILABLE = False

ANOMALY_FEATURES = [
    "fuel_rate_lps",
    "fuel_quality",
    "innovation_score",
    "slosh_score",
    "change_point_score",
    "drop_cusum_l",
    "motion_energy",
    "speed_kmh",
    "rpm",
    "engine_load_pct",
    "unexplained_loss_l",
]

CONSUMPTION_FEATURES = [
    "speed_kmh",
    "rpm",
    "engine_load_pct",
    "motion_energy",
]

SLOSH_FEATURES = [
    "fuel_rate_lps",
    "innovation_score",
    "change_point_score",
    "motion_energy",
    "speed_kmh",
    "rpm",
    "engine_load_pct",
]


def safe_vehicle_id(vehicle_id: str) -> str:
    value = re.sub(r"[^A-Za-z0-9_.-]+", "_", vehicle_id.strip())
    return value[:80] or "unknown"


def _get(payload: Dict[str, Any], *path: str, default: float = 0.0) -> float:
    cur: Any = payload
    try:
        for key in path:
            cur = cur[key]
        if cur is None:
            return default
        value = float(cur)
        return value if math.isfinite(value) else default
    except (KeyError, TypeError, ValueError):
        return default


def extract_feature_dict(payload: Dict[str, Any]) -> Dict[str, float]:
    return {
        "fuel_rate_lps": _get(payload, "fuel", "rate_lps"),
        "fuel_quality": _get(payload, "fuel", "quality"),
        "innovation_score": _get(payload, "fuel", "innovation_score"),
        "slosh_score": _get(payload, "intelligence", "slosh_score"),
        "change_point_score": _get(payload, "intelligence", "change_point_score"),
        "drop_cusum_l": _get(payload, "intelligence", "drop_cusum_l"),
        "motion_energy": _get(payload, "context", "motion_energy"),
        "speed_kmh": _get(payload, "context", "speed_kmh"),
        "rpm": _get(payload, "context", "rpm"),
        "engine_load_pct": _get(payload, "context", "engine_load_pct"),
        "unexplained_loss_l": _get(payload, "intelligence", "unexplained_loss_l"),
    }


@dataclass
class MLResult:
    available: bool
    anomaly_score: Optional[float] = None
    anomaly_scope: Optional[str] = None
    expected_consumption_lph: Optional[float] = None
    slosh_probability: Optional[float] = None
    model_version: Optional[str] = None
    notes: Optional[str] = None


class SmartTML:
    def __init__(self, model_dir: str | Path):
        self.model_dir = Path(model_dir)
        self.global_anomaly_model = None
        self.vehicle_anomaly_models: Dict[str, Any] = {}
        self.consumption_model = None
        self.slosh_model = None
        self.meta: Dict[str, Any] = {}
        self._lock = RLock()
        self.reload()

    def _load_model(self, path: Path):
        if not path.exists() or not ML_RUNTIME_AVAILABLE:
            return None
        try:
            return joblib.load(path)
        except Exception:
            return None

    def reload(self) -> None:
        with self._lock:
            self.global_anomaly_model = None
            self.vehicle_anomaly_models = {}
            self.consumption_model = None
            self.slosh_model = None
            self.meta = {}

            meta_path = self.model_dir / "metadata.json"
            if meta_path.exists():
                try:
                    self.meta = json.loads(meta_path.read_text(encoding="utf-8"))
                except Exception:
                    self.meta = {}

            if not ML_RUNTIME_AVAILABLE:
                self.meta["runtime_note"] = "Optional ML dependencies are not installed."
                return

            self.global_anomaly_model = self._load_model(
                self.model_dir / "isolation_forest_global.joblib"
            )
            if self.global_anomaly_model is None:  # V2.1 backward compatibility
                self.global_anomaly_model = self._load_model(
                    self.model_dir / "isolation_forest.joblib"
                )

            vehicle_dir = self.model_dir / "vehicles"
            for vehicle_id in (self.meta.get("vehicle_models") or {}):
                model = self._load_model(vehicle_dir / f"{safe_vehicle_id(vehicle_id)}.joblib")
                if model is not None:
                    self.vehicle_anomaly_models[vehicle_id] = model

            self.consumption_model = self._load_model(
                self.model_dir / "consumption_model.joblib"
            )
            self.slosh_model = self._load_model(self.model_dir / "slosh_model.joblib")

    def status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "runtime_available": ML_RUNTIME_AVAILABLE,
                "global_anomaly_model": self.global_anomaly_model is not None,
                "vehicle_anomaly_models": sorted(self.vehicle_anomaly_models.keys()),
                "consumption_model": self.consumption_model is not None,
                "slosh_model": self.slosh_model is not None,
                "model_version": self.meta.get("model_version"),
                "metadata": self.meta,
            }

    @staticmethod
    def _calibrated_anomaly(raw: float, p50: float, p01: float) -> float:
        denom = max(1e-6, p50 - p01)
        return max(0.0, min(1.0, (p50 - raw) / denom))

    def _score_anomaly(self, model: Any, features: Dict[str, float], meta: Dict[str, Any]) -> float:
        x = np.array([[features[name] for name in ANOMALY_FEATURES]], dtype=np.float64)
        raw = float(model.score_samples(x)[0])
        p50 = float(meta.get("p50", -0.45))
        p01 = float(meta.get("p01", -0.75))
        return self._calibrated_anomaly(raw, p50, p01)

    def infer(self, payload: Dict[str, Any]) -> MLResult:
        features = extract_feature_dict(payload)
        vehicle_id = str(payload.get("vehicle_id") or "unknown")

        with self._lock:
            anomaly_score: Optional[float] = None
            anomaly_scope: Optional[str] = None
            expected_consumption_lph: Optional[float] = None
            slosh_probability: Optional[float] = None

            global_score: Optional[float] = None
            if self.global_anomaly_model is not None:
                global_meta = self.meta.get("global_anomaly") or {
                    "p50": self.meta.get("anomaly_score_p50", -0.45),
                    "p01": self.meta.get("anomaly_score_p01", -0.75),
                }
                global_score = self._score_anomaly(
                    self.global_anomaly_model, features, global_meta
                )

            vehicle_score: Optional[float] = None
            vehicle_model = self.vehicle_anomaly_models.get(vehicle_id)
            if vehicle_model is not None:
                vmeta = (self.meta.get("vehicle_models") or {}).get(vehicle_id, {})
                vehicle_score = self._score_anomaly(vehicle_model, features, vmeta)

            if vehicle_score is not None and global_score is not None:
                # Fleet model prevents over-personalization; vehicle model adds specificity.
                anomaly_score = 0.35 * global_score + 0.65 * vehicle_score
                anomaly_scope = "GLOBAL+VEHICLE"
            elif vehicle_score is not None:
                anomaly_score = vehicle_score
                anomaly_scope = "VEHICLE"
            elif global_score is not None:
                anomaly_score = global_score
                anomaly_scope = "GLOBAL"

            if self.consumption_model is not None:
                x = np.array(
                    [[features[name] for name in CONSUMPTION_FEATURES]],
                    dtype=np.float64,
                )
                predicted = float(self.consumption_model.predict(x)[0])
                expected_consumption_lph = max(0.0, predicted)

            if self.slosh_model is not None:
                x = np.array(
                    [[features[name] for name in SLOSH_FEATURES]],
                    dtype=np.float64,
                )
                try:
                    slosh_probability = float(self.slosh_model.predict_proba(x)[0][1])
                except Exception:
                    slosh_probability = None

            available = any(
                value is not None
                for value in (anomaly_score, expected_consumption_lph, slosh_probability)
            )
            return MLResult(
                available=available,
                anomaly_score=anomaly_score,
                anomaly_scope=anomaly_scope,
                expected_consumption_lph=expected_consumption_lph,
                slosh_probability=slosh_probability,
                model_version=self.meta.get("model_version"),
                notes=None if available else "No trained model loaded; deterministic engine remains active.",
            )
