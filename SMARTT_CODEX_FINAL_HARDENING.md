# SmartT — Final Algorithm & ML Hardening Specification

**Purpose:** one final, evidence-driven engineering pass before SmartT moves from synthetic ML experimentation to physical data collection.

**Audience:** Codex working locally at the SmartT repository root.

**Status of this document:** authoritative task specification for this hardening pass. It does **not** replace `AGENTS.md`; repository instructions remain binding.

---

## 0. Mission

The current SmartT repository already contains:

- the authoritative ESP32 fuel-monitoring firmware in `SmartT_Core_Demo/`;
- a deterministic fuel event detector/state machine;
- signal filtering, sloshing logic, ignition/GPS context and confidence logic;
- a local Python/SQLite server;
- a synthetic-data ML workspace under `ml/`;
- Random Forest classification and Isolation Forest anomaly detection;
- optional server-side ML shadow inference;
- initial physical experiment recording tooling.

The previous pass built a good foundation, but an independent audit found that the **ML evaluation methodology is still too optimistic** and the **real-data collection path is not yet safe enough to use as training ground truth**.

This pass must harden those weaknesses without rewriting the working product.

The goal is not to make the report say “100% ML accuracy.”

The goal is:

> Build a benchmark that behaves like SmartT will behave live, distinguish fuel-behavior recognition from theft-alert policy, make training and runtime feature semantics identical, make physical data collection trustworthy, and leave the repository in a reproducible state where the next step can genuinely be physical validation.

Do the implementation, run the tests/benchmarks, update the reports, and self-review the diff. Do not stop at a plan.

---

# 1. Safety and repository rules

Before modifying anything:

1. Read `AGENTS.md` completely.
2. Inspect `git status` and current branch.
3. Read the current ML and detector implementation before editing:
   - `SmartT_Core_Demo/EventDetector.cpp`
   - `SmartT_Core_Demo/EventDetector.h`
   - `SmartT_Core_Demo/FuelFilter.cpp`
   - `SmartT_Core_Demo/FuelSensor.cpp`
   - `SmartT_Core_Demo/GpsContext.cpp`
   - `SmartT_Core_Demo/Types.h`
   - `SmartT_Core_Demo/Config.h`
   - `SmartT_Core_Demo/WebDashboard.cpp`
   - `server/app.py`
   - `ml/config.py`
   - `ml/features/window_features.py`
   - `ml/inference.py`
   - `ml/simulation/generator.py`
   - `ml/simulation/detector_reference.py`
   - `ml/training/pipeline.py`
   - `ml/evaluation/metrics.py`
   - `ml/data/real/record_experiment.py`
   - `ml/data/real/PHYSICAL_EXPERIMENT_PROTOCOL.md`
   - existing ML tests and reports.
4. Do not reset/discard user work.
5. Do not use destructive git commands.
6. Do not rewrite frontend/video assets or unrelated project areas.
7. Do not add cloud dependencies, paid services, API keys, Colab dependencies, TensorFlow, PyTorch, CNNs, LSTMs or Transformers.
8. Keep deterministic firmware authoritative. ML remains optional/shadow-only in this pass.
9. Preserve backward compatibility of the existing local server and dashboard.
10. Do not tune firmware thresholds solely to improve synthetic benchmark scores.

---

# 2. Independent audit observations to reproduce first

Treat these as **audit hypotheses that must be reproduced/verified**, not as values to blindly copy into the final report.

The independent audit observed the following in the submitted repository:

### 2.1 Event-aligned ML evaluation advantage

`ml/features/window_features.py` currently chooses non-NORMAL windows using simulator ground-truth `behavior_start_s` plus fixed offsets.

Conceptually:

```text
simulator knows event onset
        ↓
behavior_start_s
        ↓
select windows around onset
        ↓
classifier evaluation
```

A live system does not know event onset in advance. It continuously evaluates the latest available time window.

The current event-aligned test therefore answers:

> “Can the classifier distinguish classes when given windows chosen around the known event?”

but the production question is:

> “While running continuously, when does SmartT first recognize the event, and how often does it temporarily call benign behavior DRAIN?”

The audit observed that the held-out Random Forest still eventually detected all held-out DRAIN experiments in a rolling simulation, but with a non-zero detection delay and transient benign→DRAIN predictions that the event-aligned report did not expose.

The audit noted approximate values around:

- all held-out DRAIN experiments eventually receiving a DRAIN prediction;
- median first-DRAIN detection around 6 seconds after onset;
- p90 around 7 seconds;
- a substantial number of benign held-out experiments receiving at least one transient DRAIN argmax during continuous rolling inference.

**Reproduce these observations from code/data. Do not copy these numbers into the final report unless your implementation independently regenerates them.**

### 2.2 Runtime window mismatch

Current training uses a nominal 16-second inclusive window.

Current shadow inference starts predicting when only roughly 80% of that duration is available.

Training and runtime must use identical window semantics unless short-window inference is explicitly trained and validated.

### 2.3 Rule-vs-ML semantic mismatch

Current report compares a four-class ML behavior classifier with the deterministic state machine using the same four-class confusion-matrix framing.

That is not fully fair because the deterministic state machine is primarily a **safety-aware alert policy**, not a generic four-class behavior classifier.

Examples:

- `DRAIN_IGNITION_ON` is physically a drain-like signal, so a behavior classifier may correctly output `DRAIN`.
- SmartT's safety policy intentionally must **not** create a new theft alert while ignition is ON.
- `DRAIN_GPS_MOVING` may also represent real fuel decrease behavior but should not be treated as a parked theft alert.

Do not report these intentional alert suppressions as if they were ML-style class-recognition failures.

### 2.4 Python detector reference is not fully equivalent to production C++

The audit observed behavior differences between `ml/simulation/detector_reference.py` and the actual C++ `EventDetector.cpp`, including refuel/ignition semantics.

A benchmark must not silently call the Python rewrite “the hardened SmartT rules” unless equivalence is continuously proven.

The audit compiled the real C++ detector in a host harness and observed metrics that differed from the Python reference.

### 2.5 Synthetic benchmark is currently easy

The audit observed that simple models, including a very shallow decision tree and logistic regression, could achieve extremely strong/perfect results on the current event-aligned synthetic feature set.

Therefore “Random Forest = 100%” does not demonstrate that Random Forest is uniquely powerful. It may demonstrate that the synthetic classes are highly separable under the current evaluation.

### 2.6 Physical recorder/schema problems

Current physical recorder has several issues to verify:

- the entire experiment file is assigned the intended event label even though the protocol asks for a stable baseline before the event and recovery afterward;
- no trustworthy interactive `behavior_start` / `behavior_end` markers are written;
- recorder raw ADC/voltage aliases do not match authoritative firmware fields such as `fuel_raw_adc_a0`, `fuel_raw_adc_a1`, `fuel_volts_a0`, `fuel_volts_a1`;
- GPS location freshness and GPS speed freshness are collapsed too much;
- physical A1 potentiometer instructions do not sufficiently emphasize that `SMARTT_USE_A1_BACKUP_AS_MAIN_FUEL` is currently disabled by default.

### 2.7 Training/runtime missing-data mismatch

Training computes `raw_missing_ratio` from missing raw values.

Runtime resampling currently replaces missing raw values with filtered values before feature extraction, which can make live `raw_missing_ratio` effectively zero even when raw values were missing.

Training and runtime feature semantics must be identical.

### 2.8 Manual test semantics

Manual test-button hold can currently expose `FUEL_THEFT_ANOMALY` even though it is a synthetic/manual demo action.

A manually injected demo event should not masquerade in logs/database as a naturally detected theft anomaly.

---

# 3. Terminology: separate behavior from alert policy

This distinction is mandatory throughout code, metrics and documentation.

## 3.1 Fuel behavior classification

ML may classify the physical time-series behavior as:

- `NORMAL`
- `SLOSHING`
- `REFUEL`
- `DRAIN`
- optionally `UNKNOWN` / `ABSTAIN` at runtime when the model is not confident enough.

`DRAIN` means:

> The observed signal looks like real sustained fuel decrease.

It does **not** automatically mean theft.

## 3.2 Theft-alert policy

The deterministic SmartT state machine decides whether a new theft alert is permitted based on safety/context rules.

Examples:

```text
DRAIN-like signal + ignition ON
=> behavior may be DRAIN
=> NEW theft alert must be suppressed

DRAIN-like signal + confirmed GPS moving
=> behavior may be DRAIN
=> parked theft alert suppressed

DRAIN-like signal + ignition OFF + parked/stationary context + sustained evidence
=> eligible for theft-alert confirmation
```

Reports must stop conflating:

```text
behavior recognition accuracy
```

with:

```text
theft alert policy correctness
```

They are related but different tasks.

---

# 4. Required benchmark architecture

Replace the current single optimistic comparison with a benchmark suite containing at least these independent views.

---

## Benchmark A — static/steady behavior classification

Purpose:

> Test whether models can distinguish stable examples of NORMAL, SLOSHING, REFUEL and DRAIN without hand-picking only one perfect window per event.

Requirements:

1. Generate rolling candidate windows from complete experiments using a fixed stride.
2. Do not use ground-truth onset to decide where the model is queried.
3. Ground truth may be used **after window generation** to label or categorize windows for evaluation.
4. Separate unambiguous steady windows from transition windows.
5. Suggested rule:
   - a steady event window has a high fraction of its samples inside one active behavior region;
   - transition windows are reported separately rather than hidden.
6. The exact overlap threshold must be documented and fixed before looking at final-test performance.
7. Split experiments, never individual overlapping windows.

Report:

- per-class precision/recall/F1;
- macro F1;
- confusion matrix;
- class counts;
- transition-window performance separately.

---

## Benchmark B — continuous rolling/live inference

This is the most important ML benchmark.

Simulate how the server actually works:

```text
telemetry arrives over time
        ↓
maintain latest full window
        ↓
query model at fixed server-like stride
        ↓
prediction/probabilities
        ↓
repeat continuously
```

### Required semantics

- Default model window remains 16 seconds unless validation justifies a different value.
- Do **not** infer before the full trained window is available.
- Use a query stride representative of server telemetry, preferably 0.5 seconds unless a better repository-grounded value is justified.
- All resampling/preprocessing must be the same implementation used in live shadow inference, or a shared function imported by both benchmark and runtime.

### Required DRAIN metrics

For every DRAIN experiment:

- whether DRAIN was ever recognized during the active event;
- first qualifying DRAIN prediction time;
- detection delay from `behavior_start_s`;
- median delay;
- p90 delay;
- miss rate;
- probability trajectory around onset if useful.

### Required benign metrics

For NORMAL/SLOSHING/REFUEL experiments:

- fraction of experiments with at least one DRAIN argmax;
- fraction with at least one DRAIN probability over selected threshold;
- number of transient DRAIN windows;
- longest consecutive DRAIN run;
- false-DRAIN episodes per experiment;
- optionally normalized false-DRAIN episodes per synthetic hour.

Do not call an argmax-only DRAIN prediction a real theft alert. Use terms such as:

- `transient DRAIN prediction`;
- `shadow DRAIN candidate`;
- `false DRAIN behavior prediction`.

---

## Benchmark C — deterministic firmware alert-policy benchmark

Use the **actual production C++ detector implementation** as the authoritative deterministic baseline wherever technically possible.

The preferred approach is to extend/use the existing Arduino stub + host C++ harness so generated experiment rows can be fed into the real `EventDetector.cpp` logic.

Evaluate the deterministic system as an **alert policy**, not as a generic four-class classifier.

Define a ground-truth binary field/concept:

```text
theft_alert_expected
```

For synthetic evaluation, derive it from scenario truth and safety context, not from rule output.

Conceptually:

- eligible parked/OFF DRAIN => expected theft alert;
- ignition-ON DRAIN => no new theft alert expected;
- GPS-moving DRAIN => no parked theft alert expected;
- NORMAL/SLOSHING/REFUEL => no theft alert expected;
- sensor fault => no theft alert expected.

Be explicit about stale/no-GPS fallback semantics.

Report:

- theft-alert recall on alert-eligible DRAIN;
- missed eligible theft-alert rate;
- false theft-alert rate on non-eligible experiments;
- false alerts by benign subtype;
- detection delay for detected eligible events;
- invariant violations, which must be zero.

Do **not** place this binary policy score in the same four-class macro-F1 table as ML behavior classification.

---

## Benchmark D — simple ML baselines vs Random Forest

Add at least:

1. a trivial baseline (`DummyClassifier` or an equivalent sanity check);
2. Logistic Regression with appropriate scaling if needed;
3. shallow Decision Tree, with intentionally small `max_depth` such as 3 or 5;
4. the existing Random Forest.

The purpose is not model shopping.

The purpose is to answer:

> Does Random Forest add meaningful value beyond a simple linear rule or tiny tree on this dataset?

Report validation and final-test results for all models using the same splits and same rolling/steady feature pipeline.

If a depth-3 tree is effectively as good as RF, say so.

Do not market model complexity as intelligence.

---

## Benchmark E — anomaly detector

Keep anomaly detection semantically separate.

It should answer:

> Is this behavior unusual relative to learned benign behavior?

It should not answer:

> Is this definitely theft?

Evaluate on rolling/experiment-level data rather than only event-aligned windows.

Report:

- ROC-AUC / PR-AUC where valid;
- DRAIN detection at chosen operating points;
- benign false-positive rate;
- errors by NORMAL/SLOSHING/REFUEL subtype.

If it adds little useful separation, keep it experimental and state that clearly.

---

# 5. Strengthen the synthetic benchmark without making it unrealistic

Do not merely increase row count.

The important goal is **distribution difficulty and independence**.

## 5.1 Preserve grouped splits

All rows/windows from one `experiment_id` must remain in exactly one of:

- train;
- validation;
- test.

Automate an assertion for this.

## 5.2 Add multiple seeds

The final synthetic benchmark should not depend on one lucky seed.

Run a small fixed suite of deterministic seeds, for example 5 seeds, and report:

- mean;
- standard deviation;
- worst seed;

for the important metrics.

Do not use the seed suite to cherry-pick a best model.

## 5.3 Add an out-of-distribution stress split

Create a clearly separate stress benchmark that is not simply another sample from exactly the same generator distribution.

Use one or more of these mechanisms:

- hold out one synthetic `vehicle_id` profile entirely from training;
- hold out selected difficult subtypes from training and use them only for stress evaluation;
- use non-overlapping parameter ranges for selected rates/amplitudes;
- use a separate stress-generation configuration with more overlap between classes.

Good candidates for held-out/difficult patterns include:

- `DRAIN_WITH_SLOSH`;
- `DRAIN_STAGED`;
- `DRAIN_NEAR_THRESHOLD`;
- `SLOSH_RECOVERY`;
- sloshing with negative net bias;
- noisy/slow refuel;
- short benign downward excursions with recovery;
- ignition transitions inside a model window;
- GPS speed freshness becoming stale while location remains fresh;
- sample jitter / dropped server packets;
- calibration gain/offset variation across synthetic vehicles.

Do not make the stress generator absurdly adversarial. It should represent plausible domain shift.

Report standard grouped synthetic results and stress/OOD results separately.

## 5.4 Increase class overlap deliberately

Current synthetic classes appear highly separable.

Introduce realistic overlap so that simple sign-of-slope rules do not trivially solve every case.

Examples:

- sloshing with a modest negative bias but eventual recovery;
- slow DRAIN close to normal sensor drift;
- DRAIN with oscillation;
- REFUEL with short negative disturbances;
- NORMAL with gradual sender drift;
- intermittent DRAIN with pauses;
- temporary drawdown that fully recovers and must remain benign;
- noisy packet timing.

Do not encode labels through unique parameter ranges that never overlap.

---

# 6. Window labeling must be redesigned for real-time semantics

The current dataset uses experiment-level scenario labels and event onset metadata. That is useful but insufficient for live window evaluation.

Adopt explicit concepts:

```text
scenario_label        # what experiment was designed to test
current_behavior      # what is physically happening at this time
phase                 # BASELINE / EVENT / RECOVERY
behavior_start_s
behavior_end_s
```

Recommended semantics:

- NORMAL experiment: `current_behavior=NORMAL` throughout.
- DRAIN experiment:
  - before behavior start => NORMAL / BASELINE;
  - active drain => DRAIN / EVENT;
  - after event settles => NORMAL / RECOVERY, while `scenario_label` remains DRAIN.
- REFUEL similarly.
- SLOSHING similarly, with active slosh region defined by the simulator/physical marker.

Keep experiment intent separate from row-level behavior.

Do not silently train baseline rows from a DRAIN experiment as DRAIN.

If changing existing CSV column meanings would be too risky, add new explicit columns rather than ambiguously reusing old names. Update schema/version metadata.

---

# 7. Runtime and training preprocessing must share one implementation

There must not be parallel “almost the same” feature preparation logic.

Refactor carefully so both:

- offline benchmark/training; and
- `ml/inference.py` live shadow inference

use shared functions for:

- window selection semantics;
- resampling;
- missing-data handling;
- feature extraction;
- feature ordering;
- GPS freshness interpretation.

Add tests that feed the same synthetic raw window through offline and runtime preprocessing and assert feature vectors are equal or numerically equivalent within a tight tolerance.

This is a hard quality gate.

---

# 8. Full-window warmup only

Unless a short-window model is explicitly trained, tested and versioned separately:

```text
trained on 16 seconds
=> runtime must require the complete 16-second window
```

Do not infer at 80% duration.

Runtime should return a clear status such as:

```text
warming_up = true
prediction = null
```

until required coverage/duration is present.

Define coverage requirements for dropped samples as well.

For example, a nominal 16-second wall-clock span with sparse telemetry should not necessarily be considered a valid full-quality window if coverage is too low.

Choose and document a minimum coverage based on validation, and expose a data-quality field if appropriate.

---

# 9. GPS semantics must match firmware

Firmware distinguishes:

- `gps_data_fresh` / location freshness;
- `gps_speed_fresh` / speed freshness.

Motion context must depend on **speed freshness**, not merely location fix freshness.

Update ML row/schema/features as needed to preserve both.

Do not infer stationary/moving from a stale speed just because the GPS location is fresh.

Required tests:

1. location fresh + speed fresh + <=3 km/h;
2. location fresh + speed fresh + >=8 km/h;
3. location fresh + speed stale;
4. location stale + speed fresh if representable;
5. both stale;
6. no fix.

Live preprocessing and synthetic generator must use the same semantic definitions as firmware or explicitly document any unavoidable difference.

---

# 10. Missing raw-signal semantics must match runtime

Current `raw_missing_ratio` must either:

### Preferred

Preserve an explicit raw-observed/missing mask through resampling and calculate the live feature honestly.

or:

### Acceptable simplification

Remove `raw_missing_ratio` from both training and runtime feature schemas until missingness can be represented correctly.

Do not leave a feature whose training value can be non-zero but live value is structurally almost always zero.

Add a regression test containing missing raw samples.

---

# 11. Add abstention / UNKNOWN for weak ML predictions

Current runtime always chooses the argmax class once warmed up.

This can turn a weak distribution such as:

```text
DRAIN 0.34
SLOSHING 0.31
NORMAL 0.29
REFUEL 0.06
```

into the apparently categorical statement:

```text
prediction = DRAIN
```

which is misleading.

Add a validation-selected abstention policy.

Possible design:

```text
if max_class_probability < T_class:
    prediction = UNKNOWN
else:
    prediction = argmax
```

For a DRAIN shadow candidate, consider a separate conservative threshold and temporal persistence.

Example concept only — do not hardcode these numbers without validation:

```text
P(DRAIN) >= threshold
for N consecutive live queries
or M of last K queries
=> ml_drain_candidate = true
```

Choose threshold/persistence using **validation only**, then freeze before final test.

Report operating points / tradeoffs instead of pretending one threshold is universally optimal.

Useful validation operating points include benign false-positive targets around several levels (for example 1%, 5%, 10%) where the data permits, showing corresponding DRAIN recall and detection delay.

ML remains shadow-only regardless.

---

# 12. Distinguish raw prediction from stabilized shadow state

If persistence is added, expose both:

```text
ml_raw_prediction
ml_raw_probability

ml_prediction              # may be UNKNOWN
ml_drain_candidate          # stabilized shadow state
ml_candidate_age / streak   # optional
```

Do not overwrite raw information.

This makes debugging physical experiments much easier later.

Do not let any ML field create or modify `FUEL_THEFT_ANOMALY` in this pass.

---

# 13. Production C++ detector must be the rule authority

The Python detector reference may remain useful for simulation convenience, but it must not silently be the source of truth for firmware performance.

Implement one of these, preference in order:

### Option A — preferred

Create/extend a host C++ benchmark runner that compiles the actual:

- `EventDetector.cpp`;
- required detector dependencies / stubs;

and feeds synthetic experiments through it.

It should output machine-readable per-experiment results for the Python evaluation pipeline.

### Option B

If a complete host runner is impractical, create strong differential tests comparing Python reference and C++ behavior across generated scenarios, and clearly limit claims to scenarios where equivalence is proven.

The final report must state exactly which implementation produced deterministic metrics.

---

# 14. Fix manual-test event identity

Inspect `EventDetector::applyTestButtonOverride`.

A manually injected demo/test event must not be stored/reported as a naturally detected `FUEL_THEFT_ANOMALY`.

Preserve an explicit test identity such as:

```text
FUEL_THEFT_TEST
```

through the manual hold period.

A human/test-button action and an automatically detected anomaly are different evidence.

Add regression coverage so test-button activity cannot contaminate future physical ground-truth/event logs as a real detector-confirmed anomaly.

Do not break the visual demo behavior unnecessarily; change semantics, not presentation, unless presentation currently depends on the wrong event code.

---

# 15. Physical experiment recorder must be made trustworthy before use

This is a P0 deliverable.

Do not ask the user to collect physical training data until these changes pass tests.

## 15.1 Record baseline, event and recovery separately

The recorder should support an experiment timeline like:

```text
start recorder
    ↓
BASELINE
    ↓
operator marks BEHAVIOR START
    ↓
EVENT
    ↓
operator marks BEHAVIOR END
    ↓
RECOVERY
    ↓
stop recorder
```

Provide an ergonomic interaction, for example Enter-key markers or an equivalent robust method.

The output must record:

- experiment start;
- `behavior_start_s`;
- `behavior_end_s`;
- phase per row;
- scenario label;
- current ground-truth behavior or enough metadata to derive it unambiguously.

Do not label pre-event baseline rows as DRAIN/REFUEL/SLOSHING merely because the experiment's scenario label is DRAIN/REFUEL/SLOSHING.

## 15.2 Preserve both wall-clock and relative time

Prefer recording:

- `timestamp_iso` for traceability;
- `timestamp_s` relative to experiment start for training/resampling.

The training loader must consume the same canonical schema used by synthetic data or explicitly normalize both through a shared loader.

## 15.3 Map authoritative firmware fields correctly

The firmware currently emits fields including:

```text
fuel_raw_adc_a0
fuel_raw_adc_a1
fuel_volts_a0
fuel_volts_a1
fuel_percent_a0
fuel_percent_a1
fuel_percent_raw
fuel_percent_filtered
fuel_rate_percent_per_sec
gps_data_fresh
gps_speed_fresh
gps_stationary
gps_moving
sensor_healthy
...
```

The recorder must read these exact authoritative fields.

Prefer keeping A0 and A1 as separate columns rather than collapsing them to an ambiguous single `raw_adc`/`voltage` field.

Record the selected main fuel source/config if feasible.

Add unit tests using a representative firmware payload fixture copied from the actual JSON schema, not an invented alias-only payload.

## 15.4 A1 potentiometer instructions

The physical protocol must explicitly state that the project currently has:

```cpp
#define SMARTT_USE_A1_BACKUP_AS_MAIN_FUEL 0
```

by default.

For an A1 potentiometer experiment, either:

- intentionally set/configure A1 as the main fuel source; or
- use the correct channel/setup without changing semantics.

Do not let the operator think they are recording A1 while the detector/training stream is actually based on A0.

Document the exact verification step before recording.

## 15.5 Recorder quality checks

At experiment end, print a compact validation summary:

- row count;
- duration;
- baseline duration;
- event duration;
- recovery duration;
- missing raw ratio;
- GPS speed-fresh ratio;
- sensor healthy ratio;
- min/max filtered fuel;
- whether behavior markers were valid and ordered.

If markers are missing for a non-NORMAL scenario, the file should be clearly marked incomplete and should not silently enter training.

---

# 16. Add a canonical loader for synthetic and real experiments

Do not make training code separately understand several ad-hoc CSV formats.

Create a shared loader/schema normalization layer that:

- validates required columns;
- accepts synthetic records;
- accepts physical recorder records;
- normalizes booleans/numbers/timestamps;
- preserves missingness;
- rejects malformed experiment IDs/marker ordering;
- exposes a canonical in-memory row schema;
- attaches a schema version.

Unit test it with:

- synthetic fixture;
- physical fixture;
- missing raw fields;
- stale speed freshness;
- malformed markers;
- old/legacy data if backward compatibility is intentionally supported.

---

# 17. Reproducible benchmark environment

Current `ml/requirements.txt` uses broad version ranges.

Keep a human-friendly broad requirements file if desired, but add a reproducible benchmark environment artifact, for example:

```text
ml/requirements-benchmark.txt
```

with pinned versions used for the final benchmark.

Record at least:

- Python version;
- NumPy version;
- scikit-learn version;
- joblib version.

Do not include the entire unrelated workstation environment.

The benchmark report must identify the exact environment used.

A fresh venv created from the pinned benchmark requirements should be able to regenerate the benchmark.

---

# 18. Benchmark outputs must be auditable

In addition to summary metrics, save machine-readable artifacts sufficient to audit claims.

Recommended outputs:

```text
ml/reports/metrics.json
ml/reports/splits.json
ml/reports/rolling_predictions_test.csv
ml/reports/alert_policy_results.csv
ml/reports/model_comparison.csv
ml/reports/ML_EVALUATION.md
```

Names may differ if the existing structure suggests better ones.

For rolling predictions, include at least:

- experiment ID;
- timestamp/window end;
- scenario label;
- current behavior;
- subtype;
- predicted class;
- max probability;
- DRAIN probability;
- UNKNOWN/abstain status;
- stabilized DRAIN candidate state if implemented;
- anomaly score.

Do not commit huge redundant generated files if they are easily reproducible. Small report CSVs are fine.

---

# 19. Model-selection discipline

Use train + validation for:

- model choice;
- RF parameters;
- window-size decision if reconsidered;
- abstention threshold;
- DRAIN threshold/persistence;
- anomaly threshold.

The final test set must not influence those choices.

If you add OOD/stress data, define whether it is:

- a final stress test only; or
- part of validation.

Do not repeatedly inspect final-test errors and tune to them while still calling it an untouched final test.

If the existing repository has already used the current test set extensively during development, acknowledge that the original “final test” is no longer pristine and create a new deterministic held-out benchmark split or seed set for the final hardening report.

This is important.

---

# 20. Do not use overall accuracy as the main SmartT metric

For behavior classification, prioritize:

- macro F1;
- DRAIN recall;
- SLOSHING→DRAIN errors;
- REFUEL→DRAIN errors;
- NORMAL→DRAIN errors;
- UNKNOWN rate;
- rolling detection delay;
- benign transient DRAIN episode rate.

For theft-alert policy, prioritize:

- alert recall on eligible drain;
- false theft alerts;
- missed eligible events;
- alert delay;
- zero safety-invariant violations.

A 99% accuracy number can coexist with a bad false-theft rate if the dataset is imbalanced or windows are correlated.

---

# 21. Hybrid architecture for this pass

The architecture must remain conservative:

```text
ESP32 sensors
    ↓
production deterministic detector
    ↓
authoritative current alert/event path
    ↓
server telemetry
    ↓
optional ML shadow inference
    ↓
raw prediction + probabilities + anomaly score + stabilized shadow candidate
    ↓
logging / evaluation only
```

ML must not create or modify the production theft alert in this pass.

No TinyML port.

No model in ESP32 firmware.

No deep learning.

No “AI confidence” wording unless calibration on real data later supports it.

Use terms such as:

- model probability;
- model score;
- shadow classification.

---

# 22. Server backward compatibility

Preserve current endpoints and dashboard behavior, especially:

- `/api/health`
- `/api/latest`
- `/api/history`
- `/api/events`
- `/api/ingest`

ML disabled must behave as before.

Missing/corrupt model must fail open without breaking ingestion.

Any SQLite changes must be additive/backward compatible.

Do not make server startup require scikit-learn unless ML is enabled if the current architecture can avoid it.

If new shadow fields are stored, keep them explicitly separate from deterministic alert fields.

---

# 23. Required automated tests

At minimum, add/retain automated tests for all of the following.

## 23.1 Deterministic detector invariants

- ignition ON cannot confirm a NEW theft anomaly;
- sensor fault cannot create theft;
- moving GPS context cannot create parked theft;
- stale/no GPS falls back intentionally;
- candidate recovery cancels correctly;
- refuel and theft candidates do not contaminate each other;
- confirmed OFF theft alert followed by ignition ON obeys the documented hold semantics;
- test-button events remain clearly TEST events, not natural anomalies.

## 23.2 Split/leakage

- no experiment ID crosses train/validation/test;
- no forbidden ground-truth/rule/alert fields enter model features;
- final/stress splits are deterministic;
- window overlap cannot leak one experiment across splits.

## 23.3 Runtime/offline parity

Given the same raw canonical window:

- same resampling;
- same missing mask semantics;
- same GPS freshness semantics;
- same feature order;
- same feature values within tolerance.

## 23.4 Full warmup

- no prediction before complete trained window requirements are met;
- prediction starts only after valid coverage.

## 23.5 Recorder

- exact firmware field mapping for A0/A1;
- behavior markers;
- relative timestamps;
- baseline/event/recovery labeling;
- GPS data vs speed freshness;
- malformed/incomplete experiment handling;
- output file refusal to overwrite existing run unless explicitly designed otherwise.

## 23.6 Reproducibility

- same seed => same synthetic dataset/benchmark split;
- benchmark report regenerates deterministically within expected numerical tolerance.

---

# 24. Firmware build gate

The independent audit was able to host-compile detector logic, but not a full ESP32 sketch because Arduino/PlatformIO tooling was unavailable in that environment.

On this local development machine:

1. Check whether the required Arduino CLI / PlatformIO / existing build tooling is already available.
2. If available, compile the authoritative `SmartT_Core_Demo` firmware.
3. Do not install a large new global toolchain without need/permission if the repository does not already use one.
4. If full firmware compile cannot be performed, report the exact missing tool/dependency and do not claim it passed.

Host C++ detector tests are still required.

---

# 25. Generator realism checks

Add diagnostics so synthetic realism is inspectable rather than assumed.

For each class/subtype, report ranges/distributions of important quantities such as:

- net change;
- slope;
- total movement;
- direction changes;
- duration;
- GPS state;
- ignition state.

Look for accidental trivial label encodings, e.g.:

```text
all DRAIN slopes < -0.5
all SLOSHING slopes > -0.1
```

with a huge empty gap.

If found, increase realistic overlap.

A small diagnostic plot or CSV summary is acceptable; do not create a large visualization framework.

---

# 26. Feature-importance sanity check

Report model feature importance, but do not interpret it as causal truth.

Run a simple ablation/sanity comparison such as:

- fuel-only dynamics;
- fuel + ignition;
- fuel + GPS/context;

or another compact, justified decomposition.

Purpose:

> Determine whether context features genuinely help behavior recognition or whether fuel slope alone solves the synthetic generator.

Do not explode this into dozens of experiments.

---

# 27. Honest decision framework after rerun

At the end, choose one of these evidence-based statuses.

## Status A — deterministic system only is justified

Use if:

- simple rules/models are already sufficient;
- RF adds no robust improvement;
- rolling false-DRAIN behavior is too noisy;
- OOD performance is weak.

Keep ML experimental only.

## Status B — ML shadow mode is justified

Likely current target.

Use if:

- ML recognizes drain/slosh/refuel patterns usefully;
- rolling behavior is reasonable;
- but evidence remains synthetic and physical false-alarm behavior is unknown.

Keep deterministic alerts authoritative.

## Status C — hybrid alert research is worth a future experiment

Only recommend for a future phase if:

- grouped + rolling + stress synthetic results are strong;
- then physical dataset confirms the advantage;
- probability/persistence behavior is stable;
- no safety invariant is weakened.

Do **not** implement Status C alert authority in this pass.

---

# 28. Deep learning decision

Do not implement deep learning now.

The final report must answer only:

> Is there evidence that a sequence model such as 1D CNN would solve a specific remaining temporal confusion that engineered features cannot?

If Logistic Regression / shallow tree / RF already perform similarly, the answer is no.

If physical rolling data later shows repeated temporal-pattern failures, revisit then.

“Deep learning sounds more advanced” is not sufficient justification.

---

# 29. Documentation updates

Update the relevant ML documentation so there is one coherent story.

The final documentation must clearly distinguish:

### IMPLEMENTED / VERIFIED

- deterministic detector invariants actually covered by tests;
- ML pipeline components actually implemented;
- shadow inference behavior;
- benchmark commands that actually run.

### SYNTHETIC EVIDENCE

- grouped benchmark results;
- rolling results;
- OOD/stress results;
- model comparison.

### NOT YET PHYSICALLY VALIDATED

- real tank detection performance;
- real sender slosh behavior;
- real false-theft rate;
- real probability calibration;
- field vehicle performance.

### NEXT PHASE

- A1 potentiometer test;
- sender + water tank;
- grouped physical retraining/evaluation;
- only then consider more alert authority or sequence models.

Remove/rewrite any old headline that makes the event-aligned 100% RF score appear to be the primary final result.

Historical metrics may remain if clearly labeled as superseded methodology.

---

# 30. Required final report structure

Rewrite `ml/reports/ML_EVALUATION.md` (or equivalent canonical report) with at least:

1. **Executive conclusion**
2. **What is being predicted**
   - behavior vs theft alert
3. **Dataset and schema**
4. **Train/validation/test discipline**
5. **Synthetic generator realism and limitations**
6. **Simple model comparison**
   - Dummy
   - Logistic Regression
   - shallow tree
   - Random Forest
7. **Steady-window benchmark**
8. **Continuous rolling/live benchmark**
9. **Deterministic C++ alert-policy benchmark**
10. **Anomaly detector benchmark**
11. **OOD/stress benchmark**
12. **Runtime/offline parity**
13. **Model size/inference cost**
14. **Error analysis**
15. **What ML is allowed to do today**
16. **What remains unvalidated**
17. **Physical data collection readiness**
18. **Deep-learning decision**
19. **Exact reproduction commands and environment**

Do not bury limitations at the bottom after a marketing-style headline.

---

# 31. Preferred command ergonomics

After implementation, a new engineer should be able to do something close to:

```bash
python -m unittest discover -s ml/tests -v
python -m ml.training.pipeline
```

and regenerate all primary benchmark artifacts.

If the benchmark becomes modular, a clear command such as:

```bash
python -m ml.evaluation.benchmark
```

is welcome, but do not create redundant entry points unnecessarily.

Document exact commands from repository root.

---

# 32. Do not bloat the repository

The submitted archive contained large disposable dependency directories such as `.venv` and frontend `node_modules`.

Do not modify/remove user environments just for this task unless explicitly safe, but ensure `.gitignore` keeps generated/dependency content out of source control.

Generated synthetic raw CSVs and model artifacts should be handled intentionally:

- commit only if they are small and useful as canonical fixtures;
- otherwise make them reproducible and ignored.

Do not create another massive archive inside the repo.

---

# 33. Acceptance gates — must all be addressed before declaring completion

## Gate 1 — safety

- [ ] NEW theft alert impossible while ignition ON.
- [ ] Sensor fault cannot create theft.
- [ ] GPS moving cannot create parked theft.
- [ ] Manual test cannot masquerade as naturally detected anomaly.

## Gate 2 — benchmark validity

- [ ] No event-onset knowledge used to decide when live model is queried.
- [ ] Full-window runtime semantics match training.
- [ ] Rolling detection delay is reported.
- [ ] Benign transient DRAIN behavior is reported.
- [ ] Behavior classification and theft alert policy are separate.
- [ ] Production C++ detector is the deterministic authority or parity is proven.

## Gate 3 — model sanity

- [ ] Dummy/simple baselines included.
- [ ] RF advantage, if any, is measured rather than assumed.
- [ ] Multi-seed results exist.
- [ ] OOD/stress results exist.
- [ ] No forbidden features/leakage.
- [ ] Weak predictions can abstain/UNKNOWN.

## Gate 4 — runtime parity

- [ ] Offline and live feature vectors match for same input.
- [ ] GPS speed freshness is preserved.
- [ ] Raw missingness is preserved or feature removed consistently.
- [ ] Missing model still fails open.
- [ ] ML remains shadow-only.

## Gate 5 — physical-data readiness

- [ ] Recorder maps exact firmware A0/A1 fields.
- [ ] Recorder stores relative time.
- [ ] Behavior start/end markers work.
- [ ] Baseline/event/recovery are not mislabeled.
- [ ] Canonical loader accepts physical data.
- [ ] A1 main-source configuration is explicitly documented.
- [ ] Incomplete experiments are rejected/flagged.

## Gate 6 — reproducibility

- [ ] Pinned benchmark requirements/environment exists.
- [ ] Unit/regression tests pass.
- [ ] Host C++ detector tests pass.
- [ ] Full firmware build passes if local tooling exists, otherwise limitation stated exactly.
- [ ] Benchmark regenerates reports from source.

## Gate 7 — claims

- [ ] No synthetic metric is presented as real-world accuracy.
- [ ] Old 100% event-aligned score is not the headline proof.
- [ ] Physical validation is explicitly pending until it actually happens.
- [ ] Deep learning is not added without evidence.

---

# 34. Implementation order

Follow this order to avoid mixing methodology changes with model tuning.

## Phase 1 — reproduce audit

- Run current tests/training.
- Reproduce current metrics.
- Add a temporary or permanent rolling evaluator and reproduce the discrepancy between event-aligned and continuous inference.
- Confirm C++ vs Python reference differences.
- Confirm recorder field/schema issues.

Do not start tuning models before this is understood.

## Phase 2 — shared data/preprocessing semantics

- canonical schema/loader;
- row-level phase/current-behavior semantics;
- shared resampling;
- full-window requirement;
- GPS speed freshness;
- raw missingness;
- runtime/offline parity tests.

## Phase 3 — trustworthy rolling benchmark

- rolling windows;
- detection delay;
- false-DRAIN episodes;
- transition behavior;
- new clean train/validation/test discipline if the old test set is already contaminated by development decisions.

## Phase 4 — deterministic C++ alert benchmark

- actual production detector harness;
- eligible-alert truth;
- safety policy metrics;
- manual-test semantic fix.

## Phase 5 — model sanity / robustness

- Dummy;
- Logistic Regression;
- shallow Decision Tree;
- Random Forest;
- anomaly detector;
- multi-seed;
- OOD/stress;
- compact feature/context sanity comparison.

## Phase 6 — conservative runtime shadow hardening

- UNKNOWN/abstention;
- validation-selected DRAIN threshold/persistence if justified;
- raw vs stabilized shadow output;
- no production alert authority.

## Phase 7 — physical recorder readiness

- interactive markers;
- exact firmware mappings;
- canonical physical loader;
- protocol rewrite;
- recorder tests/quality summary.

## Phase 8 — final quality gates and report

- rerun everything;
- full diff review;
- benchmark environment pinning;
- firmware compile if available;
- update canonical docs;
- remove misleading claims;
- final concise completion summary.

---

# 35. Final completion response expected from Codex

When finished, do not merely say “done.”

Report:

1. Files changed/created.
2. Audit findings reproduced and whether each was confirmed.
3. Exact test commands and PASS/FAIL status.
4. Whether full ESP32 firmware compilation was performed.
5. Final dataset/experiment counts.
6. Split methodology.
7. Simple-model comparison.
8. Random Forest results.
9. Continuous rolling DRAIN detection delay.
10. Continuous benign transient-DRAIN statistics.
11. DRAIN threshold/abstention/persistence policy, if implemented, and how it was selected.
12. OOD/stress results.
13. Actual C++ deterministic alert-policy results.
14. Anomaly-detector results.
15. Offline/runtime parity test result.
16. Physical recorder readiness and exact test procedure.
17. Whether ML is genuinely adding value after the stronger benchmark.
18. What ML is allowed to do in production today.
19. What remains unvalidated until physical data is collected.
20. Whether deep learning has any evidence-based reason to be attempted next.

Finally state one of:

- `FINAL STATUS: DETERMINISTIC ONLY`
- `FINAL STATUS: ML SHADOW READY FOR PHYSICAL VALIDATION`
- `FINAL STATUS: NOT READY — BLOCKERS REMAIN`

Do not declare a more advanced status than the evidence supports.

---

# 36. Definition of success for this pass

Success is **not** obtaining the highest possible synthetic score.

Success means the repository can honestly say:

> SmartT has a hardened deterministic fuel-theft detector and a reproducible experimental ML pipeline. The ML system is evaluated using group-safe, continuous rolling inference rather than event-aligned windows; runtime preprocessing matches training; weak predictions can abstain; the production C++ detector is evaluated under the correct alert-policy semantics; and the physical recorder is ready to collect independently labeled baseline/event/recovery data. ML remains shadow-only until physical validation proves that it reduces errors in real sensor conditions.

If the strengthened benchmark makes the ML numbers worse, that is acceptable and scientifically preferable to an unrealistic perfect score.

