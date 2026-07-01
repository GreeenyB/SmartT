# Prototype BOM

Current SmartT Round 2 prototype parts:

| Item | Purpose |
| --- | --- |
| ESP32 Dev Module | Main controller, Wi-Fi AP, Serial telemetry |
| ADS1115 ADC module | External ADC for analog fuel signal |
| Analog fuel sender | Primary fuel-level signal source |
| 330 ohm resistor | Fuel sender pull-up path used by current wiring |
| 10K potentiometer | Backup/demo analog fuel source on ADS1115 A1 |
| 7-pin SPI OLED module | Local status display |
| Ignition switch or jumper | GPIO19 ignition input |
| Momentary button or jumper | GPIO4 theft/test input |
| Breadboard and jumper wires | Prototype wiring |
| USB cable | ESP32 power, upload, and Serial Monitor |

Arduino libraries currently used by the main demo:

```text
Adafruit ADS1X15
Adafruit BusIO
Adafruit SSD1306
Adafruit GFX Library
```

The SH1106 OLED diagnostic sketch also needs:

```text
U8g2
```
