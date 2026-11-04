# Misty Forest Chase: Position + Movement

**Spatial AI (ARCH6956-1), Columbia GSAPP. Assignment: Workshop, Position + Movement.**

Instructor: [William Martin](https://awmartin.xyz/spatial-computing/course/)

Group: **Ryan Fu, Lu Liu, Yifan Zhao**

This builds on last week's [Misty Forest Chase](../20261022_distance/) (distance + proximity). The same self-running heist now also reads **prepositions of place and movement** between the occupants of the forest, shows each one as it happens, and lets some of them change what the agents do.

Open `index.html` through a web server (for example `python3 -m http.server` in this folder). Tests: `npm test`. Balance: `npm run balance`.

## Position (Part 1): five relations

All rules live in [`src/sim/relations.js`](src/sim/relations.js) and are checked after every step; thresholds are in `config.relations`.

| Relation | Rule on the grid | Indicator |
|---|---|---|
| **Above / below** | One agent on the canopy, the other on the ground, at most 2 columns apart on the plan | Double rings at both columns on both plans, ▲ ABOVE / ▼ BELOW tags; a vertical dashed line in 3D |
| **Behind** | Within 9 cells (the fog) and more than 90° from where the other faces. The vision cone is 120° wide, so behind is never seen | The observer's rear half-disc is shaded and pulses, BEHIND tag (plans and 3D) |
| **Adjacent** | No occupiable cell in between: one walking step (8 directions, no cutting a blocked corner, ladders count), or the same column on the other level | One yellow outline around both cells. Checked for thief–police, thief–diamond, thief–exit, thief–owl |
| **Between** | On the plan, the officer projects inside the segment from the thief to the target and lies within 1.6 cells of it. Target: the diamond before the theft, each exit after it | Dashed line thief → target, crossed out at the officer, IN THE WAY / CUT OFF tag |
| **Among** | At least 5 of the 8 cells around are solid on that level (trees, bushes, rocks; leaves on the canopy) | Dotted 3 × 3 frame around the agent |

## Position (Part 2): behaviours triggered by position

- **(a) Placement → system response**
  - **Cut-off.** While escaping with the diamond, an exit with the officer *between* it and the thief counts as 30 cells farther, so the thief turns for the other exit (logged).
  - **Guarded.** While waiting near the diamond, if the thief can see the officer *between* itself and the diamond, it does not go for it.
- **(b) An occupant with a built-in capability: owls.** Three owls perch on the canopy. When the thief is *adjacent* to an owl, the owl hoots (then rests 30 steps). The officer hears the hoot if the acoustic distance is 16 or less and goes to the owl, like following footsteps. The thief knows about them: it never chooses a waiting spot next to an owl. Owls show on both plans and in 3D; their eyes light up while the thief is next to them; hoots are purple rings.

## Movement: four notions

| Movement | Rule | Indicator |
|---|---|---|
| **Toward / away from** | After each step, the mover's path distance to where the other stood is compared with before | Arrow from the old cell to the new: solid toward, dashed away |
| **Up / down** | The agent's level changed: it used a ladder | ↑ UP / ↓ DOWN tag that rises or sinks and fades; arrow cone in 3D; log line |
| **Around** | Within 8 cells of the diamond, the agent's bearing from it turned through 270° or more | The trail as a thick line with an arrowhead, AROUND tag; fades |
| **Past** | The path distance falls to 4 cells or less and grows again while the officer never saw the thief | Ring at the closest point, » PAST tag; fades |

A **Position + movement** panel lights a chip for every relation that holds (movements stay lit for a few steps) and lists them in words; the **Position + movement** checkbox turns the indicators on and off. The page has a diagram for every relation and behaviour in the section *How position and movement are read*.

Balance with the new rules: the police wins about 79% of rounds (320 rounds on 8 maps), against about 80% without them.

---

*The rest of this README describes the underlying simulation from last week.*

## The scene

- A 36 &times; 26 grid with two levels. **Ground level**: single trees, rows of bushes, 2&times;2 or 3&times;2 rocks, a boundary wall. **Canopy level**, 3 cells up: five platforms joined by narrow bridges, with leaf clumps. Between platforms is open air: you can see through it but not walk on it.
- Five ladders join the levels. Maps come from a fixed seed (`20261022`); **New map** draws a new seed. After generation, every walkable cell that cannot be reached from the main area is removed, so any two walkable cells are connected.
- **No dead ends.** A dead end is a part of the network that hangs on a single connection (a *bridge* of the graph, found with Tarjan's algorithm): you can only leave it the way you came in. Alcoves of up to 3 cells are filled in; larger dead ends get a new opening, carved through bushes, trees or rocks on the ground, or as a new walkway on the canopy. This repeats until no bridge is left, so every walkable cell lies on a loop and every path can be run through (`noDeadEnds` in the config).
- **The diamond** is placed at random each round, on a fairly hidden cell (seen from fewer cells than the median), on the ground or on a platform, at least 10 cells from any exit.
- **Two exits**, in the middle of the west and east sides of the boundary wall (`exitSides` in the config).
- **The tracker.** From the moment the thief picks up the diamond, the police knows where it is at every step and runs for it along the shortest path. The thief gets no such help: it still only knows where the police is when it sees or hears it.
- **The thief wins** by leaving through an exit with the diamond. **The police wins** by catching the thief (same or neighbouring cell), or if the diamond is still in the forest after 500 steps. Seeing the thief does not end the round: it starts a chase.
- The police starts 3 to 10 cells from the diamond; the thief starts at least 22 cells from the diamond and from the police, out of sight. Both act once per step. A new round starts about 2 seconds after the end of one, and the score is kept.

## The four distances

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
index.html, style.css        page and styles (light and dark, phone width)
src/sim/                     simulation core, no DOM, runs in Node
  config.js                  every parameter in one object
  world.js                   two-level map generation and connectivity
  los.js                     3D line of sight, vision cone, acoustic distance
  rays.js                    362 rays per cell, visibility fingerprints
  paths.js                   Dijkstra path distance
  metrics.js                 the four distances and the axiom check
  context.js, ai.js, game.js, hints.js   AI, round loop, explanations
  relations.js               position + movement relations, owls (this week)
src/render/                  three.js scene and 2D floor plans
src/ui/                      page wiring, panels, chart
tests/                       node:test suites and the balance script
```
