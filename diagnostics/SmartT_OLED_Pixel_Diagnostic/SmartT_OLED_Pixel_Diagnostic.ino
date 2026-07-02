#include <Arduino.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// This SSD1306 pixel test complements the existing SH1106 diagnostic at:
// diagnostics/SmartT_OLED_SH1106_SPI_Test/SmartT_OLED_SH1106_SPI_Test.ino
// Compare both tests if the image is shifted, clipped, or distorted.

static const int OLED_WIDTH = 128;
static const int OLED_HEIGHT = 64;

// Keep these pins matched with SmartT_Core_Demo/Config.h.
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

static void showPatternName(const char* name) {
  Serial.print("Showing: ");
  Serial.println(name);
}

static void holdPattern(const char* name, uint32_t holdMs) {
  showPatternName(name);
  display.display();
  delay(holdMs);
}

static void showFullWhite() {
  display.clearDisplay();
  display.fillScreen(SSD1306_WHITE);
  holdPattern("full white - inspect for fixed dark pixels or lines", 3000);
}

static void showFullBlack() {
  display.clearDisplay();
  holdPattern("full black", 1000);
}

static void showVerticalLines() {
  display.clearDisplay();
  for (int x = 0; x < OLED_WIDTH; x += 2) {
    display.drawFastVLine(x, 0, OLED_HEIGHT, SSD1306_WHITE);
  }
  holdPattern("vertical 1-pixel lines", 2500);
}

static void showHorizontalLines() {
  display.clearDisplay();
  for (int y = 0; y < OLED_HEIGHT; y += 2) {
    display.drawFastHLine(0, y, OLED_WIDTH, SSD1306_WHITE);
  }
  holdPattern("horizontal 1-pixel lines", 2500);
}

static void showCheckerboard() {
  display.clearDisplay();
  for (int y = 0; y < OLED_HEIGHT; y++) {
    for (int x = 0; x < OLED_WIDTH; x++) {
      if (((x + y) & 1) == 0) {
        display.drawPixel(x, y, SSD1306_WHITE);
      }
    }
  }
  holdPattern("checkerboard pattern", 2500);
}

static void showBorder() {
  display.clearDisplay();
  display.drawRect(0, 0, OLED_WIDTH, OLED_HEIGHT, SSD1306_WHITE);
  display.drawRect(2, 2, OLED_WIDTH - 4, OLED_HEIGHT - 4, SSD1306_WHITE);
  holdPattern("border rectangle", 2500);
}

static void printCentered(const char* text, int16_t y, uint8_t textSize) {
  int16_t textWidth = strlen(text) * 6 * textSize;
  int16_t x = (OLED_WIDTH - textWidth) / 2;
  if (x < 0) x = 0;

  display.setTextSize(textSize);
  display.setCursor(x, y);
  display.print(text);
}

static void showLarge8888() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  printCentered("8888", 16, 4);
  holdPattern("large text 8888", 2500);
}

static void showLargeSmartT() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  printCentered("SMARTT", 20, 3);
  holdPattern("large text SMARTT", 2500);
}

static void showSmallAlphabet() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("ABCDEFGHIJKLMNOPQRSTU");
  display.println("VWXYZ abcdefghijklmn");
  display.println("opqrstuvwxyz");
  display.println("0123456789");
  display.println("!@#$%^&*()_-+=[]");
  display.println(".,:;?/\\|<> SMARTT");
  holdPattern("small alphabet and numbers", 3500);
}

static void printInstructions() {
  Serial.println();
  Serial.println("SmartT OLED pixel diagnostic");
  Serial.println("OLED GND/VDD/SCK/SDA/RES/DC/CS -> GND/3V3/GPIO5/GPIO23/GPIO17/GPIO16/GPIO18");
  Serial.println();
  Serial.println("How to read this test:");
  Serial.println("- If full white has fixed dark pixels or fixed dark lines, suspect OLED panel defect.");
  Serial.println("- If graphics are shifted, clipped, or columns look wrong, suspect SSD1306/SH1106 driver mismatch.");
  Serial.println("- If missing pixels change randomly between refreshes, suspect wiring, SPI signal, or power.");
  Serial.println("- If the diagnostic is clean but the main firmware looks bad, suspect main OLED layout/update logic.");
  Serial.println();
  Serial.println("This is the SSD1306 pixel test. This repository also includes:");
  Serial.println("diagnostics/SmartT_OLED_SH1106_SPI_Test/SmartT_OLED_SH1106_SPI_Test.ino");
  Serial.println("Compare SSD1306 and SH1106 results if the image is shifted, clipped, or distorted.");
  Serial.println();
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  printInstructions();

  if (!display.begin(SSD1306_SWITCHCAPVCC)) {
    Serial.println("OLED init failed. Check SPI wiring, power, reset/DC/CS lines, and OLED driver type.");
    while (true) {
      delay(1000);
    }
  }

  display.setTextWrap(false);
  display.clearDisplay();
  display.display();
}

void loop() {
  showFullWhite();
  showFullBlack();
  showVerticalLines();
  showHorizontalLines();
  showCheckerboard();
  showBorder();
  showLarge8888();
  showLargeSmartT();
  showSmallAlphabet();
}
