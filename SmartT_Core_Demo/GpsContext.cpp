#include "GpsContext.h"

void GpsContext::begin() {
  Serial2.begin(GPS_BAUD, SERIAL_8N1, PIN_GPS_RX, PIN_GPS_TX);
}

void GpsContext::read() {
  while (Serial2.available() > 0) {
    gps_.encode(Serial2.read());
  }
}

void GpsContext::update(DashboardState& state, uint32_t now) {
  GpsTelemetry& gps = state.gps;

  gps.locationAgeMs = gps_.location.age();
  gps.speedAgeMs = gps_.speed.age();
  gps.dataFresh = gps_.location.isValid() && gps.locationAgeMs < GPS_VALID_MAX_AGE_MS;
  gps.speedFresh = gps_.speed.isValid() && gps.speedAgeMs < GPS_VALID_MAX_AGE_MS;
  gps.fix = gps.dataFresh;

  if (gps.dataFresh) {
    gps.lat = gps_.location.lat();
    gps.lon = gps_.location.lng();
    gps.state = "Fresh";
  } else {
    gps.lat = 0.0f;
    gps.lon = 0.0f;
    gps.state = gps_.location.isValid() ? "Stale" : "Acquiring";
  }

  gps.speedKmh = gps.speedFresh ? gps_.speed.kmph() : 0.0f;
  gps.satellites = gps_.satellites.isValid() ? gps_.satellites.value() : 0;

  if (gps_.time.isValid() && gps_.time.age() < GPS_VALID_MAX_AGE_MS) {
    char buf[16];
    snprintf(buf, sizeof(buf), "%02d:%02d:%02d",
             gps_.time.hour(), gps_.time.minute(), gps_.time.second());
    gps.timeText = String(buf);
  } else {
    gps.timeText = "--";
  }

  updateMotionContext(gps, now);
}

void GpsContext::updateMotionContext(GpsTelemetry& gps, uint32_t now) {
  gps.usedInDecision = false;
  gps.decisionContext = "GPS_NOT_USED";

  if (!gps.speedFresh) {
    movingSinceMs_ = 0;
    stationarySinceMs_ = 0;
    gps.motionState = gps.fix ? "ACQUIRING" : "UNKNOWN";
    gps.stationary = false;
    gps.moving = false;
    gps.decisionContext = "GPS_UNAVAILABLE_FALLBACK";
    return;
  }

  if (gps.speedKmh <= GPS_STATIONARY_KMH) {
    movingSinceMs_ = 0;
    if (stationarySinceMs_ == 0) {
      stationarySinceMs_ = now;
    }

    gps.motionState = "STATIONARY";
    gps.stationary = (now - stationarySinceMs_ >= GPS_MOTION_CONFIRM_MS);
    gps.moving = false;
    return;
  }

  if (gps.speedKmh >= GPS_MOVING_KMH) {
    stationarySinceMs_ = 0;
    if (movingSinceMs_ == 0) {
      movingSinceMs_ = now;
    }

    gps.motionState = "MOVING";
    gps.stationary = false;
    gps.moving = (now - movingSinceMs_ >= GPS_MOTION_CONFIRM_MS);
    return;
  }

  movingSinceMs_ = 0;
  stationarySinceMs_ = 0;
  gps.motionState = "SLOW_MOVEMENT";
  gps.stationary = false;
  gps.moving = false;
}
