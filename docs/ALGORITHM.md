# Algorithm

The recommended MVP fuel detection algorithm is deterministic and explainable:

```text
ADS1115 sample
-> voltage and percent calibration
-> median filter
-> EMA filter
-> fuel rate calculation
-> parked baseline and state machine
-> event, alert, confidence, JSON, OLED, dashboard
```

## Detector States

- `DETECTOR_BOOT`
- `DETECTOR_NORMAL_ON`
- `DETECTOR_OFF_SETTLING`
- `DETECTOR_PARKED_MONITORING`
- `DETECTOR_DROP_CANDIDATE`
- `DETECTOR_THEFT_ALERT`
- `DETECTOR_REFUEL_CANDIDATE`
- `DETECTOR_SENSOR_FAULT`

## Demo Constants

```cpp
const uint8_t FUEL_MEDIAN_SIZE = 5;
const float FUEL_EMA_ALPHA = 0.18f;
const uint32_t IGNITION_OFF_SETTLE_MS = 2500;
const float THEFT_MIN_TOTAL_DROP_PCT = 6.0f;
const float THEFT_MIN_RATE_PCT_PER_SEC = -0.8f;
const uint32_t THEFT_CONFIRM_MS = 2200;
const uint32_t THEFT_ALERT_HOLD_MS = 8000;
const float THEFT_CANCEL_RECOVERY_PCT = 2.0f;
const float REFUEL_MIN_RISE_PCT = 7.0f;
const uint32_t REFUEL_CONFIRM_MS = 1800;
```

## Expected Behavior

- Ignition ON fast drops are logged but do not raise theft alerts.
- Ignition OFF establishes a parked baseline after a short settling period.
- Confirmed fast drops below the parked baseline become `FUEL_THEFT_ANOMALY`.
- Fast drops that recover before confirmation are canceled.
- Refuel candidates update the baseline after confirmation.
- Missing or invalid sensor readings become sensor faults, not theft.

Do not introduce ML, GPS, 4G, or CAN dependencies until the core fuel signal and event logic are stable.
