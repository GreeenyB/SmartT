"""Train optional SmartT V2.2 ML models from JSONL telemetry.

Usage:
    python train_models.py data/telemetry.jsonl

Design rules:
- anomaly model learns high-quality NORMAL behavior, not theft labels;
- a global Isolation Forest is always preferred before per-vehicle models;
- per-vehicle models are trained only when enough normal samples exist;
- consumption regression uses only explicit validated targets or fresh ECU
  fuel-rate PID data, never guessed labels;
- slosh classifier trains only from explicit human/curated label_sloshing.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional, Tuple

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest, HistGradientBoostingRegressor
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import mean_absolute_error, balanced_accuracy_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from ml_engine import (
    ANOMALY_FEATURES,
    CONSUMPTION_FEATURES,
    SLOSH_FEATURES,
    extract_feature_dict,
    safe_vehicle_id,
)

MIN_GLOBAL_NORMAL = 200
MIN_VEHICLE_NORMAL = 200
MIN_CONSUMPTION = 300
MIN_SLOSH_LABELS = 200
MIN_SLOSH_PER_CLASS = 50


def load_jsonl(path: Path) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                if isinstance(obj, dict):
                    rows.append(obj)
            except json.JSONDecodeError:
                pass
    return rows


def normal_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        r
        for r in rows
        if str(r.get("event", "")) == "NORMAL"
        and bool((r.get("fuel") or {}).get("calibrated", False))
        and float((r.get("fuel") or {}).get("quality", 0.0) or 0.0) >= 0.70
    ]


def feature_matrix(rows: List[Dict[str, Any]], names: List[str]) -> np.ndarray:
    return np.array(
        [[extract_feature_dict(r)[name] for name in names] for r in rows],
        dtype=np.float64,
    )


def train_isolation(rows: List[Dict[str, Any]], output: Path) -> Dict[str, Any]:
    x = feature_matrix(rows, ANOMALY_FEATURES)
    model = IsolationForest(
        n_estimators=240,
        contamination="auto",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(x)
    scores = model.score_samples(x)
    joblib.dump(model, output)
    return {
        "rows": len(rows),
        "p01": float(np.quantile(scores, 0.01)),
        "p50": float(np.quantile(scores, 0.50)),
    }


def validated_consumption_target(row: Dict[str, Any]) -> Optional[float]:
    explicit = row.get("target_consumption_lph")
    if explicit is not None:
        try:
            return max(0.0, float(explicit))
        except (TypeError, ValueError):
            return None

    can = row.get("can") or {}
    if bool(can.get("fuel_rate_valid", False)) and can.get("fuel_rate_lph") is not None:
        try:
            return max(0.0, float(can["fuel_rate_lph"]))
        except (TypeError, ValueError):
            return None
    return None


def chronological_split(rows: List[Any], frac: float = 0.80) -> Tuple[List[Any], List[Any]]:
    if len(rows) < 5:
        return rows, []
    cut = max(1, min(len(rows) - 1, int(len(rows) * frac)))
    return rows[:cut], rows[cut:]


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python train_models.py data/telemetry.jsonl")
        return 2

    source = Path(sys.argv[1])
    rows = load_jsonl(source)
    model_dir = Path(__file__).resolve().parent / "models"
    vehicle_dir = model_dir / "vehicles"
    model_dir.mkdir(parents=True, exist_ok=True)
    vehicle_dir.mkdir(parents=True, exist_ok=True)

    normals = normal_rows(rows)
    metadata: Dict[str, Any] = {
        "model_version": datetime.now(timezone.utc).strftime("smartt-v2.2-%Y%m%dT%H%M%SZ"),
        "source": str(source),
        "total_rows": len(rows),
        "normal_rows": len(normals),
        "anomaly_features": ANOMALY_FEATURES,
        "consumption_features": CONSUMPTION_FEATURES,
        "slosh_features": SLOSH_FEATURES,
        "vehicle_models": {},
    }

    if len(normals) >= MIN_GLOBAL_NORMAL:
        metadata["global_anomaly"] = train_isolation(
            normals, model_dir / "isolation_forest_global.joblib"
        )
        print(f"Trained global IsolationForest on {len(normals)} NORMAL samples")
    else:
        print(f"Skip global anomaly ML: need >={MIN_GLOBAL_NORMAL}, got {len(normals)}")

    by_vehicle: Dict[str, List[Dict[str, Any]]] = {}
    for row in normals:
        vehicle_id = str(row.get("vehicle_id") or "unknown")
        by_vehicle.setdefault(vehicle_id, []).append(row)

    for vehicle_id, vehicle_rows in sorted(by_vehicle.items()):
        if vehicle_id == "unknown" or len(vehicle_rows) < MIN_VEHICLE_NORMAL:
            continue
        stats = train_isolation(
            vehicle_rows, vehicle_dir / f"{safe_vehicle_id(vehicle_id)}.joblib"
        )
        metadata["vehicle_models"][vehicle_id] = stats
        print(f"Trained vehicle IsolationForest {vehicle_id}: {len(vehicle_rows)} samples")

    supervised: List[Tuple[Dict[str, Any], float]] = []
    for row in rows:
        target = validated_consumption_target(row)
        if target is not None:
            supervised.append((row, target))

    if len(supervised) >= MIN_CONSUMPTION:
        train_rows, test_rows = chronological_split(supervised)
        x_train = feature_matrix([r for r, _ in train_rows], CONSUMPTION_FEATURES)
        y_train = np.array([y for _, y in train_rows], dtype=np.float64)
        reg = HistGradientBoostingRegressor(
            max_iter=240,
            learning_rate=0.05,
            max_leaf_nodes=15,
            l2_regularization=0.15,
            random_state=42,
        )
        reg.fit(x_train, y_train)
        joblib.dump(reg, model_dir / "consumption_model.joblib")
        cmeta: Dict[str, Any] = {"rows": len(supervised)}
        if test_rows:
            x_test = feature_matrix([r for r, _ in test_rows], CONSUMPTION_FEATURES)
            y_test = np.array([y for _, y in test_rows], dtype=np.float64)
            cmeta["holdout_mae_lph"] = float(mean_absolute_error(y_test, reg.predict(x_test)))
        metadata["consumption_model"] = cmeta
        print(f"Trained consumption regression on {len(supervised)} validated samples")
    else:
        print(f"Skip consumption ML: need >={MIN_CONSUMPTION}, got {len(supervised)}")

    labelled_slosh: List[Tuple[Dict[str, Any], int]] = []
    for row in rows:
        label = row.get("label_sloshing")
        if label is None:
            continue
        if isinstance(label, bool):
            labelled_slosh.append((row, int(label)))
        elif str(label).strip() in {"0", "1"}:
            labelled_slosh.append((row, int(str(label).strip())))

    positives = sum(y for _, y in labelled_slosh)
    negatives = len(labelled_slosh) - positives
    if (
        len(labelled_slosh) >= MIN_SLOSH_LABELS
        and positives >= MIN_SLOSH_PER_CLASS
        and negatives >= MIN_SLOSH_PER_CLASS
    ):
        train_rows, test_rows = chronological_split(labelled_slosh)
        x_train = feature_matrix([r for r, _ in train_rows], SLOSH_FEATURES)
        y_train = np.array([y for _, y in train_rows], dtype=np.int64)
        clf = make_pipeline(
            StandardScaler(),
            LogisticRegression(max_iter=500, class_weight="balanced", random_state=42),
        )
        clf.fit(x_train, y_train)
        joblib.dump(clf, model_dir / "slosh_model.joblib")
        smeta: Dict[str, Any] = {
            "rows": len(labelled_slosh),
            "positive": positives,
            "negative": negatives,
        }
        if test_rows:
            x_test = feature_matrix([r for r, _ in test_rows], SLOSH_FEATURES)
            y_test = np.array([y for _, y in test_rows], dtype=np.int64)
            smeta["holdout_balanced_accuracy"] = float(
                balanced_accuracy_score(y_test, clf.predict(x_test))
            )
        metadata["slosh_model"] = smeta
        print(f"Trained slosh classifier on {len(labelled_slosh)} curated labels")
    else:
        print(
            "Skip slosh ML: needs >=200 curated labels and >=50 samples per class; "
            f"got n={len(labelled_slosh)}, positive={positives}, negative={negatives}"
        )

    (model_dir / "metadata.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
