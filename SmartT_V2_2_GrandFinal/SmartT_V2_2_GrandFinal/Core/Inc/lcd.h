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

/*
 * SmartT signature palette — curated for TFT readability + brand trust
 *
 * Navy base  : professional, matches website hero
 * Amber gold : primary data (fuel, logo) — warm, premium, high contrast
 * Signal teal: status / trust / sensor — website accent, separates layers
 * White      : secondary metrics (RPM, speed, GPS)
 * Red        : alerts only
 */
#define LCD_BRAND_INK         0x0841U  /* outer bezel              */
#define LCD_BRAND_NAVY        0x1084U  /* main surface             */
#define LCD_BRAND_PANEL       0x18C6U  /* header / footer          */
#define LCD_BRAND_ELEVATED    0x1A0CU  /* inset card fill          */
#define LCD_BRAND_SURFACE     0x2108U  /* metric tile              */
#define LCD_BRAND_GOLD        0xFEA0U  /* primary — fuel, logo     */
#define LCD_BRAND_GOLD_LIGHT  0xFF79U  /* warm labels              */
#define LCD_BRAND_GOLD_DIM    0xC640U  /* low-fuel warning gold    */
#define LCD_BRAND_SIGNAL      0x07F1U  /* trust / status / teal    */
#define LCD_BRAND_SIGNAL_DIM  0x0470U  /* teal hairline / track    */
#define LCD_BRAND_TRACK       0x1A2CU  /* empty fuel-bar track     */
#define LCD_BRAND_MUTED       0x4A69U  /* secondary text           */
#define LCD_BRAND_LINE        0x3186U  /* divider                  */
#define LCD_BRAND_BORDER      0x2965U  /* inset frame              */
#define LCD_BRAND_ALERT       0xC986U  /* alert surface            */
#define LCD_BRAND_ALERT_EDGE  0xF800U  /* alert stripe             */

/* Fuel-level gradient stops (0% → 100%) */
#define LCD_FUEL_CRIT         0xF800U  /* red                      */
#define LCD_FUEL_LOW          0xFB80U  /* orange                   */
#define LCD_FUEL_MID          0xFEA0U  /* amber gold               */
#define LCD_FUEL_HIGH         0xFFE0U  /* yellow                   */
#define LCD_FUEL_FULL         0x07E0U  /* green                    */

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

void SmartT_UpdateGpsBar(uint8_t fix,
                         const char *lat,
                         const char *lon);

#endif
