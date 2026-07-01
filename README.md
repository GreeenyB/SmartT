# SmartT Round 2 Arduino Code

This folder contains Arduino IDE sketches for the current SmartT MVP wiring.

## Wiring used by these sketches

```text
ADS1115:
VDD  -> 3V3
GND  -> GND
SDA  -> GPIO21
SCL  -> GPIO22
ADDR -> GND if the module has ADDR
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

OLED SPI 7 pin:
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

## Install libraries

In Arduino IDE Library Manager, install:

```text
Adafruit ADS1X15
Adafruit BusIO
Adafruit SSD1306
Adafruit GFX Library
```

ESP32 board setting:

```text
Board: ESP32 Dev Module
Upload speed: 921600, or 115200 if upload fails
Serial Monitor: 115200 baud
```

If upload gets stuck at `Connecting...`, hold BOOT when upload starts, then release.
Do not hold the GPIO4 test button while the ESP32 is resetting or uploading.

## Recommended test order

0. If Serial Monitor only shows the ESP32 boot log, open
   `SmartT_ESP32_Serial_Check/SmartT_ESP32_Serial_Check.ino`.
   Expected: `ESP32 sketch alive` prints once per second.

1. Open `SmartT_I2C_Scanner/SmartT_I2C_Scanner.ino`.
   Expected: Serial Monitor finds ADS1115 at `0x48`.

2. Open `SmartT_OLED_SPI_Test/SmartT_OLED_SPI_Test.ino`.
   Expected: OLED shows the SmartT SPI test screen.

   If the OLED lights up but the text looks distorted, try
   `SmartT_OLED_SH1106_SPI_Test/SmartT_OLED_SH1106_SPI_Test.ino`.
   This version needs the `U8g2` library and is for common SH1106 OLED modules.

3. Open `SmartT_Core_Demo/SmartT_Core_Demo.ino`.
   Expected: Serial JSON, OLED status, and optional local dashboard all update.

Extra ADS1115 debug:

`SmartT_ADS1115_Bus_Doctor/SmartT_ADS1115_Bus_Doctor.ino` checks whether SDA/SCL
are idle-high, then scans normal GPIO21/GPIO22 and swapped GPIO22/GPIO21 at two
I2C speeds. Expected ADS1115 address with `ADDR -> GND` is `0x48`.

After the scanner finds `0x48`, open
`SmartT_ADS1115_Read_Test/SmartT_ADS1115_Read_Test.ino` to read A0/A1 voltages
over Serial without OLED or dashboard code.

## Main demo sketch

`SmartT_Core_Demo` reads:

```text
ADS1115 A0 -> real fuel sender
ADS1115 A1 -> 10K potentiometer backup
GPIO19     -> ignition switch
GPIO4      -> theft/test button
OLED SPI   -> local screen
Serial     -> JSON telemetry
Wi-Fi AP   -> local dashboard
```

By default, the fuel percent uses A0. If the real sender is noisy or not ready,
set this line near the top of `SmartT_Core_Demo.ino`:

```cpp
#define SMARTT_USE_A1_BACKUP_AS_MAIN_FUEL 1
```

## Calibration

In `SmartT_Core_Demo.ino`, update these values after measuring the sender:

```cpp
const float FUEL_A0_EMPTY_V = 0.20f;
const float FUEL_A0_FULL_V  = 3.10f;
```

If your sender is reversed, just swap the values. The code supports either
direction.

## Local dashboard

The main sketch starts a Wi-Fi access point:

```text
SSID: SmartT-BKUIT-OPEN
Password: none
URL: http://192.168.4.1
JSON: http://192.168.4.1/api/telemetry
```

The dashboard is embedded inside `SmartT_Core_Demo.ino`; no extra web file is
needed. Connect a phone or laptop to `SmartT-BKUIT-OPEN`, stay connected even if the
device says "No internet", then open `http://192.168.4.1`.

Use the small theme button in the top right of the dashboard to switch between
light mode and dark mode. The browser saves the last selected theme.

If the phone cannot connect to `SmartT-BKUIT-OPEN`, upload
`SmartT_WiFi_AP_Test/SmartT_WiFi_AP_Test.ino` first. It creates an open Wi-Fi
network named `SmartT-Test` and serves a minimal page at `http://192.168.4.1`.

For the first reliable demo, Serial + OLED is enough. The dashboard can be
shown after the core readings are stable.

## Cloud next step

Once the local JSON is stable, the easiest cloud path is:

```text
ESP32 JSON -> Node-RED / small backend -> dashboard chart + alert log
```

Do not add GPS/4G/CAN yet unless the core fuel pipeline is already reliable.
