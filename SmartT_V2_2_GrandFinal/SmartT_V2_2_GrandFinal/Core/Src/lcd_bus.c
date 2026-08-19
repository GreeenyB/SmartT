#include "lcd_bus.h"

/*
 * FSMC Bank1 NE1 base address = 0x60000000
 *
 * LCD RS/DC = FSMC A18
 * Bus width = 16-bit
 *
 * Vì bus 16-bit nên A18 của external bus tương ứng
 * với CPU address offset 1 << 19 = 0x80000.
 */
#define LCD_REG_ADDR   0x60000000U
#define LCD_DATA_ADDR  0x60080000U

#define LCD_REG   (*((volatile uint16_t *)LCD_REG_ADDR))
#define LCD_DATA  (*((volatile uint16_t *)LCD_DATA_ADDR))

void LCD_WriteCommand(uint16_t cmd)
{
    LCD_REG = cmd;
}

void LCD_WriteData(uint16_t data)
{
    LCD_DATA = data;
}

void LCD_WriteDataBuffer(const uint16_t *data, uint32_t length)
{
    while (length--)
    {
        LCD_DATA = *data++;
    }
}
