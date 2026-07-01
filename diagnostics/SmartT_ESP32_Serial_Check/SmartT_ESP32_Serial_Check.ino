#include <Arduino.h>

void setup() {
  Serial.begin(115200);
  delay(2000);

  Serial.println();
  Serial.println("================================");
  Serial.println("SmartT ESP32 Serial Check");
  Serial.println("If you can read this, uploaded sketch is running.");
  Serial.println("Serial Monitor baud must be 115200.");
  Serial.println("================================");
}

void loop() {
  static uint32_t count = 0;
  count++;

  Serial.printf("ESP32 sketch alive: %lu\n", (unsigned long)count);
  delay(1000);
}
