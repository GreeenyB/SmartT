# Hardware

## Prototype BOM

| Item | Purpose |
| --- | --- |
| ESP32 Dev Module | Main controller, Wi-Fi AP, Serial telemetry |
| ADS1115 ADC module | External ADC for analog fuel signal |
| Analog fuel sender | Primary fuel-level signal source |
| 330 ohm resistor | Fuel sender pull-up path |
| 10K potentiometer | Backup/demo analog fuel source on ADS1115 A1 |
| 7-pin SPI OLED module | Local status display |
| Ignition switch or jumper | GPIO19 ignition input |
| Momentary button or jumper | GPIO4 theft/test input |
| Breadboard and jumper wires | Prototype wiring |
| USB cable | ESP32 power, upload, and Serial Monitor |

## Wiring

```text
ADS1115:
VDD  -> 3V3
GND  -> GND
SDA  -> GPIO21
SCL  -> GPIO22
ADDR -> GND
A0   -> FUEL_SIG from fuel sender
A1   -> middle pin of 10K potentiometer backup

Fuel sender:
3V3 -> 330 ohm -> FUEL_SIG -> sender -> GND
                  |
                  -> ADS1115 A0

10K potentiometer:
outer pin 1 -> 3V3
middle pin  -> ADS1115 A1
outer pin 2 -> GND

OLED SPI 7-pin:
GND -> GND
VDD -> 3V3
SCK -> GPIO5
SDA -> GPIO23
RES -> GPIO17
DC  -> GPIO16
CS  -> GPIO18

Ignition:
GPIO19 <-> switch <-> GND
INPUT_PULLUP, LOW = ON, HIGH = OFF

Test/Theft button:
GPIO4 <-> button <-> GND
INPUT_PULLUP, LOW = pressed
```

GPIO2 is not used.

## Arduino Setup

Install:

```text
Adafruit ADS1X15
Adafruit BusIO
Adafruit SSD1306
Adafruit GFX Library
```

The SH1106 diagnostic sketch also uses `U8g2`.

Recommended board settings:

```text
Board: ESP32 Dev Module
Upload speed: 921600, or 115200 if upload fails
Serial Monitor: 115200 baud
```

## Bring-Up Order

1. `diagnostics/SmartT_ESP32_Serial_Check/SmartT_ESP32_Serial_Check.ino`
2. `diagnostics/SmartT_I2C_Scanner/SmartT_I2C_Scanner.ino`
3. `diagnostics/SmartT_OLED_SPI_Test/SmartT_OLED_SPI_Test.ino`
4. `diagnostics/SmartT_ADS1115_Read_Test/SmartT_ADS1115_Read_Test.ino`
5. `SmartT_Core_Demo/SmartT_Core_Demo.ino`

Use `diagnostics/SmartT_ADS1115_Bus_Doctor/SmartT_ADS1115_Bus_Doctor.ino` if the ADS1115 is not found at `0x48`.
