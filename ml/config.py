from __future__ import annotations

from pathlib import Path


SEED = 20260829
# Firmware samples internally at 250 ms, but LocalServerClient deliberately posts
# one telemetry sample every 500 ms. Shadow inference only sees the latter, so this
# is the canonical training/runtime feature cadence.
SAMPLE_PERIOD_SECONDS = 0.50
WINDOW_SECONDS = 16.0
ROLLING_STRIDE_SECONDS = 0.5
MIN_WINDOW_COVERAGE = 0.85
STEADY_OVERLAP_RATIO = 0.80
MAX_INTERPOLATION_GAP_SECONDS = 1.25
SAMPLE_JITTER_TOLERANCE_SECONDS = 0.30
WINDOW_CANDIDATES_SECONDS = (8.0, 12.0, 16.0)
BENCHMARK_SEEDS = (20260829, 20260830, 20260831, 20260832, 20260833)
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
FEATURE_SCHEMA_PATH = ML_DIR / "models" / "feature_schema.json"
METRICS_PATH = ML_DIR / "reports" / "metrics.json"
SPLITS_PATH = ML_DIR / "reports" / "splits.json"
REPORT_PATH = ML_DIR / "reports" / "ML_EVALUATION.md"
ROLLING_PREDICTIONS_PATH = ML_DIR / "reports" / "rolling_predictions_test.csv"
MODEL_COMPARISON_PATH = ML_DIR / "reports" / "model_comparison.csv"
ALERT_POLICY_PATH = ML_DIR / "reports" / "alert_policy_results.csv"
