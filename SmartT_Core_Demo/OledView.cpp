#include "OledView.h"

bool OledView::begin() {
  bool ready = display_.begin(SSD1306_SWITCHCAPVCC);
  if (ready) {
    display_.clearDisplay();
    display_.setTextColor(SSD1306_WHITE);
    display_.setTextWrap(false);
    display_.setTextSize(2);
    display_.setCursor(0, 12);
    display_.println("SmartT");
    display_.setTextSize(1);
    display_.setCursor(0, 36);
    display_.println("Starting...");
    display_.display();
  }
  return ready;
}

void OledView::draw(const DashboardState& state) {
  if (!state.sensor.oledReady) return;

  display_.clearDisplay();
  display_.setTextColor(SSD1306_WHITE);
  display_.setTextWrap(false);

  float fuel = clampFloat(state.fuel.filteredPercent, 0.0f, 100.0f);
  int fuelRounded = (int)(fuel + 0.5f);
  String fuelText = String(fuelRounded) + "%";

  String status = statusLabel(state);
  String evidence = evidenceLabel(state);

  if (evidence.length() > 0) {
    printCentered(fuelText, 0, 3);
    printCentered(status, 24, 2);
    printCentered(evidence, 40, 1);
    printCentered(bottomLabel(state), 48, 2);
  } else {
    printCentered(fuelText, 0, 4);
    printCentered(status, 32, 2);
    printCentered(bottomLabel(state), 48, 2);
  }

  display_.display();
}

String OledView::bottomLabel(const DashboardState& state) const {
  return String(state.vehicle.ignitionOn ? "ON " : "OFF ") + movementLabel(state);
}

String OledView::evidenceLabel(const DashboardState& state) const {
  String status = statusLabel(state);
  if (isAlertStatus(status)) {
    float dropLiters = state.currentEvent.deltaLiters;
    if (dropLiters > -0.05f && dropLiters < 0.05f) {
      dropLiters = state.fuel.deltaLiters;
    }
    if (dropLiters < 0.0f) {
      dropLiters = -dropLiters;
    }

    int roundedLiters = (int)(dropLiters + 0.5f);
    if (roundedLiters >= 1) return String("DROP ") + String(roundedLiters) + "L";
  }

  return "";
}

String OledView::movementLabel(const DashboardState& state) const {
  if (!state.gps.dataFresh) return "GPS NO";
  if (state.gps.moving) return "MOVE";
  return "PARK";
}

String OledView::statusLabel(const DashboardState& state) const {
  const String& alert = state.currentEvent.alert;
  const String& event = state.currentEvent.code;

  if (!state.sensor.adsReady || !state.sensor.healthy ||
      state.detectorState == DETECTOR_SENSOR_FAULT ||
      event == "ADS1115_MISSING" || event == "SENSOR_FAULT") {
    return "SENSOR";
  }
  if (alert != "NONE") {
    return "ALERT";
  }
  if (state.detectorState == DETECTOR_THEFT_ALERT ||
      state.detectorState == DETECTOR_DROP_CANDIDATE ||
      event == "SUSPICIOUS_DROP" ||
      event == "FUEL_DROP_CANDIDATE" ||
      event == "FAST_DROP_IGN_ON" ||
      event == "FUEL_DROP_WHILE_MOVING" ||
      event == "GPS_MOVING_IGN_OFF" ||
      event == "TEST_BUTTON") {
    return "ALERT";
  }
  if (state.detectorState == DETECTOR_REFUEL_CANDIDATE ||
      event == "REFUEL_CANDIDATE" ||
      event == "REFUEL_EVENT") {
    return "REFUEL";
  }
  if (state.detectorState == DETECTOR_SLOSHING ||
      event == "SLOSHING_DETECTED") {
    return "SLOSH";
  }

  return "NORMAL";
}

bool OledView::isAlertStatus(const String& status) const {
  return status == "ALERT";
}

void OledView::printCentered(const String& text, int16_t y, uint8_t textSize) {
  int16_t textWidth = text.length() * 6 * textSize;
  int16_t x = (OLED_WIDTH - textWidth) / 2;
  if (x < 0) x = 0;

  display_.setTextSize(textSize);
  display_.setCursor(x, y);
  display_.print(text);
}
