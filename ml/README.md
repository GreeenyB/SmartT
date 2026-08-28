# SmartT ML Workspace

This workspace measures whether classical ML adds useful evidence to SmartT. It does not replace the deterministic ESP32 detector. All included evaluation results are **EXPERIMENTAL / SYNTHETIC**, not tank or vehicle validation.

## What is implemented

- Configurable 250 ms synthetic time series with 496 independent experiments by default: 120 each of NORMAL, SLOSHING, REFUEL, and DRAIN, plus 16 sensor-fault gating experiments.
- Randomized vehicle profiles, duration, level, noise, drift, slosh, drain/refuel rate and magnitude, recovery, missing samples, ignition, motion, and GPS availability/freshness.
- Simulator-defined ground truth. The detector never labels training data.
- Fixed 16-second windows and 33 independent/core features from fuel behavior, signal quality, ignition, and GPS context.
- Stratified group split (70/15/15 by `experiment_id`) so overlapping windows never cross splits.
- A small three-configuration Random Forest comparison and benign-only Isolation Forest.
- Experiment-level rules/RF/anomaly/shadow-hybrid metrics, calibration error, detection delay, model size, and inference latency.
- Optional local-server shadow inference, disabled by default.

## Reproduce from the repository root

```sh
python -m venv .venv
.venv/bin/python -m pip install -r ml/requirements.txt
.venv/bin/python -m unittest discover -s ml/tests -v
.venv/bin/python -m ml.tests.http_api_smoke
g++ -std=c++17 -Iml/tests/arduino_stub -ISmartT_Core_Demo \
  SmartT_Core_Demo/EventDetector.cpp ml/tests/firmware_event_detector_test.cpp \
  -o /tmp/smartt_event_detector_test && /tmp/smartt_event_detector_test
.venv/bin/python -m ml.training.pipeline
```

The seed is `20260829`. Generated CSVs and `*.joblib` are intentionally ignored; the machine-readable metadata, feature schema, split manifest, metrics, and Markdown report are tracked. Use `--experiments-per-class` only for quick development runs; published metrics use the default 120.

Outputs:

- `ml/data/synthetic/smartt_synthetic.csv` — generated sample rows (ignored)
- `ml/data/processed/window_features.csv` — generated feature windows (ignored)
- `ml/models/smartt_shadow.joblib` — local model bundle (ignored)
- `ml/models/feature_schema.json` and `metadata.json` — schema and provenance
- `ml/reports/splits.json`, `metrics.json`, and `ML_EVALUATION.md` — split and evaluation record

## Feature and leakage discipline

The exact ordered feature list is in `ml/models/feature_schema.json`. It includes window trends, robust dispersion, direction/recovery behavior, raw-filter disagreement, ignition ratios, GPS statistics/freshness, and sensor data quality. It excludes ground truth, subtype, rule prediction, detector state, current event, alert, and existing confidence. `vehicle_id` and `experiment_id` are retained as metadata but are not model inputs.

The model classifies behavior (`NORMAL`, `SLOSHING`, `REFUEL`, `DRAIN`). That differs from the production decision “should this become a theft alert?” An ignition-ON or GPS-moving DRAIN may be real loss behavior for ML evaluation while the deterministic safety gates intentionally refuse to create a theft alert.

## Host reference versus firmware

`DetectorReference` mirrors the firmware median + EMA + rate, stability/slosh calculation, warm-up, ignition/GPS gates, parked baseline, candidates, recovery, confirmation, and alert hold. It operates on calibrated percentage/time samples with normal Python arithmetic. It does not emulate ADS1115/I2C acquisition, Arduino `String`, `millis()` rollover, OLED/Wi-Fi scheduling, or exact C++ floating-point behavior. The firmware remains the source of truth; the host model is a regression oracle kept deliberately small.

## Safe shadow operation

Train the bundle, then opt in:

```sh
SMARTT_ENABLE_ML=1 .venv/bin/python server/app.py
```

The server resamples its approximately 500 ms telemetry buffer to the model's 250 ms feature grid. Until 80% of a 16-second window is present it reports warming up. Shadow outputs are nullable additive telemetry columns and never modify `event_type`, `current_event`, `alert`, `rule_result`, or event-saving logic. Missing scikit-learn/model files or corrupt artifacts cannot block ingestion.

## Status boundaries

IMPLEMENTED / VERIFIED: deterministic invariant guards, host scenarios, reproducible generation, leakage checks, grouped splits, RF/anomaly evaluation, additive migration, and disabled/missing-model fallback.

EXPERIMENTAL / SYNTHETIC: all model scores, feature importance, calibration measurements, and comparison claims.

NOT YET VALIDATED: real sender/tank accuracy, water-tank slosh/drain behavior, vehicle vibration/temperature, real false-alert rate, model probability calibration, and cross-vehicle generalization.

FUTURE: collect independently labelled potentiometer/tank experiments, retrain by grouped experiments, preserve vehicle IDs for per-vehicle studies, and consider learned nonlinear tank calibration. Deep learning is not currently justified; reconsider a 1D CNN only if a substantial real grouped dataset exposes temporal confusions that engineered features cannot resolve.
