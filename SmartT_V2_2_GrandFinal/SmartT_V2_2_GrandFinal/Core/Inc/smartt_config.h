#ifndef INC_SMARTT_CONFIG_H_
#define INC_SMARTT_CONFIG_H_

/* ================================================================
 * SmartT Grand Final V2.2 configuration
 * ================================================================
 * Hardware-dependent assumptions stay explicit.  Conservative defaults
 * are intentional: code must fail safe rather than pretend that a sensor,
 * tank profile or CAN PID is known before it has been verified.
 */

#define SMARTT_VEHICLE_ID                      "TRUCK_01"

/* ---------------- Fuel tank / ultrasonic ---------------- */
/* Demo tank: cylinder r=5cm, h=25cm -> V = pi*25*25 ~= 1.96 L.
 * Ultrasonic mounted at the top of the cylinder looking down. */
#define SMARTT_TANK_CALIBRATION_READY          1U

/* Acoustic reference distance from the ultrasonic face to the tank bottom
 * along the measurement axis.  Replace after measuring the real rig. */
#define SMARTT_SENSOR_TO_TANK_BOTTOM_MM        250.0f
#define SMARTT_TANK_MAX_FUEL_HEIGHT_MM         250.0f

#define SMARTT_US_MIN_MM                       30U
#define SMARTT_US_MAX_MM                       4500U
#define SMARTT_US_FRESH_MS                     700U
#define SMARTT_US_TIMEOUT_MS                   1500U

/* ---------------- Sampling / filters ---------------- */
#define SMARTT_MEDIAN_WINDOW                   5U
#define SMARTT_MOTION_WINDOW                   25U
#define SMARTT_FUEL_FEATURE_WINDOW             16U
#define SMARTT_IMU_PERIOD_MS                   20U
#define SMARTT_DISPLAY_PERIOD_MS               100U
#define SMARTT_TELEMETRY_PERIOD_MS             500U

/* ---------------- Context ---------------- */
#define SMARTT_GPS_FRESH_MS                    5000U
#define SMARTT_CAN_FRESH_MS                    1500U
#define SMARTT_PARKED_CONFIRM_MS               8000U
#define SMARTT_TILT_THRESHOLD_DEG              8.0f
#define SMARTT_MOTION_STABLE_RMS_G             0.05f
#define SMARTT_MOTION_ROUGH_RMS_G              0.10f
#define SMARTT_MOVING_SPEED_KMH                3.0f

/* ---------------- Event / baseline ---------------- */
#define SMARTT_BASELINE_INIT_CONFIRM_MS        4000U
#define SMARTT_BASELINE_BETA                   0.02f
#define SMARTT_EVENT_CONFIRM_MS                2000U
#define SMARTT_EVENT_EVIDENCE_GRACE_MS         900U
#define SMARTT_EVENT_ACTIVE_HOLD_MS            5000U

/* Dynamic event threshold = max(abs_min, relative capacity, noise multiple). */
#define SMARTT_EVENT_ABS_MIN_L                 0.50f
#define SMARTT_EVENT_RELATIVE_FRACTION         0.015f
#define SMARTT_EVENT_NOISE_MULTIPLIER          4.0f
#define SMARTT_EVENT_RECOVERY_FRACTION         0.45f

#define SMARTT_MIN_EVENT_QUALITY               0.65f
#define SMARTT_BASELINE_MIN_QUALITY            0.75f
#define SMARTT_SLOSH_ENTER                     0.60f
#define SMARTT_SLOSH_EXIT                      0.35f
#define SMARTT_SLOSH_EVENT_MAX                 0.35f

/* ---------------- Innovation / change point ---------------- */
#define SMARTT_INNOVATION_GATE_NIS             9.0f
#define SMARTT_CUSUM_DRIFT_LPS                  0.075f
#define SMARTT_CUSUM_THRESHOLD_MIN_L           0.35f
#define SMARTT_CUSUM_THRESHOLD_FRACTION        0.006f

/* ---------------- Cross-sensor plausibility ---------------- */
#define SMARTT_ECU_FUEL_DISAGREE_PCT           18.0f
#define SMARTT_ECU_FUEL_DISAGREE_CONFIRM_MS    8000U

/* ---------------- IMU recovery ---------------- */
#define SMARTT_IMU_MAX_CONSECUTIVE_FAIL        5U
#define SMARTT_IMU_RETRY_MS                    1000U

/* ---------------- CAN / OBD-II ----------------
 * 0 = disabled (safe default; no CAN traffic)
 * 1 = OBD-II ISO15765 11-bit, 500 kbit/s polling
 *
 * Do NOT enable mode 1 until the target vehicle is confirmed to use this
 * profile and the physical CAN wiring has been validated. */
#define SMARTT_CAN_MODE_DISABLED               0U
#define SMARTT_CAN_MODE_OBD2_11BIT_500K        1U
#define SMARTT_CAN_MODE                        SMARTT_CAN_MODE_DISABLED
#define SMARTT_CAN_POLL_MS                     250U

/* ---------------- Telemetry ---------------- */
#define SMARTT_SCHEMA_VERSION                  2U
#define SMARTT_TELEMETRY_UART_TIMEOUT_MS       80U

/* ---------------- Debug bisect ----------------
 * 1 = skip the fuel engine pipeline entirely (US frames are still received
 *     and counted, but SmartT_EngineProcessUltrasonic is not called).
 * Use this to isolate a freeze between the US driver/display and the
 * engine (Kalman/baseline/event) path. */
#define SMARTT_DEBUG_SKIP_ENGINE_US            0U
#endif /* INC_SMARTT_CONFIG_H_ */
