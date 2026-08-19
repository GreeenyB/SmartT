# Video Production

## Current Masters

| Asset | Path | SHA-256 |
| --- | --- | --- |
| V6 English-subtitle master | `production/masters/SmartT_Final_EngSub.mp4` | `14f64044277841191f92d4a6a5152a15d21cad13830b2f83c3d5f5dd3ef682e3` |
| V6 ASS subtitle source | `production/subtitles/SmartT_Final_EngSub.ass` | `2f319a091ad4deea3165c9c8ef07fc71c7cc0455382dd5f8cacb4c40e2ed3b3a` |
| V4 voice-clean master | `production/masters/SmartT_Final_Voice_Clean.mp4` | `81bbd8812304842525bd68c6ec6d0bc63c1a7fdc0e456236f3d994e05195d603` |
| V4 picture lock | `production/masters/SmartT_Picture_Lock.mp4` | `1d5a9250d845d1ee4f4826502b54ae61a007d66b5913996a6edc166bad4c79a5` |
| Theo narration WAV | `production/audio/SmartT_Narration_THEO_Master.wav` | `75a809ad5e840e4d7f5c14b918a42ca5f223a95c8b2bfe3a149f8c1b686df324` |

## Current Pipeline

Entry point:

```sh
node scripts/production/render-smartt-film.mjs --preflight
```

The production script resolves inputs from:

- `production/masters`
- `production/audio`
- `production/subtitles`
- `production/config`
- `production/references/dashboard-showcase-v2`
- `production/references/incident-camera-v2`

It does not depend on legacy cursor generation folders, old audio folders, or review ZIPs.

## Locked References

- Dashboard Showcase v2 source screenshots and QA: `production/references/dashboard-showcase-v2`
- Incident Camera v2.1 source and QA: `production/references/incident-camera-v2`
- Raw dashboard demo reference: `production/references/dashboard/SmartT_BKI_Demo_Raw.webm`
- Cursor timeline and bitmap: `production/config`
- Theo voice lock: `production/audio/THEO_VOICE_LOCK.json`

## Recovery

Frontend dependencies are recovered with `npm ci` in each app. Production masters are intentionally not ignored and must remain byte-identical unless a new master is approved.
