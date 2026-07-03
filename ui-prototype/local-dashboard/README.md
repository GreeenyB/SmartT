# SmartT Local Fleet Dashboard

This folder is the official source for the SmartT Local Fleet Dashboard. It is the laptop/server Fleet Operations Console for fleet review, map context, fuel events, date filters, operational summary, live vehicle context, and incident evidence.

The dashboard uses the cropped SmartT compact logo at `assets/smartt-logo-compact-cropped.png` for the branded sidebar header. The original logo remains at `assets/smartt-logo-compact.png`.

## Standalone Preview

Open this file directly in a browser:

```text
ui-prototype/local-dashboard/index.html
```

When opened from the filesystem, the dashboard uses built-in sample data from `sample_data.js`. The preview scenario selector is for sample mode and switches between normal operations, refuel, and parked drop samples.

## Local Server Mode

When served by SmartT Local Server, the dashboard tries the local APIs first:

- `/api/latest`
- `/api/history`
- `/api/events`

If those APIs are unavailable, the page falls back to sample data so the UI remains usable.

Run the server from the repository root:

```text
python server/app.py
```

Then open:

```text
http://localhost:8000
```

## Map Notes

- Uses Leaflet with OpenStreetMap tiles.
- No Google Maps, Mapbox, MapTiler, or API key is required.
- Internet access is required for map tiles and the Leaflet CDN.
- If map assets are unavailable, coordinates remain visible in popups and the evidence panel.

## Features

- Current vehicle marker with fuel, decision, ignition, GPS, and timestamp popup.
- Event markers with differentiated colors for confirmed refuel, pending candidate, sloshing/noise, suspicious drop, and sensor fault events.
- Recenter, fit events, show events, and open in OpenStreetMap controls.
- Today, 7 days, 30 days, and all-data date filters.
- Sticky left operations sidebar with vehicle, range, data-source mode, sample preview scenario, CSV export, and server/device status.
- Main console header with selected vehicle, current decision, and last telemetry timestamp.
- Hierarchical summary strip for current fuel, current decision, events, suspicious loss, and last refuel.
- Wide fuel timeline beside a live vehicle context panel with ignition, GPS, motion, speed, signal, sloshing, confidence, and source type.
- Incident workspace with the map and event history stacked together on the left and the evidence panel on the right.
- Event history under the map with full timestamps.
- Grouped incident evidence panel with a compact summary plus event, fuel change, vehicle/GPS context, signal quality, and decision evidence.
- Candidate events display as pending/candidate and are excluded from the confirmed suspicious loss KPI.
- CSV export for currently filtered events.
- Vehicle selector ready for multiple vehicles.


## Logo sizing note

The sidebar uses the cropped SmartT logo at a conservative width so the logo and the `SmartT Fuel Intelligence / Local Fleet` text group stay balanced without text collision.
