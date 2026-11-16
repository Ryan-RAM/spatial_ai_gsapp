# Accessibility audit (ROADMAP M9.2)

Checked on 2026-11-16 in Chromium at 1280 × 900 and 375 × 800, light and dark themes, with a script that walks every visible text node (WCAG AA contrast against its actual background), tabs through the whole page, and lists unnamed controls, unlabeled canvases and images without alt text. Re-run: `tools/` scripts in the session notes; the checks are the ones below.

| Check | Found | Done |
|---|---|---|
| Text contrast ≥ 4.5 : 1 (3 : 1 for large text), both themes | "How it works" link: 1.99 : 1 in dark (browser default link blue), 3.86 : 1 in light (accent orange) | links get their own token: `#8a4510` on light, the warm orange on dark; 0 failures after |
| Every focusable control has a name | all 42 named | — |
| Repeated identical button names | 9 × "Load this environment" | each has an `aria-label` with the environment's name |
| Canvases have a text alternative | lineage thumbnails unlabeled; the off-screen gallery canvas | thumbnails are `aria-hidden` (the node's text says the plan and score); the helper canvas is `aria-hidden` |
| 3D view | a canvas | `aria-label`, and `aria-describedby` the HUD (clock, weather, each survivor's state, warmth and place in words, the creature's state), which is live text |
| Full keyboard use | the map could only be clicked | the map takes focus; arrow keys move the picked point 6 m (Shift: 30 m) from the followed survivor and the W / P / N / E readout updates (`aria-live`); the view: Space, +/−, C, 1/2, K; the timeline: arrows |
| Focus visible | — | 3 px accent outline on buttons, selects, inputs, canvases and links (`:focus-visible`) |
| Colour is not the only cue | — | lamps are dots, shelters squares, signs triangles; outcomes ▲ ✕ ○ •; plowed / closed paths are also named in the plan text; layer names are text |
| `prefers-reduced-motion` | speed label showed 30× while running at 10× | label fixed; falling snow at a third of its density and a third of its drift; the camera follows without long glides; smooth scrolling off |
| Sound | — | off by default, a labelled toggle with `aria-pressed`; suspended while the page is hidden |
| Phone width (375 px) | (fixed in M7) selects overflowing | no horizontal scroll |

Left as is (see D-038): the 3D scene itself has no spatial audio description beyond the HUD text; the side-by-side variation maps are described by the text under each (the change, the score, the round's outcomes) rather than by the picture.
