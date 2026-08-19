from __future__ import annotations

from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sqlite3
from threading import Lock
from typing import Any, Dict
from urllib.parse import parse_qs, urlparse

from decision_engine import fuse_decision
from ml_engine import SmartTML
from residual_engine import ResidualTracker

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "smartt_v2.db"
JSONL_PATH = ROOT / "data" / "telemetry.jsonl"
JSONL_PATH.parent.mkdir(parents=True, exist_ok=True)
ml = SmartTML(ROOT / "models")
residual_tracker = ResidualTracker()
jsonl_lock = Lock()


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=3000")
    return conn


def init_db() -> None:
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS telemetry (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                received_at TEXT NOT NULL,
                device_id TEXT,
                vehicle_id TEXT,
                uptime_ms INTEGER,
                event_seq INTEGER,
                incident_id INTEGER,
                edge_event TEXT,
                final_event TEXT,
                confidence REAL,
                ml_anomaly_score REAL,
                ml_slosh_probability REAL,
                backend_unexplained_loss_l REAL,
                fuel_l REAL,
                fuel_quality REAL,
                slosh_score REAL,
                change_point_score REAL,
                raw_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS incidents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                vehicle_id TEXT,
                event_seq INTEGER NOT NULL,
                received_at TEXT NOT NULL,
                final_event TEXT NOT NULL,
                confidence REAL,
                reasons_json TEXT,
                evidence_json TEXT,
                model_version TEXT,
                feedback TEXT,
                raw_json TEXT NOT NULL,
                UNIQUE(device_id, event_seq)
            );

            CREATE INDEX IF NOT EXISTS idx_telemetry_received ON telemetry(received_at);
            CREATE INDEX IF NOT EXISTS idx_telemetry_device ON telemetry(device_id, received_at);
            CREATE INDEX IF NOT EXISTS idx_telemetry_vehicle ON telemetry(vehicle_id, received_at);
            CREATE INDEX IF NOT EXISTS idx_incidents_device ON incidents(device_id, received_at);
            CREATE INDEX IF NOT EXISTS idx_incidents_vehicle ON incidents(vehicle_id, received_at);
            """
        )


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def nested(payload: Dict[str, Any], group: str, key: str, default: Any = None) -> Any:
    value = payload.get(group)
    return value.get(key, default) if isinstance(value, dict) else default


def validate_payload(payload: Dict[str, Any]) -> None:
    schema = int(payload.get("schema_version", 0) or 0)
    if schema < 2:
        raise ValueError("schema_version >= 2 required")
    if not isinstance(payload.get("fuel"), dict):
        raise ValueError("fuel object required")
    if not isinstance(payload.get("context"), dict):
        raise ValueError("context object required")
    if not isinstance(payload.get("intelligence"), dict):
        raise ValueError("intelligence object required")


def ingest_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    validate_payload(payload)
    received_at = utc_now()
    ml_result = ml.infer(payload)
    ml_dict = {
        "available": ml_result.available,
        "anomaly_score": ml_result.anomaly_score,
        "anomaly_scope": ml_result.anomaly_scope,
        "expected_consumption_lph": ml_result.expected_consumption_lph,
        "slosh_probability": ml_result.slosh_probability,
        "model_version": ml_result.model_version,
        "notes": ml_result.notes,
    }

    backend_residual = residual_tracker.update(
        payload, ml_result.expected_consumption_lph
    )
    decision = fuse_decision(payload, ml_dict, backend_residual)

    enriched = dict(payload)
    enriched["server_received_at"] = received_at
    enriched["ml"] = ml_dict
    enriched["backend_residual"] = backend_residual
    enriched["backend_decision"] = decision

    with jsonl_lock:
        with JSONL_PATH.open("a", encoding="utf-8") as f:
            f.write(json.dumps(enriched, ensure_ascii=False, separators=(",", ":")) + "\n")

    device_id = str(payload.get("device_id", "unknown"))
    vehicle_id = str(payload.get("vehicle_id", "unknown"))
    event_seq = int(payload.get("event_seq", 0) or 0)
    raw = json.dumps(enriched, ensure_ascii=False, separators=(",", ":"))

    with db() as conn:
        conn.execute(
            """
            INSERT INTO telemetry(
                received_at, device_id, vehicle_id, uptime_ms, event_seq, incident_id,
                edge_event, final_event, confidence, ml_anomaly_score,
                ml_slosh_probability, backend_unexplained_loss_l,
                fuel_l, fuel_quality, slosh_score, change_point_score, raw_json
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                received_at,
                device_id,
                vehicle_id,
                int(payload.get("uptime_ms", 0) or 0),
                event_seq,
                int(payload.get("incident_id", 0) or 0),
                str(payload.get("event", "NORMAL")),
                decision["final_event"],
                decision["confidence"],
                ml_result.anomaly_score,
                ml_result.slosh_probability,
                backend_residual.get("unexplained_loss_l"),
                nested(payload, "fuel", "volume_l"),
                nested(payload, "fuel", "quality"),
                nested(payload, "intelligence", "slosh_score"),
                nested(payload, "intelligence", "change_point_score"),
                raw,
            ),
        )

        if str(payload.get("record_type", "telemetry")) == "event" and event_seq > 0:
            conn.execute(
                """
                INSERT OR IGNORE INTO incidents(
                    device_id, vehicle_id, event_seq, received_at, final_event,
                    confidence, reasons_json, evidence_json, model_version, raw_json
                ) VALUES(?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    device_id,
                    vehicle_id,
                    event_seq,
                    received_at,
                    decision["final_event"],
                    decision["confidence"],
                    json.dumps(decision["reasons"], ensure_ascii=False),
                    json.dumps(
                        {"backend_residual": backend_residual, "ml": ml_dict},
                        ensure_ascii=False,
                    ),
                    ml_result.model_version,
                    raw,
                ),
            )

    return {
        "ok": True,
        "received_at": received_at,
        "decision": decision,
        "ml": ml_dict,
        "backend_residual": backend_residual,
    }


class SmartTHandler(BaseHTTPRequestHandler):
    server_version = "SmartTBackend/2.2"

    def _send(self, status: int, obj: Any) -> None:
        if status == 204:
            body = b""
        else:
            body = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()
        if body:
            self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self._send(204, {})

    def do_POST(self) -> None:
        path = urlparse(self.path).path

        if path == "/api/v2/model/reload":
            ml.reload()
            residual_tracker.reset()
            self._send(200, {"ok": True, "ml": ml.status()})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 65536:
                raise ValueError("invalid content length")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("JSON object required")

            if path == "/api/v2/ingest":
                self._send(201, ingest_payload(payload))
                return

            if path == "/api/v2/incidents/feedback":
                device_id = str(payload.get("device_id") or "")
                event_seq = int(payload.get("event_seq", 0) or 0)
                feedback = str(payload.get("feedback") or "").strip()
                if not device_id or event_seq <= 0 or feedback not in {
                    "CONFIRMED",
                    "FALSE_ALARM",
                    "REFUEL",
                    "MAINTENANCE",
                    "UNKNOWN",
                }:
                    raise ValueError("invalid incident feedback payload")
                with db() as conn:
                    cur = conn.execute(
                        "UPDATE incidents SET feedback=? WHERE device_id=? AND event_seq=?",
                        (feedback, device_id, event_seq),
                    )
                self._send(200, {"ok": True, "updated": cur.rowcount})
                return

            self._send(404, {"ok": False, "error": "not found"})
        except Exception as exc:
            self._send(400, {"ok": False, "error": str(exc)})

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path == "/api/v2/health":
            self._send(200, {"ok": True, "time": utc_now(), "ml": ml.status()})
            return

        if path == "/api/v2/latest":
            device_id = query.get("device_id", [None])[0]
            with db() as conn:
                if device_id:
                    row = conn.execute(
                        "SELECT raw_json FROM telemetry WHERE device_id=? ORDER BY id DESC LIMIT 1",
                        (device_id,),
                    ).fetchone()
                else:
                    row = conn.execute("SELECT raw_json FROM telemetry ORDER BY id DESC LIMIT 1").fetchone()
            self._send(200, json.loads(row["raw_json"]) if row else {})
            return

        if path in {"/api/v2/history", "/api/v2/incidents"}:
            try:
                limit = max(1, min(2000, int(query.get("limit", ["200"])[0])))
            except ValueError:
                limit = 200
            device_id = query.get("device_id", [None])[0]
            table = "incidents" if path.endswith("incidents") else "telemetry"
            with db() as conn:
                if device_id:
                    rows = conn.execute(
                        f"SELECT raw_json FROM {table} WHERE device_id=? ORDER BY id DESC LIMIT ?",
                        (device_id, limit),
                    ).fetchall()
                else:
                    rows = conn.execute(
                        f"SELECT raw_json FROM {table} ORDER BY id DESC LIMIT ?", (limit,)
                    ).fetchall()
            result = [json.loads(r["raw_json"]) for r in reversed(rows)]
            self._send(200, result)
            return

        self._send(404, {"ok": False, "error": "not found"})

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[{utc_now()}] {self.address_string()} - {fmt % args}")


def main() -> None:
    init_db()
    server = ThreadingHTTPServer(("0.0.0.0", 8000), SmartTHandler)
    print("SmartT V2.2 backend listening on http://0.0.0.0:8000")
    print("ML status:", ml.status())
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
