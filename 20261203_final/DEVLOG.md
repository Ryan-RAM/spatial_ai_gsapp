# DEVLOG

Newest entry first. Each session ends with a few lines: what was done, what is next, open problems.

## 2026-11-16 (continued): M3 done

**Done**
- M3.1 knowledge.js ported (own map, vision cut at the baked horizon, incremental frontiers, planning on beliefs only), M3.2 landmarks (chain of offsets; recognised from the path graph, places, plan, cover), M3.3 creature (mapping at dusk, patrol, investigate, track, chase, search, ambush; light-averse; night-long memory), M3.4-M3.6 survivor (drift and fixes, K3 by d_V, warmth look-ahead to shelters, flee, hide, call out), M3.7 replan cap, M3.8 metrics and F / F'.
- Nights are (zone, seed): mapping at dusk then 6 rounds; 4 independent nights per suite (D-029).
- 138 tests pass (+1 live).

**Balance and speed** (empty plan, 48 survivor rounds): escaped 0 %, caught 35 %, collapsed 38 %, lost 27 %; F = -0.19, F' = 0.50. One plowed route to E79S gives escapes (D-029). Whole suite **2.0 s serial, 85 ms per round** incl. mapping: both targets of CLAUDE.md §3 are met before parallelising.

**Next**
- M4: bench completeness and regression guards (most targets already met), then M5.1 style frame (checkpoint: stop and show Ryan).

**Notes**
- Nobody escapes on the empty plan: in 66 cm of snow survivors manage ~250 m east in 30 min against ~490 m to the nearest exit. This is the model's premise (plowing is ~3x faster) and gives the generator work to do, but the fitness landscape is flat near the empty plan; watch this in M6 (seeded presets may help).

## 2026-11-16 (continued): M2 done

**Done**
- M2.1 loader (Node + browser, ~40 ms in Chromium), M2.2 frames (W/P/N/E + landmark chain), M2.3 storm clock, M2.4 four distances with axiom checks (§15 item 1 holds: in the north wind the creature to the south hears the survivors first), M2.5 snow and tracks, M2.6 warmth (k from the record, D-025), M2.7 movement and catching, M2.8 interventions (I1-I3, local light updates), M2.9 rounds, suite, reproducibility and common random numbers.
- Two model contradictions resolved: track fill constants (D-024: §15 needs 3 cm and a wind coefficient of 6, not 10 cm and 2).
- 113 tests pass (+1 live MCP test).
- One slip: commit e2c0e3e was pushed with a failing test (my grep let the chain continue); fixed in 5540f91. Commits are now gated on `npm test`'s exit status.

**Bench baseline** (before any optimisation, 4-core container): world load 10 ms; 10,000 LOS rays 10 ms; A* across the area 12 ms; Dijkstra field 12 ms; **a 900-tick round with the stand-in brains 175 ms (target 150)**. The stand-in survivors route to the exits on the true map with full A* searches; M3 brains plan on their own (smaller) maps, and M4 optimises from these numbers.

**M3.1 bench** (same container): knowledge plan to the nearest frontier 0.46 ms (the original 20261110 planner, which always built the whole field, 2.8 ms on the same map); whole own map 3.4 ms with real travel times; Dijkstra field 12 -> 5 ms (cached slope factors); A* across the area 11.5 -> 7 ms (octile heuristic); round with stand-in brains 179 -> 156 ms.

**Next**
- M3: port knowledge.js (KnowledgeMap on typed arrays, 3D vision with vf(t) and the occlusion horizon), landmarks, creature and survivor brains, planning, group behaviour, replan cap, metrics.

## 2026-11-16 (continued): M1 done

**Done**
- M1.0–M1.8, the whole data pipeline. Real sources, all reachable (hosts in D-013): OSM via the official API (Overpass resets every connection, D-011); the 2017 NYC LiDAR DEM and point cloud from NOAA Digital Coast by HTTP range requests (COG / COPC, D-012, D-017); KNYC hourly weather from IEM through our own MCP server (D-022).
- Baked (5.6 MB gzip): meta, paths (406 nodes, 13.7 km, exits E76/E79S/E79N), places (42), cover, structure heights, terrain (z, slope, openness, drift x 8), 2,427 trees + canopy, storm record (SLR 11.85), world.bin (composed), fingerprints (39,734 cells x 362 rays). `npm run bake` 18–20 s from caches, `bake:verify` byte-identical.
- Started M2.1 early: `src/sim/world.js` (world from bytes) and `src/sim/los.js` (castRay port) were needed for the fingerprints.
- 62 tests pass (+1 live MCP test with FROSTROOT_NET=1).

**Next**
- M2: finish M2.1 (loader in the browser too), M2.2 frames.js, M2.3 storm clock, M2.4 four distances (+ walk costs per kind in config), M2.5–M2.9.

**Open problems / notes**
- Evergreens: only 8 (OSM says the Ramble is broadleaved), so the "under evergreens" snow and track rules do little here (D-018). That is faithful to the place; mention it in the deck.
- GitHub Pages may not gzip `.bin`; fingerprints are 14.5 MB raw. Load them after the first screen (D-021); measure in M4.3.
- Building lee drift not modelled yet (D-020).

## 2026-11-16

**Done**
- Step 0: brought `20261110_agents/` in from the fork `yz5149-stack/spatial_ai_gsapp` (branch `sync/20261110-agents`, PR Ryan-RAM/spatial_ai_gsapp#3, plus the README navigation line). Waiting for Ryan to merge.
- ROADMAP.md written and confirmed. Folder name unified as `20261203_final` (D-000).
- Network: Ryan approved the data hosts (overpass-api.de, mesonet.agron.iastate.edu, data.cityofnewyork.us, zenodo.org, api.weather.gov, cdn.jsdelivr.net). Any other host needs a separate approval.
- M0.1 skeleton (page, config, rng with substreams, tests, bench), M0.2 decisions D-001..D-007, M0.3 porting list, M0.4 this log + README, M0.5 risk register.

**Bench** (2026-11-16, 87b39e2): rng 1e6 draws 8.1 ms. No sim benchmarks yet.

**M1.3 terrain numbers** (terrain.json): z 13.6–42.6 m, median 24.2 m; the Lake 16.8 m; Vista Rock node 41.25 m (ref. 39.6); Reservoir 34.9 m (ref. 37). Slope histogram, cells: 0–5° 26,998 · 5–10° 13,848 · 10–15° 6,587 · 15–20° 2,463 · 20–30° 1,778 · 30–45° 585 · 45–90° 201. DEM download: 36 tiles of be_NYC_025.tif (cached in data/raw/dem/); bake 6 s from cache.

**M1.7 timings**: fingerprints 39,734 cells × 362 rays in 5.0 s on 4 worker threads (one thread would take ~20 s); full `npm run bake` 20 s from the caches; baked data 5.6 MB gzip (fingerprints 4.5 MB of it).

**Next (superseded, see below)**
- M1.0: check every data source returns 200 now that the hosts are allowed.
- M1.1: fix the bbox and origin from OSM, write `src/data/geo.js` with round-trip tests.

**Open problems**
- The LiDAR DEM and the tree dataset may be hosted on hosts that are not on the approved list (e.g. NOAA Digital Coast, figshare). Ask Ryan for those hosts when M1.3/M1.4 reach them.
