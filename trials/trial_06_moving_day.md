# 试跑 06：搬家日（迭代 4，6 轮）

测迭代 4 新规则：`heading`、部件 `side`、`facing with`、HAB、墙上多特征、带格位的 LOC。
新场景：传话与假消息、液体分装。

---

## t=1 搭场景

```
[STATE t=1]
LOC street < world | outdoor | aff: walk, drive
LOC house < street | building | aff: shelter
LOC living < house | room | N:window(open) E:door_out@SE(open), hook_wall@E S:wall W:shelves | adj: — | aff: sit, pack
LOC hook_keys < living [E] | hook | aff: hang_small
ENT table : in living [C] (mid)
ENT jug_water : on table (holds ~1 L water)
ENT glass_1 : on table (empty)
ENT glass_2 : on table (empty)
ENT van : on street (tall; heading: E)
LOC cargo < van | container | side: back | aff: hold_large
LOC seat_driver < van | seat | side: front | aff: sit, drive
ENT keys_van : in ignition_van (aliases: van keys)
LOC ignition_van < van | slot | side: front | aff: hold_small
AGT raj : in seat_driver facing with van | holds: — | wears: —
AGT mei : in living [W] facing E | holds: — | wears: —
AGT sam : in living [C] facing W | holds: — | wears: —
HAB mei : keys_van -> on hook_keys (habit)
BEL raj : keys_van -> in ignition_van (did it, t1)
[/STATE]
```

东墙两个特征 `door_out@SE, hook_wall@E` 用逗号分开，各带格位；挂钩 LOC 也带格子 [E] ✓。

---

## t=2 习惯 vs 信念

**输入**：Mei 要拿车钥匙，她会先去哪找？

**回答**：**东墙的钥匙挂钩**：她的习惯是挂在那里（HAB），而她对钥匙没有更新的信念。实际上钥匙插在面包车的点火孔里。

- 这次没有冲突。可如果 Mei 同时有一条 BEL（比如"t1 看见 Raj 拿走了"），HAB 和 BEL 听哪个？规范没说。

> ⚠ 缺口：HAB 和 BEL 冲突时的优先级没有规定。

---

## t=3 车转向，车里的人跟着转

**输入**：Raj 把车掉头朝北，准备倒进院门。货厢在 Raj 的哪边？

```
[STATE t=3]
Δ ENT van : on street (tall; heading: N)   (was: heading E; raj turned it)
[/STATE]
```

**回答**：**在 Raj 正后方**（内在参照系，锚点是车；Raj 跟车同向）。
- 换成绝对参照系：车头朝北，货厢在车尾（back）→ 南端。
- Raj 写的是 `facing with van`，没加任何行，朝向自动变成 N ✓。
- 两种算法一致：Raj 朝北，货厢在南 → 朝北行 S=behind ✓。

---

## t=4 传话与假消息

**输入**：Sam 没看见钥匙，但随口对 Mei 说："钥匙在厨房抽屉里。"

**叙述**：这栋房子里还没建立厨房。

```
[STATE t=4]
Δ BEL mei : keys_van -> in drawer_kitchen (told by sam, t4)
[/STATE]
```

> ⚠ 缺口：
> - Mei 的信念指向一个**还没建立的地方**。要不要因此新建厨房和抽屉？如果建了，等于让一句随口的话改变了世界；如果不建，BEL 里就有一个悬空的 id。
> - Sam 是"随口说"，他自己并没有这个信念。BEL 的来源字段写得了"told by sam"，但看不出 Sam 说的是假话、是猜的，还是真的这么认为。

---

## t=5 液体分装

**输入**：Mei 把水壶里的水倒进两个杯子，各倒小半杯。

**叙述**：壶里剩一半水，两个杯子各有约 250 ml。

```
[STATE t=5]
Δ ENT jug_water : on table (holds ~0.5 L water)
Δ ENT glass_1 : on table (holds ~0.25 L water)
Δ ENT glass_2 : on table (holds ~0.25 L water)
Δ AGT mei : in living [C] facing N | holds: — | wears: —   (was: [W] facing E; stepped to table)
[/STATE]
```

这里把水写成容器的属性，而不是单独的 ENT，所以没违反"一个东西只在一处"。

> ⚠ 缺口：要是有人问"那壶水去哪了"，水在规范里不是实体，没法用 Q1 回答。规范需要规定液体、沙子这类可分的东西怎么记。

---

## t=6 墙上 LOC 的方位

**输入**：钥匙挂钩在 Mei 的哪边？

**回答**：**在 Mei 右边**，几步远，看得见（相对参照系，锚点 Mei）。
- Mei C(1,1) 朝北 → 挂钩 E(2,1)：E → 朝北行 right。距离 1。中间格没有。在视野内 ✓。
- 挂钩有格位 [E]，所以能直接算，这是迭代 4 的收益（试跑 05 的窗台就算不了）。

---

## 发现

**通过**：`heading` 和车里的人跟着转（t3）、部件 `side`（t3）、HAB 用于 Q4（t2）、墙上多特征和带格位的 LOC（t1、t6）。

**缺口 → 迭代 5 要补**
1. HAB 和 BEL 冲突时的优先级（t2）。
2. 信念指向还没建立的地方（t4）。
3. 说话人的真假意图：说谎、猜测、真心认为（t4）。
4. 液体这类可分的东西（t5）。
