// A synthetic stand-in for the NYC building data, used until data/scripts/ has been run.
// It is NOT real data. It keeps the things the agents react to: the shoreline (traced by hand
// from a map, accurate to roughly 100 m), the rotated Manhattan street grid, Central Park, the
// two tall clusters (Midtown and the Financial District), low-rise neighbourhoods, and a list of
// well-known towers at their approximate positions and roof heights.
// Output format = data/processed/*.json after loading: see world.js.

import { makeRng } from './rng.js';
import { FT } from './config.js';
import { pointInPoly, closestOnSegment } from './geo.js';
import { gridFrames, corridors } from './streets.js';

// Shorelines, [lat, lon]. Hand-traced approximations; the real ones come from the DCP borough
// boundaries (clipped to shoreline) through data/scripts/fetch_nyc.py.
export const PLACEHOLDER_LAND = [
  { name: 'Manhattan', pts: [
    [40.7003, -74.0150], [40.7040, -74.0190], [40.7100, -74.0185], [40.7170, -74.0160], [40.7260, -74.0120],
    [40.7330, -74.0110], [40.7400, -74.0100], [40.7480, -74.0085], [40.7540, -74.0065], [40.7600, -74.0030],
    [40.7650, -73.9990], [40.7720, -73.9935], [40.7800, -73.9880], [40.7880, -73.9830], [40.7980, -73.9770],
    [40.7980, -73.9380], [40.7860, -73.9405], [40.7760, -73.9425], [40.7700, -73.9470], [40.7640, -73.9520],
    [40.7590, -73.9570], [40.7540, -73.9620], [40.7490, -73.9655], [40.7440, -73.9700], [40.7380, -73.9725],
    [40.7330, -73.9740], [40.7290, -73.9715], [40.7230, -73.9725], [40.7160, -73.9745], [40.7110, -73.9785],
    [40.7090, -73.9870], [40.7075, -73.9950], [40.7060, -74.0005], [40.7035, -74.0050], [40.7015, -74.0095],
    [40.7008, -74.0125]] },
  { name: 'Brooklyn and Queens', pts: [
    [40.6800, -74.0080], [40.6900, -74.0040], [40.6960, -73.9990], [40.7035, -73.9900], [40.7030, -73.9800],
    [40.7050, -73.9720], [40.7120, -73.9680], [40.7200, -73.9620], [40.7300, -73.9600], [40.7380, -73.9600],
    [40.7450, -73.9580], [40.7500, -73.9570], [40.7560, -73.9500], [40.7620, -73.9420], [40.7700, -73.9370],
    [40.7780, -73.9310], [40.7950, -73.9260], [40.7950, -73.9200], [40.6800, -73.9200]] },
  { name: 'Roosevelt Island', pts: [
    [40.75203, -73.96096], [40.77503, -73.93896], [40.77397, -73.93704], [40.75097, -73.95904]] },
  { name: 'Governors Island', pts: [
    [40.6935, -74.0175], [40.6925, -74.0120], [40.6880, -74.0110], [40.6840, -74.0185], [40.6855, -74.0235],
    [40.6900, -74.0220]] },
  { name: 'Liberty Island', pts: [[40.6905, -74.0465], [40.6905, -74.0440], [40.6880, -74.0425], [40.6875, -74.0455]] },
  { name: 'New Jersey', pts: [
    [40.6800, -74.0480], [40.6900, -74.0420], [40.7000, -74.0400], [40.7150, -74.0320], [40.7270, -74.0300],
    [40.7370, -74.0270], [40.7500, -74.0240], [40.7600, -74.0170], [40.7700, -74.0080], [40.7800, -74.0010],
    [40.7980, -73.9930], [40.7980, -74.0600], [40.6800, -74.0600]] },
];

// Well-known towers: approximate positions and roof heights (ft) from public references,
// only used by the placeholder. The real data has every building's measured roof height.
export const PLACEHOLDER_TOWERS = [
  ['One World Trade Center', 40.71300, -74.01320, 1368, 60],
  ['3 World Trade Center', 40.71110, -74.01170, 1079, 50],
  ['Empire State Building', 40.74840, -73.98570, 1250, 55],
  ['Central Park Tower', 40.76630, -73.98100, 1550, 40],
  ['111 West 57th Street', 40.76460, -73.97750, 1428, 25],
  ['432 Park Avenue', 40.76150, -73.97190, 1396, 30],
  ['One Vanderbilt', 40.75300, -73.97850, 1301, 50],
  ['30 Hudson Yards', 40.75400, -74.00100, 1268, 55],
  ['Chrysler Building', 40.75160, -73.97550, 925, 45],
  ['Bank of America Tower', 40.75570, -73.98440, 945, 50],
  ['8 Spruce Street', 40.71070, -74.00550, 870, 35],
  ['70 Pine Street', 40.70630, -74.00760, 850, 35],
  ['MetLife Building', 40.75340, -73.97650, 808, 70],
  ['Brooklyn Tower', 40.68930, -73.98200, 1066, 40],
  ['Skyline Tower (LIC)', 40.74800, -73.94200, 778, 40],
];

const hotspots = [ // [lat, lon, sigma m, amplitude m]
  [40.7560, -73.9800, 900, 150],   // Midtown
  [40.7075, -74.0100, 650, 165],   // Financial District
  [40.7540, -74.0010, 320, 110],   // Hudson Yards
  [40.7130, -74.0080, 450, 60],    // Civic Center / Tribeca
  [40.6930, -73.9870, 450, 85],    // Downtown Brooklyn
  [40.7460, -73.9540, 450, 95],    // Long Island City
];

export function makePlaceholder(config, frame) {
  const rng = makeRng(config.seed ^ 0x5eed);
  const land = PLACEHOLDER_LAND.map((l) => ({ name: l.name, p: l.pts.flatMap(([la, lo]) => frame.toXY(la, lo)) }));
  const manhattan = land[0].p;
  const others = land.slice(1, 4).filter((l) => l.name !== 'New Jersey');
  const hs = hotspots.map(([la, lo, s, a]) => { const [x, y] = frame.toXY(la, lo); return { x, y, s, a }; });
  const towers = PLACEHOLDER_TOWERS.map(([name, la, lo, ft, side]) => { const [x, y] = frame.toXY(la, lo); return { name, x, y, top: ft * FT, side }; });

  const heightAt = (x, y, base) => {
    let h = base;
    for (const s of hs) h += s.a * Math.exp(-((x - s.x) ** 2 + (y - s.y) ** 2) / (2 * s.s * s.s));
    return h;
  };
  const hubs = config.droneNet.hubs.map((h) => frame.toXY(h.lat, h.lon));
  const nearTower = (x, y) => towers.some((t) => Math.hypot(x - t.x, y - t.y) < t.side + 25) || hubs.some(([hx, hy]) => Math.hypot(x - hx, y - hy) < 55);
  // air rights: blocks under an express corridor stay below it
  const cors = corridors(config, frame).corridors;
  const capUnder = (x, y, top) => {
    for (const c of cors) {
      const [qx, qy] = closestOnSegment(x, y, c.x1, c.y1, c.x2, c.y2);
      if (Math.hypot(qx - x, qy - y) < config.droneNet.corridorWidth + 20) top = Math.min(top, c.z - config.droneNet.corridorClearance);
    }
    return top;
  };

  const buildings = [];
  const addRect = (cx, cy, ux, uy, len, wid, top) => {
    const vx = -uy, vy = ux; const a = len / 2, b = wid / 2;
    buildings.push({ top, base: 0, name: null, p: [
      cx - ux * a - vx * b, cy - uy * a - vy * b, cx + ux * a - vx * b, cy + uy * a - vy * b,
      cx + ux * a + vx * b, cy + uy * a + vy * b, cx - ux * a + vx * b, cy - uy * a + vy * b] });
  };

  // Fill a region with blocks on a rotated grid, then split each block into lots.
  const fillGrid = ({ ox, oy, bearing, avenue, street, aveW, stW, inside, base, lotMin, lotMax, skip }) => {
    const th = (bearing * Math.PI) / 180;
    const ux = Math.sin(th), uy = Math.cos(th);  // along the avenues
    const vx = uy, vy = -ux;                     // along the streets
    const R = 9000;
    for (let i = -Math.ceil(R / street); i <= Math.ceil(R / street); i++) {
      for (let j = -Math.ceil(R / avenue); j <= Math.ceil(R / avenue); j++) {
        const cu = (i + 0.5) * street, cv = (j + 0.5) * avenue;
        const cx = ox + ux * cu + vx * cv, cy = oy + uy * cu + vy * cv;
        if (cx < -200 || cy < -200 || cx > frame.width + 200 || cy > frame.height + 200) continue;
        if (!inside(cx, cy) || (skip && skip(cu, cv))) continue;
        const blockLen = avenue - aveW, blockWid = street - stW; // long side runs along the street
        let s = -blockLen / 2;
        while (s < blockLen / 2 - 8) {
          const w = Math.min(rng.range(lotMin, lotMax), blockLen / 2 - s);
          const lx = cx + vx * (s + w / 2), ly = cy + vy * (s + w / 2);
          s += w;
          if (!inside(lx, ly) || nearTower(lx, ly) || rng.chance(0.06)) continue;
          let top = heightAt(lx, ly, base) * Math.exp(rng.normal() * 0.38);
          if (rng.chance(0.04)) top *= 1.9;
          top = Math.max(7, capUnder(lx, ly, Math.min(top, 380)));
          const depth = blockWid * (rng.chance(0.5) ? 0.92 : 0.46);
          const off = depth < blockWid * 0.6 ? (rng.chance(0.5) ? 1 : -1) * blockWid * 0.24 : 0;
          addRect(lx + ux * off, ly + uy * off, vx, vy, w - 3, depth, top);
        }
      }
    }
  };

  const inManhattan = (x, y) => pointInPoly(x, y, manhattan);
  // the same two street grids the drones fly over (config.droneNet.grid, streets.js)
  const G = gridFrames(config, frame);
  fillGrid({ ox: G.up.ox, oy: G.up.oy, bearing: G.up.bearing, avenue: G.up.avenue, street: G.up.street, aveW: 30, stW: 18, base: 28,
    lotMin: 18, lotMax: 55, inside: (x, y) => inManhattan(x, y) && G.isUptown(x, y), skip: G.park });
  fillGrid({ ox: G.down.ox, oy: G.down.oy, bearing: G.down.bearing, avenue: G.down.avenue, street: G.down.street, aveW: 16, stW: 14, base: 24,
    lotMin: 16, lotMax: 42, inside: (x, y) => inManhattan(x, y) && !G.isUptown(x, y) });
  for (const l of others) {
    const ins = (x, y) => pointInPoly(x, y, l.p);
    const [ox, oy] = [l.p[0], l.p[1]];
    fillGrid({ ox, oy, bearing: l.name === 'Brooklyn and Queens' ? 0 : 36, avenue: 180, street: 75, aveW: 20, stW: 16,
      base: l.name === 'Governors Island' ? 6 : 14, lotMin: 18, lotMax: 50, inside: ins });
  }
  config.droneNet.hubs.forEach((h, i) => { // the hub buildings: 100 ft roofs with room to land
    const [x, y] = hubs[i]; const th = (29 * Math.PI) / 180;
    addRect(x, y, Math.sin(th), Math.cos(th), 44, 44, config.droneNet.hubRoofFt * FT);
    buildings[buildings.length - 1].name = `${h.name} drone hub`;
  });
  for (const t of towers) {
    const th = (29 * Math.PI) / 180;
    addRect(t.x, t.y, Math.sin(th), Math.cos(th), t.side, t.side, t.top);
    buildings[buildings.length - 1].name = t.name;
  }
  return { source: 'simulated Manhattan (simplified, not real data)', buildings, land };
}
