#pragma once

#include <Arduino.h>

#if defined(__has_include)
#if __has_include("Secrets.h")
#include "Secrets.h"
#endif
#endif

#define SMARTT_ENABLE_WIFI_DASHBOARD 1
#define SMARTT_USE_A1_BACKUP_AS_MAIN_FUEL 0
#define SMARTT_ENABLE_ALERT_LED 1

#ifndef SMARTT_ENABLE_LOCAL_SERVER_PUSH
#define SMARTT_ENABLE_LOCAL_SERVER_PUSH 1
#endif

#ifndef SMARTT_WIFI_SSID
#define SMARTT_WIFI_SSID ""
#endif

#ifndef SMARTT_WIFI_PASS
#define SMARTT_WIFI_PASS ""
#endif

#ifndef SMARTT_SERVER_URL
#define SMARTT_SERVER_URL ""
#endif

#ifndef SMARTT_LOCAL_SERVER_POST_INTERVAL_MS
#define SMARTT_LOCAL_SERVER_POST_INTERVAL_MS 500UL
#endif

#ifndef SMARTT_LOCAL_SERVER_HTTP_TIMEOUT_MS
#define SMARTT_LOCAL_SERVER_HTTP_TIMEOUT_MS 350
#endif

#ifndef SMARTT_WIFI_RECONNECT_INTERVAL_MS
#define SMARTT_WIFI_RECONNECT_INTERVAL_MS 30000UL
#endif

static const char* const VEHICLE_ID = "TRUCK_01";
static const float TANK_CAPACITY_LITERS = 180.0f;

static const uint8_t PIN_ALERT_LED = 15;

static const uint8_t PIN_GPS_RX = 13;
static const uint8_t PIN_GPS_TX = 14;
static const uint32_t GPS_BAUD = 9600;

static const uint8_t PIN_I2C_SDA = 21;
static const uint8_t PIN_I2C_SCL = 22;
static const uint32_t I2C_CLOCK_HZ = 100000;

static const uint8_t PIN_IGNITION = 19;
static const uint8_t PIN_TEST_BUTTON = 4;

static const int OLED_WIDTH = 128;
static const int OLED_HEIGHT = 64;
static const int PIN_OLED_SCK = 5;
static const int PIN_OLED_MOSI = 23;
static const int PIN_OLED_RESET = 17;
static const int PIN_OLED_DC = 16;
static const int PIN_OLED_CS = 18;

static const uint8_t ADS1115_ADDRESS = 0x48;
static const uint8_t ADS1115_SAMPLE_COUNT = 4;

// Measured from the current fuel sender prototype on 2026-06-30:
// A0 moved roughly from 0.028V to 0.308V through the 330 ohm pull-up circuit.
// If the sender direction feels reversed in the demo, swap EMPTY and FULL.
static const float FUEL_A0_EMPTY_V = 0.03f;
static const float FUEL_A0_FULL_V = 0.31f;

// Backup potentiometer is normally 0.0V to 3.3V.
static const float FUEL_A1_EMPTY_V = 0.00f;
static const float FUEL_A1_FULL_V = 3.30f;

static const uint8_t FUEL_MEDIAN_SIZE = 5;
static const uint8_t FUEL_STABILITY_WINDOW_SIZE = 10;
static const float FUEL_EMA_ALPHA = 0.18f;
static const float RATE_EMA_ALPHA = 0.25f;

static const uint32_t IGNITION_OFF_SETTLE_MS = 2500;
static const float THEFT_MIN_TOTAL_DROP_PCT = 5.0f;
static const float THEFT_MIN_RATE_PCT_PER_SEC = -0.55f;
static const float THEFT_MAX_RECOVERY_RATE_PCT_PER_SEC = 0.20f;
static const uint32_t THEFT_CONFIRM_MS = 2200;
static const uint32_t THEFT_ALERT_HOLD_MS = 8000;
static const float THEFT_CANCEL_RECOVERY_PCT = 2.0f;

static const float REFUEL_MIN_RISE_PCT = 7.0f;
static const uint32_t REFUEL_CONFIRM_MS = 1800;
static const float REFUEL_STABILIZE_RATE_ABS_PCT_PER_SEC = 0.50f;

static const float BASELINE_STABLE_RATE_ABS_PCT_PER_SEC = 0.15f;
static const uint32_t BASELINE_STABLE_UPDATE_MS = 5000;
static const float BASELINE_MAX_DRIFT_UPDATE_PCT = 1.5f;

static const float SENSOR_VALID_LOW_MARGIN_PCT = -5.0f;
static const float SENSOR_VALID_HIGH_MARGIN_PCT = 105.0f;
static const uint32_t SENSOR_STUCK_MS = 15000;
static const float SENSOR_STUCK_EPS_PCT = 0.15f;

static const float SIGNAL_STABILITY_MIN_STABLE = 65.0f;
static const float SLOSHING_SCORE_EVENT = 60.0f;
static const float SLOSHING_SCORE_SUPPRESS_THEFT = 72.0f;
static const float SLOSHING_SCORE_CLEAR = 38.0f;

static const uint8_t EVENT_LOG_SIZE = 6;

static const uint32_t TEST_HOLD_MS = 3500;
static const uint32_t SAMPLE_INTERVAL_MS = 250;
static const uint32_t SERIAL_INTERVAL_MS = 500;
static const uint32_t OLED_INTERVAL_MS = 500;
static const uint32_t STARTUP_DETECTION_IGNORE_MS = 2500;

static const uint32_t GPS_VALID_MAX_AGE_MS = 5000;
static const float GPS_STATIONARY_KMH = 3.0f;
static const float GPS_MOVING_KMH = 8.0f;
static const uint32_t GPS_MOTION_CONFIRM_MS = 3000;

#if SMARTT_ENABLE_WIFI_DASHBOARD
static const char* const AP_SSID = "SmartT-BKUIT-OPEN";
static const char* const AP_PASS = "";
#endif
