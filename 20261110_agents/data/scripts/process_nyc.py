#!/usr/bin/env python3
"""Turn data/raw/ into the two files the simulation loads (standard library only).

  data/raw/buildings_raw.geojson      -> data/processed/buildings.json
  data/raw/borough_boundaries.geojson -> data/processed/land.json

Heights. NYC Building Footprints give, per building, `height_roof` = roof height ABOVE the ground
(not above sea level) and `ground_elevation` = lowest ground elevation at the building, both in US
survey feet (NYC metadata: "All measurements ... in US foot"; datum not stated in the metadata we
could read, NAVD88 is the city's usual vertical datum). The simulation works in metres above sea
level, so:  base_m = ground_elevation * 0.3048006,  top_m = (ground_elevation + height_roof) * 0.3048006.

Filters (counts are printed):
  * height_roof missing or <= 0      dropped (the metadata says these have no height source);
  * feature code 2110 (skybridge)    dropped: an elevated walkway, not a ground-standing block;
  * rings: only the outer ring of each polygon part is kept (courtyards are filled in);
  * vertices simplified with Douglas-Peucker at 0.6 m.

Coordinates use the same local frame as src/sim/geo.js (equirectangular about the middle latitude
of config.site), stored as decimetre integers. New Jersey is not in NYC data: its shoreline is the
hand-traced approximation from src/sim/placeholder.js.

Usage: python3 data/scripts/process_nyc.py [--buildings PATH] [--shoreline PATH]
"""
import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent.parent
RAW = PROJECT / "data" / "raw"
OUT = PROJECT / "data" / "processed"
USFT = 1200 / 3937  # US survey foot in metres
R = 6371008.8
SKYBRIDGE = {"2110"}


def node_json(expr):
    js = f"Promise.all([import('./src/sim/config.js'), import('./src/sim/placeholder.js')]).then(([c, p]) => console.log(JSON.stringify({expr})))"
    out = subprocess.run(["node", "--input-type=module", "-e", js], cwd=PROJECT, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def frame(site):
    lat0 = (site["south"] + site["north"]) / 2
    kx = R * math.cos(math.radians(lat0)) * math.pi / 180
    ky = R * math.pi / 180
    return lambda lon, lat: ((lon - site["west"]) * kx, (lat - site["south"]) * ky)


def simplify(pts, tol):
    """Douglas-Peucker on an open list of (x, y)."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = pts[a], pts[b]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy) or 1e-9
        best, bi = -1, -1
        for i in range(a + 1, b):
            d = abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / L
            if d > best:
                best, bi = d, i
        if best > tol:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


def simplify_ring(pts, tol):
    """Douglas-Peucker on a closed ring (no repeated end point): split at the vertex farthest
    from the first one and simplify both halves."""
    if len(pts) <= 4:
        return pts
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    a = simplify(pts[: far + 1], tol)
    b = simplify(pts[far:] + [pts[0]], tol)
    return a[:-1] + b[:-1]


def clip_rect(pts, x0, y0, x1, y1):
    """Sutherland-Hodgman clip of a closed ring to a rectangle."""
    def clip(poly, inside, cut):
        out = []
        for i in range(len(poly)):
            p, q = poly[i - 1], poly[i]
            if inside(q):
                if not inside(p):
                    out.append(cut(p, q))
                out.append(q)
            elif inside(p):
                out.append(cut(p, q))
        return out
    def at_x(x):
        return lambda p, q: (x, p[1] + (q[1] - p[1]) * (x - p[0]) / (q[0] - p[0]))
    def at_y(y):
        return lambda p, q: (p[0] + (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1]), y)
    for inside, cut in ((lambda p: p[0] >= x0, at_x(x0)), (lambda p: p[0] <= x1, at_x(x1)),
                        (lambda p: p[1] >= y0, at_y(y0)), (lambda p: p[1] <= y1, at_y(y1))):
        pts = clip(pts, inside, cut)
        if not pts:
            return []
    return pts


def outer_rings(geom):
    if not geom:
        return []
    if geom["type"] == "Polygon":
        return [geom["coordinates"][0]]
    if geom["type"] == "MultiPolygon":
        return [poly[0] for poly in geom["coordinates"]]
    return []


def flat_dm(pts):
    return [v for p in pts for v in (round(p[0] * 10), round(p[1] * 10))]


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def process_buildings(path, site, proj):
    gj = json.loads(Path(path).read_text())
    src = gj.get("x_source", {})
    f = src.get("fields") or {}
    hk, gk, nk, fk = f.get("height", "height_roof"), f.get("ground", "ground_elevation"), f.get("name", "name"), f.get("feature", "feature_code")
    out, stats = [], {"in": 0, "no_height": 0, "skybridge": 0, "degenerate": 0}
    for feat in gj["features"]:
        stats["in"] += 1
        p = feat.get("properties") or {}
        h = num(p.get(hk))
        if h is None or h <= 0:
            stats["no_height"] += 1
            continue
        if str(p.get(fk, "")).split(".")[0] in SKYBRIDGE:
            stats["skybridge"] += 1
            continue
        g = num(p.get(gk)) or 0.0
        base, top = g * USFT, (g + h) * USFT
        name = (p.get(nk) or "").strip() or None
        for ring in outer_rings(feat.get("geometry")):
            pts = [proj(lon, lat) for lon, lat in ring[:-1] if lon is not None]
            pts = simplify_ring(pts, 0.6)
            if len(pts) < 3:
                stats["degenerate"] += 1
                continue
            out.append([round(top * 10), round(base * 10), name, flat_dm(pts)])
    meta = {"format": "nyc-agents-buildings/1",
            "source": f"NYC Open Data Building Footprints ({src.get('dataset', '5zhs-2jue')}), fetched {src.get('fetched', '?')}",
            "site": site, "units": "decimetres, local frame of site (see src/sim/geo.js); heights above sea level",
            "fields": ["top_dm", "base_dm", "name", "ring_dm"], "stats": stats, "buildings": out}
    return meta, stats


def process_land(path, site, proj, placeholder_land):
    gj = json.loads(Path(path).read_text())
    W, H = proj(site["east"], site["north"])
    pad = 600
    land = []
    for feat in gj["features"]:
        p = feat.get("properties") or {}
        bname = next((str(v) for k, v in p.items() if "boro" in k.lower() and "name" in k.lower()), "Borough")
        for i, ring in enumerate(outer_rings(feat.get("geometry"))):
            pts = [proj(lon, lat) for lon, lat in ring[:-1]]
            pts = clip_rect(pts, -pad, -pad, W + pad, H + pad)
            if len(pts) < 3:
                continue
            pts = simplify_ring(pts, 4.0)
            if len(pts) >= 3:
                land.append({"name": f"{bname}" if i == 0 else f"{bname} (part {i + 1})", "p": flat_dm(pts)})
    for l in placeholder_land:  # New Jersey is not in NYC's boundaries
        if "jersey" in l["name"].lower():
            land.append({"name": "New Jersey (approximate, hand-traced)", "p": flat_dm([proj(lo, la) for la, lo in l["pts"]])})
    return {"format": "nyc-agents-land/1",
            "source": f"NYC DCP Borough Boundaries clipped to shoreline ({gj.get('x_source', {}).get('fetched', '?')}); New Jersey hand-traced",
            "site": site, "land": land}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--buildings", default=str(RAW / "buildings_raw.geojson"))
    ap.add_argument("--shoreline", default=str(RAW / "borough_boundaries.geojson"))
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()
    out_dir = Path(args.out)
    cfg = node_json("{ site: c.CONFIG.site, land: p.PLACEHOLDER_LAND }")
    site = {k: cfg["site"][k] for k in ("south", "north", "west", "east")}
    proj = frame(site)
    out_dir.mkdir(parents=True, exist_ok=True)
    if not Path(args.buildings).exists() or not Path(args.shoreline).exists():
        sys.exit("Raw files missing: run data/scripts/fetch_nyc.py first (or pass --buildings / --shoreline).")
    b, stats = process_buildings(args.buildings, site, proj)
    (out_dir / "buildings.json").write_text(json.dumps(b, separators=(",", ":")))
    l = process_land(args.shoreline, site, proj, cfg["land"])
    (out_dir / "land.json").write_text(json.dumps(l, separators=(",", ":")))
    tops = sorted(x[0] / 10 for x in b["buildings"])
    size = (out_dir / "buildings.json").stat().st_size / 1e6
    print(f"buildings: {len(b['buildings'])} parts kept; {stats}")
    if tops:
        print(f"roof heights above sea level: median {tops[len(tops) // 2]:.0f} m, max {tops[-1]:.0f} m")
    print(f"land polygons: {len(l['land'])}")
    print(f"data/processed/buildings.json is {size:.1f} MB" + ("  (over 20 MB: keep it out of git, see README)" if size > 20 else ""))


if __name__ == "__main__":
    main()
