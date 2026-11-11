# What a two-hour run shows

**These numbers come from the simulated Manhattan** (simplified, synthetic buildings; see `docs/data.md`). Reproduce with
`node tests/run_sim.mjs 120 media/summary-placeholder-120min.json`. The full output of this run is
in [`media/summary-placeholder-120min.json`](../media/summary-placeholder-120min.json). Default population: 180 drones on 6
hubs, 12 tour and 6 medical helicopters; seed 20261110.

## Learning shows up as fewer violations and fewer re-plans

| Agent | Trip no. | Trips | Minutes | Wh | Re-plans | Used express | Violation s |
|---|---|---|---|---|---|---|---|
| Drone | 1 | 173 | 10.5 | 127.4 | 7.1 | 43% | 57.0 |
| Drone | 2 | 177 | 10.4 | 128.2 | 3.8 | 45% | 18.7 |
| Drone | 3 | 177 | 10.4 | 129.0 | 3.6 | 48% | 10.8 |
| Drone | 4+ | 1,121 | 9.5 | 118.9 | 3.2 | 43% | 4.9 |
| Tour helicopter | 1 | 12 | 11.8 | – | 64.6 | – | 27.2 |
| Tour helicopter | 2 | 12 | 12.6 | – | 35.4 | – | 18.4 |
| Tour helicopter | 4+ | 62 | 12.0 | – | 31.9 | – | 17.0 |
| Medical helicopter | 1 | 5 | 7.4 | – | 28.0 | – | 35.2 |
| Medical helicopter | 4+ | 23 | 8.4 | – | 17.3 | – | 34.6 |

- **Drones** fly only above the streets or in the express corridors. Their violations (flying off their layer before they have
  seen a layer sign) fall from 57 s on the first trip to 5 s from the fourth trip on, and re-plans halve. Each drone knows 8 of the
  14 corridors on average after two hours, and about 45% of trips use at least one. Trips from the fourth on use about 7% less
  energy and 10% less time (119 vs 127 Wh, 9.5 vs 10.5 minutes). The gain is probably small because a drone already finds the
  corridors near its own hub on its first trip (43% of first trips use one).
- **Tour helicopters** halve their re-plans after the first tour, once they have found the lane loop; violation seconds fall by
  about a third.
- **Medical helicopters do not improve**: they come in from four different edges to three heliports, so each trip covers new
  ground. Their violations are mostly **off-band seconds** (1,255 s of 1,350). A likely cause, not yet isolated: the supertall
  towers reach into or above the 1,000-1,299 ft transient band, and a helicopter climbs over any known roof ahead even if that
  takes it out of its band.

## Where the rules jam

Measured over the same two-hour run (shares within 600 m of a hub or 1.5 km of a heliport):

1. **The drone hubs.** 92% of the true-crowding seconds (ground truth, no agent sees it) and 99% of the drones' congestion
   landmarks are within 600 m of one of the six hubs, where the streets, the express corridors and the take-off column meet.
   The Kips Bay and Lower East Side hubs are the busiest. Most of the 3,801 drone-drone losses of separation are on the short
   links between a hub and its first street corner, where both directions meet. *The rule problem is the hub: one take-off
   column and two street links per hub.* The street grid itself stays fluid. On the heat map (log scale) weaker crowding also
   shows along the busiest express corridors and along the Hudson leg of the helicopter loop.
2. **Heliport approaches, not the lanes.** Of the 143 helicopter losses of separation, 125 happen on approach to or climb-out
   from JRB (75), JRA (45) and 6N5 (5); 18 in cruise or holding.
3. **Helicopters perceive no congestion** in this run: 18 helicopters rarely put three in one cone within 900 m. The helicopter
   rule layer is not saturated at this population; raise `population.tours` to test it.
4. **Not measured yet: what the one-way loop costs.** A flight from the west to the East 34th St heliport has to go round by the
   Battery or the park crossing. Switch on the real SFRA's west-shore southbound lane (`hudson-sb`) and compare medical minutes.

## Other numbers (two hours)

- Drones: 1,648 deliveries, 9 forced landings (battery), 88 diversions to a pad they had found, 3,801 drone-drone losses of
  separation (under 12.5 m and 6 m), 1,569 congestion encounters.
- Helicopters: 98 tours, 38 medical missions, 143 helicopter-helicopter losses of separation (< 150 m and < 100 ft), none mixed.
- No-fly seconds: 0 (drones) and 42 (medical), all before the zone was seen.
