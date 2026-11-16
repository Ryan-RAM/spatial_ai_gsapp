# Credits and licences (ROADMAP M9.3)

The same list is on the page (footer → Credits and licences).

## Data

| Source | Used for | Licence |
|---|---|---|
| [OpenStreetMap](https://www.openstreetmap.org/copyright), through the OpenStreetMap API | paths, water, structures, named places, ground cover, leaf type | © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/); the derived files in `data/baked/` are under the ODbL too |
| [2017 New York City Topobathymetric LiDAR](https://coast.noaa.gov/digitalcoast/) (NOAA Office for Coastal Management, Digital Coast; collected for the City of New York) | terrain (bare-earth DEM), trees (point cloud) | U.S. Government work, no copyright restrictions in the U.S. |
| [Iowa Environmental Mesonet](https://mesonet.agron.iastate.edu/request/download.phtml) ASOS archive, station KNYC | the hourly weather of 22–24 January 2016 | NWS observations, public domain; archive by Iowa State University |
| [National Weather Service API](https://www.weather.gov/documentation/services-web-api) | tonight mode | public domain |
| NOAA/NWS storm summary | the official storm total of 27.5 in | public domain |

Details per file: [`data/baked/LICENSE.md`](../data/baked/LICENSE.md); checksums in `data/baked/MANIFEST.json`.

## Software

| Package | Used for | Licence |
|---|---|---|
| [three.js](https://threejs.org/) r160, loaded from jsDelivr | the 3D view | MIT |
| [copc](https://www.npmjs.com/package/copc) 0.0.9 (dev only, bake scripts) | reading the LiDAR point cloud | MIT |
| [laz-perf](https://www.npmjs.com/package/laz-perf) 0.0.7 (dev only, via copc) | decompressing LAZ | Apache-2.0 |
| [Playwright](https://playwright.dev/) (dev tool, not a dependency) | exporting diagrams and the deck | Apache-2.0 |

The code of this folder: MIT ([`LICENSE`](../LICENSE)).

## Art, sound and type

Everything is original to this project and made in code; no third-party models, textures, images, sounds or fonts are used.

| Asset | How it is made | Where |
|---|---|---|
| Trees, lamps, shelters, signs, survivors | primitive geometry and toon shading | `src/render/kit.js` |
| The creature (body, roots, eyes) | geometry and a vertex shader | `src/render/creature3d.js` |
| Snow surface, falling snow, footprints | shaders and instanced meshes | `src/render/scene3d.js`, `kit.js` |
| Maps, charts, lineage, gallery maps | Canvas 2D | `src/render/` |
| Sound (wind, drone, heartbeat, creak) | synthesized with the Web Audio API | `src/ui/audio.js` |
| Type | the system UI font of the viewer's device | `style.css` |

Real names of places (Central Park, the Ramble, Belvedere Castle, Bow Bridge …) are used only to say where things are; no institution endorses or is involved in this project (risk register R1–R2 in `DECISIONS.md`).
