#include "smartt_telemetry.h"
#include "smartt_config.h"

#include <stdio.h>
#include <string.h>

static void append_reason(char *buffer,
                          size_t buffer_size,
                          size_t *used,
                          uint8_t *first,
                          const char *reason)
{
    if ((buffer == NULL) || (used == NULL) || (first == NULL) || (reason == NULL))
        return;

    if (*used >= buffer_size)
        return;

    const int written = snprintf(buffer + *used,
                                 buffer_size - *used,
                                 "%s\"%s\"",
                                 *first ? "" : ",",
                                 reason);
    if (written > 0)
    {
        const size_t n = (size_t)written;
        *used = (*used + n < buffer_size) ? (*used + n) : buffer_size;
        *first = 0U;
    }
}

static void reasons_to_json(uint32_t mask, char *buffer, size_t buffer_size)
{
    size_t used = 0U;
    uint8_t first = 1U;

    if ((buffer == NULL) || (buffer_size < 3U))
        return;

    buffer[used++] = '[';
    buffer[used] = '\0';

#define ADD_REASON(bit, text) do { if ((mask & (bit)) != 0U) append_reason(buffer, buffer_size, &used, &first, (text)); } while (0)
    ADD_REASON(SMARTT_REASON_FUEL_RISE,             "fuel_rise");
    ADD_REASON(SMARTT_REASON_FUEL_DROP,             "fuel_drop");
    ADD_REASON(SMARTT_REASON_STATIONARY,            "vehicle_stationary");
    ADD_REASON(SMARTT_REASON_ENGINE_OFF,            "engine_off");
    ADD_REASON(SMARTT_REASON_LOW_SLOSH,             "low_slosh");
    ADD_REASON(SMARTT_REASON_HIGH_SENSOR_QUALITY,   "high_sensor_quality");
    ADD_REASON(SMARTT_REASON_CHANGE_POINT,          "change_point");
    ADD_REASON(SMARTT_REASON_UNEXPLAINED_LOSS,      "unexplained_loss");
    ADD_REASON(SMARTT_REASON_MOTION_SUPPORTS_SLOSH, "motion_supports_slosh");
    ADD_REASON(SMARTT_REASON_SENSOR_STALE,          "sensor_stale");
    ADD_REASON(SMARTT_REASON_SENSOR_INVALID,        "sensor_invalid");
    ADD_REASON(SMARTT_REASON_CALIBRATION_REQUIRED,  "calibration_required");
    ADD_REASON(SMARTT_REASON_GPS_FRESH,             "gps_fresh");
    ADD_REASON(SMARTT_REASON_CAN_FRESH,             "can_fresh");
    ADD_REASON(SMARTT_REASON_ECU_FUEL_DISAGREEMENT, "ecu_fuel_disagreement");
    ADD_REASON(SMARTT_REASON_INNOVATION_GATE,       "innovation_gate");
    ADD_REASON(SMARTT_REASON_ECU_FUEL_RATE,         "ecu_fuel_rate");
    ADD_REASON(SMARTT_REASON_CONTEXT_UNKNOWN,       "context_unknown");
    ADD_REASON(SMARTT_REASON_LOW_SENSOR_QUALITY,     "low_sensor_quality");
#undef ADD_REASON

    if (used + 2U <= buffer_size)
    {
        buffer[used++] = ']';
        buffer[used] = '\0';
    }
    else
    {
        buffer[buffer_size - 2U] = ']';
        buffer[buffer_size - 1U] = '\0';
    }
}

HAL_StatusTypeDef SmartT_TelemetrySend(UART_HandleTypeDef *uart,
                                       SmartT_RecordType_t record_type,
                                       const SmartT_EngineSnapshot_t *engine,
                                       const SmartT_CAN_Data_t *can,
                                       const GPS_Data_t *gps,
                                       const Ultrasonic_Data_t *us,
                                       uint32_t now_ms)
{
    if ((uart == NULL) || (engine == NULL) || (can == NULL) ||
        (gps == NULL) || (us == NULL))
    {
        return HAL_ERROR;
    }

    char reasons[440];
    char json[2300];
    reasons_to_json(engine->reason_mask, reasons, sizeof(reasons));

    const uint32_t uid0 = HAL_GetUIDw0();
    const uint32_t uid1 = HAL_GetUIDw1();
    const uint32_t uid2 = HAL_GetUIDw2();

    const char *record = (record_type == SMARTT_RECORD_EVENT) ? "event" : "telemetry";

    const int n = snprintf(
        json,
        sizeof(json),
        "{\"schema_version\":%u,\"record_type\":\"%s\"," 
        "\"device_id\":\"STM32-%08lX%08lX%08lX\",\"vehicle_id\":\"%s\",\"uptime_ms\":%lu,"
        "\"event_seq\":%lu,\"incident_id\":%lu,"
        "\"event\":\"%s\",\"decision_state\":\"%s\",\"confidence\":%.1f,"
        "\"reasons\":%s,"
        "\"fuel\":{\"calibrated\":%s,\"distance_mm\":%u,\"height_mm\":%.2f,"
        "\"volume_l_raw\":%.3f,\"volume_l\":%.3f,\"percent\":%.2f,"
        "\"rate_lps\":%.4f,\"quality\":%.3f,\"innovation_score\":%.3f},"
        "\"intelligence\":{\"baseline_ready\":%s,\"baseline_l\":%.3f,"
        "\"baseline_noise_l\":%.4f,\"dynamic_threshold_l\":%.3f,\"slosh_score\":%.3f,"
        "\"change_point_score\":%.3f,\"drop_cusum_l\":%.3f,"
        "\"expected_available\":%s,\"expected_consumption_l\":%.4f,"
        "\"expected_fuel_l\":%.3f,\"unexplained_loss_l\":%.3f,"
        "\"expected_from_ecu_fuel_rate\":%s,\"ecu_fuel_level_available\":%s,"
        "\"ecu_fuel_level_pct\":%.2f,\"ecu_fuel_disagreement_pct\":%.2f},"
        "\"context\":{\"mode\":\"%s\",\"speed_known\":%s,\"speed_kmh\":%.2f,"
        "\"gps_fresh\":%s,\"can_fresh\":%s,\"ignition_known\":%s,"
        "\"ignition_on\":%s,\"rpm\":%.1f,\"engine_load_pct\":%.1f,"
        "\"motion_energy\":%.4f,\"roll_deg\":%.2f,\"pitch_deg\":%.2f},"
        "\"gps\":{\"fix\":%s,\"lat\":%.7f,\"lon\":%.7f,\"last_update_ms\":%lu},"
        "\"can\":{\"enabled\":%s,\"fuel_rate_valid\":%s,\"fuel_rate_lph\":%.3f,"
        "\"ecu_fuel_level_valid\":%s,\"ecu_fuel_level_pct\":%.2f,"
        "\"rx_frames\":%lu,\"tx_requests\":%lu,\"tx_errors\":%lu},"
        "\"ultrasonic\":{\"frame_seq\":%lu,\"valid_frames\":%lu,"
        "\"checksum_errors\":%lu,\"range_errors\":%lu,\"resyncs\":%lu}}\r\n",
        (unsigned int)SMARTT_SCHEMA_VERSION,
        record,
        (unsigned long)uid0, (unsigned long)uid1, (unsigned long)uid2,
        SMARTT_VEHICLE_ID,
        (unsigned long)now_ms,
        (unsigned long)engine->event_seq,
        (unsigned long)engine->incident_id,
        SmartT_EventCode(engine->event),
        SmartT_DecisionStateToString(engine->decision_state),
        engine->confidence,
        reasons,
        SMARTT_TANK_CALIBRATION_READY ? "true" : "false",
        (unsigned int)engine->fuel.distance_mm_raw,
        engine->fuel.fuel_height_mm,
        engine->fuel.volume_l_raw,
        engine->fuel.volume_l_filtered,
        engine->fuel.percent_filtered,
        engine->fuel.rate_lps,
        engine->fuel.quality,
        engine->fuel.innovation_score,
        engine->baseline_ready ? "true" : "false",
        engine->fuel_baseline_l,
        engine->baseline_noise_l,
        engine->dynamic_event_threshold_l,
        engine->slosh_score,
        engine->change_point_score,
        engine->drop_cusum_l,
        engine->expected_fuel_available ? "true" : "false",
        engine->expected_consumption_l,
        engine->expected_fuel_l,
        engine->unexplained_loss_l,
        engine->expected_from_ecu_fuel_rate ? "true" : "false",
        engine->ecu_fuel_level_available ? "true" : "false",
        engine->ecu_fuel_level_pct,
        engine->ecu_fuel_disagreement_pct,
        SmartT_ContextToString(engine->context.mode),
        engine->context.speed_known ? "true" : "false",
        engine->context.speed_kmh,
        engine->context.gps_fresh ? "true" : "false",
        engine->context.can_fresh ? "true" : "false",
        engine->context.ignition_known ? "true" : "false",
        engine->context.ignition_on ? "true" : "false",
        engine->context.rpm,
        engine->context.engine_load_pct,
        engine->context.motion_energy,
        engine->context.roll_deg,
        engine->context.pitch_deg,
        gps->fix ? "true" : "false",
        gps->latitude,
        gps->longitude,
        (unsigned long)gps->last_update_ms,
        can->enabled ? "true" : "false",
        can->fuel_rate_valid ? "true" : "false",
        can->fuel_rate_lph,
        can->ecu_fuel_level_valid ? "true" : "false",
        can->ecu_fuel_level_pct,
        (unsigned long)can->rx_frames,
        (unsigned long)can->tx_requests,
        (unsigned long)can->tx_errors,
        (unsigned long)us->frame_seq,
        (unsigned long)us->valid_frames,
        (unsigned long)us->checksum_errors,
        (unsigned long)us->range_errors,
        (unsigned long)us->framing_resyncs);

    if ((n <= 0) || ((size_t)n >= sizeof(json)))
        return HAL_ERROR;

    return HAL_UART_Transmit(uart,
                             (uint8_t *)json,
                             (uint16_t)n,
                             SMARTT_TELEMETRY_UART_TIMEOUT_MS);
}
