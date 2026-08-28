from __future__ import annotations

import unittest

from ml.config import FORBIDDEN_FEATURE_FIELDS
from ml.features.window_features import FEATURE_NAMES, extract_windows, feature_vector, resample_window
from ml.simulation.generator import SyntheticConfig, generate
from ml.training.pipeline import group_split


class PipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.config = SyntheticConfig(experiments_per_class=4, fault_experiments=2, seed=1234)
        cls.rows = generate(cls.config)
        cls.features = extract_windows(cls.rows)

    def test_generator_is_reproducible(self) -> None:
        self.assertEqual(self.rows, generate(self.config))

    def test_ground_truth_is_scenario_defined(self) -> None:
        labels = {str(row["ground_truth_label"]) for row in self.rows}
        self.assertEqual({"NORMAL", "SLOSHING", "REFUEL", "DRAIN", "FAULT"}, labels)
        self.assertNotIn("rule_prediction", self.rows[0])

    def test_features_exclude_rule_and_label_outputs(self) -> None:
        self.assertFalse(set(FEATURE_NAMES) & FORBIDDEN_FEATURE_FIELDS)
        self.assertTrue(all(name in self.features[0] for name in FEATURE_NAMES))

    def test_group_split_has_no_experiment_leakage(self) -> None:
        split = group_split(self.features, seed=1234)
        train, validation, test = map(set, (split["train"], split["validation"], split["test"]))
        self.assertFalse(train & validation)
        self.assertFalse(train & test)
        self.assertFalse(validation & test)
        self.assertEqual(len(train | validation | test), 16)

    def test_window_features_are_finite(self) -> None:
        for row in self.features:
            for name in FEATURE_NAMES:
                self.assertTrue(float("-inf") < float(row[name]) < float("inf"), name)

    def test_resampling_preserves_missing_raw_and_speed_freshness(self) -> None:
        window = [dict(row) for row in self.rows[:80]]
        window[10]["raw_fuel_percent"] = ""
        window[10]["gps_data_fresh"] = 1
        window[10]["gps_speed_fresh"] = 0
        prepared = resample_window(window)
        self.assertGreater(feature_vector(prepared)["raw_missing_ratio"], 0.0)
        self.assertEqual(prepared[10]["gps_speed_fresh"], 0)


if __name__ == "__main__":
    unittest.main()
