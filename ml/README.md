# SmartT ML Workspace

SmartT ML is experimental, synthetic-only, and server shadow-only. It classifies fuel behavior (`NORMAL`, `SLOSHING`, `REFUEL`, `DRAIN`) but never creates or modifies the authoritative ESP32 theft alert.

## Live temporal contract

`LocalServerClient` posts one sample every 500 ms. Training, offline evaluation, and `ShadowInference` therefore use a 500 ms feature grid. The default 16-second candidate window has 33 inclusive expected samples; it requires the entire 16 seconds and at least 85% valid samples (29/33) before inference. Normal packet jitter is tolerated. Large gaps lower coverage and raw-data quality rather than being represented as perfect interpolation.

The benchmark evaluates 8, 12, and 16 second windows on training/validation only, then stores the selected window in the model bundle. Runtime reads that exact window/cadence contract from the bundle.

## Features and runtime parity

There are 34 ordered model features in `ml/models/feature_schema.json`: fuel dynamics, raw-vs-filter disagreement, ignition, GPS context/freshness, sensor quality, sample coverage, and raw missingness. `resample_window` and `feature_vector` are shared by offline evaluation and the live server. `gps_stationary`/`gps_moving` require fresh **GPS speed**, not merely fresh location. Missing raw observations remain missing after preparation and contribute to `raw_missing_ratio`.

## Evaluation semantics

Rows are grouped by experiment ID before split (70/15/15). Windows are queried chronologically without knowing an event onset in advance. A `STEADY`/`ACTIVE_EVENT` window requires at least 80% behavior dominance; `TRANSITION`, `PRE_EVENT`, `ACTIVE_EVENT`, and `RECOVERY` roles are reported explicitly.

The benchmark reports both raw classifier quality and the deployed output after validation-selected `UNKNOWN` abstention. It also reports continuous DRAIN detection delay and benign false-DRAIN episodes. Model selection compares Dummy, Logistic Regression, a depth-3 tree, and Random Forest using validation behavior; similarly performing simpler models are preferred.

Behavior recognition and theft policy are intentionally separate. `EventDetector.cpp` is host-compiled over synthetic time series for a binary parked-theft policy benchmark. An ignition-on or moving DRAIN is not counted as a policy miss.

## Reproduce

```sh
python -m venv .venv
.venv/bin/python -m pip install -r ml/requirements-benchmark.txt
.venv/bin/python -m unittest discover -s ml/tests -v
g++ -std=c++17 -Iml/tests/arduino_stub -ISmartT_Core_Demo \
  SmartT_Core_Demo/EventDetector.cpp ml/tests/firmware_event_detector_test.cpp \
  -o /tmp/smartt_event_detector_test && /tmp/smartt_event_detector_test
.venv/bin/python -m ml.training.pipeline
```

The canonical run generates 120 experiments for each behavior plus 16 fault experiments, then evaluates five fixed synthetic seeds. The final report distinguishes in-distribution from a separate OOD/stress set; no stress samples are used for training.

## Physical data path

Use `ml.data.real.record_experiment` to record BASELINE → EVENT → RECOVERY. At completion it atomically writes a finalized file with every row carrying identical event markers, duration, and completion state. An incomplete non-NORMAL run is saved separately and rejected by `ml.data.schema.load_csv`.

The firmware defaults to `SMARTT_USE_A1_BACKUP_AS_MAIN_FUEL 0`. For a potentiometer on A1, set that macro to `1` and upload firmware, or use A0 as the simulated main source. Before recording, verify current telemetry includes `fuel_raw_adc_a0`, `fuel_raw_adc_a1`, `fuel_volts_a0`, `fuel_volts_a1`, `fuel_percent_raw`, `fuel_percent_filtered`, `gps_data_fresh`, and `gps_speed_fresh`.

## Boundaries

No tank or vehicle performance, field false-alert rate, probability calibration, or cross-vehicle claim has been validated. There is no evidence from this classical, engineered-feature benchmark that CNN/LSTM/TinyML is justified. Physical, independently labelled experiments are the next gate.
