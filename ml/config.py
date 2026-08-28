from __future__ import annotations

from pathlib import Path


SEED = 20260829
SAMPLE_PERIOD_SECONDS = 0.25
WINDOW_SECONDS = 16.0
ROLLING_STRIDE_SECONDS = 0.5
MIN_WINDOW_COVERAGE = 0.85
STEADY_OVERLAP_RATIO = 0.50  # fixed before final scoring; lower is transition
TARGET_CLASSES = ("NORMAL", "SLOSHING", "REFUEL", "DRAIN")
FORBIDDEN_FEATURE_FIELDS = {
    "ground_truth_label",
    "ground_truth_subtype",
    "rule_prediction",
    "current_event",
    "alert",
    "detector_state",
    "confidence",
    "anomaly_confidence",
}

ML_DIR = Path(__file__).resolve().parent
SYNTHETIC_DATA_PATH = ML_DIR / "data" / "synthetic" / "smartt_synthetic.csv"
FEATURE_DATA_PATH = ML_DIR / "data" / "processed" / "window_features.csv"
MODEL_PATH = ML_DIR / "models" / "smartt_shadow.joblib"
METADATA_PATH = ML_DIR / "models" / "metadata.json"
METRICS_PATH = ML_DIR / "reports" / "metrics.json"
SPLITS_PATH = ML_DIR / "reports" / "splits.json"
REPORT_PATH = ML_DIR / "reports" / "ML_EVALUATION.md"
ROLLING_PREDICTIONS_PATH = ML_DIR / "reports" / "rolling_predictions_test.csv"
MODEL_COMPARISON_PATH = ML_DIR / "reports" / "model_comparison.csv"
ALERT_POLICY_PATH = ML_DIR / "reports" / "alert_policy_results.csv"
