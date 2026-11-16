# Video 2 — Generating an environment through a series of simulations (demo)

Brief item: *a video demonstrating how a new environment is generated through a series of simulations.*
Length: **2:50**. One continuous lineage, recorded in one session so the lineage tree on screen is the one narrated. Same setup as the manual video.

| # | Time | Picture | Action on screen | Narration |
|---|---|---|---|---|
| 1 | 0:00–0:15 | 3D view, overview camera, empty plan, 17:00 | Load the page; **Camera**: Overview | "The question: how should the Ramble be prepared for a blizzard night, when you cannot see far and something is out there? We start from the park as it was, with no interventions." |
| 2 | 0:15–0:30 | Metrics panel and design status: the empty plan scored | Point at F = −0.19, escaped 0 % | "Scored on 24 rounds — six start times, two places where people start, two seeds — nobody escapes. A third are caught, a third freeze, the rest are still lost when the round ends." |
| 3 | 0:30–0:55 | Manual tab, generation 1 | **Make two variations**; side-by-side plays; scores appear | "Generation one: two random changes. Each child is the parent plus one mutation: plow a stretch, add a lamp, close a path. Both play the same round with the same random numbers, so the difference is the plan." |
| 4 | 0:55–1:10 | Choose the better; lineage grows | **Choose** the higher F | "We keep the better one. The lineage tree records it, with a thumbnail of the plan." |
| 5 | 1:10–1:30 | Generations 2 and 3 | Repeat twice | "Single changes barely move the score: one plowed segment does not reach an exit. This is the flat landscape the automatic mode has to cross." |
| 6 | 1:30–1:45 | **Start from**: Plan B | Select the preset; it is scored | "So we jump: Plan B plows a whole route from Azalea Pond to the nearest exit. A quarter now escape — but the creature catches more, because it learns the route." |
| 7 | 1:45–2:20 | Automatic tab, 30 epochs, the curve | **Epochs** 30, **Start**; speed up in editing; point at kept (dots) vs dropped | "Thirty epochs of a (1+1) evolution strategy, each child scored in parallel Web Workers on the same 24 rounds. The fitness only moves when a child is at least as good. Escaped, caught and cold are drawn underneath, so you can see what it trades." |
| 8 | 2:20–2:35 | Best plan watched in 3D | **Watch this plan**; third-person camera on a survivor walking the plowed route | "The result keeps the plowed route, drops a lamp and the sign, adds a warming shelter and closes three paths. Fewer people are seen, fewer freeze." |
| 9 | 2:35–2:45 | Gallery: "Plan B in the dark" and "The park the creature would build" | Scroll through the two cards | "Every intervention has two sides. Lamps help people see — and help the creature see them. Scored for the creature instead, the same search builds a well-signed, well-lit route: everything that tells people where to go." |
| 10 | 2:45–2:50 | Share | **Share** → link copied | "Every plan has a link. This one is ours." |

Numbers in the narration come from `data/gallery.json` (evolved runs, seed 20260123); if the live run on camera differs, read the numbers on screen instead.
