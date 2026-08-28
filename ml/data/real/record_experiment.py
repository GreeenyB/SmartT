"""Interactive physical recorder with finalized, training-safe experiment metadata."""
from __future__ import annotations

import argparse
import csv
import json
import os
import select
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen

from ml.data.schema import SCHEMA_VERSION, normalize_row


FIELDS = list(normalize_row({"experiment_id": "x", "timestamp_s": 0, "scenario_label": "NORMAL", "phase": "EVENT"}))


def pick(payload: dict[str, object], *names: str, default: object = "") -> object:
    for name in names:
        if payload.get(name) not in (None, ""):
            return payload[name]
    return default


def flatten(payload: dict[str, object], args: argparse.Namespace, started: float, phase: str,
            behavior_start: float | None, behavior_end: float | None) -> dict[str, object]:
    raw = payload.get("raw_json", payload)
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            raw = payload
    if not isinstance(raw, dict):
        raw = payload
    now = time.monotonic() - started
    current = args.label if phase == "EVENT" else "NORMAL"
    return normalize_row({
        "schema_version": SCHEMA_VERSION,
        "timestamp_iso": pick(payload, "created_at", default=datetime.now(timezone.utc).isoformat()),
        "timestamp_s": now, "experiment_id": args.experiment_id,
        "vehicle_id": pick(raw, "vehicle_id", "vehicleId", default=args.vehicle_id),
        "fuel_raw_adc_a0": pick(raw, "fuel_raw_adc_a0"),
        "fuel_raw_adc_a1": pick(raw, "fuel_raw_adc_a1"),
        "fuel_volts_a0": pick(raw, "fuel_volts_a0"),
        "fuel_volts_a1": pick(raw, "fuel_volts_a1"),
        "raw_fuel_percent": pick(raw, "fuel_percent_raw"),
        "filtered_fuel_percent": pick(raw, "fuel_percent_filtered", "fuel_percent", default=pick(payload, "fuel_percent")),
        "fuel_rate_percent_per_sec": pick(raw, "fuel_rate_percent_per_sec", "fuel_rate_pct_per_sec"),
        "ignition": pick(raw, "ignition", "ignitionOn"),
        "gps_speed_kmh": pick(raw, "gps_speed_kmh", "speed_kmh", "speedKmh"),
        "gps_available": pick(raw, "gps_fix", "gpsFix"),
        "gps_data_fresh": pick(raw, "gps_data_fresh", "gpsDataFresh"),
        "gps_speed_fresh": pick(raw, "gps_speed_fresh", "gpsSpeedFresh"),
        "gps_stationary": pick(raw, "gps_stationary"), "gps_moving": pick(raw, "gps_moving"),
        "sensor_valid": pick(raw, "sensor_healthy", "sensorHealthy", default=1),
        "behavior_start_s": behavior_start if behavior_start is not None else -1,
        "behavior_end_s": behavior_end if behavior_end is not None else -1,
        "experiment_duration_s": -1, "experiment_complete": 0,
        "scenario_label": args.label, "current_behavior": current, "phase": phase,
        "ground_truth_subtype": args.subtype, "notes": args.notes,
    })


def _write(rows: list[dict[str, object]], path: Path) -> None:
    with path.open("x", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def finalize(rows: list[dict[str, object]], duration: float, complete: bool,
             behavior_start: float | None, behavior_end: float | None) -> None:
    for row in rows:
        row["behavior_start_s"] = behavior_start if behavior_start is not None else -1
        row["behavior_end_s"] = behavior_end if behavior_end is not None else -1
        row["experiment_duration_s"] = duration
        row["experiment_complete"] = int(complete)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--experiment-id", required=True)
    parser.add_argument("--label", required=True, choices=("NORMAL", "SLOSHING", "REFUEL", "DRAIN", "FAULT"))
    parser.add_argument("--subtype", required=True)
    parser.add_argument("--vehicle-id", default="TRUCK_01")
    parser.add_argument("--notes", default="")
    parser.add_argument("--url", default="http://localhost:8000/api/latest")
    parser.add_argument("--interval", type=float, default=.5)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    output = args.output or Path(__file__).parent / f"{args.experiment_id}.csv"
    incomplete_output = output.with_name(f"{output.stem}.incomplete{output.suffix}")
    if output.exists() or incomplete_output.exists():
        raise SystemExit(f"refusing to overwrite {output} or {incomplete_output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    phase = "EVENT" if args.label == "NORMAL" else "BASELINE"
    behavior_start: float | None = None
    behavior_end: float | None = None
    rows: list[dict[str, object]] = []
    seen: tuple[object, object] | None = None
    print("Recording. Press Enter for BEHAVIOR START, Enter again for BEHAVIOR END; Ctrl-C stops.")
    try:
        while True:
            if select.select([sys.stdin], [], [], 0)[0]:
                sys.stdin.readline()
                if behavior_start is None:
                    behavior_start = time.monotonic() - started
                    phase = "EVENT"
                    print("BEHAVIOR START marked")
                elif behavior_end is None:
                    behavior_end = time.monotonic() - started
                    phase = "RECOVERY"
                    print("BEHAVIOR END marked")
            with urlopen(args.url, timeout=2) as response:
                payload = json.load(response)
            identity = (payload.get("id"), payload.get("created_at"))
            if payload and identity != seen:
                rows.append(flatten(payload, args, started, phase, behavior_start, behavior_end))
                seen = identity
            time.sleep(max(.1, args.interval))
    except KeyboardInterrupt:
        pass

    duration = time.monotonic() - started
    complete = args.label == "NORMAL" or (
        behavior_start is not None and behavior_end is not None and behavior_end > behavior_start
    )
    finalize(rows, duration, complete, behavior_start, behavior_end)
    target = output if complete else incomplete_output
    temporary = target.with_name(f".{target.name}.inprogress")
    _write(rows, temporary)
    os.replace(temporary, target)
    missing = sum(row["raw_fuel_percent"] in (None, "") for row in rows) / max(1, len(rows))
    fuels = [float(row["filtered_fuel_percent"]) for row in rows]
    print(json.dumps({
        "file": str(target), "complete": complete, "rows": len(rows), "duration_s": round(duration, 2),
        "baseline_s": behavior_start, "event_s": None if not complete or behavior_start is None or behavior_end is None else behavior_end - behavior_start,
        "recovery_s": None if behavior_end is None else duration - behavior_end,
        "missing_raw_ratio": missing,
        "gps_speed_fresh_ratio": sum(int(row["gps_speed_fresh"]) for row in rows) / max(1, len(rows)),
        "sensor_healthy_ratio": sum(int(row["sensor_valid"]) for row in rows) / max(1, len(rows)),
        "filtered_fuel_min": min(fuels, default=None), "filtered_fuel_max": max(fuels, default=None),
        "marker_valid": complete,
    }, indent=2))
    if not complete:
        print("INCOMPLETE: saved separately and rejected by the canonical loader.")


if __name__ == "__main__":
    main()
