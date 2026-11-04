# Frostroot: Night Run

**Spatial AI (ARCH6956-1), Columbia GSAPP. Assignment: Workshop, Position + Movement.**

Instructor: [William Martin](https://awmartin.xyz/spatial-computing/course/)

Group: **Ryan Fu, Lu Liu, Yifan Zhao**

A playable night escape in a snowy two-level forest, built on last week's [Misty Forest Chase](../20261022_distance/). You find a vaccine case in the forest and carry it to the hospital door on the east side while a creature made of roots hunts you. Every rule of the game is a preposition of place or movement: you hide *among* cover, stay out of its view or slip *behind* it, get past it, and it ambushes you by standing *between* you and the hospital.

Play: open `index.html` through a web server (for example `python3 -m http.server` in this folder). Tests: `npm test`. Balance: `npm run balance`.

## Controls

| Key | Action |
|---|---|
| W A S D / arrows | move (walking is quiet) |
| Shift + move | run: faster but loud, uses stamina (3 seconds, refills while walking) |
| Space | shoot: if the creature is within 7 cells with a clear line, it freezes for 3 seconds |
| E (on a ladder) | climb up to the canopy walkways or down |
| M / P | map view / pause |

On a phone, on-screen buttons appear.

## Rules

- **Win:** reach the hospital door with the case. Screen: *你拯救了世界 · You saved the world*.
- **Lose:** the creature reaches you (same or neighbouring cell, not while frozen), or the night runs out after 6 minutes. Screen: *你被它融合了 · You became part of it*.
- **Sight** (Euclidean distance): the creature sees 9 cells ahead in a 120° cone, blocked by trees, bushes, rocks, leaves and floors. You only see the creature when it is within 9 cells with a clear line; otherwise the minimap shows a fading **?** where you last saw or heard it.
- **Hearing** (acoustic distance): your running steps are heard within 12, walking within 7; shots within 20. You hear the creature move within 12.
- **The case alarm:** when you pick up the case it beeps for 9 seconds and the creature knows where you are.
- **Difficulty:** creature speed and bullets. With a scripted player (`src/sim/bot.js`, which only knows what a player could see and hear) the win rate is about **84% on Easy, 51% on Normal, 24% on Hard** (300 runs on 6 maps each).

## Position (Part 1)

All rules live in [`src/sim/relations.js`](src/sim/relations.js) and are checked after every tick; thresholds in `config.relations`.

| Relation | Rule on the grid | Indicator |
|---|---|---|
| **Among (hidden)** | at least 4 of the 8 cells around you are solid (trees, bushes, rocks; leaves on the canopy) | green double ring, green 3 × 3 frame on the minimap, HIDDEN chip |
| **Behind** | within 9 cells and more than 90° from where the other faces | rear half-disc shaded, BEHIND tag |
| **Adjacent** | no occupiable cell in between: one walking step (no cutting a blocked corner, ladders count) or the same column on the other level | one yellow outline around both cells: you and the creature, the case, the hospital door, a crow |
| **Between** | on the plan, the creature projects inside the segment from you to your goal (case, then door) and lies within 1.6 cells of it | dashed line, crossed out at the creature, IN THE WAY tag |
| **Above / below** | one on the canopy, the other on the ground, at most 2 columns apart | double rings, ▲ ABOVE / ▼ BELOW, vertical line in 3D |

Relations that involve the creature are only shown while you can see it.

## Position (Part 2): behaviours

- **(a) Placement → response.** *Hidden among:* the creature does not see you among cover, even inside its cone, unless it is within 2 cells. *Ambush:* when the alarm stops and it has lost you while you carry the case, it goes to stand two thirds of the way along your shortest walk to the door, between you and the hospital.
- **(b) Intrinsic capability: crows.** Three crows perch on the canopy. When you are adjacent to one it caws; the creature hears the caw within an acoustic distance of 16 and comes to the crow.

## Movement

| Movement | Rule | Indicator |
|---|---|---|
| **Toward / away** | the mover's path distance to the other, before and after its step | arrow on the minimap, solid toward, dashed away |
| **Up / down** | a ladder changed the level | ↑ UP / ↓ DOWN tag, arrow cone in 3D |
| **Around** | within 8 cells of the case, the bearing from it turned through 270° | the trail with an arrowhead, AROUND tag |
| **Past** | the gap fell to 4 cells or less and grew again while the creature never saw you | ring at the closest point, » PAST tag |

The page has a diagram for each relation and behaviour.

## The scene

A 46 × 32 grid with two levels: ground (pines, bushes, rocks, a boundary wall) and canopy walkways 3 cells up, joined by ladders, with no dead ends. Maps come from a seed; **New map** draws another. The creature, the case, the crows, the hospital, the night look and the story are original to this project.

## The four distances (from last week, where they drove a police officer and a thief)

Positions are cell centres. An agent's eye point is 1.5 cells above the floor it stands on, and the canopy floor is 3 cells above the ground.

### 1. Euclidean distance (sight)

d<sub>E</sub>(a, b) = &radic;((x<sub>a</sub> &minus; x<sub>b</sub>)&sup2; + (y<sub>a</sub> &minus; y<sub>b</sub>)&sup2; + (z<sub>a</sub> &minus; z<sub>b</sub>)&sup2;)

An agent sees the other when:

- d<sub>E</sub> &le; 9 (the fog);
- the other is inside its forward cone: 120&deg; wide and &plusmn;60&deg; up and down. Vision only looks forward;
- the 3D segment between the eyes does not pass through a solid volume (tree, bush, rock, leaf clump, platform floor slab). Open air blocks nothing, so you can look down from a platform edge or up through a gap.

The line of sight is a 2D grid DDA (Amanatides & Woo) over the columns of the map. In each column it tests the exact height range the segment passes through against that column's solid intervals (`src/sim/los.js`).

### 2. Acoustic distance (hearing)

d<sub>A</sub>(a, b) = d<sub>E</sub>(a, b) + &Sigma;<sub>k</sub> m<sub>k</sub>

Sound travels along the same straight line as sight, but solids muffle it instead of stopping it. For every grid cell of solid material the line passes through, a muffling cost m<sub>k</sub> is added. The cost is in cells of open air that would make the sound just as faint: leaf clump +1, bush +1.5, tree +3, rock +6, platform floor +6 (`config.muffling`). Whenever an agent moves, the other hears it if d<sub>A</sub> &le; 12, and knows where the sound came from. A sneaking thief steps softly: its steps count as 5 cells farther away (`config.sneakQuietness`), so they are heard only within d<sub>A</sub> &le; 7. Running steps and the police's steps are heard at 12. Hearing works in every direction. Through open air d<sub>A</sub> = d<sub>E</sub>, so someone on a platform edge hears footsteps on the ground below (`acousticDistance` in `src/sim/los.js`).

### 3. Path distance (walking, the bonus)

d<sub>P</sub>(a, b) = the shortest walk from a to b. Step costs: 1 straight, &radic;2 diagonal, 3 for a ladder. A diagonal step may not cut the corner of an obstacle. It is computed with Dijkstra's algorithm over the walkable cells of both levels (`src/sim/paths.js`). Both AIs move along these shortest paths. The thief uses it to find escape cells that it reaches before the police.

### 4. Perceptual distance (visibility fingerprint)

From every walkable cell, 362 rays are cast in 3D: 72 directions (every 5&deg;) on five elevation rings (&minus;60&deg;, &minus;30&deg;, 0&deg;, +30&deg;, +60&deg;), plus straight up and straight down. Each ray stops at the first solid volume or at 9 cells. The vector of the 362 ray lengths is the cell's **visibility fingerprint**. It covers 360&deg; and does not depend on facing.

d<sub>V</sub>(a, b) = &radic;(&Sigma;<sub>i</sub> (r<sub>i</sub>(a) &minus; r<sub>i</sub>(b))&sup2;)

The fog cuts every ray at 9, so open places have similar fingerprints, while places inside the thicket all differ. The same cached rays draw the faint all-around view and the bright vision cone in the 3D view (`src/sim/rays.js`).

## How it answers the assignment

1. **At least two metrics, between two positions and between two agents.** There are four. The distance panel shows all four between the two agents at every step. The metric check computes them between thousands of pairs of positions and shows which ones really are metrics.
2. **Visualize and compare.** In 3D, the solid line is the Euclidean distance, and dots on it mark where the sound is muffled (acoustic distance). The dashed line is the shortest path, and the rays show the fingerprint and the vision cone. A chart plots all four over the round, with the 9-cell vision limit and the 12-cell hearing limit.
3. **Far in one metric, near in another.** An automatic hint names these moments as they happen:
   - stacked on two levels: near in a straight line, but a floor in between and a long walk via a ladder;
   - a hedge in between: near in a straight line, but a long way round;
   - near but muffled: well within 12 cells in a straight line, but the material in between pushes the acoustic distance past 12;
   - in view but far to walk: a clear line from a platform edge, but a long walk;
   - back to back: near, but each one outside the other's cone;
   - far apart, but in places that look alike: beyond the fog, but similar fingerprints.
4. **Bonus: distance around obstacles.** The path distance is the shortest walk around solid cells and up and down ladders. Both AIs move along it.

## Metric axiom check (default map, 677 walkable cells)

Non-negativity, symmetry and the triangle inequality are tested on 4,000 random triples per distance. Identity of indiscernibles (d = 0 only for the same cell) is tested on every cell.

| Distance | Non-negativity | Symmetry | Triangle inequality | Identity of indiscernibles | Verdict |
|---|---|---|---|---|---|
| Euclidean | 0 violations | 0 violations | 0 violations | holds | metric |
| Acoustic | 0 violations | 0 violations | **598 violations** | holds | semimetric |
| Path | 0 violations | 0 violations | 0 violations | holds | metric |
| Perceptual | 0 violations | 0 violations | 0 violations | holds on this map, not in general | pseudometric |

The acoustic distance fails the triangle inequality. A straight line from a to c can cross a rock while a to b and b to c both pass beside it, so going "via b" sounds closer than going straight. Real sound does take that detour: it bends around obstacles (diffraction). This model follows only the straight line, which keeps it simple, at the price of the triangle inequality. A distance that keeps the other axioms but loses the triangle inequality is a **semimetric**.

The perceptual distance compares what two places look like, not where they are. Two different cells with identical surroundings have d<sub>V</sub> = 0; the test suite builds such a case (two identical rooms). On the default map no two cells match exactly. The closest pair of different cells differs by 10.0, while a typical pair differs by about 69. A distance where different places can be at 0 is a **pseudometric**. In space, this is what getting lost means: two places that look the same from the inside can be far apart. The page recomputes this table for every new map.

## The AIs

**Police**
- *Patrolling*: guards the diamond. It walks to open spots, usually within 10 cells of the diamond and sometimes anywhere on the map, glancing to the side every other step.
- *Investigating a sound*: turns toward the thief's footsteps and walks the shortest path to where they came from, without changing course for new sounds on the way.
- *Chasing the thief*: on seeing the thief, it runs to where it saw it. Within 5 cells of the thief it sprints at 1.2 times the normal speed. It catches the thief on the same or a neighbouring cell.
- *Scanning around*: at a sound, or where it lost sight of the thief, it turns a full circle, then patrols again.
- *Tracking the diamond*: from the moment the diamond is taken, its tracker gives the police its position at every step. The officer runs straight for it along the shortest path, sprinting at 1.2 times the normal speed for the first 15 cells, then tiring back to normal speed (it still sprints whenever it is within 5 cells).

**Thief**
- *Sneaking*: heads for a hidden spot within 8 cells of the diamond, one cell every two steps, with soft steps.
- *Waiting for a chance* / *Looking around*: near the diamond, it waits until it has not heard the police for 8 steps, turning its head now and then.
- *Going for the diamond*: runs to it, one cell per step. Close to the time limit, it goes whatever the risk.
- *Escaping with the diamond*: runs for the exit with the biggest head start over the police, at 0.8 times the normal speed: the diamond is heavy.
- *Holding breath*: hears the police, but the police is not close. It freezes, makes no sound and turns toward the noise.
- *Fleeing* / *Hiding*: when seen, about to be seen, or hearing the police come closer, it runs to a cell it reaches first, out of the police's sight. Then it lies low before trying again.

## Balance

`node tests/balance.mjs` plays 320 rounds without rendering: 40 rounds on each of 8 maps (seeds 20261022 to 20261029). Only AI behaviour was tuned, plus the soft sneaking steps; the running speeds in `config.speeds` are rules of the game. Vision range (9), the vision cone (120&deg;, &plusmn;60&deg;), hearing range (12) and the muffling costs were never changed for balance.

| Result | Value |
|---|---|
| Rounds | 320 |
| Police win rate | **80.3%** (257 of 320) |
| Average round length | 155.2 steps |
| Average length of a police win | 156.8 steps |

How the 320 rounds end: the police catches the thief before the theft in 54%, and with the diamond in 26%. The thief escapes after being chased in 4%, and without ever being seen in 16%.

**This is outside the 40–60% target.** The sprint rules (1.2 times the normal speed within 5 cells of the thief, and for 15 cells after the theft) and the slower thief carrying the diamond give the police a clear edge; tuning the AI alone brings it down to about 71%. On the default map alone, 200 rounds give a 74.0% police win rate and an average of 157 steps.

## Run it locally

The page is plain HTML and ES modules with no build step. three.js 0.160.0 loads from jsDelivr. Browsers do not load modules from `file://`, so serve the folder:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

After changing any file, change the `?v=` version stamp in `index.html` (it appears on `style.css` and on every module in the import map). Otherwise browsers may keep old copies of the CSS and JS for a few minutes and mix them with the new page.

Tests and the balance run use Node 18 or newer, with no dependencies:

```sh
npm test               # node --test tests/*.test.mjs
npm run balance        # node tests/balance.mjs [rounds] [maps]
```

The tests cover 3D line of sight (clear view on one level, blocked by a tree, hidden by a platform floor, seen through open air from above and from below, beyond 9 cells, target behind the viewer, one-sided sight), the vision cone limits, ray lengths, acoustic muffling (open air, bush and rock, floor slab versus open air, symmetry), path distance (diagonals, corner cutting, detours, ladders), map connectivity, no dead ends (bridge detection), the metric axioms, and the round loop (exits, diamond placement, theft, catches and escapes). New this week (`tests/relations.test.mjs`): adjacent (including corners and stacked cells), above, between, behind, among, relations listed during real rounds, and owls hooting and resting.

## Files

```
index.html, style.css        the game page (works at phone width, touch buttons on phones)
src/sim/                     game core, no DOM, runs in Node
  config.js                  every parameter in one object (config.game, config.relations, config.crows)
  escape.js                  one run: you, the case, the hospital, shots, winning and losing
  creature.js                the creature's AI
  relations.js               position + movement relations, crows
  bot.js                     a scripted player for balancing and tests
  world.js, los.js, rays.js, paths.js, metrics.js, context.js   map, sight, hearing, paths (last week)
src/render/                  three.js night scene and the minimap
src/ui/                      input, game loop, HUD and panels
tests/                       node:test suites and the balance script
```
