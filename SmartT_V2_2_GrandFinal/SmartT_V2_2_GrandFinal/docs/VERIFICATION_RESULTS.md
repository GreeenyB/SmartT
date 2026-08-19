# SmartT V2.2 — Verification Results

## Automated checks completed

Backend checks were rerun on the final packaged sources:

```text
python -m py_compile app.py decision_engine.py ml_engine.py residual_engine.py train_models.py
→ PASS

PYTHONPATH=. python -m unittest discover -s tests -v
→ 5/5 tests PASS
```

Covered safety behaviors include:

- engine-OFF residual tracking;
- CAN fuel-rate priority over learned consumption when available;
- ML cannot override a sensor fault;
- strong physical/contextual evidence can upgrade a confirmed loss to theft anomaly;
- high sloshing evidence prevents an ML-assisted theft upgrade.

## Static/source checks

The final source was reviewed for the critical Grand Final paths:

- A02 application driver is RX-only and does not transmit the UART-controlled `0x55` trigger;
- tank calibration remains locked by default;
- CAN/OBD remains disabled by default until the target vehicle is verified;
- STM32 USART2 and ESP32 UART2 are both configured at 460800 baud;
- confirmed event UART sequence is advanced only after a successful transmit;
- ECU fuel-level disagreement timing is cleared if either comparison source becomes unavailable;
- backend incident ingest is idempotent by device/event sequence;
- ML is supporting evidence and has no unconditional theft authority.

## Toolchain limitation

`arm-none-eabi-gcc` is not installed in the preparation environment, so the modified STM32 firmware was not freshly linked into an ARM ELF here. A **Clean + Build** in STM32CubeIDE is therefore required before flashing the board.

This limitation is deliberately not hidden: Python/backend tests passing does not prove board-level UART, CAN, timing, pin mapping, or physical A02 protocol compatibility.

## Mandatory physical validation before enabling fuel decisions

1. Capture real A02 UART-auto frames and confirm pin order, logic level, 9600 baud, `FF H L SUM`, checksum and units.
2. Measure the actual demo tank geometry and replace the example height→volume LUT.
3. Keep `SMARTT_TANK_CALIBRATION_READY = 0` until hold-out calibration points meet the chosen error target.
4. Validate MPU orientation and motion thresholds.
5. Validate CAN bitrate/PIDs on the actual vehicle before enabling `SMARTT_ENABLE_CAN_OBD`.
6. Run stable/slosh/refuel/slow-drain/fast-drain/disconnect scenarios and inspect both event reasons and false positives.
