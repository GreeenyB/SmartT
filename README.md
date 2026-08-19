# SmartT

SmartT is a fuel monitoring and fleet telemetry prototype. It combines ESP32 firmware, a local Python telemetry server, a public website, a fleet dashboard, and a locked production film package.

## Architecture

- `apps/website`: public SmartT website.
- `apps/dashboard`: fleet operations dashboard and dashboard demo capture scripts.
- `server`: local Python and SQLite telemetry API, serving static dashboard files from `server/static/dashboard`.
- `SmartT_Core_Demo`: ESP32 firmware and embedded dashboard.
- `diagnostics`: hardware validation sketches.
- `production`: locked current film masters, Theo audio, subtitles, cursor config, and minimal rebuild references.
- `scripts/production`: current film production entry point and helper.
- `docs`: compact architecture, hardware, video, algorithm, history, and cleanup notes.

## Quick Start

Install frontend dependencies after a clean checkout:

```sh
cd apps/website && npm ci
cd ../dashboard && npm ci
```

Run the website:

```sh
cd apps/website
npm run dev
```

Run the dashboard:

```sh
cd apps/dashboard
npm run dev
```

Run the local telemetry server:

```sh
python server/app.py
```

The server defaults to `http://localhost:8000` and exposes `/api/health`, `/api/latest`, `/api/history`, `/api/events`, and `/api/ingest`.

## Firmware

Open `SmartT_Core_Demo/SmartT_Core_Demo.ino` in Arduino IDE with the ESP32 Dev Module board selected. Hardware wiring and bring-up are documented in `docs/HARDWARE.md`.

## Production Film

Current locked masters live in `production/masters`:

- `SmartT_Final_EngSub.mp4`
- `SmartT_Final_Voice_Clean.mp4`
- `SmartT_Picture_Lock.mp4`

Current production entry point:

```sh
node scripts/production/render-smartt-film.mjs --preflight
```

Full video production notes and hashes are in `docs/VIDEO_PRODUCTION.md`.

## Development Commands

```sh
cd apps/website && npm run build
cd apps/dashboard && npm run build
python -m py_compile server/app.py
node scripts/production/render-smartt-film.mjs --preflight
```

Use npm for both frontend apps. Do not delete or rewrite firmware, backend, locked media masters, or Vercel project metadata unless a task explicitly calls for it.
