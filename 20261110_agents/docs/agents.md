# The agents, and how each assignment item is met

## The two agent types

| | Delivery drone | Helicopter (tour / medical) |
|---|---|---|
| Size, speed | 1.2 m, 12 m/s, climbs 3 m/s, turns almost on the spot | 13 m class; tour 45 m/s (~90 kt), medical 62 m/s (~120 kt); turns 7° / 6° per second, so a turn radius of about 370 / 590 m |
| Vision cone | 70° wide, ±40°, 180 m | 140° wide, ±50°, 1,200 m (towers and bridges seen at 2,400 m) |
| Energy | 260 Wh battery; power = hover 620 W + 0.9 W·(m/s)² + climb work; about 25 min of hover. 10 m/s over streets (about 20 Wh/km), 16 m/s in an express corridor (about 15 Wh/km) | not modelled (time is the criterion) |
| Goal | carry a package from its hub to a customer and come back, again and again | tour: a sightseeing circuit given as dispatch points and back to its base; medical: come in from the edge to a heliport, stay, leave |
| Criterion | least energy (Wh per trip), no forced landing | least time while keeping separation (300 m / 150 ft target, a loss below 150 m / 100 ft is counted) |
| What it is told | its position, heading, and the exact offset to the customer | its position, heading, and the dispatch position of the heliport, which is off by up to 350 m until the crew sees the heliport |
| Rule behaviour | flies only above streets (keep right) or in express corridors it has found; once it has seen a band sign, avenues at 100 ft and cross streets at 150 ft; corridors at their own level; keeps out of known no-fly zones; lands only on pads | once it has seen a band sign: flies its band (tour 800 ft, medical 1,100 ft); prefers known lanes in their direction (planning cost 0.55 vs water 1.0 and land 1.35); never plans against a known lane |
| Avoidance | cannot swerve off its street: keeps 8 m right of the centre line (opposite directions pass 16 m apart), slows behind a drone ahead going its way, crosses other streams 50 ft apart at intersections, drops 10 m for any helicopter it sees (107.37) | 91.113 between helicopters; medical flights keep their course and get the pad first, tours give way to them |
| Congestion | ≥ 4 drones within 120 m (± 30 m height) in its cone: marks the streets they are on as costly for 4 min and re-plans round them; slows down while in the crowd | ≥ 3 helicopters within 900 m (± 60 m): marks the cells, re-plans, steps 100 ft up or down inside its band |
| Landmarks | relative to home (offset dx, dy, dz) and along the trip ("820 m into trip 3"): corridor entries and exits, layer switches, pads, customers, jams | against the nearest visual reference it has seen: a tower, a bridge, an island, the river or the park ("600 m south-west of the Empire State Building") |

## Assignment items

1. **Limited knowledge at the start.** `makeKnowledge` starts empty: no cells, no rules, no pads. A drone knows only its own
   hub; a tour helicopter only its base. Tested in `tests/agents.test.mjs`.
2. **Limited cone of vision.** `src/sim/perception.js` casts rays over the opening angle; a building taller than the eye stops a
   ray, so towers hide what is behind them. Obstacles (buildings), hindrances (crowding, a full heliport, the wrong direction of a
   lane) and affordances (lanes, pads, heliports, band signs, open water, references) are all learned this way.
3. **Recognise and avoid obstacles and other agents.** Known tall cells are blocked in planning (A* on the agent's own grid, with
   unknown cells assumed open, re-planning when the cone shows something new). Other agents are seen in the cone and avoided by
   the right-of-way rules above.
4. **Goal and performance criterion.** See the table. The performance panel and `npm run sim` report them per trip number.
5. **Mapping the environment.** Each agent keeps a 50 m grid of what it has seen: land or water, the height of what stands there,
   known lane cells and no-fly cells, the agents it has met, and its landmarks.
6. **Landmarks.** Types: lane entry, lane exit, altitude band switch, landing site (pads, heliports, forced-landing spots),
   congestion, holding point, no-fly boundary, home and customer. Similar landmarks within 60-500 m are merged and counted.
7. **Using landmarks to go faster.** A drone plans over the corridors it has found and the streets it marked as jammed, and
   diverts to pads it found when the battery runs low. Helicopters plan with the lanes they found, fly straight to a heliport they
   have seen instead of the approximate dispatch position, and remember holding points. The effect is measured per trip number
   (fewer re-plans and violation seconds, shorter trips; see `docs/results.md`).
8. **One agent's spatial knowledge.** View "One agent's map": seen ground, known obstacles (red when too tall for its band), its
   lanes and no-fly zones, its pads and heliports, its references (labels), the agents it met (last seen positions), its landmarks
   and a line from each landmark to what it is remembered against.
9. **Many agents.** 180 drones on six hubs, 12 tour and 6 medical helicopters by default (`population` in the config).
10. **What they share.** View "Everyone together": all paths in 3D (additive, coloured by type), congestion landmarks as 3D
    spheres sized by how many agents were jammed, and ground heat maps: all landmarks, congestion landmarks, true crowding
    (ground truth no agent sees), time over each cell, and **shared knowledge** (how many agents know each cell).
11. **Delivery.** `npm run capture` writes the screenshots and a recording to `media/`; the page has Screenshot and Record buttons.

## Congestion is not scripted

No road, lane or cell is marked as congested in the configuration. Congestion appears when the rules gather agents: drones of one
hub flying the same band in the same direction, helicopters converging on the one-way loop, tours queueing for JRB's pads. An agent
reads it from its cone (count of agents nearby in its band) and turns it into a hindrance and a landmark. The "True crowding" heat
map is computed by the simulation from everyone's real positions and is never shown to any agent, so it is the check that the
perceived congestion landmarks are in the right places.
