#include "ultrasonic.h"
#include "smartt_config.h"

#include <string.h>

extern UART_HandleTypeDef huart6;

static uint8_t us_rx_byte;
static uint8_t us_frame[4];
static uint8_t us_index = 0U;
static volatile Ultrasonic_Data_t us_data;

/* ================================================================
 * DYP A02 UART AUTOMATIC receive path
 *
 * Purchased SmartT sensor: UART automatic output.  Therefore USART6 is
 * RX-only and STM32 never transmits the 0x55 trigger used by the
 * UART-controlled variant.
 *
 * Expected frame format retained from the verified project protocol:
 *   [0] 0xFF
 *   [1] distance high byte
 *   [2] distance low byte
 *   [3] checksum = (0xFF + H + L) & 0xFF
 *
 * Once a header is acquired, the parser consumes exactly the next three
 * bytes.  It does NOT reinterpret an in-frame 0xFF as a new header because
 * a valid low distance byte may itself equal 0xFF.  A checksum failure
 * simply drops that frame and resynchronizes on the next header.
 * ================================================================ */

void Ultrasonic_Init(void)
{
    const uint32_t primask = __get_PRIMASK();
    __disable_irq();
    memset((void *)&us_data, 0, sizeof(us_data));
    us_index = 0U;
    if (!primask) __enable_irq();

    (void)HAL_UART_Receive_IT(&huart6, &us_rx_byte, 1U);
}

void Ultrasonic_Process(void)
{
    /* Automatic UART mode is stream-driven. No trigger is transmitted. */
}

void Ultrasonic_RxCallback(UART_HandleTypeDef *huart)
{
    if ((huart == NULL) || (huart->Instance != USART6))
        return;

    if (us_index == 0U)
    {
        if (us_rx_byte == 0xFFU)
        {
            us_frame[0] = 0xFFU;
            us_index = 1U;
        }
        else
        {
            us_data.framing_resyncs++;
        }
    }
    else
    {
        us_frame[us_index++] = us_rx_byte;

        if (us_index >= 4U)
        {
            const uint8_t checksum =
                (uint8_t)(us_frame[0] + us_frame[1] + us_frame[2]);

            if (checksum == us_frame[3])
            {
                const uint16_t distance =
                    (uint16_t)(((uint16_t)us_frame[1] << 8) | us_frame[2]);

                if ((distance >= SMARTT_US_MIN_MM) &&
                    (distance <= SMARTT_US_MAX_MM))
                {
                    us_data.distance_mm = distance;
                    us_data.valid = 1U;
                    us_data.last_update_ms = HAL_GetTick();
                    us_data.frame_seq++;
                    us_data.valid_frames++;
                }
                else
                {
                    us_data.range_errors++;
                }
            }
            else
            {
                us_data.checksum_errors++;
            }

            us_index = 0U;
        }
    }

    (void)HAL_UART_Receive_IT(&huart6, &us_rx_byte, 1U);
}

void Ultrasonic_GetSnapshot(Ultrasonic_Data_t *out)
{
    if (out == NULL)
        return;

    const uint32_t primask = __get_PRIMASK();
    __disable_irq();
    memcpy(out, (const void *)&us_data, sizeof(*out));
    if (!primask) __enable_irq();

    if (out->last_update_ms == 0U)
        out->valid = 0U;
}
