# Building and shoreline data

**Optional.** The page uses a simplified, simulated Manhattan by default (`data.useRealData: false` in `src/sim/config.js`), so
nothing has to be downloaded. To try the real buildings: run the two scripts below, set `useRealData: true`, and serve the
folder (`python3 -m http.server`), because the page then loads `data/processed/*.json`.

## Which dataset, and why

| Candidate | What it has | Verdict |
|---|---|---|
| **NYC Open Data "BUILDING" (Building Footprints), id `5zhs-2jue`** | One polygon per building with `height_roof` (roof height **above ground**), ground elevation, BIN, feature code, construction year; SODA API with spatial filters; updated (Data.gov lists modifications in 2025-2026). | **Used.** Measured height per building, current, easy to clip to the site. |
| NYC MapPLUTO / PLUTO | Tax-lot attributes; number of floors (`numfloors`), not a measured height; lots, not buildings. | Not used: heights would have to be guessed from floors. |
| NYC 3D Building Model (DCP) | Every building as present in the **2014** aerial survey, CityGML/multipatch, split by the 59 community districts. | Not used: 2014 vintage (misses most of the new supertalls), large files, heavy conversion. |
| TUM CityGML LoD1/LoD2 model of NYC | Derived from city data, 2015 era. | Not used: derived and older. |

Sources: [Data.gov record](https://catalog.data.gov/dataset/building-footprints-3f798),
[dataset page](https://data.cityofnewyork.us/City-Government/BUILDING/5zhs-2jue),
[NYC metadata (GitHub)](https://github.com/CityOfNewYork/nyc-geo-metadata/blob/main/Metadata/Metadata_BuildingFootprints.md),
[DCP 3D model metadata](https://www.nyc.gov/assets/planning/download/pdf/data-maps/open-data/nyc-3d-model-metadata.pdf),
[TUM NYC 3D](https://www.asg.ed.tum.de/gis/projekte/new-york-city-3d/).

## Fields, units and datum (checked, and checked again by the script)

- **`height_roof`**: "the height of the roof above the ground elevation, NOT its height above sea level" (NYC metadata).
  Missing or zero when there was no source.
- **Ground elevation** (`ground_elevation` in the current API, `GROUNDELEV` / "Ground Elevation" in older layers): the lowest
  elevation at the building's ground level.
- **Units**: "all measurements in the attribute tables are in US foot" (NYC metadata; horizontal system NAD83 New York Long
  Island / East zone in the source files, WGS84 longitude/latitude through the API).
- **Vertical datum**: not stated in the excerpts we could read; NAVD88 is the city's usual datum. With 50 m cells and terrain
  under 30 m in the site this does not change any result.
- **Feature codes**: 2110 = skybridge in both the published metadata and the planimetric capture rules, so skybridges are
  dropped (they would stand on the ground as towers). The two sources disagree on whether 2100 or 1006 means "cantilevered
  building"; both are kept as buildings.
- **Dataset id**: the GitHub metadata links an older id (`nqwf-w8eh`); the current Open Data dataset is `5zhs-2jue` (created
  13 November 2024). Because names have changed before (`heightroof` became `height_roof`), `fetch_nyc.py` reads the dataset's
  own column list (`/api/views/5zhs-2jue.json`) and picks the columns from it, and stores that list in `data/raw/buildings_columns.json`.

Heights in the simulation: `top = (ground_elevation + height_roof) × 0.3048006 m` above sea level; the building stands on
`ground_elevation`.

## Shoreline

NYC Department of City Planning, *Borough Boundaries (Clipped to Shoreline)*
([download page](https://www.nyc.gov/site/planning/data-maps/open-data/districts-download-metadata.page)), fetched from DCP's
ArcGIS feature service `nybb` as GeoJSON. New Jersey is outside NYC's data, so its shoreline is a hand-traced approximation and
it has no buildings (the footprints only cover NYC).

## Pipeline

```
data/scripts/fetch_nyc.py    ->  data/raw/buildings_raw.geojson, borough_boundaries.geojson, buildings_columns.json
data/scripts/process_nyc.py  ->  data/processed/buildings.json, land.json
```

Both use only the Python standard library, and read the site's bounding box from `src/sim/config.js` (through Node), so the
box is defined once. `data/raw/` is git-ignored. `process_nyc.py` prints the size of `buildings.json`; if it is over 20 MB,
add it to `.gitignore` too and publish it another way. Otherwise commit it so the GitHub Pages site shows the real city.

The simulation loads `data/processed/` when it exists. Without it, it builds a **placeholder city** (`src/sim/placeholder.js`):
hand-traced shorelines, the rotated Manhattan grid, Central Park, Midtown and Financial District clusters, low-rise
neighbourhoods and a few well-known towers at approximate heights. Every screenshot made from it says "Placeholder city" in the
top-left corner.

The processing (projection, Douglas-Peucker simplification, outer rings only, the filters) is described at the top of
`process_nyc.py`, and the projection matches `src/sim/geo.js` (checked with a test file: the same point lands within 1 cm in both).
