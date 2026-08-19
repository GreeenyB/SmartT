#ifndef INC_LCD_H_
#define INC_LCD_H_

#include "main.h"
#include <stdint.h>

#define LCD_WIDTH   320
#define LCD_HEIGHT  240

#define LCD_BLACK   0x0000
#define LCD_WHITE   0xFFFF
#define LCD_RED     0xF800
#define LCD_GREEN   0x07E0
#define LCD_BLUE    0x001F
#define LCD_YELLOW  0xFFE0
#define LCD_CYAN    0x07FF
#define LCD_GRAY    0x8410

void LCD_Init(void);
void LCD_SetWindow(uint16_t x0, uint16_t y0,
                   uint16_t x1, uint16_t y1);
void LCD_Fill(uint16_t color);

void LCD_DrawPixel(uint16_t x, uint16_t y, uint16_t color);
void LCD_FillRect(uint16_t x, uint16_t y,
                  uint16_t w, uint16_t h,
                  uint16_t color);

void LCD_DrawChar(uint16_t x, uint16_t y,
                  char c,
                  uint16_t color,
                  uint16_t bg,
                  uint8_t scale);

void LCD_DrawString(uint16_t x, uint16_t y,
                    const char *str,
                    uint16_t color,
                    uint16_t bg,
                    uint8_t scale);

void SmartT_DrawDashboard(void);
void SmartT_UpdateDashboard(float fuel,
                            int rpm,
                            int speed,
                            float tilt,
                            const char *state,
                            const char *event,
                            const char *cloud);

#endif
