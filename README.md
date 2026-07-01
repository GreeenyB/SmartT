# SmartT Fuel Intelligence

SmartT is a fleet fuel monitoring and telemetry project built around an
ESP32-based hardware stack. It acquires a fuel level signal, filters noisy
readings, estimates fuel percentage and volume, and presents contextual status
through an OLED display and a local web dashboard. The current firmware also
classifies basic fuel events using fuel behavior and vehicle context.

## Key Capabilities

- Fuel level acquisition from an analog fuel sender or fuel level signal
- Filtering for noisy fuel readings
- Fuel percentage and estimated volume calculation
- Contextual status classification for normal, refuel, sloshing/noise, and suspicious fuel drop events
- Local OLED status display
- Wi-Fi hosted dashboard served by the ESP32
- Independent hardware diagnostics sketches for bring-up and validation

## Repository Structure

```text
SmartT_Core_Demo/
  SmartT_Core_Demo.ino         Main Arduino/ESP32 firmware entry point

ui-prototype/
  README.md                    Editable dashboard source notes
  dashboard/                   Approved dashboard HTML, CSS, and JavaScript
  assets/                      Local SmartT dashboard logo assets

diagnostics/
  SmartT_ESP32_Serial_Check/   Serial output sanity check
  SmartT_I2C_Scanner/          I2C bus scanner
  SmartT_ADS1115_Bus_Doctor/   ADS1115/I2C bus diagnostics
  SmartT_ADS1115_Read_Test/    ADS1115 fuel signal read test
  SmartT_OLED_SPI_Test/        SPI OLED test
  SmartT_OLED_SH1106_SPI_Test/ Alternate OLED controller test
  SmartT_WiFi_AP_Test/         ESP32 Wi-Fi access point test

docs/
  BOM.md
  WIRING_AND_SETUP.md
  SmartT_Algorithm_Recommendation_for_Codex.md
```

## Hardware Overview

The current hardware direction uses these main modules:

- ESP32 DevKit
- ADS1115 ADC for fuel signal acquisition
- Analog fuel sender or equivalent fuel level signal
- SPI OLED display for local status
- Optional GPS context, or placeholder context when GPS hardware is not connected
- ESP32 Wi-Fi access point for the local dashboard

The hardware and firmware are organized for iterative development and validation.
Vehicle-specific calibration is expected before use with a real fuel sender.

## Main Sketch

[`SmartT_Core_Demo/SmartT_Core_Demo.ino`](SmartT_Core_Demo/SmartT_Core_Demo.ino)
is the main firmware entry point.

It handles:

- Fuel signal acquisition through the ADS1115
- Raw-to-percentage conversion and filtering
- Fuel volume estimation from configured tank capacity
- Contextual fuel event classification
- OLED status output
- Serial telemetry output
- ESP32-hosted web dashboard serving

Open this sketch in Arduino IDE when running the integrated SmartT firmware.

## Dashboard UI

[`ui-prototype/`](ui-prototype/) contains the editable source of the approved
dashboard UI. The standalone dashboard files live in
[`ui-prototype/dashboard/`](ui-prototype/dashboard/), with local image assets in
[`ui-prototype/assets/`](ui-prototype/assets/).

The Arduino sketch embeds an ESP32-hosted version of the same dashboard style so
the interface can be served directly from the device without external web
dependencies. The embedded dashboard reads live telemetry from the firmware API.

## Diagnostics

[`diagnostics/`](diagnostics/) contains independent Arduino sketches for
hardware validation. These sketches are useful when checking one subsystem at a
time before loading the main firmware.

Available diagnostics include:

- ESP32 serial check
- I2C scanner
- ADS1115 bus and read tests
- SPI OLED tests
- Wi-Fi access point test

## Setup

1. Install Arduino IDE.
2. Install the ESP32 board package in Arduino IDE.
3. Install the required libraries:
   - Adafruit ADS1X15
   - Adafruit BusIO
   - Adafruit SSD1306
   - Adafruit GFX Library
4. Select `ESP32 Dev Module` as the board.
5. Open `SmartT_Core_Demo/SmartT_Core_Demo.ino`.
6. Verify and upload the sketch.
7. Open Serial Monitor at `115200` baud to view startup logs and telemetry.

After upload, connect to the configured ESP32 Wi-Fi access point and open the
dashboard URL printed in Serial Monitor.

## Suggested Validation Flow

1. Run `diagnostics/SmartT_ESP32_Serial_Check/`.
2. Run `diagnostics/SmartT_I2C_Scanner/` to confirm I2C communication.
3. Run `diagnostics/SmartT_ADS1115_Read_Test/` to inspect fuel signal readings.
4. Run `diagnostics/SmartT_OLED_SPI_Test/` to verify the OLED display.
5. Upload `SmartT_Core_Demo/SmartT_Core_Demo.ino`.
6. Check Serial telemetry, OLED output, and the local Wi-Fi dashboard.

If the OLED lights but text appears incorrect, try
`diagnostics/SmartT_OLED_SH1106_SPI_Test/` to check for an alternate OLED
controller.

## Documentation

- [`docs/BOM.md`](docs/BOM.md) lists the current hardware and library bill of materials.
- [`docs/WIRING_AND_SETUP.md`](docs/WIRING_AND_SETUP.md) covers wiring, setup, and calibration notes.
- [`docs/SmartT_Algorithm_Recommendation_for_Codex.md`](docs/SmartT_Algorithm_Recommendation_for_Codex.md) documents fuel event detection planning.

## Current Limitations and Development Notes

- GPS may be represented as contextual data or a placeholder depending on
  hardware availability.
- Vehicle-specific fuel sender calibration is required for real deployment.
- CAN/OBD-II integration, cloud telemetry, and a production-grade enclosure are
  future integration directions.
- Temporary exported UI package folders should not be committed. The editable
  dashboard source is `ui-prototype/`.

## License

License: not specified yet.
