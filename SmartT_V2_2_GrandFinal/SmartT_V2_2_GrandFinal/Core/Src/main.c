/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.c
  * @brief          : Main program body
  ******************************************************************************
  * @attention
  *
  * Copyright (c) 2026 STMicroelectronics.
  * All rights reserved.
  *
  * This software is licensed under terms that can be found in the LICENSE file
  * in the root directory of this software component.
  * If no LICENSE file comes with this software, it is provided AS-IS.
  *
  ******************************************************************************
  */
/* USER CODE END Header */
/* Includes ------------------------------------------------------------------*/
#include "main.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */
#include "lcd_bus.h"
#include "lcd.h"
#include "mpu6050.h"
#include "gps.h"
#include "ultrasonic.h"
#include "smartt_config.h"
#include "smartt_can.h"
#include "smartt_engine.h"
#include "smartt_telemetry.h"

#include <stdio.h>
#include <math.h>
#include <string.h>
/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN PTD */

/* USER CODE END PTD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */

/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */

/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/
CAN_HandleTypeDef hcan1;

I2C_HandleTypeDef hi2c1;

UART_HandleTypeDef huart2;
UART_HandleTypeDef huart3;
UART_HandleTypeDef huart6;

SRAM_HandleTypeDef hsram1;

/* USER CODE BEGIN PV */
MPU6050_Data_t imu;

float filtered_roll = 0.0f;
float filtered_pitch = 0.0f;

uint32_t imu_last_tick = 0U;
uint32_t imu_reinit_tick = 0U;
uint32_t display_last_tick = 0U;
uint32_t telemetry_last_tick = 0U;
uint32_t last_ultrasonic_frame_seq = 0U;
uint32_t last_sent_event_seq = 0U;

uint8_t imu_ok = 0U;
uint8_t imu_consecutive_fail = 0U;
uint32_t imu_read_ok = 0U;
uint32_t imu_read_fail = 0U;

char gps_lat_text[24];
char gps_lon_text[24];
char sensor_text[32];

GPS_Data_t gps_snapshot;
Ultrasonic_Data_t ultrasonic_snapshot;
SmartT_CAN_Data_t can_snapshot;
SmartT_EngineSnapshot_t engine_snapshot;
/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
static void MX_GPIO_Init(void);
static void MX_CAN1_Init(void);
static void MX_FSMC_Init(void);
static void MX_I2C1_Init(void);
static void MX_USART2_UART_Init(void);
static void MX_USART3_UART_Init(void);
static void MX_USART6_UART_Init(void);
/* USER CODE BEGIN PFP */

/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */
/* ================================================================
 * SmartT V2.2 main.c is now an orchestrator.
 * Fuel intelligence lives in smartt_engine.c, CAN context in
 * smartt_can.c, and JSON telemetry in smartt_telemetry.c.
 * ================================================================ */

static uint8_t SmartT_IMUStartWithCalibration(void)
{
  memset(&imu, 0, sizeof(imu));

  if (MPU6050_Init() != HAL_OK)
    return 0U;

  if (MPU6050_CalibrateGyro() != HAL_OK)
    return 0U;

  if (MPU6050_Read(&imu) != HAL_OK)
    return 0U;

  filtered_roll = imu.roll;
  filtered_pitch = imu.pitch;
  imu_last_tick = HAL_GetTick();
  imu_consecutive_fail = 0U;
  return 1U;
}

static uint8_t SmartT_IMUTryRecover(void)
{
  /* Runtime recovery intentionally skips gyro calibration because the
   * vehicle may already be moving. */
  if (MPU6050_Init() != HAL_OK)
    return 0U;

  if (MPU6050_Read(&imu) != HAL_OK)
    return 0U;

  filtered_roll = imu.roll;
  filtered_pitch = imu.pitch;
  imu_last_tick = HAL_GetTick();
  imu_consecutive_fail = 0U;
  return 1U;
}

static float SmartT_ComputeDisplayTilt(void)
{
  if (!imu_ok)
    return -1.0f;

  const float accel_xy = sqrtf((imu.ax * imu.ax) + (imu.ay * imu.ay));
  const float accel_mag = sqrtf((imu.ax * imu.ax) +
                                (imu.ay * imu.ay) +
                                (imu.az * imu.az));

  if (accel_mag < 0.10f)
    return -1.0f;

  float tilt = atan2f(accel_xy, imu.az) * 57.2957795f;
  if (tilt < 0.5f)
    tilt = 0.0f;
  return tilt;
}

static void FormatCoordinate(char *buffer, size_t size, double value)
{
  char sign = ' ';
  if (value < 0.0)
  {
    sign = '-';
    value = -value;
  }

  const uint32_t integer_part = (uint32_t)value;
  const uint32_t decimal_part =
      (uint32_t)((value - (double)integer_part) * 100000.0);

  snprintf(buffer, size, "%c%lu.%05lu", sign,
           (unsigned long)integer_part,
           (unsigned long)decimal_part);
}
/* USER CODE END 0 */

/**
  * @brief  The application entry point.
  * @retval int
  */
int main(void)
{

  /* USER CODE BEGIN 1 */

  /* USER CODE END 1 */

  /* MCU Configuration--------------------------------------------------------*/

  /* Reset of all peripherals, Initializes the Flash interface and the Systick. */
  HAL_Init();

  /* USER CODE BEGIN Init */

  /* USER CODE END Init */

  /* Configure the system clock */
  SystemClock_Config();

  /* USER CODE BEGIN SysInit */

  /* USER CODE END SysInit */

  /* Initialize all configured peripherals */
  MX_GPIO_Init();
  MX_CAN1_Init();
  MX_FSMC_Init();
  MX_I2C1_Init();
  MX_USART2_UART_Init();
  MX_USART3_UART_Init();
  MX_USART6_UART_Init();
  /* USER CODE BEGIN 2 */
memset(&gps_snapshot, 0, sizeof(gps_snapshot));
  memset(&ultrasonic_snapshot, 0, sizeof(ultrasonic_snapshot));
  memset(&can_snapshot, 0, sizeof(can_snapshot));
  memset(&engine_snapshot, 0, sizeof(engine_snapshot));

  LCD_Init();
  SmartT_DrawDashboard();

  /* Local edge is functional independently of cloud connectivity. */
  LCD_FillRect(250, 5, 65, 18, LCD_BLUE);
  LCD_DrawString(250, 10, "EDGE", LCD_GREEN, LCD_BLUE, 1);

  LCD_FillRect(0, 202, 105, 14, LCD_BLACK);
  LCD_DrawString(10, 205, "SENSOR", LCD_WHITE, LCD_BLACK, 1);

  LCD_DrawString(110, 185, "CALIBRATING", LCD_YELLOW, LCD_BLACK, 1);

  imu_ok = SmartT_IMUStartWithCalibration();
  imu_reinit_tick = HAL_GetTick();

  if (!imu_ok)
  {
    LCD_DrawString(110, 185, "IMU FAIL    ", LCD_RED, LCD_BLACK, 1);
  }

  GPS_Init();
  Ultrasonic_Init();
  (void)SmartT_CAN_Init(&hcan1);
  SmartT_EngineInit(HAL_GetTick());

  if (imu_ok)
  {
    SmartT_EnginePushImu(&imu, filtered_roll, filtered_pitch, 1U, HAL_GetTick());
  }

  display_last_tick = HAL_GetTick();
  telemetry_last_tick = HAL_GetTick();
/* USER CODE END 2 */

  /* Infinite loop */
  /* USER CODE BEGIN WHILE */
  while (1)
  {
    const uint32_t now = HAL_GetTick();

    GPS_Process();
    Ultrasonic_Process();
    SmartT_CAN_Process(&hcan1, now);

    GPS_GetSnapshot(&gps_snapshot);
    Ultrasonic_GetSnapshot(&ultrasonic_snapshot);
    SmartT_CAN_GetSnapshot(&can_snapshot);

    /* ------------------------------------------------------------
     * MPU6050 at 50 Hz: complementary attitude + motion energy.
     * ------------------------------------------------------------ */
    if (imu_ok && ((now - imu_last_tick) >= SMARTT_IMU_PERIOD_MS))
    {
      const float dt = (float)(now - imu_last_tick) / 1000.0f;
      imu_last_tick = now;

      if (MPU6050_Read(&imu) == HAL_OK)
      {
        imu_read_ok++;
        imu_consecutive_fail = 0U;

        const float alpha = 0.98f;
        filtered_roll = alpha * (filtered_roll + imu.gx * dt) +
                        (1.0f - alpha) * imu.roll;
        filtered_pitch = alpha * (filtered_pitch + imu.gy * dt) +
                         (1.0f - alpha) * imu.pitch;

        SmartT_EnginePushImu(&imu,
                             filtered_roll,
                             filtered_pitch,
                             1U,
                             now);
      }
      else
      {
        imu_read_fail++;
        if (imu_consecutive_fail < 255U)
          imu_consecutive_fail++;

        if (imu_consecutive_fail >= SMARTT_IMU_MAX_CONSECUTIVE_FAIL)
        {
          imu_ok = 0U;
          imu_reinit_tick = now;
          memset(&imu, 0, sizeof(imu));
          filtered_roll = 0.0f;
          filtered_pitch = 0.0f;
          SmartT_EnginePushImu(NULL, 0.0f, 0.0f, 0U, now);
        }
      }
    }

    if (!imu_ok && ((now - imu_reinit_tick) >= SMARTT_IMU_RETRY_MS))
    {
      imu_reinit_tick = now;
      if (SmartT_IMUTryRecover())
      {
        imu_ok = 1U;
        imu_read_ok++;
        SmartT_EnginePushImu(&imu,
                             filtered_roll,
                             filtered_pitch,
                             1U,
                             now);
      }
      else
      {
        imu_read_fail++;
      }
    }

    /* Safe context fusion: no fresh speed/engine evidence means UNKNOWN,
     * rather than assuming the vehicle is parked from a quiet IMU alone. */
    SmartT_EngineUpdateContext(&gps_snapshot, &can_snapshot, now);

    /* Process each complete automatic-UART ultrasonic frame exactly once. */
    if (ultrasonic_snapshot.valid &&
        (ultrasonic_snapshot.frame_seq != 0U) &&
        (ultrasonic_snapshot.frame_seq != last_ultrasonic_frame_seq))
    {
      last_ultrasonic_frame_seq = ultrasonic_snapshot.frame_seq;
      SmartT_EngineProcessUltrasonic(&ultrasonic_snapshot, now);
    }

    /* Freshness, baseline timers and candidate confirmation continue even
     * between sensor frames. */
    SmartT_EngineTick(&ultrasonic_snapshot, now);
    SmartT_EngineGetSnapshot(&engine_snapshot);

    /* Confirmed incidents are pushed immediately.  event_seq is stable so
     * the gateway/backend can deduplicate retries idempotently. */
    if ((engine_snapshot.event_seq != 0U) &&
        (engine_snapshot.event_seq != last_sent_event_seq))
    {
      /* Advance the local ACK marker only after USART accepted the record.
       * If transmission fails, the same confirmed event is retried next loop. */
      if (SmartT_TelemetrySend(&huart2,
                               SMARTT_RECORD_EVENT,
                               &engine_snapshot,
                               &can_snapshot,
                               &gps_snapshot,
                               &ultrasonic_snapshot,
                               now) == HAL_OK)
      {
        last_sent_event_seq = engine_snapshot.event_seq;
      }
    }

    if ((now - telemetry_last_tick) >= SMARTT_TELEMETRY_PERIOD_MS)
    {
      telemetry_last_tick = now;
      (void)SmartT_TelemetrySend(&huart2,
                                 SMARTT_RECORD_TELEMETRY,
                                 &engine_snapshot,
                                 &can_snapshot,
                                 &gps_snapshot,
                                 &ultrasonic_snapshot,
                                 now);
    }

    /* ------------------------------------------------------------
     * TFT at 10 Hz.
     * ------------------------------------------------------------ */
    if ((now - display_last_tick) >= SMARTT_DISPLAY_PERIOD_MS)
    {
      display_last_tick = now;

      const int vehicle_speed = engine_snapshot.context.speed_known ?
                                (int)engine_snapshot.context.speed_kmh : 0;
      const int rpm = engine_snapshot.context.can_fresh ?
                      (int)engine_snapshot.context.rpm : -1;

      const float display_fuel = SMARTT_TANK_CALIBRATION_READY &&
                                 engine_snapshot.fuel.available ?
                                 engine_snapshot.fuel.percent_filtered : -1.0f;

      const char *state_text = imu_ok ?
                               SmartT_ContextToString(engine_snapshot.context.mode) :
                               "IMU FAIL";
      const char *event_text = SmartT_EventToString(engine_snapshot.event);

      if (ultrasonic_snapshot.valid &&
          (ultrasonic_snapshot.last_update_ms != 0U) &&
          ((now - ultrasonic_snapshot.last_update_ms) < SMARTT_US_TIMEOUT_MS))
      {
        const unsigned int q_pct =
            (unsigned int)(engine_snapshot.fuel.quality * 100.0f + 0.5f);
        snprintf(sensor_text,
                 sizeof(sensor_text),
                 "US %u Q%u",
                 (unsigned int)ultrasonic_snapshot.distance_mm,
                 q_pct);
      }
      else
      {
        strcpy(sensor_text, "US NO DATA");
      }

      SmartT_UpdateDashboard(display_fuel,
                             rpm,
                             vehicle_speed,
                             SmartT_ComputeDisplayTilt(),
                             state_text,
                             event_text,
                             sensor_text);

      LCD_FillRect(0, 220, 320, 20, LCD_BLACK);
      LCD_DrawString(10, 225, "GPS", LCD_CYAN, LCD_BLACK, 1);

      if (gps_snapshot.fix &&
          (gps_snapshot.last_update_ms != 0U) &&
          ((now - gps_snapshot.last_update_ms) <= SMARTT_GPS_FRESH_MS))
      {
        FormatCoordinate(gps_lat_text, sizeof(gps_lat_text), gps_snapshot.latitude);
        FormatCoordinate(gps_lon_text, sizeof(gps_lon_text), gps_snapshot.longitude);
        LCD_DrawString(105, 225, gps_lat_text, LCD_WHITE, LCD_BLACK, 1);
        LCD_DrawString(190, 225, gps_lon_text, LCD_WHITE, LCD_BLACK, 1);
      }
      else
      {
        LCD_DrawString(105, 225, "NO FRESH FIX", LCD_RED, LCD_BLACK, 1);
      }
    }
    /* USER CODE END WHILE */

    /* USER CODE BEGIN 3 */
  }
  /* USER CODE END 3 */
}

/**
  * @brief System Clock Configuration
  * @retval None
  */
void SystemClock_Config(void)
{
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

  /** Configure the main internal regulator output voltage
  */
  __HAL_RCC_PWR_CLK_ENABLE();
  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE1);

  /** Initializes the RCC Oscillators according to the specified parameters
  * in the RCC_OscInitTypeDef structure.
  */
  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSE;
  RCC_OscInitStruct.HSEState = RCC_HSE_ON;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSE;
  RCC_OscInitStruct.PLL.PLLM = 8;
  RCC_OscInitStruct.PLL.PLLN = 336;
  RCC_OscInitStruct.PLL.PLLP = RCC_PLLP_DIV2;
  RCC_OscInitStruct.PLL.PLLQ = 4;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
  {
    Error_Handler();
  }

  /** Initializes the CPU, AHB and APB buses clocks
  */
  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK
                              |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;
  RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV4;
  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV2;

  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_5) != HAL_OK)
  {
    Error_Handler();
  }
}

/**
  * @brief CAN1 Initialization Function
  * @param None
  * @retval None
  */
static void MX_CAN1_Init(void)
{

  /* USER CODE BEGIN CAN1_Init 0 */

  /* USER CODE END CAN1_Init 0 */

  /* USER CODE BEGIN CAN1_Init 1 */

  /* USER CODE END CAN1_Init 1 */
  hcan1.Instance = CAN1;
  hcan1.Init.Prescaler = 6;
  hcan1.Init.Mode = CAN_MODE_NORMAL;
  hcan1.Init.SyncJumpWidth = CAN_SJW_1TQ;
  hcan1.Init.TimeSeg1 = CAN_BS1_11TQ;
  hcan1.Init.TimeSeg2 = CAN_BS2_2TQ;
  hcan1.Init.TimeTriggeredMode = DISABLE;
  hcan1.Init.AutoBusOff = ENABLE;
  hcan1.Init.AutoWakeUp = DISABLE;
  hcan1.Init.AutoRetransmission = ENABLE;
  hcan1.Init.ReceiveFifoLocked = DISABLE;
  hcan1.Init.TransmitFifoPriority = DISABLE;
  if (HAL_CAN_Init(&hcan1) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN CAN1_Init 2 */

  /* USER CODE END CAN1_Init 2 */

}

/**
  * @brief I2C1 Initialization Function
  * @param None
  * @retval None
  */
static void MX_I2C1_Init(void)
{

  /* USER CODE BEGIN I2C1_Init 0 */

  /* USER CODE END I2C1_Init 0 */

  /* USER CODE BEGIN I2C1_Init 1 */

  /* USER CODE END I2C1_Init 1 */
  hi2c1.Instance = I2C1;
  hi2c1.Init.ClockSpeed = 100000;
  hi2c1.Init.DutyCycle = I2C_DUTYCYCLE_2;
  hi2c1.Init.OwnAddress1 = 0;
  hi2c1.Init.AddressingMode = I2C_ADDRESSINGMODE_7BIT;
  hi2c1.Init.DualAddressMode = I2C_DUALADDRESS_DISABLE;
  hi2c1.Init.OwnAddress2 = 0;
  hi2c1.Init.GeneralCallMode = I2C_GENERALCALL_DISABLE;
  hi2c1.Init.NoStretchMode = I2C_NOSTRETCH_DISABLE;
  if (HAL_I2C_Init(&hi2c1) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN I2C1_Init 2 */

  /* USER CODE END I2C1_Init 2 */

}

/**
  * @brief USART2 Initialization Function
  * @param None
  * @retval None
  */
static void MX_USART2_UART_Init(void)
{

  /* USER CODE BEGIN USART2_Init 0 */

  /* USER CODE END USART2_Init 0 */

  /* USER CODE BEGIN USART2_Init 1 */

  /* USER CODE END USART2_Init 1 */
  huart2.Instance = USART2;
  huart2.Init.BaudRate = 460800;
  huart2.Init.WordLength = UART_WORDLENGTH_8B;
  huart2.Init.StopBits = UART_STOPBITS_1;
  huart2.Init.Parity = UART_PARITY_NONE;
  huart2.Init.Mode = UART_MODE_TX_RX;
  huart2.Init.HwFlowCtl = UART_HWCONTROL_NONE;
  huart2.Init.OverSampling = UART_OVERSAMPLING_16;
  if (HAL_UART_Init(&huart2) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN USART2_Init 2 */

  /* USER CODE END USART2_Init 2 */

}

/**
  * @brief USART3 Initialization Function
  * @param None
  * @retval None
  */
static void MX_USART3_UART_Init(void)
{

  /* USER CODE BEGIN USART3_Init 0 */

  /* USER CODE END USART3_Init 0 */

  /* USER CODE BEGIN USART3_Init 1 */

  /* USER CODE END USART3_Init 1 */
  huart3.Instance = USART3;
  huart3.Init.BaudRate = 9600;
  huart3.Init.WordLength = UART_WORDLENGTH_8B;
  huart3.Init.StopBits = UART_STOPBITS_1;
  huart3.Init.Parity = UART_PARITY_NONE;
  huart3.Init.Mode = UART_MODE_TX_RX;
  huart3.Init.HwFlowCtl = UART_HWCONTROL_NONE;
  huart3.Init.OverSampling = UART_OVERSAMPLING_16;
  if (HAL_UART_Init(&huart3) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN USART3_Init 2 */

  /* USER CODE END USART3_Init 2 */

}

/**
  * @brief USART6 Initialization Function
  * @param None
  * @retval None
  */
static void MX_USART6_UART_Init(void)
{

  /* USER CODE BEGIN USART6_Init 0 */

  /* USER CODE END USART6_Init 0 */

  /* USER CODE BEGIN USART6_Init 1 */

  /* USER CODE END USART6_Init 1 */
  huart6.Instance = USART6;
  huart6.Init.BaudRate = 9600;
  huart6.Init.WordLength = UART_WORDLENGTH_8B;
  huart6.Init.StopBits = UART_STOPBITS_1;
  huart6.Init.Parity = UART_PARITY_NONE;
  huart6.Init.Mode = UART_MODE_RX;
  huart6.Init.HwFlowCtl = UART_HWCONTROL_NONE;
  huart6.Init.OverSampling = UART_OVERSAMPLING_16;
  if (HAL_UART_Init(&huart6) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN USART6_Init 2 */

  /* USER CODE END USART6_Init 2 */

}

/**
  * @brief GPIO Initialization Function
  * @param None
  * @retval None
  */
static void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  /* USER CODE BEGIN MX_GPIO_Init_1 */

  /* USER CODE END MX_GPIO_Init_1 */

  /* GPIO Ports Clock Enable */
  __HAL_RCC_GPIOH_CLK_ENABLE();
  __HAL_RCC_GPIOA_CLK_ENABLE();
  __HAL_RCC_GPIOC_CLK_ENABLE();
  __HAL_RCC_GPIOE_CLK_ENABLE();
  __HAL_RCC_GPIOB_CLK_ENABLE();
  __HAL_RCC_GPIOD_CLK_ENABLE();

  /*Configure GPIO pin : PC4 */
  GPIO_InitStruct.Pin = GPIO_PIN_4;
  GPIO_InitStruct.Mode = GPIO_MODE_IT_RISING;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(GPIOC, &GPIO_InitStruct);

  /* USER CODE BEGIN MX_GPIO_Init_2 */

  /* USER CODE END MX_GPIO_Init_2 */
}

/* FSMC initialization function */
static void MX_FSMC_Init(void)
{

  /* USER CODE BEGIN FSMC_Init 0 */

  /* USER CODE END FSMC_Init 0 */

  FSMC_NORSRAM_TimingTypeDef Timing = {0};

  /* USER CODE BEGIN FSMC_Init 1 */

  /* USER CODE END FSMC_Init 1 */

  /** Perform the SRAM1 memory initialization sequence
  */
  hsram1.Instance = FSMC_NORSRAM_DEVICE;
  hsram1.Extended = FSMC_NORSRAM_EXTENDED_DEVICE;
  /* hsram1.Init */
  hsram1.Init.NSBank = FSMC_NORSRAM_BANK1;
  hsram1.Init.DataAddressMux = FSMC_DATA_ADDRESS_MUX_DISABLE;
  hsram1.Init.MemoryType = FSMC_MEMORY_TYPE_SRAM;
  hsram1.Init.MemoryDataWidth = FSMC_NORSRAM_MEM_BUS_WIDTH_16;
  hsram1.Init.BurstAccessMode = FSMC_BURST_ACCESS_MODE_DISABLE;
  hsram1.Init.WaitSignalPolarity = FSMC_WAIT_SIGNAL_POLARITY_LOW;
  hsram1.Init.WrapMode = FSMC_WRAP_MODE_DISABLE;
  hsram1.Init.WaitSignalActive = FSMC_WAIT_TIMING_BEFORE_WS;
  hsram1.Init.WriteOperation = FSMC_WRITE_OPERATION_ENABLE;
  hsram1.Init.WaitSignal = FSMC_WAIT_SIGNAL_DISABLE;
  hsram1.Init.ExtendedMode = FSMC_EXTENDED_MODE_DISABLE;
  hsram1.Init.AsynchronousWait = FSMC_ASYNCHRONOUS_WAIT_DISABLE;
  hsram1.Init.WriteBurst = FSMC_WRITE_BURST_DISABLE;
  hsram1.Init.PageSize = FSMC_PAGE_SIZE_NONE;
  /* Timing */
  Timing.AddressSetupTime = 5;
  Timing.AddressHoldTime = 15;
  Timing.DataSetupTime = 9;
  Timing.BusTurnAroundDuration = 0;
  Timing.CLKDivision = 16;
  Timing.DataLatency = 17;
  Timing.AccessMode = FSMC_ACCESS_MODE_A;
  /* ExtTiming */

  if (HAL_SRAM_Init(&hsram1, &Timing, NULL) != HAL_OK)
  {
    Error_Handler( );
  }

  /* USER CODE BEGIN FSMC_Init 2 */

  /* USER CODE END FSMC_Init 2 */
}

/* USER CODE BEGIN 4 */
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
  GPS_RxCallback(huart);
  Ultrasonic_RxCallback(huart);
}

void HAL_UART_ErrorCallback(UART_HandleTypeDef *huart)
{
  if (huart->Instance == USART6)
  {
    Ultrasonic_Init();
  }

  if (huart->Instance == USART3)
  {
    GPS_Init();
  }
}
/* USER CODE END 4 */

/**
  * @brief  This function is executed in case of error occurrence.
  * @retval None
  */
void Error_Handler(void)
{
  /* USER CODE BEGIN Error_Handler_Debug */
  /* User can add his own implementation to report the HAL error return state */
  __disable_irq();
  while (1)
  {
  }
  /* USER CODE END Error_Handler_Debug */
}

#ifdef  USE_FULL_ASSERT
/**
  * @brief  Reports the name of the source file and the source line number
  *         where the assert_param error has occurred.
  * @param  file: pointer to the source file name
  * @param  line: assert_param error line source number
  * @retval None
  */
void assert_failed(uint8_t *file, uint32_t line)
{
  /* USER CODE BEGIN 6 */
  /* User can add his own implementation to report the file name and line number,
     ex: printf("Wrong parameters value: file %s on line %d\r\n", file, line) */
  /* USER CODE END 6 */
}
#endif /* USE_FULL_ASSERT */
