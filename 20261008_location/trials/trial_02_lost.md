# 试跑 02：停电后丢东西（10 轮，测 UNK / RET）

重点测：东西丢了（∅ + UNK）、UNK 的 `within` / `ruled out`、找到后如何确定位置、
东西销毁（RET）、信念不知道（BEL unknown）、嵌套物品不写格子、室外无网格。
坐标约定同试跑 01：x 向东 +，y 向北 +；NW(0,2) N(1,2) NE(2,2) / W(0,1) C(1,1) E(2,1) / SW(0,0) S(1,0) SE(2,0)。

---

## t=1 搭场景

**输入**：客厅。Ana 戴着金戒指坐在沙发上，Tom 站在东侧，猫 Mio 在猫窝里。

**叙述**：客厅北墙是窗，东墙门通门厅（关着），南墙门通花园（关着，下面有猫洞），西墙是壁炉。
沙发在正中，朝北，靠背 0.9 m 高，底下离地 8 cm；沙发北边是矮茶几，上面有杯水；
西北角一把扶手椅，底下离地 15 cm；东北角落地灯；西南角猫窝。

```
[STATE t=1]
LOC house < street | building | aff: shelter
LOC living < house | room | N:window E:door_hall(closed) S:door_garden(closed, cat_flap) W:fireplace | aff: sit, rest
LOC garden < house | outdoor | aff: roam, hide
ENT sofa : in living [C] (faces N; back 0.9 m; 8 cm gap under)
ENT coffee_table : in living [N] (low, on legs)
ENT glass_water : on coffee_table
ENT armchair : in living [NW] (15 cm gap under)
ENT lamp_floor : in living [NE]
ENT basket_cat : in living [SW]
ENT ring_gold : worn_by ana (aliases: ring, Ana's ring)
ENT phone : held_by tom
AGT ana : on sofa facing N | holds: — | wears: ring_gold
AGT tom : in living [E] facing W | holds: phone | wears: —
AGT mio : in basket_cat facing N | holds: — | wears: —
BEL ana : ring_gold -> worn_by ana (self, t1)
BEL tom : ring_gold -> worn_by ana (seen t1)
BEL ana : mio -> in basket_cat (seen t1)
BEL tom : mio -> in basket_cat (seen t1)
[/STATE]
```

`ana`、`mio` 坐/卧在沙发和猫窝里，都是嵌套位置，按新规则不写格子。

---

## t=2 移动（Tom 没看见）

**输入**：Ana 摘下戒指准备擦护手霜，戒指捏在手里。Tom 在低头看手机。

```
[STATE t=2]
Δ ENT ring_gold : held_by ana   (was: worn_by ana; ana took it off)
Δ AGT ana : on sofa facing N | holds: ring_gold | wears: —
Δ BEL ana : ring_gold -> held_by ana (self, t2)
[/STATE]
```

Tom 低头看手机，没看见。他的 BEL 还是"戒指戴在 Ana 手上"。

---

## t=3 停电：丢失 + 销毁

**输入**：突然停电。Ana 吓了一跳，手一松戒指掉了；她往前一探，把茶几上的水杯碰到地上摔碎了。黑暗里猫窝那边窸窣一声。

**叙述**：一片漆黑，没人看见戒指落在哪，也没人看见猫去了哪。玻璃碎在茶几旁的地上 [N]。

推导 `within`：
- 戒指：两扇门都关着，没人走动；猫叼走戒指不合常理（§2 合理性），所以戒指出不了客厅 → `within: living`。
- 猫：门厅门关着，但南门有猫洞 → `within: living, garden`。

```
[STATE t=3]
Δ ENT ring_gold : ∅   (lost: dropped in the dark)
Δ UNK ring_gold (last seen: held_by ana, on sofa, t=2; within: living; ruled out: —)
Δ AGT ana : on sofa facing N | holds: — | wears: —
Δ ENT glass_water : ∅
Δ RET glass_water (destroyed: knocked off coffee_table, shattered, t=3)
Δ ENT shards_glass : in living [N] (on floor beside coffee_table)
Δ AGT mio : ∅   (moved unseen in the dark)
Δ UNK mio (last seen: in basket_cat, t=1; within: living, garden; ruled out: —)
Δ BEL ana : ring_gold -> unknown (last believed: held_by ana, t=2)
Δ BEL tom : ring_gold -> unknown (last believed: worn_by ana, t=1; told by ana "戒指掉了", t=3)
[/STATE]
```

AGT 的 Δ 行按新规则写整行（Ana 只是 holds 变了，也整行重写）。

---

## t=4 Q1 问未知物

**输入**：戒指在哪？猫呢？

**回答**：
- 戒指：**位置不明**。最后一次是 t2 捏在 Ana 手里（沙发上），停电时掉了；可以确定还在客厅里。
- Mio：**位置不明**。最后一次是 t1 在西南角猫窝里；可能还在客厅，也可能从猫洞去了花园。

（无变化，不写 STATE。叙述里没有替它们"顺口定位"，符合 UNK 期间不得断言位置的规则。）

---

## t=5 陷阱：诱导断言

**输入**：戒指是不是滚到厨房去了？

**回答**：不可能。戒指的 `within` 是客厅：通门厅的门一直关着，停电后也没人进出。厨房在这一场里也还没建立。

（无变化。没有为了回答去新建厨房，也没有把 UNK 改成任何位置。）

---

## t=6 来电，搜索排除

**输入**：灯亮了。Tom 从东侧往西看，Ana 跪在沙发上转身往后看。

**回答（Tom 视角，相对参照系，锚点 Tom E(2,1) 朝 W）**：
- N(1,2)：dx=−1、dy=+1 → NW → 朝西行 W=front、N=right → 右前方，几步远，看得见：玻璃碴，没有戒指。
- NE(2,2)：dy=+1 → N → 右边，几步远，看得见。
- W(0,1)：dx=−2 → W → 正前方，房间另一头；中间格 C 是沙发靠背 → **看不见**地面。
- NW(0,2)、SW(0,0)：dx=−2、dy=±1 → W → 正前方，房间另一头；视线擦过 C 和 N / C 和 S 之间 → 部分被挡（见文末缺口 1）。

**Ana 视角**：她在 C，所有格子都只隔一格。转身朝 S 跪着看过靠背，补看了 W、SW、S：地面空，猫窝空。

合起来：客厅里露在外面的地面都看过，没有戒指也没有猫；猫窝是空的。

```
[STATE t=6]
Δ UNK ring_gold (last seen: held_by ana, on sofa, t=2; within: living; ruled out: open floor of living)
Δ UNK mio (last seen: in basket_cat, t=1; within: living, garden; ruled out: open floor of living, basket_cat)
Δ AGT ana : on sofa facing S | holds: — | wears: —   (was: facing N; turned to look)
Δ BEL ana : mio -> unknown (last believed: in basket_cat, t=1; saw it empty t=6)
Δ BEL tom : mio -> unknown (last believed: in basket_cat, t=1; saw it empty t=6)
[/STATE]
```

---

## t=7 Q4 推断 + 找到（UNK 落定）

**输入**：戒指最可能在哪？去找。

**回答**：**沙发底下**：戒指是从坐垫高度掉的，会滚，而沙发底下有 8 cm 缝，露在外面的地面已经排除了。（备选：坐垫缝里）

**叙述**：Ana 先摸坐垫缝，没有。Tom 在沙发东侧蹲下，用手机照沙发底下，看见戒指躺在灰尘里，没别的东西。

按 §3 落定：位置选在 `within` 里、不在 `ruled out` 里，并且从"沙发上，Ana 手里"一滚就能到 → 沙发底下 ✓。
同一次查看也排除了"沙发底下有猫"。

```
[STATE t=7]
Δ UNK ring_gold : ∅   (resolved: found)
Δ ENT ring_gold : under sofa   (was: UNK; found by tom)
Δ UNK mio (last seen: in basket_cat, t=1; within: living, garden; ruled out: open floor of living, basket_cat, under sofa)
Δ AGT tom : in living [E] facing W | holds: phone | wears: —   (crouching; same cell)
Δ BEL ana : ring_gold -> under sofa (seen t7)
Δ BEL tom : ring_gold -> under sofa (seen t7)
[/STATE]
```

（失败的搜索"坐垫缝"只与已找到的戒指有关；戒指已落定，不再记它的 ruled out。）

---

## t=8 物归原主

**输入**：Tom 把戒指捡出来递给 Ana，她重新戴上。

```
[STATE t=8]
Δ ENT ring_gold : worn_by ana   (was: under sofa; tom picked it up and handed it over, ana put it on)
Δ AGT ana : on sofa facing S | holds: — | wears: ring_gold
Δ BEL ana : ring_gold -> worn_by ana (self, t8)
Δ BEL tom : ring_gold -> worn_by ana (seen t8)
[/STATE]
```

---

## t=9 找猫：排除 → 室外无网格落定

**输入**：Mio 呢？

**回答**：**最可能在花园**：受惊的猫会从熟悉的猫洞跑出去，而客厅里能藏的地方大多已经排除。（备选：扶手椅底下，西北角）

**叙述**：Tom 先去西北角趴下看扶手椅底下，空的。他从南门出去到花园，在一丛灌木下面看到 Mio 缩成一团（灌木是 §3 现场补的），抱起了它。

落定检查：花园在 `within` 里，不在 `ruled out` 里，从猫窝出猫洞就能到 ✓。花园是室外无网格，按新规则不写格子。

```
[STATE t=9]
Δ ENT bush : in garden   (new, §3)
Δ UNK mio : ∅   (resolved: found)
Δ AGT mio : held_by tom facing — | holds: — | wears: —   (was: UNK; found under bush in garden, tom picked it up)
Δ AGT tom : in garden facing S | holds: phone, mio | wears: —   (was: in living [E]; via armchair [NW], then door_garden)
Δ BEL tom : mio -> held_by tom (self, t9)
[/STATE]
```

Ana 还在沙发上，看不到花园。她的 BEL 关于 Mio 仍是 unknown。

---

## t=10 回屋，完整 STATE（含 RET）

**输入**：Tom 抱猫回来，把它放回猫窝。顺便问：刚才那杯水呢？

**回答**：**那杯水已经不存在了**，t3 停电时被碰到地上摔碎了，玻璃碴在茶几旁地上 [N]。

```
[STATE t=10]
LOC house < street | building | aff: shelter
LOC living < house | room | N:window E:door_hall(closed) S:door_garden(closed, cat_flap) W:fireplace | aff: sit, rest
LOC garden < house | outdoor | aff: roam, hide
ENT sofa : in living [C] (faces N; back 0.9 m; 8 cm gap under)
ENT coffee_table : in living [N] (low, on legs)
ENT shards_glass : in living [N] (on floor beside coffee_table)
ENT armchair : in living [NW] (15 cm gap under)
ENT lamp_floor : in living [NE]
ENT basket_cat : in living [SW]
ENT ring_gold : worn_by ana (aliases: ring, Ana's ring)
ENT phone : held_by tom
ENT bush : in garden
AGT ana : on sofa facing S | holds: — | wears: ring_gold
AGT tom : in living [SW] facing S | holds: phone | wears: —
AGT mio : in basket_cat facing N | holds: — | wears: —
RET glass_water (destroyed: knocked off coffee_table, shattered, t=3)
BEL ana : ring_gold -> worn_by ana (self, t8)
BEL tom : ring_gold -> worn_by ana (seen t8)
BEL ana : mio -> in basket_cat (seen t10)
BEL tom : mio -> in basket_cat (did it, t10)
[/STATE]
```

Ana 坐在沙发上朝南，猫窝在她西南边、隔一格，所以看到了 Tom 放猫，她的 BEL 也更新了。

---

## 试跑发现

**这次测到并且通过的规则**

- **∅ + UNK**（t3）：戒指和猫丢了都换成了 UNK，`within` 由门的开关和"谁能搬动它"推出来。
- **UNK 期间不断言位置**（t4、t5）：t5 的诱导问题被 `within` 挡住了，没有为了回答去新建厨房。
- **`ruled out` 一路累积**（t6 → t7 → t9），找到时的落定位置同时满足三个条件：在 `within` 里、不在 `ruled out` 里、从最后看到的位置能到达。
- **RET**（t3、t10）：杯子在完整 STATE 里留下了 RET 行，Q1 问到时能回答"已经不存在了"。
- **BEL unknown**（t3、t6）：Tom 是"被告知"变成不知道，和 Ana"亲眼看到它不见了"的来源区分开了。
- **嵌套物品不写格子、室外无网格**（全程、t9）：都没出现歧义。
- **AGT 的 Δ 写整行**：没有出现漏写 holds/wears。

**新暴露的缺口**（尚未改规则）

1. **视线遮挡判定不完整**：`§4.5` 只说"中间格子里有高东西"，但像 E→NW 这种日字形偏移，视线正好擦过两个格子之间（C/N），没有规定算哪一格。建议：擦过两格时，只要其中一格有遮挡就算"部分被挡"。
2. **遮挡不看目标高度**：0.9 m 的沙发靠背挡得住地上的戒指，挡不住站着的人。§4.5 只说"高的实体"，建议改成"遮挡物比目标高"。
3. **AGT 被抱着时朝向没意义**：t9 写成了 `facing —`，规范里 dir 没有这个值。建议规定 held_by / worn_by 状态的 AGT 写 `facing —`。
4. **同一轮里多次移动**：t8 戒指"沙发底下 → Tom 手里 → Ana 戴上"写成了一行，把中间过程放进括号。这样可行，但规范没说一轮里同一个 id 只写最终位置。
