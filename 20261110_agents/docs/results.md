# What a two-hour run shows

**These numbers come from the simulated Manhattan** (simplified, synthetic buildings; see `docs/data.md`). Reproduce with
`node tests/run_sim.mjs 120 media/summary-placeholder-120min.json`. The full output of this run is
in [`media/summary-placeholder-120min.json`](../media/summary-placeholder-120min.json). Default population: 180 drones on 6
hubs, 12 tour and 6 medical helicopters; seed 20261110.

## Learning shows up as fewer violations and fewer re-plans

| Agent | Trip no. | Trips | Minutes | Wh | Re-plans | Remembered route | Violation s |
|---|---|---|---|---|---|---|---|
| Drone | 1 | 175 | 6.7 | 81.6 | 10.3 | 0% | 130.3 |
| Drone | 2 | 173 | 8.7 | 82.7 | 10.2 | 49% | 50.8 |
| Drone | 3 | 172 | 9.0 | 80.9 | 6.6 | 56% | 24.2 |
| Drone | 4+ | 1,246 | 7.4 | 80.2 | 4.5 | 66% | 13.8 |
| Tour helicopter | 1 | 12 | 15.9 | – | 65.8 | – | 27.1 |
| Tour helicopter | 2 | 12 | 13.0 | – | 37.3 | – | 15.2 |
| Tour helicopter | 4+ | 52 | 12.9 | – | 32.3 | – | 12.8 |
| Medical helicopter | 1 | 6 | 6.7 | – | 19.8 | – | 37.4 |
| Medical helicopter | 4+ | 27 | 7.8 | – | 15.8 | – | 35.4 |

- **Drones** break the rules (mostly flying off their band, because they have not yet seen a band sign) for about two minutes on
  their first trip and for about 14 seconds from the fourth trip on. They re-plan less than half as often and, by then, two orders
  in three fly a remembered breadcrumb route. **Energy and time per trip stay flat** (about 81 Wh, 7-9 minutes): the first route
  to a customer is already close to the shortest one on a 50 m grid, so remembering it saves planning, not distance.
- **Tour helicopters** halve their re-plans and violation seconds after the first tour, once they have found the lane loop, and
  the second tour is about 3 minutes shorter.
- **Medical helicopters do not improve**: they come in from four different edges to three heliports, so each trip covers new
  ground. Their violations are mostly **off-band seconds** (1,492 s of 1,569). A likely cause, not yet isolated: the supertall
  towers reach into or above the 1,000-1,299 ft transient band, and a helicopter climbs over any known roof ahead even if that
  takes it out of its band. If that holds on the real data it is a finding about the band design, not about the agents.

## Where the rules jam

Measured over the same two-hour run (shares within 600 m of a hub or 1.5 km of a heliport):

1. **The drone hubs.** 86% of the true-crowding seconds (ground truth, no agent sees it) and 99.9% of the drones' congestion
   landmarks are within 600 m of one of the six hubs; one hub on the Hudson waterfront at Battery Park City alone has 49% of the
   crowding. Each hub serves 30 drones with four landing spots, so returning drones queue on holding rings round the roof while
   others climb out through them. *The rule problem is hub capacity and the shared take-off/landing column, not the cruise
   bands.* The other 13% of crowding is spread thinly over the city.
2. **Heliport approaches and holds, not the lanes.** Of the 149 helicopter losses of separation, 93 happen on approach to or
   climb-out from JRB (59), JRA (28) and 6N5 (6), 33 in holding patterns while a heliport is full, and 23 in cruise.
3. **Helicopters perceive little congestion.** Their congestion landmarks (343 counts in two hours) are few next to the drones'
   (about 19,600) and are away from the heliports: 18 helicopters rarely put three in one cone within 900 m. With this population the
   helicopter rule layer is not saturated; raise `population.tours` to test it.
4. **Not measured yet: what the one-way loop costs.** A flight from the west to the East 34th St heliport has to go round by the
   Battery or the park crossing. Switch on the real SFRA's west-shore southbound lane (`hudson-sb`) and compare medical minutes.

## Other numbers (two hours)

- Drones: 1,766 deliveries, 28 forced landings (battery), 233 diversions to a pad they had found, 3,734 drone-drone losses of
  separation (under 12.5 m and 6 m), 1,976 congestion encounters.
- Helicopters: 88 tours, 45 medical missions, 149 helicopter-helicopter losses of separation (< 150 m and < 100 ft), 1 mixed.
- No-fly seconds: 303 (drones) and 9 (medical), all before the zone was seen.
- Near misses with buildings the agent had not yet seen: about 4,100 for drones (their cone is 180 m and they fly between towers).
  On contact a drone climbs away, learns that building and re-plans round it.
