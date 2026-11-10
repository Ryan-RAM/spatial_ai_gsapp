#!/usr/bin/env python3
"""Download the raw NYC data for the site into data/raw/ (standard library only).

1. Building footprints with roof height and ground elevation:
   NYC Open Data "BUILDING" (Building Footprints), dataset id 5zhs-2jue, Socrata SODA API.
   The column names are read from the dataset's own metadata first (api/views/5zhs-2jue.json),
   so a renamed column is found instead of assumed. Only buildings inside the site's bounding box
   are requested (SoQL within_box).
2. Shoreline: NYC Department of City Planning "Borough Boundaries (Clipped to Shoreline)", from
   DCP's ArcGIS feature service (GeoJSON). Override with --shoreline-url if it moves.

The bounding box comes from src/sim/config.js (read through Node), so it is defined once.

Usage:
  python3 data/scripts/fetch_nyc.py                # everything
  python3 data/scripts/fetch_nyc.py --only shoreline
  SOCRATA_APP_TOKEN=... python3 data/scripts/fetch_nyc.py   # optional, raises the rate limit
Then: python3 data/scripts/process_nyc.py
"""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent.parent
RAW = PROJECT / "data" / "raw"

DATASET = "5zhs-2jue"
DOMAIN = "https://data.cityofnewyork.us"
SHORELINE_URLS = [
    # DCP's hosted "nybb" layer (borough boundaries clipped to the shoreline)
    "https://services2.arcgis.com/IsDCghZ73NgoYoz5/ArcGIS/rest/services/nybb/FeatureServer/0/query"
    "?where=1%3D1&outFields=*&outSR=4326&f=geojson",
    "https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_Borough_Boundary/FeatureServer/0/query"
    "?where=1%3D1&outFields=*&outSR=4326&f=geojson",
]
PAGE = 50000

# Candidate column names, newest first. The metadata decides which one exists.
CANDIDATES = {
    "height": ["height_roof", "heightroof", "height"],
    "ground": ["ground_elevation", "groundelev", "ground_elev"],
    "name": ["name"],
    "bin": ["bin"],
    "feature": ["feature_code", "feat_code", "featurecode"],
    "year": ["construction_year", "cnstrct_yr"],
}


def site_from_config():
    js = "import('./src/sim/config.js').then(m => console.log(JSON.stringify(m.CONFIG.site)))"
    out = subprocess.run(["node", "--input-type=module", "-e", js], cwd=PROJECT, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def get(url, binary=False, tries=4):
    headers = {"User-Agent": "spatial-ai-coursework-data-script/1.0"}
    token = os.environ.get("SOCRATA_APP_TOKEN")
    if token and DOMAIN in url:
        headers["X-App-Token"] = token
    delay = 2
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=120) as r:
                data = r.read()
                return data if binary else json.loads(data.decode("utf-8"))
        except Exception as e:  # network errors, HTTP errors, bad JSON
            if k == tries - 1:
                raise
            print(f"  retry in {delay}s after: {e}", file=sys.stderr)
            time.sleep(delay)
            delay *= 2


def pick(columns, wanted):
    names = {c["fieldName"]: c for c in columns}
    for w in wanted:
        if w in names:
            return w
    return None


def fetch_buildings(site):
    meta = get(f"{DOMAIN}/api/views/{DATASET}.json")
    columns = [c for c in meta.get("columns", []) if not c["fieldName"].startswith(":")]
    (RAW / "buildings_columns.json").write_text(json.dumps(
        {"dataset": DATASET, "name": meta.get("name"), "rowsUpdatedAt": meta.get("rowsUpdatedAt"),
         "columns": [{k: c.get(k) for k in ("fieldName", "name", "dataTypeName", "description")} for c in columns]}, indent=1))
    geom = next((c["fieldName"] for c in columns if c.get("dataTypeName") in ("multipolygon", "polygon")), None)
    fields = {k: pick(columns, v) for k, v in CANDIDATES.items()}
    print(f"dataset: {meta.get('name')}  geometry column: {geom}  fields: {fields}")
    if not geom or not fields["height"]:
        sys.exit("Could not find the geometry or roof-height column: see data/raw/buildings_columns.json")
    select = ",".join([geom] + [f for f in fields.values() if f])
    # within_box(column, north-west lat, north-west lon, south-east lat, south-east lon)
    where = f"within_box({geom}, {site['north']}, {site['west']}, {site['south']}, {site['east']})"
    features, offset = [], 0
    while True:
        q = urllib.parse.urlencode({"$select": select, "$where": where, "$limit": PAGE, "$offset": offset, "$order": ":id"})
        page = get(f"{DOMAIN}/resource/{DATASET}.geojson?{q}")
        feats = page.get("features", [])
        features += feats
        print(f"  {len(features)} buildings")
        if len(feats) < PAGE:
            break
        offset += PAGE
    out = {"type": "FeatureCollection", "features": features,
           "x_source": {"dataset": DATASET, "url": f"{DOMAIN}/d/{DATASET}", "fields": fields, "geometry": geom,
                        "fetched": time.strftime("%Y-%m-%d"), "site": site}}
    (RAW / "buildings_raw.geojson").write_text(json.dumps(out))
    print(f"wrote data/raw/buildings_raw.geojson ({len(features)} features)")


def fetch_shoreline(url=None):
    for u in ([url] if url else SHORELINE_URLS):
        try:
            gj = get(u)
            if gj.get("features"):
                gj["x_source"] = {"url": u, "fetched": time.strftime("%Y-%m-%d")}
                (RAW / "borough_boundaries.geojson").write_text(json.dumps(gj))
                print(f"wrote data/raw/borough_boundaries.geojson ({len(gj['features'])} boroughs) from {u.split('?')[0]}")
                return
        except Exception as e:
            print(f"  shoreline source failed: {u.split('?')[0]}: {e}", file=sys.stderr)
    sys.exit("No shoreline source worked. Download 'Borough Boundaries (Clipped to Shoreline)' as GeoJSON from "
             "https://www.nyc.gov/site/planning/data-maps/open-data/districts-download-metadata.page and save it as "
             "data/raw/borough_boundaries.geojson")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", choices=["buildings", "shoreline"])
    ap.add_argument("--shoreline-url")
    args = ap.parse_args()
    RAW.mkdir(parents=True, exist_ok=True)
    site = site_from_config()
    print(f"site: {site}")
    if args.only in (None, "shoreline"):
        fetch_shoreline(args.shoreline_url)
    if args.only in (None, "buildings"):
        fetch_buildings(site)


if __name__ == "__main__":
    main()
