# SmartT Local Server

Run from the repository root:

```sh
python server/app.py
```

The server listens on `http://localhost:8000` by default and serves the Local Fleet Dashboard static files from `server/static/dashboard`.

Use another port if needed:

```sh
python server/app.py --port 8001
```

SQLite runtime data is stored in `server/data/smartt.db`. Database files are ignored by git; keep `server/data/.gitkeep`.

## API

- `GET /api/health`
- `GET /api/latest`
- `GET /api/history`
- `GET /api/events`
- `POST /api/ingest`

History and events support optional `vehicle_id`, `start`, `end`, and `limit` query parameters.

To let the ESP32 push telemetry here, copy `SmartT_Core_Demo/Secrets.example.h` to `SmartT_Core_Demo/Secrets.h`, set Wi-Fi values, and set `SMARTT_SERVER_URL` to this server's `/api/ingest` URL.

The static dashboard uses Leaflet with OpenStreetMap tiles. No map API key is required, but internet access is needed for map tiles and CDN assets.
