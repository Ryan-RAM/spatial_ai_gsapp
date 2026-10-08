# 试跑 05：两层楼加车库（迭代 3，6 轮）

测迭代 3 新规则：长视线逐格算法、楼层 z 坐标与楼梯对齐、回答不加规则外修饰。
新场景：车（会移动的容器，有自己的前后）、习惯性位置。

---

## t=1 搭场景

一楼：门厅（西）和车库（东）。二楼：书房，正好在门厅上方。

```
[STATE t=1]
LOC house < street | building | aff: shelter
LOC street < world | outdoor | aff: walk, drive
LOC hall < house | room | N:stairs_up@NW, front_door@N(closed) E:door_garage(open) S:wall W:window(closed) | adj: E:garage, up:study_up | aff: pass
LOC garage < house | room | N:wall E:wall S:garage_door(closed) W:door_hall(open) | adj: W:hall | aff: park, store
LOC study_up < house | room | N:stairs_down@NW E:wall S:window(closed) W:wall | adj: down:hall | aff: read
ENT shelf_tall : in hall [C] (tall)
ENT box : in hall [SW] (low)
ENT car : in garage [C] (tall; front: S)
LOC trunk < car | container | aff: hold
LOC seat_driver < car | seat | aff: sit, drive
ENT ladder : in garage [N] (tall)
AGT ben : in hall [SW] facing N | holds: — | wears: —   (standing)
AGT nia : in study_up [C] facing S | holds: — | wears: —   (standing)
[/STATE]
```

一致性检查：门厅东墙的门（中段）↔ 车库西墙的门（中段）✓；楼梯 `stairs_up@NW` ↔ `stairs_down@NW` ✓。

> 观察：N 墙上有两样东西（楼梯和前门），我用逗号分开写了。规范没说一面墙能不能列多个特征、怎么列。

---

## t=2 长视线

**输入**：Ben 看得见车库里的梯子吗？

**回答**：梯子在 Ben 右边，在隔壁车库，路线是穿过门厅东墙的门；**部分被挡**（相对参照系，锚点 Ben）。

- 拼格：Ben (0,0)，梯子 (4,2)。dx=+4、dy=+2 → E；朝北行 E=right。
- 逐格（沿 x 走）：x=1 时 y=0.5 → (1,0) 和 (1,1) 各算半格；x=2 时 y=1 → (2,1)；x=3 时 y=1.5 → (3,1) 和 (3,2) 各算半格。
- 过墙：x=2.5 时 y=1.25 → 墙的中段，门开着 ✓。
- 遮挡：(1,1) 有高书架，书架 ≥ 梯子、≥ 眼睛，但它只是半格 → 部分遮挡。其余几格是空的。→ **部分被挡**。

---

## t=3 楼上看楼下

**输入**：从 Nia 的角度看，Ben 在哪？

**回答**：**在 Nia 下方、右前方**，在楼下门厅，路线是走西北角的楼梯下去；**被地板挡住，看不见**（相对参照系，锚点 Nia）。

- Nia (1,1,z=1)，Ben (0,0,z=0)：z 小 → 下方；水平 dx=−1、dy=−1 → SW；朝南行 S=front、W=right → 右前方。
- 视线不经过 NW 的楼梯口 → 地板挡住。

措辞只用了表里有的词。

---

## t=4 放进后备箱（内在参照系）

**输入**：Ben 把箱子搬到车上，放进后备箱。箱子在车的哪一头？

**叙述**：Ben 抱起箱子，穿过门厅东墙的门进车库，绕到车的北头，打开后备箱放进去，人站在车库北侧 [N] 面朝南。

```
[STATE t=4]
Δ ENT box : in trunk   (was: in hall [SW] → held_by ben → in trunk; ben carried it via door_garage)
Δ AGT ben : in garage [N] facing S | holds: — | wears: —   (was: in hall [SW] facing N)
[/STATE]
```

**回答**：**在车尾**（内在参照系：后备箱在车尾，车头朝南）。换成绝对参照系是车的北头。

> ⚠ 缺口：在格子层面，后备箱和车同在 C 格；"北头"这个信息只能从车头朝向推出来，规范没有"部件位于物体哪一侧"的写法。

---

## t=5 开车出门（移动的容器）

**输入**：Ben 开车出门。

**叙述**：Ben 坐进驾驶座，用遥控器打开车库门，把车开出去，在街上掉头往东开。

```
[STATE t=5]
Δ LOC garage < house | room | N:wall E:wall S:garage_door(open) W:door_hall(open) | adj: W:hall | aff: park, store
Δ ENT car : on street (tall; front: S)   (was: in garage [C]; ben drove it out)
Δ AGT ben : in seat_driver facing E | holds: — | wears: —   (was: in garage [N])
[/STATE]
```

**问**：箱子在哪？

**回答**：在车的后备箱里，车在街上，Ben 在开车。箱子随车走，没有单独写一行 ✓。

> ⚠ 缺口：车往东开时，`front: S` 就错了。"车头"是车本身的属性，"朝哪开"是会变的状态，现在混在一个字段里。车里人的朝向应该跟着车走，规范也没写。

---

## t=6 习惯位置

**输入**：Nia 要找眼镜。她平时把眼镜放在哪？

**回答**：眼镜还没建立，Nia 的习惯也没有记录。按 §3 现场补：她平时放在书房窗台上，现在也在那里。

```
[STATE t=6]
Δ ENT glasses : on window_sill_study (aliases: Nia's glasses)   (new, §3)
Δ LOC window_sill_study < study_up | ledge | aff: hold_small   (new, §3)
[/STATE]
```

> ⚠ 缺口：
> 1. 规范没有记录"习惯"的行。上面只记下了眼镜现在的位置，"平时放窗台"这个习惯没地方写，下次问"平时"可能会答得不一样。
> 2. 窗台 `window_sill_study` 依附在南墙的窗上，但 LOC 行没法表达"在南墙上"，只能挂在房间下面，格位丢了。

---

## 发现

**通过**：长视线逐格算（t2）、楼层 z 坐标（t3）、楼梯对齐检查（t1）、措辞约束（t3）、移动容器带着内容走（t5）。

**缺口 → 迭代 4 要补**
1. 车辆：车头朝向（固定）和行驶方向（会变）要分开；车里人的朝向跟着车（t5）。
2. 部件位于物体的哪一侧，比如后备箱在车尾（t4）。
3. 习惯性位置要有一种行来记录（t6）。
4. 一面墙上有多个特征的写法（t1）。
5. 依附在墙上的小地方（窗台、壁架）怎么挂到墙和格位上（t6）。
