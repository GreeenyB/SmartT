from __future__ import annotations

import math
import unittest

from ml.simulation.detector_reference import DetectorReference


class DetectorScenarioTests(unittest.TestCase):
    period = 0.25

    def feed(self, detector: DetectorReference, start: float, values: list[float], *,
             ignition: bool = False, gps_fresh: bool = False, gps_moving: bool = False,
             sensor_valid: bool = True) -> tuple[float, list[dict[str, object]]]:
        output = []
        now = start
        for value in values:
            output.append(detector.step(now, value, ignition, gps_fresh, gps_moving, sensor_valid))
            now += self.period
        return now, output

    def stable(self, value: float, seconds: float) -> list[float]:
        return [value] * int(seconds / self.period)

    def ramp(self, start: float, end: float, seconds: float) -> list[float]:
        count = int(seconds / self.period)
        return [start + (end - start) * index / max(1, count - 1) for index in range(count)]

    def ready_off(self, detector: DetectorReference, fuel: float = 70.0) -> float:
        now, _ = self.feed(detector, 0.0, self.stable(fuel, 6.0))
        return now

    def test_normal_noise_drift_and_ignition_on_operation_do_not_alert(self) -> None:
        for ignition in (False, True):
            detector = DetectorReference()
            values = [70.0 + 0.15 * math.sin(index / 3) - index * 0.0005 for index in range(240)]
            _, output = self.feed(detector, 0.0, values, ignition=ignition)
            self.assertFalse(any(row["new_alert"] for row in output))

    def test_sloshing_variants_do_not_alert(self) -> None:
        for amplitude, moving in ((1.5, False), (5.5, False), (8.0, True)):
            detector = DetectorReference()
            now = self.ready_off(detector)
            values = [70.0 + amplitude * math.sin(index * 0.72) for index in range(160)]
            now, output = self.feed(detector, now, values, gps_fresh=moving, gps_moving=moving)
            now, recovery = self.feed(detector, now, self.stable(70.0, 5.0), gps_fresh=moving, gps_moving=moving)
            self.assertFalse(any(row["new_alert"] for row in output + recovery))

    def test_refuel_fast_slow_off_and_on_never_becomes_theft(self) -> None:
        for ignition, duration in ((False, 3.0), (False, 14.0), (True, 4.0)):
            detector = DetectorReference()
            now = self.ready_off(detector)
            now, output = self.feed(detector, now, self.ramp(70.0, 82.0, duration), ignition=ignition)
            now, held = self.feed(detector, now, self.stable(82.0, 5.0), ignition=ignition)
            combined = output + held
            self.assertFalse(any(row["new_alert"] for row in combined))
            if not ignition:
                self.assertIn("REFUEL_EVENT", [row["event"] for row in combined])

    def test_real_parked_drain_variants_alert(self) -> None:
        variants = [
            self.ramp(70.0, 58.0, 3.0),
            self.ramp(70.0, 59.0, 8.0),
            self.ramp(70.0, 66.0, 3.0) + self.stable(66.0, 2.0) + self.ramp(66.0, 59.0, 4.0),
            [70.0 - min(12.0, index * 0.18) + 0.5 * math.sin(index) for index in range(100)],
        ]
        for values in variants:
            detector = DetectorReference()
            now = self.ready_off(detector)
            now, output = self.feed(detector, now, values)
            _, held = self.feed(detector, now, self.stable(values[-1], 7.0))
            self.assertTrue(any(row["new_alert"] for row in output + held), msg=f"variant length {len(values)}")

    def test_slow_and_near_threshold_drain_do_not_move_baseline_down(self) -> None:
        for end, duration in ((62.0, 15.0), (65.2, 18.0)):
            detector = DetectorReference()
            now = self.ready_off(detector)
            baseline = detector.baseline
            now, output = self.feed(detector, now, self.ramp(70.0, end, duration))
            _, held = self.feed(detector, now, self.stable(end, 5.0))
            self.assertGreaterEqual(detector.baseline, baseline - 0.2)
            self.assertFalse(any(row["state"] == "SENSOR_FAULT" for row in output + held))

    def test_ignition_on_fast_drop_is_log_only_and_never_new_theft(self) -> None:
        detector = DetectorReference()
        now, _ = self.feed(detector, 0.0, self.stable(70.0, 6.0), ignition=True)
        now, output = self.feed(detector, now, self.ramp(70.0, 55.0, 3.0), ignition=True)
        _, held = self.feed(detector, now, self.stable(55.0, 6.0), ignition=True)
        self.assertIn("FAST_DROP_IGN_ON", [row["event"] for row in output])
        self.assertFalse(any(row["new_alert"] for row in output + held))
        self.assertTrue(all(not ignition for _, ignition in detector.new_alerts))

    def test_gps_moving_suppresses_but_stale_gps_degrades_gracefully(self) -> None:
        moving = DetectorReference()
        now = self.ready_off(moving)
        now, output = self.feed(moving, now, self.ramp(70.0, 57.0, 3.0), gps_fresh=True, gps_moving=True)
        _, held = self.feed(moving, now, self.stable(57.0, 6.0), gps_fresh=True, gps_moving=True)
        self.assertFalse(any(row["new_alert"] for row in output + held))

        stale = DetectorReference()
        now = self.ready_off(stale)
        now, output = self.feed(stale, now, self.ramp(70.0, 57.0, 3.0), gps_fresh=False, gps_moving=False)
        _, held = self.feed(stale, now, self.stable(57.0, 6.0), gps_fresh=False, gps_moving=False)
        self.assertTrue(any(row["new_alert"] for row in output + held))

    def test_sensor_fault_out_of_range_and_short_spike_never_alert(self) -> None:
        detector = DetectorReference()
        now = self.ready_off(detector)
        now, fault = self.feed(detector, now, [130.0] * 12, sensor_valid=False)
        now, spike = self.feed(detector, now, [70.0, 30.0, 70.0, 70.0, 70.0])
        self.assertFalse(any(row["new_alert"] for row in fault + spike))
        self.assertIn("SENSOR_FAULT", [row["state"] for row in fault])

    def test_candidate_recovery_and_ignition_transition_cancel_candidate(self) -> None:
        recovery = DetectorReference()
        now = self.ready_off(recovery)
        now, down = self.feed(recovery, now, self.ramp(70.0, 62.0, 2.5))
        _, up = self.feed(recovery, now, self.ramp(62.0, 69.5, 1.0))
        self.assertFalse(any(row["new_alert"] for row in down + up))

        transition = DetectorReference()
        now = self.ready_off(transition)
        now, down = self.feed(transition, now, self.ramp(70.0, 62.0, 2.5))
        _, after_on = self.feed(transition, now, self.stable(62.0, 5.0), ignition=True)
        self.assertFalse(any(row["new_alert"] for row in down + after_on))

    def test_confirmed_off_alert_keeps_hold_when_ignition_turns_on(self) -> None:
        detector = DetectorReference()
        now = self.ready_off(detector)
        now, drain = self.feed(detector, now, self.ramp(70.0, 57.0, 3.0))
        now, held = self.feed(detector, now, self.stable(57.0, 4.0))
        self.assertTrue(any(row["new_alert"] for row in drain + held))
        _, after_on = self.feed(detector, now, self.stable(57.0, 1.0), ignition=True)
        self.assertTrue(any(row["alert"] == "FUEL_THEFT_ANOMALY" for row in after_on))
        self.assertEqual(1, len(detector.new_alerts))

    def test_baseline_does_not_follow_downward_parked_drift(self) -> None:
        detector = DetectorReference()
        now = self.ready_off(detector)
        original = detector.baseline
        values = self.ramp(70.0, 66.0, 35.0)
        self.feed(detector, now, values)
        self.assertGreaterEqual(detector.baseline, original - 0.2)

    def test_repeated_confirmed_events_reset_to_new_baseline(self) -> None:
        detector = DetectorReference()
        now = self.ready_off(detector)
        now, first = self.feed(detector, now, self.ramp(70.0, 60.0, 3.0))
        now, first_hold = self.feed(detector, now, self.stable(60.0, 11.0))
        self.assertTrue(any(row["new_alert"] for row in first + first_hold))
        now, second = self.feed(detector, now, self.ramp(60.0, 50.0, 3.0))
        _, second_hold = self.feed(detector, now, self.stable(50.0, 5.0))
        self.assertTrue(any(row["new_alert"] for row in second + second_hold))
        self.assertEqual(2, len(detector.new_alerts))


if __name__ == "__main__":
    unittest.main()
