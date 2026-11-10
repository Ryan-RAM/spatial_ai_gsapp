# The rule layer and where it comes from

The rule layer is the environment we designed and want to test. The agents do not know it: they find each part through
their vision cones (`src/sim/perception.js`). Every number below is in `src/sim/config.js`.

Sources were checked in November 2026 through web search. The official eCFR and Cornell LII pages could not be opened
from our build machine (blocked network), so regulation text was read through search excerpts of eCFR-derived sites
(Gleim FAR/AIM, faraim.org, customsmobile, govinfo CFR editions) and FAA training material. Where sources disagree we say
so and say which one we used.

## 1. Real rules we built on

| Rule | What it says (summary) | Source |
|---|---|---|
| 14 CFR 93.350 | Hudson River Exclusion: surface up to the floor of the New York Class B, between the banks of the Hudson. East River Exclusion: the same over the East River. | [Cornell LII 93.350](https://www.law.cornell.edu/cfr/text/14/93.350), [Gleim FAR/AIM 93 W](https://www.gleim.com/aviation/faraim/?fullTextNum=93W) |
| Class B floor over the Hudson | A uniform 1,300 ft MSL since the 2009 rule (before: 1,100 or 1,500 ft). | [AOPA, Nov 2009](https://www.aopa.org/news-and-media/all-news/2009/november/17/hudson-river-rules-take-effect-nov-19), [FAASTeam NY SFRA text](https://www.faasafety.gov/files/gslac/courses/content/79/776/NY%20Airspace%20Text%20Only%20R2%20-072010.pdf) |
| Local vs transient | Local operations (sightseeing, news, police) below 1,000 ft MSL; transient operations from 1,000 ft up to, not including, 1,300 ft. | FAASTeam kneeboard, Gleim 93.352 |
| 14 CFR 93.352 | Southbound along the **west** shore, northbound along the **east** shore; self-announce at the mandatory reporting points. | [faraim.org 93.352](https://www.faraim.org/faa/far/cfr/title-14/part-93/section-93.352/title-14-part-93-sec93-352.html) |
| 14 CFR 93.351 | At most 140 kt indicated; lights on; carry the chart; self-announce. | [faraim.org 93.351](https://www.faraim.org/faa/far/cfr/title-14/part-93/section-93.351/index.html) |
| 14 CFR 93.353 | Fixed-wing aircraft may not use the East River Exclusion between Governors Island and the north tip of Roosevelt Island without ATC authorisation. Helicopters are not affected. | customsmobile 93.353, [AviationPros](https://www.aviationpros.com/home/press-release/10394408/faa-excludes-fixed-wing-operations-in-visual-flight-corridor-over-new-yorks-east-river) |
| 14 CFR 91.159 | VFR cruising altitude by magnetic course: 000-179 odd thousands + 500 ft, 180-359 even thousands + 500 ft, only above 3,000 ft AGL. | [Rotate Pilot 91.159](https://rotatepilot.com/regulations/14-cfr-91-159) |
| 14 CFR 91.113 | See and avoid. Head-on: both turn right. Converging, same category: the aircraft on the right has the right of way. Overtaking: pass on the right. Aircraft in distress have the right of way over all. | [Rotate Pilot 91.113](https://rotatepilot.com/regulations/14-cfr-91-113), [eCFR 91.113](https://www.ecfr.gov/current/title-14/chapter-I/subchapter-F/part-91/subpart-B/subject-group-ECFRe4c59b5f5506932/section-91.113) |
| 14 CFR 107.51 | Small drones: at most 400 ft AGL (or within 400 ft of a structure, up to 400 ft above it); at most 87 kt. | [Pilot Institute](https://pilotinstitute.com/drone-altitute/), [Gleim 107.51](https://www.gleim.com/aviation/faraim/index.php?leafNum=107_51) |
| 14 CFR 107.37 | Drones give way to all crewed aircraft. | [open-exam-prep Part 107](https://open-exam-prep.com/study-guides/faa-part-107/chapter1/operating-rules-overview) |
| 14 CFR 107.43 | Drones may not interfere with operations and traffic patterns at any airport or **heliport**. | [Cornell LII 107.43](https://www.law.cornell.edu/cfr/text/14/107.43), [govinfo CFR 2025 Part 107](https://www.govinfo.gov/content/pkg/CFR-2025-title14-vol2/pdf/CFR-2025-title14-vol2-part107.pdf) |
| NYC Admin. Code 10-126(c), NYPD rule (2023) | Drones may take off and land in the city only at sites designated by DOT under an NYPD permit (or in an emergency). | [NYPD rule](https://www.nyc.gov/assets/nypd/downloads/pdf/press_release/NYPD-Rule-Unmanned-Aircraft-Final.pdf), [NYPD news](https://www.nyc.gov/site/nypd/news/p00087/nypd-new-rules-concerning-unmanned-aircraft) |
| 14 CFR 99.7 drone TFRs, Dec 2024 | 30 drone TFRs over New York critical infrastructure, including the "E 13th St. Substation" in Manhattan. | [ABC7](https://abc7ny.com/post/new-york-drones-faa-grant-temporary-flight-restrictions-key-infrastructure-sites-amid-activity/15679106/), [NBC New York](https://nbcnewyork.com/new-york/drone-update-news-faa-ban/6081619) |
| Statue of Liberty, 2017 | Drones restricted up to 400 ft within the lateral boundaries of the Statue of Liberty National Monument (Liberty and Ellis islands), under 99.7. | [NPR](https://www.npr.org/sections/thetwo-way/2017/09/28/554340059/faa-restricts-drones-over-major-u-s-landmarks), [AVweb](https://avweb.com/flight-safety/faa-bans-drones-at-landmarks/) |
| UN General Assembly TFRs | Each September a TFR around the UN (2024: 7 nm core where most general aviation is prohibited); the 2019 advisory made it a No Drone Zone. UNGA-81 is planned for 20-26 September 2026. | [FAA newsroom](https://www.faa.gov/newsroom/new-york-city-flight-restrictions-september-21-29-during-un-general-assembly), [iFlightPlanner 2024](https://www.iflightplanner.com/Blog/FLIGHT-ADVISORY-UN-General-Assembly-September-2228-2024_993.aspx), [AIN 2025](https://www.ainonline.com/aviation-news/business-aviation/2025-09-12/ny-airspace-restrictions-set-un-general-assembly) |
| Heliports | JRB Downtown Manhattan (Pier 6) 40-42-04.369N 074-00-32.502W; 6N5 East 34th St N40°44.55' W73°58.33'; JRA West 30th St 40-45-17.65N 074-00-25.415W. | [AirNav JRB](https://airnav.com/airport/KJRB), [SkyVector 6N5](https://skyvector.com/airport/6N5/East-th-Street-Heliport), [AirNav JRA](https://www.airnav.com/airport/JRA) |
| Magnetic declination | About 13° W in New York in 2025-2026 (WMM2025). | [timeanddate](https://www.timeanddate.com/geography/magnetic-declination.html), [NOAA NCEI WMM2025](https://www.ncei.noaa.gov/node/8576) |

## 2. What we designed from them

### River loop (one way, clockwise round Manhattan)

- **Hudson, northbound, along the east (Manhattan) shore.** This is the real 93.352 rule for northbound traffic.
- **Central Park crossing, eastbound,** roughly along 79th to 86th St, where the park leaves a gap in the towers.
- **East River, southbound, along the Manhattan shore.** No direction is prescribed for the East River in the rules we found.
  We chose southbound so the loop closes and so that, as on the Hudson leg, Manhattan stays on the pilot's right (keep right).
  The East River is a helicopter route anyway: 93.353 keeps fixed-wing aircraft out of it.
- **Battery turn, westbound,** south of the Battery and of JRB, back to the Hudson.
- The lanes span both helicopter bands (500 to 1,300 ft). A lane is perceived as gates every 120 m along its centreline; each
  gate shows its direction. Flying against a known gate is forbidden in planning; flying against the lane at all is counted.
- The real SFRA also has a **southbound lane on the west (New Jersey) shore**. It is in the config but switched off, because
  the point of the project is to test a one-way loop. Switch on `hudson-sb` to compare.

### Altitude bands

| Band | Who | Feet MSL | Reasoning |
|---|---|---|---|
| Transition | drones | 0-150 | Take-off, landing, the delivery drop. |
| Drone eastbound | drones, magnetic course 000-179 | 200 ± 40 | The hemispheric idea of 91.159 (which legally applies only above 3,000 ft AGL) moved down into the Part 107 400 ft ceiling, so opposite directions are 100 ft apart. |
| Drone westbound | drones, magnetic course 180-359 | 300 ± 40 | |
| Buffer | nobody | 400-500 | 107.51 keeps drones below 400 ft; we leave 100 ft clear before the helicopters. |
| Helicopter local | tour flights | 500-999, cruise 800 | SFRA "local" operations are below 1,000 ft; the kneeboard asks for the highest practical altitude below 1,000 ft. |
| Helicopter transient | medical flights | 1,000-1,299, cruise 1,100 | SFRA "transient" operations, 1,000 ft up to the Class B floor. |
| Class B floor | everyone | 1,300 | Hard ceiling: we do not model ATC clearances. |

Helicopters may step 100 ft up or down inside their band to get away from traffic. A drone's course for the band is the
direct course of the current leg (hub to customer, or back), converted to magnetic with the 13° W declination.

### No-fly zones

| Zone | Who | Size | Basis |
|---|---|---|---|
| UN Headquarters | everyone | 330 m, surface-1,300 ft | Scaled-down, permanent stand-in for the recurring UNGA TFR. At its real size (7 nm) it would close the whole site, so we keep only a core around the UN campus. |
| Statue of Liberty National Monument | drones | 900 m round Liberty and Ellis islands, up to 400 ft | The 2017 99.7 restriction. Tour helicopters still circle it, as they do in reality. |
| Con Ed East 13th St substation | drones | 250 m, up to 400 ft | One of the December 2024 99.7 drone TFRs. Position approximated at the East River complex at 14th St. |
| JRB, 6N5 and JRA heliport areas | drones | 400-450 m, up to 500 ft | 107.43 (do not interfere with heliport traffic). The sizes are our choice. |

### Landing sites

- **Heliports**: the three public Manhattan heliports at their FAA positions. The number of pads used at once (JRB 3, 6N5 2,
  JRA 2) is our assumption. Medical flights get the next free pad first.
- **Rooftop drone pads**: picked from the building data (35-170 ft roofs, at least 1,400 m² of roof, 650 m apart, outside all
  no-fly zones), standing in for DOT-designated take-off and landing sites. The first six, spread over Manhattan, are
  delivery hubs. They double as emergency landing sites for drones that know them.
- **Band signs**: posts at the heliports, the non-hub pads, every fourth lane gate and on a 1 km grid over land. They stand in
  for a broadcast of the airspace rules (as a UTM service might send). An agent learns its band only when it sees one.

## 3. Conflicts between sources, and what we chose

1. **East River Exclusion ceiling.** One eCFR-derived source gives "below 1,500 ft MSL" for 93.350(c); another, older edition
   gives "1,100 ft MSL and below". We take the current-edition text (1,500 ft) as the more reliable one. The simulation uses one
   1,300 ft ceiling everywhere (the Hudson Class B floor), so under the 1,500 ft reading 1,300-1,500 ft over the East River simply
   stays unused; under the 1,100 ft reading our medical band (1,000-1,299 ft) over the East River would be inside Class B. This
   is listed as a known simplification.
2. **"1,300 ft".** Search results first attached it to the East River; the FAASTeam text and AOPA show it is the uniform Class B
   floor over the **Hudson** set in 2009. We used it that way.
3. **Statue of Liberty restriction: "up to 400 feet within the lateral boundaries"** was read by some as a distance. The FAA
   wording in the reports is lateral boundaries of the monument plus an altitude of 400 ft, so we model it as a cylinder up to 400 ft.
4. **JRB position.** Wikipedia (40.701116, -74.008801) and the FAA-derived AirNav data (40.701214, -74.009028) differ by about
   20 m; we used the FAA figure.
5. **Medical priority** is not a legal right of way in 91.113 (only aircraft in distress have one). It is our design rule,
   modelled on how a medical flight would ask for and get priority. Write it up as a design choice, not as FAA law.

## 4. Not verified, assumed

- Pads in use at once at each heliport; drone pad capacity (2, hubs 4).
- Bridge tower positions and heights (config `structures`) are approximate values from general knowledge.
- The lane centrelines and the shoreline of the placeholder city were traced by hand (about 100 m accuracy).
- The vertical datum of NYC ground elevations (we assume it matches sea level closely enough for 50 m cells; NAVD88 is the
  city's usual datum but the metadata excerpts we could read did not say).
