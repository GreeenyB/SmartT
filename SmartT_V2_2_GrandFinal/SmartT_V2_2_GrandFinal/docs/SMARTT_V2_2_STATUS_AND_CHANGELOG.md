# SmartT V2.2 Grand Final — Current Status, Architecture and Changelog

**Base project:** `final 1.3.zip`  
**Target:** Bách Khoa Innovation 2026 Grand Final prototype  
**Revision:** SmartT V2.2  

---

## 1. Executive summary

V2.2 restructures SmartT from a mostly monolithic prototype into an **Explainable Hybrid Fuel Intelligence** stack that follows the Grand Final poster logic:

```text
Acquire + validate timestamped samples
→ calibrate tank/sensor data
→ remove spikes and handle gaps
→ estimate vehicle context
→ predict/estimate fuel behavior
→ innovation gating + change-point detection
→ adaptive Kalman correction
→ confirm explainable events
→ telemetry / backend / optional ML evidence
```

The most important design rule is unchanged:

> SmartT must not call every fuel decrease “theft”. A strong event requires persistent fuel evidence, reliable sensor quality, compatible vehicle context, low sloshing evidence and—when available—an unexplained-loss / mass-balance residual.

Machine learning is included **only where it is technically justified**. The STM32 remains deterministic and usable offline; ML lives in the backend and contributes evidence rather than replacing physical/context gates.

---

# 2. What is implemented now

## 2.1 STM32 edge firmware

Implemented in V2.2:

- DYP A02 **UART automatic** receive path, RX-only at application level;
- frame header/checksum/range validation;
- interrupt-safe ultrasonic snapshot;
- piecewise-linear tank calibration framework;
- calibration safety lock (`SMARTT_TANK_CALIBRATION_READY = 0` by default);
- median filtering;
- 2-state fuel Kalman estimator: volume + rate;
- **mode-aware adaptive measurement trust** using motion/slosh/sensor quality;
- innovation / normalized innovation gating;
- Joseph-form covariance update for better numerical robustness;
- MPU6050 motion energy + tilt context;
- GPS freshness, rather than trusting stale fixes indefinitely;
- CAN/OBD acquisition module, disabled safely by default;
- OBD PID support for RPM, speed, engine load, ECU fuel level and optional fuel rate PID `0x5E`;
- exact-zero expected consumption when engine OFF is known;
- ECU fuel-rate integration when PID `0x5E` is actually available;
- ultrasonic vs ECU fuel-level plausibility comparison;
- fuel-waveform + motion + driving-context sloshing score;
- dynamic thresholds based on tank capacity + parked noise;
- time-normalized one-sided CUSUM change-point evidence;
- baseline initialized only after confirmed parked/stable/high-quality conditions;
- event candidate grace/hysteresis;
- candidate → active event lifecycle;
- refuel, sloshing, suspicious fuel loss, theft anomaly, sensor fault and data-quality states;
- reason bitmask + confidence;
- machine-readable event codes separate from human LCD labels;
- unique device ID from STM32 UID;
- vehicle ID in telemetry;
- incident/event sequence numbers;
- immediate confirmed-event telemetry plus periodic snapshots.

## 2.2 ESP32 gateway

Implemented:

```text
STM32 USART2 460800
→ ESP32 UART2
→ bounded JSON queue
→ Wi-Fi
→ HTTP POST /api/v2/ingest
```

Changes versus the older approach:

- UART raised from 115200 to **460800 baud** because the V2 explainable telemetry payload is large; this avoids a long blocking UART transfer every sample;
- HTTP delivery retries;
- confirmed-event records are prioritized over ordinary telemetry when the queue is full;
- queue/drop counters are exposed on Serial;
- malformed/oversized JSON lines are discarded and stream parsing resynchronizes at newline.

The queue is still RAM-only; a gateway reboot can lose unsent records. Persistent flash buffering is a later production hardening task, not required to prove the Grand Final algorithm.

## 2.3 Backend

Implemented:

- Python HTTP ingest service;
- input schema validation;
- SQLite WAL mode;
- telemetry history;
- idempotent incident storage by `(device_id, event_seq)`;
- raw enriched JSON persistence;
- JSONL dataset collection;
- latest/history/incidents APIs;
- operator incident feedback;
- model reload endpoint;
- backend residual engine;
- explainable decision fusion;
- optional ML runtime with graceful deterministic fallback.

---

# 3. Machine learning included in V2.2

V2.2 does **not** ship a fake pre-trained model. There is no legitimate field dataset in the project yet from which to claim a production-quality model.

Instead, the package contains a complete training/inference path that activates when enough real telemetry exists.

## 3.1 Global + vehicle-specific anomaly model

Model:

```text
Isolation Forest
```

Training data:

```text
high-quality NORMAL telemetry only
```

Purpose:

> Learn what normal behavior looks like and flag behavior that is unusual, instead of requiring a large labelled theft dataset.

When enough data exists for an individual vehicle, inference blends:

```text
35% global fleet anomaly score
+ 65% vehicle-specific anomaly score
```

This gives SmartT a personalized behavioral baseline without discarding fleet-level knowledge.

## 3.2 Expected-consumption regression

Model:

```text
HistGradientBoostingRegressor
```

Input examples:

```text
speed
RPM
engine load
motion energy
```

Output:

```text
expected fuel rate [L/h]
```

The model is allowed to train only from:

- an explicit validated `target_consumption_lph`; or
- actual OBD fuel-rate PID data when available.

No synthetic label is generated from the ultrasonic signal itself.

Backend then computes:

```text
observed tank drop
- integrated expected consumption
= unexplained fuel loss
```

## 3.3 Optional sloshing probability model

Model:

```text
StandardScaler + LogisticRegression
```

It trains only if a curated `label_sloshing` field exists with enough examples from both classes. Rule-engine output is intentionally **not** silently reused as ground truth, because doing so would teach ML the same bias as the rule being evaluated.

ML slosh probability can suppress a false-positive candidate; it cannot create a theft decision.

---

# 4. Poster alignment

The poster’s `Explainable Event Detection` flow is covered as follows.

| Poster concept | V2.2 implementation |
|---|---|
| Acquire and validate timestamped samples | A02 UART frame validation, freshness, GPS/CAN timestamps, sensor quality |
| Calibrate level / tank profile | height → piecewise-linear volume LUT |
| Flow | optional OBD PID 0x5E / future direct-flow source; **no direct flow meter is claimed today** |
| Temperature | A02 internal compensation may exist at sensor level; no external temperature channel is currently ingested |
| Remove single-sample spikes / handle gaps | median filter, quality scoring, stale timeout, Kalman uncertainty widening |
| Estimate stable/moving/tilted/rough-road context | GPS/CAN + MPU6050 context engine |
| Predict fuel / mass balance | engine-off zero model, optional ECU fuel rate, backend learned consumption model |
| Innovation gating | normalized innovation statistic in adaptive Kalman stage |
| Change-point detection | one-sided time-normalized CUSUM |
| Adaptive Kalman correction | context/slosh/quality-dependent measurement covariance |
| Confirm event | candidate timer + grace + recovery + event FSM |
| Explainability | confidence + reason codes + residual/model evidence |

This is intentionally close to the poster without pretending that future flow/temperature hardware is already installed.

---

# 5. Main differences from Final 1.3

## 5.1 Ultrasonic driver corrected

**Final 1.3 issue:** driver used the UART-controlled pattern and transmitted `0x55` periodically.

**V2.2:** DYP A02 UART automatic path is RX-only. The sensor streams frames and STM32 parses them.

Additional fix: once `0xFF` header is acquired, the next three bytes are consumed as a complete frame. An in-frame `0xFF` is no longer incorrectly treated as a new header, because the low distance byte can legally equal `0xFF`.

## 5.2 Calibration no longer overclaims

The old prototype was built around a simple level conversion. V2.2 uses a tank height→volume LUT framework but leaves:

```c
SMARTT_TANK_CALIBRATION_READY = 0
```

until the physical demo tank is measured.

While locked:

```text
CALIBRATION_REQUIRED
```

is emitted instead of fake fuel intelligence.

## 5.3 Baseline safety

A first valid sample is no longer automatically trusted as a parked baseline.

Baseline requires:

```text
PARKED_STABLE
+ high sensor quality
+ low slosh
+ low rate
+ no active event
+ confirmation time
```

## 5.4 GPS/context safety

A quiet IMU alone does **not** prove the vehicle is parked.

If no fresh speed or known engine-off evidence exists:

```text
context = UNKNOWN
```

This prevents the system from creating a high-confidence parked-theft interpretation simply because GPS disappeared while a vehicle was moving smoothly.

## 5.5 Adaptive Kalman is now meaningful sensor fusion

Measurement trust `R` changes with:

```text
motion energy
slosh score
sensor quality
tilt / rough-road context
```

Large innovation under disturbance is suppressed. Large innovation under stable/high-quality conditions is allowed to move the state more quickly.

The covariance update now uses the Joseph form for long-running numerical stability.

## 5.6 Change-point detection added

Fixed fast-drop thresholds can miss slow siphoning. V2.2 adds a one-sided CUSUM that accumulates persistent downward evidence.

The CUSUM drift allowance is time-normalized, so behavior does not depend strongly on the A02 frame rate.

## 5.7 Consumption / residual intelligence added

V2.2 adds the concept:

```text
observed fuel loss - expected consumption = unexplained loss
```

Edge hierarchy:

```text
engine OFF known -> expected consumption = 0
fresh OBD PID 0x5E -> integrate ECU fuel rate
otherwise -> edge residual unavailable
```

Backend can add learned expected consumption after a real model has been trained.

## 5.8 CAN implementation moved from placeholder toward usable acquisition

CAN remains **disabled by default** until the real vehicle is verified.

When enabled for the configured profile:

- bit timing is configured for 500 kbit/s with 42 MHz APB1 CAN clock, prescaler 6 and 14 time quanta;
- OBD functional request ID `0x7DF` is used;
- standard responses `0x7E8..0x7EF` are parsed;
- RPM, speed, load, ECU level and optional fuel-rate are collected.

Do not enable the mode on an unknown bus just because the code exists.

## 5.9 Explainability is now an actual data product

V2.2 telemetry includes:

```text
event code
decision state
confidence
reasons[]
baseline
sensor quality
slosh score
innovation score
CUSUM/change-point score
expected consumption
unexplained loss
CAN/GPS/motion context
```

This is what makes the poster’s “Explainable Event Detection” demonstrable on a dashboard.

## 5.10 Event transport reliability improved

Final 1.3 could lose short events between periodic snapshots.

V2.2:

- increments `event_seq` on confirmed incidents;
- transmits confirmed event records immediately;
- retries STM32 UART event delivery if the UART transmit call fails;
- gateway retries HTTP;
- backend uses unique `(device_id, event_seq)` storage to deduplicate replay.

---

# 6. Important things intentionally NOT marked complete

## 6.1 Real tank calibration

**Not complete.** The LUT in `smartt_engine.c` is an example only.

Before enabling detection:

1. measure acoustic face → tank bottom reference;
2. add known liquid volumes;
3. record corresponding heights/distances;
4. replace LUT;
5. set `SMARTT_TANK_CALIBRATION_READY = 1`;
6. validate volume error on points not used for calibration.

## 6.2 A02 frame/pin verification on the physical unit

Code assumes the project’s 4-byte protocol:

```text
FF H L SUM
```

and UART automatic mode. Before the first real demo, capture a few frames from the physical sensor and verify:

- supply voltage;
- wire/pin order;
- UART level;
- baud rate 9600;
- frame checksum;
- distance unit.

Do not change protocol code based only on connector color.

## 6.3 Real vehicle CAN

**Disabled by default.** Enable only after confirming target vehicle protocol/bitrate and wiring.

Not every vehicle exposes every OBD PID. Missing PIDs remain invalid and the algorithm falls back safely.

## 6.4 Trained ML model

**No model is shipped as “trained”** because the project has not yet accumulated the required field dataset.

The ML pipeline is implemented and testable; the claim should be:

> architecture supports learning-based anomaly/consumption/slosh evidence and activates it after validated data collection.

After real data exists, this can become an implemented capability.

## 6.5 Direct differential flow measurement

Not present in current hardware. OBD fuel rate is **ECU-estimated consumption**, not the same as two physical supply/return flow meters.

The downstream residual architecture is compatible with a future direct-flow source.

## 6.6 Production security

Prototype backend still lacks production-grade:

```text
TLS
per-device authentication
secret provisioning
persistent gateway queue
fleet multi-tenancy
OTA/security hardening
```

These are not necessary to validate the Grand Final core algorithm but must be addressed before commercial deployment.

---

# 7. Recommended bring-up order

Follow this order. Do not enable every subsystem at once.

## Stage A — A02 only

```text
A02 UART automatic
→ verify raw distance frames
→ verify checksum/error counters
→ verify no 0x55 is transmitted
```

Keep tank calibration locked.

## Stage B — physical tank calibration

```text
known water volumes
→ measured distance/height
→ fill LUT
→ validate hold-out points
→ unlock calibration
```

Use water / safe test liquid for the bench prototype. Do not place an uncertified hobby ultrasonic setup into fuel vapor service.

## Stage C — filtering and event bench test

Test:

```text
stable level
single spike
sloshing by moving test container
slow drain
fast drain
refill
sensor disconnect
```

Tune thresholds from logs, not by guessing.

## Stage D — MPU context

Verify:

```text
motion energy
roll/pitch
PARKED_STABLE confirmation
rough-road/slosh suppression behavior
```

## Stage E — gateway/backend

Verify:

```text
STM32 JSON at 460800
ESP32 queue
HTTP retry
telemetry history
confirmed incident dedupe
```

## Stage F — CAN/OBD

Only after identifying the vehicle bus:

```text
confirm bitrate
connect SN65HVD230 correctly
keep extra 120-ohm termination disabled on an already terminated vehicle bus
start with passive observation / controlled test
then enable configured OBD polling if appropriate
```

## Stage G — dataset + ML

Collect many hours of normal driving and controlled labelled test scenarios.

Then:

```bash
cd backend
pip install -r requirements.txt
python train_models.py data/telemetry.jsonl
```

Review metrics before relying on ML evidence.

---

# 8. Verification performed on this package

Performed in the build environment used to prepare this revision:

- Python `py_compile` passes for backend modules;
- backend unit tests pass for residual and decision-fusion safety behavior;
- direct ingest into SQLite was exercised successfully;
- key C modules were checked with host GCC using HAL stubs under `-Wall -Wextra -Werror`:
  - `ultrasonic.c`
  - `smartt_can.c`
  - `smartt_engine.c`
  - `smartt_telemetry.c`
  - `gps.c`
- CAN timing in generated `main.c` / `.ioc` was checked mathematically for the configured 500 kbit/s profile;
- USART2 and ESP32 gateway were aligned at 460800 baud.

### Limitation of this verification

The environment used here does not contain `arm-none-eabi-gcc`, so a fresh STM32 ELF was **not** linked from the modified sources here. Open the project in STM32CubeIDE and perform a clean build before flashing.

The C core syntax check is useful, but it is not a substitute for the actual ARM toolchain/linker + board test.

---

# 9. Backend test command

```bash
cd backend
python -m py_compile *.py
PYTHONPATH=. python -m unittest discover -s tests -v
```

Windows PowerShell:

```powershell
cd backend
python -m py_compile app.py decision_engine.py ml_engine.py residual_engine.py train_models.py
$env:PYTHONPATH="."
python -m unittest discover -s tests -v
```

---

# 10. Files that matter most

```text
Core/Inc/smartt_config.h
    hardware/algorithm safety flags and thresholds

Core/Src/ultrasonic.c
    A02 UART automatic parser

Core/Src/smartt_can.c
    optional OBD/CAN context + PID 0x5E

Core/Src/smartt_engine.c
    calibration + adaptive Kalman + context + slosh + CUSUM + FSM

Core/Src/smartt_telemetry.c
    explainable JSON output

ESP32/SmartT_Gateway/SmartT_Gateway.ino
    reliable-ish bridge / priority queue / retry

backend/residual_engine.py
    expected consumption integration and unexplained-loss calculation

backend/ml_engine.py
    optional global + vehicle-specific ML inference

backend/train_models.py
    real-data training pipeline

backend/decision_engine.py
    hybrid explainable evidence fusion

backend/app.py
    ingest/storage/API
```

---

# 11. What to say about the algorithm today

A technically accurate description is:

> SmartT uses a hybrid explainable fuel-intelligence architecture. Ultrasonic fuel measurements are validated and converted through a tank calibration profile, then filtered using a context-aware Kalman estimator whose sensor trust changes with motion, sloshing and signal quality. GPS/CAN and MPU data establish vehicle context, while dynamic thresholds and CUSUM detect persistent changes. When engine state or fuel-rate data is available, SmartT compares observed tank loss with expected consumption to estimate unexplained fuel loss. A deterministic event engine confirms refueling, sloshing, suspicious loss and high-confidence theft anomalies and emits the evidence behind each decision. The backend can add vehicle-specific anomaly detection and learned consumption/sloshing models after sufficient validated field data has been collected; ML remains supporting evidence rather than a black-box final authority.

This description matches what the code architecture actually supports without claiming that untrained ML or uncalibrated hardware is already production-ready.

---

# 12. Final readiness assessment

## Ready as architecture/code foundation

**Yes.** V2.2 is substantially closer to the poster and to the intended Grand Final narrative than Final 1.3.

## Ready to flash and immediately claim accurate fuel/theft detection

**No, not before real tank calibration and A02 frame/pin validation.** The code intentionally prevents that overclaim.

## Ready for ML claim

**Architecture/pipeline: yes. Trained performance claim: no, until real dataset + validation metrics exist.**

That separation is deliberate and is one of the most important technical improvements in this revision.
