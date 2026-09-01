#include "smartt_engine.h"
#include "smartt_config.h"

#include <math.h>
#include <string.h>

/* ================================================================
 * SmartT V2.2 Explainable Hybrid Edge Engine
 *
 * Poster-aligned pipeline implemented here:
 *   validate timestamped samples
 *   -> calibrate tank profile
 *   -> remove single-sample spikes / handle gaps
 *   -> estimate vehicle context
 *   -> adaptive Kalman + innovation gating
 *   -> change-point evidence
 *   -> explainable event confirmation
 *
 * Machine learning is intentionally kept in the backend where a real
 * dataset can be used.  The edge remains deterministic and safe when
 * connectivity is unavailable.
 * ================================================================ */

/* Demo cylinder r=5cm, h=25cm: volume = pi * 50^2 * 250 mm^3 = 1.9635 L.
 * Cylinder profile is linear in height. */
static const SmartT_TankCalPoint_t tank_calibration[] =
{
    {   0.0f,   0.0f },
    {  62.5f,   0.49f },
    { 125.0f,   0.98f },
    { 187.5f,   1.47f },
    { 250.0f,   1.96f }
};

#define TANK_CAL_COUNT ((uint32_t)(sizeof(tank_calibration) / sizeof(tank_calibration[0])))

typedef struct
{
    float volume_l;
    float rate_lps;
    float p00;
    float p01;
    float p10;
    float p11;
    uint8_t initialized;
    uint32_t last_update_ms;
} FuelKalman_t;

typedef struct
{
    SmartT_EngineSnapshot_t pub;
    FuelKalman_t kalman;

    float median_buffer[SMARTT_MEDIAN_WINDOW];
    uint8_t median_count;
    uint8_t median_index;

    float motion_sq_buffer[SMARTT_MOTION_WINDOW];
    uint8_t motion_count;
    uint8_t motion_index;
    float motion_sq_sum;

    float fuel_history[SMARTT_FUEL_FEATURE_WINDOW];
    uint8_t fuel_history_count;
    uint8_t fuel_history_index;

    uint16_t previous_distance_mm;
    uint32_t previous_distance_tick;
    uint8_t ultrasonic_valid_streak;
    float ultrasonic_base_quality;

    uint32_t stationary_candidate_since;
    uint32_t baseline_candidate_since;
    uint32_t candidate_since;
    uint32_t candidate_last_evidence_ms;
    uint32_t active_since;
    uint32_t stable_after_event_since;

    float previous_filtered_l;
    uint32_t previous_filtered_tick;
    uint8_t previous_filtered_valid;

    float noise_ewma_abs_l;
    float noise_previous_l;
    uint8_t noise_previous_valid;

    uint32_t last_expected_update_ms;
    uint32_t ecu_disagreement_since;
    uint8_t imu_available;
} SmartT_EngineInternal_t;

static SmartT_EngineInternal_t e;

static float clampf_local(float value, float min_value, float max_value)
{
    if (value < min_value) return min_value;
    if (value > max_value) return max_value;
    return value;
}

static float clamp01(float value)
{
    return clampf_local(value, 0.0f, 1.0f);
}

static float tank_capacity_l(void)
{
    return tank_calibration[TANK_CAL_COUNT - 1U].volume_l;
}

static float height_to_volume(float height_mm)
{
    height_mm = clampf_local(height_mm,
                             tank_calibration[0].height_mm,
                             tank_calibration[TANK_CAL_COUNT - 1U].height_mm);

    for (uint32_t i = 1U; i < TANK_CAL_COUNT; i++)
    {
        if (height_mm <= tank_calibration[i].height_mm)
        {
            const float h0 = tank_calibration[i - 1U].height_mm;
            const float h1 = tank_calibration[i].height_mm;
            const float v0 = tank_calibration[i - 1U].volume_l;
            const float v1 = tank_calibration[i].volume_l;
            const float t = (height_mm - h0) / fmaxf(0.001f, h1 - h0);
            return v0 + t * (v1 - v0);
        }
    }

    return tank_calibration[TANK_CAL_COUNT - 1U].volume_l;
}

static float median_push(float value)
{
    e.median_buffer[e.median_index] = value;
    e.median_index = (uint8_t)((e.median_index + 1U) % SMARTT_MEDIAN_WINDOW);

    if (e.median_count < SMARTT_MEDIAN_WINDOW)
        e.median_count++;

    float sorted[SMARTT_MEDIAN_WINDOW];
    for (uint8_t i = 0U; i < e.median_count; i++)
        sorted[i] = e.median_buffer[i];

    for (uint8_t i = 1U; i < e.median_count; i++)
    {
        const float key = sorted[i];
        int8_t j = (int8_t)i - 1;

        while ((j >= 0) && (sorted[(uint8_t)j] > key))
        {
            sorted[(uint8_t)j + 1U] = sorted[(uint8_t)j];
            j--;
        }
        /* Cast AFTER the +1: with j == -1, (uint8_t)j + 1U would index 256
         * and smash the stack. This only runs once tank calibration is
         * enabled AND the ultrasonic delivers a valid frame. */
        sorted[(uint8_t)(j + 1)] = key;
    }

    if ((e.median_count & 1U) != 0U)
        return sorted[e.median_count / 2U];

    return 0.5f * (sorted[(e.median_count / 2U) - 1U] +
                   sorted[e.median_count / 2U]);
}

static void fuel_history_push(float value)
{
    e.fuel_history[e.fuel_history_index] = value;
    e.fuel_history_index = (uint8_t)((e.fuel_history_index + 1U) % SMARTT_FUEL_FEATURE_WINDOW);

    if (e.fuel_history_count < SMARTT_FUEL_FEATURE_WINDOW)
        e.fuel_history_count++;
}

static float fuel_history_at(uint8_t chronological_index)
{
    if (chronological_index >= e.fuel_history_count)
        return 0.0f;

    uint8_t oldest = 0U;
    if (e.fuel_history_count == SMARTT_FUEL_FEATURE_WINDOW)
        oldest = e.fuel_history_index;

    return e.fuel_history[(uint8_t)((oldest + chronological_index) % SMARTT_FUEL_FEATURE_WINDOW)];
}

static float compute_fuel_oscillation_score(void)
{
    if (e.fuel_history_count < 4U)
        return 0.0f;

    float first = fuel_history_at(0U);
    float last = first;
    float min_v = first;
    float max_v = first;
    float abs_step_sum = 0.0f;
    uint8_t direction_changes = 0U;
    int8_t previous_direction = 0;

    for (uint8_t i = 1U; i < e.fuel_history_count; i++)
    {
        float current = fuel_history_at(i);
        float delta = current - last;
        last = current;

        if (current < min_v) min_v = current;
        if (current > max_v) max_v = current;
        abs_step_sum += fabsf(delta);

        int8_t direction = 0;
        if (delta > 0.03f) direction = 1;
        else if (delta < -0.03f) direction = -1;

        if ((direction != 0) && (previous_direction != 0) &&
            (direction != previous_direction))
        {
            direction_changes++;
        }
        if (direction != 0)
            previous_direction = direction;
    }

    const float capacity = tank_capacity_l();
    const float range = max_v - min_v;
    const float mean_abs_step = abs_step_sum / (float)(e.fuel_history_count - 1U);
    const float sustained = fabsf(last - first);

    const float range_norm = clamp01(range / fmaxf(0.25f, capacity * 0.02f));
    const float step_norm = clamp01(mean_abs_step / fmaxf(0.05f, capacity * 0.003f));
    const float direction_norm = clamp01((float)direction_changes / 4.0f);
    const float sustained_norm = clamp01(sustained / fmaxf(0.25f, capacity * 0.02f));

    return clamp01(0.40f * range_norm +
                   0.30f * step_norm +
                   0.35f * direction_norm -
                   0.25f * sustained_norm);
}

static float freshness_score(uint32_t age_ms)
{
    if (age_ms <= SMARTT_US_FRESH_MS)
        return 1.0f;
    if (age_ms >= SMARTT_US_TIMEOUT_MS)
        return 0.0f;

    return 1.0f - ((float)(age_ms - SMARTT_US_FRESH_MS) /
                   (float)(SMARTT_US_TIMEOUT_MS - SMARTT_US_FRESH_MS));
}

static float compute_ultrasonic_base_quality(uint16_t distance_mm, uint32_t now_ms)
{
    const uint8_t range_valid = ((distance_mm >= SMARTT_US_MIN_MM) &&
                                 (distance_mm <= SMARTT_US_MAX_MM)) ? 1U : 0U;

    if (!range_valid)
    {
        e.ultrasonic_valid_streak = 0U;
        return 0.0f;
    }

    if (e.ultrasonic_valid_streak < 10U)
        e.ultrasonic_valid_streak++;

    float streak_score = (e.ultrasonic_valid_streak >= 3U) ? 1.0f :
                         (0.45f + 0.20f * (float)e.ultrasonic_valid_streak);

    float spike_score = 1.0f;
    if ((e.previous_distance_tick != 0U) &&
        ((now_ms - e.previous_distance_tick) < 1000U))
    {
        const uint16_t delta = (distance_mm > e.previous_distance_mm) ?
                               (distance_mm - e.previous_distance_mm) :
                               (e.previous_distance_mm - distance_mm);

        if (delta > 600U)      spike_score = 0.15f;
        else if (delta > 300U) spike_score = 0.40f;
        else if (delta > 150U) spike_score = 0.72f;
    }

    e.previous_distance_mm = distance_mm;
    e.previous_distance_tick = now_ms;

    return clamp01(streak_score * spike_score);
}

static void update_slosh_score(void)
{
    const float s_fuel = compute_fuel_oscillation_score();
    const float s_motion = clamp01(e.pub.context.motion_energy / 0.15f);
    float s_drive = 0.0f;

    if (e.pub.context.mode == SMARTT_CONTEXT_MOVING_ROUGH)
        s_drive = 1.0f;
    else if (e.pub.context.mode == SMARTT_CONTEXT_MOVING_SMOOTH)
        s_drive = 0.45f;
    else if (e.pub.context.mode == SMARTT_CONTEXT_PARKED_UNSTABLE)
        s_drive = 0.35f;

    e.pub.slosh_score = clamp01(0.50f * s_fuel +
                                0.30f * s_motion +
                                0.20f * s_drive);
}

static void kalman_reset(float measurement_l, uint32_t now_ms)
{
    memset(&e.kalman, 0, sizeof(e.kalman));
    e.kalman.volume_l = measurement_l;
    e.kalman.rate_lps = 0.0f;
    e.kalman.p00 = 1.0f;
    e.kalman.p11 = 0.25f;
    e.kalman.initialized = 1U;
    e.kalman.last_update_ms = now_ms;
}

static void kalman_update(float measurement_l,
                          float quality,
                          float dt,
                          uint32_t now_ms)
{
    if (!e.kalman.initialized)
    {
        kalman_reset(measurement_l, now_ms);
        e.pub.fuel.innovation_score = 0.0f;
        return;
    }

    dt = clampf_local(dt, 0.05f, 2.0f);

    float q_volume = 0.012f;
    float q_rate = 0.004f;

    if ((e.pub.context.mode == SMARTT_CONTEXT_MOVING_ROUGH) ||
        (e.pub.context.mode == SMARTT_CONTEXT_TILTED))
    {
        q_volume = 0.035f;
        q_rate = 0.010f;
    }

    float x0 = e.kalman.volume_l + e.kalman.rate_lps * dt;
    float x1 = e.kalman.rate_lps;

    float p00 = e.kalman.p00 +
                dt * (e.kalman.p10 + e.kalman.p01) +
                dt * dt * e.kalman.p11 + q_volume;
    float p01 = e.kalman.p01 + dt * e.kalman.p11;
    float p10 = e.kalman.p10 + dt * e.kalman.p11;
    float p11 = e.kalman.p11 + q_rate;

    float r = 0.18f *
              (1.0f + 4.0f * clamp01(e.pub.context.motion_energy / 0.20f)) *
              (1.0f + 3.0f * e.pub.slosh_score) *
              (1.0f + 4.0f * (1.0f - clamp01(quality)));

    float innovation = measurement_l - x0;
    float s = fmaxf(0.0001f, p00 + r);
    float nis = (innovation * innovation) / s;
    e.pub.fuel.innovation_score = clamp01(sqrtf(fmaxf(0.0f, nis)) / 5.0f);

    /* Poster-aligned innovation gating:
     * - if a large innovation coincides with motion/slosh/poor quality, trust
     *   the measurement less (adaptive correction);
     * - if the vehicle is stable and quality is high, allow the state to move
     *   faster because the innovation may be a true refuel/loss event. */
    if (nis > SMARTT_INNOVATION_GATE_NIS)
    {
        const uint8_t disturbance_likely =
            (e.pub.slosh_score > 0.45f) ||
            (e.pub.context.motion_energy > 0.10f) ||
            (quality < 0.70f) ||
            (e.pub.context.mode == SMARTT_CONTEXT_TILTED);

        if (disturbance_likely)
        {
            r *= 5.0f;
            s = fmaxf(0.0001f, p00 + r);
        }
        else
        {
            /* High-quality stable innovation: widen process uncertainty so
             * real changes are not over-smoothed. */
            p00 += 0.40f;
            p11 += 0.05f;
            s = fmaxf(0.0001f, p00 + r);
        }
    }

    const float k0 = p00 / s;
    const float k1 = p10 / s;

    e.kalman.volume_l = x0 + k0 * innovation;
    e.kalman.rate_lps = x1 + k1 * innovation;

    /* Joseph-form covariance update is slightly more arithmetic than the
     * simplified form but is numerically safer on long-running embedded
     * filters because it better preserves symmetry/positive semidefiniteness. */
    const float a00 = 1.0f - k0;
    const float post00 = a00 * a00 * p00 + k0 * k0 * r;
    const float post01 = a00 * (p01 - k1 * p00) + k0 * k1 * r;
    const float post10 = a00 * (p10 - k1 * p00) + k0 * k1 * r;
    const float post11 = p11 - k1 * (p01 + p10) +
                         k1 * k1 * p00 + k1 * k1 * r;

    e.kalman.p00 = fmaxf(post00, 0.0001f);
    e.kalman.p11 = fmaxf(post11, 0.0001f);
    const float cross = 0.5f * (post01 + post10);
    e.kalman.p01 = cross;
    e.kalman.p10 = cross;
    e.kalman.last_update_ms = now_ms;
}

static void update_motion(const MPU6050_Data_t *imu)
{
    const float accel_mag = sqrtf(imu->ax * imu->ax +
                                  imu->ay * imu->ay +
                                  imu->az * imu->az);
    const float a_dyn = accel_mag - 1.0f;
    const float sq = a_dyn * a_dyn;

    if (e.motion_count < SMARTT_MOTION_WINDOW)
    {
        e.motion_sq_buffer[e.motion_index] = sq;
        e.motion_sq_sum += sq;
        e.motion_count++;
    }
    else
    {
        e.motion_sq_sum -= e.motion_sq_buffer[e.motion_index];
        e.motion_sq_buffer[e.motion_index] = sq;
        e.motion_sq_sum += sq;
    }

    e.motion_index = (uint8_t)((e.motion_index + 1U) % SMARTT_MOTION_WINDOW);

    if (e.motion_count > 0U)
        e.pub.context.motion_energy = sqrtf(e.motion_sq_sum / (float)e.motion_count);
}

static float dynamic_event_threshold(void)
{
    const float capacity = tank_capacity_l();
    const float relative = SMARTT_EVENT_RELATIVE_FRACTION * capacity;
    const float noise = SMARTT_EVENT_NOISE_MULTIPLIER * fmaxf(0.02f, e.pub.baseline_noise_l);
    return fmaxf(SMARTT_EVENT_ABS_MIN_L, fmaxf(relative, noise));
}

static void update_noise_model(float value_l)
{
    if (!e.noise_previous_valid)
    {
        e.noise_previous_l = value_l;
        e.noise_previous_valid = 1U;
        return;
    }

    const float step = fabsf(value_l - e.noise_previous_l);
    e.noise_previous_l = value_l;
    if (e.noise_ewma_abs_l <= 0.0f)
        e.noise_ewma_abs_l = step;
    else
        e.noise_ewma_abs_l = 0.96f * e.noise_ewma_abs_l + 0.04f * step;

    /* Convert mean absolute deviation-like EWMA to a conservative noise scale. */
    e.pub.baseline_noise_l = fmaxf(0.01f, 1.25f * e.noise_ewma_abs_l);
}

static void update_change_point(float current_l, uint32_t now_ms)
{
    if (!e.previous_filtered_valid)
    {
        e.previous_filtered_l = current_l;
        e.previous_filtered_tick = now_ms;
        e.previous_filtered_valid = 1U;
        return;
    }

    const float drop_step = e.previous_filtered_l - current_l;
    float dt_s = (float)(now_ms - e.previous_filtered_tick) / 1000.0f;
    dt_s = clampf_local(dt_s, 0.02f, 2.0f);
    e.previous_filtered_l = current_l;
    e.previous_filtered_tick = now_ms;

    const uint8_t context_supports_drop_tracking =
        (e.pub.context.mode == SMARTT_CONTEXT_PARKED_STABLE) &&
        (e.pub.slosh_score <= SMARTT_SLOSH_EVENT_MAX) &&
        (e.pub.fuel.quality >= SMARTT_MIN_EVENT_QUALITY);

    if (context_supports_drop_tracking)
    {
        const float drift_allowance = SMARTT_CUSUM_DRIFT_LPS * dt_s;
        e.pub.drop_cusum_l = fmaxf(0.0f,
                                   e.pub.drop_cusum_l +
                                   drop_step - drift_allowance);
    }
    else
    {
        /* Decay with time so behavior is independent of sensor frame rate. */
        const float decay = clampf_local(1.0f - 0.75f * dt_s, 0.0f, 1.0f);
        e.pub.drop_cusum_l *= decay;
    }

    const float threshold = fmaxf(SMARTT_CUSUM_THRESHOLD_MIN_L,
                                   SMARTT_CUSUM_THRESHOLD_FRACTION * tank_capacity_l());
    e.pub.change_point_score = clamp01(e.pub.drop_cusum_l / threshold);
}

static void update_expected_consumption(const SmartT_CAN_Data_t *can, uint32_t now_ms)
{
    /* Expected-consumption hierarchy:
     * 1) known engine OFF -> exactly zero consumption;
     * 2) fresh OBD PID 0x5E -> integrate ECU-reported fuel rate;
     * 3) otherwise unavailable on edge (backend may provide learned evidence).
     *
     * This deliberately distinguishes ECU-estimated consumption from a direct
     * differential flow measurement. */
    e.pub.expected_fuel_available = 0U;
    e.pub.expected_from_ecu_fuel_rate = 0U;

    if (!e.pub.baseline_ready)
    {
        e.pub.expected_consumption_l = 0.0f;
        e.pub.expected_fuel_l = 0.0f;
        e.pub.unexplained_loss_l = 0.0f;
        e.last_expected_update_ms = now_ms;
        return;
    }

    float dt_s = 0.0f;
    if (e.last_expected_update_ms != 0U)
    {
        const uint32_t dt_ms = now_ms - e.last_expected_update_ms;
        if (dt_ms <= 10000U)
            dt_s = (float)dt_ms / 1000.0f;
    }

    const uint8_t fuel_rate_fresh =
        (can != NULL) && can->enabled && can->fuel_rate_valid &&
        (can->fuel_rate_update_ms != 0U) &&
        ((now_ms - can->fuel_rate_update_ms) <= SMARTT_CAN_FRESH_MS);

    if (e.pub.context.ignition_known && !e.pub.context.ignition_on)
    {
        e.pub.expected_fuel_available = 1U;
    }
    else if (fuel_rate_fresh)
    {
        if (dt_s > 0.0f)
        {
            e.pub.expected_consumption_l +=
                fmaxf(0.0f, can->fuel_rate_lph) * dt_s / 3600.0f;
        }
        e.pub.expected_fuel_available = 1U;
        e.pub.expected_from_ecu_fuel_rate = 1U;
    }

    if (e.pub.expected_fuel_available)
    {
        e.pub.expected_fuel_l =
            fmaxf(0.0f, e.pub.fuel_baseline_l - e.pub.expected_consumption_l);
        e.pub.unexplained_loss_l =
            fmaxf(0.0f, e.pub.expected_fuel_l - e.pub.fuel.volume_l_filtered);
    }
    else
    {
        e.pub.expected_fuel_l = 0.0f;
        e.pub.unexplained_loss_l = 0.0f;
    }

    e.last_expected_update_ms = now_ms;
}

static void start_incident(SmartT_DecisionState_t state, uint32_t now_ms)
{
    e.pub.decision_state = state;
    e.candidate_since = now_ms;
    e.candidate_last_evidence_ms = now_ms;
    e.pub.incident_start_ms = now_ms;
    e.pub.incident_id = e.pub.event_seq + 1U;
    e.pub.last_transition_ms = now_ms;
}

static void confirm_incident(SmartT_DecisionState_t state, uint32_t now_ms)
{
    e.pub.decision_state = state;
    e.pub.event_seq++;
    e.pub.incident_id = e.pub.event_seq;
    e.active_since = now_ms;
    e.stable_after_event_since = 0U;
    e.pub.last_transition_ms = now_ms;
}

static void clear_incident(uint32_t now_ms)
{
    e.pub.decision_state = SMARTT_DECISION_IDLE;
    e.candidate_since = 0U;
    e.candidate_last_evidence_ms = 0U;
    e.active_since = 0U;
    e.stable_after_event_since = 0U;
    e.pub.last_transition_ms = now_ms;
}

static float event_magnitude_score(float delta_l, float threshold_l)
{
    return clamp01(delta_l / fmaxf(0.05f, 2.0f * threshold_l));
}

static void update_baseline(uint32_t now_ms)
{
    const uint8_t stable_for_baseline =
        e.pub.fuel.available &&
        (e.pub.fuel.quality >= SMARTT_BASELINE_MIN_QUALITY) &&
        (e.pub.context.mode == SMARTT_CONTEXT_PARKED_STABLE) &&
        (e.pub.slosh_score < 0.25f) &&
        (fabsf(e.pub.fuel.rate_lps) < 0.03f) &&
        (e.pub.change_point_score < 0.20f) &&
        (e.pub.decision_state == SMARTT_DECISION_IDLE);

    if (!e.pub.baseline_ready)
    {
        if (!stable_for_baseline)
        {
            e.baseline_candidate_since = 0U;
            return;
        }

        if (e.baseline_candidate_since == 0U)
            e.baseline_candidate_since = now_ms;

        if ((now_ms - e.baseline_candidate_since) >= SMARTT_BASELINE_INIT_CONFIRM_MS)
        {
            e.pub.fuel_baseline_l = e.pub.fuel.volume_l_filtered;
            e.pub.baseline_ready = 1U;
            e.pub.expected_consumption_l = 0.0f;
            e.pub.drop_cusum_l = 0.0f;
            e.pub.change_point_score = 0.0f;
            e.noise_ewma_abs_l = 0.0f;
            e.noise_previous_l = e.pub.fuel.volume_l_filtered;
            e.noise_previous_valid = 1U;
            e.pub.baseline_noise_l = 0.02f;
        }
        return;
    }

    if (stable_for_baseline)
    {
        const float error = e.pub.fuel.volume_l_filtered - e.pub.fuel_baseline_l;
        if (fabsf(error) <= 0.35f * dynamic_event_threshold())
        {
            e.pub.fuel_baseline_l =
                (1.0f - SMARTT_BASELINE_BETA) * e.pub.fuel_baseline_l +
                SMARTT_BASELINE_BETA * e.pub.fuel.volume_l_filtered;
            update_noise_model(e.pub.fuel.volume_l_filtered);
        }
    }
}

static uint32_t common_reason_mask(uint8_t low_slosh, uint8_t quality_ok)
{
    uint32_t reasons = SMARTT_REASON_NONE;

    if (e.pub.context.mode == SMARTT_CONTEXT_PARKED_STABLE)
        reasons |= SMARTT_REASON_STATIONARY;
    if (e.pub.context.ignition_known && !e.pub.context.ignition_on)
        reasons |= SMARTT_REASON_ENGINE_OFF;
    if (low_slosh)
        reasons |= SMARTT_REASON_LOW_SLOSH;
    if (quality_ok)
        reasons |= SMARTT_REASON_HIGH_SENSOR_QUALITY;
    if (e.pub.change_point_score >= 0.75f)
        reasons |= SMARTT_REASON_CHANGE_POINT;
    if (e.pub.expected_fuel_available &&
        (e.pub.unexplained_loss_l >= 0.75f * e.pub.dynamic_event_threshold_l))
        reasons |= SMARTT_REASON_UNEXPLAINED_LOSS;
    if (e.pub.fuel.innovation_score >= 0.65f)
        reasons |= SMARTT_REASON_INNOVATION_GATE;
    if (e.pub.context.gps_fresh)
        reasons |= SMARTT_REASON_GPS_FRESH;
    if (e.pub.context.can_fresh)
        reasons |= SMARTT_REASON_CAN_FRESH;
    if (e.pub.expected_from_ecu_fuel_rate)
        reasons |= SMARTT_REASON_ECU_FUEL_RATE;
    if (e.pub.context.mode == SMARTT_CONTEXT_UNKNOWN)
        reasons |= SMARTT_REASON_CONTEXT_UNKNOWN;
    if (e.pub.ecu_fuel_disagreement_confirmed)
        reasons |= SMARTT_REASON_ECU_FUEL_DISAGREEMENT;

    return reasons;
}

static void update_event_state(uint32_t now_ms)
{
    e.pub.reason_mask = SMARTT_REASON_NONE;
    e.pub.dynamic_event_threshold_l = dynamic_event_threshold();

    if (!SMARTT_TANK_CALIBRATION_READY)
    {
        e.pub.event = SMARTT_EVENT_CALIBRATION_REQUIRED;
        e.pub.confidence = 0.0f;
        e.pub.reason_mask = SMARTT_REASON_CALIBRATION_REQUIRED;
        if (e.pub.decision_state != SMARTT_DECISION_IDLE)
            clear_incident(now_ms);
        return;
    }

    if (!e.pub.fuel.available || (e.pub.fuel.quality < 0.15f))
    {
        e.pub.event = SMARTT_EVENT_SENSOR_FAULT;
        e.pub.decision_state = SMARTT_DECISION_SENSOR_FAULT;
        e.pub.confidence = 100.0f * (1.0f - e.pub.fuel.quality);
        e.pub.reason_mask = e.pub.fuel.available ?
                            SMARTT_REASON_SENSOR_INVALID :
                            SMARTT_REASON_SENSOR_STALE;
        return;
    }

    if (e.pub.decision_state == SMARTT_DECISION_SENSOR_FAULT)
        clear_incident(now_ms);

    const uint8_t quality_ok = (e.pub.fuel.quality >= SMARTT_MIN_EVENT_QUALITY) ? 1U : 0U;
    const uint8_t low_slosh = (e.pub.slosh_score <= SMARTT_SLOSH_EVENT_MAX) ? 1U : 0U;

    /* A degraded-but-still-valid sensor should not silently look NORMAL.
     * Keep it out of high-confidence fuel events while surfacing a warning. */
    if (!quality_ok && (e.pub.decision_state == SMARTT_DECISION_IDLE))
    {
        e.pub.event = SMARTT_EVENT_DATA_QUALITY_WARNING;
        e.pub.confidence = 100.0f * (1.0f - e.pub.fuel.quality);
        e.pub.reason_mask = SMARTT_REASON_LOW_SENSOR_QUALITY;
        return;
    }

    /* Sloshing is an explicit anti-false-positive state. */
    if ((e.pub.context.mode == SMARTT_CONTEXT_MOVING_ROUGH ||
         e.pub.context.mode == SMARTT_CONTEXT_MOVING_SMOOTH ||
         e.pub.context.mode == SMARTT_CONTEXT_PARKED_UNSTABLE) &&
        e.pub.slosh_score >= SMARTT_SLOSH_ENTER)
    {
        e.pub.decision_state = SMARTT_DECISION_SLOSHING;
        e.pub.event = SMARTT_EVENT_SLOSHING;
        e.pub.confidence = 100.0f * clamp01(e.pub.slosh_score * e.pub.fuel.quality);
        e.pub.reason_mask = SMARTT_REASON_MOTION_SUPPORTS_SLOSH;
        return;
    }

    if ((e.pub.decision_state == SMARTT_DECISION_SLOSHING) &&
        (e.pub.slosh_score <= SMARTT_SLOSH_EXIT))
    {
        clear_incident(now_ms);
    }

    if (!e.pub.baseline_ready)
    {
        e.pub.event = SMARTT_EVENT_NORMAL;
        e.pub.confidence = 100.0f * e.pub.fuel.quality;
        return;
    }

    const float rise_l = e.pub.fuel.volume_l_filtered - e.pub.fuel_baseline_l;
    const float drop_l = e.pub.fuel_baseline_l - e.pub.fuel.volume_l_filtered;
    const float threshold_l = e.pub.dynamic_event_threshold_l;
    const float recovery_l = SMARTT_EVENT_RECOVERY_FRACTION * threshold_l;

    const uint8_t refuel_evidence =
        quality_ok && low_slosh &&
        (rise_l >= threshold_l) &&
        ((e.pub.fuel.rate_lps > 0.015f) ||
         (e.pub.fuel.innovation_score > 0.55f));

    const uint8_t loss_evidence =
        quality_ok && low_slosh &&
        (e.pub.context.mode == SMARTT_CONTEXT_PARKED_STABLE) &&
        ((drop_l >= threshold_l) || (e.pub.change_point_score >= 1.0f)) &&
        ((e.pub.fuel.rate_lps < -0.008f) ||
         (e.pub.change_point_score >= 0.75f));

    if (e.pub.decision_state == SMARTT_DECISION_REFUEL_ACTIVE)
    {
        e.pub.event = SMARTT_EVENT_REFUEL;
        e.pub.reason_mask = common_reason_mask(1U, quality_ok) | SMARTT_REASON_FUEL_RISE;
        e.pub.confidence = 100.0f * clamp01(0.35f * e.pub.fuel.quality +
                                            0.25f * (1.0f - e.pub.slosh_score) +
                                            0.25f * event_magnitude_score(fmaxf(0.0f, rise_l), threshold_l) +
                                            0.15f * e.pub.fuel.innovation_score);

        if ((fabsf(e.pub.fuel.rate_lps) < 0.02f) && low_slosh)
        {
            if (e.stable_after_event_since == 0U)
                e.stable_after_event_since = now_ms;

            if ((now_ms - e.stable_after_event_since) >= SMARTT_EVENT_ACTIVE_HOLD_MS)
            {
                e.pub.fuel_baseline_l = e.pub.fuel.volume_l_filtered;
                e.pub.expected_consumption_l = 0.0f;
                e.pub.drop_cusum_l = 0.0f;
                clear_incident(now_ms);
            }
        }
        else
        {
            e.stable_after_event_since = 0U;
        }
        return;
    }

    if (e.pub.decision_state == SMARTT_DECISION_LOSS_ACTIVE)
    {
        uint32_t reasons = common_reason_mask(low_slosh, quality_ok) | SMARTT_REASON_FUEL_DROP;
        const uint8_t strong_theft_evidence =
            e.pub.context.ignition_known && !e.pub.context.ignition_on &&
            e.pub.expected_fuel_available &&
            (e.pub.unexplained_loss_l >= threshold_l) &&
            (e.pub.context.mode == SMARTT_CONTEXT_PARKED_STABLE);

        e.pub.event = strong_theft_evidence ?
                      SMARTT_EVENT_FUEL_THEFT_ANOMALY :
                      SMARTT_EVENT_SUSPICIOUS_FUEL_LOSS;
        e.pub.reason_mask = reasons;

        const float context_score = (e.pub.context.mode == SMARTT_CONTEXT_PARKED_STABLE) ? 1.0f : 0.35f;
        const float residual_score = e.pub.expected_fuel_available ?
                                     clamp01(e.pub.unexplained_loss_l / fmaxf(0.05f, 2.0f * threshold_l)) : 0.45f;

        e.pub.confidence = 100.0f * clamp01(0.25f * e.pub.fuel.quality +
                                            0.20f * (1.0f - e.pub.slosh_score) +
                                            0.20f * event_magnitude_score(fmaxf(0.0f, drop_l), threshold_l) +
                                            0.15f * context_score +
                                            0.10f * e.pub.change_point_score +
                                            0.10f * residual_score);

        if ((now_ms - e.active_since) >= SMARTT_EVENT_ACTIVE_HOLD_MS)
        {
            /* Avoid repeated alerts for the same physical loss.  Rebase only
             * after the hold period; server keeps the incident history. */
            e.pub.fuel_baseline_l = e.pub.fuel.volume_l_filtered;
            e.pub.expected_consumption_l = 0.0f;
            e.pub.drop_cusum_l = 0.0f;
            clear_incident(now_ms);
        }
        return;
    }

    if (e.pub.decision_state == SMARTT_DECISION_REFUEL_CANDIDATE)
    {
        if (refuel_evidence)
        {
            e.candidate_last_evidence_ms = now_ms;
            e.pub.event = SMARTT_EVENT_REFUEL_CANDIDATE;
            e.pub.reason_mask = common_reason_mask(low_slosh, quality_ok) | SMARTT_REASON_FUEL_RISE;
            e.pub.confidence = 100.0f * clamp01(0.45f * e.pub.fuel.quality +
                                                0.30f * event_magnitude_score(fmaxf(0.0f, rise_l), threshold_l) +
                                                0.25f * e.pub.fuel.innovation_score);

            if ((now_ms - e.candidate_since) >= SMARTT_EVENT_CONFIRM_MS)
                confirm_incident(SMARTT_DECISION_REFUEL_ACTIVE, now_ms);
            return;
        }

        if ((rise_l <= recovery_l) ||
            ((now_ms - e.candidate_last_evidence_ms) > SMARTT_EVENT_EVIDENCE_GRACE_MS))
        {
            clear_incident(now_ms);
        }
        else
        {
            e.pub.event = SMARTT_EVENT_REFUEL_CANDIDATE;
            return;
        }
    }

    if (e.pub.decision_state == SMARTT_DECISION_LOSS_CANDIDATE)
    {
        if (loss_evidence)
        {
            e.candidate_last_evidence_ms = now_ms;
            e.pub.event = SMARTT_EVENT_DROP_CANDIDATE;
            e.pub.reason_mask = common_reason_mask(low_slosh, quality_ok) | SMARTT_REASON_FUEL_DROP;
            e.pub.confidence = 100.0f * clamp01(0.35f * e.pub.fuel.quality +
                                                0.25f * event_magnitude_score(fmaxf(0.0f, drop_l), threshold_l) +
                                                0.20f * e.pub.change_point_score +
                                                0.20f * (1.0f - e.pub.slosh_score));

            if ((now_ms - e.candidate_since) >= SMARTT_EVENT_CONFIRM_MS)
                confirm_incident(SMARTT_DECISION_LOSS_ACTIVE, now_ms);
            return;
        }

        if ((drop_l <= recovery_l) ||
            ((now_ms - e.candidate_last_evidence_ms) > SMARTT_EVENT_EVIDENCE_GRACE_MS) ||
            (e.pub.context.mode == SMARTT_CONTEXT_MOVING_SMOOTH) ||
            (e.pub.context.mode == SMARTT_CONTEXT_MOVING_ROUGH))
        {
            clear_incident(now_ms);
        }
        else
        {
            e.pub.event = SMARTT_EVENT_DROP_CANDIDATE;
            return;
        }
    }

    if (refuel_evidence)
    {
        start_incident(SMARTT_DECISION_REFUEL_CANDIDATE, now_ms);
        e.pub.event = SMARTT_EVENT_REFUEL_CANDIDATE;
        e.pub.reason_mask = common_reason_mask(low_slosh, quality_ok) | SMARTT_REASON_FUEL_RISE;
        return;
    }

    if (loss_evidence)
    {
        start_incident(SMARTT_DECISION_LOSS_CANDIDATE, now_ms);
        e.pub.event = SMARTT_EVENT_DROP_CANDIDATE;
        e.pub.reason_mask = common_reason_mask(low_slosh, quality_ok) | SMARTT_REASON_FUEL_DROP;
        return;
    }

    e.pub.event = SMARTT_EVENT_NORMAL;
    e.pub.confidence = 100.0f * e.pub.fuel.quality;
    e.pub.reason_mask = common_reason_mask(low_slosh, quality_ok);
}

void SmartT_EngineInit(uint32_t now_ms)
{
    memset(&e, 0, sizeof(e));
    e.pub.context.mode = SMARTT_CONTEXT_UNKNOWN;
    e.pub.event = SMARTT_TANK_CALIBRATION_READY ?
                  SMARTT_EVENT_NORMAL :
                  SMARTT_EVENT_CALIBRATION_REQUIRED;
    e.pub.decision_state = SMARTT_DECISION_IDLE;
    e.pub.last_transition_ms = now_ms;
    e.pub.baseline_noise_l = 0.02f;
}

void SmartT_EnginePushImu(const MPU6050_Data_t *imu,
                          float filtered_roll_deg,
                          float filtered_pitch_deg,
                          uint8_t imu_available,
                          uint32_t now_ms)
{
    (void)now_ms;
    e.imu_available = imu_available;
    e.pub.context.roll_deg = filtered_roll_deg;
    e.pub.context.pitch_deg = filtered_pitch_deg;

    if (imu_available && (imu != NULL))
        update_motion(imu);
    else
        e.pub.context.motion_energy = 0.0f;
}

void SmartT_EngineUpdateContext(const GPS_Data_t *gps,
                                const SmartT_CAN_Data_t *can,
                                uint32_t now_ms)
{
    uint8_t gps_fresh = 0U;
    uint8_t can_speed_fresh = 0U;
    uint8_t can_rpm_fresh = 0U;

    if ((gps != NULL) && gps->fix && (gps->last_update_ms != 0U) &&
        ((now_ms - gps->last_update_ms) <= SMARTT_GPS_FRESH_MS))
    {
        gps_fresh = 1U;
    }

    if ((can != NULL) && can->enabled)
    {
        if (can->speed_valid && ((now_ms - can->speed_update_ms) <= SMARTT_CAN_FRESH_MS))
            can_speed_fresh = 1U;
        if (can->rpm_valid && ((now_ms - can->rpm_update_ms) <= SMARTT_CAN_FRESH_MS))
            can_rpm_fresh = 1U;
    }

    e.pub.context.gps_fresh = gps_fresh;
    e.pub.context.can_fresh = (can_speed_fresh || can_rpm_fresh) ? 1U : 0U;
    e.pub.context.speed_known = 0U;
    e.pub.context.speed_kmh = 0.0f;
    e.pub.context.ignition_known = 0U;
    e.pub.context.ignition_on = 0U;
    e.pub.context.rpm = 0.0f;
    e.pub.context.engine_load_pct = 0.0f;

    if (can_speed_fresh)
    {
        e.pub.context.speed_known = 1U;
        e.pub.context.speed_kmh = can->speed_kmh;
    }
    else if (gps_fresh)
    {
        e.pub.context.speed_known = 1U;
        e.pub.context.speed_kmh = gps->speed_kmh;
    }

    if (can_rpm_fresh)
    {
        e.pub.context.ignition_known = 1U;
        e.pub.context.rpm = can->rpm;
        e.pub.context.ignition_on = (can->rpm > 50.0f) ? 1U : 0U;
    }

    if ((can != NULL) && can->engine_load_valid &&
        ((now_ms - can->engine_load_update_ms) <= SMARTT_CAN_FRESH_MS))
    {
        e.pub.context.engine_load_pct = can->engine_load_pct;
    }

    e.pub.ecu_fuel_level_available = 0U;
    e.pub.ecu_fuel_level_pct = 0.0f;
    e.pub.ecu_fuel_disagreement_pct = 0.0f;
    e.pub.ecu_fuel_disagreement_confirmed = 0U;
    if ((can != NULL) && can->ecu_fuel_level_valid &&
        ((now_ms - can->fuel_level_update_ms) <= SMARTT_CAN_FRESH_MS))
    {
        e.pub.ecu_fuel_level_available = 1U;
        e.pub.ecu_fuel_level_pct = can->ecu_fuel_level_pct;
        if (e.pub.fuel.available)
        {
            e.pub.ecu_fuel_disagreement_pct =
                fabsf(e.pub.fuel.percent_filtered - can->ecu_fuel_level_pct);

            if (e.pub.ecu_fuel_disagreement_pct >= SMARTT_ECU_FUEL_DISAGREE_PCT)
            {
                if (e.ecu_disagreement_since == 0U)
                    e.ecu_disagreement_since = now_ms;

                if ((now_ms - e.ecu_disagreement_since) >=
                    SMARTT_ECU_FUEL_DISAGREE_CONFIRM_MS)
                {
                    e.pub.ecu_fuel_disagreement_confirmed = 1U;
                }
            }
            else
            {
                e.ecu_disagreement_since = 0U;
            }
        }
        else
        {
            /* A stale disagreement timer must never survive a fuel-source outage. */
            e.ecu_disagreement_since = 0U;
        }
    }
    else
    {
        e.ecu_disagreement_since = 0U;
    }

    if ((fabsf(e.pub.context.roll_deg) > SMARTT_TILT_THRESHOLD_DEG) ||
        (fabsf(e.pub.context.pitch_deg) > SMARTT_TILT_THRESHOLD_DEG))
    {
        e.pub.context.mode = SMARTT_CONTEXT_TILTED;
        e.stationary_candidate_since = 0U;
        update_slosh_score();
        update_expected_consumption(can, now_ms);
        return;
    }

    if (e.pub.context.speed_known &&
        (e.pub.context.speed_kmh > SMARTT_MOVING_SPEED_KMH))
    {
        e.stationary_candidate_since = 0U;
        e.pub.context.mode = (e.pub.context.motion_energy > SMARTT_MOTION_ROUGH_RMS_G) ?
                             SMARTT_CONTEXT_MOVING_ROUGH :
                             SMARTT_CONTEXT_MOVING_SMOOTH;
        update_slosh_score();
        update_expected_consumption(can, now_ms);
        return;
    }

    /* Safety rule: low IMU energy alone is NOT enough to call the vehicle
     * parked.  Require a fresh low speed OR a known engine-off state. */
    const uint8_t stationary_evidence =
        (e.pub.context.speed_known &&
         (e.pub.context.speed_kmh <= SMARTT_MOVING_SPEED_KMH)) ||
        (e.pub.context.ignition_known && !e.pub.context.ignition_on);

    if (!stationary_evidence)
    {
        e.pub.context.mode = SMARTT_CONTEXT_UNKNOWN;
        e.stationary_candidate_since = 0U;
        update_slosh_score();
        update_expected_consumption(can, now_ms);
        return;
    }

    if (e.pub.context.motion_energy > SMARTT_MOTION_ROUGH_RMS_G)
    {
        e.pub.context.mode = SMARTT_CONTEXT_PARKED_UNSTABLE;
        e.stationary_candidate_since = 0U;
        update_slosh_score();
        update_expected_consumption(can, now_ms);
        return;
    }

    if (e.pub.context.motion_energy <= SMARTT_MOTION_STABLE_RMS_G)
    {
        if (e.stationary_candidate_since == 0U)
            e.stationary_candidate_since = now_ms;

        e.pub.context.mode = ((now_ms - e.stationary_candidate_since) >= SMARTT_PARKED_CONFIRM_MS) ?
                             SMARTT_CONTEXT_PARKED_STABLE :
                             SMARTT_CONTEXT_UNKNOWN;
    }
    else
    {
        e.pub.context.mode = SMARTT_CONTEXT_PARKED_UNSTABLE;
        e.stationary_candidate_since = 0U;
    }

    update_slosh_score();
    update_expected_consumption(can, now_ms);
}

void SmartT_EngineProcessUltrasonic(const Ultrasonic_Data_t *us, uint32_t now_ms)
{
    if ((us == NULL) || !us->valid || (us->last_update_ms == 0U))
        return;

    e.pub.ultrasonic_frames = us->valid_frames;
    e.pub.ultrasonic_checksum_errors = us->checksum_errors;
    e.pub.ultrasonic_range_errors = us->range_errors;

    e.pub.fuel.timestamp_ms = us->last_update_ms;
    e.pub.fuel.distance_mm_raw = us->distance_mm;
    e.ultrasonic_base_quality = compute_ultrasonic_base_quality(us->distance_mm, now_ms);
    e.pub.fuel.quality = e.ultrasonic_base_quality;

    if ((us->distance_mm < SMARTT_US_MIN_MM) ||
        (us->distance_mm > SMARTT_US_MAX_MM))
    {
        e.pub.fuel.available = 0U;
        return;
    }

    if (!SMARTT_TANK_CALIBRATION_READY)
    {
        e.pub.fuel.available = 0U;
        return;
    }

    float fuel_height_mm = SMARTT_SENSOR_TO_TANK_BOTTOM_MM - (float)us->distance_mm;
    fuel_height_mm = clampf_local(fuel_height_mm, 0.0f, SMARTT_TANK_MAX_FUEL_HEIGHT_MM);

    const float raw_volume_l = height_to_volume(fuel_height_mm);
    const float median_volume_l = median_push(raw_volume_l);

    float dt = 0.20f;
    if (e.kalman.last_update_ms != 0U)
    {
        const uint32_t gap_ms = now_ms - e.kalman.last_update_ms;
        dt = (float)gap_ms / 1000.0f;

        if (gap_ms > SMARTT_US_TIMEOUT_MS)
        {
            /* Handle gaps explicitly: forget stale rate and widen state uncertainty. */
            e.kalman.rate_lps = 0.0f;
            e.kalman.p00 = fmaxf(e.kalman.p00, 1.0f);
            e.kalman.p11 = fmaxf(e.kalman.p11, 0.25f);
        }
    }

    kalman_update(median_volume_l, e.pub.fuel.quality, dt, now_ms);

    e.pub.fuel.fuel_height_mm = fuel_height_mm;
    e.pub.fuel.volume_l_raw = raw_volume_l;
    e.pub.fuel.volume_l_filtered = e.kalman.volume_l;
    e.pub.fuel.rate_lps = e.kalman.rate_lps;

    const float capacity = tank_capacity_l();
    e.pub.fuel.percent_filtered = (capacity > 0.0f) ?
                                  clampf_local(100.0f * e.kalman.volume_l / capacity,
                                               0.0f, 100.0f) : 0.0f;
    e.pub.fuel.available = 1U;

    fuel_history_push(e.pub.fuel.volume_l_filtered);
    update_slosh_score();
    update_change_point(e.pub.fuel.volume_l_filtered, now_ms);
    update_baseline(now_ms);
    update_event_state(now_ms);
}

void SmartT_EngineTick(const Ultrasonic_Data_t *us, uint32_t now_ms)
{
    if ((us == NULL) || !us->valid || (us->last_update_ms == 0U))
    {
        e.pub.fuel.quality = 0.0f;
        if (SMARTT_TANK_CALIBRATION_READY)
            e.pub.fuel.available = 0U;
        update_event_state(now_ms);
        return;
    }

    const uint32_t age = now_ms - us->last_update_ms;
    e.pub.fuel.quality = clamp01(e.ultrasonic_base_quality * freshness_score(age));

    if (age >= SMARTT_US_TIMEOUT_MS)
        e.pub.fuel.available = 0U;

    update_baseline(now_ms);
    update_event_state(now_ms);
}

void SmartT_EngineGetSnapshot(SmartT_EngineSnapshot_t *out)
{
    if (out == NULL)
        return;
    *out = e.pub;
}

const char *SmartT_ContextToString(SmartT_ContextMode_t mode)
{
    switch (mode)
    {
        case SMARTT_CONTEXT_PARKED_STABLE:   return "PARKED STABLE";
        case SMARTT_CONTEXT_PARKED_UNSTABLE: return "PARKED UNSTBL";
        case SMARTT_CONTEXT_MOVING_SMOOTH:   return "MOVING SMOOTH";
        case SMARTT_CONTEXT_MOVING_ROUGH:    return "MOVING ROUGH";
        case SMARTT_CONTEXT_TILTED:          return "TILTED";
        default:                             return "UNKNOWN";
    }
}

const char *SmartT_EventToString(SmartT_Event_t event)
{
    switch (event)
    {
        case SMARTT_EVENT_CALIBRATION_REQUIRED: return "CALIBRATE TANK";
        case SMARTT_EVENT_SLOSHING:             return "SLOSHING";
        case SMARTT_EVENT_REFUEL_CANDIDATE:     return "REFUEL CAND";
        case SMARTT_EVENT_REFUEL:               return "REFUEL";
        case SMARTT_EVENT_DROP_CANDIDATE:       return "DROP CAND";
        case SMARTT_EVENT_SUSPICIOUS_FUEL_LOSS: return "SUSPICIOUS LOSS";
        case SMARTT_EVENT_FUEL_THEFT_ANOMALY:   return "THEFT ANOMALY";
        case SMARTT_EVENT_SENSOR_FAULT:          return "SENSOR FAULT";
        case SMARTT_EVENT_DATA_QUALITY_WARNING:  return "DATA QUALITY";
        default:                                 return "NORMAL";
    }
}

const char *SmartT_EventCode(SmartT_Event_t event)
{
    switch (event)
    {
        case SMARTT_EVENT_CALIBRATION_REQUIRED: return "CALIBRATION_REQUIRED";
        case SMARTT_EVENT_SLOSHING:             return "SLOSHING";
        case SMARTT_EVENT_REFUEL_CANDIDATE:     return "REFUEL_CANDIDATE";
        case SMARTT_EVENT_REFUEL:               return "REFUEL";
        case SMARTT_EVENT_DROP_CANDIDATE:       return "DROP_CANDIDATE";
        case SMARTT_EVENT_SUSPICIOUS_FUEL_LOSS: return "SUSPICIOUS_FUEL_LOSS";
        case SMARTT_EVENT_FUEL_THEFT_ANOMALY:   return "FUEL_THEFT_ANOMALY";
        case SMARTT_EVENT_SENSOR_FAULT:          return "SENSOR_FAULT";
        case SMARTT_EVENT_DATA_QUALITY_WARNING:  return "DATA_QUALITY_WARNING";
        default:                                 return "NORMAL";
    }
}

const char *SmartT_DecisionStateToString(SmartT_DecisionState_t state)
{
    switch (state)
    {
        case SMARTT_DECISION_SLOSHING:          return "SLOSHING";
        case SMARTT_DECISION_REFUEL_CANDIDATE: return "REFUEL_CANDIDATE";
        case SMARTT_DECISION_REFUEL_ACTIVE:    return "REFUEL_ACTIVE";
        case SMARTT_DECISION_LOSS_CANDIDATE:   return "LOSS_CANDIDATE";
        case SMARTT_DECISION_LOSS_ACTIVE:      return "LOSS_ACTIVE";
        case SMARTT_DECISION_SENSOR_FAULT:     return "SENSOR_FAULT";
        default:                                return "IDLE";
    }
}
