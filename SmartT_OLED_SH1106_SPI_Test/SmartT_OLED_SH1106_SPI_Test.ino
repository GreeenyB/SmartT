#include <Arduino.h>
#include <U8g2lib.h>
#include <SPI.h>

static const int PIN_OLED_SCK = 5;
static const int PIN_OLED_MOSI = 23;
static const int PIN_OLED_RESET = 17;
static const int PIN_OLED_DC = 16;
static const int PIN_OLED_CS = 18;

// Try this sketch if the SSD1306 sketch works but the screen looks distorted.
// Many 1.3 inch 7-pin SPI OLED modules use SH1106 instead of SSD1306.
U8G2_SH1106_128X64_NONAME_F_4W_SW_SPI display(
  U8G2_R0,
  PIN_OLED_SCK,
  PIN_OLED_MOSI,
  PIN_OLED_CS,
  PIN_OLED_DC,
  PIN_OLED_RESET
);

static void drawFrame(uint8_t fuelPercent) {
  display.clearBuffer();

  display.setFont(u8g2_font_6x10_tf);
  display.drawStr(0, 9, "SmartT OLED SH1106");
  display.drawHLine(0, 12, 128);

  display.setFont(u8g2_font_logisoso24_tf);
  char fuelText[8];
  snprintf(fuelText, sizeof(fuelText), "%u%%", fuelPercent);
  display.drawStr(0, 42, fuelText);

  display.setFont(u8g2_font_6x10_tf);
  display.drawStr(76, 28, "SPI OK");
  display.drawStr(76, 40, "5/23");

  const int barX = 0;
  const int barY = 52;
  const int barW = 128;
  const int barH = 11;
  const int fillW = map(fuelPercent, 0, 100, 0, barW - 4);
  display.drawFrame(barX, barY, barW, barH);
  display.drawBox(barX + 2, barY + 2, fillW, barH - 4);

  display.sendBuffer();
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("SmartT OLED SH1106 SPI test");
  Serial.println("Install library: U8g2");
  Serial.println("OLED GND/VDD/SCK/SDA/RES/DC/CS -> GND/3V3/GPIO5/GPIO23/GPIO17/GPIO16/GPIO18");

  display.begin();
  drawFrame(0);
}

void loop() {
  static uint32_t frame = 0;
  frame++;

  uint8_t fuel = (frame * 7) % 101;
  drawFrame(fuel);

  Serial.printf("SH1106 OLED frame %lu fuel=%u%%\n", (unsigned long)frame, fuel);
  delay(500);
}
