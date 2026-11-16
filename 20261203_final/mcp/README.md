# frostroot-data (MCP server)

An [MCP](https://modelcontextprotocol.io) server over stdio for the real-world data of *Frostroot: The Ramble*. It uses the same data-access code as the bake scripts (`../src/data/`).

| Tool | Returns | Source |
|---|---|---|
| `weather_series(station, start, end)` | hourly observations in SI units, with wind chill | Iowa Environmental Mesonet ASOS archive (`station: "NYC"` is Central Park) |
| `terrain_tile(bbox, res)` | bare-earth elevations on a grid, m NAVD88 | 2017 NYC topobathymetric LiDAR DEM (NOAA Digital Coast), read by range requests |
| `trees_in(bbox, limit)` | individual trees: position, height, crown, trunk, evergreen | this project's extraction from the 2017 LiDAR point cloud (baked, study area only) |
| `paths_in(bbox)` | the footpath graph | OpenStreetMap API (© OpenStreetMap contributors, ODbL) |

`bbox` is `[minLon, minLat, maxLon, maxLat]`. Tool names use underscores (`weather_series`) where the semantic model writes `weather.series`: many MCP clients accept only letters, digits, `_` and `-`.

## Use it from Claude Code

From the `20261203_final` folder:

```bash
claude mcp add frostroot-data -- node --disable-warning=UNDICI-EHPA mcp/server.mjs
```

Behind an HTTPS proxy, Node needs `NODE_USE_ENV_PROXY=1` in the server's environment:

```bash
claude mcp add frostroot-data -e NODE_USE_ENV_PROXY=1 -- node --disable-warning=UNDICI-EHPA mcp/server.mjs
```

## In the bake

`npm run fetch:weather` gets the storm record through this server (`mcp/client.mjs` starts it, does the MCP handshake and calls `weather_series`), so the pipeline is KNYC → IEM → MCP → `data/raw/` → `npm run bake` → `data/baked/`.
