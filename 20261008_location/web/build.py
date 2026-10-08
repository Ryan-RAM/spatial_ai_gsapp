"""Build web/index.html from lab.src.html, embedding the spec and example trials."""
import html, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
EXAMPLES = [
    ("trial_01_kitchen.md", "Trial 01 · Kitchen and hallway"),
    ("trial_02_lost.md", "Trial 02 · Lost in a blackout"),
    ("trial_04_adjacent_rooms.md", "Trial 04 · Kitchen, living room, upstairs"),
    ("trial_05_floors_car.md", "Trial 05 · Two floors and a garage"),
    ("trial_07_rumour_spill.md", "Trial 07 · A rumour and a spill"),
]


def raw(text):
    assert "</script" not in text.lower()
    return text


src = (ROOT / "web/lab.src.html").read_text()
spec = (ROOT / "prompts/spatial_model.md").read_text()
examples = "\n".join(
    f'<script type="text/plain" id="ex-{i}" data-example="{html.escape(name)}">{raw((ROOT / "trials" / f).read_text())}</script>'
    for i, (f, name) in enumerate(EXAMPLES)
)
out = src.replace("{{SPEC}}", raw(spec)).replace("{{EXAMPLES}}", examples)
(ROOT / "web/index.html").write_text(out)
print("wrote web/index.html", len(out), "bytes")
