# SmartT V2.2 Grand Final

This package is the revised SmartT codebase derived from `final 1.3.zip`.

Start here:

1. `docs/SMARTT_V2_2_STATUS_AND_CHANGELOG.md` — what changed, what is implemented, what is intentionally still locked.
2. `docs/HARDWARE_BRINGUP_CHECKLIST.md` — safe A02/CAN bring-up order.
3. `docs/SMARTT_ALGORITHM_ARCHITECTURE_V2.md` — full algorithm blueprint.
4. `backend/README_BACKEND.md` — backend + optional ML instructions.

## Critical safety flags

The code ships with:

```c
SMARTT_TANK_CALIBRATION_READY = 0
SMARTT_CAN_MODE = SMARTT_CAN_MODE_DISABLED
```

This is intentional. Do not enable fuel-event claims before the physical tank is calibrated. Do not enable active OBD polling before the target CAN bus is verified.

## Architecture

```text
DYP A02 + MPU6050 + GPS + optional CAN/OBD
              ↓
        STM32 edge engine
              ↓
validation → calibration → median → adaptive Kalman
              ↓
context + slosh + CUSUM + expected-consumption residual
              ↓
explainable event FSM + confidence + reasons
              ↓
       ESP32 reliable gateway
              ↓
 Python backend / SQLite / optional ML evidence
```

Machine learning is optional and data-driven. No fake pre-trained model is included.

- [`docs/VERIFICATION_RESULTS.md`](docs/VERIFICATION_RESULTS.md) — final automated/static checks and mandatory board validation.
