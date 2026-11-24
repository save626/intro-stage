# 开场动画 · 眼睛 → 花瓣 → 圣诞树

一个**独立的开场动画演示**：字符画眼睛睁开、瞳孔推进，粒子从瞳孔里长出来，随后进入可交互的
「花瓣 / 圣诞树」粒子界面——支持手势聚合、场景切换、全屏。

- 零构建、零框架（无 Vue / 无打包器），原生 ES Module + 一个静态服务
- 除手势资源外**全部本地内联**：没有 CDN、没有第三方字体、没有统计脚本
- 桌面端满规格：32000 粒子、DPR ≤ 2、antialias，和粒子工程同一套着色器
- 不点「开启手势」就**不加载 22 MB 模型、不申请摄像头**

```powershell
node serve.mjs            # http://localhost:4200
node serve.mjs 4300       # 换端口
```

> 手势需要安全上下文（`http://localhost` 或 https）。`file://` 双击打开时页面照常播放，
> 但「开启手势」按钮会被隐藏。

## 时间线

| 时刻 | 动作 |
| --- | --- |
| 0 – 0.9s | 近黑 `#010203` 淡入，只看得到皮肤纹理 |
| 0.9 – **6.2s** | 眼睑睁开、眨眼，灰蓝三色字符画虹膜/巩膜/瞳孔露出，居中 |
| **5.2s** | 粒子舞台预热（建 WebGL 上下文、编译着色器，遮罩仍为 0） |
| **6.2s** | 瞳孔推进开始：星轨 + 流星淡入，粒子从瞳孔中心径向揭开（3s）；字符层 0.55s 淡出 |
| **9.2s** | 界面壳淡入：花瓣 / 圣诞树 · 开启手势 · 全屏 |
| **9.4s** | 推进结束；无手势时进入 **16 秒呼吸循环**（花停 7s → 3s 散成粒子场 → 2s → 3s 收回 → 5s） |
| 9.4s 后 | 点任意空白处 → **重播整段**；按钮各自 `stopPropagation`，不会误触 |

## 交互

| 操作 | 行为 |
| --- | --- |
| 花瓣 / 圣诞树 | 切换场景，高亮跟随当前场景 |
| 开启手势 | 申请摄像头 + 懒加载 MediaPipe；花瓣张手散开 / 捏合聚合，圣诞树张手炸散 / 握拳收树 |
| 全屏 | 进入全屏后收起状态栏与提示，且点击**不**重播（ESC 退出） |
| 点击空白 | 重播；`Enter` / `Space` 同样 |
| 重新播放 | 左上角按钮（右下角「重新播放」）随时重播 |

## 目录

```
index.html            唯一入口（三层画布 + 界面壳）
styles.css            开场样式（只含 intro 相关规则）
serve.mjs             零依赖静态服务（wasm/task MIME、摄像头 Permissions-Policy）
src/
├─ main.js            时间线 / 界面 / 手势 / 全屏 / 重播
├─ eye.js             字符画眼睛播放器（Canvas 2D）
├─ meteor.js          星轨 + 流星（Canvas 2D）
├─ engine.js          eyeTutorial Web 复刻引擎（逐字节，勿手改）
├─ stage.js           可复用渲染层：createParticleStage（无 UI）
├─ core/
│  ├─ engine.js       单 WebGLRenderer / 单相机 / 场景挂载与释放
│  ├─ gestures.js     统一手势状态（palm/fist/pinch/spread/fingers/pos/rot）
│  ├─ tension.js      手掌张开度（含双手掌宽归一化）
│  ├─ hand-tracker.js MediaPipe HandLandmarker（本地 wasm + 模型）
│  ├─ overlay.js      21 点骨架叠加（本演示未使用；bloom 与融合工程在用它，保留作扩展位）
│  └─ sprites.js      共用光点贴图 + 缓动工具
└─ scenes/
   ├─ index.js        场景注册表（flower / lights）
   ├─ flower-scene.js 花瓣：三层 + 满屏散开，支持外部手动驱动
   ├─ flower/         花瓣粒子与着色器（GPU 插值）
   └─ lights-tree.js  圣诞树：螺旋灯带 + 蓬松填充 + 深度排序双材质
vendor/
├─ three/            three.js r187（MIT）
└─ mediapipe/        tasks-vision 1.2.3 + hand_landmarker.task（Apache-2.0）
docs/                截图
```

## 关键实现

- **一层画布一件事**：眼睛（字符画）、流星（星轨 + 流星）、粒子（WebGL）三层，各自淡入淡出。
  **2026-11-23 起没有星空照片底图层**（`div.intro-sky` / `.intro-sky` / `--intro-starfield` 全部删除）：
  星轨与流星直接画在近黑底 `#010203` 上，只在 `.is-meteor` 加一层极淡径向渐变给点纵深。
  产物因此轻很多，也少了一次「照片底图淡出」的时序。
- **粒子从瞳孔长出来**：`mask-image: radial-gradient(...)` 的 `mask-size` 从 24% 涨到 340%（3s），
  同时整体 `opacity 0→1`（2.6s）、场景缩放 `0.4→1`。
- **预热**：3.6s 前建好 WebGL 上下文并渲染几帧（遮罩 0，看不见），避免推进开始那一帧卡顿。
- **无手势呼吸**：16s 三角波过**双重 smoothstep**（两端停留、中间快速掠过）+ 逐帧低通 `0.05`。
  花瓣的 `disperse` 是把粒子朝"满屏随机目标点"插值，0.1–0.5 之间会把花心掏出黑洞，
  所以两端给满、中间快过。
- **手势懒加载**：`import('./core/hand-tracker.js')` + `base: './vendor/mediapipe'`；
  实测点击前对 `vendor/mediapipe` 的请求数为 0，点击后 4。
- **聚合信号是 `closingOf(g) = max(fist, pinch)`，不是 `palm`**（2026-11-24 真机反馈后改的）：
  `palm` 是四指张开度的加权平均，两指捏合（拇指+食指、其余三指伸开）只能把它压到 ~0.7，
  花不收；拇指↔食指的距离本来就是「捏合」的专用度量，让它与握拳等权驱动场景。
- **手势阈值是真手标定过的**：`src/core/tension.js` 的 `FINGER_RANGES` 按实测重填，
  拇指 `weight=0`（它的 ratio 在握拳时反而更大，没有区分度）。换手/换摄像头要重标定。
- **流星层参数（2026-11-23 定稿）**：星轨 130–220 条、亮度分档 0.22/0.36/0.52/0.72；
  桌面流星 40 颗（118–148°、300–620 px/s）；移动端走 `MOBILE` 窄带随机——
  方向 104–128°（竖屏上更偏竖直，否则斜线走不到屏底就出界）、速度 250–360、
  长度 = 屏宽 × 0.20–0.44、上限 46 颗、补充间隔 0.020s。
  出界判定是 `x < -长度 || y > H + 长度`，不要放宽到 2 倍——那会让池子里大半颗在屏外空转。

## 验证（本地）

```powershell
node serve.mjs 4200
# 浏览器打开后观察：3s 眼睛、7s 瞳孔推进 + 粒子揭开、10s 花瓣、13s 界面壳
```

若要脚本化验收，可用 Playwright 按上表时刻截图比对（参考实现思路：读 `window.__introState()` 的 `elapsed`）。

## 来源与许可

见 [ATTRIBUTION.md](ATTRIBUTION.md)。
