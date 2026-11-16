# Video 1 — How to use Frostroot: The Ramble (manual)

Brief item: *a video showing how to run the simulation and how to generate new environments.*
Length: **2:40**. Recorded at 1920×1080 in Chrome, page at 100 %, light theme for the panels, sound off (narration recorded separately). Every action below is a real control on the page; nothing is staged.

| # | Time | Picture | Action on screen | Narration |
|---|---|---|---|---|
| 1 | 0:00–0:12 | The page opens; the 3D view of the Ramble in snow, third person behind Survivor 1 | Open the URL; close the "How to read this" dialog | "Frostroot is a simulation of one real night: the blizzard of 23 January 2016, in the Ramble of Central Park. Two people are lost in the woods. Something made of roots is hunting them." |
| 2 | 0:12–0:30 | Same view, the survivor walking, flashlight cone, fog | Point at the HUD: time, visibility, warmth | "Everything you see comes from data: the terrain and 2,427 trees from city LiDAR, the paths from OpenStreetMap, the weather hour by hour from the Central Park station. Fog density is the observed visibility. Warm light means safety." |
| 3 | 0:30–0:45 | Controls row | Click **Pause**, then **30×** to cycle speeds; press **Space** to resume | "Pause and speed are here, or use the keyboard: space to pause, plus and minus for speed, C to change the camera." |
| 4 | 0:45–1:00 | Camera switches | **Camera**: Third person → Overview → First person; **Follow**: Survivor 2 | "Watch from behind a survivor, from above, or through their eyes. Follow either survivor; the creature shows on the map and, when it is near, in the fog." |
| 5 | 1:00–1:15 | The timeline under the view | Click the 23:00 slot | "The timeline is the storm: snowfall per hour, and visibility. Pick when the next round starts: 23:00 is the worst of it." |
| 6 | 1:15–1:35 | The 2D map beside the view | Toggle **What the agent knows**, **Planned vs walked**, **Vision cones**; click a point on the map | "The map shares the same state. Switch layers to see what this survivor knows, the route it plans against the route it walked, and what everyone can see. Click anywhere: the point in world metres, on the path network, and as a person would say it, '40 metres north-east of Azalea Pond'." |
| 7 | 1:35–1:45 | Metrics panel | Let a round finish; the panel updates | "Every round is scored: who escaped, who was caught, who the cold took." |
| 8 | 1:45–2:10 | Design section, manual tab | Click **Make two variations**; both side-by-side maps play; scores fill in; click **Choose A** | "Now design the park. You can plow paths, close them, place lamps, warming shelters and signs, within a budget. Make two variations of the current plan; they play the same night side by side and are scored on 24 rounds. Keep the better one. Repeat." |
| 9 | 2:10–2:25 | Automatic tab | **Start from**: Plan B; **Epochs** 12; **Start**; the curve climbs | "Or let it search: the automatic mode mutates the best plan, scores each child on the same 24 rounds, and keeps it if it is at least as good. Pause or stop at any time; the lineage tree keeps every plan tried." |
| 10 | 2:25–2:35 | Gallery | Click **Load this environment** on "Plan B in the dark" | "The gallery has environments worth a look. Load one to watch it and to start designing from it." |
| 11 | 2:35–2:40 | Weather selector | **Weather**: Tonight (live, NWS) | "And switch the weather to tonight's, live from the same station. Same park, this night." |

Checklist before recording: clear site data (so the intro dialog shows); make sure the network allows `api.weather.gov` for shot 11; leave the page 5 s after load so the first round has started.
