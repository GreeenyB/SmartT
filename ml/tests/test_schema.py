import unittest
from ml.data.schema import normalize_row

class SchemaTests(unittest.TestCase):
    def test_firmware_a0_a1_and_freshness_are_preserved(self):
        row=normalize_row({"experiment_id":"PHYS-1","timestamp_s":1,"scenario_label":"DRAIN","phase":"EVENT","behavior_start_s":.5,"behavior_end_s":2,"fuel_raw_adc_a0":123,"fuel_raw_adc_a1":456,"fuel_volts_a0":.1,"fuel_volts_a1":.2,"filtered_fuel_percent":50,"gps_data_fresh":1,"gps_speed_fresh":0})
        self.assertEqual(row["fuel_raw_adc_a0"],123); self.assertEqual(row["fuel_raw_adc_a1"],456)
        self.assertEqual(row["gps_data_fresh"],1); self.assertEqual(row["gps_speed_fresh"],0)
    def test_rejects_inverted_markers(self):
        with self.assertRaises(ValueError): normalize_row({"experiment_id":"bad","timestamp_s":1,"scenario_label":"DRAIN","phase":"EVENT","behavior_start_s":2,"behavior_end_s":1})
