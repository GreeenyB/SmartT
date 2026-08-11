# SmartT Codex Guide

- `apps/website` is the canonical public SmartT website.
- `apps/dashboard` is the canonical SmartT fleet dashboard.
- `server` is the local/backend service layer.
- `SmartT_Core_Demo` is firmware and device work.
- `diagnostics` contains diagnostic utilities and data.
- `docs` contains project documentation.
- `ui-prototype` is legacy material pending review; do not delete it until explicitly approved.

Operational rules:

- Use npm for both frontend apps; keep `package.json` and `package-lock.json` canonical.
- Preserve used visual assets byte-for-byte unless explicitly asked to modify them.
- Do not touch firmware or backend code while working on frontend unless requested.
- Do not deploy, link, create, or delete Vercel projects without explicit instruction.
- Build after meaningful frontend changes.
- Avoid broad formatting-only rewrites.
