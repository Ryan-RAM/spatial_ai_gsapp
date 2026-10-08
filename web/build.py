"""Build web/index.html from lab.src.html, embedding the spec and example trials."""
import html, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
EXAMPLES = [
    ("trial_01_kitchen.md", "试跑 01 · 厨房与门厅"),
    ("trial_02_lost.md", "试跑 02 · 停电后丢东西"),
    ("trial_04_adjacent_rooms.md", "试跑 04 · 厨房与客厅（相邻、楼上）"),
    ("trial_05_floors_car.md", "试跑 05 · 两层楼加车库"),
    ("trial_07_rumour_spill.md", "试跑 07 · 假消息与洒水"),
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
