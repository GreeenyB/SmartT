#ifndef INC_MPU6050_H_
#define INC_MPU6050_H_

#include "main.h"
#include <stdint.h>
#include <math.h>

typedef struct
{
    float ax;
    float ay;
    float az;

    float gx;
    float gy;
    float gz;

    float temperature;

    float roll;
    float pitch;

} MPU6050_Data_t;

HAL_StatusTypeDef MPU6050_Init(void);
HAL_StatusTypeDef MPU6050_Read(MPU6050_Data_t *data);
HAL_StatusTypeDef MPU6050_CalibrateGyro(void);

/* Small diagnostics helpers used by main.c during bring-up/recovery. */
uint8_t MPU6050_GetWhoAmI(void);
uint8_t MPU6050_GetAddress7bit(void);

#endif
