# 试跑 01：厨房与门厅（10 轮）

按 `prompts/spatial_model.md`（含补充的四条规则）自问自答跑十轮。
每轮格式：**输入**（事件或提问）→ **回答/叙述** → STATE。
坐标约定（用于核对 §4）：x 向东为 +，y 向北为 +；
NW(0,2) N(1,2) NE(2,2) / W(0,1) C(1,1) E(2,1) / SW(0,0) S(1,0) SE(2,0)。

---

## t=1 搭场景

**输入**：一栋房子，厨房东墙有门通门厅。Mara 穿着灰外套站在厨房西侧，Leo 在东南角。桌上有把黄铜钥匙，台面上有个红杯子。

**叙述**：厨房北墙是窗，窗下是水槽；东北角一条齐腰高的台面贴着北墙；正中一张木桌；西南角立着两米高的书架。门厅北墙是前门，前门旁的西北角有衣钩和伞架。

```
[STATE t=1]
LOC street < world | outdoor | aff: walk
LOC house < street | building | aff: shelter
LOC kitchen < house | room | N:window E:door_hall S:stove W:fridge | aff: cook, eat, wash
LOC hallway < house | room | N:front_door E:stairs S:closet W:door_kitchen | aff: pass, hang_coats
LOC coat_pocket_l < coat_grey | container | aff: hold_small
ENT table : in kitchen [C] (wood, waist-high)
ENT counter : in kitchen [NE] (waist-high, along N wall)
ENT sink : in kitchen [N] (under window)
ENT shelf_tall : in kitchen [SW] (2 m, blocks view)
ENT mug_red : on counter [NE]
ENT key_brass : on table [C] (aliases: key, Mara's key)
ENT coat_grey : worn_by mara
ENT coat_hook : attached_to hallway [NW]
ENT umbrella_stand : in hallway [NW]
AGT mara : in kitchen [W] facing E | holds: — | wears: coat_grey
AGT leo : in kitchen [SE] facing N | holds: — | wears: —
BEL mara : key_brass -> on table (seen t1)
BEL mara : mug_red -> on counter (seen t1)
BEL leo : key_brass -> on table (seen t1)
BEL leo : mug_red -> on counter (seen t1)
[/STATE]
```

---

## t=2 Q3 相对方位

**输入**：从 Mara 的角度看，红杯子在哪？

**回答**：在 Mara 的正前方，房间另一头，看得见。（相对参照系，锚点 Mara）

- 推导：Mara W(0,1) → 杯子 NE(2,2)，dx=+2、dy=+1，东向差值更大 → E。
  朝东那一行：E = front。距离取较大差值 2 → 房间另一头。
- 可见性：中间经过 C（桌子，齐腰高），不挡视线；书架在 SW，不在中间。

（无位置变化，不写 STATE。）

---

## t=3 移动

**输入**：Mara 去门厅把外套挂起来。

**叙述**：Mara 穿过桌边，从东墙的门进入门厅，走到西北角，面朝北把灰外套挂上衣钩。Leo 看见她出了门，但看不到门厅里的情况。

```
[STATE t=3]
Δ AGT mara : in hallway [NW] facing N | holds: — | wears: —   (was: in kitchen [W] facing E; walked via door_hall)
Δ ENT coat_grey : on coat_hook   (was: worn_by mara; mara hung it)
[/STATE]
```

---

## t=4 移动（Mara 不在场）

**输入**：Leo 收拾厨房：钥匙放进台面抽屉，红杯子放进水槽。

**叙述**：Leo 从东南角往北走，经过桌子时拿起钥匙。到台面前拉开抽屉（第一次提到抽屉，按 §3 确定：台面下有一个抽屉）放进钥匙。然后把杯子挪进旁边的水槽，最后站在台面前面朝北。

```
[STATE t=4]
Δ LOC drawer_counter < counter | container | aff: hold_small   (new, §3)
Δ ENT key_brass : in drawer_counter   (was: on table [C]; leo moved it)
Δ ENT mug_red : in sink   (was: on counter [NE]; leo moved it)
Δ AGT leo : in kitchen [NE] facing N | holds: — | wears: —   (was: [SE] facing N)
Δ BEL leo : key_brass -> in drawer_counter (did it, t4)
Δ BEL leo : mug_red -> in sink (did it, t4)
[/STATE]
```

Mara 在门厅，没看见这两次移动，所以她的 BEL 不变。

---

## t=5 信念与真相

**输入**：Mara 回厨房拿钥匙。她会先去哪找？

**回答**：去桌上找。依据是她的 BEL（t1 看到钥匙在桌上），实际上钥匙在抽屉里。

**叙述**：Mara 从门厅西墙的门回到厨房东侧，面朝西。桌子 C 在她正前方几步远（dx=−1 → W → front），一眼就能看出桌上空了。

```
[STATE t=5]
Δ AGT mara : in kitchen [E] facing W | holds: — | wears: —   (was: in hallway [NW] facing N)
Δ BEL mara : key_brass -> unknown (last believed on table t1; saw it gone t5)
[/STATE]
```

> ⚠ 规则缺口：BEL 没有"信念者知道东西不见了"的写法，这里临时用 `-> unknown (...)`。

---

## t=6 Q1 + Q3

**输入**：红杯子在哪？Mara 能看见吗？

**回答**：在水槽里，水槽在厨房北墙窗下 [N]。从 Mara 看是右前方，几步远，看得见。（Q1 用绝对参照系；第二问用相对参照系，锚点 Mara）

- 推导：Mara E(2,1) → 水槽 N(1,2)，dx=−1、dy=+1，两个差值相等 → NW。
  朝西那一行：W = front，N = right → front-right。距离 1 → 几步远。
- Mara 看了一眼，更新了信念。

```
[STATE t=6]
Δ BEL mara : mug_red -> in sink (seen t6)
[/STATE]
```

---

## t=7 斜向朝向 + 告知

**输入**：Leo 转身面朝西南。这时 Mara 在 Leo 的哪边？Mara 问 Leo 见没见过钥匙。

**回答**：Mara 在 Leo 的左前方，几步远。（相对参照系，锚点 Leo，朝向是斜向）

- 推导：Leo NE(2,2) → Mara E(2,1)，dx=0、dy=−1 → S。
  朝向 SW 是斜向，按规则逆时针转 45°：SW→S；目标也转：S→SE。
  朝南那一行：S = front，E = left → SE = front-left。
- 直觉核对：面朝西南时，正南在正前方与左手（东南）之间 → 左前方 ✓。

**叙述**：Leo 说："在台面抽屉里。"

```
[STATE t=7]
Δ AGT leo : in kitchen [NE] facing SW | holds: — | wears: —   (was: facing N)
Δ BEL mara : key_brass -> in drawer_counter (told by leo, t7)
[/STATE]
```

---

## t=8 移动

**输入**：Mara 去拿钥匙。

**叙述**：Mara 往北走几步到台面前（E→NE），和 Leo 站在同一格。她面朝北拉开抽屉，拿出钥匙。Leo 看着她拿的。

```
[STATE t=8]
Δ AGT mara : in kitchen [NE] facing N | holds: key_brass | wears: —   (was: [E] facing W)
Δ ENT key_brass : held_by mara   (was: in drawer_counter; mara took it)
Δ BEL mara : key_brass -> held_by mara (self, t8)
Δ BEL leo : key_brass -> held_by mara (seen t8)
[/STATE]
```

---

## t=9 Q4 模糊描述 + ∅ 删除

**输入**：Mara 想把钥匙放在"出门时不会忘的地方"。同时 Leo 在洗那个红杯子。

**回答**：放进灰外套的左口袋。外套挂在前门旁的衣钩上，出门总要穿（备选：同一个角落的伞架，但出门不一定带伞）。

**叙述**：Mara 走回门厅西北角，面朝北，把钥匙塞进外套左口袋。厨房里 Leo 走到水槽前 [N]，杯子一滑摔碎在水槽里。Mara 听到了响声，但没看见。

```
[STATE t=9]
Δ AGT mara : in hallway [NW] facing N | holds: — | wears: —   (was: in kitchen [NE])
Δ ENT key_brass : in coat_pocket_l   (was: held_by mara; mara put it there)
Δ BEL mara : key_brass -> in coat_pocket_l (self, t9)
Δ AGT leo : in kitchen [N] facing N | holds: — | wears: —   (was: [NE] facing SW)
Δ ENT mug_red : ∅   (destroyed: slipped and broke in sink, t9)
Δ ENT shards_red : in sink   (remains of mug_red)
Δ BEL leo : shards_red -> in sink (saw it break, t9)
[/STATE]
```

Mara 的 BEL 还是"杯子在水槽里"。这是过时信念，按 §2 照原样保留：她的言行会以为杯子完好。

---

## t=10 场景切换（完整 STATE）

**输入**：Mara 穿上外套出门。问：Mara 的钥匙现在在哪？如果问 Leo，他会怎么说？

**回答**：在 Mara 灰外套的左口袋里，Mara 穿着这件外套，人在前门外的街上。Leo 会说"在 Mara 手里"，因为他最后看到的是 t8（BEL）。

- 钥匙没有单独移动：它随口袋移动，口袋随外套，外套随 Mara（§2：容器内容随容器走）。

```
[STATE t=10]
LOC street < world | outdoor | aff: walk
LOC house < street | building | aff: shelter
LOC kitchen < house | room | N:window E:door_hall S:stove W:fridge | aff: cook, eat, wash
LOC hallway < house | room | N:front_door E:stairs S:closet W:door_kitchen | aff: pass, hang_coats
LOC drawer_counter < counter | container | aff: hold_small
LOC coat_pocket_l < coat_grey | container | aff: hold_small
ENT table : in kitchen [C] (wood, waist-high)
ENT counter : in kitchen [NE] (waist-high, along N wall)
ENT sink : in kitchen [N] (under window)
ENT shelf_tall : in kitchen [SW] (2 m, blocks view)
ENT shards_red : in sink (remains of mug_red)
ENT key_brass : in coat_pocket_l (aliases: key, Mara's key)
ENT coat_grey : worn_by mara
ENT coat_hook : attached_to hallway [NW]
ENT umbrella_stand : in hallway [NW]
AGT mara : on street facing N | holds: — | wears: coat_grey
AGT leo : in kitchen [N] facing N | holds: — | wears: —
BEL mara : key_brass -> in coat_pocket_l (self, t9)
BEL mara : mug_red -> in sink (seen t6; stale — destroyed t9)
BEL leo : key_brass -> held_by mara (seen t8)
BEL leo : shards_red -> in sink (saw it break, t9)
[/STATE]
```

---

## 试跑发现

**新规则都用上了，结果正确**

- 斜向朝向逆时针转（t7）：结果与直觉一致。
- 差值相等取斜向（t6）、差值大的一方取正方向（t2）：都能得出唯一方向。
- 距离按较大差值分档（t2、t6、t7）：没出现模糊的情况。
- `∅` 删除（t9）：杯子销毁后，碎片作为新 id 出现。

**新暴露的缺口**（尚未改规则）

1. **BEL 没有"不知道在哪"的写法**（t5）。建议允许
   `BEL <who> : <id> -> unknown (last believed: ..., t=n)`。
2. **嵌套物品的格子怎么写不明确**。规范示例 `in sink [W]` 写了格子，但 sink 自己没有 3x3 网格。本次嵌套物品不写格子，按容器所在格子推算。建议明文规定：只有带网格的 LOC 的直接子项才写格子。
3. **完整 STATE 会丢掉已删除的 id**。t10 的完整 STATE 里没有 mug_red，"id 保留不再用"的约束就没有出处了，可 Mara 的 BEL 还在引用它。建议加一类 `RET mug_red (destroyed t9)` 行，在完整 STATE 里保留。
4. **室外/无网格位置**（street）不写格子，也没有墙面特征。规范没说可以省略。
5. **AGT 的 Δ 只能整行重写**。改朝向也要重写 holds/wears。可以接受，但最好在规范里说一句"AGT 的 Δ 行写整行"。
6. **UNK（真相层面的丢失）这次没测到**。`∅` + UNK 的替换写法还需要另跑一场验证。
