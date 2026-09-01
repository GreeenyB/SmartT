# SmartT - Những Thứ Cần Sửa Trước Khi Chạy

## 1. Cấu hình WiFi & Server (BẮT BUỘC)

### ESP32 Core Demo (`SmartT_Core_Demo/`)
- [ ] Tạo file `Secrets.h` trong thư mục `SmartT_Core_Demo/` với nội dung:
  ```cpp
  #pragma once
  #define SMARTT_WIFI_SSID "TEN_WIFI_CUA_BAN"
  #define SMARTT_WIFI_PASS "MAT_KHAU_WIFI"
  #define SMARTT_SERVER_URL "http://192.168.x.x:8000"
  ```
- [ ] Hoặc sửa trực tiếp `Config.h:19-29` thay thế giá trị trống

### ESP32 Gateway (`SmartT_V2_2_GrandFinal/ESP32/SmartT_Gateway/`)
- [ ] Sửa `SmartT_Gateway.ino:13-15`:
  ```cpp
  static const char *WIFI_SSID = "TEN_WIFI_CUA_BAN";
  static const char *WIFI_PASSWORD = "MAT_KHAU_WIFI";
  static const char *INGEST_URL = "http://IP_SERVER:8000/api/v2/ingest";
  ```

---

## 2. Calibrate Tank Nhiên Liệu (BẮT BUỘC cho STM32)

### File: `SmartT_V2_2_GrandFinal/Core/Src/smartt_engine.c:26-34`
- [ ] Đo chiều cao tank thực tế (mm) và thể tích tương ứng (lít)
- [ ] Thay thế LUT mẫu bằng điểm đo thật:
  ```c
  static const SmartT_TankCalPoint_t tank_calibration[] =
  {
      {   0.0f,   0.0f },    // Đáy tank
      {  XX.0f,  YY.0f },    // Điểm đo 1
      {  XX.0f,  YY.0f },    // Điểm đo 2
      ...
      {  MAX_HEIGHT, TOTAL_CAPACITY }
  };
  ```
- [ ] Sau khi calibrate xong, bật flag trong `smartt_config.h:17`:
  ```c
  #define SMARTT_TANK_CALIBRATION_READY  1U
  ```

### File: `SmartT_V2_2_GrandFinal/Core/Inc/smartt_config.h:21-22`
- [ ] Đo khoảng cách từ mặt cảm biến siêu âm đến đáy tank:
  ```c
  #define SMARTT_SENSOR_TO_TANK_BOTTOM_MM  <giá_trị_thực_mm>
  #define SMARTT_TANK_MAX_FUEL_HEIGHT_MM   <chiều_cao_tank_mm>
  ```

---

## 3. Stack Size (KHUYẾN NGHỊ)

### File: `SmartT.ioc:193` hoặc CubeMX → Project Manager → Stack Size
- [ ] Tăng stack từ `0x400` (1KB) lên `0x800` (2KB) hoặc `0xC00` (3KB)
- [ ] Lý do: `SmartT_TelemetrySend()` dùng buffer JSON 2300 bytes trên stack, risk overflow nếu có nested interrupt

---

## 4. Kiểm Tra Phần Cứng Trước Khi Flash

### STM32 GrandFinal
- [ ] Nối UART2 (PA2/PA3) ↔ ESP32 Gateway (GPIO16/17)
- [ ] Nối CAN transceiver PB8/PB9 ↔ OBD-II port xe
- [ ] Nối MPU6050 I2C PB6/PB7
- [ ] Nối GPS USART3 PB10/PB11
- [ ] Nối Ultrasonic USART6 PC7 (RX only)
- [ ] Nối TFT LCD FSMC (PD/PE bus + PD13 A18)
- [ ] Cấp nguồn 3.3V ổn định cho STM32

### ESP32 Core Demo
- [ ] Nối ADS1115 I2C SDA=21, SCL=22, ADDR→GND
- [ ] Nối OLED SPI: SCK=5, MOSI=23, DC=16, RST=17, CS=18
- [ ] Nối GPS UART2: RX=13, TX=14
- [ ] Nối ignition sense GPIO19 (INPUT_PULLUP, LOW = ON)
- [ ] Nối test button GPIO4 (INPUT_PULLUP, LOW = pressed)
- [ ] Nối alert LED GPIO15 (optional)

### ESP32 Gateway
- [ ] Nối UART2 RX=16, TX=17 ↔ STM32 USART2
- [ ] Cấp nguồn riêng hoặc chung GND với STM32

---

## 5. Backend Server (nếu cần pipeline đầy đủ)

- [ ] Chạy Python server trong thư mục `server/`:
  ```bash
  cd server
  pip install -r requirements.txt
  python app.py
  ```
- [ ] Đảm bảo endpoint `/api/v2/ingest` (STM32 gateway) và `/api/ingest` (ESP32 Core Demo) đều available
- [ ] Kiểm tra firewall cho phép port 8000

---

## 6. Thư Viện Arduino Cần Cài (ESP32)

Trong Arduino IDE Library Manager hoặc PlatformIO:
- [ ] `Adafruit ADS1X15`
- [ ] `Adafruit GFX Library`
- [ ] `Adafruit SSD1306`
- [ ] `TinyGPS++`

---

## 7. Kiểm Tra Sau Khi Flash

### ESP32 Core Demo
- [ ] Mở Serial Monitor 115200 → xem boot log
- [ ] Kết nối WiFi AP `SmartT-BKUIT-OPEN` (không mật khẩu)
- [ ] Truy cập `http://192.168.4.1` → dashboard hiện dữ liệu real-time
- [ ] Nhấn test button GPIO4 → xác nhận event TEST_BUTTON xuất hiện

### STM32 + Gateway
- [ ] Mở Serial Monitor ESP32 Gateway 115200 → xem `wifi=up queue=X delivered=Y`
- [ ] Kiểm tra backend nhận được JSON telemetry mỗi 500ms
- [ ] Kiểm tra event record gửi ngay khi phát hiện (không đợi chu kỳ)

---

## 8. Known Issues / Limitations

| Vấn đề | Ảnh hưởng | Workaround |
|--------|-----------|------------|
| Tank chưa calibrate | Fuel % hiển thị CALIB, events disabled | Calibrate trước khi demo |
| WiFi credentials trống | Gateway không kết nối, Core Demo chỉ AP mode | Tạo Secrets.h |
| Stack 1KB | Risk overflow khi gửi telemetry lớn | Tăng lên 2-3KB |
| CAN mode DISABLED | Không đọc được OBD-II data | Bật `SMARTT_CAN_MODE_OBD2_11BIT_500K` sau khi verify wiring |
| GPS cold start | Mất 30-60s để có fix đầu tiên | Chờ ngoài trời thoáng |

---

## Priority

1. **P0 (chặn chạy):** WiFi credentials, tank calibration
2. **P1 (risk crash):** Stack size
3. **P2 (chức năng thiếu):** CAN enable, backend server
4. **P3 (nice-to-have):** Hardware verification checklist

</parameter=