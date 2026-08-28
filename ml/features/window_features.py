"""Canonical window preparation shared by training, benchmarks, and live shadow mode."""
from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

import numpy as np

from ml.config import (
    FORBIDDEN_FEATURE_FIELDS,
    MAX_INTERPOLATION_GAP_SECONDS,
    ROLLING_STRIDE_SECONDS,
    SAMPLE_JITTER_TOLERANCE_SECONDS,
    SAMPLE_PERIOD_SECONDS,
    STEADY_OVERLAP_RATIO,
    WINDOW_SECONDS,
)


FEATURE_NAMES = [
    "window_duration_s", "sample_count", "sample_coverage", "net_fuel_change_pct",
    "mean_rate_pct_per_s", "median_rate_pct_per_s", "min_rate_pct_per_s",
    "max_rate_pct_per_s", "fuel_range_pct", "fuel_std_pct", "fuel_variance_pct2",
    "fuel_mad_pct", "linear_slope_pct_per_s", "monotonicity", "direction_changes",
    "negative_step_ratio", "positive_step_ratio", "recovery_ratio", "max_drawdown_pct",
    "max_runup_pct", "raw_filtered_rmse_pct", "raw_filtered_mean_abs_pct",
    "ignition_on_ratio", "ignition_transitions", "gps_speed_mean_kmh",
    "gps_speed_max_kmh", "gps_speed_std_kmh", "gps_available_ratio",
    "gps_data_fresh_ratio", "gps_speed_fresh_ratio", "gps_stationary_ratio",
    "gps_moving_ratio", "sensor_valid_ratio", "raw_missing_ratio",
]
assert not set(FEATURE_NAMES) & FORBIDDEN_FEATURE_FIELDS


def _f(row: dict[str, Any], key: str, default: float = 0.0) -> float:
    try:
        value = row.get(key, default)
        return float(value) if value not in (None, "") else default
    except (ValueError, TypeError):
        return default


def group_rows(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        out.setdefault(str(row["experiment_id"]), []).append(row)
    for values in out.values():
        values.sort(key=lambda row: _f(row, "timestamp_s"))
    return out


def expected_sample_count(window_seconds: float = WINDOW_SECONDS,
                          period_s: float = SAMPLE_PERIOD_SECONDS) -> int:
    """Inclusive fixed-grid count: 16 s at 500 ms is 33 samples."""
    return int(round(window_seconds / period_s)) + 1


def _nearest_source(source: np.ndarray, target: float) -> tuple[int, float]:
    right = int(np.searchsorted(source, target, side="left"))
    choices = [index for index in (right - 1, right) if 0 <= index < len(source)]
    index = min(choices, key=lambda candidate: abs(float(source[candidate]) - target))
    return index, abs(float(source[index]) - target)


def resample_window(rows: list[dict[str, Any]], period_s: float = SAMPLE_PERIOD_SECONDS,
                    *, window_start_s: float | None = None,
                    window_end_s: float | None = None) -> list[dict[str, Any]]:
    """Put a window onto the server feature grid without hiding packet loss.

    A target point is marked ``sample_observed=1`` only when a real telemetry
    packet is within normal server jitter. Fuel interpolation is used solely for
    short bounded gaps; long gaps retain a missingness marker and are never
    presented to feature extraction as perfect raw data.
    """
    if not rows:
        return []
    ordered = sorted(rows, key=lambda row: _f(row, "timestamp_s"))
    source = np.asarray([_f(row, "timestamp_s") for row in ordered], dtype=float)
    start = float(source[0] if window_start_s is None else window_start_s)
    end = float(source[-1] if window_end_s is None else window_end_s)
    target = np.arange(start, end + period_s * 0.25, period_s)
    result: list[dict[str, Any]] = []

    for timestamp in target:
        nearest, distance = _nearest_source(source, float(timestamp))
        source_row = ordered[nearest]
        observed = distance <= SAMPLE_JITTER_TOLERANCE_SECONDS
        left = int(np.searchsorted(source, timestamp, side="right") - 1)
        right = min(left + 1, len(source) - 1)
        bounded = 0 <= left < len(source) and source[right] >= timestamp and (
            source[right] - source[left] <= MAX_INTERPOLATION_GAP_SECONDS
        )
        if left < 0:
            bounded = False
        if bounded and right != left:
            fraction = float((timestamp - source[left]) / max(source[right] - source[left], 1e-9))
            fuel = _f(ordered[left], "filtered_fuel_percent") + fraction * (
                _f(ordered[right], "filtered_fuel_percent") - _f(ordered[left], "filtered_fuel_percent")
            )
            speed = _f(ordered[left], "gps_speed_kmh") + fraction * (
                _f(ordered[right], "gps_speed_kmh") - _f(ordered[left], "gps_speed_kmh")
            )
        else:
            # Keep numerical features finite; masks below explicitly expose the gap.
            fuel = _f(source_row, "filtered_fuel_percent")
            speed = _f(source_row, "gps_speed_kmh")
        raw = source_row.get("raw_fuel_percent", "") if observed else ""
        row: dict[str, Any] = {
            "timestamp_s": float(timestamp - start),
            "filtered_fuel_percent": fuel,
            "gps_speed_kmh": speed,
            "raw_fuel_percent": raw,
            "sample_observed": int(observed),
        }
        for key in (
            "ignition", "gps_available", "gps_data_fresh", "gps_speed_fresh",
            "gps_stationary", "gps_moving", "sensor_valid",
        ):
            fallback = source_row.get("gps_fresh", 0) if key in {"gps_data_fresh", "gps_speed_fresh"} else 0
            row[key] = source_row.get(key, fallback) if observed else 0
        result.append(row)
    return result


def feature_vector(rows: list[dict[str, Any]], expected_period_s: float = SAMPLE_PERIOD_SECONDS) -> dict[str, float]:
    if len(rows) < 3:
        raise ValueError("A feature window needs at least three samples")
    time = np.asarray([_f(row, "timestamp_s") for row in rows])
    fuel = np.asarray([_f(row, "filtered_fuel_percent") for row in rows])
    dt = np.maximum(np.diff(time), expected_period_s)
    steps = np.diff(fuel)
    rates = steps / dt
    observed = np.asarray([_f(row, "sample_observed", 1.0) for row in rows], dtype=float)
    raw_missing = np.asarray([
        row.get("raw_fuel_percent", "") in (None, "") or not bool(observed[index])
        for index, row in enumerate(rows)
    ])
    raw = np.asarray([_f(row, "raw_fuel_percent", fuel[index]) for index, row in enumerate(rows)])
    duration = max(expected_period_s, float(time[-1] - time[0]))
    total = float(np.abs(steps).sum())
    non_zero = np.sign(np.where(abs(steps) >= 0.04, steps, 0))
    non_zero = non_zero[non_zero != 0]

    def series(name: str, legacy: str | None = None) -> np.ndarray:
        return np.asarray([_f(row, name, _f(row, legacy, 0.0) if legacy else 0.0) for row in rows])

    ignition = series("ignition")
    speed = series("gps_speed_kmh")
    available = series("gps_available")
    data_fresh = series("gps_data_fresh", "gps_fresh")
    speed_fresh = series("gps_speed_fresh", "gps_fresh")
    stationary = series("gps_stationary")
    moving = series("gps_moving")
    valid = series("sensor_valid", "sensor_healthy")
    values = [
        duration, float(len(rows)), float(observed.mean()), float(fuel[-1] - fuel[0]),
        float(rates.mean()), float(np.median(rates)), float(rates.min()), float(rates.max()),
        float(np.ptp(fuel)), float(fuel.std()), float(fuel.var()),
        float(np.median(abs(fuel - np.median(fuel)))), float(np.polyfit(time - time[0], fuel, 1)[0]),
        abs(float(fuel[-1] - fuel[0])) / max(total, 1e-9),
        float(np.sum(non_zero[1:] != non_zero[:-1])) if len(non_zero) > 1 else 0.0,
        float(np.mean(steps < -0.04)), float(np.mean(steps > 0.04)),
        max(0.0, total - abs(float(fuel[-1] - fuel[0]))) / max(total, 1e-9),
        float(np.max(np.maximum.accumulate(fuel) - fuel)),
        float(np.max(fuel - np.minimum.accumulate(fuel))),
        float(np.sqrt(np.mean((raw - fuel) ** 2))), float(np.mean(abs(raw - fuel))),
        float(ignition.mean()), float(np.sum(np.diff(ignition) != 0)), float(speed.mean()),
        float(speed.max()), float(speed.std()), float(available.mean()), float(data_fresh.mean()),
        float(speed_fresh.mean()), float(stationary.mean()), float(moving.mean()), float(valid.mean()),
        float(raw_missing.mean()),
    ]
    return dict(zip(FEATURE_NAMES, values))


def rolling_windows(rows: list[dict[str, Any]], window_seconds: float = WINDOW_SECONDS,
                    stride_seconds: float = ROLLING_STRIDE_SECONDS):
    for experiment_id, values in group_rows(rows).items():
        times = np.asarray([_f(row, "timestamp_s") for row in values])
        next_end = times[0] + window_seconds
        start_index = 0
        for end_index, end in enumerate(times):
            if end + 1e-9 < next_end:
                continue
            while start_index < end_index and times[start_index] < end - window_seconds - 1e-9:
                start_index += 1
            selected = values[start_index:end_index + 1]
            if len(selected) >= 3:
                yield experiment_id, selected, float(end)
            next_end += stride_seconds


def window_truth(selected: list[dict[str, Any]]) -> tuple[str, float, str, str]:
    labels = [str(row.get("current_behavior", row.get("ground_truth_label", "NORMAL"))) for row in selected]
    values, counts = np.unique(labels, return_counts=True)
    index = int(np.argmax(counts))
    label, overlap = str(values[index]), float(counts[index] / len(selected))
    phases = [str(row.get("phase", "EVENT")) for row in selected]
    phase_values, phase_counts = np.unique(phases, return_counts=True)
    dominant_phase = str(phase_values[int(np.argmax(phase_counts))])
    phase_overlap = float(phase_counts.max() / len(selected))
    if overlap < STEADY_OVERLAP_RATIO:
        return label, overlap, "TRANSITION", "TRANSITION"
    if label != "NORMAL" and dominant_phase == "EVENT" and phase_overlap >= STEADY_OVERLAP_RATIO:
        return label, overlap, "ACTIVE_EVENT", "ACTIVE_EVENT"
    if dominant_phase == "BASELINE" and phase_overlap >= STEADY_OVERLAP_RATIO:
        return label, overlap, "STEADY", "PRE_EVENT"
    if dominant_phase == "RECOVERY" and phase_overlap >= STEADY_OVERLAP_RATIO:
        return label, overlap, "STEADY", "RECOVERY"
    return label, overlap, "STEADY", "STEADY"


def extract_windows(rows: list[dict[str, Any]], window_seconds: float = WINDOW_SECONDS) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for experiment_id, selected, end in rolling_windows(rows, window_seconds):
        first = selected[0]
        label, overlap, kind, role = window_truth(selected)
        if label == "FAULT":
            continue
        prepared = resample_window(selected, _f(first, "sample_period_s", SAMPLE_PERIOD_SECONDS),
                                   window_start_s=end - window_seconds, window_end_s=end)
        out.append({
            "experiment_id": experiment_id, "window_id": f"{experiment_id}-{end:.3f}",
            "vehicle_id": str(first["vehicle_id"]), "ground_truth_label": label,
            "scenario_label": str(first.get("scenario_label", first.get("ground_truth_label"))),
            "ground_truth_subtype": str(first["ground_truth_subtype"]),
            "window_start_s": end - window_seconds, "window_end_s": end,
            "window_kind": kind, "window_role": role, "behavior_overlap": overlap,
            **feature_vector(prepared, _f(first, "sample_period_s", SAMPLE_PERIOD_SECONDS)),
        })
    return out


def write_feature_csv(rows: list[dict[str, Any]], path: Path) -> None:
    if not rows:
        raise ValueError("No feature rows to write")
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
