#pragma once

#include <Arduino.h>
#include <TinyGPS++.h>
#include "Types.h"

class GpsContext {
public:
  void begin();
  void read();
  void update(DashboardState& state, uint32_t now);

private:
  TinyGPSPlus gps_;
  uint32_t movingSinceMs_ = 0;
  uint32_t stationarySinceMs_ = 0;

  void updateMotionContext(GpsTelemetry& gps, uint32_t now);
};
