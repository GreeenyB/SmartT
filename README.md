# SmartT

SmartT is a BKI Arduino project for fuel signal acquisition, local dashboard
telemetry, and explainable anomaly detection.

Current hardware direction:

```text
ESP32
-> ADS1115
-> analog fuel sender / potentiometer backup
-> OLED SPI 7-pin
-> Serial JSON and local Wi-Fi dashboard
```

The current main sketch focuses on reading a fuel-level signal reliably,
filtering it, and detecting fuel-drop anomalies locally. Cloud telemetry,
GPS/4G, CAN, and hosted fleet dashboards are future layers.

## Repository layout

```text
SmartT_Core_Demo/
  SmartT_Core_Demo.ino         Main demo sketch

diagnostics/
  SmartT_ESP32_Serial_Check/   Serial sanity check
  SmartT_I2C_Scanner/          I2C device scan
  SmartT_ADS1115_Bus_Doctor/   ADS1115 bus debug
  SmartT_ADS1115_Read_Test/    ADS1115 A0/A1 read test
  SmartT_OLED_SPI_Test/        SSD1306 SPI OLED test
  SmartT_OLED_SH1106_SPI_Test/ SH1106 SPI OLED test
  SmartT_WiFi_AP_Test/         ESP32 access-point test

docs/
  BOM.md
  WIRING_AND_SETUP.md
  SmartT_Algorithm_Recommendation_for_Codex.md

ui-prototype/
  README.md                     Approved editable dashboard source
  dashboard/                    Standalone HTML/CSS/JS dashboard
  assets/                       Local SmartT logo assets
```

## Main demo sketch

`SmartT_Core_Demo/SmartT_Core_Demo.ino` is the main runnable demo sketch. It
contains the ESP32 pin mapping, ADS1115 fuel acquisition, OLED UI, Serial JSON,
local Wi-Fi AP, embedded dashboard HTML, and the fuel anomaly detection logic.

Open this sketch directly in Arduino IDE when running the integrated prototype.

## Dashboard UI

`ui-prototype/` contains the approved editable dashboard source. Open
`ui-prototype/dashboard/index.html` directly in a browser to view the standalone
dashboard.

Temporary exported UI package folders should not be committed. The tracked
source of truth is `ui-prototype/`.

## Diagnostics

`diagnostics/` contains independent hardware test sketches. Each diagnostic is a
normal Arduino sketch folder, so open the `.ino` inside the matching folder.

Use these when bringing up individual hardware blocks before loading the full
demo sketch.

Suggested order:

```text
1. diagnostics/SmartT_ESP32_Serial_Check/
2. diagnostics/SmartT_I2C_Scanner/
3. diagnostics/SmartT_OLED_SPI_Test/
4. diagnostics/SmartT_ADS1115_Read_Test/
5. SmartT_Core_Demo/
```

If the OLED lights but text is distorted, try
`diagnostics/SmartT_OLED_SH1106_SPI_Test/`.

If a phone or laptop cannot connect to the main demo access point, try
`diagnostics/SmartT_WiFi_AP_Test/`.

## Documentation

`docs/` contains wiring, BOM, setup, and planning notes:

- `docs/WIRING_AND_SETUP.md` covers wiring, libraries, calibration, and demo use.
- `docs/BOM.md` lists the current prototype hardware and Arduino libraries.
- `docs/SmartT_Algorithm_Recommendation_for_Codex.md` preserves the fuel
  detection planning note.

## Notes

This cleanup intentionally does not change:

- hardware pin mapping
- fuel detection behavior
- OLED UI
- sensor behavior
