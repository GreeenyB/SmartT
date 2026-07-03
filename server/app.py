from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sqlite3
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse


SERVER_DIR = Path(__file__).resolve().parent
REPO_DIR = SERVER_DIR.parent
UI_DIR = REPO_DIR / "ui-prototype" / "local-dashboard"
DATA_DIR = SERVER_DIR / "data"
DB_PATH = DATA_DIR / "smartt.db"
DEFAULT_HOST = os.environ.get("SMARTT_HOST", "0.0.0.0")
DEFAULT_PORT = int(os.environ.get("SMARTT_PORT", "8000"))


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def connect_db() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with connect_db() as conn:
        conn.execute(
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
            )
            """
        )
        conn.execute(
            """
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
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_created_at ON telemetry(created_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_vehicle_created ON telemetry(vehicle_id, created_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_events_vehicle_created ON events(vehicle_id, created_at)")
        conn.commit()


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {key: row[key] for key in row.keys()}


def get_value(data: dict[str, Any], *names: str, default: Any = None) -> Any:
    for name in names:
        if name in data and data[name] not in (None, ""):
            return data[name]
    return default


def number_value(data: dict[str, Any], *names: str, default: float | None = None) -> float | None:
    value = get_value(data, *names, default=default)
    if value in (None, ""):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def bool_value(value: Any) -> int:
    if isinstance(value, bool):
        return 1 if value else 0
    if isinstance(value, (int, float)):
        return 1 if value else 0
    text = str(value or "").strip().lower()
    return 1 if text in {"1", "true", "on", "yes"} else 0


def friendly_event_label(event_type: str) -> str:
    labels = {
        "REFUEL_CANDIDATE": "Refuel candidate",
        "REFUEL_EVENT": "Refuel detected",
        "SLOSHING_DETECTED": "Sloshing detected",
        "FUEL_DROP_CANDIDATE": "Drop candidate",
        "SUSPICIOUS_DROP": "Theft suspected",
        "FUEL_THEFT_ANOMALY": "Theft suspected",
        "FAST_DROP_IGN_ON": "Fast drop",
        "FUEL_DROP_WHILE_MOVING": "Fuel drop while moving",
        "SENSOR_FAULT": "Sensor fault",
        "ADS1115_MISSING": "Sensor fault",
        "GPS_MOVING_IGN_OFF": "GPS motion conflict",
    }
    if event_type in labels:
        return labels[event_type]
    return event_type.replace("_", " ").strip().title() if event_type else "Fuel event"


def is_significant_event(event_type: str, event_label: str, delta_liters: float | None, confidence: float | None) -> bool:
    text = f"{event_type} {event_label}".lower()
    if any(token in text for token in ("refuel", "slosh", "noise", "theft", "suspicious", "drop", "fault", "ads1115", "sensor")):
        return True
    if any(token in text for token in ("normal", "stable", "parked_monitoring", "boot")):
        return False
    return abs(delta_liters or 0) >= 0.5 or (confidence or 0) >= 50


def query_rows(table: str, params: dict[str, list[str]], default_limit: int) -> list[dict[str, Any]]:
    where: list[str] = []
    args: list[Any] = []

    vehicle_id = params.get("vehicle_id", params.get("vehicleId", [""]))[0]
    if vehicle_id:
        where.append("vehicle_id = ?")
        args.append(vehicle_id)

    start = params.get("start", [""])[0]
    end = params.get("end", [""])[0]
    if start:
        where.append("created_at >= ?")
        args.append(start)
    if end:
        where.append("created_at <= ?")
        args.append(end)

    limit_text = params.get("limit", [str(default_limit)])[0]
    try:
      limit = max(1, min(int(limit_text), 2000))
    except ValueError:
      limit = default_limit

    sql = f"SELECT * FROM {table}"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY created_at DESC, id DESC LIMIT ?"
    args.append(limit)

    with connect_db() as conn:
        rows = conn.execute(sql, args).fetchall()
    return [row_to_dict(row) for row in reversed(rows)]


def latest_row(params: dict[str, list[str]]) -> dict[str, Any] | None:
    where: list[str] = []
    args: list[Any] = []
    vehicle_id = params.get("vehicle_id", params.get("vehicleId", [""]))[0]
    if vehicle_id:
        where.append("vehicle_id = ?")
        args.append(vehicle_id)
    sql = "SELECT * FROM telemetry"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY created_at DESC, id DESC LIMIT 1"
    with connect_db() as conn:
        return row_to_dict(conn.execute(sql, args).fetchone())


def ingest_payload(data: dict[str, Any]) -> dict[str, Any]:
    created_at = str(get_value(data, "created_at", "createdAt", "timestamp", default=utc_now()))
    device_id = str(get_value(data, "device_id", "deviceId", default="smartt-esp32-001"))
    vehicle_id = str(get_value(data, "vehicle_id", "vehicleId", default="SMT-001"))
    fuel_percent = number_value(data, "fuel_percent", "fuelPercent", "fuel_percent_filtered", default=None)
    fuel_liters = number_value(data, "fuel_liters", "fuelLiters", default=None)
    delta_percent = number_value(data, "fuel_delta_percent", "fuelDeltaPercent", "delta_percent", default=None)
    delta_liters = number_value(data, "fuel_delta_liters", "fuelDeltaLiters", "delta_liters", default=None)
    confidence = number_value(data, "confidence", "anomaly_confidence", default=None)
    event_type = str(get_value(data, "event_type", "event", "currentEvent", "current_event", "detectorState", "detector_state", default="NORMAL"))
    current_event = str(get_value(data, "current_event", "currentEvent", "event_label", "eventLabel", default=friendly_event_label(event_type)))
    event_label = str(get_value(data, "event_label", "eventLabel", default=friendly_event_label(event_type)))
    raw_json = json.dumps(data, separators=(",", ":"), sort_keys=True)
    ignition = bool_value(get_value(data, "ignition", "ignitionOn", "ignition_on", default=False))

    with connect_db() as conn:
        conn.execute(
            """
            INSERT INTO telemetry (
                created_at, device_id, vehicle_id, fuel_percent, fuel_liters,
                fuel_rate_percent_per_sec, ignition, gps_lat, gps_lon, gps_fix,
                gps_state, gps_motion_state, speed_kmh, detector_state,
                current_event, confidence, signal_stability, sloshing_score,
                source_type, rule_result, raw_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                created_at,
                device_id,
                vehicle_id,
                fuel_percent,
                fuel_liters,
                number_value(data, "fuel_rate_percent_per_sec", "fuelRatePercentPerSec", "fuel_rate_pct_per_sec", default=None),
                ignition,
                number_value(data, "gps_lat", "gpsLat", "lat", default=None),
                number_value(data, "gps_lon", "gpsLon", "lon", "lng", default=None),
                bool_value(get_value(data, "gps_fix", "gpsFix", default=False)),
                get_value(data, "gps_state", "gpsState", default="--"),
                get_value(data, "gps_motion_state", "gpsMotionState", default="--"),
                number_value(data, "speed_kmh", "speedKmh", "gps_speed_kmh", default=0),
                get_value(data, "detector_state", "detectorState", default=event_type),
                current_event,
                confidence,
                number_value(data, "signal_stability", "signalStability", default=None),
                number_value(data, "sloshing_score", "sloshingScore", default=None),
                get_value(data, "source_type", "sourceType", "data_source", default="ANALOG_ADS1115"),
                get_value(data, "rule_result", "ruleResult", default="--"),
                raw_json,
            ),
        )

        event_saved = False
        if is_significant_event(event_type, event_label, delta_liters, confidence):
            conn.execute(
                """
                INSERT INTO events (
                    created_at, device_id, vehicle_id, event_type, event_label,
                    fuel_delta_percent, fuel_delta_liters, ignition, gps_lat, gps_lon,
                    gps_state, gps_motion_state, confidence, rule_result, raw_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    created_at,
                    device_id,
                    vehicle_id,
                    event_type,
                    event_label,
                    delta_percent,
                    delta_liters,
                    ignition,
                    number_value(data, "gps_lat", "gpsLat", "lat", default=None),
                    number_value(data, "gps_lon", "gpsLon", "lon", "lng", default=None),
                    get_value(data, "gps_state", "gpsState", default="--"),
                    get_value(data, "gps_motion_state", "gpsMotionState", default="--"),
                    confidence,
                    get_value(data, "rule_result", "ruleResult", default="--"),
                    raw_json,
                ),
            )
            event_saved = True
        conn.commit()

    return {"ok": True, "event_saved": event_saved, "created_at": created_at, "vehicle_id": vehicle_id}


class SmartTHandler(SimpleHTTPRequestHandler):
    server_version = "SmartTLocal/1.0"

    def log_message(self, format: str, *args: Any) -> None:
        print("%s - %s" % (self.address_string(), format % args))

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, payload: Any, status: int = 200) -> None:
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_static_file(self, requested_path: str) -> None:
        rel_path = unquote(requested_path.lstrip("/")) or "index.html"
        target = (UI_DIR / rel_path).resolve()
        ui_root = UI_DIR.resolve()
        if target == ui_root:
            target = ui_root / "index.html"
        if ui_root not in target.parents and target != ui_root:
            self.send_error(404)
            return
        if target.is_dir():
            target = target / "index.html"
        if not target.exists() or not target.is_file():
            self.send_error(404)
            return

        content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        path = parsed.path

        if path == "/api/health":
            self.send_json({
                "ok": True,
                "server_time": utc_now(),
                "dashboard_source": str(UI_DIR),
                "database": str(DB_PATH),
            })
            return
        if path == "/api/latest":
            self.send_json(latest_row(params) or {})
            return
        if path == "/api/history":
            self.send_json(query_rows("telemetry", params, 500))
            return
        if path == "/api/events":
            self.send_json(query_rows("events", params, 500))
            return
        if path.startswith("/api/"):
            self.send_json({"ok": False, "message": "Unknown API endpoint"}, 404)
            return

        self.send_static_file(path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/ingest":
            self.send_json({"ok": False, "message": "Unknown API endpoint"}, 404)
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = self.rfile.read(length).decode("utf-8")
            data = json.loads(payload or "{}")
            if not isinstance(data, dict):
                raise ValueError("JSON body must be an object")
        except (json.JSONDecodeError, ValueError) as exc:
            self.send_json({"ok": False, "message": str(exc)}, 400)
            return

        self.send_json(ingest_payload(data), 201)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the SmartT Local Server")
    parser.add_argument("--host", default=DEFAULT_HOST, help="Host interface to bind")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Port to listen on")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not UI_DIR.exists():
        raise SystemExit(f"Dashboard source not found: {UI_DIR}")
    init_db()
    httpd = ThreadingHTTPServer((args.host, args.port), SmartTHandler)
    display_host = "localhost" if args.host in {"0.0.0.0", ""} else args.host
    print(f"SmartT Local Server running at http://{display_host}:{args.port}")
    print(f"Serving dashboard source from {UI_DIR}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped")


if __name__ == "__main__":
    main()
