#include "mpu6050.h"

extern I2C_HandleTypeDef hi2c1;

#define MPU6050_ADDR_68       (0x68U << 1)
#define MPU6050_ADDR_69       (0x69U << 1)

#define SMPLRT_DIV_REG        0x19U
#define CONFIG_REG            0x1AU
#define GYRO_CONFIG_REG       0x1BU
#define ACCEL_CONFIG_REG      0x1CU
#define ACCEL_XOUT_H_REG      0x3BU
#define PWR_MGMT_1_REG        0x6BU
#define WHO_AM_I_REG          0x75U

static uint16_t MPU_ADDR = MPU6050_ADDR_68;
static uint8_t mpu_who_am_i = 0U;

static float gyro_bias_x = 0.0f;
static float gyro_bias_y = 0.0f;
static float gyro_bias_z = 0.0f;

static HAL_StatusTypeDef MPU6050_WriteReg(uint8_t reg, uint8_t value)
{
    return HAL_I2C_Mem_Write(&hi2c1,
                             MPU_ADDR,
                             reg,
                             I2C_MEMADD_SIZE_8BIT,
                             &value,
                             1U,
                             100U);
}

static HAL_StatusTypeDef MPU6050_ReadRaw(int16_t *accel_x,
                                         int16_t *accel_y,
                                         int16_t *accel_z,
                                         int16_t *temp_raw,
                                         int16_t *gyro_x,
                                         int16_t *gyro_y,
                                         int16_t *gyro_z)
{
    uint8_t raw[14];

    if ((accel_x == NULL) || (accel_y == NULL) || (accel_z == NULL) ||
        (temp_raw == NULL) || (gyro_x == NULL) || (gyro_y == NULL) ||
        (gyro_z == NULL))
    {
        return HAL_ERROR;
    }

    if (HAL_I2C_Mem_Read(&hi2c1,
                         MPU_ADDR,
                         ACCEL_XOUT_H_REG,
                         I2C_MEMADD_SIZE_8BIT,
                         raw,
                         sizeof(raw),
                         100U) != HAL_OK)
    {
        return HAL_ERROR;
    }

    *accel_x = (int16_t)(((uint16_t)raw[0] << 8) | raw[1]);
    *accel_y = (int16_t)(((uint16_t)raw[2] << 8) | raw[3]);
    *accel_z = (int16_t)(((uint16_t)raw[4] << 8) | raw[5]);
    *temp_raw = (int16_t)(((uint16_t)raw[6] << 8) | raw[7]);
    *gyro_x = (int16_t)(((uint16_t)raw[8] << 8) | raw[9]);
    *gyro_y = (int16_t)(((uint16_t)raw[10] << 8) | raw[11]);
    *gyro_z = (int16_t)(((uint16_t)raw[12] << 8) | raw[13]);

    /* A powered, stationary MPU6050 cannot have all three acceleration axes
     * exactly zero because gravity must appear on at least one axis.  Treat
     * an all-zero accel frame as invalid instead of silently showing 0 deg.
     */
    if ((*accel_x == 0) && (*accel_y == 0) && (*accel_z == 0))
    {
        return HAL_ERROR;
    }

    return HAL_OK;
}

HAL_StatusTypeDef MPU6050_Init(void)
{
    uint8_t check = 0U;

    /* Probe both possible AD0 addresses. */
    if (HAL_I2C_IsDeviceReady(&hi2c1, MPU6050_ADDR_68, 3U, 100U) == HAL_OK)
    {
        MPU_ADDR = MPU6050_ADDR_68;
    }
    else if (HAL_I2C_IsDeviceReady(&hi2c1, MPU6050_ADDR_69, 3U, 100U) == HAL_OK)
    {
        MPU_ADDR = MPU6050_ADDR_69;
    }
    else
    {
        mpu_who_am_i = 0U;
        return HAL_ERROR;
    }

    if (HAL_I2C_Mem_Read(&hi2c1,
                         MPU_ADDR,
                         WHO_AM_I_REG,
                         I2C_MEMADD_SIZE_8BIT,
                         &check,
                         1U,
                         100U) != HAL_OK)
    {
        mpu_who_am_i = 0U;
        return HAL_ERROR;
    }

    mpu_who_am_i = check;

    /* Genuine MPU6050 reports 0x68. Some compatible parts/clones may mirror
     * the AD0 bit, so accept 0x69 as well for prototype compatibility.
     */
    if ((check != 0x68U) && (check != 0x69U))
    {
        return HAL_ERROR;
    }

    /* Reset the device first so we do not inherit an unknown configuration. */
    if (MPU6050_WriteReg(PWR_MGMT_1_REG, 0x80U) != HAL_OK)
        return HAL_ERROR;

    HAL_Delay(100U);

    /* Wake up and use the X-gyro PLL clock. */
    if (MPU6050_WriteReg(PWR_MGMT_1_REG, 0x01U) != HAL_OK)
        return HAL_ERROR;

    /* DLPF ~44 Hz (CONFIG=3) and sample rate 1 kHz / (1+7) = 125 Hz. */
    if (MPU6050_WriteReg(CONFIG_REG, 0x03U) != HAL_OK)
        return HAL_ERROR;

    if (MPU6050_WriteReg(SMPLRT_DIV_REG, 0x07U) != HAL_OK)
        return HAL_ERROR;

    /* Accelerometer ±2 g, gyro ±250 deg/s. */
    if (MPU6050_WriteReg(ACCEL_CONFIG_REG, 0x00U) != HAL_OK)
        return HAL_ERROR;

    if (MPU6050_WriteReg(GYRO_CONFIG_REG, 0x00U) != HAL_OK)
        return HAL_ERROR;

    HAL_Delay(50U);

    /* Verify that a physically plausible sample can actually be read. */
    {
        int16_t ax, ay, az, tr, gx, gy, gz;
        if (MPU6050_ReadRaw(&ax, &ay, &az, &tr, &gx, &gy, &gz) != HAL_OK)
            return HAL_ERROR;
    }

    return HAL_OK;
}

HAL_StatusTypeDef MPU6050_Read(MPU6050_Data_t *data)
{
    int16_t accelX;
    int16_t accelY;
    int16_t accelZ;
    int16_t tempRaw;
    int16_t gyroX;
    int16_t gyroY;
    int16_t gyroZ;

    if (data == NULL)
        return HAL_ERROR;

    if (MPU6050_ReadRaw(&accelX,
                        &accelY,
                        &accelZ,
                        &tempRaw,
                        &gyroX,
                        &gyroY,
                        &gyroZ) != HAL_OK)
    {
        return HAL_ERROR;
    }

    data->ax = (float)accelX / 16384.0f;
    data->ay = (float)accelY / 16384.0f;
    data->az = (float)accelZ / 16384.0f;

    data->gx = ((float)gyroX / 131.0f) - gyro_bias_x;
    data->gy = ((float)gyroY / 131.0f) - gyro_bias_y;
    data->gz = ((float)gyroZ / 131.0f) - gyro_bias_z;

    data->temperature = ((float)tempRaw / 340.0f) + 36.53f;

    data->roll = atan2f(data->ay, data->az) * 57.2957795f;
    data->pitch = atan2f(-data->ax,
                         sqrtf((data->ay * data->ay) +
                               (data->az * data->az))) * 57.2957795f;

    return HAL_OK;
}

HAL_StatusTypeDef MPU6050_CalibrateGyro(void)
{
    float sum_x = 0.0f;
    float sum_y = 0.0f;
    float sum_z = 0.0f;
    const uint16_t samples = 250U;

    /* Calibration must use raw gyro values.  Do not call MPU6050_Read() here,
     * otherwise a second calibration would average already bias-corrected data.
     */
    for (uint16_t i = 0U; i < samples; i++)
    {
        int16_t ax, ay, az, tr, gx, gy, gz;

        if (MPU6050_ReadRaw(&ax, &ay, &az, &tr, &gx, &gy, &gz) != HAL_OK)
            return HAL_ERROR;

        sum_x += (float)gx / 131.0f;
        sum_y += (float)gy / 131.0f;
        sum_z += (float)gz / 131.0f;

        HAL_Delay(4U);
    }

    gyro_bias_x = sum_x / (float)samples;
    gyro_bias_y = sum_y / (float)samples;
    gyro_bias_z = sum_z / (float)samples;

    return HAL_OK;
}

uint8_t MPU6050_GetWhoAmI(void)
{
    return mpu_who_am_i;
}

uint8_t MPU6050_GetAddress7bit(void)
{
    return (uint8_t)(MPU_ADDR >> 1);
}
