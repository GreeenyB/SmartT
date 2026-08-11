# SmartT Website

The SmartT website presents the team’s developing fuel-monitoring and fleet-telemetry system,
its product direction, processing approach, desktop operations console, and three focused mobile
workflows.

## Run locally

Requirements:

- Node.js 20 or newer
- npm, Bun, or another package manager compatible with `package.json`

```sh
npm install
npm run dev
```

Create a production build:

```sh
npm run build
```

Check formatting and lint rules:

```sh
npm run format
npm run lint
```

## Project structure

```text
src/
├── components/
│   ├── layout/                   # Site header and footer
│   ├── shared/                   # Reusable motion helpers
│   └── ui/                       # Lovable/shadcn UI primitives
├── features/
│   ├── device-showcase/          # Desktop dashboard and three mobile views
│   └── hardware-showcase/        # Existing interactive 3D system study
├── hooks/
├── lib/
├── routes/                       # TanStack Start file-based routes
└── sections/home/                # Landing-page sections

public/
├── hardware/                     # Transparent photorealistic device renders
├── favicon.ico
└── smartt-logo.png

concept/
└── SmartT-Vehicle-Unit-Concept.png # Standalone visual study; not used by the website
```

## Editing guide

- Compose the home page in `src/routes/index.tsx`.
- Edit individual landing-page sections in `src/sections/home`.
- Edit the laptop dashboard and mobile screens in
  `src/features/device-showcase/DeviceShowcase.tsx`.
- Device-to-screen alignment is controlled by
  `src/features/device-showcase/device-showcase.css`.
- Do not edit `src/routeTree.gen.ts` manually; TanStack Start generates it.

## Technology

- React 19
- TanStack Start
- TypeScript
- Tailwind CSS
- Motion
- Recharts
- Three.js

The original Lovable project metadata and configuration are preserved so the source can continue
to sync with Lovable or be maintained independently.

## Content policy

The public copy separates current development from intended product direction. Do not add
performance claims, pilot figures, customer results, or commercial-readiness statements without
evidence. The 3D carousel is retained as an early visual study and is not a final bill of materials
or enclosure definition.
