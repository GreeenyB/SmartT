#ifndef INC_SMARTT_ENGINE_H_
#define INC_SMARTT_ENGINE_H_

#include "main.h"
#include "gps.h"
#include "mpu6050.h"
#include "ultrasonic.h"
#include "smartt_can.h"
#include <stdint.h>

typedef struct
{
    float height_mm;
    float volume_l;
} SmartT_TankCalPoint_t;

typedef enum
{
    SMARTT_CONTEXT_UNKNOWN = 0,
    SMARTT_CONTEXT_PARKED_STABLE,
    SMARTT_CONTEXT_PARKED_UNSTABLE,
    SMARTT_CONTEXT_MOVING_SMOOTH,
    SMARTT_CONTEXT_MOVING_ROUGH,
    SMARTT_CONTEXT_TILTED
} SmartT_ContextMode_t;

typedef enum
{
    SMARTT_EVENT_CALIBRATION_REQUIRED = 0,
    SMARTT_EVENT_NORMAL,
    SMARTT_EVENT_SLOSHING,
    SMARTT_EVENT_REFUEL_CANDIDATE,
    SMARTT_EVENT_REFUEL,
    SMARTT_EVENT_DROP_CANDIDATE,
    SMARTT_EVENT_SUSPICIOUS_FUEL_LOSS,
    SMARTT_EVENT_FUEL_THEFT_ANOMALY,
    SMARTT_EVENT_SENSOR_FAULT,
    SMARTT_EVENT_DATA_QUALITY_WARNING
} SmartT_Event_t;

typedef enum
{
    SMARTT_DECISION_IDLE = 0,
    SMARTT_DECISION_SLOSHING,
    SMARTT_DECISION_REFUEL_CANDIDATE,
    SMARTT_DECISION_REFUEL_ACTIVE,
    SMARTT_DECISION_LOSS_CANDIDATE,
    SMARTT_DECISION_LOSS_ACTIVE,
    SMARTT_DECISION_SENSOR_FAULT
} SmartT_DecisionState_t;

enum
{
    SMARTT_REASON_NONE                   = 0U,
    SMARTT_REASON_FUEL_RISE              = (1UL << 0),
    SMARTT_REASON_FUEL_DROP              = (1UL << 1),
    SMARTT_REASON_STATIONARY             = (1UL << 2),
    SMARTT_REASON_ENGINE_OFF             = (1UL << 3),
    SMARTT_REASON_LOW_SLOSH              = (1UL << 4),
    SMARTT_REASON_HIGH_SENSOR_QUALITY    = (1UL << 5),
    SMARTT_REASON_CHANGE_POINT           = (1UL << 6),
    SMARTT_REASON_UNEXPLAINED_LOSS       = (1UL << 7),
    SMARTT_REASON_MOTION_SUPPORTS_SLOSH  = (1UL << 8),
    SMARTT_REASON_SENSOR_STALE           = (1UL << 9),
    SMARTT_REASON_SENSOR_INVALID         = (1UL << 10),
    SMARTT_REASON_CALIBRATION_REQUIRED   = (1UL << 11),
    SMARTT_REASON_GPS_FRESH              = (1UL << 12),
    SMARTT_REASON_CAN_FRESH              = (1UL << 13),
    SMARTT_REASON_ECU_FUEL_DISAGREEMENT  = (1UL << 14),
    SMARTT_REASON_INNOVATION_GATE        = (1UL << 15),
    SMARTT_REASON_ECU_FUEL_RATE          = (1UL << 16),
    SMARTT_REASON_CONTEXT_UNKNOWN        = (1UL << 17),
    SMARTT_REASON_LOW_SENSOR_QUALITY     = (1UL << 18)
};

typedef struct
{
    uint32_t timestamp_ms;
    uint16_t distance_mm_raw;
    float fuel_height_mm;
    float volume_l_raw;
    float volume_l_filtered;
    float percent_filtered;
    float rate_lps;
    float quality;
    float innovation_score;
    uint8_t available;
} SmartT_FuelObservation_t;

typedef struct
{
    SmartT_ContextMode_t mode;
    float speed_kmh;
    float motion_energy;
    float roll_deg;
    float pitch_deg;
    uint8_t speed_known;
    uint8_t gps_fresh;
    uint8_t can_fresh;
    uint8_t ignition_known;
    uint8_t ignition_on;
    float rpm;
    float engine_load_pct;
} SmartT_ContextSnapshot_t;

typedef struct
{
    SmartT_FuelObservation_t fuel;
    SmartT_ContextSnapshot_t context;

    float slosh_score;
    float fuel_baseline_l;
    uint8_t baseline_ready;
    float baseline_noise_l;
    float dynamic_event_threshold_l;

    float expected_consumption_l;
    float expected_fuel_l;
    uint8_t expected_fuel_available;
    float unexplained_loss_l;
    uint8_t expected_from_ecu_fuel_rate;

    float change_point_score;
    float drop_cusum_l;

    float ecu_fuel_level_pct;
    uint8_t ecu_fuel_level_available;
    float ecu_fuel_disagreement_pct;
    uint8_t ecu_fuel_disagreement_confirmed;

    SmartT_DecisionState_t decision_state;
    SmartT_Event_t event;
    float confidence;
    uint32_t reason_mask;

    uint32_t event_seq;
    uint32_t incident_id;
    uint32_t incident_start_ms;
    uint32_t last_transition_ms;

    uint32_t ultrasonic_frames;
    uint32_t ultrasonic_checksum_errors;
    uint32_t ultrasonic_range_errors;
} SmartT_EngineSnapshot_t;

void SmartT_EngineInit(uint32_t now_ms);
void SmartT_EnginePushImu(const MPU6050_Data_t *imu,
                          float filtered_roll_deg,
                          float filtered_pitch_deg,
                          uint8_t imu_available,
                          uint32_t now_ms);
void SmartT_EngineUpdateContext(const GPS_Data_t *gps,
                                const SmartT_CAN_Data_t *can,
                                uint32_t now_ms);
void SmartT_EngineProcessUltrasonic(const Ultrasonic_Data_t *us,
                                    uint32_t now_ms);
void SmartT_EngineTick(const Ultrasonic_Data_t *us, uint32_t now_ms);
void SmartT_EngineGetSnapshot(SmartT_EngineSnapshot_t *out);

const char *SmartT_ContextToString(SmartT_ContextMode_t mode);
const char *SmartT_EventToString(SmartT_Event_t event);
const char *SmartT_EventCode(SmartT_Event_t event);
const char *SmartT_DecisionStateToString(SmartT_DecisionState_t state);

#endif /* INC_SMARTT_ENGINE_H_ */
