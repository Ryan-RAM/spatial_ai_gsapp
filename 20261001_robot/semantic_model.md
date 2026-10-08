# Semantic Model: Delivery Robot on a Retail Street During a Flood

<!-- ====================================================================
     PASTE THE INSTRUCTOR'S "SYSTEM PROMPT" HERE (step 4 of the assignment)
     ==================================================================== -->

## Overview

This model describes a **retail street** (shops, restaurants, sidewalks, crossings)
where an autonomous **sidewalk delivery robot** carries food orders from restaurants
to customers. A **flash flood** hits the street: water rises unevenly, drains may
overflow, debris appears, and people move to higher ground. The agent's job is to
reason about the space and decide what the robot should do: continue, reroute,
wait, shelter, hand off, or abort the delivery, while keeping the robot, the food,
and people safe.

**Units:** distance in meters (m), water depth in centimeters (cm), speed in m/s,
time in minutes (min), battery in percent (%).

---

## Entities

### RetailStreet
The whole environment.
- ↳ `name`: string (e.g., "Maple Street")
- ↳ `segments`: list of StreetSegment
- ↳ `floodAlertLevel`: `none` | `advisory` | `warning` | `emergency`
- ↳ `timeOfDay`: HH:MM
- ↳ `isOpenToRobots`: boolean (the city can close the street to robots)

### StreetSegment
A walkable/drivable piece of the street, the node-to-node "edge" of the map.
- ↳ `id`: string (e.g., "SEG-03")
- ↳ `type`: `sidewalk` | `crosswalk` | `road` | `plaza` | `alley`
- ↳ `length`: m
- ↳ `width`: m
- ↳ `elevation`: m above street baseline (low spots flood first)
- ↳ `slope`: % (water flows downhill)
- ↳ `surface`: `concrete` | `asphalt` | `brick` | `grate`
- ↳ `waterDepth`: cm (current)
- ↳ `waterFlowSpeed`: m/s (current)
- ↳ `isBlocked`: boolean
- ↳ `pedestrianDensity`: `low` | `medium` | `high`

### Intersection
Where segments meet; the "nodes" of the map.
- ↳ `id`: string (e.g., "INT-B")
- ↳ `connectedSegments`: list of StreetSegment ids
- ↳ `hasTrafficSignal`: boolean
- ↳ `signalWorking`: boolean (power may fail in a flood)
- ↳ `hasCurbRamp`: boolean

### Shop
Any store on the street (clothing, pharmacy, convenience store...).
- ↳ `id`, `name`
- ↳ `category`: `retail` | `pharmacy` | `grocery` | `service`
- ↳ `entranceSegment`: StreetSegment id
- ↳ `entranceElevation`: m (raised entrances stay dry longer)
- ↳ `isOpen`: boolean (the premises are open to the public and staffed, so the shop can hold a handed-off order)
- ↳ `hasAwning`: boolean (can shelter a robot from rain)
- ↳ `acceptsRobotShelter`: boolean

### Restaurant (a kind of Shop)
Where orders originate.
- ↳ all Shop attributes
- ↳ `pickupPoint`: location on a StreetSegment
- ↳ `ordersReady`: list of Order ids
- ↳ `isOperating`: boolean (the kitchen is preparing and releasing delivery orders; may stop during the flood)

> `isOpen` vs `isOperating`: a restaurant can be closed to walk-in guests (`isOpen = false`)
> while its kitchen still releases already-paid orders (`isOperating = true`), or the reverse.
> Pickups depend on `isOperating` (Rule 21); holding a handed-off order depends on `isOpen`.

### DeliveryRobot
The agent's body in the world.
- ↳ `id`: string (e.g., "BOT-7")
- ↳ `position`: StreetSegment id + offset (m)
- ↳ `status`: `idle` | `to_pickup` | `delivering` | `waiting` | `sheltering` | `returning` | `stuck` | `offline`
- ↳ `battery`: % (0–100)
- ↳ `maxSafeWaterDepth`: cm (e.g., 8 cm — above this, water reaches electronics/wheels lose grip)
- ↳ `groundClearance`: cm (e.g., 10 cm)
- ↳ `waterproofRating`: e.g., IP65
- ↳ `speed`: m/s (normal max 1.5, reduced in water)
- ↳ `energyUse`: % per 100 m (e.g., 1.0 on dry ground, 2.0 in water)
- ↳ `cargo`: Order id or `empty`
- ↳ `cargoTemperature`: °C
- ↳ `sensors`: list (`camera`, `lidar`, `ultrasonic`, `waterSensor`, `GPS`, `IMU`)
- ↳ `connectivity`: `good` | `weak` | `lost`

### Order
The package the robot carries.
- ↳ `id`: string (e.g., "ORD-1024")
- ↳ `restaurant`: Restaurant id
- ↳ `customer`: Customer id
- ↳ `items`: list of strings
- ↳ `isPerishable`: boolean
- ↳ `priority`: `normal` | `urgent` | `essential` (e.g., medicine from a pharmacy)
- ↳ `deadline`: HH:MM
- ↳ `status`: `placed` | `ready` | `picked_up` | `in_transit` | `delivered` | `handed_off` | `cancelled` | `returned`

### Customer
The recipient.
- ↳ `id`, `name`
- ↳ `dropoffLocation`: StreetSegment id or Shop id / building entrance
- ↳ `canMeetRobot`: boolean (customer may come to a dry point)
- ↳ `contactable`: boolean

### Pedestrian
People on the street; they have right of way.
- ↳ `id`
- ↳ `position`: StreetSegment id
- ↳ `movingDirection`: toward higher ground / toward shelter / random
- ↳ `isVulnerable`: boolean (child, elderly, wheelchair user)

### Obstacle
Anything blocking or endangering movement.
- ↳ `id`
- ↳ `type`: `debris` | `floating_object` | `fallen_sign` | `parked_vehicle` | `sandbag_barrier` | `open_manhole` | `downed_power_line`
- ↳ `position`: StreetSegment id
- ↳ `isMoving`: boolean (floating objects drift)
- ↳ `isHazardous`: boolean
- ↳ `passable`: boolean

### DrainageInlet
Storm drains and manholes; they control how water rises.
- ↳ `id`
- ↳ `position`: StreetSegment id
- ↳ `capacity`: `normal` | `overflowing` | `clogged`
- ↳ `coverPresent`: boolean (a missing cover is invisible under water and very dangerous)

### FloodEvent
The disaster itself.
- ↳ `severity`: `minor` | `moderate` | `severe`
- ↳ `rainfallRate`: mm/h
- ↳ `waterRiseRate`: cm/min (baseline rate on affected segments)
- ↳ `affectedSegments`: list of StreetSegment ids (segments that are taking on water; others stay at their current depth)
- ↳ `startTime`, `expectedPeakTime`: HH:MM
- ↳ `trend`: `rising` | `stable` | `receding`

### SafeZone
Places the robot can go to wait out the flood.
- ↳ `id`
- ↳ `type`: `charging_station` | `shop_awning` | `raised_plaza` | `parking_garage_upper_level` | `robot_depot`
- ↳ `position`: StreetSegment id
- ↳ `elevation`: m
- ↳ `capacity`: number of robots
- ↳ `occupied`: number of robots
- ↳ `hasCharger`: boolean

### OperatorCenter
The remote human/fleet system supervising the robot.
- ↳ `canTeleoperate`: boolean
- ↳ `messages`: list of alerts/instructions sent to the robot
- ↳ `canNotifyCustomer`: boolean

### EmergencyVehicle
Fire trucks, ambulances, rescue boats.
- ↳ `id`
- ↳ `type`: `fire` | `ambulance` | `police` | `rescue_boat`
- ↳ `position`: StreetSegment id
- ↳ `isActive`: boolean (sirens on)

---

## Relationships

| Subject | Relationship | Object |
|---|---|---|
| RetailStreet | **consists of** | StreetSegment, Intersection |
| StreetSegment | **connects** | Intersection ↔ Intersection |
| StreetSegment | **adjacent to** | StreetSegment |
| Shop / Restaurant | **located on** | StreetSegment |
| DrainageInlet | **located on** | StreetSegment |
| FloodEvent | **affects** | StreetSegment (raises `waterDepth`) |
| FloodEvent | **closes** | Restaurant / Shop (may set `isOpen = false` and/or `isOperating = false`) |
| DrainageInlet (clogged/overflowing) | **worsens flooding on** | StreetSegment (local rise rate ≥ 2 × `waterRiseRate`) |
| StreetSegment (higher `elevation`) | **drains into** | adjacent StreetSegment (lower `elevation`) |
| Obstacle | **blocks** | StreetSegment |
| Obstacle (floating) | **drifts along** | water flow direction |
| DeliveryRobot | **is on** | StreetSegment |
| DeliveryRobot | **carries** | Order |
| DeliveryRobot | **picks up from** | Restaurant |
| DeliveryRobot | **delivers to** | Customer |
| DeliveryRobot | **shelters at** | SafeZone |
| DeliveryRobot | **yields to** | Pedestrian, EmergencyVehicle |
| DeliveryRobot | **reports to / receives commands from** | OperatorCenter |
| Order | **originates at** | Restaurant |
| Order | **is ordered by** | Customer |
| OperatorCenter | **notifies** | Customer |
| Pedestrian | **moves toward** | higher-elevation StreetSegment / SafeZone |
| EmergencyVehicle | **has priority on** | StreetSegment (road, crosswalk) |

---

## Rules (Constraints)

### Water and terrain
1. **Depth limit:** The robot must NOT enter a segment where `waterDepth > robot.maxSafeWaterDepth` (default 8 cm).
2. **Caution band:** If 3 cm ≤ `waterDepth` ≤ `maxSafeWaterDepth`, the robot's speed is capped at 0.5 m/s. Below 3 cm the normal max speed applies.
3. **Flowing water:** The robot must NOT enter a segment with `waterFlowSpeed > 0.5 m/s`, even if shallow (it can be swept away).
4. **Unknown depth = unsafe:** If depth cannot be measured (murky water, sensor failure), treat the segment as impassable.
5. **Hidden hazards:** Any segment containing a DrainageInlet with `coverPresent = false` or `capacity = overflowing` is impassable when `waterDepth > 0` (the robot cannot see an open hole or a suction point under water).
6. **Low spots first:** When the flood `trend` is `rising`, segments with lower `elevation` should be expected to exceed limits sooner; plan routes along higher elevation.
7. **Predictive check:** A route is valid only if, for every segment on it, the depth *predicted for the moment the robot leaves that segment* stays within the limit with a 1 cm safety margin:
   `predictedDepth = currentDepth + localRiseRate × timeUntilExit ≤ maxSafeWaterDepth − 1 cm`
   - `localRiseRate = waterRiseRate` for segments in `affectedSegments`, `0` for segments not in it.
   - `localRiseRate = 2 × waterRiseRate` (at least) on segments with a `clogged` or `overflowing` DrainageInlet.
   - `timeUntilExit` includes waiting/yielding time and the slower caution-band speed (Rule 2) once the predicted depth reaches 3 cm.
8. **Electrical danger:** A segment with a `downed_power_line` obstacle is impassable and must be reported immediately.

### People and priority
9. **Pedestrians first:** The robot must yield to all pedestrians and never block a path people are using to escape the water.
10. **Vulnerable people:** Keep at least 1.5 m from pedestrians where `isVulnerable = true`.
11. **Emergency vehicles:** When an EmergencyVehicle is active nearby, the robot must pull fully out of its path and stop.
12. **Crowding:** Robots must not park or stop to yield on narrow sidewalks (`width < 2 m`) during evacuation; on those segments the robot backs out to the nearest wider spot instead.
13. **Human life > robot > food:** Safety of people always outranks robot safety, and robot safety outranks delivering the order.

### Robot state
14. **Battery reserve:** At every point on its route the robot must keep enough battery to reach the nearest SafeZone with free capacity, plus 15 percentage points; otherwise it must stop delivering and go to a SafeZone.
15. **Connectivity:** If `connectivity = lost` for more than 2 min, the robot must go to the nearest reachable SafeZone and wait.
16. **Stuck:** If the robot has not moved for 3 min while trying to move, `status = stuck` and it must alert the OperatorCenter.
17. **SafeZone capacity:** A robot can only shelter at a SafeZone where `occupied < capacity`.

### Orders
18. **Alert levels:**
    - `advisory`: continue deliveries, reroute around wet segments.
    - `warning`: finish only the current order; accept no new orders; once the cargo is empty, go to the nearest SafeZone and wait.
    - `emergency`: stop all deliveries, go to the nearest SafeZone.
19. **Essential orders:** Orders with `priority = essential` (e.g., medicine) may continue under `warning` if a fully safe route exists.
20. **Perishables:** If a perishable order will miss its deadline by more than 30 min, it should be returned or cancelled rather than delivered late.
21. **Closed pickup:** The robot cannot pick up from a Restaurant where `isOperating = false`.
22. **Handoff location:** An order can be delivered only at a dry point (`waterDepth = 0`, or a raised shop entrance whose `entranceElevation` keeps it above the water) that the customer can reach safely.

---

## Actions (State Changes)

Each action lists **preconditions** → **effects**.

### `move(robot, segment)`
- **Pre:** segment is adjacent; segment passes Rules 1–8; robot not `offline`.
- **Effect:** `robot.position = segment`; `robot.battery` decreases by `energyUse × length / 100` (water rate if `waterDepth > 0`); speed set by Rule 2; if carrying cargo, `order.status = in_transit`.

### `plan_route(robot, destination)`
- **Pre:** a map of segments with current `waterDepth` and `isBlocked`.
- **Effect:** returns the shortest route that satisfies all Rules; prefers higher elevation; returns `none` if no safe route exists.

### `reroute(robot)`
- **Pre:** a segment on the current route becomes unsafe (depth rise, new obstacle, crowd).
- **Effect:** new route via `plan_route`; OperatorCenter and Customer notified of new ETA.

### `sense_water(robot)`
- **Pre:** robot has `waterSensor` or camera/lidar.
- **Effect:** updates `waterDepth` and `waterFlowSpeed` of the current and next segment.

### `pick_up(robot, order)`
- **Pre:** robot at Restaurant `pickupPoint`; `restaurant.isOperating = true`; `order.status = ready`; `robot.cargo = empty`; alert level allows it.
- **Effect:** `robot.cargo = order`; `order.status = picked_up`; `robot.status = delivering`.

### `deliver(robot, order)`
- **Pre:** robot at `customer.dropoffLocation` (or agreed alternative); location dry; customer present.
- **Effect:** `order.status = delivered`; `robot.cargo = empty`; `robot.status = idle` or `returning`.

### `propose_alternative_dropoff(robot, customer, point)`
- **Pre:** original dropoff is flooded; `customer.contactable = true`.
- **Effect:** customer is asked to meet at a nearby dry point (e.g., a raised shop entrance); if accepted, `dropoffLocation = point`.

### `hand_off(robot, order, shop)`
- **Pre:** delivery cannot finish safely; shop `isOpen` and willing to hold the order.
- **Effect:** `order.status = handed_off`; customer notified where to collect it; `robot.cargo = empty`.

### `wait(robot, minutes)`
- **Pre:** robot is at a safe spot (dry, not blocking people).
- **Effect:** `robot.status = waiting`; re-check water after the wait (useful when `trend = receding`).

### `seek_shelter(robot)`
- **Pre:** alert level = `emergency`, OR alert level = `warning` and `robot.cargo = empty`, OR Rule 14/15 triggered, OR no safe route exists.
- **Effect:** robot moves to the nearest reachable SafeZone with free capacity; `robot.status = sheltering`; `safeZone.occupied += 1`.

### `charge(robot)`
- **Pre:** robot at a SafeZone with `hasCharger = true`.
- **Effect:** `robot.battery` increases over time.

### `yield(robot)`
- **Pre:** pedestrian or active EmergencyVehicle nearby.
- **Effect:** robot moves aside to a non-blocking spot and stops until clear.

### `report_hazard(robot, hazard)`
- **Pre:** robot detects an Obstacle, open manhole, clogged or overflowing drain, or downed power line.
- **Effect:** hazard added to shared map; segment marked `isBlocked = true`; OperatorCenter alerted (can forward to city/emergency services).

### `cancel_or_return(robot, order)`
- **Pre:** Rule 18 (`emergency`) or Rule 20 applies.
- **Effect:** `order.status = cancelled` or `returned`; customer notified and refunded by the OperatorCenter.

### `request_teleop(robot)`
- **Pre:** `robot.status = stuck` or the situation is ambiguous; connectivity not `lost`.
- **Effect:** a human operator takes control.

### Environment actions (not controlled by the robot)
- `flood_rise(segment)`: `waterDepth += waterRiseRate × Δt`, faster at low elevation and near clogged drains.
- `flood_recede(segment)`: `waterDepth` decreases; `FloodEvent.trend = receding`.
- `spawn_obstacle(segment)`: debris or floating object appears and may drift downhill.
- `close_shop(shop)`: `isOpen = false` (owners leave).
- `raise_alert(level)`: `RetailStreet.floodAlertLevel` changes.
- `power_outage(intersection)`: `signalWorking = false`.

---

## Example Scenario (for testing the agent)

### Map

```
     SEG-05 alley (280 m, elev 1.1 m)
   ┌───────────────────────────────────────────────────────────────────────────┐
   │                                                                           │
 INT-A ── SEG-01 ── INT-B ── SEG-02 ── INT-C ── SEG-03 ── INT-D ── SEG-04 ── INT-E
 (SZ-2)   60 m               80 m, low          80 m               60 m      (SZ-1)
       Noodle House                                               Bookstore
```

| Segment | Type | Length | Width | Elev. | Depth now | Flow | In `affectedSegments` | Notes |
|---|---|---|---|---|---|---|---|---|
| SEG-01 | sidewalk | 60 m | 3.5 m | 1.2 m | 0 cm | 0 m/s | no | Noodle House pickup 20 m from INT-A |
| SEG-02 | sidewalk | 80 m | 3.0 m | 0.4 m | 6 cm | 0.3 m/s | yes | low spot; drain `DI-1` is `clogged`, cover present |
| SEG-03 | sidewalk | 80 m | 3.0 m | 0.8 m | 2 cm | 0.2 m/s | yes | |
| SEG-04 | sidewalk | 60 m | 3.0 m | 1.0 m | 0 cm | 0 m/s | no | Bookstore 10 m from INT-E, `entranceElevation` 1.25 m |
| SEG-05 | alley | 280 m | 2.5 m | 1.1 m | 1 cm | 0.1 m/s | yes | links INT-A to INT-E around the back |

- **Time:** 18:40. **Alert level:** `warning`. Robots allowed on the street.
- **Flood:** `moderate`, `rising`, `waterRiseRate = 0.5 cm/min`.
- **Robot:** `BOT-7` at the Noodle House pickup point (SEG-01), battery 45%, `maxSafeWaterDepth = 8 cm`,
  normal speed 1.5 m/s, `energyUse` 1.0 %/100 m dry and 2.0 %/100 m wet, connectivity `good`.
- **Order:** `ORD-1024`, hot ramen, perishable, `priority = normal`, deadline 19:05 (25 min), status `picked_up`.
- **Customer:** waiting at the Bookstore on SEG-04; `contactable = true`, `canMeetRobot = true`.
- **SafeZones:** `SZ-1` charging station at INT-E (elev 1.3 m, capacity 4, occupied 2, charger);
  `SZ-2` raised plaza at INT-A (elev 1.3 m, capacity 2, occupied 2, no charger) — **full**.
- **Pedestrians:** about 15 people entering SEG-01 from INT-B and walking toward INT-A (higher ground),
  including one wheelchair user (`isVulnerable = true`). They need about 2 min to pass the robot.

### Expected reasoning

**1. Reject the direct route (SEG-01 → SEG-02 → SEG-03 → SEG-04, 250 m).**
- The robot would drive *against* the evacuating crowd on SEG-01 (Rule 9).
- Rule 5 does **not** apply: `DI-1` is `clogged`, not `overflowing`, and its cover is present.
- Rule 7 does: SEG-02 has a clogged drain, so its local rise rate is 2 × 0.5 = 1.0 cm/min.
  The robot would reach INT-B at about 0.4 min. SEG-02 is already in the caution band, so it would
  cross at 0.5 m/s (80 m takes 2.7 min) and leave at about 3.1 min.
  Predicted depth: 6 + 1.0 × 3.1 ≈ **9.1 cm**. That is above the 7 cm planning limit (8 − 1 margin)
  and above the 8 cm hard limit (Rule 1).
- Even at the baseline 0.5 cm/min, the result would be 7.6 cm > 7 cm, so the route is invalid either way.
- Action: `report_hazard(BOT-7, DI-1 clogged on SEG-02)`, so SEG-02 is marked `isBlocked = true` and the OperatorCenter is alerted.

**2. Plan the alley route (SEG-01 → SEG-05 → SEG-04, 310 m) and check it (Rule 6, Rule 7).**

| t (min) | Event | Depth / check |
|---|---|---|
| 0.0 – 2.0 | `yield`: pull to the building side of SEG-01 (3.5 m wide, so stopping is allowed under Rule 12), stay ≥ 1.5 m from the wheelchair user (Rule 10), wait for the crowd to pass | SEG-01 stays 0 cm |
| 2.0 – 2.2 | follow behind the crowd 20 m to INT-A at 1.5 m/s | 0 cm |
| 2.2 | enter SEG-05 | 1 + 0.5 × 2.2 = 2.1 cm, below 3 cm, so full speed is allowed (Rule 2) |
| 4.0 | SEG-05 reaches 3 cm after 162 m, so `sense_water` confirms it and speed drops to 0.5 m/s (Rule 2) | 3.0 cm |
| 7.9 | leave SEG-05 after the remaining 118 m at 0.5 m/s | 1 + 0.5 × 7.9 ≈ **5.0 cm ≤ 7 cm** ✓, flow 0.1 m/s ≤ 0.5 ✓ (Rule 3) |
| 8.0 | 10 m along SEG-04 to the Bookstore | SEG-04 is not affected, so it stays 0 cm ✓ |

- **Speed cap:** the 0.5 m/s cap applies only to the last 118 m of the alley, once the water reaches 3 cm.
  It does not apply on the first part of the alley (1–3 cm), where the robot can drive at 1.5 m/s.
- **Deadline (Rule 20):** arrival at about 18:48, 17 min before the 19:05 deadline ✓.
- **Battery (Rule 14):** the route costs 0.2% + 5.6% + 0.1% ≈ 5.9%, so the robot arrives with about 39%.
  SZ-2 is full (Rule 17), so the nearest usable SafeZone is SZ-1.
  - At the start: getting to SZ-1 costs about 5.8%, plus the 15-point margin = 20.8% ≤ 45% ✓.
  - At the Bookstore: it costs about 0.1% + 15 = 15.1% ≤ 39% ✓.
- **Alert level (Rule 18):** `warning` allows finishing the current order ✓.

Action: `reroute(BOT-7)` → the OperatorCenter notifies the customer of the new ETA (18:48).

**3. Deliver (Rule 22).** The Bookstore entrance is on a dry segment, and its raised 1.25 m
entrance gives extra margin. The customer meets the robot there: `deliver(BOT-7, ORD-1024)`,
which sets `order.status = delivered` and `robot.cargo = empty`.

**Fallbacks**
- If SEG-04 has started to flood or the customer cannot come out: `propose_alternative_dropoff`
  at the raised Bookstore entrance or at SZ-1.
- If the customer cannot be reached: `hand_off` to the Bookstore if it `isOpen`.
- If SEG-05 is predicted to exceed 7 cm before the exit (for example, the rise rate increases):
  `wait` at INT-A only if it is dry and not blocking people. Otherwise `seek_shelter`.

**4. After delivery.** The alert level is `warning` and the cargo is empty, so the robot accepts no new orders.
It runs `seek_shelter(BOT-7)` → SZ-1 (10 m away; `occupied` 2 → 3), sets `status = sheltering`, and runs `charge(BOT-7)`.
