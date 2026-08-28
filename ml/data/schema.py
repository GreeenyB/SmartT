"""Canonical SmartT experiment rows shared by synthetic, physical, and live paths."""
from __future__ import annotations

import csv
from pathlib import Path
from typing import Any, Iterable

SCHEMA_VERSION = "smartt-experiment-v2"
BEHAVIORS = {"NORMAL", "SLOSHING", "REFUEL", "DRAIN", "FAULT"}
PHASES = {"BASELINE", "EVENT", "RECOVERY"}


def number(value: Any, default: float = 0.0) -> float:
    try:
        return float(value) if value not in (None, "") else default
    except (TypeError, ValueError):
        return default


def boolean(value: Any, default: int = 0) -> int:
    if value in (None, ""):
        return default
    if isinstance(value, str):
        return int(value.strip().lower() in {"1", "true", "yes", "on"})
    return int(bool(value))


def normalize_row(source: dict[str, Any]) -> dict[str, object]:
    """Normalize recorder or synthetic records without inventing raw samples."""
    scenario = str(source.get("scenario_label") or source.get("ground_truth_label") or "").upper()
    if scenario not in BEHAVIORS:
        raise ValueError(f"invalid scenario_label: {scenario!r}")
    experiment_id = str(source.get("experiment_id") or "").strip()
    if not experiment_id:
        raise ValueError("experiment_id is required")
    timestamp = number(source.get("timestamp_s"), float("nan"))
    if timestamp != timestamp:
        raise ValueError("timestamp_s is required")
    start = number(source.get("behavior_start_s"), -1.0)
    end = number(source.get("behavior_end_s"), -1.0)
    if scenario != "NORMAL" and start >= 0 and end >= 0 and end <= start:
        raise ValueError("behavior_end_s must be after behavior_start_s")
    phase = str(source.get("phase") or ("EVENT" if scenario == "NORMAL" else "BASELINE")).upper()
    if phase not in PHASES:
        raise ValueError(f"invalid phase: {phase!r}")
    current = str(source.get("current_behavior") or (scenario if phase == "EVENT" else "NORMAL")).upper()
    if current not in BEHAVIORS:
        raise ValueError(f"invalid current_behavior: {current!r}")
    raw = source.get("raw_fuel_percent", "")
    return {
        "schema_version": str(source.get("schema_version") or SCHEMA_VERSION),
        "timestamp_iso": str(source.get("timestamp_iso") or source.get("timestamp") or ""),
        "timestamp_s": timestamp, "experiment_id": experiment_id,
        "vehicle_id": str(source.get("vehicle_id") or "UNKNOWN"),
        "sample_period_s": number(source.get("sample_period_s"), 0.25),
        "fuel_raw_adc_a0": source.get("fuel_raw_adc_a0", source.get("raw_adc", "")),
        "fuel_raw_adc_a1": source.get("fuel_raw_adc_a1", ""),
        "fuel_volts_a0": source.get("fuel_volts_a0", source.get("voltage", "")),
        "fuel_volts_a1": source.get("fuel_volts_a1", ""),
        "raw_fuel_percent": raw, "filtered_fuel_percent": number(source.get("filtered_fuel_percent")),
        "fuel_rate_percent_per_sec": number(source.get("fuel_rate_percent_per_sec")),
        "ignition": boolean(source.get("ignition")), "gps_speed_kmh": number(source.get("gps_speed_kmh")),
        "gps_available": boolean(source.get("gps_available", source.get("gps_fix"))),
        "gps_data_fresh": boolean(source.get("gps_data_fresh", source.get("gps_fresh"))),
        "gps_speed_fresh": boolean(source.get("gps_speed_fresh", source.get("gps_fresh"))),
        "gps_stationary": boolean(source.get("gps_stationary")), "gps_moving": boolean(source.get("gps_moving")),
        "sensor_valid": boolean(source.get("sensor_valid", source.get("sensor_healthy", 1)), 1),
        "behavior_start_s": start, "behavior_end_s": end, "scenario_label": scenario,
        "ground_truth_label": scenario, "current_behavior": current, "phase": phase,
        "ground_truth_subtype": str(source.get("ground_truth_subtype") or source.get("subtype") or "UNSPECIFIED"),
        "notes": str(source.get("notes") or ""),
    }


def normalize_rows(rows: Iterable[dict[str, Any]]) -> list[dict[str, object]]:
    result = [normalize_row(row) for row in rows]
    by_id: dict[str, list[dict[str, object]]] = {}
    for row in result:
        by_id.setdefault(str(row["experiment_id"]), []).append(row)
    for experiment in by_id.values():
        experiment.sort(key=lambda row: float(row["timestamp_s"]))
        if any(float(b["timestamp_s"]) <= float(a["timestamp_s"]) for a, b in zip(experiment, experiment[1:])):
            raise ValueError(f"timestamps must increase: {experiment[0]['experiment_id']}")
    return result


def load_csv(path: Path) -> list[dict[str, object]]:
    with Path(path).open(newline="", encoding="utf-8") as handle:
        return normalize_rows(csv.DictReader(handle))
