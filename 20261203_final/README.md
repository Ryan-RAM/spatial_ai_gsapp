# Frostroot: The Ramble

Final project, Spatial AI (ARCH6956-1), Columbia GSAPP. Group members are listed in the [root README](../README.md).

The night of the record blizzard of January 2016, in Central Park's Ramble: real paths, terrain, trees and hourly weather; an invented creature made of roots. You design the park for the storm night (plowed paths, lamps, warming shelters, signs) and watch who gets out, by hand or over automated epochs.

| | |
|---|---|
| [semantic_model.md](semantic_model.md) | the semantic model: the design the code follows |
| [ROADMAP.md](ROADMAP.md) | task list by milestone, each with its done criteria |
| [DECISIONS.md](DECISIONS.md) | choices made, why, and how to undo them |
| [DEVLOG.md](DEVLOG.md) | session log: what was done, what is next |
| [docs/porting.md](docs/porting.md) | what is reused from the earlier weeks |

Run locally: `npm run serve`, then open http://localhost:8000. Tests: `npm test`. Benchmarks: `npm run bench`.

Data: `npm run fetch` (OpenStreetMap, and the storm record through the [MCP server](mcp/README.md)), then `npm run bake` (the DEM and point-cloud steps fill their caches on the first run). The baked files are in [`data/baked/`](data/baked/) with their [licences](data/baked/LICENSE.md).
