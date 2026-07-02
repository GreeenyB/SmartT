# SmartT Fuel Intelligence

## Overview

SmartT Fuel Intelligence is a fuel monitoring and telemetry prototype for fleet
operations. It reads fuel level data, estimates fuel percentage and volume,
classifies contextual fuel events, and presents device status through an OLED
display and an ESP32-hosted web dashboard.

## Key Capabilities

- Fuel signal acquisition through ADS1115
- Fuel percentage and liters estimation
- Multi-stage filtering and signal stability tracking
- Rule-based fuel event detection
- Ignition and GPS/motion context
- Refuel, sloshing, and suspicious drop classification
- OLED device status display
- ESP32-hosted web dashboard
- Laptop-hosted local server dashboard with SQLite persistence
- Diagnostic sketches for hardware validation

## Firmware Architecture

The main firmware is modularized under `SmartT_Core_Demo/`:

- `Config.h`: pin mapping, calibration constants, timing, and feature flags
- `Types.h`: shared telemetry, sensor health, GPS, vehicle, and event state
- `FuelSensor`: ADS1115 fuel signal acquisition and sensor health checks
- `FuelFilter`: fuel percentage filtering and signal stability tracking
- `GpsContext`: optional GPS and motion context
- `EventDetector`: rule-based refuel, slosh, and suspicious drop detection
- `OledView`: compact OLED device status display
- `WebDashboard`: ESP32 web server, telemetry API, and dashboard routes
- `DashboardAssets.h`: embedded dashboard HTML, CSS, and JavaScript assets
- `LocalServerClient`: optional HTTP telemetry push to the laptop local server

## Repository Structure

```text
SmartT_Core_Demo/   Main Arduino/ESP32 firmware
diagnostics/        Hardware validation sketches
docs/               Wiring, setup, BOM, and algorithm notes
server/             Flask, SQLite, and local fleet dashboard
ui-prototype/       Editable dashboard prototype source
```

## Local Server Dashboard

The local server under `server/` receives ESP32 telemetry at `/api/ingest`,
persists telemetry and events to `server/data/smartt.db`, and serves the fleet
dashboard at `http://localhost:8000`. See `server/README.md` for Windows setup,
sample data loading, and ESP32 Wi-Fi configuration.

## Hardware Overview

- ESP32 DevKit
- ADS1115 ADC
- Analog fuel sender or potentiometer
- SPI OLED 128x64
- Optional GPS module
- Breadboard/prototype wiring

## Arduino IDE Setup

Required board:

- ESP32 Dev Module

Required libraries:

- Adafruit ADS1X15
- Adafruit BusIO
- Adafruit GFX
- Adafruit SSD1306
- TinyGPS++ if GPS is enabled or used

## Running the Firmware

1. Open `SmartT_Core_Demo/SmartT_Core_Demo.ino`.
2. Select `ESP32 Dev Module` and the correct COM port.
3. Verify and upload the sketch.
4. Open Serial Monitor at `115200` baud.
5. Connect to the ESP32 dashboard according to the firmware Wi-Fi mode and
   Serial Monitor output.

For local server push, copy `SmartT_Core_Demo/Secrets.example.h` to
`SmartT_Core_Demo/Secrets.h` and set the Wi-Fi SSID, password, and
`http://<LAPTOP_IP>:8000/api/ingest` URL. The sketch still compiles and runs
without `Secrets.h`.

## Diagnostics

Diagnostic sketches are available under `diagnostics/` for subsystem bring-up
and hardware validation. They include serial, I2C, ADS1115, OLED SPI, OLED pixel,
SH1106 OLED comparison, and Wi-Fi access point tests.

Use the OLED pixel diagnostic when checking for missing pixels, fixed lines,
driver mismatch, or unstable SPI/power behavior.

## Current Limitations

- Bench prototype, not a vehicle-certified product
- Vehicle-specific fuel calibration is required
- GPS depends on module availability and signal quality
- CAN/OBD-II and 4G/cloud integration are future work
- Fuel event detection is currently rule-based and requires pilot validation

## Roadmap

- Improved calibration workflow
- Persistent event logging
- Cleaner enclosure/prototype hardware
- Optional GPS/geofence context
- Future CAN/OBD-II and cloud integration
