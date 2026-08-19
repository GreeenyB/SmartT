HardwareSerial STM32Serial(2);

void setup()
{
    Serial.begin(115200);

    STM32Serial.begin(
        460800,
        SERIAL_8N1,
        16,     // RX2
        17      // TX2
    );

    Serial.println("ESP32 READY");
}

void loop()
{
    while (STM32Serial.available())
    {
        char c = STM32Serial.read();

        // In dữ liệu STM32 lên Serial Monitor
        Serial.write(c);
    }
}