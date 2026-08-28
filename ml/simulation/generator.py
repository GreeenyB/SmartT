from __future__ import annotations

import csv
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np

from ml.config import SAMPLE_PERIOD_SECONDS, SEED, TARGET_CLASSES


CSV_FIELDS = [
    "timestamp_s", "experiment_id", "vehicle_id", "sample_period_s",
    "raw_adc", "voltage", "raw_fuel_percent", "filtered_fuel_percent",
    "fuel_rate_percent_per_sec", "ignition", "gps_speed_kmh", "gps_available",
    "gps_fresh", "gps_data_fresh", "gps_speed_fresh", "gps_stationary", "gps_moving", "sensor_valid",
    "behavior_start_s", "behavior_end_s", "scenario_label", "current_behavior", "phase", "ground_truth_label",
    "ground_truth_subtype", "notes",
]


@dataclass(frozen=True)
class SyntheticConfig:
    experiments_per_class: int = 120
    fault_experiments: int = 16
    sample_period_s: float = SAMPLE_PERIOD_SECONDS
    seed: int = SEED


def _filtered(values: np.ndarray, alpha: float = 0.18, median_size: int = 5) -> tuple[np.ndarray, np.ndarray]:
    output = np.empty_like(values)
    rates = np.zeros_like(values)
    current = float(values[0]) if np.isfinite(values[0]) else 50.0
    history = [current] * median_size
    for index, value in enumerate(values):
        usable = current if not np.isfinite(value) else float(value)
        history[index % median_size] = usable
        median = float(np.median(history))
        previous = current
        current += alpha * (median - current)
        output[index] = current
        if index:
            rates[index] = (current - previous)
    return output, rates


def _subtype(label: str, index: int) -> str:
    choices = {
        "NORMAL": ("NORMAL_STABLE", "NORMAL_SLOW_DRIFT", "SENSOR_NOISE", "NORMAL_IGNITION_ON"),
        "SLOSHING": ("SLOSH_LIGHT", "SLOSH_STRONG", "SLOSH_ALTERNATING", "SLOSH_RECOVERY", "SLOSH_MOVING", "SLOSH_PARKED"),
        "REFUEL": ("REFUEL_FAST", "REFUEL_SLOW", "REFUEL_NOISY", "REFUEL_IGNITION_ON"),
        "DRAIN": ("DRAIN_FAST", "DRAIN_MEDIUM", "DRAIN_SLOW", "DRAIN_STAGED", "DRAIN_NOISY", "DRAIN_WITH_SLOSH", "DRAIN_NEAR_THRESHOLD", "DRAIN_IGNITION_ON", "DRAIN_GPS_MOVING", "DRAIN_STALE_GPS"),
    }
    return choices[label][index % len(choices[label])]


def _one_experiment(rng: np.random.Generator, label: str, subtype: str, experiment_id: str,
                    sample_period_s: float) -> list[dict[str, object]]:
    duration = float(rng.uniform(52.0, 82.0))
    times = np.arange(0.0, duration, sample_period_s)
    count = len(times)
    start = float(rng.uniform(9.0, 15.0))
    initial = float(rng.uniform(38.0, 91.0))
    vehicle_index = int(rng.integers(1, 5))
    vehicle_id = f"SYNTH_VEHICLE_{vehicle_index:02d}"
    profile_noise = (0.20, 0.30, 0.42, 0.55)[vehicle_index - 1]

    true_level = np.full(count, initial, dtype=float)
    sender_effect = np.zeros(count, dtype=float)
    ignition_on = subtype in {"NORMAL_IGNITION_ON", "REFUEL_IGNITION_ON", "DRAIN_IGNITION_ON"}
    if label == "NORMAL" and subtype != "NORMAL_STABLE":
        ignition_on = ignition_on or bool(rng.random() < 0.45)
    ignition = np.full(count, ignition_on, dtype=bool)
    behavior_end = duration - 4.0

    drift_rate = float(rng.uniform(-0.004, 0.004))
    if ignition_on:
        drift_rate -= float(rng.uniform(0.004, 0.018))
    true_level += drift_rate * times

    active = times >= start
    if label == "SLOSHING":
        amplitude = float(rng.uniform(1.0, 3.3) if subtype == "SLOSH_LIGHT" else rng.uniform(3.2, 8.5))
        frequency = float(rng.uniform(0.08, 0.34))
        phase = float(rng.uniform(0, 2 * math.pi))
        irregular = np.sin(times * frequency * 2 * math.pi + phase)
        irregular += 0.35 * np.sin(times * frequency * 3.7 * 2 * math.pi + phase / 2)
        sender_effect[active] = amplitude * irregular[active]
        if subtype == "SLOSH_RECOVERY":
            envelope = np.exp(-np.maximum(0.0, times - start) / float(rng.uniform(8.0, 15.0)))
            sender_effect *= envelope
            behavior_end = min(duration - 4.0, start + 28.0)
    elif label == "REFUEL":
        magnitude = float(rng.uniform(8.0, 23.0))
        event_duration = float(rng.uniform(2.0, 5.0) if subtype == "REFUEL_FAST" else rng.uniform(9.0, 20.0))
        progress = np.clip((times - start) / event_duration, 0.0, 1.0)
        true_level += magnitude * progress
        behavior_end = min(duration - 4.0, start + event_duration)
        if subtype == "REFUEL_NOISY":
            sender_effect += np.where(active, rng.normal(0, 1.0, count), 0.0)
    elif label == "DRAIN":
        if subtype == "DRAIN_FAST":
            magnitude, event_duration = float(rng.uniform(8.0, 20.0)), float(rng.uniform(2.5, 5.5))
        elif subtype == "DRAIN_MEDIUM":
            magnitude, event_duration = float(rng.uniform(7.0, 16.0)), float(rng.uniform(6.0, 13.0))
        elif subtype == "DRAIN_SLOW":
            magnitude, event_duration = float(rng.uniform(5.0, 11.0)), float(rng.uniform(22.0, 42.0))
        elif subtype == "DRAIN_NEAR_THRESHOLD":
            magnitude, event_duration = float(rng.uniform(4.4, 6.2)), float(rng.uniform(8.0, 18.0))
        else:
            magnitude, event_duration = float(rng.uniform(7.0, 17.0)), float(rng.uniform(7.0, 18.0))
        progress = np.clip((times - start) / event_duration, 0.0, 1.0)
        if subtype == "DRAIN_STAGED":
            progress = 0.48 * np.clip((times - start) / (event_duration * 0.35), 0.0, 1.0)
            progress += 0.52 * np.clip((times - start - event_duration * 0.60) / (event_duration * 0.40), 0.0, 1.0)
        true_level -= magnitude * progress
        behavior_end = min(duration - 4.0, start + event_duration)
        if subtype in {"DRAIN_NOISY", "DRAIN_WITH_SLOSH"}:
            amplitude = float(rng.uniform(1.3, 4.8))
            sender_effect += np.where(active, amplitude * np.sin(times * float(rng.uniform(0.10, 0.32)) * 2 * math.pi), 0.0)

    moving = subtype in {"SLOSH_MOVING", "DRAIN_GPS_MOVING"} or (ignition_on and rng.random() < 0.65)
    gps_available = np.full(count, rng.random() > 0.12, dtype=bool)
    gps_fresh = gps_available.copy()
    if subtype == "DRAIN_STALE_GPS":
        gps_available[:] = True
        gps_fresh[times >= start] = False
    speed = np.zeros(count, dtype=float)
    if moving:
        speed = np.maximum(0.0, rng.normal(float(rng.uniform(18, 52)), 4.0, count))
    else:
        speed = np.maximum(0.0, rng.normal(0.4, 0.45, count))
    speed[~gps_fresh] = 0.0

    raw = true_level + sender_effect + rng.normal(0.0, profile_noise, count)
    if subtype == "SENSOR_NOISE":
        raw += rng.normal(0.0, 1.15, count)
    if rng.random() < 0.24:
        spike_index = int(rng.integers(max(2, count // 5), max(3, count - 2)))
        raw[spike_index] += float(rng.choice([-1, 1]) * rng.uniform(4.0, 12.0))
    if rng.random() < 0.15:
        missing_index = int(rng.integers(max(2, count // 5), max(3, count - 2)))
        raw[missing_index] = np.nan

    raw_for_filter = raw.copy()
    for index in range(count):
        if not np.isfinite(raw_for_filter[index]):
            raw_for_filter[index] = raw_for_filter[index - 1] if index else initial
    filtered, rate_steps = _filtered(raw_for_filter)
    rates = rate_steps / sample_period_s
    raw_clamped = np.clip(raw_for_filter, 0.0, 100.0)
    voltage = 0.03 + raw_clamped * (0.31 - 0.03) / 100.0
    adc = np.rint(voltage / 4.096 * 32768).astype(int)

    notes = "synthetic simulator ground truth; not physical validation"
    rows: list[dict[str, object]] = []
    for index, timestamp in enumerate(times):
        rows.append({
            "timestamp_s": round(float(timestamp), 3),
            "experiment_id": experiment_id,
            "vehicle_id": vehicle_id,
            "sample_period_s": sample_period_s,
            "raw_adc": int(adc[index]),
            "voltage": round(float(voltage[index]), 6),
            "raw_fuel_percent": "" if not np.isfinite(raw[index]) else round(float(raw[index]), 6),
            "filtered_fuel_percent": round(float(filtered[index]), 6),
            "fuel_rate_percent_per_sec": round(float(rates[index]), 6),
            "ignition": int(ignition[index]),
            "gps_speed_kmh": round(float(speed[index]), 5),
            "gps_available": int(gps_available[index]),
            "gps_fresh": int(gps_fresh[index]),
            "gps_data_fresh": int(gps_available[index]),
            "gps_speed_fresh": int(gps_fresh[index]),
            "gps_stationary": int(gps_fresh[index] and speed[index] <= 3.0),
            "gps_moving": int(gps_fresh[index] and speed[index] >= 8.0),
            "sensor_valid": 1,
            "behavior_start_s": round(start, 3),
            "behavior_end_s": round(behavior_end, 3),
            "scenario_label": label,
            "current_behavior": (label if label == "NORMAL" or (timestamp >= start and timestamp <= behavior_end) else "NORMAL"),
            "phase": ("EVENT" if label == "NORMAL" or (timestamp >= start and timestamp <= behavior_end) else ("BASELINE" if timestamp < start else "RECOVERY")),
            "ground_truth_label": label,
            "ground_truth_subtype": subtype,
            "notes": notes,
        })
    return rows


def _fault_experiment(rng: np.random.Generator, index: int, sample_period_s: float) -> list[dict[str, object]]:
    subtype = ("SENSOR_OUT_OF_RANGE", "ADS1115_MISSING")[index % 2]
    rows = _one_experiment(rng, "NORMAL", "NORMAL_STABLE", f"FAULT-{index:04d}", sample_period_s)
    start = float(rows[0]["behavior_start_s"])
    for row in rows:
        if float(row["timestamp_s"]) >= start:
            row["sensor_valid"] = 0
            if subtype == "SENSOR_OUT_OF_RANGE":
                row["raw_fuel_percent"] = 130.0
                row["voltage"] = 0.40
            else:
                row["raw_fuel_percent"] = ""
                row["raw_adc"] = 0
                row["voltage"] = 0.0
        row["ground_truth_label"] = "FAULT"
        row["scenario_label"] = "FAULT"
        row["current_behavior"] = "FAULT" if float(row["timestamp_s"]) >= start else "NORMAL"
        row["ground_truth_subtype"] = subtype
    return rows


def generate(config: SyntheticConfig = SyntheticConfig()) -> list[dict[str, object]]:
    rng = np.random.default_rng(config.seed)
    rows: list[dict[str, object]] = []
    for label in TARGET_CLASSES:
        for index in range(config.experiments_per_class):
            subtype = _subtype(label, index)
            experiment_id = f"{label}-{index:04d}"
            rows.extend(_one_experiment(rng, label, subtype, experiment_id, config.sample_period_s))
    for index in range(config.fault_experiments):
        rows.extend(_fault_experiment(rng, index, config.sample_period_s))
    return rows


def write_csv(rows: Iterable[dict[str, object]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rows)
