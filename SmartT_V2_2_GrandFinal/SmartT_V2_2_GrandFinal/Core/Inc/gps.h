#ifndef INC_GPS_H_
#define INC_GPS_H_

#include "main.h"
#include <stdint.h>

typedef struct
{
    double latitude;
    double longitude;
    float speed_kmh;
    uint8_t fix;
    uint32_t last_update_ms;
    uint32_t valid_sentences;
    uint32_t invalid_sentences;
} GPS_Data_t;

void GPS_Init(void);
void GPS_Process(void);
void GPS_GetSnapshot(GPS_Data_t *out);
void GPS_RxCallback(UART_HandleTypeDef *huart);

#endif /* INC_GPS_H_ */
