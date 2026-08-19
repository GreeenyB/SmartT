#include "lcd.h"
#include <stdio.h>
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
void SmartT_DrawDashboard(void)
{
    LCD_Fill(LCD_BLACK);

    // Header
    LCD_FillRect(0, 0, 320, 30, LCD_BLUE);

    LCD_DrawString(
        8,
        7,
        "SMARTT",
        LCD_WHITE,
        LCD_BLUE,
        2
    );

    LCD_DrawString(
        220,
        10,
        "CAN",
        LCD_WHITE,
        LCD_BLUE,
        1
    );

    // Divider
    LCD_FillRect(
        0,
        31,
        320,
        2,
        LCD_GRAY
    );

    LCD_DrawString(
        10,
        45,
        "FUEL",
        LCD_CYAN,
        LCD_BLACK,
        2
    );

    LCD_DrawString(
        10,
        85,
        "RPM",
        LCD_WHITE,
        LCD_BLACK,
        1
    );

    LCD_DrawString(
        10,
        105,
        "SPEED",
        LCD_WHITE,
        LCD_BLACK,
        1
    );

    LCD_DrawString(
        10,
        125,
        "TILT",
        LCD_WHITE,
        LCD_BLACK,
        1
    );

    LCD_FillRect(
        0,
        150,
        320,
        2,
        LCD_GRAY
    );

    LCD_DrawString(
        10,
        165,
        "STATE",
        LCD_WHITE,
        LCD_BLACK,
        1
    );

    LCD_DrawString(
        10,
        185,
        "EVENT",
        LCD_WHITE,
        LCD_BLACK,
        1
    );

    LCD_DrawString(
        10,
        205,
        "CLOUD",
        LCD_WHITE,
        LCD_BLACK,
        1
    );
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

    /*
     * CAN status is owned by main.c.
     * Do not redraw it here, otherwise WAIT/ONLINE alternates visibly.
     */

    /*
     * Fuel
     */
    LCD_FillRect(
        120,
        40,
        190,
        35,
        LCD_BLACK
    );

    if (fuel < 0.0f)
    {
        LCD_DrawString(
            120,
            45,
            "CALIB",
            LCD_YELLOW,
            LCD_BLACK,
            2
        );
    }
    else
    {
        snprintf(
            buffer,
            sizeof(buffer),
            "%.1f%%",
            fuel
        );

        LCD_DrawString(
            120,
            45,
            buffer,
            LCD_YELLOW,
            LCD_BLACK,
            2
        );
    }

    /*
     * RPM
     */
    LCD_FillRect(110, 82, 200, 14, LCD_BLACK);

    if (rpm < 0)
    {
        LCD_DrawString(
            110,
            85,
            "N/A",
            LCD_GRAY,
            LCD_BLACK,
            1
        );
    }
    else
    {
        snprintf(
            buffer,
            sizeof(buffer),
            "%d",
            rpm
        );

        LCD_DrawString(
            110,
            85,
            buffer,
            LCD_WHITE,
            LCD_BLACK,
            1
        );
    }

    /*
     * Speed
     */
    LCD_FillRect(110, 102, 200, 14, LCD_BLACK);

    snprintf(
        buffer,
        sizeof(buffer),
        "%d KMH",
        speed
    );

    LCD_DrawString(
        110,
        105,
        buffer,
        LCD_WHITE,
        LCD_BLACK,
        1
    );

    /*
     * Tilt
     */
    LCD_FillRect(110, 122, 200, 14, LCD_BLACK);

    /* Avoid floating-point printf dependency in newlib-nano.
     * main.c passes a non-negative tilt magnitude.
     */
    int tilt_x10 = (int)(tilt * 10.0f + 0.5f);
    int tilt_whole = tilt_x10 / 10;
    int tilt_decimal = tilt_x10 % 10;

    snprintf(
        buffer,
        sizeof(buffer),
        "%d.%d DEG",
        tilt_whole,
        tilt_decimal
    );

    LCD_DrawString(
        110,
        125,
        buffer,
        LCD_WHITE,
        LCD_BLACK,
        1
    );

    /*
     * State
     */
    LCD_FillRect(110, 162, 200, 14, LCD_BLACK);

    LCD_DrawString(
        110,
        165,
        state,
        LCD_CYAN,
        LCD_BLACK,
        1
    );

    /*
     * Event
     */
    LCD_FillRect(110, 182, 200, 14, LCD_BLACK);

    LCD_DrawString(
        110,
        185,
        event,
        LCD_GREEN,
        LCD_BLACK,
        1
    );

    /*
     * Cloud
     */
    LCD_FillRect(110, 202, 200, 14, LCD_BLACK);

    LCD_DrawString(
        110,
        205,
        cloud,
        LCD_GREEN,
        LCD_BLACK,
        1
    );
}
