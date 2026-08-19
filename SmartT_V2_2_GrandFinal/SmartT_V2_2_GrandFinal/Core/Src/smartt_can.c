#include "smartt_can.h"
#include "smartt_config.h"

#include <string.h>

static SmartT_CAN_Data_t can_data;
static uint32_t last_poll_ms = 0U;
static uint8_t poll_index = 0U;

/* Mode 01 PIDs:
 * 0x0C RPM, 0x0D speed, 0x04 engine load, 0x2F fuel level,
 * 0x5E engine fuel rate (L/h, if ECU supports it).
 * Unsupported PIDs simply never become valid. */
static const uint8_t obd_pids[] = {0x0CU, 0x0DU, 0x04U, 0x2FU, 0x5EU};

static void SmartT_CAN_ParseObdResponse(const CAN_RxHeaderTypeDef *header,
                                        const uint8_t data[8],
                                        uint32_t now_ms)
{
    if ((header == NULL) || (data == NULL))
        return;

    if ((header->IDE != CAN_ID_STD) ||
        (header->StdId < 0x7E8U) ||
        (header->StdId > 0x7EFU) ||
        (header->DLC < 4U))
    {
        return;
    }

    if ((data[1] != 0x41U) || (data[0] < 0x03U))
        return;

    switch (data[2])
    {
        case 0x0CU: /* Engine RPM: ((A*256)+B)/4 */
            if (header->DLC >= 5U)
            {
                can_data.rpm = (float)(((uint16_t)data[3] << 8) | data[4]) / 4.0f;
                can_data.rpm_valid = 1U;
                can_data.rpm_update_ms = now_ms;
            }
            break;

        case 0x0DU: /* Vehicle speed: km/h */
            can_data.speed_kmh = (float)data[3];
            can_data.speed_valid = 1U;
            can_data.speed_update_ms = now_ms;
            break;

        case 0x04U: /* Calculated engine load */
            can_data.engine_load_pct = ((float)data[3] * 100.0f) / 255.0f;
            can_data.engine_load_valid = 1U;
            can_data.engine_load_update_ms = now_ms;
            break;

        case 0x2FU: /* ECU-reported fuel level */
            can_data.ecu_fuel_level_pct = ((float)data[3] * 100.0f) / 255.0f;
            can_data.ecu_fuel_level_valid = 1U;
            can_data.fuel_level_update_ms = now_ms;
            break;

        case 0x5EU: /* Engine fuel rate: ((A*256)+B) / 20 [L/h] */
            if (header->DLC >= 5U)
            {
                can_data.fuel_rate_lph =
                    (float)(((uint16_t)data[3] << 8) | data[4]) / 20.0f;
                can_data.fuel_rate_valid = 1U;
                can_data.fuel_rate_update_ms = now_ms;
            }
            break;

        default:
            break;
    }

    can_data.last_rx_ms = now_ms;
}

static void SmartT_CAN_DrainRx(CAN_HandleTypeDef *hcan, uint32_t now_ms)
{
    while (HAL_CAN_GetRxFifoFillLevel(hcan, CAN_RX_FIFO0) > 0U)
    {
        CAN_RxHeaderTypeDef header;
        uint8_t data[8] = {0};

        if (HAL_CAN_GetRxMessage(hcan, CAN_RX_FIFO0, &header, data) != HAL_OK)
            break;

        can_data.rx_frames++;
        SmartT_CAN_ParseObdResponse(&header, data, now_ms);
    }
}

static HAL_StatusTypeDef SmartT_CAN_SendObdPid(CAN_HandleTypeDef *hcan,
                                                uint8_t pid)
{
    CAN_TxHeaderTypeDef header;
    uint8_t data[8] = {0x02U, 0x01U, pid, 0U, 0U, 0U, 0U, 0U};
    uint32_t mailbox = 0U;

    memset(&header, 0, sizeof(header));
    header.StdId = 0x7DFU;
    header.IDE = CAN_ID_STD;
    header.RTR = CAN_RTR_DATA;
    header.DLC = 8U;
    header.TransmitGlobalTime = DISABLE;

    if (HAL_CAN_GetTxMailboxesFreeLevel(hcan) == 0U)
        return HAL_BUSY;

    return HAL_CAN_AddTxMessage(hcan, &header, data, &mailbox);
}

HAL_StatusTypeDef SmartT_CAN_Init(CAN_HandleTypeDef *hcan)
{
    memset(&can_data, 0, sizeof(can_data));
    last_poll_ms = HAL_GetTick();
    poll_index = 0U;

#if SMARTT_CAN_MODE == SMARTT_CAN_MODE_DISABLED
    (void)hcan;
    can_data.enabled = 0U;
    return HAL_OK;
#else
    if (hcan == NULL)
        return HAL_ERROR;

    CAN_FilterTypeDef filter;
    memset(&filter, 0, sizeof(filter));

    /* Accept all frames to FIFO0; parsing remains strict. */
    filter.FilterBank = 0U;
    filter.FilterMode = CAN_FILTERMODE_IDMASK;
    filter.FilterScale = CAN_FILTERSCALE_32BIT;
    filter.FilterIdHigh = 0U;
    filter.FilterIdLow = 0U;
    filter.FilterMaskIdHigh = 0U;
    filter.FilterMaskIdLow = 0U;
    filter.FilterFIFOAssignment = CAN_FILTER_FIFO0;
    filter.FilterActivation = ENABLE;
    filter.SlaveStartFilterBank = 14U;

    if (HAL_CAN_ConfigFilter(hcan, &filter) != HAL_OK)
        return HAL_ERROR;

    if (HAL_CAN_Start(hcan) != HAL_OK)
        return HAL_ERROR;

    can_data.enabled = 1U;
    can_data.bus_started = 1U;
    return HAL_OK;
#endif
}

void SmartT_CAN_Process(CAN_HandleTypeDef *hcan, uint32_t now_ms)
{
#if SMARTT_CAN_MODE == SMARTT_CAN_MODE_DISABLED
    (void)hcan;
    (void)now_ms;
#else
    if ((hcan == NULL) || !can_data.bus_started)
        return;

    SmartT_CAN_DrainRx(hcan, now_ms);

    if ((now_ms - last_poll_ms) >= SMARTT_CAN_POLL_MS)
    {
        last_poll_ms = now_ms;

        if (SmartT_CAN_SendObdPid(hcan, obd_pids[poll_index]) == HAL_OK)
        {
            can_data.tx_requests++;
            poll_index++;
            if (poll_index >= (uint8_t)(sizeof(obd_pids) / sizeof(obd_pids[0])))
                poll_index = 0U;
        }
        else
        {
            can_data.tx_errors++;
        }
    }
#endif
}

void SmartT_CAN_GetSnapshot(SmartT_CAN_Data_t *out)
{
    if (out == NULL)
        return;

    *out = can_data;
}
