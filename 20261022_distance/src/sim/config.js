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
  noDeadEnds: true,               // every walkable cell lies on a loop: no path is a dead end

  // Vision: forward cone, 3D Euclidean distance, blocked by solid volumes
  visionRange: 9,
  coneHorizontalDeg: 120,  // full horizontal opening
  coneVerticalDeg: 60,     // up and down from the horizon

  // Hearing: 360 degrees, acoustic distance (straight line plus muffling by what it passes through)
  hearingRange: 12,
  // Extra cells of distance added for every grid cell of material the straight line passes through:
  // a footstep heard through one cell of rock sounds as faint as one 6 cells farther away in open air.
  muffling: { leaves: 1, bush: 1.5, tree: 3, rock: 6, floor: 6, wall: 100 },
  sneakQuietness: 5,       // sneaking steps are soft: heard as if 5 cells farther away

  // Walking: path distance along walkable cells (the bonus metric)
  ladderCost: 3,

  // 3D rays cast from every walkable cell (visibility fingerprint)
  rayAzimuthStepDeg: 5,                     // 72 rays per ring
  rayElevationsDeg: [-60, -30, 0, 30, 60],  // five rings
  rayPoles: true,                           // plus straight up and straight down

  // Round
  maxSteps: 500,
  minStartPathDistance: 22,
  catchDistance: 1.5,            // the police catches the thief on the same or a neighbouring cell
  exitSides: ['west', 'east'],   // one exit in the middle of each of these sides of the boundary wall
  diamondMinFromExit: 10,        // the diamond is never placed right next to an exit
  thiefStartFromDiamond: 22,     // the thief starts at least this far (path) from the diamond
  policeStartFromDiamond: [3, 10],

  // Running speeds in cells per step (fractions add up: 1.2 = one extra cell every 5 steps).
  // These are rules of the game, not AI tuning: balancing does not change them.
  speeds: {
    run: 1,                  // everyone's normal running speed
    thiefCarrying: 0.8,      // the diamond slows the thief down
    policeChase: 1,          // chasing by sight, before the theft, when not sprinting
    policeSprint: 1.2,       // the officer's sprint
    policeSprintStamina: 15, // after the theft the officer sprints for 15 cells, then tires back to 1
    policeCloseSprint: 5,    // within 5 cells (path) of the thief it knows about, the officer sprints anyway
  },

  // AI behaviour (the only block changed while balancing)
  ai: {
    policeGuardRadius: 10,        // patrol targets around the diamond lie within this path distance
    policeRoamChance: 0.45,       // chance that a patrol target is anywhere on the map instead
    thiefStageRadius: 8,          // the thief waits for its chance within this path distance of the diamond
    thiefQuietSteps: 8,           // ... until it has not heard the police for this many steps
    thiefWaitMax: 60,             // ... or for at most this long
    thiefHideAfterFlee: 20,       // after fleeing, lie low this long before sneaking back
    thiefLateMargin: 15,          // go for the diamond whatever the risk when time is this short
    policeOpenQuantile: 0.5,      // patrol targets are drawn from the more open half of the map
    policePatrolMin: 8,           // patrol targets are at least this far (path distance)
    policeScanSteps: 8,           // a full turn in 45 degree steps
    policePatrolLookEvery: 2,     // on patrol, glance sideways every n steps
    thiefHideQuantile: 0.25,      // waiting spots: among the 25% of cells with the smallest view
    thiefLookEvery: 6,            // while waiting, turn the head every n steps
    thiefSneakEvery: 2,           // sneaking: one cell every two steps
    thiefHoldBreath: 10,          // steps of silence after hearing a distant police officer
    thiefPanicDistance: 0,        // police this close (path distance): run (0: off)
    thiefMemorySteps: 2,          // the thief remembers where the police was for this many steps
    thiefExposedFleeDistance: 12, // in plain view of the police (if it turned): run when it is this close
    thiefApproachFlee: 8,         // footsteps coming closer within this path distance: run
    thiefGiveawayWindow: 3,       // hearing the police within n steps of moving means "it heard me"
    thiefFleeMargin: 2,           // the thief must reach the escape cell this much sooner
    thiefExposureWeight: 2,       // how much the thief avoids spots that can be seen from many cells
    thiefAvoidPoliceWeight: 0.3,  // how much the thief prefers spots far from where it last noticed the police
    policeTurnOnHear: true,       // the officer turns the head toward a sound at once
    policeChaseFollowsSound: false, // while chasing, follow footsteps too (true) or only what it sees
    policeRetarget: false,        // follow every new sound while investigating, or finish the current one
  },
};
