#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "EventDetector.h"

namespace {

std::vector<std::string> split(const std::string& line) {
  std::vector<std::string> values;
  std::stringstream stream(line);
  std::string value;
  while (std::getline(stream, value, ',')) values.push_back(value);
  return values;
}

float number(const std::vector<std::string>& row, const std::map<std::string, size_t>& columns,
             const std::string& name, float fallback = 0.0f) {
  auto found = columns.find(name);
  if (found == columns.end() || found->second >= row.size() || row[found->second].empty()) return fallback;
  return std::stof(row[found->second]);
}

std::string text(const std::vector<std::string>& row, const std::map<std::string, size_t>& columns,
                 const std::string& name) {
  auto found = columns.find(name);
  return found == columns.end() || found->second >= row.size() ? "" : row[found->second];
}

struct Result {
  bool expected = false;
  bool actual = false;
  int alerts = 0;
  float first = -1.0f;
  float start = -1.0f;
  int state = 0;
};

DashboardState freshState() {
  DashboardState state;
  state.sensor.adsReady = true;
  state.sensor.healthy = true;
  state.fuel.filterReady = true;
  state.fuel.signalStability = 100.0f;
  state.fuel.sloshingScore = 0.0f;
  return state;
}

}  // namespace

int main(int argc, char** argv) {
  if (argc != 2) return 2;
  std::ifstream input(argv[1]);
  std::string header;
  if (!std::getline(input, header)) return 3;
  std::map<std::string, size_t> columns;
  for (size_t i = 0; i < split(header).size(); ++i) columns[split(header)[i]] = i;
  std::map<std::string, Result> results;
  std::string currentId;
  EventDetector detector;
  DashboardState state;
  float previousFuel = 0.0f, previousTime = 0.0f;
  bool initialized = false, previousAlert = false;
  std::string line;
  while (std::getline(input, line)) {
    auto row = split(line);
    const std::string id = text(row, columns, "experiment_id");
    if (id != currentId) {
      currentId = id;
      detector = EventDetector();
      state = freshState();
      initialized = false;
      previousAlert = false;
    }
    const float nowS = number(row, columns, "timestamp_s");
    const float fuel = number(row, columns, "filtered_fuel_percent");
    state.vehicle.ignitionOn = number(row, columns, "ignition") > 0.5f;
    state.gps.speedKmh = number(row, columns, "gps_speed_kmh");
    state.gps.speedFresh = number(row, columns, "gps_speed_fresh", number(row, columns, "gps_fresh")) > 0.5f;
    state.gps.moving = number(row, columns, "gps_moving") > 0.5f;
    state.sensor.healthy = number(row, columns, "sensor_valid", 1.0f) > 0.5f;
    state.fuel.filteredPercent = fuel;
    state.fuel.rawPercent = number(row, columns, "raw_fuel_percent", fuel);
    state.fuel.ratePercentPerSec = initialized ? (fuel - previousFuel) / std::max(0.001f, nowS - previousTime) : 0.0f;
    if (!initialized) {
      detector.begin(state, 0);
      initialized = true;
    }
    detector.update(state, static_cast<uint32_t>(nowS * 1000.0f));
    Result& result = results[id];
    result.start = number(row, columns, "behavior_start_s", -1.0f);
    const bool eligible = text(row, columns, "scenario_label") == "DRAIN" && !state.vehicle.ignitionOn && !state.gps.moving && state.sensor.healthy;
    result.expected = result.expected || eligible;
    const bool alert = state.currentEvent.alert == "FUEL_THEFT_ANOMALY";
    if (alert && !previousAlert) {
      result.actual = true;
      result.alerts++;
      if (result.first < 0.0f) result.first = nowS;
    }
    previousAlert = alert;
    result.state = static_cast<int>(detector.state());
    previousFuel = fuel;
    previousTime = nowS;
  }
  std::cout << "experiment_id,theft_alert_expected,actual_alert,first_alert_s,alert_count,detection_delay_s,final_state\n";
  for (const auto& entry : results) {
    const auto& result = entry.second;
    const float delay = result.first >= 0.0f && result.start >= 0.0f ? result.first - result.start : -1.0f;
    std::cout << entry.first << ',' << result.expected << ',' << result.actual << ',' << std::fixed << std::setprecision(3)
              << result.first << ',' << result.alerts << ',' << delay << ',' << result.state << '\n';
  }
  return 0;
}
