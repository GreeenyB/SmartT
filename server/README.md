# SmartT Local Server

The SmartT Local Server receives telemetry from the ESP32 over Wi-Fi, stores
telemetry and fuel events in SQLite, and serves a local fleet dashboard from the
laptop.

## Architecture

```text
ESP32 -> HTTP POST -> Flask server -> SQLite -> local dashboard
```

The ESP32 continues sensing, event detection, OLED output, and its embedded
fallback dashboard even if the local server is offline.

## Install On Windows

```powershell
cd server
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

## Run

```powershell
python app.py
```

Open:

```text
http://localhost:8000
```

The server listens on `0.0.0.0:8000` by default so an ESP32 on the same Wi-Fi or
hotspot can post telemetry to it.

## Find The Laptop IP

Run:

```powershell
ipconfig
```

Use the IPv4 address for the Wi-Fi or hotspot adapter. The ESP32 ingest URL is:

```text
http://<LAPTOP_IP>:8000/api/ingest
```

## Configure ESP32 Wi-Fi

Copy:

```text
SmartT_Core_Demo/Secrets.example.h
```

to:

```text
SmartT_Core_Demo/Secrets.h
```

Then edit:

```cpp
#define SMARTT_WIFI_SSID "YourWiFiName"
#define SMARTT_WIFI_PASSWORD "YourWiFiPassword"
#define SMARTT_SERVER_URL "http://<LAPTOP_IP>:8000/api/ingest"
```

Do not commit `Secrets.h`.

## Load Sample Data

Sample files are available under `server/sample_data/`.

```powershell
python app.py --load-sample sample_data/normal_day.json
python app.py --load-sample sample_data/refuel_event.json
python app.py --load-sample sample_data/parked_drop_event.json
```

Loading samples inserts rows into the existing database. It does not delete old
data.

## API Endpoints

- `GET /api/health`: server status, database path, latest telemetry time, and count
- `POST /api/ingest`: telemetry ingest endpoint for the ESP32
- `GET /api/latest`: latest telemetry row
- `GET /api/history?limit=500`: recent telemetry rows
- `GET /api/events?limit=100`: recent event rows
- `GET /`: local dashboard

## Map Notes

The dashboard uses Leaflet with OpenStreetMap tiles. No API key is required for
this local prototype. Internet access is needed for map tiles. If Leaflet or map
tiles are unavailable, the dashboard continues to show telemetry, events, GPS
state, and coordinates when present.

## Data Persistence

SQLite data is stored at:

```text
server/data/smartt.db
```

The database remains after server shutdown and is reused on the next startup.
Data generated while the server is down is not stored unless the ESP32 resends
it.

## Limitations

- Local prototype only
- No authentication
- No cloud backend
- SQLite is for local prototype use
- GPS location requires a fix from the ESP32 GPS module
- Map tiles require internet access
- The ESP32 runs independently if the server is offline
