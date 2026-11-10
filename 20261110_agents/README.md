# Low Sky: NYC Air Agents

**Spatial AI (ARCH6956-1), Columbia GSAPP. Assignment: Spatial Agents.**

Delivery drones and helicopters in the low airspace (below 1,300 ft) of Lower and Midtown Manhattan, over the Hudson and the
East River. We designed a rule layer (a one-way river loop, altitude bands, no-fly zones, landing sites). The agents start
without knowing it, find it through their vision cones, map the city, leave landmarks and reuse them. All paths and the
landmark heat maps then show where the rules jam.

**Live page:** https://ryan-ram.github.io/spatial_ai_gsapp/20261110_agents/

## Run

```bash
python3 -m http.server        # in this folder, then open http://localhost:8000/
npm install                   # once: three.js for the tests' screenshots (the page itself uses the CDN)
npm test                      # node:test suites
npm run sim                   # 60 simulated minutes headless, prints the performance summary
npm run capture               # screenshots and a short video into media/
```

Real buildings: `python3 data/scripts/fetch_nyc.py` then `python3 data/scripts/process_nyc.py`. Until then the page runs on a
synthetic placeholder city and says so in the top-left corner.

## Why three.js

The earlier assignments use plain ES modules and three.js 0.160 (CDN import map); three.js does 3D, so this one uses the same
stack: no build step, the simulation core runs in the browser and in Node.

## Contents

- [`docs/agents.md`](docs/agents.md): the two agent types, and how each assignment item is met.
- [`docs/rules.md`](docs/rules.md): the rule layer, the real rules it is based on, conflicts between sources.
- [`docs/data.md`](docs/data.md): the building and shoreline data, and the processing pipeline.
- [`docs/results.md`](docs/results.md): what a two-hour run shows.
- [`src/sim/config.js`](src/sim/config.js): every parameter (site, bands, lanes, zones, agents, population).
- `src/sim/` simulation (no DOM), `src/render/` three.js view, `src/ui/` page, `data/scripts/` data pipeline,
  `tests/` tests and the headless run, `tools/` local server and capture, `media/` screenshots and video.
