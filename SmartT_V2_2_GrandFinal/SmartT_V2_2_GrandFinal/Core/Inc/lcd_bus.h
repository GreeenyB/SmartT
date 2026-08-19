#ifndef LCD_BUS_H
#define LCD_BUS_H

#include "main.h"
#include <stdint.h>

void LCD_WriteCommand(uint16_t cmd);
void LCD_WriteData(uint16_t data);
void LCD_WriteDataBuffer(const uint16_t *data, uint32_t length);

#endif
