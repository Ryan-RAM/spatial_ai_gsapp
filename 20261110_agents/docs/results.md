# What a two-hour run shows

**These numbers come from the placeholder city** (synthetic buildings, see `docs/data.md`). Re-run after downloading the real
data: `npm run sim` (60 min) or `node tests/run_sim.mjs 120 media/summary-real-120min.json`. The full output of this run is
in [`media/summary-placeholder-120min.json`](../media/summary-placeholder-120min.json). Default population: 180 drones on 6
hubs, 12 tour and 6 medical helicopters; seed 20261110.

## Learning shows up as fewer violations and fewer re-plans

| Agent | Trip no. | Trips | Minutes | Wh | Re-plans | Remembered route | Violation s |
|---|---|---|---|---|---|---|---|
| Drone | 1 | 174 | 6.8 | 82.9 | 9.6 | 0% | 127.7 |
| Drone | 2 | 180 | 7.5 | 82.1 | 5.6 | 44% | 45.6 |
| Drone | 3 | 176 | 7.5 | 82.7 | 6.4 | 61% | 33.3 |
| Drone | 4+ | 1,524 | 7.3 | 81.0 | 4.5 | 67% | 9.6 |
| Tour helicopter | 1 | 12 | 12.8 | – | 64.2 | – | 27.3 |
| Tour helicopter | 2 | 12 | 13.2 | – | 36.6 | – | 13.5 |
| Tour helicopter | 4+ | 58 | 12.0 | – | 31.8 | – | 12.8 |
| Medical helicopter | 1 | 6 | 7.0 | – | 23.8 | – | 34.8 |
| Medical helicopter | 4+ | 28 | 8.1 | – | 15.3 | – | 36.4 |

- **Drones** break the rules (mostly flying off their band, because they have not yet seen a band sign) for about two minutes on
  their first trip and for about ten seconds from the fourth trip on. They re-plan half as often and, by then, two orders in three
  fly a remembered breadcrumb route. **Energy and time per trip stay flat** (about 82 Wh, 7 minutes): the first route to a
  customer is already close to the shortest one on a 50 m grid, so remembering it saves planning, not distance.
- **Tour helicopters** halve their re-plans and violation seconds after the first tour, once they have found the lane loop.
- **Medical helicopters do not improve**: they come in from four different edges to three heliports, so each trip covers new
  ground. Their violations are mostly **off-band seconds** (1,541 s of 1,682). A likely cause, not yet isolated: the supertall
  towers reach into or above the 1,000-1,299 ft transient band, and a helicopter climbs over any known roof ahead even if that
  takes it out of its band. If that holds on the real data it is a finding about the band design, not about the agents.

## Where the rules jam

Measured over the same two-hour run (shares within 600 m of a hub or 1.5 km of a heliport):

1. **The drone hubs.** 85% of the true-crowding seconds (ground truth, no agent sees it) and 99.9% of the congestion landmarks the
   agents left are within 600 m of one of the six hubs. Each hub serves 30 drones with four landing spots, so returning drones
   queue on holding rings round the roof while others climb out through them. *The rule problem is hub capacity and the shared
   take-off/landing column, not the cruise bands.* The other 15% of crowding is spread thinly over the city.
2. **Heliport approaches, not the lanes.** Of the 120 helicopter losses of separation, 89 happen on approach to or climb-out from
   JRB (59) and JRA (31), where tours leave and join the loop; 18 happen in cruise and 9 in holding patterns.
3. **Helicopters almost never perceive congestion** (5 congestion landmarks in two hours): 18 helicopters are too few to put three
   in one cone within 900 m. With this population the helicopter rule layer is not saturated; raise `population.tours` to test it.
4. **Not measured yet: what the one-way loop costs.** A flight from the west to the East 34th St heliport has to go round by the
   Battery or the park crossing. Switch on the real SFRA's west-shore southbound lane (`hudson-sb`) and compare medical minutes.

## Other numbers (two hours)

- Drones: 2,054 deliveries, 22 forced landings (battery), 117 diversions to a pad they had found, 3,348 drone-drone losses of
  separation (under 12.5 m and 6 m), 1,350 congestion encounters.
- Helicopters: 94 tours, 46 medical missions, 120 helicopter-helicopter losses of separation (< 150 m and < 100 ft), 4 mixed.
- No-fly seconds: 41 (drones) and 64 (medical), all before the zone was seen.
- Near misses with buildings the agent had not yet seen: about 3,200 for drones (their cone is 180 m and they fly between towers).
