# SmartT Local Server

Run the local dashboard server from the repository root:

```text
python server/app.py
```

The server listens on `http://localhost:8000` by default and serves the official Local Fleet Dashboard source directly from `ui-prototype/local-dashboard/`.

If port 8000 is already in use:

```text
python server/app.py --port 8001
```

SQLite runtime data is stored in `server/data/smartt.db` and persists after server restart. Database files are ignored by git; keep `server/data/.gitkeep`.

To let the ESP32 push telemetry to this server, copy `SmartT_Core_Demo/Secrets.example.h` to `SmartT_Core_Demo/Secrets.h`, set `SMARTT_WIFI_SSID`, `SMARTT_WIFI_PASS`, and set `SMARTT_SERVER_URL` to this server's `/api/ingest` URL. The firmware still runs without `Secrets.h`.

The dashboard map uses Leaflet with OpenStreetMap tiles. No Google Maps, Mapbox, MapTiler, or API key is required, but internet access is needed for map tiles and CDN assets.

## API

- `GET /api/health`
- `GET /api/latest`
- `GET /api/history`
- `GET /api/events`
- `POST /api/ingest`

Optional `vehicle_id`, `start`, `end`, and `limit` query parameters are supported for history and events.
