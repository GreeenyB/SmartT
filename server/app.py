from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, request, send_from_directory


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "smartt.db"
STATIC_DIR = BASE_DIR / "static"

TELEMETRY_COLUMNS = [
    "created_at",
    "device_id",
    "vehicle_id",
    "fuel_percent",
    "fuel_liters",
    "fuel_rate_percent_per_sec",
    "ignition",
    "gps_lat",
    "gps_lon",
    "gps_fix",
    "gps_state",
    "gps_motion_state",
    "speed_kmh",
    "detector_state",
    "current_event",
    "confidence",
    "signal_stability",
    "sloshing_score",
    "source_type",
    "rule_result",
    "raw_json",
]

EVENT_COLUMNS = [
    "created_at",
    "device_id",
    "vehicle_id",
    "event_type",
    "event_label",
    "fuel_delta_percent",
    "fuel_delta_liters",
    "ignition",
    "gps_lat",
    "gps_lon",
    "gps_state",
    "gps_motion_state",
    "confidence",
    "rule_result",
    "raw_json",
]

IGNORED_EVENT_CODES = {
    "",
    "--",
    "NONE",
    "BOOT",
    "NORMAL",
    "WARMING_UP",
    "PARKED_SETTLING",
    "PARKED_MONITORING",
    "FUEL_DROP_CANDIDATE",
    "DROP_CANDIDATE",
    "REFUEL_CANDIDATE",
}

MEANINGFUL_EVENT_TERMS = (
    "REFUEL",
    "DROP",
    "THEFT",
    "SLOSH",
    "FAULT",
    "ADS1115",
    "GPS_MOVING",
)

app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_timestamp(value: Any) -> str:
    if value is None or value == "":
        return utc_now()

    if isinstance(value, (int, float)):
        number = float(value)
        if number > 10_000_000_000:
            number = number / 1000.0
        return (
            datetime.fromtimestamp(number, tz=timezone.utc)
            .replace(microsecond=0)
            .isoformat()
            .replace("+00:00", "Z")
        )

    text = str(value).strip()
    if not text:
        return utc_now()
    return text


def timestamp_window(created_at: str) -> tuple[str, str]:
    try:
        normalized = created_at.replace("Z", "+00:00")
        center = datetime.fromisoformat(normalized)
        if center.tzinfo is None:
            center = center.replace(tzinfo=timezone.utc)
    except ValueError:
        center = datetime.now(timezone.utc)

    start = (center - timedelta(seconds=10)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    end = (center + timedelta(seconds=10)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return start, end


def connect_db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def ensure_database() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with connect_db() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS telemetry (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT,
                device_id TEXT,
                vehicle_id TEXT,
                fuel_percent REAL,
                fuel_liters REAL,
                fuel_rate_percent_per_sec REAL,
                ignition INTEGER,
                gps_lat REAL,
                gps_lon REAL,
                gps_fix INTEGER,
                gps_state TEXT,
                gps_motion_state TEXT,
                speed_kmh REAL,
                detector_state TEXT,
                current_event TEXT,
                confidence REAL,
                signal_stability REAL,
                sloshing_score REAL,
                source_type TEXT,
                rule_result TEXT,
                raw_json TEXT
            );

            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT,
                device_id TEXT,
                vehicle_id TEXT,
                event_type TEXT,
                event_label TEXT,
                fuel_delta_percent REAL,
                fuel_delta_liters REAL,
                ignition INTEGER,
                gps_lat REAL,
                gps_lon REAL,
                gps_state TEXT,
                gps_motion_state TEXT,
                confidence REAL,
                rule_result TEXT,
                raw_json TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_telemetry_created_at ON telemetry(created_at);
            CREATE INDEX IF NOT EXISTS idx_telemetry_vehicle_created ON telemetry(vehicle_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_events_vehicle_created ON events(vehicle_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_events_dedupe ON events(vehicle_id, event_type, event_label, created_at);
            """
        )


def get_any(data: dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if key in data and data[key] is not None and data[key] != "":
            return data[key]
    return default


def to_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def to_text(value: Any, default: str | None = None) -> str | None:
    if value is None:
        return default
    text = str(value).strip()
    return text if text else default


def to_bool_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return 1 if value else 0
    if isinstance(value, (int, float)):
        return 1 if value else 0

    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "y", "on", "high"}:
        return 1
    if normalized in {"0", "false", "no", "n", "off", "low"}:
        return 0
    return None


def json_dump(data: dict[str, Any]) -> str:
    return json.dumps(data, separators=(",", ":"), sort_keys=True)


def event_label_for(event_type: str | None, alert: str | None = None) -> str:
    code = (event_type or "").upper()
    alert_code = (alert or "").upper()

    if "REFUEL" in code:
        return "Refuel"
    if "SLOSH" in code:
        return "Slosh"
    if "FAULT" in code or "ADS1115" in code:
        return "Sensor fault"
    if "THEFT" in code or "THEFT" in alert_code or "SUSPICIOUS" in code:
        return "Theft suspected"
    if "DROP" in code:
        return "Stationary drop"
    if code in {"", "NONE", "NORMAL"}:
        return "Normal"
    return event_type or "Normal"


def normalize_telemetry(data: dict[str, Any]) -> dict[str, Any]:
    created_at = parse_timestamp(get_any(data, "created_at", "createdAt", "timestamp", "time"))
    raw = json_dump(data)
    event_code = to_text(get_any(data, "event", "event_type", "eventType"))
    current_event = to_text(get_any(data, "current_event", "currentEvent", default=event_code), "--")

    return {
        "created_at": created_at,
        "device_id": to_text(get_any(data, "device_id", "deviceId"), "smartt-esp32-001"),
        "vehicle_id": to_text(get_any(data, "vehicle_id", "vehicleId"), "SMT-001"),
        "fuel_percent": to_float(
            get_any(data, "fuel_percent", "fuelPercent", "fuel_percent_filtered", "fuelPercentFiltered")
        ),
        "fuel_liters": to_float(get_any(data, "fuel_liters", "fuelLiters")),
        "fuel_rate_percent_per_sec": to_float(
            get_any(
                data,
                "fuel_rate_percent_per_sec",
                "fuelRatePercentPerSec",
                "fuel_rate_pct_per_sec",
                "fuelRatePctPerSec",
            )
        ),
        "ignition": to_bool_int(get_any(data, "ignition", "ignitionOn")),
        "gps_lat": to_float(get_any(data, "gps_lat", "gpsLat")),
        "gps_lon": to_float(get_any(data, "gps_lon", "gpsLon", "gps_lng", "gpsLng")),
        "gps_fix": to_bool_int(get_any(data, "gps_fix", "gpsFix", "gps_data_fresh", "gpsDataFresh")),
        "gps_state": to_text(get_any(data, "gps_state", "gpsState"), "--"),
        "gps_motion_state": to_text(get_any(data, "gps_motion_state", "gpsMotionState"), "--"),
        "speed_kmh": to_float(get_any(data, "speed_kmh", "speedKmh", "gps_speed_kmh", "gpsSpeedKmh")),
        "detector_state": to_text(get_any(data, "detector_state", "detectorState"), "--"),
        "current_event": current_event,
        "confidence": to_float(get_any(data, "confidence", "anomaly_confidence", "anomalyConfidence")),
        "signal_stability": to_float(get_any(data, "signal_stability", "signalStability")),
        "sloshing_score": to_float(get_any(data, "sloshing_score", "sloshingScore")),
        "source_type": to_text(get_any(data, "source_type", "sourceType"), "ANALOG_ADS1115"),
        "rule_result": to_text(get_any(data, "rule_result", "ruleResult"), "--"),
        "raw_json": raw,
    }


def is_meaningful_event(event_type: str | None, alert: str | None, delta_liters: float | None) -> bool:
    code = (event_type or "").upper().strip()
    alert_code = (alert or "").upper().strip()

    if alert_code and alert_code != "NONE":
        return True
    if code in IGNORED_EVENT_CODES:
        return False
    if any(term in code for term in MEANINGFUL_EVENT_TERMS):
        return True
    return delta_liters is not None and abs(delta_liters) >= 2.0


def normalize_event(data: dict[str, Any], telemetry: dict[str, Any]) -> dict[str, Any] | None:
    event_type = to_text(
        get_any(data, "event_type", "eventType", "event", "currentEvent", "current_event"),
        "NORMAL",
    )
    alert = to_text(get_any(data, "alert", "alertType"))
    delta_liters = to_float(get_any(data, "fuel_delta_liters", "fuelDeltaLiters", "delta_liters", "deltaLiters"))

    if not is_meaningful_event(event_type, alert, delta_liters):
        return None

    raw = telemetry["raw_json"]
    incoming_label = to_text(get_any(data, "event_label", "eventLabel", "alert_label", "alertLabel"))
    event_label = event_label_for(event_type, alert)
    if event_label == event_type and incoming_label and incoming_label.upper() not in {"NO ALERT", "NONE"}:
        event_label = incoming_label

    return {
        "created_at": telemetry["created_at"],
        "device_id": telemetry["device_id"],
        "vehicle_id": telemetry["vehicle_id"],
        "event_type": event_type,
        "event_label": event_label,
        "fuel_delta_percent": to_float(
            get_any(data, "fuel_delta_percent", "fuelDeltaPercent", "delta_percent", "deltaPercent")
        ),
        "fuel_delta_liters": delta_liters,
        "ignition": telemetry["ignition"],
        "gps_lat": telemetry["gps_lat"],
        "gps_lon": telemetry["gps_lon"],
        "gps_state": telemetry["gps_state"],
        "gps_motion_state": telemetry["gps_motion_state"],
        "confidence": telemetry["confidence"],
        "rule_result": telemetry["rule_result"],
        "raw_json": raw,
    }


def insert_row(db: sqlite3.Connection, table: str, columns: list[str], values: dict[str, Any]) -> int:
    placeholders = ", ".join("?" for _ in columns)
    column_sql = ", ".join(columns)
    cursor = db.execute(
        f"INSERT INTO {table} ({column_sql}) VALUES ({placeholders})",
        [values.get(column) for column in columns],
    )
    return int(cursor.lastrowid)


def event_is_duplicate(db: sqlite3.Connection, event: dict[str, Any]) -> bool:
    window_start, window_end = timestamp_window(event["created_at"])
    rows = db.execute(
        """
        SELECT fuel_delta_liters
        FROM events
        WHERE vehicle_id = ?
          AND event_type = ?
          AND COALESCE(event_label, '') = COALESCE(?, '')
          AND created_at BETWEEN ? AND ?
        ORDER BY created_at DESC
        LIMIT 20
        """,
        (
            event["vehicle_id"],
            event["event_type"],
            event["event_label"],
            window_start,
            window_end,
        ),
    ).fetchall()

    new_delta = event.get("fuel_delta_liters")
    for row in rows:
        old_delta = row["fuel_delta_liters"]
        if old_delta is None and new_delta is None:
            return True
        if old_delta is not None and new_delta is not None and abs(float(old_delta) - float(new_delta)) <= 0.3:
            return True
    return False


def store_payload(data: dict[str, Any]) -> dict[str, Any]:
    ensure_database()
    telemetry = normalize_telemetry(data)
    event = normalize_event(data, telemetry)

    with connect_db() as db:
        insert_row(db, "telemetry", TELEMETRY_COLUMNS, telemetry)
        stored_event = False
        if event is not None and not event_is_duplicate(db, event):
            insert_row(db, "events", EVENT_COLUMNS, event)
            stored_event = True
        db.commit()

    return {"ok": True, "storedTelemetry": True, "storedEvent": stored_event}


def clamp_limit(value: Any, default: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(1, min(parsed, maximum))


def serialize_row(row: sqlite3.Row) -> dict[str, Any]:
    return dict(row)


@app.get("/")
def dashboard() -> Any:
    return send_from_directory(STATIC_DIR, "index.html")


@app.get("/api/health")
def health() -> Any:
    ensure_database()
    with connect_db() as db:
        latest = db.execute("SELECT created_at FROM telemetry ORDER BY created_at DESC, id DESC LIMIT 1").fetchone()
        count = db.execute("SELECT COUNT(*) AS count FROM telemetry").fetchone()["count"]

    return jsonify(
        {
            "status": "ok",
            "database": "server/data/smartt.db",
            "latestTelemetryAt": latest["created_at"] if latest else None,
            "telemetryCount": count,
        }
    )


@app.post("/api/ingest")
def ingest() -> Any:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"ok": False, "error": "Expected a JSON object"}), 400
    return jsonify(store_payload(data))


@app.get("/api/latest")
def latest() -> Any:
    ensure_database()
    with connect_db() as db:
        row = db.execute("SELECT * FROM telemetry ORDER BY created_at DESC, id DESC LIMIT 1").fetchone()
    return jsonify(serialize_row(row) if row else None)


@app.get("/api/history")
def history() -> Any:
    ensure_database()
    limit = clamp_limit(request.args.get("limit"), 500, 2000)
    with connect_db() as db:
        rows = db.execute(
            "SELECT * FROM telemetry ORDER BY created_at DESC, id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return jsonify([serialize_row(row) for row in reversed(rows)])


@app.get("/api/events")
def events() -> Any:
    ensure_database()
    limit = clamp_limit(request.args.get("limit"), 100, 500)
    with connect_db() as db:
        rows = db.execute(
            "SELECT * FROM events ORDER BY created_at DESC, id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return jsonify([serialize_row(row) for row in rows])


def resolve_sample_path(path_text: str) -> Path:
    path = Path(path_text)
    if path.is_file():
        return path
    local_path = BASE_DIR / path_text
    if local_path.is_file():
        return local_path
    raise FileNotFoundError(f"Sample file not found: {path_text}")


def load_sample(path_text: str) -> dict[str, int]:
    path = resolve_sample_path(path_text)
    with path.open("r", encoding="utf-8") as handle:
        records = json.load(handle)

    if not isinstance(records, list):
        raise ValueError("Sample file must contain a JSON array")

    telemetry_count = 0
    event_count = 0
    for record in records:
        if not isinstance(record, dict):
            continue
        result = store_payload(record)
        telemetry_count += 1 if result["storedTelemetry"] else 0
        event_count += 1 if result["storedEvent"] else 0

    return {"telemetry": telemetry_count, "events": event_count}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SmartT local Flask server")
    parser.add_argument("--host", default="0.0.0.0", help="Host interface to bind")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind")
    parser.add_argument("--debug", action="store_true", help="Enable Flask debug mode")
    parser.add_argument("--load-sample", help="Load a sample_data JSON file and exit")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    ensure_database()

    if args.load_sample:
        counts = load_sample(args.load_sample)
        print(f"Loaded {counts['telemetry']} telemetry rows and {counts['events']} event rows.")
        return

    app.run(host=args.host, port=args.port, debug=args.debug, threaded=True)


if __name__ == "__main__":
    main()
