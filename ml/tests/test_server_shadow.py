from __future__ import annotations

import os
import sqlite3
import tempfile
import unittest
from pathlib import Path

import server.app as app


class ServerShadowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.old_data_dir = app.DATA_DIR
        self.old_db_path = app.DB_PATH
        self.old_model_path = app.ML_MODEL_PATH
        self.old_env = os.environ.get("SMARTT_ENABLE_ML")
        app.DATA_DIR = Path(self.temp.name)
        app.DB_PATH = app.DATA_DIR / "smartt.db"
        app._ml_shadow = None

    def tearDown(self) -> None:
        app.DATA_DIR = self.old_data_dir
        app.DB_PATH = self.old_db_path
        app.ML_MODEL_PATH = self.old_model_path
        app._ml_shadow = None
        if self.old_env is None:
            os.environ.pop("SMARTT_ENABLE_ML", None)
        else:
            os.environ["SMARTT_ENABLE_ML"] = self.old_env
        self.temp.cleanup()

    def payload(self) -> dict[str, object]:
        return {
            "created_at": "2026-08-29T00:00:00Z", "vehicle_id": "TEST-01",
            "fuel_percent": 70.0, "fuel_liters": 126.0, "ignition": False,
            "gps_fix": False, "current_event": "NORMAL", "detector_state": "PARKED_MONITORING",
        }

    def test_ml_disabled_preserves_ingest_response_and_null_shadow_fields(self) -> None:
        os.environ["SMARTT_ENABLE_ML"] = "0"
        app.init_db()
        result = app.ingest_payload(self.payload())
        self.assertEqual({"ok", "event_saved", "created_at", "vehicle_id"}, set(result))
        with app.connect_db() as conn:
            row = conn.execute("SELECT ml_prediction, ml_drain_probability, anomaly_score, model_version FROM telemetry").fetchone()
        self.assertEqual((None, None, None, None), tuple(row))

    def test_missing_model_fails_open(self) -> None:
        os.environ["SMARTT_ENABLE_ML"] = "1"
        app.ML_MODEL_PATH = Path(self.temp.name) / "missing.joblib"
        app.init_db()
        result = app.ingest_payload(self.payload())
        self.assertTrue(result["ok"])
        self.assertFalse(result["ml_shadow"]["available"])
        with app.connect_db() as conn:
            self.assertEqual(1, conn.execute("SELECT COUNT(*) FROM telemetry").fetchone()[0])

    def test_additive_migration_upgrades_existing_database(self) -> None:
        with sqlite3.connect(app.DB_PATH) as conn:
            conn.executescript("""
                CREATE TABLE telemetry (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT, device_id TEXT,
                    vehicle_id TEXT, fuel_percent REAL, fuel_liters REAL,
                    fuel_rate_percent_per_sec REAL, ignition INTEGER, gps_lat REAL, gps_lon REAL,
                    gps_fix INTEGER, gps_state TEXT, gps_motion_state TEXT, speed_kmh REAL,
                    detector_state TEXT, current_event TEXT, confidence REAL,
                    signal_stability REAL, sloshing_score REAL, source_type TEXT,
                    rule_result TEXT, raw_json TEXT
                );
                CREATE TABLE events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT, device_id TEXT,
                    vehicle_id TEXT, event_type TEXT, event_label TEXT,
                    fuel_delta_percent REAL, fuel_delta_liters REAL, ignition INTEGER,
                    gps_lat REAL, gps_lon REAL, gps_state TEXT, gps_motion_state TEXT,
                    confidence REAL, rule_result TEXT, raw_json TEXT
                );
            """)
        app.init_db()
        with app.connect_db() as conn:
            columns = {row[1] for row in conn.execute("PRAGMA table_info(telemetry)")}
        self.assertTrue({"ml_prediction", "ml_drain_probability", "anomaly_score", "model_version"} <= columns)


if __name__ == "__main__":
    unittest.main()
