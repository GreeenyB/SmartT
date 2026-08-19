#ifndef INC_SMARTT_TELEMETRY_H_
#define INC_SMARTT_TELEMETRY_H_

#include "main.h"
#include "smartt_engine.h"
#include "smartt_can.h"
#include "gps.h"
#include "ultrasonic.h"
#include <stdint.h>

typedef enum
{
    SMARTT_RECORD_TELEMETRY = 0,
    SMARTT_RECORD_EVENT = 1
} SmartT_RecordType_t;

HAL_StatusTypeDef SmartT_TelemetrySend(UART_HandleTypeDef *uart,
                                       SmartT_RecordType_t record_type,
                                       const SmartT_EngineSnapshot_t *engine,
                                       const SmartT_CAN_Data_t *can,
                                       const GPS_Data_t *gps,
                                       const Ultrasonic_Data_t *us,
                                       uint32_t now_ms);

#endif /* INC_SMARTT_TELEMETRY_H_ */
