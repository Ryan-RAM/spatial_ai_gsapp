// Every tunable number of Frostroot: The Ramble lives here (CLAUDE.md §3).
// Section numbers (§n) point to semantic_model.md; D-nnn to DECISIONS.md.
// Values marked "default" in the model are starting points for tuning, not claims about the world.
// No DOM, no imports: this file is read by the simulation, the bake scripts, the bench and the page.

export const CONFIG = {
  seed: 20260123,

  // ---------------------------------------------------------------- place (§2, §3)
  cellSize: 3,                     // m per grid cell (D-001)
  origin: {                        // frame W: local east-north-up, origin at the KNYC station (§5)
    name: 'KNYC, Vista Rock',
    lat: 40.77898,                 // approximate; replaced by the station coordinates in M1.1
    lon: -73.96925,
  },
  studyArea: {                     // D-002 (§3.1): bounds named here, coordinates fixed in M1.1 from OSM
    north: '79th Street Transverse',
    south: 'the Lake',
    west: 'the Lake',
    east: 'Fifth Avenue',
  },
  exits: ['E72', 'E76', 'E79'],    // D-002: Fifth Avenue entrances that count as exits

  // ---------------------------------------------------------------- time (§2, §4)
  tickSeconds: 2,                  // storm time per tick
  window: {                        // D-005: the evaluation night, local time America/New_York
    start: '2016-01-23T17:00',
    end: '2016-01-24T05:00',
  },
  stormTotalSnowIn: 27.5,          // official storm total; calibrates the snow-to-liquid ratio (§4.2)

  // ---------------------------------------------------------------- agents (§7.6)
  survivorsPerRound: 2,            // D-003
  creaturesPerNight: 1,            // D-003
  creaturesHard: 2,                // D-003
  creature: {
    sightRange: 30, coneDeg: 100,  // m, scaled by vf(t)
    hearing: 45,                   // m of acoustic distance
    plowedSpeedFactor: 0.7,
    litCostFactor: 3,              // light-averse: lit cells cost x3 in its plans
  },
  survivor: {
    sightRange: 20, coneDeg: 110,  // flashlight, m, scaled by vf(t)
    hearing: 40,
    warmthMax: 100,
  },

  // ---------------------------------------------------------------- rounds and evaluation (§7.9, §11.4)
  roundTicks: 900,                 // 30 min of storm time
  suite: {
    startTimes: ['17:00', '19:00', '21:00', '23:00', '01:00', '03:00'],
    spawnZones: 2,
    seeds: 2,                      // 6 x 2 x 2 = 24 rounds
  },
  replanEveryTicks: 5,             // §12

  // ---------------------------------------------------------------- fitness (§11.2)
  perspective: 'survivors',        // D-004: 'survivors' (F) or 'creature' (F')
  lambdaCost: 0.1,                 // D-004, tuned in M6

  // ---------------------------------------------------------------- interventions (§9 I1)
  budget: { plowedM: 1200, lamps: 12, shelters: 2, signs: 6 },
  lampRadius: 12,                  // m
  shelterCapacity: 2,

  // ---------------------------------------------------------------- automated mode (§11.6)
  epochs: 50,
  childrenPerEpoch: 1,             // (1+1)-ES; 2-4 as an advanced option

  // ---------------------------------------------------------------- secondary functions (§13)
  tonightMode: true,               // D-006: live KNYC weather, geometry unchanged

  render3dStyle: 'frostroot-on-real-geometry', // D-007, finalised by the style frame (M5.1)

  // ---------------------------------------------------------------- performance targets (CLAUDE.md §3), checked by `npm run bench`
  targets: {
    roundMs: 150,                  // one headless 900-tick round
    suiteMs: 3000,                 // one 24-round EvaluationSuite, in parallel
    fps: 60,
    firstLoadMs: 3000,
    bakedGzipMB: 15,
  },
};
