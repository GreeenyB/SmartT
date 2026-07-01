#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_ADS1X15.h>

static const int PIN_I2C_SDA = 21;
static const int PIN_I2C_SCL = 22;
static const uint8_t ADS_ADDR = 0x48;

Adafruit_ADS1115 ads;

static float readVoltage(uint8_t channel) {
  int16_t raw = ads.readADC_SingleEnded(channel);
  return ads.computeVolts(raw);
}

void setup() {
  Serial.begin(115200);
  delay(1500);

  Serial.println();
  Serial.println("SmartT ADS1115 Read Test");
  Serial.println("Wiring: SDA=GPIO21, SCL=GPIO22, ADDR=GND, address=0x48");
  Serial.println("A0 = fuel sender signal, A1 = 10K potentiometer middle pin");
  Serial.println();

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.setClock(100000);

  if (!ads.begin(ADS_ADDR, &Wire)) {
    Serial.println("ERROR: ADS1115 not found at 0x48.");
    Serial.println("Run I2C scanner again and check wiring/contact.");
    while (true) {
      delay(1000);
    }
  }

  // GAIN_ONE reads roughly -4.096V to +4.096V, safe for ESP32 3.3V signals.
  ads.setGain(GAIN_ONE);
  ads.setDataRate(RATE_ADS1115_128SPS);

  Serial.println("ADS1115 OK. Reading A0/A1...");
}

void loop() {
  const int16_t rawA0 = ads.readADC_SingleEnded(0);
  const float vA0 = ads.computeVolts(rawA0);

  const int16_t rawA1 = ads.readADC_SingleEnded(1);
  const float vA1 = ads.computeVolts(rawA1);

  const float percentA0 = constrain((vA0 / 3.3f) * 100.0f, 0.0f, 100.0f);
  const float percentA1 = constrain((vA1 / 3.3f) * 100.0f, 0.0f, 100.0f);

  Serial.printf("A0 raw=%6d  V=%.4f  approx=%5.1f%%  |  A1 raw=%6d  V=%.4f  approx=%5.1f%%\n",
                rawA0,
                vA0,
                percentA0,
                rawA1,
                vA1,
                percentA1);

  delay(500);
}
