# Licences of the baked data

The files in this folder are derived from the sources below by the scripts in `../scripts/` (`npm run bake`). `MANIFEST.json` lists every input and output with its SHA-256.

| Files | Derived from | Licence and attribution |
|---|---|---|
| `paths.json`, `places.json`, `cover.bin`, `cover.json`, and the cover layer of `world.bin` | OpenStreetMap, downloaded through the OpenStreetMap API | © OpenStreetMap contributors. Available under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). These files are a Derivative Database of OpenStreetMap and are themselves made available under the ODbL 1.0. See https://www.openstreetmap.org/copyright |
| `terrain.bin`, `terrain.json`, and the terrain layers of `world.bin` | 2017 New York City Topobathymetric LiDAR, bare-earth DEM (NOAA Office for Coastal Management, Digital Coast, mission 9307; collected for the City of New York) | U.S. Government work, no copyright restrictions in the United States. Credit: NOAA Office for Coastal Management, Digital Coast; City of New York |
| `trees.bin`, `trees.json`, `canopy.bin`, and the canopy layers and thickets of `world.bin` | the same survey's point cloud (NOAA Digital Coast, mission 9306), with OpenStreetMap leaf-type tags for the evergreen estimate | point cloud: as above; the evergreen flag also uses OpenStreetMap data (ODbL 1.0, © OpenStreetMap contributors) |
| `storm-2016-01.json` | hourly ASOS observations at Central Park (KNYC), Iowa Environmental Mesonet archive; storm total from NOAA/NWS | observations of the U.S. National Weather Service, public domain; archive by the Iowa Environmental Mesonet, Iowa State University |
| `meta.json` | the study area chosen for this project | — |

Values derived here (tree positions and crowns, thickets, rock outcrops, the evergreen flag, the snow-to-liquid ratio) are estimates made for a simulation, not authoritative measurements. See `../../DECISIONS.md` (D-014 to D-020) for how each was made.
