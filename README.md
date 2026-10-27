# Misty Forest Chase

**Spatial AI (ARCH6956-1), Columbia GSAPP. Assignment: Distance + Proximity.**

Instructor: [William Martin](https://awmartin.xyz/spatial-computing/course/)

Group: **Ryan Fu, Lu Liu, Yifan Zhao**

A self-running 3D heist in a two-level misty forest. A thief must steal a diamond and get out through an exit; a police officer guards the diamond and chases the thief on sight. Each of four distances drives one sense:

| Sense | Distance | Used for |
|---|---|---|
| Sight | **Euclidean distance** | Can one agent see the other (plus occlusion and a forward vision cone) |
| Hearing | **Acoustic distance** | Can one agent hear the other's footsteps (straight line plus muffling) |
| Walking | **Path distance** | How far an agent really has to walk; the AIs move along it |
| Sense of place | **Perceptual distance** | How alike two positions look, from their *visibility fingerprints* |

Live page: https://ryan-ram.github.io/spatial_ai_gsapp/ (once GitHub Pages is on). Locally, open `index.html` through a web server (see below). The 3D scene starts on its own.

## The scene

- A 36 &times; 26 grid with two levels. **Ground level**: single trees, rows of bushes, 2&times;2 or 3&times;2 rocks, a boundary wall. **Canopy level**, 3 cells up: five platforms joined by narrow bridges, with leaf clumps. Between platforms is open air: you can see through it but not walk on it.
- Five ladders join the levels. Maps come from a fixed seed (`20261022`); **New map** draws a new seed. After generation, every walkable cell that cannot be reached from the main area is removed, so any two walkable cells are connected.
- **The diamond** is placed at random each round, on a fairly hidden cell (seen from fewer cells than the median), on the ground or on a platform, at least 10 cells from any exit.
- **Four exits**, one in the middle of each side of the boundary wall, are fixed for each map.
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
- *Chasing the thief*: on seeing the thief, it runs to where it saw it. In heavy gear it covers 3 cells in 4 steps, a little slower than a running thief. It catches the thief on the same or a neighbouring cell.
- *Scanning around*: at a sound, or where it lost sight of the thief, it turns a full circle, then patrols again.
- *Guarding an exit*: once it knows the diamond is gone (it sees the empty spot, or the thief carrying it), it guards the exit nearest to where it last saw the thief.

**Thief**
- *Sneaking*: heads for a hidden spot within 8 cells of the diamond, one cell every two steps, with soft steps.
- *Waiting for a chance* / *Looking around*: near the diamond, it waits until it has not heard the police for 8 steps, turning its head now and then.
- *Going for the diamond*: runs to it, one cell per step. Close to the time limit, it goes whatever the risk.
- *Escaping with the diamond*: runs for the exit with the biggest head start over the police.
- *Holding breath*: hears the police, but the police is not close. It freezes, makes no sound and turns toward the noise.
- *Fleeing* / *Hiding*: when seen, about to be seen, or hearing the police come closer, it runs to a cell it reaches first, out of the police's sight. Then it lies low before trying again.

## Balance

`node tests/balance.mjs` plays 320 rounds without rendering: 40 rounds on each of 8 maps (seeds 20261022 to 20261029). Only AI behaviour was tuned, plus the soft sneaking steps. Vision range (9), the vision cone (120&deg;, &plusmn;60&deg;), hearing range (12) and the muffling costs were never changed for balance.

| Result | Value |
|---|---|
| Rounds | 320 |
| Police win rate | **51.2%** (164 of 320) |
| Average round length | 176.5 steps |
| Average length of a police win | 169.7 steps |

How the 320 rounds end: the police catches the thief before the theft in 49%, and with the diamond in 3%. The thief escapes after being chased in 25%, and without ever being seen in 24%. No round reaches the 500-step limit: the thief is always on the move.

Win rates vary from map to map (32.5% to 65% per map over 40 rounds). On the default map alone, 200 rounds give a 35.0% police win rate and an average of 156 steps, so the default map leans toward the thief.

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

The tests cover 3D line of sight (clear view on one level, blocked by a tree, hidden by a platform floor, seen through open air from above and from below, beyond 9 cells, target behind the viewer, one-sided sight), the vision cone limits, ray lengths, acoustic muffling (open air, bush and rock, floor slab versus open air, symmetry), path distance (diagonals, corner cutting, detours, ladders), map connectivity, the metric axioms, and the round loop (exits, diamond placement, theft, catches and escapes).

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
src/render/                  three.js scene and 2D floor plans
src/ui/                      page wiring, panels, chart
tests/                       node:test suites and the balance script
```
