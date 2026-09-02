#include "lcd.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * FSMC Bank1 NE1 base = 0x60000000
 * LCD RS/DC = A18
 * Bus width = 16-bit
 */
#define LCD_REG   (*((volatile uint16_t *)0x60000000U))
#define LCD_RAM   (*((volatile uint16_t *)0x60080000U))

static void LCD_WriteCommand(uint16_t cmd)
{
    LCD_REG = cmd;
}

static void LCD_WriteData(uint16_t data)
{
    LCD_RAM = data;
}

static void LCD_WriteCommandData(uint16_t cmd, uint16_t data)
{
    LCD_WriteCommand(cmd);
    LCD_WriteData(data);
}

void LCD_Init(void)
{
    HAL_Delay(100);

    /* Software Reset */
    LCD_WriteCommand(0x01);
    HAL_Delay(150);

    /* Display OFF */
    LCD_WriteCommand(0x28);

    /* Pixel Format: RGB565 / 16-bit */
    LCD_WriteCommandData(0x3A, 0x55);

    /*
     * Memory Access Control
     * MV + BGR
     * Landscape 320x240
     */
    LCD_WriteCommandData(0x36, 0x28);

    /* Sleep OUT */
    LCD_WriteCommand(0x11);
    HAL_Delay(150);

    /* Display ON */
    LCD_WriteCommand(0x29);
    HAL_Delay(50);
}

void LCD_SetWindow(uint16_t x0, uint16_t y0,
                   uint16_t x1, uint16_t y1)
{
    /* Column Address Set */
    LCD_WriteCommand(0x2A);

    LCD_WriteData(x0 >> 8);
    LCD_WriteData(x0 & 0xFF);

    LCD_WriteData(x1 >> 8);
    LCD_WriteData(x1 & 0xFF);

    /* Page Address Set */
    LCD_WriteCommand(0x2B);

    LCD_WriteData(y0 >> 8);
    LCD_WriteData(y0 & 0xFF);

    LCD_WriteData(y1 >> 8);
    LCD_WriteData(y1 & 0xFF);

    /* Memory Write */
    LCD_WriteCommand(0x2C);
}

void LCD_Fill(uint16_t color)
{
    uint32_t total;

    LCD_SetWindow(
        0,
        0,
        LCD_WIDTH - 1,
        LCD_HEIGHT - 1
    );

    total = (uint32_t)LCD_WIDTH * LCD_HEIGHT;

    while (total--)
    {
        LCD_RAM = color;
    }
}
/*
 * Font 5x7
 * Hỗ trợ:
 * 0-9, A-Z, space, :, ., -, %
 */

static const uint8_t font_digit[10][5] =
{
    {0x3E,0x51,0x49,0x45,0x3E}, // 0
    {0x00,0x42,0x7F,0x40,0x00}, // 1
    {0x42,0x61,0x51,0x49,0x46}, // 2
    {0x21,0x41,0x45,0x4B,0x31}, // 3
    {0x18,0x14,0x12,0x7F,0x10}, // 4
    {0x27,0x45,0x45,0x45,0x39}, // 5
    {0x3C,0x4A,0x49,0x49,0x30}, // 6
    {0x01,0x71,0x09,0x05,0x03}, // 7
    {0x36,0x49,0x49,0x49,0x36}, // 8
    {0x06,0x49,0x49,0x29,0x1E}  // 9
};

static const uint8_t font_upper[26][5] =
{
    {0x7E,0x11,0x11,0x11,0x7E}, // A
    {0x7F,0x49,0x49,0x49,0x36}, // B
    {0x3E,0x41,0x41,0x41,0x22}, // C
    {0x7F,0x41,0x41,0x22,0x1C}, // D
    {0x7F,0x49,0x49,0x49,0x41}, // E
    {0x7F,0x09,0x09,0x09,0x01}, // F
    {0x3E,0x41,0x49,0x49,0x7A}, // G
    {0x7F,0x08,0x08,0x08,0x7F}, // H
    {0x00,0x41,0x7F,0x41,0x00}, // I
    {0x20,0x40,0x41,0x3F,0x01}, // J
    {0x7F,0x08,0x14,0x22,0x41}, // K
    {0x7F,0x40,0x40,0x40,0x40}, // L
    {0x7F,0x02,0x0C,0x02,0x7F}, // M
    {0x7F,0x04,0x08,0x10,0x7F}, // N
    {0x3E,0x41,0x41,0x41,0x3E}, // O
    {0x7F,0x09,0x09,0x09,0x06}, // P
    {0x3E,0x41,0x51,0x21,0x5E}, // Q
    {0x7F,0x09,0x19,0x29,0x46}, // R
    {0x46,0x49,0x49,0x49,0x31}, // S
    {0x01,0x01,0x7F,0x01,0x01}, // T
    {0x3F,0x40,0x40,0x40,0x3F}, // U
    {0x1F,0x20,0x40,0x20,0x1F}, // V
    {0x3F,0x40,0x38,0x40,0x3F}, // W
    {0x63,0x14,0x08,0x14,0x63}, // X
    {0x07,0x08,0x70,0x08,0x07}, // Y
    {0x61,0x51,0x49,0x45,0x43}  // Z
};

static void Font_Get(char c, uint8_t out[5])
{
    memset(out, 0, 5);

    if (c >= 'a' && c <= 'z')
        c -= 32;

    if (c >= '0' && c <= '9')
    {
        memcpy(out, font_digit[c - '0'], 5);
        return;
    }

    if (c >= 'A' && c <= 'Z')
    {
        memcpy(out, font_upper[c - 'A'], 5);
        return;
    }

    switch (c)
    {
        case ' ':
            break;

        case ':':
            out[2] = 0x36;
            break;

        case '.':
            out[2] = 0x60;
            break;

        case '-':
            out[0] = 0x08;
            out[1] = 0x08;
            out[2] = 0x08;
            out[3] = 0x08;
            out[4] = 0x08;
            break;

        case '%':
            out[0] = 0x63;
            out[1] = 0x13;
            out[2] = 0x08;
            out[3] = 0x64;
            out[4] = 0x63;
            break;

        default:
            break;
    }
}

void LCD_DrawPixel(uint16_t x,
                   uint16_t y,
                   uint16_t color)
{
    if (x >= LCD_WIDTH || y >= LCD_HEIGHT)
        return;

    LCD_SetWindow(x, y, x, y);
    LCD_RAM = color;
}

void LCD_FillRect(uint16_t x,
                  uint16_t y,
                  uint16_t w,
                  uint16_t h,
                  uint16_t color)
{
    if (x >= LCD_WIDTH || y >= LCD_HEIGHT)
        return;

    if ((x + w) > LCD_WIDTH)
        w = LCD_WIDTH - x;

    if ((y + h) > LCD_HEIGHT)
        h = LCD_HEIGHT - y;

    LCD_SetWindow(x, y, x + w - 1, y + h - 1);

    uint32_t total = (uint32_t)w * h;

    while (total--)
        LCD_RAM = color;
}

void LCD_DrawChar(uint16_t x,
                  uint16_t y,
                  char c,
                  uint16_t color,
                  uint16_t bg,
                  uint8_t scale)
{
    uint8_t bitmap[5];

    Font_Get(c, bitmap);

    for (uint8_t col = 0; col < 5; col++)
    {
        for (uint8_t row = 0; row < 7; row++)
        {
            uint16_t pixelColor =
                (bitmap[col] & (1 << row))
                ? color
                : bg;

            LCD_FillRect(
                x + col * scale,
                y + row * scale,
                scale,
                scale,
                pixelColor
            );
        }
    }

    LCD_FillRect(
        x + 5 * scale,
        y,
        scale,
        7 * scale,
        bg
    );
}

void LCD_DrawString(uint16_t x,
                    uint16_t y,
                    const char *str,
                    uint16_t color,
                    uint16_t bg,
                    uint8_t scale)
{
    while (*str)
    {
        LCD_DrawChar(
            x,
            y,
            *str,
            color,
            bg,
            scale
        );

        x += 6 * scale;
        str++;

        if (x >= LCD_WIDTH - 6 * scale)
            break;
    }
}

static void LCD_DrawInset(uint16_t x,
                          uint16_t y,
                          uint16_t w,
                          uint16_t h,
                          uint16_t fill,
                          uint16_t border)
{
    LCD_FillRect(x, y, w, h, fill);
    LCD_FillRect(x, y, w, 1, border);
    LCD_FillRect(x, y + h - 1, w, 1, border);
    LCD_FillRect(x, y, 1, h, border);
    LCD_FillRect(x + w - 1, y, 1, h, border);
}

static void LCD_DrawHBar(uint16_t x,
                         uint16_t y,
                         uint16_t w,
                         uint16_t h,
                         uint8_t pct,
                         uint16_t fg,
                         uint16_t bg)
{
    if (pct > 100U)
        pct = 100U;

    LCD_FillRect(x, y, w, h, bg);

    if (pct > 0U)
    {
        const uint16_t fw = (uint16_t)(((uint32_t)w * pct) / 100U);

        if (fw > 0U)
            LCD_FillRect(x, y, fw, h, fg);
    }
}

static uint16_t LCD_Lerp565(uint16_t c0, uint16_t c1, uint8_t t)
{
    const uint8_t r0 = (uint8_t)((c0 >> 11) & 0x1FU);
    const uint8_t g0 = (uint8_t)((c0 >> 5) & 0x3FU);
    const uint8_t b0 = (uint8_t)(c0 & 0x1FU);
    const uint8_t r1 = (uint8_t)((c1 >> 11) & 0x1FU);
    const uint8_t g1 = (uint8_t)((c1 >> 5) & 0x3FU);
    const uint8_t b1 = (uint8_t)(c1 & 0x1FU);
    const uint8_t r = (uint8_t)((int16_t)r0 +
                               (((int16_t)r1 - (int16_t)r0) * (int16_t)t) / 255);
    const uint8_t g = (uint8_t)((int16_t)g0 +
                               (((int16_t)g1 - (int16_t)g0) * (int16_t)t) / 255);
    const uint8_t b = (uint8_t)((int16_t)b0 +
                               (((int16_t)b1 - (int16_t)b0) * (int16_t)t) / 255);

    return (uint16_t)(((uint16_t)r << 11) | ((uint16_t)g << 5) | (uint16_t)b);
}

static uint16_t SmartT_FuelColor(float fuel_pct)
{
    static const uint16_t stops[5] =
    {
        LCD_FUEL_CRIT,
        LCD_FUEL_LOW,
        LCD_FUEL_MID,
        LCD_FUEL_HIGH,
        LCD_FUEL_FULL,
    };

    uint8_t pct;
    uint8_t seg;
    uint8_t seg_start;
    uint8_t local;

    if (fuel_pct < 0.0f)
        return LCD_YELLOW;

    if (fuel_pct > 100.0f)
        fuel_pct = 100.0f;

    pct = (uint8_t)(fuel_pct + 0.5f);
    seg = (uint8_t)((pct * 4U) / 100U);

    if (seg >= 4U)
        return stops[4];

    seg_start = (uint8_t)(seg * 25U);
    local = (uint8_t)(((uint16_t)(pct - seg_start) * 255U) / 25U);

    return LCD_Lerp565(stops[seg], stops[seg + 1U], local);
}

static void LCD_DrawFuelGradientBar(uint16_t x,
                                    uint16_t y,
                                    uint16_t w,
                                    uint16_t h,
                                    float fuel)
{
    const uint8_t bands = 16U;
    uint8_t pct = 0U;
    uint16_t fw;
    uint8_t b;

    if (fuel > 0.0f)
        pct = (uint8_t)(fuel + 0.5f);

    fw = (uint16_t)(((uint32_t)w * pct) / 100U);

    LCD_FillRect(x, y, w, h, LCD_BRAND_TRACK);

    if (pct == 0U || fw == 0U)
        return;

    for (b = 0U; b < bands; b++)
    {
        const uint16_t bx0 = (uint16_t)(x + ((uint32_t)fw * b) / bands);
        uint16_t bx1 = (uint16_t)(x + ((uint32_t)fw * (b + 1U)) / bands);
        const uint8_t level = (uint8_t)(((uint32_t)(bx1 - x) * 100U) / w);
        uint16_t bw;

        if (bx0 >= x + fw)
            break;

        if (bx1 > x + fw)
            bx1 = (uint16_t)(x + fw);

        bw = (uint16_t)(bx1 - bx0);
        if (bw == 0U)
            continue;

        LCD_FillRect(bx0, y, bw, h, SmartT_FuelColor((float)level));
    }

    if (fw < w)
    {
        LCD_FillRect((uint16_t)(x + fw - 1U), (uint16_t)(y - 1U),
                     2U, (uint16_t)(h + 2U),
                     SmartT_FuelColor(fuel));
    }
}

static uint8_t SmartT_IsAlertEvent(const char *event)
{
    if (event == NULL)
        return 0U;

    if (strstr(event, "THEFT") != NULL)
        return 1U;
    if (strstr(event, "SUSPICIOUS") != NULL)
        return 1U;
    if (strstr(event, "FAULT") != NULL)
        return 1U;
    if (strstr(event, "QUALITY") != NULL)
        return 1U;
    if (strstr(event, "DROP") != NULL)
        return 1U;

    return 0U;
}

static uint8_t SmartT_ParseSensorQuality(const char *sensor)
{
    const char *qmark;

    if (sensor == NULL)
        return 0U;

    qmark = strstr(sensor, " Q");
    if (qmark == NULL)
        return 0U;

    return (uint8_t)atoi(qmark + 2);
}

static uint8_t SmartT_IsVerified(float fuel,
                                 const char *event,
                                 const char *sensor)
{
    const uint8_t quality = SmartT_ParseSensorQuality(sensor);

    if (fuel < 0.0f)
        return 0U;

    if (SmartT_IsAlertEvent(event))
        return 0U;

    if (quality < 70U)
        return 0U;

    return 1U;
}

static void SmartT_DrawTrustBadge(uint8_t verified, uint8_t alert)
{
    LCD_FillRect(206, 7, 108, 17, LCD_BRAND_PANEL);

    if (alert)
    {
        LCD_FillRect(212, 13, 5, 5, LCD_BRAND_ALERT_EDGE);
        LCD_DrawString(220, 10, "ALERT", LCD_RED, LCD_BRAND_PANEL, 1);
        return;
    }

    if (verified)
    {
        LCD_FillRect(212, 13, 5, 5, LCD_BRAND_SIGNAL);
        LCD_DrawString(220, 10, "VERIFIED", LCD_BRAND_SIGNAL, LCD_BRAND_PANEL, 1);
        return;
    }

    LCD_FillRect(212, 13, 5, 5, LCD_BRAND_GOLD_DIM);
    LCD_DrawString(220, 10, "PENDING", LCD_BRAND_MUTED, LCD_BRAND_PANEL, 1);
}

static uint16_t SmartT_EventColor(const char *event)
{
    if (event == NULL)
        return LCD_BRAND_SIGNAL;

    if (strstr(event, "THEFT") != NULL ||
        strstr(event, "SUSPICIOUS") != NULL ||
        strstr(event, "FAULT") != NULL)
        return LCD_RED;

    if (strstr(event, "REFUEL") != NULL)
        return LCD_GREEN;

    if (strstr(event, "SLOSH") != NULL ||
        strstr(event, "DROP") != NULL ||
        strstr(event, "QUALITY") != NULL ||
        strstr(event, "CALIB") != NULL)
        return LCD_YELLOW;

    return LCD_BRAND_SIGNAL;
}

void SmartT_DrawDashboard(void)
{
    LCD_Fill(LCD_BRAND_INK);

    /* Premium bezel frame */
    LCD_FillRect(3, 3, 314, 234, LCD_BRAND_NAVY);
    LCD_FillRect(3, 3, 314, 1, LCD_BRAND_BORDER);
    LCD_FillRect(3, 236, 314, 1, LCD_BRAND_BORDER);
    LCD_FillRect(3, 3, 1, 234, LCD_BRAND_BORDER);
    LCD_FillRect(316, 3, 1, 234, LCD_BRAND_BORDER);

    /* Header */
    LCD_FillRect(8, 8, 304, 20, LCD_BRAND_PANEL);
    LCD_DrawString(14, 9, "SMARTT", LCD_BRAND_GOLD, LCD_BRAND_PANEL, 2);
    LCD_DrawString(86, 14, "FLEET INTEL", LCD_BRAND_GOLD_LIGHT, LCD_BRAND_PANEL, 1);

    LCD_FillRect(8, 30, 304, 1, LCD_BRAND_LINE);
    LCD_FillRect(8, 30, 96, 1, LCD_BRAND_SIGNAL);

    /* Fuel hero card */
    LCD_DrawInset(10, 36, 300, 72, LCD_BRAND_ELEVATED, LCD_BRAND_BORDER);
    LCD_DrawString(18, 42, "FUEL LEVEL", LCD_BRAND_GOLD_LIGHT, LCD_BRAND_ELEVATED, 1);
    LCD_DrawString(196, 42, "TRUST SIGNAL", LCD_WHITE, LCD_BRAND_ELEVATED, 1);

    /* Metric tiles */
    LCD_DrawInset(10, 114, 96, 42, LCD_BRAND_SURFACE, LCD_BRAND_BORDER);
    LCD_DrawString(38, 120, "RPM", LCD_BRAND_GOLD_LIGHT, LCD_BRAND_SURFACE, 1);

    LCD_DrawInset(112, 114, 96, 42, LCD_BRAND_SURFACE, LCD_BRAND_BORDER);
    LCD_DrawString(132, 120, "SPEED", LCD_BRAND_GOLD_LIGHT, LCD_BRAND_SURFACE, 1);

    LCD_DrawInset(214, 114, 96, 42, LCD_BRAND_SURFACE, LCD_BRAND_BORDER);
    LCD_DrawString(242, 120, "TILT", LCD_BRAND_GOLD_LIGHT, LCD_BRAND_SURFACE, 1);

    /* Integrity panel */
    LCD_DrawInset(10, 162, 300, 46, LCD_BRAND_ELEVATED, LCD_BRAND_BORDER);
    LCD_DrawString(18, 168, "CONTEXT", LCD_WHITE, LCD_BRAND_ELEVATED, 1);
    LCD_DrawString(18, 182, "EVENT", LCD_BRAND_MUTED, LCD_BRAND_ELEVATED, 1);
    LCD_DrawString(18, 196, "SENSOR", LCD_WHITE, LCD_BRAND_ELEVATED, 1);

    /* Footer */
    LCD_FillRect(8, 212, 304, 24, LCD_BRAND_PANEL);
    LCD_FillRect(8, 212, 304, 1, LCD_BRAND_SIGNAL);
    LCD_DrawString(14, 218, "POSITION", LCD_BRAND_GOLD_LIGHT, LCD_BRAND_PANEL, 1);
}

void SmartT_UpdateDashboard(float fuel,
                            int rpm,
                            int speed,
                            float tilt,
                            const char *state,
                            const char *event,
                            const char *cloud)
{
    char buffer[32];
    const uint16_t fuel_color = SmartT_FuelColor(fuel);
    const uint8_t alert = SmartT_IsAlertEvent(event);
    const uint8_t verified = SmartT_IsVerified(fuel, event, cloud);

    SmartT_DrawTrustBadge(verified, alert);

    /* Hero fuel value — same color as bar tip */
    LCD_FillRect(18, 54, 284, 38, LCD_BRAND_ELEVATED);

    if (fuel < 0.0f)
    {
        LCD_DrawString(18, 56, "CALIB", fuel_color, LCD_BRAND_ELEVATED, 3);
    }
    else
    {
        snprintf(buffer, sizeof(buffer), "%.1f%%", fuel);
        LCD_DrawString(18, 56, buffer, fuel_color, LCD_BRAND_ELEVATED, 3);
    }

    LCD_DrawFuelGradientBar(18, 98, 284, 3, fuel);

    /* Metric values */
    LCD_FillRect(18, 132, 80, 18, LCD_BRAND_SURFACE);
    if (rpm < 0)
        LCD_DrawString(42, 132, "---", LCD_BRAND_MUTED, LCD_BRAND_SURFACE, 2);
    else
    {
        snprintf(buffer, sizeof(buffer), "%d", rpm);
        LCD_DrawString(30, 132, buffer, LCD_WHITE, LCD_BRAND_SURFACE, 2);
    }

    LCD_FillRect(120, 132, 80, 18, LCD_BRAND_SURFACE);
    snprintf(buffer, sizeof(buffer), "%d", speed);
    LCD_DrawString(138, 132, buffer, LCD_WHITE, LCD_BRAND_SURFACE, 2);

    LCD_FillRect(222, 132, 80, 18, LCD_BRAND_SURFACE);
    {
        const int tilt_x10 = (int)(tilt * 10.0f + 0.5f);
        const int tilt_whole = tilt_x10 / 10;
        const int tilt_decimal = tilt_x10 % 10;

        snprintf(buffer, sizeof(buffer), "%d.%d", tilt_whole, tilt_decimal);
        LCD_DrawString(236, 132, buffer, LCD_WHITE, LCD_BRAND_SURFACE, 2);
    }

    /* Integrity rows */
    LCD_FillRect(88, 166, 214, 12, LCD_BRAND_ELEVATED);
    {
        const uint16_t state_color =
            (state != NULL && strstr(state, "IMU FAIL") != NULL)
            ? LCD_RED
            : LCD_WHITE;

        LCD_DrawString(88, 168, state, state_color, LCD_BRAND_ELEVATED, 1);
    }

    LCD_FillRect(10, 180, 300, 12, LCD_BRAND_ELEVATED);
    if (alert)
        LCD_FillRect(10, 180, 3, 12, LCD_BRAND_ALERT_EDGE);

    LCD_FillRect(88, 180, 214, 12, LCD_BRAND_ELEVATED);
    LCD_DrawString(88, 182, event,
                   alert ? LCD_WHITE : SmartT_EventColor(event),
                   LCD_BRAND_ELEVATED, 1);

    LCD_FillRect(88, 194, 214, 12, LCD_BRAND_ELEVATED);
    LCD_DrawString(88, 196, cloud, LCD_WHITE, LCD_BRAND_ELEVATED, 1);
}

void SmartT_UpdateGpsBar(uint8_t fix,
                         const char *lat,
                         const char *lon)
{
    LCD_FillRect(72, 212, 236, 24, LCD_BRAND_PANEL);

    if (fix && lat != NULL && lon != NULL)
    {
        LCD_DrawString(72, 218, lat, LCD_WHITE, LCD_BRAND_PANEL, 1);
        LCD_DrawString(188, 218, lon, LCD_WHITE, LCD_BRAND_PANEL, 1);
    }
    else
    {
        LCD_DrawString(72, 218, "AWAITING FIX", LCD_BRAND_MUTED, LCD_BRAND_PANEL, 1);
    }
}
