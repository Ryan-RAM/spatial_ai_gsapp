# DEVLOG

Newest entry first. Each session ends with a few lines: what was done, what is next, open problems.

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
