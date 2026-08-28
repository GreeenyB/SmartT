#pragma once

#include <cstddef>
#include <cstdint>
#include <string>

class String {
 public:
  String() = default;
  String(const char* value) : value_(value ? value : "") {}
  String(const std::string& value) : value_(value) {}

  String& operator=(const char* value) {
    value_ = value ? value : "";
    return *this;
  }

  bool operator==(const String& other) const { return value_ == other.value_; }
  bool operator!=(const String& other) const { return !(*this == other); }
  bool operator==(const char* other) const { return value_ == (other ? other : ""); }
  bool operator!=(const char* other) const { return !(*this == other); }
  std::size_t length() const { return value_.length(); }

 private:
  std::string value_;
};

inline bool operator==(const char* left, const String& right) { return right == left; }
inline bool operator!=(const char* left, const String& right) { return !(right == left); }
