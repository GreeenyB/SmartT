#include <Arduino.h>
#include <Wire.h>

struct I2cPins {
  const char *name;
  int sda;
  int scl;
};

static const I2cPins TESTS[] = {
  {"normal wiring", 21, 22},
  {"swapped SDA/SCL", 22, 21},
};

static void printLineState(int sda, int scl) {
  pinMode(sda, INPUT_PULLUP);
  pinMode(scl, INPUT_PULLUP);
  delay(20);

  const int sdaState = digitalRead(sda);
  const int sclState = digitalRead(scl);

  Serial.printf("Idle line check: SDA GPIO%d=%s, SCL GPIO%d=%s\n",
                sda,
                sdaState == HIGH ? "HIGH" : "LOW",
                scl,
                sclState == HIGH ? "HIGH" : "LOW");

  if (sdaState == LOW || sclState == LOW) {
    Serial.println("WARNING: One I2C line is LOW while idle. Check short to GND, wrong pin, or a module holding the bus.");
  } else {
    Serial.println("Idle looks OK: both lines are HIGH.");
  }
}

static int scanBus(int sda, int scl, uint32_t speed) {
  int found = 0;

  Wire.end();
  delay(50);
  Wire.begin(sda, scl, speed);
  Wire.setTimeOut(50);
  delay(50);

  Serial.printf("Scanning I2C on SDA GPIO%d, SCL GPIO%d, speed %lu Hz\n",
                sda,
                scl,
                (unsigned long)speed);

  for (uint8_t address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    const uint8_t error = Wire.endTransmission();

    if (error == 0) {
      found++;
      Serial.printf("  FOUND device at 0x%02X", address);

      if (address >= 0x48 && address <= 0x4B) {
        Serial.print(" <- ADS1115 possible address");
      }

      Serial.println();
    } else if (address >= 0x48 && address <= 0x4B) {
      Serial.printf("  No ACK at ADS address 0x%02X, error=%u\n", address, error);
    }
  }

  if (found == 0) {
    Serial.println("  No I2C devices found.");
  }

  Serial.println();
  return found;
}

void setup() {
  Serial.begin(115200);
  delay(1500);

  Serial.println();
  Serial.println("SmartT ADS1115 Bus Doctor");
  Serial.println("Minimal wiring:");
  Serial.println("ADS1115 VDD  -> ESP32 3V3");
  Serial.println("ADS1115 GND  -> ESP32 GND");
  Serial.println("ADS1115 SDA  -> ESP32 GPIO21");
  Serial.println("ADS1115 SCL  -> ESP32 GPIO22");
  Serial.println("ADS1115 ADDR -> GND");
  Serial.println();

  for (const I2cPins &test : TESTS) {
    Serial.println("========================================");
    Serial.printf("Test: %s\n", test.name);
    printLineState(test.sda, test.scl);
    scanBus(test.sda, test.scl, 100000);
    scanBus(test.sda, test.scl, 50000);
  }

  Serial.println("Done. Expected ADS1115 address when ADDR is GND: 0x48.");
  Serial.println("If both lines are HIGH but no address appears, suspect SDA/SCL wiring, ADDR wiring, loose header/solder, or a bad ADS1115 module.");
}

void loop() {
  delay(3000);
}
