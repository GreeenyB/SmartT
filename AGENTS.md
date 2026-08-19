# SmartT Codex Guide

## Project Layout

- `apps/website` is the canonical public SmartT website.
- `apps/dashboard` is the canonical SmartT fleet dashboard and demo capture source.
- `server` is the local Python/SQLite backend and serves `server/static/dashboard`.
- `SmartT_Core_Demo` is authoritative firmware and device work.
- `diagnostics` contains hardware diagnostic sketches.
- `production` contains locked film masters, Theo audio, subtitles, cursor config, and minimal references.
- `scripts/production` contains the current film production entry point.
- `docs` contains compact durable project documentation.

## Source Of Truth

- Current film entry point: `scripts/production/render-smartt-film.mjs`.
- Current subtitle master: `production/subtitles/SmartT_Final_EngSub.ass`.
- Current narration master: `production/audio/SmartT_Narration_THEO_Master.wav`.
- Current voice lock: `production/audio/THEO_VOICE_LOCK.json`.
- Current cursor config: `production/config/cursor-full-timeline.json` and `production/config/cursor-26px.png`.
- Current server dashboard static source: `server/static/dashboard`.

## Operating Rules

- Use npm for both frontend apps; keep `package.json` and `package-lock.json` canonical.
- Preserve locked visual/audio assets byte-for-byte unless explicitly asked to modify them.
- Do not touch firmware or backend code while working on frontend unless requested.
- Do not deploy, link, create, or delete Vercel projects without explicit instruction.
- Build after meaningful frontend changes.
- Avoid broad formatting-only rewrites.
- Do not recreate obsolete review ZIPs, cursor generation folders, or old audio audition workspaces.
- Generated dependencies and caches are disposable; recover with `npm ci`.
