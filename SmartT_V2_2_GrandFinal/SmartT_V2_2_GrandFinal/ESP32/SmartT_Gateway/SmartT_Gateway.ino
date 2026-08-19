#include <WiFi.h>
#include <HTTPClient.h>

/* ================================================================
 * SmartT V2.2 STM32 -> ESP32 -> Backend gateway
 *
 * STM32 USART2 460800 -> ESP32 UART2 (RX=16, TX=17)
 * Each STM32 record is one JSON line. The gateway keeps a bounded queue,
 * retries HTTP delivery, and preferentially drops telemetry rather than a
 * confirmed event when the queue is full.
 * ================================================================ */

static const char *WIFI_SSID = "YOUR_WIFI_SSID";
static const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
static const char *INGEST_URL = "http://192.168.1.10:8000/api/v2/ingest";

HardwareSerial STM32Serial(2);

static const uint32_t WIFI_RETRY_MS = 10000;
static const uint32_t HTTP_RETRY_MS = 1000;
static const size_t MAX_LINE = 2400;
static const uint8_t QUEUE_SIZE = 24;

struct QueueItem
{
  String line;
  bool eventRecord;
};

QueueItem queueBuf[QUEUE_SIZE];
uint8_t qCount = 0;
String rxLine;
uint32_t lastWifiAttempt = 0;
uint32_t lastHttpAttempt = 0;
uint32_t droppedTelemetry = 0;
uint32_t droppedEvents = 0;
uint32_t deliveredRecords = 0;

static bool isEventRecord(const String &line)
{
  return line.indexOf("\"record_type\":\"event\"") >= 0;
}

static void removeAt(uint8_t index)
{
  if (index >= qCount)
    return;
  for (uint8_t i = index; i + 1U < qCount; ++i)
    queueBuf[i] = queueBuf[i + 1U];
  queueBuf[qCount - 1U].line = String();
  queueBuf[qCount - 1U].eventRecord = false;
  qCount--;
}

static bool enqueueRecord(const String &line)
{
  if (line.length() == 0 || line.length() > MAX_LINE)
    return false;

  const bool incomingEvent = isEventRecord(line);

  if (qCount >= QUEUE_SIZE)
  {
    int telemetryIndex = -1;
    for (uint8_t i = 0; i < qCount; ++i)
    {
      if (!queueBuf[i].eventRecord)
      {
        telemetryIndex = (int)i;
        break;
      }
    }

    if (telemetryIndex >= 0)
    {
      removeAt((uint8_t)telemetryIndex);
      droppedTelemetry++;
    }
    else
    {
      /* Queue contains confirmed events only. Never silently evict an old
       * event to make room for ordinary telemetry. If another event arrives,
       * the newest cannot be stored and the status counter exposes it. */
      if (incomingEvent)
        droppedEvents++;
      else
        droppedTelemetry++;
      return false;
    }
  }

  queueBuf[qCount].line = line;
  queueBuf[qCount].eventRecord = incomingEvent;
  qCount++;
  return true;
}

static void connectWiFiIfNeeded()
{
  if (WiFi.status() == WL_CONNECTED)
    return;

  const uint32_t now = millis();
  if ((now - lastWifiAttempt) < WIFI_RETRY_MS)
    return;

  lastWifiAttempt = now;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

static bool deliverFront()
{
  if (qCount == 0 || WiFi.status() != WL_CONNECTED)
    return false;

  HTTPClient http;
  http.setTimeout(1500);
  if (!http.begin(INGEST_URL))
    return false;

  http.addHeader("Content-Type", "application/json");
  const int status = http.POST(
      (uint8_t *)queueBuf[0].line.c_str(), queueBuf[0].line.length());
  http.end();

  if (status >= 200 && status < 300)
  {
    removeAt(0U);
    deliveredRecords++;
    return true;
  }

  return false;
}

void setup()
{
  Serial.begin(115200);
  STM32Serial.begin(460800, SERIAL_8N1, 16, 17);
  rxLine.reserve(MAX_LINE);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWifiAttempt = millis();

  Serial.println("SmartT V2.2 gateway ready");
}

void loop()
{
  while (STM32Serial.available())
  {
    const char c = (char)STM32Serial.read();

    if (c == '\n')
    {
      rxLine.trim();
      if (rxLine.startsWith("{") && rxLine.endsWith("}"))
        (void)enqueueRecord(rxLine);
      rxLine = "";
    }
    else if (c != '\r')
    {
      if (rxLine.length() < MAX_LINE)
        rxLine += c;
      else
        rxLine = "";  // malformed/oversized line; resync at next newline
    }
  }

  connectWiFiIfNeeded();

  const uint32_t now = millis();
  if (qCount > 0 && (now - lastHttpAttempt) >= HTTP_RETRY_MS)
  {
    lastHttpAttempt = now;
    (void)deliverFront();
  }

  static uint32_t lastStatus = 0;
  if ((now - lastStatus) >= 5000U)
  {
    lastStatus = now;
    Serial.printf(
        "wifi=%s queue=%u delivered=%lu drop_tel=%lu drop_event=%lu\n",
        WiFi.status() == WL_CONNECTED ? "up" : "down",
        qCount,
        (unsigned long)deliveredRecords,
        (unsigned long)droppedTelemetry,
        (unsigned long)droppedEvents);
  }
}
