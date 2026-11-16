// The study area and its grid, from config (D-002, D-014). One place that turns the config into
// frame W (src/data/geo.js) and the grid, used by every bake step and the MCP server.

import { CONFIG } from '../sim/config.js';
import { makeEnu, makeGrid } from './geo.js';

export function studyArea(config = CONFIG) {
  const enu = makeEnu(config.origin.lat, config.origin.lon, 0);
  const grid = makeGrid(config.studyArea.bboxM, config.cellSize);
  const { minX, minY, maxX, maxY } = config.studyArea.bboxM;
  // the bbox in degrees: the extremes of its four corners (frame W is not aligned with lon/lat)
  const corners = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]].map(([x, y]) => enu.fromEnu(x, y, 0));
  const lats = corners.map((c) => c[0]); const lons = corners.map((c) => c[1]);
  const bboxDeg = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
  return { enu, grid, bboxDeg, corners };
}
