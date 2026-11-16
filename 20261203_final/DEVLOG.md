# DEVLOG

Newest entry first. Each session ends with a few lines: what was done, what is next, open problems.

## 2026-11-16

**Done**
- Step 0: brought `20261110_agents/` in from the fork `yz5149-stack/spatial_ai_gsapp` (branch `sync/20261110-agents`, PR Ryan-RAM/spatial_ai_gsapp#3, plus the README navigation line). Waiting for Ryan to merge.
- ROADMAP.md written and confirmed. Folder name unified as `20261203_final` (D-000).
- Network: Ryan approved the data hosts (overpass-api.de, mesonet.agron.iastate.edu, data.cityofnewyork.us, zenodo.org, api.weather.gov, cdn.jsdelivr.net). Any other host needs a separate approval.
- M0.1 skeleton (page, config, rng with substreams, tests, bench), M0.2 decisions D-001..D-007, M0.3 porting list, M0.4 this log + README, M0.5 risk register.

**Bench** (2026-11-16, 87b39e2): rng 1e6 draws 8.1 ms. No sim benchmarks yet.

**Next**
- M1.0: check every data source returns 200 now that the hosts are allowed.
- M1.1: fix the bbox and origin from OSM, write `src/data/geo.js` with round-trip tests.

**Open problems**
- The LiDAR DEM and the tree dataset may be hosted on hosts that are not on the approved list (e.g. NOAA Digital Coast, figshare). Ask Ryan for those hosts when M1.3/M1.4 reach them.
