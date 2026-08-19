#ifndef INC_ULTRASONIC_H_
#define INC_ULTRASONIC_H_

#include "main.h"
#include <stdint.h>

typedef struct
{
    uint16_t distance_mm;
    uint8_t valid;
    uint32_t last_update_ms;
    uint32_t frame_seq;
    uint32_t valid_frames;
    uint32_t checksum_errors;
    uint32_t range_errors;
    uint32_t framing_resyncs;
} Ultrasonic_Data_t;

void Ultrasonic_Init(void);
void Ultrasonic_Process(void);
void Ultrasonic_RxCallback(UART_HandleTypeDef *huart);
void Ultrasonic_GetSnapshot(Ultrasonic_Data_t *out);

#endif /* INC_ULTRASONIC_H_ */
