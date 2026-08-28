from __future__ import annotations

from datetime import datetime, timedelta, timezone
import unittest

import numpy as np

from ml.config import MIN_WINDOW_COVERAGE, SAMPLE_PERIOD_SECONDS
from ml.data.real.record_experiment import flatten
from ml.data.schema import normalize_rows
from ml.features.window_features import FEATURE_NAMES, feature_vector, resample_window, window_truth
from ml.inference import ShadowInference


class _Classifier:
    classes_ = np.asarray(["NORMAL", "SLOSHING", "REFUEL", "DRAIN"], dtype=object)

    def predict_proba(self, x):
        return np.tile(np.asarray([.91, .03, .03, .03]), (len(x), 1))


class _Anomaly:
    def score_samples(self, x):
        return np.zeros(len(x))


class RuntimeContractTests(unittest.TestCase):
    def shadow(self) -> ShadowInference:
        shadow = ShadowInference(False)
        shadow.enabled = True
        shadow.bundle = {
            "classifier": _Classifier(), "anomaly_model": _Anomaly(), "feature_names": FEATURE_NAMES,
            "window_seconds": 16.0, "sample_period_s": SAMPLE_PERIOD_SECONDS,
            "min_coverage": MIN_WINDOW_COVERAGE, "abstain_threshold": .5, "model_version": "test",
        }
        return shadow

    def payload(self, fuel: float = 70.0) -> dict[str, object]:
        return {
            "fuel_percent_filtered": fuel, "fuel_percent_raw": fuel + .1, "ignition": False,
            "gps_fix": True, "gps_data_fresh": True, "gps_speed_fresh": True,
            "gps_speed_kmh": 0.2, "gps_motion_state": "STATIONARY", "sensor_healthy": True,
        }

    def observe_series(self, shadow: ShadowInference, times: list[float]) -> list[dict[str, object]]:
        start = datetime(2026, 8, 29, tzinfo=timezone.utc)
        result = []
        for index, seconds in enumerate(times):
            created = (start + timedelta(seconds=seconds)).isoformat()
            result.append(shadow.observe("vehicle", self.payload(70.0 - index * .01), created) or {})
        return result

    def test_500ms_live_series_requires_full_window_then_predicts(self) -> None:
        result = self.observe_series(self.shadow(), [index * .5 for index in range(70)])
        self.assertTrue(all(item.get("warming_up") for item in result[:32]))
        first = next(index for index, item in enumerate(result) if not item.get("warming_up"))
        self.assertGreaterEqual(first * .5, 16.0)
        self.assertEqual("NORMAL", result[first]["prediction"])
        self.assertEqual(33, result[first]["data_quality"]["expected_samples"])

    def test_jitter_is_accepted_but_large_gap_remains_data_quality_failure(self) -> None:
        jittered = [index * .5 + (.08 if index % 2 else -.07) for index in range(70)]
        result = self.observe_series(self.shadow(), jittered)
        self.assertTrue(any(not item.get("warming_up") for item in result))
        gapped = [index * .5 for index in range(70) if not 40 <= index <= 51]
        last = self.observe_series(self.shadow(), gapped)[-1]
        self.assertTrue(last["warming_up"])
        self.assertLess(last["data_quality"]["coverage"], MIN_WINDOW_COVERAGE)

    def test_runtime_and_offline_feature_vectors_match(self) -> None:
        shadow = self.shadow()
        start = datetime(2026, 8, 29, tzinfo=timezone.utc)
        payloads = [self.payload(70.0 - index * .02) for index in range(33)]
        runtime = [shadow._row(payload, (start + timedelta(seconds=index * .5)).isoformat()) for index, payload in enumerate(payloads)]
        offline = [dict(row) for row in runtime]
        prepared_runtime = resample_window(runtime, .5, window_start_s=float(runtime[0]["timestamp_s"]), window_end_s=float(runtime[-1]["timestamp_s"]))
        prepared_offline = resample_window(offline, .5, window_start_s=float(offline[0]["timestamp_s"]), window_end_s=float(offline[-1]["timestamp_s"]))
        for name in FEATURE_NAMES:
            self.assertAlmostEqual(feature_vector(prepared_runtime)[name], feature_vector(prepared_offline)[name], places=9)

    def test_completed_and_malformed_physical_experiments(self) -> None:
        base = {"experiment_id": "P1", "scenario_label": "DRAIN", "behavior_start_s": 1, "behavior_end_s": 3,
                "experiment_duration_s": 4, "experiment_complete": 1, "phase": "EVENT"}
        accepted = normalize_rows([{**base, "timestamp_s": 0}, {**base, "timestamp_s": 1}])
        self.assertEqual(2, len(accepted))
        with self.assertRaisesRegex(ValueError, "incomplete"):
            normalize_rows([{**base, "experiment_complete": 0, "timestamp_s": 0}, {**base, "experiment_complete": 0, "timestamp_s": 1}])
        with self.assertRaisesRegex(ValueError, "outside"):
            normalize_rows([{**base, "behavior_end_s": 5, "timestamp_s": 0}, {**base, "behavior_end_s": 5, "timestamp_s": 1}])

    def test_recorder_uses_authoritative_current_payload_fields(self) -> None:
        class Args:
            experiment_id = "P2"; vehicle_id = "V"; label = "DRAIN"; subtype = "DRAIN_SLOW"; notes = "test"
        row = flatten({"created_at": "2026-08-29T00:00:00Z", "fuel_raw_adc_a0": 101, "fuel_raw_adc_a1": 202,
                       "fuel_volts_a0": .1, "fuel_volts_a1": .2, "fuel_percent_raw": 44,
                       "fuel_percent_filtered": 43, "gps_data_fresh": 1, "gps_speed_fresh": 0}, Args(), 0, "EVENT", 1, 2)
        self.assertEqual(101, row["fuel_raw_adc_a0"])
        self.assertEqual(202, row["fuel_raw_adc_a1"])
        self.assertEqual(0, row["gps_speed_fresh"])

    def test_transition_definition_is_eighty_percent(self) -> None:
        rows = [{"current_behavior": "NORMAL", "phase": "BASELINE"} for _ in range(8)] + [{"current_behavior": "DRAIN", "phase": "EVENT"} for _ in range(2)]
        self.assertEqual("STEADY", window_truth(rows)[2])
        rows[7]["current_behavior"] = "DRAIN"
        self.assertEqual("TRANSITION", window_truth(rows)[2])


if __name__ == "__main__":
    unittest.main()
