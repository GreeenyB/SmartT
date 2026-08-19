# SmartT V2.2 — A02 / CAN Bring-up Checklist

## DYP A02 UART automatic

- [ ] Confirm exact wire/pin order from the physical sensor/datasheet.
- [ ] Common GND between sensor and STM32.
- [ ] Confirm sensor supply voltage before connecting.
- [ ] Sensor TX → STM32 USART6 RX.
- [ ] Do not send `0x55`; V2.2 is UART automatic RX-only at application level.
- [ ] Confirm 9600 8N1.
- [ ] Capture at least 20 frames and verify `FF H L SUM` checksum.
- [ ] Check raw distance against ruler at several distances.
- [ ] Verify stale timeout by disconnecting sensor.
- [ ] Verify checksum/range counters do not grow during stable operation.

## Tank calibration

- [ ] Measure sensor acoustic face → tank bottom distance.
- [ ] Use safe test liquid.
- [ ] Record multiple known volume/height points.
- [ ] Replace example LUT in `smartt_engine.c`.
- [ ] Update `SMARTT_SENSOR_TO_TANK_BOTTOM_MM`.
- [ ] Only then set `SMARTT_TANK_CALIBRATION_READY = 1`.
- [ ] Validate on hold-out fill levels not used to make the LUT.

## CAN / SN65HVD230

- [ ] Confirm target vehicle CAN bitrate/protocol before enabling polling.
- [ ] OBD pin 6 = CAN-H, pin 14 = CAN-L for standard high-speed OBD CAN when applicable.
- [ ] Common logic ground.
- [ ] Do not add a fixed extra 120-ohm termination when tapping an already terminated vehicle CAN bus.
- [ ] Keep `SMARTT_CAN_MODE_DISABLED` until wiring and protocol are verified.
- [ ] Confirm 500 kbit/s only if the target vehicle actually uses that profile.
- [ ] Check PID support; missing PID must remain invalid rather than being fabricated.
