import unittest

from decision_engine import fuse_decision
from residual_engine import ResidualTracker


def base_payload():
    return {
        "schema_version": 2,
        "record_type": "telemetry",
        "device_id": "dev1",
        "vehicle_id": "TRUCK_01",
        "uptime_ms": 1000,
        "event": "NORMAL",
        "confidence": 80,
        "reasons": [],
        "fuel": {
            "calibrated": True,
            "volume_l": 90.0,
            "quality": 0.95,
            "rate_lps": 0.0,
            "innovation_score": 0.1,
        },
        "intelligence": {
            "baseline_ready": True,
            "baseline_l": 90.0,
            "dynamic_threshold_l": 1.0,
            "slosh_score": 0.1,
            "change_point_score": 0.1,
            "drop_cusum_l": 0.0,
            "expected_available": False,
            "unexplained_loss_l": 0.0,
        },
        "context": {
            "mode": "PARKED STABLE",
            "ignition_known": True,
            "ignition_on": False,
            "motion_energy": 0.01,
            "speed_kmh": 0.0,
            "rpm": 0.0,
            "engine_load_pct": 0.0,
        },
        "can": {"fuel_rate_valid": False, "fuel_rate_lph": 0.0},
    }


class ResidualTests(unittest.TestCase):
    def test_engine_off_residual_tracks_net_drop(self):
        tracker = ResidualTracker()
        p = base_payload()
        r0 = tracker.update(p, learned_lph=10.0)
        self.assertTrue(r0["available"])
        self.assertEqual(r0["source"], "ENGINE_OFF_ZERO")

        p["uptime_ms"] = 3000
        p["fuel"]["volume_l"] = 87.0
        r1 = tracker.update(p, learned_lph=10.0)
        self.assertAlmostEqual(r1["unexplained_loss_l"], 3.0, places=4)

    def test_can_rate_has_priority_over_ml(self):
        tracker = ResidualTracker()
        p = base_payload()
        p["context"]["ignition_on"] = True
        p["can"] = {"fuel_rate_valid": True, "fuel_rate_lph": 18.0}
        tracker.update(p, learned_lph=7.0)
        p["uptime_ms"] = 3_601_000
        # gap >10s intentionally prevents unsafe integration across a long outage
        r = tracker.update(p, learned_lph=7.0)
        self.assertEqual(r["source"], "CAN_PID_5E")


class DecisionTests(unittest.TestCase):
    def test_ml_never_overrides_sensor_fault(self):
        p = base_payload()
        p["event"] = "SENSOR FAULT"
        d = fuse_decision(
            p,
            {"anomaly_score": 1.0, "slosh_probability": 0.0, "model_version": "x"},
            {"available": True, "source": "ENGINE_OFF_ZERO", "unexplained_loss_l": 10.0},
        )
        self.assertEqual(d["final_event"], "SENSOR FAULT")

    def test_strong_loss_can_upgrade_to_theft(self):
        p = base_payload()
        p["event"] = "SUSPICIOUS_FUEL_LOSS"
        d = fuse_decision(
            p,
            {"anomaly_score": 0.9, "slosh_probability": 0.1, "model_version": "x"},
            {"available": True, "source": "ENGINE_OFF_ZERO", "unexplained_loss_l": 3.0},
        )
        self.assertEqual(d["final_event"], "FUEL_THEFT_ANOMALY")
        self.assertGreaterEqual(d["confidence"], 88.0)

    def test_high_ml_slosh_does_not_create_theft(self):
        p = base_payload()
        p["event"] = "SUSPICIOUS_FUEL_LOSS"
        d = fuse_decision(
            p,
            {"anomaly_score": 0.95, "slosh_probability": 0.95, "model_version": "x"},
            {"available": True, "source": "ENGINE_OFF_ZERO", "unexplained_loss_l": 4.0},
        )
        self.assertNotEqual(d["final_event"], "FUEL_THEFT_ANOMALY")


if __name__ == "__main__":
    unittest.main()
