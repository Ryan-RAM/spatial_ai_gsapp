# 试跑 04：厨房与客厅（迭代 2，6 轮）

测迭代 2 新规则：视野、相邻房间拼格、墙上门窗格位（`@`）、无朝向锚点退回绝对参照系、格子占用。
另外试两个新场景：同名物品指代不清、楼上楼下。

---

## t=1 搭场景

厨房在西，客厅在东。厨房东墙南段有门（开着），对应客厅西墙南段。客厅南墙西段是上楼的楼梯。

```
[STATE t=1]
LOC house < street | building | aff: shelter
LOC kitchen < house | room | N:window E:door_living@SE(open) S:stove W:fridge | adj: E:living | aff: cook, eat
LOC living < house | room | N:tv E:window S:stairs_up@SW W:door_kitchen@SW(open) | adj: W:kitchen | aff: sit, rest
ENT table : in kitchen [C] (mid)
ENT counter : in kitchen [N] (mid)
ENT mug_white_a : on table (aliases: white mug)
ENT mug_white_b : on counter (aliases: white mug)
ENT sofa : in living [C] (mid, faces N)
ENT plant_tall : in living [S] (tall)
ENT ball_red : in living [E] (low, on floor)
AGT yu : in kitchen [W] facing E | holds: — | wears: —   (standing, eyes tall)
AGT jo : on sofa facing N | holds: — | wears: —   (seated, eyes mid)
[/STATE]
```

门的一致性检查：厨房东墙 @SE ↔ 客厅西墙 @SW，都在南段 ✓。

拼格：客厅接在厨房东边，客厅的 W 列 x=3，C=(4,1)，E=(5,1)。

---

## t=2 跨房间方位 + 隔墙

**输入**：红球在 Yu 的哪边？看得见吗？

**回答**：在 Yu 正前方，在隔壁客厅，路线是从东墙南段的门过去，**被墙挡住，看不见**（相对参照系，锚点 Yu）。

- 拼格坐标：Yu (0,1)，球 (5,1)。dx=+5、dy=0 → E → front。
- 视线：y=1 一直不变，穿过公共墙时在墙的中段；门在南段 → 墙挡住 → 看不见。

---

## t=3 移到门边再看

**输入**：Yu 走到厨房东南角的门边，面朝东。现在呢？

**回答**：在 Yu 正前方，在隔壁客厅，**部分被挡**（相对参照系，锚点 Yu）。

- Yu (2,0) → 球 (5,1)：dx=+3、dy=+1 → E → front。
- 过墙：在 x=2.5 处 y≈0.17，落在南段，正好穿过开着的门 ✓。
- 中间格：x=3 时 y≈0.33 → (3,0) 客厅 SW，空的；x=4 时 y≈0.67 → (4,1) 客厅 C，沙发（mid）≥ 球（low），但低于 Yu 的眼睛（tall）→ 部分遮挡。

```
[STATE t=3]
Δ AGT yu : in kitchen [SE] facing E | holds: — | wears: —   (was: [W] facing E)
[/STATE]
```

> ⚠ 缺口：§4.5 的"中间格"只规定了相邻、同行列和 2×1 偏移。像 3×1 这种更长的视线，这里临时按"每一列取 y 值四舍五入到最近的格"来算，规范里没写。

---

## t=4 视野

**输入**：Jo 能看见 Yu 吗？能看见那盆高植物吗？

**回答**：
- Yu 在 Jo 的左边，在隔壁厨房，透过门**看得见**（相对参照系，锚点 Jo）。
  Jo (4,1) → Yu (2,0)：dx=−2、dy=−1 → W；朝北行 W=left，在视野内。视线在 x=2.5 处 y=0.25，落在门的南段 ✓。
- 植物在 Jo 正后方，几步远，**不在视野里**，转身才看得见。
  (4,1) → (4,0)：S → behind。

---

## t=5 指代不清 + 无朝向锚点

**输入**：Yu 说："把白杯子拿给我。"再问：Yu 在红球的哪边？

**回答**：
- 有两个白杯子，需要先问清楚是哪一个：桌上那个（`mug_white_a`，厨房正中），还是台面上那个（`mug_white_b`，厨房北墙边）？
- 球没有朝向，退回绝对参照系：Yu 在球的西南偏西，隔一面墙，经门相通。
  球 (5,1) → Yu (2,0)：dx=−3、dy=−1 → W。

> 观察：两个回答都通过。但"西南偏西"是我自己加的修饰，规则算出来的结果就是 W，应该老实回答"西边"。

---

## t=6 楼上

**输入**：Jo 上楼去拿毯子。毯子在哪？现在 Jo 在哪个方向？

**叙述**：楼上的房间还没建立，按 §3 现场补：楼上卧室 `bedroom_up`，毯子叠在床尾。
Jo 从客厅西南的楼梯上去。

```
[STATE t=6]
Δ LOC bedroom_up < house | room | N:window E:wall S:stairs_down@SW W:wardrobe | adj: — | aff: sleep   (new, §3)
Δ ENT bed_up : in bedroom_up [C] (mid)
Δ ENT blanket : on bed_up
Δ AGT jo : in bedroom_up [SW] facing N | holds: — | wears: —   (was: on sofa; via stairs_up)
[/STATE]
```

**回答**：毯子在楼上卧室的床上，床在房间正中。问"Jo 现在在 Yu 的哪个方向"：**规范答不了**。
- `adj:` 只有东南西北，没有上下；拼格也只有平面坐标。
- 楼梯下端在客厅西南，上端在楼上卧室西南。这是我自己定的，规范里没有"楼梯两端对齐"这种约束。
- 只能先回答"在楼上，从客厅西南的楼梯上去"。

---

## 发现

**通过**：跨房间拼格（t2、t3）、门格位与一致性检查（t1）、视野（t4）、无朝向锚点退回（t5）、指代不清时追问（t5）。

**缺口 → 迭代 3 要补**
1. 长视线的中间格算法（t3）。
2. 垂直方向：楼层、楼梯两端对齐、"上方/下方"（t6）。
3. 回答时不能加规则以外的修饰（t5，"西南偏西"）。
