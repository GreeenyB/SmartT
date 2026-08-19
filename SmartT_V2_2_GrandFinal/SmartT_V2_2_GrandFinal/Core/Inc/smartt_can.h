#ifndef INC_SMARTT_CAN_H_
#define INC_SMARTT_CAN_H_

#include "main.h"
#include <stdint.h>

typedef struct
{
    uint8_t enabled;
    uint8_t bus_started;

    uint8_t speed_valid;
    uint8_t rpm_valid;
    uint8_t engine_load_valid;
    uint8_t ecu_fuel_level_valid;
    uint8_t fuel_rate_valid;

    float speed_kmh;
    float rpm;
    float engine_load_pct;
    float ecu_fuel_level_pct;
    float fuel_rate_lph;

    uint32_t speed_update_ms;
    uint32_t rpm_update_ms;
    uint32_t engine_load_update_ms;
    uint32_t fuel_level_update_ms;
    uint32_t fuel_rate_update_ms;
    uint32_t last_rx_ms;

    uint32_t tx_requests;
    uint32_t rx_frames;
    uint32_t tx_errors;
} SmartT_CAN_Data_t;

HAL_StatusTypeDef SmartT_CAN_Init(CAN_HandleTypeDef *hcan);
void SmartT_CAN_Process(CAN_HandleTypeDef *hcan, uint32_t now_ms);
void SmartT_CAN_GetSnapshot(SmartT_CAN_Data_t *out);

#endif /* INC_SMARTT_CAN_H_ */
