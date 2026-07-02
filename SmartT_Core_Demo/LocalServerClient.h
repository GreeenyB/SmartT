#pragma once

#include "Config.h"

#if SMARTT_ENABLE_WIFI_DASHBOARD

#include <Arduino.h>

class LocalServerClient {
public:
  void begin();
  bool shouldPost(uint32_t now) const;
  void post(const String& payload, uint32_t now);

  bool serverOnline() const { return serverOnline_; }
  int lastPostStatus() const { return lastPostStatus_; }
  uint32_t lastPostMs() const { return lastPostMs_; }

private:
  bool enabled_ = false;
  bool serverOnline_ = false;
  int lastPostStatus_ = 0;
  uint32_t lastPostMs_ = 0;
};

#endif
