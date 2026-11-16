// The outside data sources, in one place (semantic model §16, D-011, D-012, D-017). Used by the
// fetch and bake scripts and the MCP server.

export const NOAA = 'https://noaa-nos-coastal-lidar-pds.s3.amazonaws.com';
// 2017 NYC topobathymetric LiDAR, bare-earth DEM (EPSG:6539 ftUS, NAVD88 ftUS); the Ramble is in tile 025
export const DEM_URL = `${NOAA}/dem/NYC_topobathy_BE_DEM_2017_9307/be_NYC_025.tif`;
// the same survey's point cloud (COPC, UTM 18N / NAVD88 m), the four 2500 ft tiles of the study area
export const POINT_TILES = ['990220', '990222', '992220', '992222'].map((t) => `${NOAA}/laz/geoid18/9306/20170504_${t}.copc.laz`);
// hourly observations, Central Park (Iowa Environmental Mesonet ASOS archive)
export const IEM_ASOS = 'https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py';
