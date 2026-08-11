<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

<!-- SMARTT:BEGIN -->
# SmartT design-refinement guardrails

This repository is an existing SmartT product website. Refine it in place; do not rebuild it from scratch.

## Core product/design rules
- Preserve route structure, SmartT branding, existing content sections, light-theme direction, responsive behavior, Vercel compatibility and currently working functionality unless a task explicitly changes one of them.
- Do not invent unsupported SmartT capabilities, hardware integrations, APIs or live-data claims.
- Treat `_references/` as READ-ONLY design/reference material. Never import reference ZIPs into the production bundle.
- Prefer meaningful product visuals over decoration. Every major visual should explain the system, show the real product, show operational evidence, show a workflow, or show credible architecture.
- Avoid generic AI/SaaS visual tropes: gradient accent strips on cards, colored left borders as decoration, ubiquitous glow, heavy glassmorphism, endless rounded cards, repeated icon-in-colored-square motifs, radial gauges without a strong reason, pill soup, arbitrary cyan gradients, fake decorative maps, decorative sine waves, and symmetrical feature-card grids used only to fill space.
- Create hierarchy through typography, spacing, alignment, composition, authentic dashboard/product content and restrained interaction.

## Device showcase direction
- The laptop screen is an interactive portal into the SmartT operations dashboard.
- Screen content must be precisely clipped/masked inside the physical screen bezel at every responsive size. No dashboard layer, glow or transition may bleed outside the black bezel.
- Keep the hardware image visually above screen content.
- The idle laptop should look like a natural product mockup, not a CTA banner.
- Hover interaction should be restrained and integrated into the screen. Avoid large dark floating overlays.
- Click transition should animate toward the screen bounds, respect `prefers-reduced-motion`, then navigate to the configured dashboard URL.
- Reconceive the three phones as one continuous operational story: Fleet -> Vehicle/Fuel timeline -> Incident evidence. Do not create three mini dashboards.

## Development convenience
- Add a Windows one-click launcher named `RUN SmartT Website.bat` when requested.
- It should check for Node.js/npm, install dependencies only when necessary, start the existing dev server, open the local site in the default browser, keep the terminal visible for logs, and report failures clearly.
- Do not alter the app architecture or package manager just for the launcher.

## Workflow
- Work in checkpoints and keep changes reviewable.
- Run available typecheck/build/lint commands after meaningful changes.
- Summarize files changed and any known visual caveats after each checkpoint.
<!-- SMARTT:END -->
