# Semantic Model: Frostroot — The Ramble

**Spatial AI (ARCH6956-1), Columbia GSAPP, Fall 2026. Final project. Version 1.0.**
Group: Ryan Fu, Lu Liu, Yifan Zhao. Instructor: William Martin.

> **v1.0 (final).** This is the model as built in `20261203_final/`. Every number in it that is also a parameter of the simulation is checked against `src/sim/config.js` by `npm run model:check` (§18). Choices made while building are recorded in `DECISIONS.md` (D-nnn); §19 lists what changed from the draft v0.1. Numbers marked *default* are tunable starting values, not claims about the real world. Weather values are from the Central Park station (KNYC) as downloaded and baked (`data/baked/storm-2016-01.json`).

---

## 1. Concept

On the night of the record blizzard of January 2016, something made of roots wakes up in the Ramble, the deliberately maze-like woodland in the middle of Central Park. Survivors caught in the woods must get out to Fifth Avenue, toward Lenox Hill Hospital on East 77th Street, before the creature finds them or the cold does.

The place is real: paths, trees, rocks, water and terrain come from measured data. The night is real: snowfall, wind, visibility and temperature replay the hourly record of the storm, measured at the weather station on Vista Rock at the north edge of the Ramble. Only the creature is invented.

The user is a **designer of the park on a storm night**. They change what a park can actually change (which paths are plowed or closed, where lamps, warming shelters and signs go) and watch how those choices change who gets out. The simulation evolves these interventions, by hand (choose your own adventure) or automatically (epochs).

This builds directly on our earlier weeks: the four distances (*Misty Forest Chase*), the position and movement relations (*Night Run*), and the partial-knowledge agents with landmarks (*Frostroot: Agents*).

---

## 2. Units and conventions

| Quantity | Unit | Note |
|---|---|---|
| Length | metre (m) | grid cell = **3 m** (D-001) |
| Elevation | m, NAVD88 | from the 2017 NYC LiDAR DEM |
| Snow depth | cm | per cell |
| Time | storm time, local (America/New_York) | 1 tick = **2 s** of storm time *default* |
| Speed | m/s | |
| Wind | from-direction in degrees, speed in m/s | the record gives knots; 1 kt = 0.514 m/s |
| Visibility | m | the record gives statute miles; 1 mi = 1609 m |
| Temperature | °C internally | the record gives °F |
| Warmth | 0–100 | survivor body heat, a game variable |

Angles: 0° = north, clockwise. "East" in the story means Fifth Avenue.

---

## 3. The place

### 3.1 Study area

The Ramble plus the strip east of it to Fifth Avenue: bounded by the 79th Street Transverse to the north, the Lake to the south and west, and Fifth Avenue to the east. In frame W the bounding box is x −270 … 460 m, y −540 … 105 m: 730 m × 645 m, **244 × 215 = 52,460 cells** at 3 m; cells outside the park are masked (D-014).

Real features the model uses (confirmed against the data in M1):

- **Paths**: the Ramble's winding footpaths, rustic bridges, East Drive, the paths toward Fifth Avenue.
- **Water**: the Lake, the Gill (the stream), Azalea Pond. Impassable.
- **Rock outcrops**: Vista Rock and smaller outcrops. Solid, high.
- **Trees**: individual trees with position, height and crown radius.
- **Structures**: Belvedere Castle on Vista Rock, the Rustic Shelter, the Ramble Arch, bridges.
- **Exits**: the three park entrances on Fifth Avenue where the footpaths leave the park in OSM, named by street: **E76, E79S, E79N** (D-015).

### 3.2 How a cell gets its contents

Each cell takes, from the data:

- `z` ground elevation (DEM) and `slope`.
- `cover`: `path_paved` | `path_dirt` | `lawn` | `woodland_floor` | `thicket` | `rock` | `water` | `structure`.
- `canopy`: 0–1 (share of the cell under tree crowns).
- `canopyEvergreen`: 0–1 (evergreen crowns hold snow and block wind).
- `solids`: vertical intervals that block sight and movement (trunks, rocks, walls), as in our earlier `los.js`.
- `openness`: 0–1, how exposed the cell is to the sky and wind (from canopy and terrain).

The real geometry is **fixed**. Only the intervention layer (§11) changes between generated environments. That keeps every environment honest to the place, and lets us precompute the expensive things (visibility fingerprints, line-of-sight tables) once, offline.

---

## 4. Time and weather (the real night)

The environment is **dynamic** (snow accumulates, visibility and wind change every hour) and **non-deterministic** in agent behaviour (seeded random choices). The weather itself is a deterministic replay of the record.

### 4.1 The storm, as recorded at KNYC (summary)

| Local time | What the record shows |
|---|---|
| Fri 22 Jan, ~22:50 | light snow begins; visibility falls from 10 mi to 3 mi |
| Sat 23 Jan, 01:00–04:00 | snow; visibility 0.5 mi; wind from the NE (50–60°), 10–14 kt |
| Sat 23 Jan, 04:50–17:50 | snow and heavy snow with freezing fog; visibility **0.25 mi (≈400 m) for about 13 hours**; wind from the NE, 13–20 kt, gusts up to 37 kt (09:51); hourly precipitation up to 0.19 in liquid |
| Sat 23 Jan, 18:50–20:50 | still heavy at times; wind turns to the N |
| Sat 23 Jan, 21:50–02:50 | snow tapers off; visibility recovers to 2, then 5, then 10 mi |
| Temperature through the storm | −3 to −6 °C (22–29 °F) |

Total: about 2.3 in of liquid precipitation in the hourly record, against the official storm total of **27.5 in (70 cm) of snow**, the largest on record for the city.

### 4.2 Weather → simulation

Hourly values are interpolated linearly to each tick.

- **Snowfall**: hourly liquid precipitation × snow-to-liquid ratio `SLR`. `SLR` is calibrated so that the storm total matches 27.5 in (**11.85 : 1** from the hourly record; D-019). Hourly gauge readings in heavy snow tend to under-catch; the calibration absorbs this.
- **Snow depth per cell**: `depth(c, t) = S(t) × drift(c) × (1 − 0.6 × canopyEvergreen(c))`, where `S(t)` is the cumulative snowfall and `drift(c)` is 0.5–2.0 from openness and wind direction (lee sides of rocks and path edges collect more). Plowed path cells are reset to 0–5 cm by the plowing rule (Rule S3).
- **Visibility factor** `vf(t) = clamp(0.35 + 0.65 × log(vis/400 m) / log(40), 0.35, 1)`: 0.35 at 0.25 mi, 1 at 10 mi.
- **Wind**: direction and speed drive sound carry (§6.2), track filling (Rule T2) and exposure (Rule E1).
- **Night**: the evaluation window is **Sat 23 Jan 17:00 → Sun 24 Jan 05:00** (after sunset). It contains the heaviest hours, the turn of the wind, and the clearing (D-005).

---

## 5. Location: frames of reference

Every occupant (agents, trees, rocks, lamps, shelters, signs, tracks, exits, named places) has a location in each of the three shared frames. Agents also use a fourth, private frame for perception and memory.

| Frame | Coordinates | Origin / basis | Used for |
|---|---|---|---|
| **W — World (metric)** | `(x, y, z)` in m, plus grid cell `(i, j)` | local east-north-up frame with origin at the KNYC station on Vista Rock; `z` from the DEM | geometry, sight, sound, rendering, data import |
| **P — Path network (topological)** | `(edgeId, s)`: metres along a path edge; or `nodeId` at a junction; off-path occupants: nearest edge + signed lateral offset `(edgeId, s, offset)` | the OSM footpath graph | walking, plowing and closing paths, directions such as "two junctions past the bridge" |
| **N — Named place (relative)** | `(placeId, bearing, distance)` | nearest named place: Belvedere Castle, Azalea Pond, Rustic Shelter, Ramble Arch, Bow Bridge, the Gill, East Drive, exits | the survivor's prior knowledge, signs, what people would say ("40 m NE of Azalea Pond") |
| **E — Egocentric (private)** | `(bearing relative to heading, distance)` | the agent's own body and facing | vision cones, "behind", hearing direction |

An agent's **landmarks** (§7.6) are stored in a fifth, private chain: each relative to the previous landmark, as in *Frostroot: Agents* ("D3: 6 E, 4 S of C1"). This is spatial memory, not a shared frame.

Conversion: W ↔ P by snapping to the nearest path edge; W ↔ N by nearest named place within 150 m (else "in the woods, toward X"); W ↔ E from the agent's position and heading. All conversions live in one module (`frames.js`) and are unit-tested.

---

## 6. Distance: four notions, each with its own metric

| | Distance | Formula (summary) | Drives | Axioms |
|---|---|---|---|---|
| 1 | **Euclidean, 3D** `d_E` | straight line between eye points, real terrain `z` | sight | metric |
| 2 | **Acoustic** `d_A(a→b)` | `(d_E + Σ m_k + m_snow) × (1 − w × cos θ)` | hearing | not symmetric, no triangle inequality |
| 3 | **Travel time** `d_T(a→b)` | shortest-time walk on the agent's own walk graph | movement, planning | not symmetric (uphill ≠ downhill); a quasimetric |
| 4 | **Perceptual** `d_V` | difference of visibility fingerprints (362 rays) | recognising places, getting lost | pseudometric |

### 6.1 Euclidean (sight)
As in our earlier weeks, now over real terrain: an agent sees a target if `d_E ≤ sightRange × vf(t)`, the target is inside the forward cone, and the 3D segment between the eye points passes through no solid. Lamps extend the survivor's sight and also make anyone standing in their light visible from farther away (Rule P3).

### 6.2 Acoustic (hearing), now with wind
`m_k` are the muffling costs of the solids crossed: +4 m per trunk, +3 m per evergreen crown, +6 m per metre of wall, building or ground (a hill or rock) between (D-023). `m_snow = 0.5 × snowRate(cm/h) × d_E / 10`: falling snow absorbs sound. The wind term: `θ` is the angle between the direction the wind blows **toward** and the vector a→b; `w = 0.3 × min(windSpeed / 10 m/s, 1)`. Sound carries farther downwind.

So `d_A(a→b) ≠ d_A(b→a)` when the wind blows: in a NE wind, the creature to the NE of a survivor hears the survivor less well than the survivor hears it. Our axiom checker (from *Misty Forest Chase*) will report the symmetry violations alongside the existing triangle-inequality ones. Gusts mask sound: the hearing threshold drops to `H × max(0.4, 1 − 0.02 × gust_kt)`.

### 6.3 Travel time (walking)
Dijkstra/A* over the agent's walk graph. The time to cross a cell is `length / (v0 × f_cover × f_snow × f_slope)`, with `v0` = 1.3 m/s for a walking survivor (running doubles it, M3) and 1.4 m/s for the creature (D-023):

- `f_slope`: Tobler's hiking function, normalised to 1 on flat ground. Asymmetric: going down a gentle slope is fastest.
- `f_snow = 1 / (1 + depth_cm / 25)` for the survivor (knee-deep snow ≈ ¼ speed); `(…)^0.3` for the creature, which moves through snow as roots.
- `f_cover`: paved path 1.0, dirt path 0.9, lawn 0.8, woodland floor 0.6; thicket 0 for survivors (they cannot enter it, M2) and 1.0 for the creature; rock, water and structures impassable.

Each agent kind has **its own** walk graph and its own `d_T`. Two cells can be near for the creature (straight through a thicket) and far for a survivor (around it).

### 6.4 Perceptual (visibility fingerprint)
Unchanged from earlier weeks, computed once offline on the real geometry. In the Ramble, many places look alike from the inside (that is the designers' intent), so `d_V` is small between distant cells: this is the mechanism of getting lost, and it is what the survivor's place recognition uses (Rule K3).

---

## 7. Entities

### 7.1 World
- `bbox`, `cellSize`, `cells[]`
- `pathGraph`: nodes (junctions, exits, bridge ends) and edges (path segments)
- `namedPlaces[]`
- `storm`: StormClock
- `interventions`: InterventionPlan (§11)

### 7.2 Cell
- `i, j`, `x, y, z`, `slope`, `cover`, `canopy`, `canopyEvergreen`, `openness`, `solids`
- `snowDepth` (cm, dynamic), `isPlowed` (dynamic), `lightLevel` (from lamps)
- `occupant`: agent id or none (one agent per cell)

### 7.3 Static occupants (from data)
- **Tree**: `position (W)`, `height`, `crownRadius`, `evergreen`. Trunk = solid; crown = canopy.
- **Rock**: `footprint`, `top z`. Solid.
- **Water**: `footprint`. Impassable, does not block sight.
- **Structure**: castle, shelter, arch, bridges; solid or walkable by part.
- **NamedPlace**: `id`, `name`, `position (W)`. Visible from afar if tall (the castle).
- **Exit**: `id`, `position (W, P)`, on Fifth Avenue side.

### 7.4 Intervention occupants (from the generated plan)
- **PlowedSegment**: path edge kept clear: snow depth held at ≤ 5 cm.
- **ClosedSegment**: fenced path edge: impassable to survivors, passable to the creature.
- **Lamp**: `position (P)`, `radius` 12 m *default*. Lights cells.
- **WarmingShelter**: `position (P, at a junction)`, capacity 2.
- **Sign**: `position (P)`, points to the nearest exit.

### 7.5 Dynamic occupants
- **Track**: footprint left by an agent: `cell`, `t`, `agentKind`, `heading`, `readability` 0–1 (Rule T2).
- **Sound event**: `origin`, `t`, `loudness`, `kind` (step, run, cry, creak).

### 7.6 Agents

Common attributes: `id`, `kind`, `position (W, P, N)`, `heading`, `speed`, `state`, `knowledge` (KnowledgeMap), `landmarks[]`, `goal`, `metrics`.

**Creature** (1 per night *default*; 2 on hard)
- Senses: sight cone 100°, 30 m × `vf` *default*; hearing threshold `d_A ≤ 45 m`; reads tracks it can see.
- Moves through thickets; slowed by plowed paths (`× 0.7`) and avoids lit cells (light-averse: lit cells cost ×3 in its plans).
- States: `waking` → `mapping` → `patrolling` | `investigating` | `tracking` | `chasing` | `searching` | `ambushing`.
- Memory persists across the rounds of one night.

**Survivor** (2 per round *default*, start together; can split)
- Senses: flashlight cone 110°, 20 m × `vf` *default*; hearing `d_A ≤ 40 m`; sees tracks, lamps, signs, named places.
- Prior knowledge: "the way out is east"; a coarse mental map of named places with approximate bearings (as a visitor would have).
- Heading drift: without a fix, its sense of east drifts (random walk on heading). Fixes: a sign, a recognised named place, or the glow of the city to the east when standing in the open with visibility ≥ 1 mi.
- Warmth 0–100; a round starts with 55–85, seeded per survivor (they have been out in the storm already; D-029), and falls by Rule E1. At 0 the survivor collapses: the round fails for it ("taken by the cold").
- States: `exploring` | `heading_out` | `hiding` | `fleeing` | `sheltering` | `following_sign` | `escaped` | `caught` | `collapsed`.

### 7.7 KnowledgeMap (per agent)
- `seen[cell]`: unknown / seen-at-t (with what was there).
- `frontier[]`: seen cells next to unknown ones.
- `believedPosition`: for survivors with drift, the believed position in its own map can differ from the true one (errors grow until a fix).
- `threatMemory`: last seen / heard positions of the other kind, with time.

### 7.8 Landmark
- `id`, `type`: `dead_end` | `junction` | `clearing` | `bridge` | `named_place` | `lamp` | `shelter` | `sign` | `exit` | `heard` | `sighting` | `catch`
- `relTo` (previous landmark id), `offset` (Δeast, Δnorth in cells), `t`, `confidence` 0–1 (decays for `heard`/`sighting`).

### 7.9 Round, Night, Evaluation
- **Round**: one group of survivors from spawn to escape/catch/collapse/timeout. 900 ticks (30 min of storm time) *default*.
- **Night**: the creature's mapping phase, then a fixed list of rounds at set start times across the window.
- **EvaluationSuite**: the fixed list of (start time, spawn point, seed) used to score an environment (§11.4).

---

## 8. Relationships

| Subject | Relationship | Object |
|---|---|---|
| World | consists of | Cell, PathGraph, NamedPlace, Exit |
| Cell | contains | Tree, Rock, Water, Structure, Track, Agent (≤ 1) |
| PathSegment | connects | Junction ↔ Junction |
| PathSegment | is on | Cells |
| Lamp, Sign, Shelter | is placed on | PathSegment / Junction |
| StormClock | sets | snowfall, wind, visibility, temperature at time t |
| Snowfall | raises | Cell.snowDepth (not on plowed cells) |
| Wind | drifts snow onto | lee / open Cells; fills Tracks |
| Agent | occupies | Cell |
| Agent | leaves | Track, Sound event |
| Agent | perceives | Cells, Agents, Tracks, Lamps, Signs, NamedPlaces (within its senses) |
| Agent | records | Landmark (in its own chain) |
| Agent | plans on | its own KnowledgeMap |
| Creature | hunts | Survivor |
| Survivor | flees / hides from | Creature |
| Survivor | heads to | Exit |
| Survivor | warms at | WarmingShelter |
| Lamp | lights | Cells within radius |
| InterventionPlan | defines | PlowedSegment, ClosedSegment, Lamp, Shelter, Sign |
| Variant | is a mutation of | Variant (parent) |

---

## 9. Rules

### Perception (P)
- **P1. Sight**: see §6.1. Survivors see 2× farther in lit cells; anyone *standing* in a lit cell can be seen from 1.5× farther.
- **P2. Hearing**: a sound is heard if `d_A(source→listener) ≤ threshold`. The listener learns the direction and a rough distance (±30%).
- **P3. Tracks**: an agent sees tracks in cells it can see. The creature reads a track's heading and age; survivors only notice that something passed.
- **P4. Partial observability**: no agent ever reads the true map. Plans use only the KnowledgeMap.

### Movement and space (M)
- **M1.** One agent per cell. An agent waiting for a blocked cell on a 1-cell-wide passage (a narrow bridge, a gap between rocks) waits up to 3 s, then replans.
- **M2.** Survivors cannot enter thicket, rock, water or closed segments. The creature cannot enter rock, water or structures.
- **M3.** Running doubles speed and step loudness; walking is quiet (+18 m added to `d_A`).

### Snow and tracks (S, T)
- **S1.** Snow depth follows §4.2, every tick.
- **S2.** Snow above 40 cm counts as a hindrance cell for survivors (also louder steps: +5 m loudness).
- **S3.** Plowed segments hold ≤ 5 cm.
- **T1.** Every step leaves a Track with readability 1.
- **T2.** Readability falls as new snow fills it: `readability = 1 − fill / 3 cm`, where `fill` is the snow since the step × (1 + 6 × openness × windFactor) (constants recalibrated to the behaviour of §15, D-024). Tracks under evergreen canopy and on rock last longest; tracks in the open in a strong wind vanish fastest.

### Exposure (E)
- **E1.** Survivor warmth falls each second by `k × max(0, (10 °C − T_wc) / 10 °C) × (0.3 + 0.7 × openness)`, where `T_wc` is the wind chill (NWS formula from temperature and wind speed) and `openness` is the cell's exposure. Canopy and rocks shelter. `k = 0.02973` per second: full exposure at the storm's worst wind chill (−12.4 °C, 20:51) empties 100 in 25 min (D-025).
- **E2.** In a warming shelter, warmth rises by 1 per second. The creature can still enter a shelter.

### Catching and ending (C)
- **C1.** The creature catches a survivor on the same or a neighbouring cell when it is not blocked by a solid.
- **C2.** A survivor escapes by reaching an exit cell.
- **C3.** A round ends when every survivor has escaped, been caught or collapsed, or after 900 ticks (timeout counts as "lost in the storm").

### Interventions (I)
- **I1.** Budget: total plowed length ≤ 1,200 m, lamps ≤ 12, shelters ≤ 2, signs ≤ 6 *defaults*; each has a cost, and the plan's total cost is reported.
- **I2.** At least one survivor-passable route from every spawn to an exit must exist (checked on the true map).
- **I3.** Interventions only go where they could go in the real park: lamps, signs and plowing on paths; shelters at junctions; closures on path segments.

---

## 10. Actions

### Agent actions (preconditions → effects)
- `scan()`: always → updates KnowledgeMap from the vision cone; records tracks seen.
- `turn(Δθ)`: → heading changes; scanning around in place is a sequence of turns.
- `move(cell)`: neighbour cell passable for this kind, free (M1) → position changes; Track and Sound left; warmth updated.
- `plan(goal)`: → path on own KnowledgeMap (§12).
- `mark_landmark(type)`: a landmark condition is met → Landmark appended to own chain.
- `listen()`: every tick → sound events within threshold become threatMemory entries.
- `hide()` (survivor): in a cell out of the creature's last known sight lines → stays still and quiet.
- `shelter()` (survivor): at a WarmingShelter → warmth rises (E2).
- `read_sign()` (survivor): sign in sight → heading fix + bearing to exit.
- `call_out()` (survivor): another survivor within 30 m → share last threat position (loud: 60 m sound).
- `follow_tracks()` (creature): readable track seen → plan along the track's heading.
- `ambush()` (creature): lost a survivor but knows it is heading east → wait between it and the nearest exit, as in *Night Run*.

### Environment actions
- `tick_weather(t)`: interpolate the record → snowfall, wind, visibility, temperature.
- `accumulate_snow()`, `fill_tracks()`, `light_cells()`.

### Generator actions
- `mutate(plan) → plan'`: one mutation operator (§11.3), respecting I1–I3.
- `evaluate(plan) → score`: run the EvaluationSuite headless.
- `select(variant)`: the user (manual) or the score (automated) keeps a variant.

---

## 11. Goals, performance, and environment generation

### 11.1 Goals and metrics (each goal type has at least one measurable metric)

| Agent | Goal | Metrics |
|---|---|---|
| Creature, phase 1 | map the woods | coverage (% of reachable cells seen), new cells seen per tick |
| Creature, phase 2 | catch survivors | catch rate, time to catch, distance walked per catch |
| Survivor | reach an exit | escape (yes/no), time to escape, path efficiency (`d_T` of the shortest true route ÷ time actually taken) |
| Survivor | stay warm | lowest warmth reached, collapse (yes/no), minutes exposed |
| Survivor | stay unseen | times seen, time spent within 15 m of the creature |

### 11.2 Aggregate performance of an environment
For a plan `π` run on the EvaluationSuite:

- `escapeRate`, `catchRate`, `collapseRate`, `meanEscapeTime`, `meanPathEfficiency`, `cost(π)`.
- **Fitness from the survivors' side** *default*: `F = escapeRate − 0.5 × collapseRate − 0.2 × meanEscapeTime/30 min − λ_cost × cost(π)/budget`.
- **From the creature's side** (the user can flip perspective): `F' = catchRate + 0.2 × (1 − meanTimeToCatch/30 min)`.

### 11.3 The intervention plan (what is generated)
The genome is the intervention layer over the fixed real place:

- `plowed`: set of path edges (within the plowing budget)
- `closed`: set of path edges
- `lamps`: positions on paths
- `shelters`: junctions
- `signs`: positions on paths, each pointing to its nearest exit

Mutation operators (one per mutation, picked at random): plow / unplow an edge; **plow a route** (extend the plowing 2–5 edges along the shortest path toward the nearest exit, D-034); close / reopen an edge; move a lamp one edge along the path; add / remove a lamp; move a shelter to a neighbouring junction; add / move / remove a sign. A mutation that breaks I1–I3 is redrawn. Presets (Plan B of §15, a lamp corridor, a route from the Stone Arch) give starting points off the flat region around the empty plan.

Interventions have **two sides**: a lamp lets survivors see but makes them visible; a plowed path is fast and quiet for survivors but still holds tracks; a closure keeps survivors out of a dead end but funnels them. This is what makes generated environments differ in interesting ways.

### 11.4 Fair comparison
Every variant is scored on the **same EvaluationSuite**: 6 start times (17:00, 19:00, 21:00, 23:00, 01:00, 03:00) × 2 spawn zones × 2 seeds = 24 rounds *default*, with the same random seeds (common random numbers). The 24 rounds are grouped into 4 **nights** (spawn zone × seed); in each night the creature maps the woods once at dusk (from 16:30, 900 ticks), re-run for each variant (it maps that variant), and keeps its memory across the night's 6 rounds. Differences in score then come from the environment, not from luck.

### 11.5 Manual mode: choose your own adventure
1. Start from the parent plan (empty plan, or a preset).
2. Generate two children by mutation. Run both **side by side**, live, on the same start time and seed.
3. The user picks one. It becomes the parent; repeat.
4. A lineage tree shows the path of choices, with each node's score.

### 11.6 Automated mode: epochs
A (1+1) evolution strategy, matching the brief one-for-one:

1. Generate one environment (mutate the current best).
2. Evaluate the aggregate performance of its agents on the EvaluationSuite (headless, in a Web Worker).
3. Keep it if it scores at least as well as the current best; otherwise discard it.
4. Repeat for the number of **epochs** the user sets. Epochs = iterations = environments generated and evaluated.

Display: fitness curve per epoch, the current best plan on the map, and the lineage. λ = 2–4 children per epoch is offered as an advanced option (a (1+λ) strategy). Each environment's 24 rounds run in parallel in a pool of Web Workers.

---

## 12. Planning

- **Survivor**: A* on its KnowledgeMap toward its best guess of the exit, with unknown cells costed optimistically to the east and pessimistically to the west (generalising the `eastBias` of *Frostroot: Agents*). Plans avoid cells near the last known creature position (cost grows as `1 / distance`, fading with the age of the memory) and never enter dead ends it has marked. Plans also look ahead in time: if warmth would hit 0 before the planned exit, re-plan via a known shelter.
- **Creature**: on a sound, plan the shortest `d_T` route on its own map to the source. On a readable track, follow its heading. When it loses the trail, predict the survivor's likely route east on its own map and either search the remembered dead ends within 30 m or **ambush** at a choke point between the last sighting and the nearest exit.
- **Both**: plans are recomputed when knowledge changes (new cells seen, a sound, a blocked cell) at most every 5 ticks, to keep runs fast enough for epochs.

---

## 13. Secondary functions (the brief asks for at least one; we do both)

1. **Real-world historic data**: the hourly record of the January 2016 blizzard at KNYC drives snowfall, wind, visibility and temperature. Served by a small **MCP server** (`frostroot-data`) with tools:
   - `weather.series(station, start, end)` → hourly observations (from the Iowa Environmental Mesonet ASOS archive)
   - `terrain.tile(bbox, res)` → DEM and land cover
   - `trees.in(bbox)` → individual trees with height and crown
   - `paths.in(bbox)` → the OSM footpath graph

   A build script calls the server and bakes JSON into the site, so the deployed page works on static hosting. **Tonight mode** (real-time data, D-035): the page pulls the last 30 observations at KNYC from api.weather.gov and replays them instead of 2016 (snow at 10 : 1, from 0 cm); geometry unchanged; on any failure it stays with 2016 and says why.
2. **A real place in 3D + time**: real terrain (`z`), real trees and rocks as 3D solids that block sight and sound, real paths, and a time-varying snow surface.

---

## 14. How each requirement is met (and the diagram for it)

| Requirement | In this model | Diagram for the deck | Reuse |
|---|---|---|---|
| Baseline from a semantic model | this file → `world.js`, `storm.js` | the base Ramble at 17:00, empty plan | maze/world code replaced by data import |
| ≥ 2 notions of location | W, P, N frames (+ E, landmark chain), §5 | one occupant shown in all frames | landmark chain from *Agents* |
| ≥ 2 notions of distance | `d_E`, `d_A` (with wind), `d_T`, `d_V`, §6 | four distances between two agents, plus the axiom table | `los.js`, `rays.js`, `paths.js`, `metrics.js` |
| ≥ 2 kinds of agents, limited knowledge, scanning | creature, survivor, §7.6–7.7, P4 | each agent's own map vs. the true map | `knowledge.js` |
| Spatial memory: landmarks used later | §7.8, §12 | creature's landmark chain; a dead end avoided | *Agents* |
| Goals with measurable metrics | §11.1 | metric panel | *Agents* |
| Planning with limited knowledge | §12 | planned route vs. route taken | `knowledge.js`, ambush from *Night Run* |
| Physical environment, partial observability | §3, P1–P4 | vision cones shrinking with visibility | |
| Multiple agents consuming space | one per cell, groups of survivors, M1 | two survivors at a narrow bridge | |
| Dynamic or static; deterministic or not | dynamic, seeded non-deterministic, §4 | snow depth at 17:00 vs. 23:00 | |
| Obstacles | trees, rocks, water, structures, closures | obstacle layer | |
| Hindrances and affordances | deep snow, slopes, exposure, thickets / plowed paths, lamps, shelters, signs, canopy | the two-sided table of §11.3 | |
| Manual mode | §11.5 | side-by-side and lineage | |
| Automated mode with epochs | §11.6 | fitness curve and best plan | balance scripts → Web Worker evaluator |
| Secondary function | §13, both options | data pipeline: KNYC → MCP → sim | |

---

## 15. Example scenario (for testing)

**Round start: Sat 23 Jan 2016, 19:00.** Conditions interpolated from the 18:51 and 19:51 observations: about −3 to −4 °C, wind from the N (350–20°) at 7–10 kt with gusts to 21–22 kt, visibility 0.25–0.5 mi with heavy snow and freezing fog, about 2 cm/h of new snow. Cumulative snowfall so far: 2.19 in of liquid × 11.85 ≈ 26 in (66 cm). Wind chill about −9 to −10 °C.

- **Survivors** S1 and S2 spawn together on the path just west of Azalea Pond. Prior: exit to the east. `vf` ≈ 0.35–0.5, so each sees 7–10 m with its flashlight.
- **Creature** has mapped the Ramble at dusk. It patrols near the Ramble Arch, south of the survivors.
- **Plan A (empty)** vs **Plan B** (plowed loop from Azalea Pond toward East Drive, 3 lamps along it, 1 sign at the junction east of the pond).

Expected behaviour to check:

1. In Plan A, the survivors' steps in 66 cm of snow are slow (`f_snow` ≈ 0.27) and loud on drifts. Wind from the N carries their sound south, toward the creature: `d_A(survivors→creature) < d_A(creature→survivors)`. The creature hears them first and investigates.
2. Their tracks in the open fill within about 20–30 minutes; under evergreens they stay readable much longer. The creature follows the tracks it finds.
3. In Plan B, the survivors read the sign, get a heading fix, and move along the plowed loop at ~3× the speed. The lamps let them see the creature earlier, but also let the creature see them from farther away. Which effect wins is what the evaluation measures.
4. If a survivor's warmth would reach 0 before the exit, its planner diverts to a shelter if it knows one; with no shelter in the plan, the collapse rate rises.

---

## 16. Data sources

| Data | Source | Notes |
|---|---|---|
| Hourly weather, Central Park (KNYC) | via the `frostroot-data` MCP server from the Iowa Environmental Mesonet ASOS archive, `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py` | query used for §4: `station=NYC&data=all&sts=2016-01-22T12:00Z&ets=2016-01-24T12:00Z&tz=America/New_York&format=onlycomma&report_type=3` |
| Storm total 27.5 in | NOAA review of the January 2016 blizzard | official city record |
| Station location | the NWS has recorded temperature and wind at Vista Rock / Belvedere Castle since 1919 (Central Park Conservancy) | origin of frame W |
| Terrain | 2017 NYC LiDAR bare-earth DEM (NOAA Digital Coast, Cloud-Optimised GeoTIFF, read by range for the Ramble only) | D-012, D-016; land cover from OSM (D-015) |
| Individual trees (position, height, crown) | extracted by us from the 2017 NYC LiDAR point cloud (NOAA, COPC): 2,427 trees in the study area; evergreen from OSM leaf tags | D-017, D-018. The six-million-trees dataset planned in v0.1 was not available; the NYC Parks Tree Map does not cover Central Park |
| Paths, water, structures, named places | OpenStreetMap | ODbL licence: attribution required |
| Ramble character | Central Park Conservancy: twisting paths designed for wandering and hard to navigate | the reason this place was chosen |

---

## 17. Decisions (open in v0.1)

1. Cell size: **3 m** (D-001); the benchmarks met their targets, so no fallback to 4 m was needed.
2. Bounding box: the box of §3.1 (D-014); exits: E76, E79S, E79N (D-015).
3. **2 survivors** per round, **1 creature** per night (2 on hard) (D-003).
4. Default perspective: the **survivors'** side (F); the creature's side (F′) is a switch (D-004).
5. Night window: 23 Jan 17:00 → 24 Jan 05:00; other storms left for later (D-005).
6. Tonight mode: **in scope**, weather only (D-006, D-035).
7. 3D style: the Frostroot look on the real geometry, made darker and harsher after the style frame; third person by default (D-007, D-031); the creature's roots move in a vertex shader, no physics (D-032).

---

## 18. Parameters (checked against `config.js`)

The table between the markers is written by `node tools/check-model.mjs --write` and verified by `npm run model:check`, which also checks the numbers quoted in the text above.

<!-- params:begin -->
| Parameter (`config.js`) | Value | Meaning | Where |
|---|---|---|---|
| `cellSize` | 3 | grid cell, m | §2 |
| `studyArea.bboxM` | {"minX":-270,"minY":-540,"maxX":460,"maxY":105} | study area in frame W, m | §3.1 |
| `exits` | E76 / E79S / E79N | exits | §3.1 |
| `tickSeconds` | 2 | storm seconds per tick | §2 |
| `window.start` | 2016-01-23T17:00 | evaluation window start (local) | §4.2 |
| `window.end` | 2016-01-24T05:00 | evaluation window end (local) | §4.2 |
| `stormTotalSnowIn` | 27.5 | official storm total, in | §4.1 |
| `survivorsPerRound` | 2 | survivors per round | §7.6 |
| `creaturesPerNight` | 1 | creatures per night | §7.6 |
| `creature.sightRange` | 30 | creature sight, m × vf | §7.6 |
| `creature.coneDeg` | 100 | creature cone, ° | §7.6 |
| `creature.hearing` | 45 | creature hearing threshold, m of d_A | §7.6 |
| `creature.plowedSpeedFactor` | 0.7 | creature on plowed paths, × speed | §7.6 |
| `creature.litCostFactor` | 3 | creature cost of lit cells, × | §7.6 |
| `creature.speed` | 1.4 | creature v0, m/s | §6.3 |
| `creature.mappingTicks` | 900 | dusk mapping, ticks | §11.4 |
| `creature.mappingStart` | 2016-01-23T16:30 | dusk mapping start | §11.4 |
| `creature.snowExponent` | 0.3 | creature f_snow exponent | §6.3 |
| `survivor.sightRange` | 20 | survivor flashlight, m × vf | §7.6 |
| `survivor.coneDeg` | 110 | survivor cone, ° | §7.6 |
| `survivor.hearing` | 40 | survivor hearing threshold, m of d_A | §7.6 |
| `survivor.startWarmth` | 55 / 85 | starting warmth | §7.6 |
| `survivor.warmthK` | 0.02973 | E1 k, per s | §9 E1 |
| `survivor.shelterGain` | 1 | E2 warmth per s in a shelter | §9 E2 |
| `survivor.speed` | 1.3 | survivor v0, m/s | §6.3 |
| `coverSpeed.survivor` | 0 / 1 / 0.9 / 0.8 / 0.6 / 0 / 0 / 0 / 0 | f_cover survivor (outside, paved, dirt, lawn, woodland, thicket, rock, water, structure) | §6.3 |
| `coverSpeed.creature` | 0 / 1 / 0.9 / 0.8 / 0.6 / 1 / 0 / 0 / 0 | f_cover creature (same order) | §6.3 |
| `snowHalfDepthCm` | 25 | f_snow half depth, cm | §6.3 |
| `muffling.trunk` | 4 | muffling per trunk, m | §6.2 |
| `muffling.crown` | 3 | muffling per evergreen crown, m | §6.2 |
| `muffling.structurePerM` | 6 | muffling per m of wall, m | §6.2 |
| `muffling.groundPerM` | 6 | muffling per m of ground, m | §6.2 |
| `muffling.snowFactor` | 0.5 | m_snow factor | §6.2 |
| `muffling.windMax` | 0.3 | wind term w max | §6.2 |
| `walkQuietM` | 18 | walking quieter by, m | §9 M3 |
| `hindranceCm` | 40 | hindrance depth, cm | §9 S2 |
| `plowedCm` | 5 | plowed depth, cm | §9 S3 |
| `trackFillCm` | 3 | T2 fill depth, cm | §9 T2 |
| `trackWindCoef` | 6 | T2 wind coefficient | §9 T2 |
| `gustMask` | 0.02 | gust masking per kt | §6.2 |
| `roundTicks` | 900 | ticks per round | §7.9 |
| `suite.startTimes` | 17:00 / 19:00 / 21:00 / 23:00 / 01:00 / 03:00 | suite start times | §11.4 |
| `suite.spawnZones` | 2 | suite spawn zones | §11.4 |
| `suite.seeds` | 2 | suite seeds | §11.4 |
| `replanEveryTicks` | 5 | replanning at most every, ticks | §12 |
| `perspective` | survivors | default fitness perspective | §11.2 |
| `lambdaCost` | 0.1 | λ_cost | §11.2 |
| `budget.plowedM` | 1200 | budget: plowed m | §9 I1 |
| `budget.lamps` | 12 | budget: lamps | §9 I1 |
| `budget.shelters` | 2 | budget: shelters | §9 I1 |
| `budget.signs` | 6 | budget: signs | §9 I1 |
| `cost` | {"plowPerM":1,"lamp":150,"shelter":1000,"sign":50} | costs | §9 I1 |
| `lampRadius` | 12 | lamp radius, m | §7.4 |
| `shelterCapacity` | 2 | shelter capacity | §7.4 |
| `epochs` | 50 | default epochs | §11.6 |
| `childrenPerEpoch` | 1 | default children per epoch | §11.6 |
<!-- params:end -->

---

## 19. Changes from v0.1

- Study area measured: 52,460 cells, not about 35,000 (§3.1).
- `f_cover` of thickets for survivors: impassable (0), not 0.25, so rule M2 and §6.3 agree (D-023).
- Track filling constants: 3 cm and ×6 wind, not 10 cm and ×2, to give the behaviour §15 asks for (D-024).
- Warmth: `k` fixed (D-025); survivors start at 55–85, not 100 (D-029).
- Absolute speeds and muffling costs added (D-023); SLR 11.85 : 1 (D-019).
- Trees from our own LiDAR extraction (D-017); terrain from the NOAA COG (D-012); OSM through the official API (D-011).
- Mutation: the "plow a route" operator and presets (D-034); (1+λ) option; parallel evaluation in Web Workers.
- Evaluation: the 24 rounds grouped into 4 nights with one dusk mapping each (§11.4, D-029).
- Survivors recognise places (Rule K3) with the eye-level ring of the fingerprint (D-030); vision uses a baked occlusion horizon (D-028).
- Tonight mode (D-035).
