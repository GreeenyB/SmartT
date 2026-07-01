# SmartT MVP Fuel Detection Algorithm — Codex Handoff

## 0. Context

Project: **SmartT — Real-time IoT Fuel Monitoring & Fleet Telemetry Platform**  
Team: **BKUIT**  
Competition: **Bach Khoa Innovation 2026 — Round 2**

Current MVP hardware path:

```text
Fuel sender / potentiometer
→ ADS1115
→ ESP32
→ OLED / Serial / local dashboard
→ fuel drop / fuel theft anomaly detection
```

Current file to improve:

```text
SmartT_Core_Demo.ino
```

The existing sketch already works with:

- ESP32
- ADS1115 on I2C GPIO21/GPIO22
- SPI OLED 7-pin
- ignition switch on GPIO19 with `INPUT_PULLUP`
- test button on GPIO4 with `INPUT_PULLUP`
- local Wi-Fi AP dashboard
- Serial JSON telemetry

The request is **not** to rewrite the whole project. Keep the current wiring, dashboard, OLED, JSON style, and demo flow. Improve only the fuel detection algorithm so the demo becomes more stable and more realistic.

---

## 1. Current algorithm summary

The current sketch reads A0/A1 from ADS1115, converts voltage to fuel percent, applies a simple EMA filter, then compares the current filtered fuel level with a reference fuel level from a fixed time window.

Current important constants:

```cpp
const float FILTER_ALPHA = 0.18f;
const float DROP_THRESHOLD_PERCENT = 8.0f;
const float REFUEL_THRESHOLD_PERCENT = 8.0f;
const uint32_t DROP_WINDOW_MS = 5000;
const uint32_t ALERT_HOLD_MS = 6000;
const uint32_t SAMPLE_INTERVAL_MS = 250;
```

Current detection idea:

```text
filteredFuelPercent - windowReferenceFuelPercent <= -8%
→ fast drop

If ignition ON:
  event = FAST_DROP_IGN_ON

If ignition OFF:
  event = SUSPICIOUS_DROP
  alert = FUEL_THEFT_ANOMALY
```

This is fine for a first demo, but it is too simple for a stable prototype.

---

## 2. Main problems in the current algorithm

### 2.1 Fixed 5-second reference window is too rigid

The current code resets `windowReferenceFuelPercent` every `DROP_WINDOW_MS`. This can miss some drops and can also detect false drops depending on where the window starts.

Example:

```text
Window starts at 80%
Fuel slowly/noisily moves: 80 → 75 → 72
If drop crosses threshold before reset → alert
If reset happens at 75 → later drop may look smaller
```

### 2.2 Fuel sender noise and shaking are not handled robustly

The fuel sender / float can jump due to:

- hand movement during demo
- breadboard contact noise
- ADC noise
- float mechanical bouncing
- fuel slosh in a real tank

A single EMA helps, but it is not enough. EMA alone can still follow sudden spikes and create false window deltas.

### 2.3 No candidate/confirmation stage

The current algorithm raises alert immediately when threshold is crossed. A better real system should do:

```text
suspicious drop observed
→ candidate state
→ confirm it remains true for a short time
→ only then raise theft alert
```

For a demo, this confirmation can be short, around 2–3 seconds. For a real deployment, this would be longer.

### 2.4 No parked baseline

Fuel theft usually matters most when the vehicle is OFF/parked. When ignition turns OFF, the algorithm should remember a **parked baseline fuel level** after a short settling period.

Then theft detection becomes clearer:

```text
Vehicle OFF
baseline fuel = 72%
current fuel = 64%
confirmed drop = 8%
→ possible theft
```

This is more stable than comparing with a constantly resetting 5-second window.

### 2.5 No hysteresis / recovery logic

If fuel drops briefly and then returns, the algorithm should cancel the candidate. The current algorithm does not have a clean recovery/cancel mechanism.

### 2.6 Refuel and theft can conflict

A rise in fuel should be treated separately from theft. After refuel is confirmed, the baseline must update. Otherwise, the detector may compare against an old baseline and behave strangely.

### 2.7 No sensor health checks

The algorithm should detect obviously bad readings:

- ADS1115 missing
- voltage outside expected range
- ADC stuck at one value for too long
- sudden impossible jump caused by wiring issue

For the Round 2 demo, this does not need to be perfect, but it should avoid showing a theft alert when the sensor is unplugged.

---

## 3. Recommended MVP algorithm

Use a **small finite-state detector** with preprocessing, parked baseline, candidate confirmation, and hysteresis.

Recommended pipeline:

```text
ADS1115 raw sample
→ voltage / percent calibration
→ median filter
→ EMA filter
→ rate calculation
→ state machine detector
→ event / alert / confidence
→ OLED / Serial / dashboard
```

The goal is not a complex ML model. For Round 2, a deterministic algorithm is better because it is explainable, debuggable, and reliable in front of judges.

---

## 4. Preprocessing recommendation

### 4.1 Keep voltage-to-percent calibration

Keep the current function:

```cpp
float voltageToPercent(float volts, float emptyVolts, float fullVolts)
```

It already supports reversed calibration because `fullVolts - emptyVolts` can be negative. Do not break this.

### 4.2 Add a small median filter before EMA

Use a median filter over the last 5 percent samples.

Reason:

```text
Raw samples: 70, 71, 92, 70, 71
Median = 71
```

The spike `92` gets rejected.

Suggested buffer size:

```cpp
const uint8_t FUEL_MEDIAN_SIZE = 5;
```

### 4.3 Use EMA after median

After median filtering, apply EMA:

```cpp
filtered = filtered + alpha * (medianValue - filtered);
```

Suggested values:

```cpp
const float FUEL_EMA_ALPHA_DEMO = 0.18f;  // responsive enough for demo
const float FUEL_EMA_ALPHA_FIELD = 0.06f; // smoother for real vehicle later
```

For the current Round 2 demo, keep around `0.15–0.22`.

### 4.4 Calculate fuel rate

Track how fast fuel changes:

```text
fuelRatePctPerSec = (filteredFuel - previousFilteredFuel) / dtSeconds
```

Example:

```text
72% → 66% in 3 seconds
rate = -2.0 %/s
```

This helps distinguish a real fast drop from slow consumption.

---

## 5. New detector state machine

Add a detector state enum:

```cpp
enum FuelDetectorState {
  DETECTOR_BOOT,
  DETECTOR_NORMAL_ON,
  DETECTOR_OFF_SETTLING,
  DETECTOR_PARKED_MONITORING,
  DETECTOR_DROP_CANDIDATE,
  DETECTOR_THEFT_ALERT,
  DETECTOR_REFUEL_CANDIDATE,
  DETECTOR_SENSOR_FAULT
};
```

State meaning:

| State | Meaning |
|---|---|
| `DETECTOR_BOOT` | Initial state after boot. |
| `DETECTOR_NORMAL_ON` | Vehicle/ignition is ON. Do not raise theft alert. Fast drops are only logged. |
| `DETECTOR_OFF_SETTLING` | Vehicle just turned OFF. Wait briefly before setting parked baseline. |
| `DETECTOR_PARKED_MONITORING` | Vehicle is OFF and baseline is ready. Monitor suspicious drop. |
| `DETECTOR_DROP_CANDIDATE` | Fuel drop looks suspicious but is not confirmed yet. |
| `DETECTOR_THEFT_ALERT` | Confirmed suspicious fuel drop while ignition is OFF. |
| `DETECTOR_REFUEL_CANDIDATE` | Fuel level increased enough to look like refuel. Confirm before accepting. |
| `DETECTOR_SENSOR_FAULT` | Sensor reading is invalid or ADS1115 is missing. |

---

## 6. Recommended constants

Use demo-friendly thresholds first. They should be easy to trigger by moving the float but not too sensitive.

```cpp
// Filtering
const uint8_t FUEL_MEDIAN_SIZE = 5;
const float FUEL_EMA_ALPHA = 0.18f;

// Ignition/off behavior
const uint32_t IGNITION_OFF_SETTLE_MS = 2500;

// Theft detection for demo
const float THEFT_MIN_TOTAL_DROP_PCT = 6.0f;
const float THEFT_MIN_RATE_PCT_PER_SEC = -0.8f;
const uint32_t THEFT_CONFIRM_MS = 2200;
const uint32_t THEFT_ALERT_HOLD_MS = 8000;
const float THEFT_CANCEL_RECOVERY_PCT = 2.0f;

// Refuel detection for demo
const float REFUEL_MIN_RISE_PCT = 7.0f;
const uint32_t REFUEL_CONFIRM_MS = 1800;

// Baseline maintenance
const float BASELINE_STABLE_RATE_ABS_PCT_PER_SEC = 0.20f;
const uint32_t BASELINE_STABLE_UPDATE_MS = 5000;

// Sensor validation
const float SENSOR_VALID_LOW_MARGIN_PCT = -5.0f;
const float SENSOR_VALID_HIGH_MARGIN_PCT = 105.0f;
const uint32_t SENSOR_STUCK_MS = 15000;
const float SENSOR_STUCK_EPS_PCT = 0.15f;
```

For later real-field testing, thresholds should be slower and stricter:

```cpp
// Later field-like values, not for first demo
THEFT_MIN_TOTAL_DROP_PCT = 4.0f to 8.0f
THEFT_CONFIRM_MS = 30000 to 120000
IGNITION_OFF_SETTLE_MS = 60000 to 180000
```

For Round 2 demo, keep the short timing constants.

---

## 7. Add detector runtime data

Add a struct like this:

```cpp
struct FuelDetectorRuntime {
  FuelDetectorState state = DETECTOR_BOOT;
  FuelDetectorState previousState = DETECTOR_BOOT;

  bool lastIgnitionOn = false;
  uint32_t stateStartMs = 0;
  uint32_t ignitionChangedMs = 0;

  float filteredFuelPct = 0.0f;
  float previousFilteredFuelPct = 0.0f;
  float fuelRatePctPerSec = 0.0f;

  float parkedBaselinePct = 0.0f;
  bool parkedBaselineReady = false;

  float candidateStartFuelPct = 0.0f;
  float candidateDropPct = 0.0f;
  uint32_t candidateStartMs = 0;

  uint32_t alertHoldUntilMs = 0;
  uint8_t confidence = 0;

  uint32_t lastStableUpdateMs = 0;
  uint32_t lastSensorChangeMs = 0;
  float lastSensorCheckFuelPct = 0.0f;
};
```

Keep the current `Telemetry` struct, but add fields:

```cpp
float fuelRatePctPerSec = 0.0f;
float parkedBaselinePct = 0.0f;
float candidateDropPct = 0.0f;
uint8_t anomalyConfidence = 0;
String detectorState = "BOOT";
bool sensorHealthy = true;
```

Add these to JSON so the dashboard can show/debug them:

```json
"fuel_rate_pct_per_sec": -1.2,
"parked_baseline_pct": 72.4,
"candidate_drop_pct": 8.1,
"anomaly_confidence": 85,
"detector_state": "DROP_CANDIDATE",
"sensor_healthy": true
```

Do not remove existing JSON keys. Only add new keys so the existing dashboard remains compatible.

---

## 8. State transition logic

### 8.1 Ignition ON

When ignition is ON:

```text
- Do not raise fuel theft alert.
- Reset theft candidate.
- If fuel drops fast, set event FAST_DROP_IGN_ON only.
- If fuel rises enough, detect REFUEL_EVENT.
```

Reason: during ignition ON, fuel can decrease because the vehicle is operating. For demo, ignition ON should show that the algorithm understands context.

State:

```text
DETECTOR_NORMAL_ON
```

### 8.2 Ignition turns OFF

When ignition changes from ON to OFF:

```text
- Enter DETECTOR_OFF_SETTLING.
- Wait IGNITION_OFF_SETTLE_MS.
- Then set parkedBaselinePct = current filtered fuel.
- Then enter DETECTOR_PARKED_MONITORING.
```

Reason: after switching OFF, the float may still be moving. Do not immediately set baseline or alert.

### 8.3 Parked monitoring

While ignition is OFF and baseline is ready:

```text
confirmedDrop = parkedBaselinePct - currentFilteredFuel
```

If:

```text
confirmedDrop >= THEFT_MIN_TOTAL_DROP_PCT
AND fuelRatePctPerSec <= THEFT_MIN_RATE_PCT_PER_SEC
```

then enter:

```text
DETECTOR_DROP_CANDIDATE
```

### 8.4 Drop candidate

In candidate state:

```text
- Keep measuring candidateDropPct.
- If drop remains above threshold for THEFT_CONFIRM_MS, raise alert.
- If fuel recovers near baseline, cancel candidate.
```

Confirm condition:

```text
now - candidateStartMs >= THEFT_CONFIRM_MS
AND parkedBaselinePct - currentFuel >= THEFT_MIN_TOTAL_DROP_PCT
```

Then:

```text
state = DETECTOR_THEFT_ALERT
alert = FUEL_THEFT_ANOMALY
confidence = 80–100
```

Cancel condition:

```text
currentFuel >= parkedBaselinePct - THEFT_CANCEL_RECOVERY_PCT
```

Then:

```text
state = DETECTOR_PARKED_MONITORING
alert = NONE
```

### 8.5 Theft alert state

When theft is confirmed:

```text
- Hold alert until THEFT_ALERT_HOLD_MS expires.
- Keep alert visible on OLED/dashboard.
- After hold, return to parked monitoring but update baseline to current level.
```

Why update baseline after alert?

Because after fuel was stolen/drained, the new current fuel level becomes the new normal. Without updating baseline, the system may keep alerting forever.

### 8.6 Refuel detection

Refuel can happen both ignition ON or OFF.

Condition:

```text
currentFuel - parkedBaselinePct >= REFUEL_MIN_RISE_PCT
```

or if ignition is ON:

```text
currentFuel - previous stable fuel >= REFUEL_MIN_RISE_PCT
```

Use a short candidate stage:

```text
DETECTOR_REFUEL_CANDIDATE
```

If rise persists for `REFUEL_CONFIRM_MS`:

```text
state = previous appropriate state
telemetry.event = REFUEL_EVENT
telemetry.alert = NONE
parkedBaselinePct = currentFuel
```

---

## 9. Suggested pseudocode

### 9.1 Main loop integration

Replace the current `updateDetection()` internals with a cleaner structure:

```cpp
void updateDetection() {
  uint32_t now = millis();

  updateTestButton(now);

  telemetry.event = "NORMAL";
  telemetry.alert = "NONE";

  if (!telemetry.adsReady || !isFuelSensorHealthy(now)) {
    setDetectorState(DETECTOR_SENSOR_FAULT, now);
    telemetry.event = "SENSOR_FAULT";
    telemetry.alert = "NONE";
    return;
  }

  updateIgnitionTransition(now);
  updateFuelRate(now);
  updateFuelStateMachine(now);

  if (now < testHoldUntilMs) {
    applyTestButtonOverride(now);
  }

  exportDetectorToTelemetry();
}
```

### 9.2 Ignition transition

```cpp
void updateIgnitionTransition(uint32_t now) {
  if (telemetry.ignitionOn != detector.lastIgnitionOn) {
    detector.lastIgnitionOn = telemetry.ignitionOn;
    detector.ignitionChangedMs = now;
    detector.parkedBaselineReady = false;
    detector.candidateStartMs = 0;

    if (telemetry.ignitionOn) {
      setDetectorState(DETECTOR_NORMAL_ON, now);
    } else {
      setDetectorState(DETECTOR_OFF_SETTLING, now);
    }
  }
}
```

### 9.3 State machine core

```cpp
void updateFuelStateMachine(uint32_t now) {
  float fuel = telemetry.fuelFilteredPercent;

  if (telemetry.ignitionOn) {
    detector.parkedBaselineReady = false;

    if (detector.fuelRatePctPerSec <= THEFT_MIN_RATE_PCT_PER_SEC) {
      telemetry.event = "FAST_DROP_IGN_ON";
    }

    detectRefuelWhileOn(now, fuel);
    setDetectorState(DETECTOR_NORMAL_ON, now);
    return;
  }

  switch (detector.state) {
    case DETECTOR_OFF_SETTLING:
      telemetry.event = "PARKED_SETTLING";
      if (now - detector.stateStartMs >= IGNITION_OFF_SETTLE_MS) {
        detector.parkedBaselinePct = fuel;
        detector.parkedBaselineReady = true;
        detector.lastStableUpdateMs = now;
        setDetectorState(DETECTOR_PARKED_MONITORING, now);
      }
      break;

    case DETECTOR_PARKED_MONITORING: {
      telemetry.event = "PARKED_MONITORING";

      float drop = detector.parkedBaselinePct - fuel;
      detector.candidateDropPct = drop;

      if (fuel - detector.parkedBaselinePct >= REFUEL_MIN_RISE_PCT) {
        detector.candidateStartMs = now;
        detector.candidateStartFuelPct = fuel;
        setDetectorState(DETECTOR_REFUEL_CANDIDATE, now);
        break;
      }

      if (drop >= THEFT_MIN_TOTAL_DROP_PCT &&
          detector.fuelRatePctPerSec <= THEFT_MIN_RATE_PCT_PER_SEC) {
        detector.candidateStartMs = now;
        detector.candidateStartFuelPct = fuel;
        setDetectorState(DETECTOR_DROP_CANDIDATE, now);
        break;
      }

      maybeUpdateStableBaseline(now, fuel);
      break;
    }

    case DETECTOR_DROP_CANDIDATE: {
      float drop = detector.parkedBaselinePct - fuel;
      detector.candidateDropPct = drop;
      telemetry.event = "FUEL_DROP_CANDIDATE";
      telemetry.alert = "NONE";

      if (fuel >= detector.parkedBaselinePct - THEFT_CANCEL_RECOVERY_PCT) {
        detector.candidateDropPct = 0.0f;
        setDetectorState(DETECTOR_PARKED_MONITORING, now);
        break;
      }

      if (drop >= THEFT_MIN_TOTAL_DROP_PCT &&
          now - detector.candidateStartMs >= THEFT_CONFIRM_MS) {
        detector.confidence = computeTheftConfidence(drop, detector.fuelRatePctPerSec);
        detector.alertHoldUntilMs = now + THEFT_ALERT_HOLD_MS;
        setDetectorState(DETECTOR_THEFT_ALERT, now);
        break;
      }
      break;
    }

    case DETECTOR_THEFT_ALERT:
      telemetry.event = "SUSPICIOUS_DROP";
      telemetry.alert = "FUEL_THEFT_ANOMALY";
      if (now >= detector.alertHoldUntilMs) {
        detector.parkedBaselinePct = fuel;
        detector.candidateDropPct = 0.0f;
        detector.confidence = 0;
        setDetectorState(DETECTOR_PARKED_MONITORING, now);
      }
      break;

    case DETECTOR_REFUEL_CANDIDATE:
      telemetry.event = "REFUEL_CANDIDATE";
      if (now - detector.candidateStartMs >= REFUEL_CONFIRM_MS) {
        telemetry.event = "REFUEL_EVENT";
        telemetry.alert = "NONE";
        detector.parkedBaselinePct = fuel;
        detector.parkedBaselineReady = true;
        setDetectorState(DETECTOR_PARKED_MONITORING, now);
      }
      break;

    default:
      setDetectorState(DETECTOR_OFF_SETTLING, now);
      break;
  }
}
```

---

## 10. Confidence score

Add a simple explainable confidence score from 0 to 100.

Recommended function:

```cpp
uint8_t computeTheftConfidence(float dropPct, float ratePctPerSec) {
  float score = 50.0f;

  // Bigger total drop means more confidence.
  score += (dropPct - THEFT_MIN_TOTAL_DROP_PCT) * 5.0f;

  // Faster negative rate means more confidence.
  score += fabs(ratePctPerSec) * 10.0f;

  if (!telemetry.ignitionOn) {
    score += 15.0f;
  }

  score = clampFloat(score, 0.0f, 100.0f);
  return (uint8_t)(score + 0.5f);
}
```

Example:

```text
Ignition OFF, drop 8%, rate -1.5%/s
→ confidence around 80–90
```

This is useful for the dashboard and for explaining to judges.

---

## 11. Sensor health checks

Add a lightweight sensor validation function.

For the current demo, keep it simple:

```cpp
bool isFuelSensorHealthy(uint32_t now) {
  if (!telemetry.adsReady) return false;

  float p = telemetry.fuelRawPercent;
  if (p < SENSOR_VALID_LOW_MARGIN_PCT || p > SENSOR_VALID_HIGH_MARGIN_PCT) {
    return false;
  }

  // Optional stuck detection.
  if (fabs(p - detector.lastSensorCheckFuelPct) > SENSOR_STUCK_EPS_PCT) {
    detector.lastSensorCheckFuelPct = p;
    detector.lastSensorChangeMs = now;
  }

  // For demo, do not mark stuck as fault too aggressively.
  // Only use stuck fault if needed later.
  // if (now - detector.lastSensorChangeMs > SENSOR_STUCK_MS) return false;

  return true;
}
```

Important: do not make stuck detection strict in the first demo, because the float may naturally stay still for a long time.

---

## 12. Telemetry event mapping

Keep old event names where possible so the dashboard does not break. Add new ones.

Recommended event values:

```text
BOOT
NORMAL
ADS1115_MISSING
SENSOR_FAULT
PARKED_SETTLING
PARKED_MONITORING
FUEL_DROP_CANDIDATE
SUSPICIOUS_DROP
FAST_DROP_IGN_ON
REFUEL_CANDIDATE
REFUEL_EVENT
TEST_BUTTON
```

Recommended alert values:

```text
NONE
FUEL_THEFT_ANOMALY
FUEL_THEFT_TEST
DROP_TEST_IGN_ON
```

Update `friendlyEventLabel()`:

```cpp
if (event == "PARKED_SETTLING") return "Parked settling";
if (event == "PARKED_MONITORING") return "Parked monitor";
if (event == "FUEL_DROP_CANDIDATE") return "Drop candidate";
if (event == "REFUEL_CANDIDATE") return "Refuel candidate";
if (event == "SENSOR_FAULT") return "Sensor fault";
```

---

## 13. Dashboard/OLED display recommendation

OLED should remain simple:

```text
SmartT      IGN OFF
72%
A0 72%     A1 70%
Drop candidate / Fuel theft alert / Normal
[bar]
```

Do not overload OLED.

For dashboard, add optional fields:

- detector state
- baseline fuel
- fuel rate
- anomaly confidence
- candidate drop

Do not redesign the dashboard unless necessary.

---

## 14. Demo behavior after algorithm improvement

Expected demo sequence:

### Case 1 — Normal ON fuel movement

```text
Ignition ON
Move float down quickly
Expected:
- event = FAST_DROP_IGN_ON
- alert = NONE
- no theft alarm
```

Explanation:

```text
Vehicle is ON, so fast fuel decrease may be operation/consumption or movement. Do not classify as theft.
```

### Case 2 — Parked theft

```text
Ignition OFF
Wait 2–3 seconds
Move float down by more than 6%
Hold it there for about 2 seconds
Expected:
- event = FUEL_DROP_CANDIDATE
- then event = SUSPICIOUS_DROP
- alert = FUEL_THEFT_ANOMALY
- confidence high
```

### Case 3 — False movement cancellation

```text
Ignition OFF
Move float down quickly
Move it back near old level before confirmation finishes
Expected:
- candidate appears briefly
- alert remains NONE
- state returns to PARKED_MONITORING
```

### Case 4 — Refuel

```text
Ignition OFF or ON
Move float up by more than 7%
Hold it there
Expected:
- event = REFUEL_CANDIDATE
- then REFUEL_EVENT
- alert = NONE
- baseline updates to new fuel level
```

### Case 5 — ADS missing

```text
Unplug ADS1115 or fail init
Expected:
- event = ADS1115_MISSING or SENSOR_FAULT
- alert = NONE
```

Do not show theft alert when the sensor is missing.

---

## 15. Implementation steps for Codex

Please apply changes in this order:

1. Keep all includes, pin definitions, OLED, Wi-Fi AP dashboard, and JSON API working.
2. Add the detector enum and runtime struct.
3. Add median filter support for fuel percent.
4. Update `readTelemetry()` so `fuelRawPercent` goes through median + EMA before becoming `fuelFilteredPercent`.
5. Add fuel rate calculation.
6. Replace the current `updateDetection()` logic with the state machine described above.
7. Keep the test button override behavior.
8. Add new telemetry fields to the JSON without removing existing keys.
9. Update `friendlyEventLabel()` for new event names.
10. Compile for ESP32 in Arduino IDE.
11. Do not introduce dynamic memory-heavy logic or external libraries.

---

## 16. Minimal code style requirements

Follow the style of the existing sketch:

- Use `static const` or `const` constants.
- Use simple structs.
- Avoid STL containers.
- Avoid heap allocation.
- Avoid blocking delays inside the main loop.
- Keep `server.handleClient()` responsive.
- Keep OLED update interval separate from sample interval.
- Keep Serial JSON output readable.

The only small blocking delay that already exists is inside ADS1115 multi-sampling. That is acceptable for now.

---

## 17. Important note about the current A0 voltage range

Current calibration in the file says:

```cpp
const float FUEL_A0_EMPTY_V = 0.03f;
const float FUEL_A0_FULL_V = 0.31f;
```

That is a small span:

```text
0.31V - 0.03V = 0.28V
```

So noise matters. This is why median + EMA + candidate confirmation are important.

Do not increase algorithm sensitivity too much. For demo, prefer:

```text
slightly delayed but stable alert
>
instant alert with false positives
```

---

## 18. Recommended explanation for judges

The algorithm can be explained as:

```text
SmartT does not classify every fuel decrease as theft.
First, it filters noisy fuel sender readings.
Then it uses vehicle context from ignition state.
When the vehicle is OFF, it establishes a parked baseline.
If the fuel level drops rapidly and remains lower than the baseline for a confirmation period, SmartT raises a fuel theft anomaly.
If the vehicle is ON, fast fuel decrease is logged but not treated as theft.
If fuel rises, the system classifies it as refueling and updates the baseline.
```

This is a strong Round 2 explanation because it is practical, explainable, and demo-friendly.

---

## 19. Acceptance checklist

After Codex modifies the sketch, verify:

```text
[ ] Arduino IDE compile passes for ESP32.
[ ] ADS1115 still detected at 0x48.
[ ] OLED still initializes.
[ ] Wi-Fi AP dashboard still opens.
[ ] Serial JSON still prints every 500 ms.
[ ] fuel_percent_raw and fuel_percent_filtered still update.
[ ] detector_state appears in JSON.
[ ] fuel_rate_pct_per_sec appears in JSON.
[ ] parked_baseline_pct appears in JSON.
[ ] anomaly_confidence appears in JSON.
[ ] Ignition ON fast drop does not trigger theft alert.
[ ] Ignition OFF fast confirmed drop triggers FUEL_THEFT_ANOMALY.
[ ] Quick fake drop that recovers does not trigger alert.
[ ] Refuel event updates baseline.
[ ] ADS missing does not trigger theft alert.
```

---

## 20. Final recommendation

For Round 2, implement the deterministic **median + EMA + parked baseline + candidate confirmation + state machine** algorithm.

Do not use ML yet. Do not add GPS/4G/CAN dependency yet. The current goal is:

```text
core fuel signal stable
→ theft/refuel logic explainable
→ OLED/dashboard demo convincing
→ later extend to cloud/GPS/fleet telemetry
```
