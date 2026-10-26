// Every tunable number of the simulation lives here.
// The perception parameters (vision range, cone angles, hearing range) are fixed by the
// assignment design; balancing only touches the AI behaviour block at the bottom.

export const CONFIG = {
  seed: 20261022,

  // Grid
  width: 36,
  height: 26,
  levelHeight: 3,          // the canopy floor is 3 cells above the ground
  eyeHeight: 1.5,          // eye point above the floor an agent stands on

  // Solid volumes (heights in cells, measured from the ground)
  treeTop: 2.75,           // tree trunks and crowns fill the ground level up to the canopy slab
  bushTop: 1.8,            // bushes are taller than eye height, but you can look over them from above
  rockTop: 2.0,
  slabBottom: 2.75,        // platform floor slab, between ground level and canopy level
  slabTop: 3.0,
  foliageTop: 5.5,         // leaf clumps on the platforms

  // Map generation
  treeCount: 115,
  bushRows: 24,
  rockCount: 12,
  platformCount: 5,
  ladderCount: 5,
  foliageClumpsPerPlatform: 2,

  // Vision: forward cone, 3D Euclidean distance, blocked by solid volumes
  visionRange: 9,
  coneHorizontalDeg: 120,  // full horizontal opening
  coneVerticalDeg: 60,     // up and down from the horizon

  // Hearing: 360 degrees, path distance along walkable cells
  hearingRange: 12,
  ladderCost: 3,

  // 3D rays cast from every walkable cell (visibility fingerprint)
  rayAzimuthStepDeg: 5,                     // 72 rays per ring
  rayElevationsDeg: [-60, -30, 0, 30, 60],  // five rings
  rayPoles: true,                           // plus straight up and straight down

  // Round
  maxSteps: 500,
  minStartPathDistance: 22,

  // AI behaviour (the only block changed while balancing)
  ai: {
    policeOpenQuantile: 0.5,      // patrol targets are drawn from the more open half of the map
    policePatrolMin: 8,           // patrol targets are at least this far (path distance)
    policeScanSteps: 8,           // a full turn in 45 degree steps
    policePatrolLookEvery: 2,     // on patrol, glance sideways every n steps
    thiefHideQuantile: 0.25,      // hiding spots: the 25% of cells with the smallest view
    thiefHideMin: 60,
    thiefHideMax: 120,
    thiefLookEvery: 6,            // while hiding, turn the head every n steps
    thiefSneakEvery: 2,           // sneaking: one cell every two steps
    thiefHoldBreath: 6,           // steps of silence after hearing a distant police officer
    thiefPanicDistance: 0,        // path distance at which hearing turns into fleeing
    thiefExposedFleeDistance: 12, // in plain view of the police (if it turned): run when it is this close
    thiefGiveawayWindow: 3,       // hearing the police within n steps of moving means "it heard me"
    thiefFleeMargin: 2,           // the thief must reach the escape cell this much sooner
    thiefExposureWeight: 2,    // how much the thief avoids spots that can be seen from many cells
    thiefAvoidPoliceWeight: 0.3,  // how much the thief prefers spots far from where it last noticed the police
    thiefHideSearchRadius: 26,    // look for hiding spots within this path distance
    policeTurnOnHear: true,
    policeRetarget: false,        // follow every new sound while investigating, or finish the current one       // the officer turns the head toward a sound at once
  },
};
