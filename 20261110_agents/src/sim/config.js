// Every tunable number of the project lives here: the site, the rule layer (lanes, altitude bands,
// no-fly zones, landing sites), the two agent types, and the population.
// The data scripts in data/scripts/ read `site` from this file too (through Node), so the bounding
// box is defined only once.
//
// Units: horizontal distances in metres, speeds in m/s, altitudes in FEET above mean sea level
// (aviation rules are written in feet; the simulation converts with FT below), angles in degrees.
// Sources and reasoning for each rule value: docs/rules.md.

export const FT = 0.3048; // international foot in metres

export const CONFIG = {
  seed: 20261110,

  // ---- Site: Lower + Midtown Manhattan, the Hudson and the East River ---------------------
  site: {
    // lat/lon bounding box (WGS84). South edge takes in Governors and Liberty islands,
    // north edge is around W/E 86th St so the Central Park crossing fits.
    south: 40.684, north: 40.792, west: -74.052, east: -73.930,
    cellSize: 50,          // planning / knowledge grid cell (m)
    magneticDeclination: -13, // deg, west negative (NOAA WMM2025, New York, about 13 deg W)
  },

  data: {
    buildings: 'data/processed/buildings.json', // made by data/scripts/process_nyc.py
    land: 'data/processed/land.json',
    useRealData: false,      // false: the simplified, simulated Manhattan (src/sim/placeholder.js), nothing to download
    usePlaceholderIfMissing: true,               // with useRealData: fall back to the simulated city
  },

  // ---- Rule layer --------------------------------------------------------------------------
  // Altitude bands (feet MSL). Drones: 14 CFR 107.51 (400 ft AGL max), split by magnetic course
  // in the spirit of the VFR hemispheric rule (14 CFR 91.159). Helicopters: the SFRA split into
  // local (< 1,000 ft) and transient (1,000 to 1,299 ft) operations below the 1,300 ft Class B
  // floor over the Hudson (14 CFR 93.350-93.352).
  bands: {
    drone: {
      transition: [0, 150],   // take-off, landing, delivery drop only
      eastbound: 200,         // magnetic course 000-179
      westbound: 300,         // magnetic course 180-359
      ceiling: 400,
      tolerance: 40,          // +/- ft that still counts as "in the band"
    },
    buffer: [400, 500],       // nobody cruises here: vertical gap between drones and helicopters
    heli: {
      tour: { floor: 500, ceiling: 999, cruise: 800 },       // SFRA "local" operations
      medical: { floor: 1000, ceiling: 1299, cruise: 1100 }, // SFRA "transient" operations
      sublayerStep: 100,      // a helicopter may step +/- this much inside its band to avoid traffic
    },
    classBFloor: 1300,        // hard ceiling: entering Class B needs an ATC clearance we do not model
  },

  // One-way river loop, flown clockwise round Manhattan: north up the Hudson along its east
  // (Manhattan) shore as 14 CFR 93.352 asks of northbound pilots, east over Central Park,
  // south down the East River along the Manhattan shore, and west round the Battery.
  // Points are [lat, lon]; the lane is `width` metres wide and spans both helicopter bands.
  lanes: [
    { id: 'hudson-nb', name: 'Hudson northbound (east shore)', width: 380, enabled: true,
      pts: [[40.6995, -74.0235], [40.7100, -74.0215], [40.7250, -74.0150], [40.7400, -74.0130],
            [40.7550, -74.0095], [40.7680, -74.0020], [40.7790, -73.9935], [40.7845, -73.9890]] },
    { id: 'park-eb', name: 'Central Park crossing (eastbound)', width: 340, enabled: true,
      pts: [[40.7845, -73.9890], [40.7815, -73.9780], [40.7790, -73.9680], [40.7765, -73.9560],
            [40.7745, -73.9440]] },
    { id: 'east-sb', name: 'East River southbound (Manhattan shore)', width: 300, enabled: true,
      pts: [[40.7745, -73.9440], [40.7660, -73.9500], [40.7580, -73.9560], [40.7520, -73.9600],
            [40.7470, -73.9625], [40.7380, -73.9672], [40.7280, -73.9665], [40.7170, -73.9700],
            [40.7105, -73.9780], [40.7065, -73.9890], [40.7040, -73.9985]] },
    { id: 'battery-wb', name: 'Battery turn (westbound)', width: 340, enabled: true,
      pts: [[40.7040, -73.9985], [40.6985, -74.0080], [40.6970, -74.0170], [40.6995, -74.0235]] },
    // The real SFRA also has a southbound lane on the west (New Jersey) shore. It is off by
    // default so the one-way loop can be tested; switch it on to compare.
    { id: 'hudson-sb', name: 'Hudson southbound (west shore)', width: 300, enabled: false,
      pts: [[40.7845, -73.9950], [40.7700, -74.0050], [40.7550, -74.0175], [40.7400, -74.0235],
            [40.7250, -74.0275], [40.7100, -74.0310], [40.7000, -74.0330]] },
  ],
  laneNodeSpacing: 120,       // a lane is perceived as gates every 120 m along its centreline

  // No-fly zones (cylinders). `applies`: who must stay out. Reasons in docs/rules.md.
  noFly: [
    { id: 'un', name: 'United Nations HQ', lat: 40.7489, lon: -73.9680, radius: 330,
      floor: 0, ceiling: 1300, applies: ['drone', 'tour', 'medical'] },
    { id: 'liberty', name: 'Statue of Liberty National Monument', lat: 40.6950, lon: -74.0425, radius: 900,
      floor: 0, ceiling: 400, applies: ['drone'] }, // covers Liberty and Ellis islands
    { id: 'e13-substation', name: 'Con Ed East 13th St substation', lat: 40.7290, lon: -73.9745, radius: 250,
      floor: 0, ceiling: 400, applies: ['drone'] },
    // Drones keep out of the heliport traffic areas (14 CFR 107.43). Sizes are our design.
    { id: 'jrb-area', name: 'Downtown Manhattan Heliport area', lat: 40.70121, lon: -74.00903, radius: 450,
      floor: 0, ceiling: 500, applies: ['drone'] },
    { id: '6n5-area', name: 'East 34th St Heliport area', lat: 40.74250, lon: -73.97200, radius: 400,
      floor: 0, ceiling: 500, applies: ['drone'] },
    { id: 'jra-area', name: 'West 30th St Heliport area', lat: 40.75490, lon: -74.00706, radius: 400,
      floor: 0, ceiling: 500, applies: ['drone'] },
  ],

  // Heliports (FAA location IDs and positions from the FAA facility data, see docs/rules.md).
  // `pads` = landing positions used at the same time (our assumption, not FAA data).
  heliports: [
    { id: 'JRB', name: 'Downtown Manhattan Heliport (Pier 6)', lat: 40.70121, lon: -74.00903, pads: 3, elevationFt: 10 },
    { id: '6N5', name: 'East 34th Street Heliport', lat: 40.74250, lon: -73.97200, pads: 2, elevationFt: 10 },
    { id: 'JRA', name: 'West 30th Street Heliport', lat: 40.75490, lon: -74.00706, pads: 2, elevationFt: 7 },
  ],

  // Rooftop drone pads are picked from the building data at load time.
  dronePads: {
    count: 26,
    minRoofFt: 35, maxRoofFt: 170,  // under the 200 ft band, above street clutter
    minFootprint: 1400,             // m2 of roof
    minSpacing: 650,                // m between pads
    hubs: 6,                        // the first pads (spread over the site) are delivery hubs
    capacity: 2,                    // drones landing or taking off at once on an ordinary pad
    hubCapacity: 4,                 // ... and on a hub (a depot roof with several landing spots)
  },

  // Rule signs: the agents learn the altitude bands only when they see a sign (a UTM broadcast
  // beacon, drawn as a post). Signs stand at every pad and heliport, at lane gates and on a grid.
  bandSigns: { gridSpacing: 1000 },

  // Bridge towers are not in the building footprints but are real obstacles (heights in ft).
  structures: [
    { name: 'Brooklyn Bridge, Manhattan tower', lat: 40.70700, lon: -74.00030, w: 40, d: 20, heightFt: 276 },
    { name: 'Brooklyn Bridge, Brooklyn tower', lat: 40.70440, lon: -73.99460, w: 40, d: 20, heightFt: 276 },
    { name: 'Manhattan Bridge, Manhattan tower', lat: 40.70900, lon: -73.99280, w: 40, d: 20, heightFt: 336 },
    { name: 'Manhattan Bridge, Brooklyn tower', lat: 40.70520, lon: -73.98950, w: 40, d: 20, heightFt: 336 },
    { name: 'Williamsburg Bridge, Manhattan tower', lat: 40.71500, lon: -73.97600, w: 40, d: 20, heightFt: 335 },
    { name: 'Williamsburg Bridge, Brooklyn tower', lat: 40.71280, lon: -73.96800, w: 40, d: 20, heightFt: 335 },
    { name: 'Queensboro Bridge, west tower', lat: 40.75760, lon: -73.95700, w: 30, d: 30, heightFt: 350 },
    { name: 'Queensboro Bridge, east tower', lat: 40.75560, lon: -73.95000, w: 30, d: 30, heightFt: 350 },
  ],

  // ---- Agents ------------------------------------------------------------------------------
  population: { drones: 180, tours: 12, medical: 6 },

  drone: {
    speed: 12,             // m/s cruise
    climbRate: 3,          // m/s
    descentRate: 4,        // m/s
    size: 1.2,             // m across
    cone: { horizontal: 70, vertical: 40, range: 180 }, // full horizontal opening, +/- vertical
    separation: { horizontal: 25, vertical: 12 },       // m; a loss below this is counted
    battery: 260,          // Wh
    hoverPower: 620,       // W, about 25 minutes of hover on a full battery
    dragK: 0.9,            // W per (m/s)^2 extra in forward flight
    climbEff: 0.6,         // fraction of electrical power that turns into lift work when climbing
    mass: 9,               // kg with package
    reserve: 0.22,         // battery fraction that triggers an emergency landing
    deliverHold: 12,       // s hovering over the drop point
    rechargeTime: 90,      // s on the hub before the next trip
    naiveAltitudeFt: 250,  // altitude flown before the band rule is known
    tripRadius: 3200,      // m, customers are within this distance of the hub
    repeatCustomerChance: 0.55, // chance the next order goes to a customer served before
    customersPerHub: 8,
    congestion: { radius: 120, count: 4, holdCount: 6, holdTime: 8, penalty: 6, memory: 240 },
    clearance: 12,         // m above a roof before the cell counts as passable
  },

  heli: {
    tour: { speed: 45, turnRate: 7, climbRate: 4, dwell: 90 },     // ~ 90 kt
    medical: { speed: 62, turnRate: 6, climbRate: 6, dwell: 150 }, // ~ 120 kt; SFRA cap is 140 kt
    size: 13,              // m rotor diameter class
    cone: { horizontal: 140, vertical: 50, range: 1200 },
    refRangeFactor: 2.0,   // tall towers and bridges are seen this many times farther
    separation: { horizontal: 300, vertical: 150 }, // target spacing (ft for vertical is converted)
    lossOfSeparation: { horizontal: 150, vertical: 100 }, // counted as a safety event (m / ft)
    naiveAltitudeFt: 900,
    dispatchError: 350,    // m: the given heliport position is only approximate
    landCost: 1.35,        // planning cost over land (noise, risk) relative to water
    laneCost: 0.55,        // planning cost inside a known lane, flown the right way
    clearance: 60,         // m above a roof before a cell counts as passable
    congestion: { radius: 900, count: 3, penalty: 4, memory: 300 },
    replanEvery: 20,       // s
    priorityRange: 1500,   // m within which others yield to a medical helicopter they can see
  },

  // Tour helicopters fly a sightseeing circuit given as dispatch points; medical flights come in
  // from the edge of the site to a heliport and leave again.
  tours: {
    bases: ['JRB', 'JRA'],
    sights: [ // [lat, lon, name]
      [40.6930, -74.0310, 'Statue of Liberty viewpoint'],
      [40.7645, -74.0040, 'Intrepid'],
      [40.7800, -73.9650, 'Central Park'],
      [40.7300, -73.9660, 'East Village riverfront'],
    ],
  },
  medical: {
    bases: ['6N5', 'JRB', 'JRA'],
    entries: [ // [lat, lon] where medical flights enter / leave the site
      [40.7910, -73.9920], [40.6860, -74.0300], [40.7700, -73.9330], [40.7300, -74.0500],
    ],
  },

  // ---- Simulation --------------------------------------------------------------------------
  sim: {
    warmUpSeconds: 600,    // the page simulates this much before it opens, so the first view already has agents and paths
    dt: 0.5,               // s per tick
    senseEvery: 2,         // ticks between perception updates
    maxTicks: 14400,       // 2 hours of simulated time for the headless run
    trailSpacing: 25,      // m between recorded trail points
    trailMax: 400,         // points kept per agent for its own trail
    heatCell: 50,          // m, collective heat maps share the planning grid
  },

  render: {
    agentScale: { drone: 18, heli: 4.5 }, // drawn bigger than life so they can be seen at city scale
    verticalExaggeration: 1.0,
    pathsMaxSegments: 300000,
  },
};
