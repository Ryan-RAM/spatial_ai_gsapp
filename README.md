# Misty Forest Chase

**Spatial AI (ARCH6956-1), Columbia GSAPP. Assignment: Distance + Proximity.**

Instructor: [William Martin](https://awmartin.xyz/spatial-computing/course/)

Group: **Ryan Fu, Lu Liu, Yifan Zhao**

A self-running 3D chase in a two-level misty forest. A police officer patrols; a thief hides. Each of three distances drives one sense:

| Sense | Distance | Used for |
|---|---|---|
| Sight | **Euclidean distance** | Can one agent see the other (plus occlusion and a forward vision cone) |
| Hearing | **Path distance** | Can one agent hear the other's footsteps |
| Sense of place | **Perceptual distance** | How alike two positions look, from their *visibility fingerprints* |

Live page: https://ryan-ram.github.io/spatial_ai_gsapp/ (once GitHub Pages is on). Locally, open `index.html` through a web server (see below). The 3D scene starts on its own.

## The scene

- A 36 &times; 26 grid with two levels. **Ground level**: single trees, rows of bushes, 2&times;2 or 3&times;2 rocks, a boundary wall. **Canopy level**, 3 cells up: five platforms joined by narrow bridges, with leaf clumps. Between platforms is open air: you can see through it but not walk on it.
- Five ladders join the levels. Maps come from a fixed seed (`20261022`); **New map** draws a new seed. After generation, every walkable cell that cannot be reached from the main area is removed, so any two walkable cells are connected.
- The police wins as soon as it sees the thief. The thief wins after 500 steps unseen. Both act once per step. A new round starts about 2 seconds after the end of one, and the score is kept.

## The three distances

Positions are cell centres. An agent's eye point is 1.5 cells above the floor it stands on, and the canopy floor is 3 cells above the ground.

### 1. Euclidean distance (sight)

d<sub>E</sub>(a, b) = &radic;((x<sub>a</sub> &minus; x<sub>b</sub>)&sup2; + (y<sub>a</sub> &minus; y<sub>b</sub>)&sup2; + (z<sub>a</sub> &minus; z<sub>b</sub>)&sup2;)

An agent sees the other when:

- d<sub>E</sub> &le; 9 (the fog);
- the other is inside its forward cone: 120&deg; wide and &plusmn;60&deg; up and down. Vision only looks forward;
- the 3D segment between the eyes does not pass through a solid volume (tree, bush, rock, leaf clump, platform floor slab). Open air blocks nothing, so you can look down from a platform edge or up through a gap.

The line of sight is a 2D grid DDA (Amanatides & Woo) over the columns of the map. In each column it tests the exact height range the segment passes through against that column's solid intervals (`src/sim/los.js`).

### 2. Path distance (hearing, the bonus)

d<sub>P</sub>(a, b) = the shortest walk from a to b. Step costs: 1 straight, &radic;2 diagonal, 3 for a ladder. A diagonal step may not cut the corner of an obstacle. It is computed with Dijkstra's algorithm over the walkable cells of both levels (`src/sim/paths.js`).

Whenever an agent moves, the other hears it if d<sub>P</sub> &le; 12, and knows where the sound came from. Hearing works in every direction.

### 3. Perceptual distance (visibility fingerprint)

From every walkable cell, 362 rays are cast in 3D: 72 directions (every 5&deg;) on five elevation rings (&minus;60&deg;, &minus;30&deg;, 0&deg;, +30&deg;, +60&deg;), plus straight up and straight down. Each ray stops at the first solid volume or at 9 cells. The vector of the 362 ray lengths is the cell's **visibility fingerprint**. It covers 360&deg; and does not depend on facing.

d<sub>V</sub>(a, b) = &radic;(&Sigma;<sub>i</sub> (r<sub>i</sub>(a) &minus; r<sub>i</sub>(b))&sup2;)

The fog cuts every ray at 9, so open places have similar fingerprints, while places inside the thicket all differ. The same cached rays draw the faint all-around view and the bright vision cone in the 3D view (`src/sim/rays.js`).

## How it answers the assignment

1. **At least two metrics, between two positions and between two agents.** There are three. The distance panel shows all three between the two agents at every step. The metric check computes them between thousands of pairs of positions.
2. **Visualize and compare.** In 3D, the solid line is the Euclidean distance, the dashed line is the shortest path, and the rays show the fingerprint and the vision cone. A chart plots all three over the round, with the 9-cell vision limit and the 12-cell hearing limit.
3. **Far in one metric, near in another.** An automatic hint names these moments as they happen:
   - stacked on two levels: near in a straight line, but a floor in between and a long walk via a ladder;
   - a hedge in between: near in a straight line, a long way round, and footsteps do not carry;
   - in view but far to walk: a clear line from a platform edge, but a long walk;
   - back to back: near, but each one outside the other's cone;
   - far apart, but in places that look alike: beyond the fog, but similar fingerprints.
4. **Bonus: distance around obstacles.** The path distance is the shortest walk around solid cells and up and down ladders. It decides hearing.

## Metric axiom check (default map, 677 walkable cells)

Non-negativity, symmetry and the triangle inequality are tested on 4,000 random triples per distance. Identity of indiscernibles (d = 0 only for the same cell) is tested on every cell.

| Distance | Non-negativity | Symmetry | Triangle inequality | Identity of indiscernibles | Verdict |
|---|---|---|---|---|---|
| Euclidean | 0 violations | 0 violations | 0 violations | holds | metric |
| Path | 0 violations | 0 violations | 0 violations | holds | metric |
| Perceptual | 0 violations | 0 violations | 0 violations | holds on this map, not in general | pseudometric |

The perceptual distance compares what two places look like, not where they are. Two different cells with identical surroundings have d<sub>V</sub> = 0; the test suite builds such a case (two identical rooms). On the default map no two cells match exactly. The closest pair of different cells differs by 10.0, while a typical pair differs by about 69. A distance where different places can be at 0 is a **pseudometric**. In space, this is what getting lost means: two places that look the same from the inside can be far apart. The page recomputes this table for every new map.

## The AIs

**Police**
- *Patrolling*: walks to random targets in the more open half of the map, glancing to the side every other step.
- *Investigating a sound*: turns toward the thief's footsteps and walks the shortest path to where they came from.
- *Scanning around*: at that spot, with nobody in sight, turns a full circle, then patrols again.

**Thief**
- *Sneaking / Hiding*: picks a spot among the 25% of cells with the smallest view. It prefers spots that few cells can see and that are far from where it last noticed the police. It sneaks there one cell every two steps and waits.
- *Looking around*: while hiding, turns its head now and then.
- *Holding breath*: hears the police, but the police is not close. It freezes, makes no sound and turns toward the noise.
- *Fleeing*: the police is in plain view, or its own footsteps probably gave it away. It runs to a cell it reaches before the police, far from the police and out of its sight, with a first step that breaks the line of sight.

## Balance

`node tests/balance.mjs` plays 320 rounds without rendering: 40 rounds on each of 8 maps (seeds 20261022 to 20261029). Only AI behaviour was tuned. Vision range (9), the vision cone (120&deg;, &plusmn;60&deg;) and hearing range (12) were never changed.

| Result | Value |
|---|---|
| Rounds | 320 |
| Police win rate | **49.1%** (157 of 320) |
| Average round length | 351.9 steps |
| Average length of a police win | 198.2 steps |

Win rates vary from map to map (20% to 62.5% per map over 40 rounds). On the default map alone, 200 rounds give a 38.5% police win rate and an average of 370 steps, so the default map leans slightly toward the thief.

## Run it locally

The page is plain HTML and ES modules with no build step. three.js 0.160.0 loads from jsDelivr. Browsers do not load modules from `file://`, so serve the folder:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Tests and the balance run use Node 18 or newer, with no dependencies:

```sh
npm test               # node --test tests/*.test.mjs
npm run balance        # node tests/balance.mjs [rounds] [maps]
```

The tests cover 3D line of sight (clear view on one level, blocked by a tree, hidden by a platform floor, seen through open air from above and from below, beyond 9 cells, target behind the viewer, one-sided sight), the vision cone limits, ray lengths, path distance (diagonals, corner cutting, detours, ladders), map connectivity, the metric axioms, and the round loop.

## Files

```
index.html, style.css        page and styles (light and dark, phone width)
src/sim/                     simulation core, no DOM, runs in Node
  config.js                  every parameter in one object
  world.js                   two-level map generation and connectivity
  los.js                     3D line of sight and vision cone
  rays.js                    362 rays per cell, visibility fingerprints
  paths.js                   Dijkstra path distance
  metrics.js                 the three distances and the axiom check
  context.js, ai.js, game.js, hints.js   AI, round loop, explanations
src/render/                  three.js scene and 2D floor plans
src/ui/                      page wiring, panels, chart
tests/                       node:test suites and the balance script
```
