# Physical Experiment Protocol

Status: **NOT YET VALIDATED**. This procedure prepares future collection; it does not claim that any potentiometer, water-tank, or vehicle run has occurred.

## Required discipline

Assign one unique `experiment_id` before touching the signal. Choose ground truth from the action you will physically perform (`NORMAL`, `SLOSHING`, `REFUEL`, `DRAIN`, or `FAULT`), not from the firmware/server output. Keep `rule_prediction`, `ml_prediction`, and `ground_truth_label` separate. Record vehicle/test-rig identity and concise notes including tank level, setup, intended rate, GPS state, and ignition state.

## Collection sequence

1. Start the normal firmware and local server; verify `/api/health` and live telemetry.
2. Verify the actual source before recording. `Config.h` currently defaults to `#define SMARTT_USE_A1_BACKUP_AS_MAIN_FUEL 0`; an A1 potentiometer does not become the detector/training fuel source unless that configuration is intentionally changed and firmware telemetry confirms the selected source. Leave the selected source stable for at least 10 seconds.
3. Start the recorder with the independently chosen label. It creates a new file and refuses to overwrite an existing experiment:

   ```sh
   .venv/bin/python -m ml.data.real.record_experiment \
     --experiment-id POT-DRAIN-001 \
     --label DRAIN \
     --subtype DRAIN_SLOW \
     --vehicle-id POT_A1 \
     --notes "10K potentiometer, ignition OFF, slow continuous turn"
   ```

4. Press Enter to mark **BEHAVIOR START**, perform exactly the action, press Enter again for **BEHAVIOR END**, then collect at least 10 seconds of recovery and press Ctrl-C.
5. Inspect the end summary and CSV. It records `timestamp_iso`, relative `timestamp_s`, `phase` (BASELINE/EVENT/RECOVERY), `current_behavior`, exact A0/A1 ADC/voltage fields, and separate GPS data/speed freshness. A non-NORMAL file without ordered markers is explicitly incomplete and must not enter training.
6. Use new IDs for repetitions. Keep whole experiments together in every train/validation/test split.

Recommended stages: (1) stable/noise/refuel/drain with the existing 10K potentiometer on ADS1115 A1; (2) stable, shake, slosh, tilt, refill, slow/fast drain, and mixed slosh+drain with the existing sender and water tank; (3) only after those checks, stationary vehicle trials.

## Dataset columns

The recorder maps authoritative firmware names: `fuel_raw_adc_a0`, `fuel_raw_adc_a1`, `fuel_volts_a0`, `fuel_volts_a1`, `fuel_percent_raw`, `fuel_percent_filtered`, `gps_data_fresh`, and `gps_speed_fresh`. Missing raw values remain blank rather than fabricated.
