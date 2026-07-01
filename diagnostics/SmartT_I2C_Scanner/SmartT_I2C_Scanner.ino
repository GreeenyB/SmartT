#include <Arduino.h>
#include <Wire.h>
struct I2cPinPair {
  const char* name;
  uint8_t sda;
  uint8_t scl;
};
I2cPinPair pinPairs[] = {
  {"Expected wiring: SDA=GPIO21, SCL=GPIO22", 21, 22},
  {"Swapped test: SDA=GPIO22, SCL=GPIO21", 22, 21},
};
void scanOnePair(const I2cPinPair& pair) {
  Serial.println();
  Serial.println("========================================");
  Serial.println(pair.name);
  Serial.printf("Wire.begin(SDA=%u, SCL=%u)\n", pair.sda, pair.scl);
  Wire.end();
  delay(100);
  Wire.begin(pair.sda, pair.scl);
  Wire.setClock(100000);
  delay(100);
  uint8_t found = 0;
  for (uint8_t address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    uint8_t error = Wire.endTransmission();
    if (error == 0) {
      Serial.printf("FOUND: 0x%02X", address);
      if (address >= 0x48 && address <= 0x4B) {
        Serial.print("  <- ADS1115 possible address");
      }
      Serial.println();
      found++;
    }
  }
  if (found == 0) {
    Serial.println("No device found on this SDA/SCL pair.");
  }
}
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println();
  Serial.println("SmartT I2C pin debug");
  Serial.println("Only connect ESP32 + ADS1115 for this test.");
  Serial.println("ADS1115 expected: VDD=3V3, GND=GND, SDA=21, SCL=22, ADDR=GND.");
}
void loop() {
  for (uint8_t i = 0; i < sizeof(pinPairs) / sizeof(pinPairs[0]); i++) {
    scanOnePair(pinPairs[i]);
    delay(1000);
  }
  Serial.println();
  Serial.println("If nothing is found:");
  Serial.println("1) Check SDA/SCL labels on ADS1115.");
  Serial.println("2) Check header solder/contact.");
  Serial.println("3) Check ADDR to GND.");
  Serial.println("4) Try external 4.7k-10k pullups: SDA->3V3 and SCL->3V3.");
  Serial.println("Repeating in 5 seconds...");
  delay(5000);
}