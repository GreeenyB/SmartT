# Cleanup Report

Date: 2026-08-17

## Size

- Before worktree size: 4266407911 bytes
- After worktree size: 213345046 bytes
- Recovered: 4053062865 bytes
- Reduction: 95%

## Major Deleted Generations

- cursor-full-production-v3 (612.75 MB)
- cartesia-final (479.25 MB)
- cursor-full-production-v2 (275.07 MB)
- cursor-full-production (257.25 MB)
- apps\website\node_modules (250.76 MB)
- apps\dashboard\node_modules (237.43 MB)
- cursor-full-production-v4 (236.43 MB)
- cartesia-final (3).zip (223.83 MB)
- apps\dashboard\output (160.18 MB)
- apps.zip (149.71 MB)
- cartesia-final (2).zip (138.99 MB)
- cursor-replay-proof (137.04 MB)
- SmartT_CursorFull_v4_REVIEW.zip (108.85 MB)
- final-audio (102.3 MB)
- SmartT_CursorFull_v3_REVIEW.zip (100.1 MB)

## Current Master Hashes

- V6 EngSub MP4: PASS 14f64044277841191f92d4a6a5152a15d21cad13830b2f83c3d5f5dd3ef682e3
- V6 ASS: PASS 2f319a091ad4deea3165c9c8ef07fc71c7cc0455382dd5f8cacb4c40e2ed3b3a
- V4 Voice Clean: PASS 81bbd8812304842525bd68c6ec6d0bc63c1a7fdc0e456236f3d994e05195d603
- V4 Picture Lock: PASS 1d5a9250d845d1ee4f4826502b54ae61a007d66b5913996a6edc166bad4c79a5
- Theo narration WAV: PASS 75a809ad5e840e4d7f5c14b918a42ca5f223a95c8b2bfe3a149f8c1b686df324

## Current Structure

`	ext
apps/
server/
SmartT_Core_Demo/
diagnostics/
scripts/production/
docs/
production/
`

## Build And Smoke Tests

- Website build: PASS
- Dashboard build: PASS
- Server syntax and health: PASS
- Production preflight: PASS
- ffprobe masters: PASS

## Retained Legacy

- pps/website/.vercel and pps/dashboard/.vercel were retained as deployment metadata.

## Security Scan

Status: PASS

## Stale Reference Scan

Status: PASS

## Surviving Markdown Files

- AGENTS.md
- apps/dashboard/AGENTS.md
- apps/dashboard/public/robots.txt
- apps/website/AGENTS.md
- apps/website/public/robots.txt
- docs/ALGORITHM.md
- docs/ARCHITECTURE.md
- docs/CLEANUP_REPORT.md
- docs/HARDWARE.md
- docs/HISTORY.md
- docs/VIDEO_PRODUCTION.md
- production/audio/SmartT_English_Narration_THEO_FINAL.txt
- production/audio/SmartT_TTS_Copy_THEO_FINAL.txt
- README.md
- server/README.md

