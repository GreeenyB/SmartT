#include "gps.h"

#include <string.h>
#include <stdlib.h>

extern UART_HandleTypeDef huart3;

#define GPS_BUFFER_SIZE 128U

static uint8_t gps_rx_byte;
static char gps_buffer[GPS_BUFFER_SIZE];
static uint16_t gps_index = 0U;
static char gps_sentence[GPS_BUFFER_SIZE];
static volatile uint8_t sentence_ready = 0U;
static GPS_Data_t gps_data;

static double GPS_NMEA_ToDecimal(const char *coord)
{
    const double raw = atof(coord);
    const int degree = (int)(raw / 100.0);
    const double minutes = raw - ((double)degree * 100.0);
    return (double)degree + minutes / 60.0;
}

static void GPS_ParseRMC(char *sentence)
{
    char *fields[16] = {0};
    int field_count = 0;
    fields[field_count++] = sentence;

    for (char *p = sentence; (*p != '\0') && (field_count < 16); p++)
    {
        if (*p == ',')
        {
            *p = '\0';
            fields[field_count++] = p + 1;
        }
    }

    if (field_count < 8)
    {
        gps_data.invalid_sentences++;
        return;
    }

    if ((fields[2][0] != 'A') ||
        (fields[3][0] == '\0') || (fields[4][0] == '\0') ||
        (fields[5][0] == '\0') || (fields[6][0] == '\0'))
    {
        gps_data.fix = 0U;
        gps_data.invalid_sentences++;
        return;
    }

    gps_data.latitude = GPS_NMEA_ToDecimal(fields[3]);
    gps_data.longitude = GPS_NMEA_ToDecimal(fields[5]);

    if (fields[4][0] == 'S') gps_data.latitude *= -1.0;
    if (fields[6][0] == 'W') gps_data.longitude *= -1.0;

    gps_data.speed_kmh = (fields[7][0] != '\0') ?
                         ((float)atof(fields[7]) * 1.852f) : 0.0f;

    gps_data.fix = 1U;
    gps_data.last_update_ms = HAL_GetTick();
    gps_data.valid_sentences++;
}

void GPS_Init(void)
{
    memset(&gps_data, 0, sizeof(gps_data));
    gps_index = 0U;
    sentence_ready = 0U;
    (void)HAL_UART_Receive_IT(&huart3, &gps_rx_byte, 1U);
}

void GPS_RxCallback(UART_HandleTypeDef *huart)
{
    if ((huart == NULL) || (huart->Instance != USART3))
        return;

    const char c = (char)gps_rx_byte;

    if (c == '\n')
    {
        if (gps_index > 0U)
        {
            gps_buffer[gps_index] = '\0';

            if (!sentence_ready)
            {
                strncpy(gps_sentence, gps_buffer, GPS_BUFFER_SIZE - 1U);
                gps_sentence[GPS_BUFFER_SIZE - 1U] = '\0';
                sentence_ready = 1U;
            }
            gps_index = 0U;
        }
    }
    else if (c != '\r')
    {
        if (gps_index < (GPS_BUFFER_SIZE - 1U))
        {
            gps_buffer[gps_index++] = c;
        }
        else
        {
            gps_index = 0U;
            gps_data.invalid_sentences++;
        }
    }

    (void)HAL_UART_Receive_IT(&huart3, &gps_rx_byte, 1U);
}

void GPS_Process(void)
{
    if (!sentence_ready)
        return;

    char sentence[GPS_BUFFER_SIZE];
    strncpy(sentence, gps_sentence, GPS_BUFFER_SIZE - 1U);
    sentence[GPS_BUFFER_SIZE - 1U] = '\0';
    sentence_ready = 0U;

    if ((strncmp(sentence, "$GPRMC", 6U) == 0) ||
        (strncmp(sentence, "$GNRMC", 6U) == 0))
    {
        GPS_ParseRMC(sentence);
    }
}

void GPS_GetSnapshot(GPS_Data_t *out)
{
    if (out == NULL)
        return;
    *out = gps_data;
}
