#pragma once

#include <Arduino.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "Types.h"

class OledView {
public:
  bool begin();
  void draw(const DashboardState& state);

private:
  Adafruit_SSD1306 display_ = Adafruit_SSD1306(
    OLED_WIDTH,
    OLED_HEIGHT,
    PIN_OLED_MOSI,
    PIN_OLED_SCK,
    PIN_OLED_DC,
    PIN_OLED_RESET,
    PIN_OLED_CS
  );

  String bottomLabel(const DashboardState& state) const;
  String evidenceLabel(const DashboardState& state) const;
  String movementLabel(const DashboardState& state) const;
  String statusLabel(const DashboardState& state) const;
  bool isAlertStatus(const String& status) const;
  void printCentered(const String& text, int16_t y, uint8_t textSize);
};
