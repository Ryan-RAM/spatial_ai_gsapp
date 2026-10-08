# 试跑 07：假消息与洒水（迭代 5，6 轮，接试跑 06）

测迭代 5 新规则：BEL 来源意图标签、信念指向不存在的地方、行动优先级（BEL > HAB > 搜索）、
BEL unknown 的 `ruled out`、液体记录；顺便测第 10 轮的完整 STATE 节奏。

---

## t=7 重开场景（完整 STATE，用新写法补标签）

Sam 说钥匙在厨房抽屉时，他自己对钥匙没有任何 BEL → 来源标签是 `guess`。厨房从没建立过 → `place unverified`。

```
[STATE t=7]
LOC street < world | outdoor | aff: walk, drive
LOC house < street | building | aff: shelter
LOC living < house | room | N:window(open) E:door_out@SE(open), hook_wall@E S:wall W:shelves | adj: — | aff: sit, pack
LOC hook_keys < living [E] | hook | aff: hang_small
ENT table : in living [C] (mid)
ENT jug_water : on table (holds ~0.5 L water)
ENT glass_1 : on table (holds ~0.25 L water)
ENT glass_2 : on table (holds ~0.25 L water)
ENT van : on street (tall; heading: N)
LOC cargo < van | container | side: back | aff: hold_large
LOC seat_driver < van | seat | side: front | aff: sit, drive
LOC ignition_van < van | slot | side: front | aff: hold_small
ENT keys_van : in ignition_van (aliases: van keys)
AGT raj : in seat_driver facing with van | holds: — | wears: —
AGT mei : in living [C] facing N | holds: — | wears: —
AGT sam : in living [C] facing W | holds: — | wears: —
HAB mei : keys_van -> on hook_keys (habit)
BEL raj : keys_van -> in ignition_van (did it, t1)
BEL mei : keys_van -> in drawer_kitchen (told by sam, guess, t4; place unverified)
[/STATE]
```

---

## t=8 去找"厨房抽屉"

**输入**：Mei 去厨房抽屉找钥匙。

**叙述**：按 §3 现在必须决定厨房存不存在。已建立的事实是：客厅北墙是窗，东墙是出门的门，南墙是实墙，西墙是书架，**没有任何门通往别的房间**；房子下面也只有客厅一个房间。和这些事实一致的决定是：这是一间单间公寓，**没有厨房**。
Mei 环顾一圈就明白了。

```
[STATE t=8]
Δ LOC house < street | building (single room: living only) | aff: shelter   (fixed, §3: no kitchen)
Δ BEL mei : keys_van -> unknown (last believed: in drawer_kitchen, t4; ruled out: drawer_kitchen — does not exist)
[/STATE]
```

没有因为 Mei 的信念去凭空造一个厨房 ✓。
叙述者知道 Sam 的话是 `guess`，但 Mei 的 BEL 和她的反应都和真话没区别，直到她去核实 ✓。

---

## t=9 行动优先级：BEL unknown → HAB → 被告知

**输入**：Mei 接下来去哪找？

**回答**：**东墙的钥匙挂钩**。她对钥匙的 BEL 是 unknown，所以按优先级用 HAB，而挂钩不在她的 `ruled out` 里。

**叙述**：Mei 走到东墙挂钩前，上面是空的。门外车里的 Raj 听见了，喊："钥匙插在车上！"

Raj 的 BEL 是 `in ignition_van` → 他说的是真话 → 标签 `sincere`。

```
[STATE t=9]
Δ AGT mei : in living [E] facing E | holds: — | wears: —   (was: [C] facing N)
Δ BEL mei : keys_van -> in ignition_van (told by raj, sincere, t9)
[/STATE]
```

挂钩搜完没找到，按规则本该写进 `ruled out`；但同一轮里 Raj 就告诉了她位置，BEL 已经换成有位置的版本，`ruled out` 随之作废。这样处理是合理的，规范里也没说要保留。

---

## t=10 洒水 + 出门（第 10 轮完整 STATE）

**输入**：Sam 转身时碰倒了 glass_2，水洒在桌边地上。Mei 从东南的门出去上车。

```
[STATE t=10]
LOC street < world | outdoor | aff: walk, drive
LOC house < street | building (single room: living only) | aff: shelter
LOC living < house | room | N:window(open) E:door_out@SE(open), hook_wall@E S:wall W:shelves | adj: — | aff: sit, pack
LOC hook_keys < living [E] | hook | aff: hang_small
ENT table : in living [C] (mid)
ENT jug_water : on table (holds ~0.5 L water)
ENT glass_1 : on table (holds ~0.25 L water)
ENT glass_2 : on table (empty, tipped over)
ENT spill_water : in living [C] (~0.25 L, on floor beside table)
ENT van : on street (tall; heading: N)
LOC cargo < van | container | side: back | aff: hold_large
LOC seat_driver < van | seat | side: front | aff: sit, drive
LOC seat_passenger < van | seat | side: front | aff: sit   (new, §3)
LOC ignition_van < van | slot | side: front | aff: hold_small
ENT keys_van : in ignition_van (aliases: van keys)
AGT raj : in seat_driver facing with van | holds: — | wears: —
AGT mei : in seat_passenger facing with van | holds: — | wears: —
AGT sam : in living [C] facing S | holds: — | wears: —
HAB mei : keys_van -> on hook_keys (habit)
BEL raj : keys_van -> in ignition_van (did it, t1)
BEL mei : keys_van -> in ignition_van (seen t10)
[/STATE]
```

- 水洒出容器后成了独立的 ENT `spill_water` ✓。
- Mei 上车后，朝向按 `facing with van` 自动跟车 ✓。
- Mei 的 HAB 没变：一次例外不改变习惯 ✓。

---

## t=11 液体去向

**输入**：那壶水去哪了？

**回答**：**分在三处**：壶里还剩约 0.5 L（桌上），glass_1 约 0.25 L（桌上），还有约 0.25 L 洒在桌边地上。glass_2 已经空了，倒在桌上。合计约 1 L，和 t1 壶里的水量相符 ✓。

---

## t=12 Q2：车里有什么

**输入**：车里都有什么？

**回答**：
- 驾驶座：Raj
- 副驾驶座：Mei
- 点火孔：车钥匙
- 货厢：**之前没建立**，也没说过是空的 → 按 §3 现在决定：三个封好的纸箱。

```
[STATE t=12]
Δ ENT box_1 : in cargo (sealed, moving box)   (new, §3)
Δ ENT box_2 : in cargo (sealed, moving box)   (new, §3)
Δ ENT box_3 : in cargo (sealed, moving box)   (new, §3)
[/STATE]
```

> 观察：Q2 规定"嵌套内容只在被问到或显而易见时才列"。车的直接子项是 cargo、座位、点火孔这些 LOC，本身并不是东西。这里直接展开了一层，因为"车里有什么"显然问的是里面的东西。规则可以说得更明确一些。

---

## 发现

**通过**：来源意图标签（t7、t9）、不为信念造地方（t8）、BEL unknown → HAB → 被告知的优先级（t9）、液体分装和洒出（t10、t11）、第 10 轮完整 STATE（t10）。

**遗留**（五轮迭代后还开着）
1. Q2 遇到只有子 LOC 的容器（车、柜子），应该自动展开一层（t12）。
2. 有了更具体的 BEL 后，BEL unknown 的 `ruled out` 是否保留，规范没说（t9）。
