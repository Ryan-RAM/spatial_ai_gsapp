# Low Sky: NYC Air Agents

**Spatial AI (ARCH6956-1), Columbia GSAPP. Assignment: Spatial Agents.**

Delivery drones and helicopters in the low airspace (below 1,300 ft) of Lower and Midtown Manhattan, over the Hudson and the
East River. We designed a rule layer (a one-way river loop, altitude bands, no-fly zones, landing sites). The agents start
without knowing it, find it through their vision cones, map the city, leave landmarks and reuse them. All paths and the
landmark heat maps then show where the rules jam.

**Live page:** https://ryan-ram.github.io/spatial_ai_gsapp/20261110_agents/

## Open it

**Nothing to install or run.** Any of these opens the full page (a modern browser and internet access for three.js):

- **Double-click [`low-sky.html`](low-sky.html)** (one self-contained file; also works copied to a USB stick or laptop).
- The live page: https://ryan-ram.github.io/spatial_ai_gsapp/20261110_agents/ (after this branch is merged to `main`).

The page simulates the first 10 minutes while it loads (about 5 seconds), then opens on step 1. The step buttons under the view
(1 Rule layer … 8 Shared knowledge) are the presentation: each sets the camera and the layers and shows a caption.
**Fast-forward 30 min** lets the agents learn more before the collective views.

The city is a simplified, simulated Manhattan (rotated street grid, Central Park, Midtown and Downtown towers, the rivers and
islands); it is not real building data. Real NYC data is optional: see [`docs/data.md`](docs/data.md).

## For developers

```bash
npm install          # esbuild, three.js (for the build, the tests' screenshots)
npm test             # node:test suites
npm run build        # rebuild low-sky.html from src/ after a change
npm run sim          # 60 simulated minutes headless, prints the performance summary
npm run capture      # screenshots and a short video into media/
```

## Why three.js

The earlier assignments use plain ES modules and three.js 0.160 (CDN import map); three.js does 3D, so this one uses the same
stack. The modules run as they are (no build step while developing); `npm run build` only packs them into the one-file `low-sky.html`. The simulation core runs in the browser and in Node.

## Contents

- [`docs/agents.md`](docs/agents.md): the two agent types, and how each assignment item is met.
- [`docs/rules.md`](docs/rules.md): the rule layer, the real rules it is based on, conflicts between sources.
- [`docs/data.md`](docs/data.md): the building and shoreline data, and the processing pipeline.
- [`docs/results.md`](docs/results.md): what a two-hour run shows.
- [`src/sim/config.js`](src/sim/config.js): every parameter (site, bands, lanes, zones, agents, population).
- `src/sim/` simulation (no DOM), `src/render/` three.js view, `src/ui/` page, `data/scripts/` data pipeline,
  `tests/` tests and the headless run, `tools/` local server and capture, `media/` screenshots and video.
