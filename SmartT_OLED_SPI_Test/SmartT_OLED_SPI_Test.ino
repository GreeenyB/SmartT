#include <Arduino.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

static const int OLED_WIDTH = 128;
static const int OLED_HEIGHT = 64;

static const int PIN_OLED_SCK = 5;
static const int PIN_OLED_MOSI = 23;
static const int PIN_OLED_RESET = 17;
static const int PIN_OLED_DC = 16;
static const int PIN_OLED_CS = 18;

Adafruit_SSD1306 display(
  OLED_WIDTH,
  OLED_HEIGHT,
  PIN_OLED_MOSI,
  PIN_OLED_SCK,
  PIN_OLED_DC,
  PIN_OLED_RESET,
  PIN_OLED_CS
);

static void drawCleanFrame(uint8_t fuelPercent) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("SmartT OLED SPI");
  display.drawLine(0, 10, OLED_WIDTH - 1, 10, SSD1306_WHITE);

  display.setTextSize(2);
  display.setCursor(0, 18);
  display.print(fuelPercent);
  display.print("%");

  display.setTextSize(1);
  display.setCursor(74, 18);
  display.print("OLED OK");
  display.setCursor(74, 30);
  display.print("GPIO 5/23");

  const int barX = 0;
  const int barY = 50;
  const int barW = 128;
  const int barH = 12;
  const int fillW = map(fuelPercent, 0, 100, 0, barW - 4);
  display.drawRect(barX, barY, barW, barH, SSD1306_WHITE);
  display.fillRect(barX + 2, barY + 2, fillW, barH - 4, SSD1306_WHITE);

  display.display();
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("SmartT OLED SPI test");
  Serial.println("OLED GND/VDD/SCK/SDA/RES/DC/CS -> GND/3V3/GPIO5/GPIO23/GPIO17/GPIO16/GPIO18");

  if (!display.begin(SSD1306_SWITCHCAPVCC)) {
    Serial.println("OLED init failed. Check SPI wiring and OLED driver type.");
    while (true) {
      delay(1000);
    }
  }

  drawCleanFrame(0);
}

void loop() {
  static uint32_t frame = 0;
  frame++;

  uint8_t fuel = (frame * 7) % 101;
  drawCleanFrame(fuel);

  Serial.printf("OLED frame %lu fuel=%u%%\n", (unsigned long)frame, fuel);
  delay(500);
}
