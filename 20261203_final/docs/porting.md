# 移植清单（M0.3）

前三周的代码能移植的就移植并改进，不另写一套平行的（CLAUDE.md §1）。这张表写清楚每个功能从哪里来、到哪里去、要改什么。移植后的文件头部都要注明来源（例如 `// Ported from 20261022_distance/src/sim/los.js`）。

**三处共同的改动**（几乎每个文件都涉及）：

1. **真实地形**：以前的地面是 z = 0 或两层平台，现在 `z` 来自 DEM，每格不同；格子是 3 m，不再是 1 个单位。
2. **typed array**：网格数据全部用 `Float32Array` / `Uint8Array` / `Int32Array`，`idx = j * W + i`。以前的 `solids[cell]` 是"数组的数组"，要改成扁平存储：`solidStart: Int32Array`、`solidLo/solidHi: Float32Array`、`solidMat: Uint8Array`。
3. **天气**：能见度 `vf(t)`、风、降雪会进入视线、听觉和行走的计算。

## 对照表

| 功能 | 来源 | 新文件 | 要改什么 | 里程碑 |
|---|---|---|---|---|
| 随机数 | `20261103_position/src/sim/rng.js` | `src/sim/rng.js` | ✅ 已移植；加了命名子流（公共随机数）和高斯分布 | M0.1 |
| 三维视线（DDA 加竖直区间） | `20261022_distance/src/sim/los.js`：`castRay`、`segmentClear`、`inCone`、`canSee` | `src/sim/los.js` | solids 改成扁平 typed array；眼高加上地面 `z`；地面不再是 z = 0 的平面，而是看 DEM（射线低于地面就算挡住）；视距乘 `vf(t)`；亮格让视距 ×2 / ×1.5（规则 P1） | M2.4 |
| 声学距离 | `20261022_distance/src/sim/los.js`：`segmentCrossings`、`acousticDistance` | `src/sim/los.js`（或 `acoustic.js`） | 加上 `m_snow`（降雪吸声）、风的不对称 `(1 − w cos θ)`、阵风降低听觉阈值（§6.2）；结果不再对称 | M2.4 |
| 可见性指纹 | `20261022_distance/src/sim/rays.js` | `data/scripts/bake-fingerprints.mjs` 加 `src/sim/rays.js` | 射线数从 72×5+2 改成 362；不在页面上算，烘焙时离线算好存成 `fingerprints.bin`（M1.7）；页面只读 | M1.7、M2.4 |
| 路径距离 | `20261022_distance/src/sim/paths.js`（Dijkstra，按需缓存每一行） | `src/sim/paths.js` | 改成 A* 加 typed array 二叉堆；边的代价换成通行时间（Tobler 坡度函数 × `f_snow` × `f_cover`，§6.3），所以不对称；每种 agent 一张行走图，分别缓存 | M2.4、M3.7 |
| 四种距离和公理检查 | `20261022_distance/src/sim/metrics.js`：`makeMetrics`、`checkAxioms`、`sampleQuantiles` | `src/sim/metrics.js` | `path` 换成 `d_T`；`checkAxioms` 增加"不对称的程度"（报告平均值和最大值，不只是计数），用来展示 `d_A` 和 `d_T` 的不对称 | M2.4 |
| 距离的文字解释 | `20261022_distance/src/sim/hints.js` | `src/ui/hints.js` | 换成新场景的说法（"它听得见你，你却听不见它：风从北边吹"） | M5.4 |
| 位置和移动关系 | `20261103_position/src/sim/relations.js`：`isAdjacent`、`isBetween`、`isBehind`、toward / away、past | `src/sim/relations.js` | 去掉"在树上"的两层逻辑；`isBetween` 改为在路网（frame P）上判断；给伏击和图解用 | M3.3 |
| 伏击 | `20261103_position/src/sim/creature.js`：`ambushSpot` | `src/sim/creature.js` | 原来是"沿你的最短路走到 2/3 处"；改成在路网上找最后一次看见的位置和最近出口之间的咽喉点（介数高、宽度为 1 格的路段） | M3.3 |
| 生物的状态机 | `20261103_position/src/sim/creature.js`（patrol、investigate、chase、search、ambush）加 `20261110_agents/src/sim/sim.js`（mapping、听声、搜死胡同） | `src/sim/creature.js` | 合并成 §7.6 的状态机；加上 tracking（读脚印）和怕光；所有决策只用自己的 KnowledgeMap | M3.3 |
| 部分知识 | `20261110_agents/src/sim/knowledge.js`：`makeKnowledge`、`look`、`plan`、`firstStep`、`pathTo`、`frontiers` | `src/sim/knowledge.js` | 数组堆换成 typed array 二叉堆；`look` 换成三维视线加 `vf(t)`；`known` 加上"当时看到的内容"；加 `threatMemory`、`believedPosition`（§7.7）；`frontiers` 改成增量维护，不再每次扫全图 | M3.1 |
| 地标链 | `20261110_agents/src/sim/knowledge.js`：`addLandmark`、`nearLandmark`、`recognise` | `src/sim/landmarks.js` | 偏移量从格子改成米（同时保留格子）；加上 §7.8 的新类型（junction、bridge、named_place、lamp、shelter、sign）和 `confidence` 衰减；死胡同的识别改为在路网上判断（度数为 1 的路口），比以前的 3 格探测更可靠 | M3.2 |
| 幸存者的行为 | `20261110_agents/src/sim/sim.js`：`survivorPerceive`、`survivorAct`（向东探索、逃跑、躲藏） | `src/sim/survivor.js` | 加上方向漂移和三种修正、体温、取暖棚、路牌、喊话（§7.6、§10、§12） | M3.4–M3.6 |
| 页面隐藏时停止声音 | `20261103_position/src/ui/audio.js` | `src/ui/audio.js` | 声音换成风雪和根须；保留"页面隐藏或暂停时停止"的做法 | M5.4、M9.1 |
| 测试辅助（手画小地图） | `20261022_distance/tests/helpers.mjs`：`makeTestWorld` | `tests/helpers.mjs` | 图例改成新的覆盖类型（路、草地、林地、灌丛、岩石、水），加上一行高程；这就是 M2 的小样例网格 | M2.1 |
| 平衡脚本 | `20261103_position/tests/balance.mjs`、`20261110_agents/tests/balance.mjs` | `src/sim/evaluate.js` 加 `bench/` | 变成 EvaluationSuite 和 Web Worker 评估器 | M6.2 |

## 不移植的

| 来源 | 原因 |
|---|---|
| `world.js` 的地图生成（三周都有：随机森林、平台、迷宫、`removeDeadEnds`） | 地图现在来自真实数据（M1），不再生成；只保留"连通性检查"的思路，用在规则 I2 |
| `20261110_agents/src/sim/maze.js` | 同上 |
| `20261103_position/src/sim/escape.js`、`bot.js` | 那是玩家操作的游戏；这次是观察和设计的工具，没有玩家角色 |
| 三周的 `scene3d.js` 和 `plans*.js` | 渲染要按新的美术方向重做（M5）；只参考相机控制和二维地图图层的做法 |
