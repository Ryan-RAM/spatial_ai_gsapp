// Every tunable number of Frostroot: The Ramble lives here (CLAUDE.md §3).
// Section numbers (§n) point to semantic_model.md; D-nnn to DECISIONS.md.
// Values marked "default" in the model are starting points for tuning, not claims about the world.
// No DOM, no imports: this file is read by the simulation, the bake scripts, the bench and the page.

export const CONFIG = {
  seed: 20260123,

  // ---------------------------------------------------------------- place (§2, §3)
  cellSize: 3,                     // m per grid cell (D-001)
  origin: {                        // frame W: local east-north-up, origin at the KNYC station (§5, D-014)
    name: 'KNYC, Vista Rock',
    lat: 40.7790,                  // IEM station metadata (NWS rounds to the arcminute)
    lon: -73.9692,
  },
  studyArea: {                     // D-002 (§3.1), fixed in M1.1 from OSM (D-014)
    north: '79th Street Transverse',
    south: 'the Lake',
    west: 'the Lake',
    east: 'Fifth Avenue',
    // axis-aligned box in metres of frame W (x east, y north); the cells outside the park
    // inside it are masked in M1.2
    bboxM: { minX: -270, minY: -540, maxX: 460, maxY: 105 },
  },
  exits: ['E76', 'E79S', 'E79N'],  // D-002, D-015: Fifth Avenue entrances found in OSM (data/baked/paths.json)

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
    speed: 1.4,                    // m/s on flat open ground without snow (D-023)
    mappingTicks: 900,             // the dusk mapping phase before a night's rounds: 30 min (D-029)
    mappingStart: '2016-01-23T16:30',
    snowExponent: 0.3,             // f_snow^0.3: it moves through snow as roots (§6.3)
  },
  survivor: {
    sightRange: 20, coneDeg: 110,  // flashlight, m, scaled by vf(t)
    hearing: 40,
    warmthMax: 100,
    startWarmth: [55, 85],         // they have been out in the storm already: seeded per survivor (D-029)
    // E1: warmth falls by k x max(0, (10 - T_wc) / 10) x (0.3 + 0.7 openness) per second. k so that
    // full exposure at the storm's worst wind chill (-12.4 °C, 20:51) empties 100 in 25 min (D-025)
    warmthK: 0.02973,
    shelterGain: 1,                // E2: warmth +1 per second in a warming shelter
    speed: 1.3,                    // m/s walking (D-023); running doubles it (rule M3)
    snowExponent: 1,
  },

  // ---------------------------------------------------------------- distances (§6)
  // f_cover by cover code (src/sim/cover.js): outside, paved, dirt, lawn, woodland, thicket, rock, water, structure;
  // 0 = impassable (rule M2)
  coverSpeed: {
    survivor: [0, 1.0, 0.9, 0.8, 0.6, 0, 0, 0, 0],
    creature: [0, 1.0, 0.9, 0.8, 0.6, 1.0, 0, 0, 0],
  },
  snowHalfDepthCm: 25,             // f_snow = 1 / (1 + depth / 25)
  // muffling of the acoustic distance, in metres of open air that would make a sound as faint
  muffling: {                      // D-023
    trunk: 4,                      // per trunk the sound passes
    crown: 3,                      // per evergreen crown
    structurePerM: 6,              // per metre of wall or building it passes through
    groundPerM: 6,                 // per metre of ground (a hill or rock between)
    snowFactor: 0.5,               // m_snow = 0.5 x snowRate (cm/h) x d_E / 10
    windMax: 0.3,                  // w = 0.3 x min(wind / 10 m/s, 1)
  },
  walkQuietM: 18,                  // rule M3: walking steps count as 18 m farther

  // ---------------------------------------------------------------- snow and tracks (§4.2, rules S, T)
  hindranceCm: 40,                 // S2
  plowedCm: 5,                     // S3
  trackFillCm: 3,                  // T2: a track is gone once 3 cm of new snow fill it (D-024; model: 10)
  trackWindCoef: 6,                // T2: fill x (1 + 6 x openness x windFactor) (D-024; model: 2)
  snowUpdateTicks: 15,             // recompute the snow layer every 15 ticks (30 s of storm time)
  gustMask: 0.02,                  // threshold x max(0.4, 1 - 0.02 x gust in kt) (§6.2)

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
  cost: { plowPerM: 1, lamp: 150, shelter: 1000, sign: 50 },   // D-027; the full budget costs 5,300
  lampRadius: 12,                  // m
  lampHeight: 4,                   // m: light reaches the cells it can see from here
  shelterCapacity: 2,
  // §11.4: two spawn zones in the Ramble (D-027): just west of Azalea Pond (§15), and by the Ramble Stone Arch
  spawnZones: [
    { id: 'azalea-west', x: -58, y: -214, r: 15 },
    { id: 'stone-arch', x: -170, y: -75, r: 15 },
  ],

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
