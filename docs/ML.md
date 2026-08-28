# ML Status

SmartT's production baseline is the explainable ESP32 state machine in `SmartT_Core_Demo`. The local server can optionally run a synthetic-trained Random Forest and Isolation Forest in **shadow mode only**. Shadow fields are evidence for later review; they cannot create an alert.

The reproducible pipeline, leakage constraints, commands, and implementation boundaries are in `ml/README.md`. Quantitative results and the final decision are in `ml/reports/ML_EVALUATION.md`, with exact values in `ml/reports/metrics.json`.

Current decision: keep deterministic alerts authoritative. Synthetic classification improvement justifies collecting shadow evidence, not production ML control. Physical potentiometer and tank validation remain pending.
