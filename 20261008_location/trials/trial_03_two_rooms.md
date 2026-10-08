# 试跑 03：书房与卧室（迭代 1，6 轮）

测迭代 1 新规则：视线擦格、高度分级遮挡、`facing —`、一轮多次移动；顺便试跨房间方位。
坐标约定同前。所有方向推导都用 §4 机械算出，再用直觉核对。

---

## t=1 搭场景

**叙述**：书房在西，卧室在东，两间共用一面墙，墙上的门开着。
书房：西墙书桌，南墙通高书架，正中一把扶手椅；狗 Bobo 蜷在东侧睡着。Lin 站在西南角，面朝东。
卧室：北墙衣柜，正中一张床；东北角地上放着蓝背包；Kai 坐在床上，面朝西。

```
[STATE t=1]
LOC flat < street | building | aff: shelter
LOC study < flat | room | N:window E:door_bed(open) S:bookshelf W:desk | aff: read, work
LOC bedroom < flat | room | N:wardrobe E:window S:radiator W:door_study(open) | aff: sleep
ENT desk : in study [W] (mid)
ENT bookshelf : in study [S] (tall, against S wall)
ENT armchair : in study [C] (mid)
ENT bed : in bedroom [C] (mid)
ENT wardrobe : in bedroom [N] (tall)
ENT backpack_blue : in bedroom [NE] (low, on floor)
AGT lin : in study [SW] facing E | holds: — | wears: —   (standing, eyes tall)
AGT kai : on bed facing W | holds: — | wears: —   (seated, eyes mid)
AGT bobo : in study [E] facing — | holds: — | wears: —   (curled asleep, low)
BEL lin : backpack_blue -> in bedroom [NE] (seen t1)
BEL kai : backpack_blue -> in bedroom [NE] (seen t1)
[/STATE]
```

---

## t=2 擦格 + 高度遮挡

**输入**：Lin 看得见 Bobo 吗？

**回答**：在 Lin 正前方，书房另一头，**部分被挡**（相对参照系，锚点 Lin）。

- 方向：SW(0,0) → E(2,1)，dx=+2、dy=+1 → E → 朝东行 front。距离 2 → 另一头。
- 中间格：2×1 偏移，视线擦过 C(1,1) 与 S(1,0) 之间，两格都是"半格"。
  - C 扶手椅（mid）≥ Bobo（low），但低于 Lin 的眼睛（tall）→ 部分遮挡。
  - S 书架（tall）≥ Bobo，且 ≥ 眼睛 → 本应遮挡，但它是半格 → 只算部分遮挡。
- 取最坏结果 → 部分被挡。直觉核对：站着隔一把扶手椅看地上的狗，确实只能看到一部分 ✓。

---

## t=3 背后的东西

**输入**：Kai 看得见背包吗？

**回答**：背包在 Kai 的右后方，几步远（相对参照系，锚点 Kai）。按 §4.5 的规则算是"看得见"，但实际上它在 Kai 背后。

- 床在 C(1,1)，Kai 在床上，按嵌套规则取床的格子 → NE(2,2)：dx=+1、dy=+1 → NE；朝西行 N=right、E=behind → 右后方。
- 中间格：相邻，没有。

> ⚠ 缺口：§4.5 只算遮挡，不算视野。人看不见背后的东西，除非转身。

---

## t=4 跨房间方位

**输入**：背包在 Lin 的哪个方向？

**回答**：在 Lin 正前方，在隔壁卧室，路线是从前面东墙的门穿过去，进门后走到东北角（相对参照系，锚点 Lin）。

- 规范只说"经由门或墙"，没给出怎么算方向。这里临时把卧室接在书房东边，卧室格子的 x 加 3：
  背包 = (3+2, 2) = (5,2)。Lin (0,0) → dx=+5、dy=+2 → E → front。
- 看得见吗？东墙是墙。门在东墙，但规范没说门在墙的哪一格（北段、中段还是南段），无法判断视线能不能穿门。

> ⚠ 缺口：①跨房间方向没有算法；②墙上的门/窗没有格位。

---

## t=5 一轮多次移动

**输入**：Kai 起身拿起背包，走到书房递给 Lin，Lin 背上。

**叙述**：Kai 从床上起来，走到东北角拿起背包，穿过门进了书房，从扶手椅南边绕过去，在书架前 [S] 停下，面朝西把背包递给 Lin。Lin 背上了。

```
[STATE t=5]
Δ ENT backpack_blue : worn_by lin   (was: in bedroom [NE] → held_by kai → held_by lin → worn_by lin; kai fetched it, handed over, lin put it on)
Δ AGT kai : in study [S] facing W | holds: — | wears: —   (was: on bed facing W; via bedroom [NE], door)
Δ AGT lin : in study [SW] facing E | holds: — | wears: backpack_blue
Δ BEL lin : backpack_blue -> worn_by lin (self, t5)
Δ BEL kai : backpack_blue -> worn_by lin (seen t5)
[/STATE]
```

路径上每一步都合法：任何时刻背包只在一处，交接时 Kai 与 Lin 相邻（S 与 SW 距离 1）。

> 观察：书架和 Kai 在同一格 [S]。规范没说人能不能站进有家具的格子。

---

## t=6 `facing —` 作锚点

**输入**：Bobo 在 Kai 的哪边？Kai 又在 Bobo 的哪边？

**回答**：
- Bobo 在 Kai 的右后方，几步远（相对，锚点 Kai）：S(1,0) → E(2,1)，dx=+1、dy=+1 → NE；朝西行 → 右后方。
- 第二问：Bobo 的朝向是 `—`，又没人抱着它，按规则拒答。但其实可以退回绝对参照系回答：Kai 在 Bobo 西南方，几步远。

> ⚠ 缺口：`—` 锚点直接拒答太生硬，应该退回绝对参照系。

---

## 发现

**通过**
- 擦格加高度分级遮挡（t2）：结果和直觉一致。
- 一轮多次移动（t5）：路径写法清楚，可以逐步检查。
- `facing —`（t1、t6）：写法可用。

**缺口 → 迭代 2 要补**
1. 视野：背后的东西看不见（t3）。
2. 跨房间方向的算法（t4）。
3. 墙上的门窗要有格位（t4）。
4. `—` 锚点退回绝对参照系，不拒答（t6）。
5. 格子占用：人能不能和家具在同一格（t5）。
