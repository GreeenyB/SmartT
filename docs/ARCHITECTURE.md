# Architecture

SmartT has four active surfaces:

- Public website: `apps/website`
- Fleet dashboard: `apps/dashboard`
- Local telemetry server: `server`
- ESP32 firmware: `SmartT_Core_Demo`

The server stores local telemetry in SQLite under `server/data` and serves the static local dashboard from `server/static/dashboard`. The firmware can push telemetry to the server `/api/ingest` endpoint when configured with a server URL.

The web apps are npm projects using TanStack Start, Vite, React, and TypeScript. Their `package-lock.json` files are canonical. Generated dependency folders are intentionally not stored.

The production film pipeline is separated from app source. Locked masters and rebuild references live under `production`; current rendering logic lives under `scripts/production`.

## Runtime Boundaries

- Frontend app source stays in `apps`.
- Backend and local static dashboard stay in `server`.
- Firmware and hardware diagnostics stay in `SmartT_Core_Demo` and `diagnostics`.
- Film masters and video-specific references stay in `production`.
- Historical notes stay in `docs/HISTORY.md`, not in scattered emergency files.
