# 来源与许可

本仓库是一段**独立的开场动画实现**，只包含眼睛 → 花瓣 → 圣诞树这一段的代码与资源。

| 来源 | 用途 | 许可 |
| --- | --- | --- |
| `iremcnar/eyeTutorial`（Python）的 Web 复刻版 `engine.js` | 字符画眼睛引擎（逐字节复制，文件头有说明） | 上游未声明许可证；仅作个人演示/学习，商用前需确认 |
| 本项目自有 `bloom`（手势粒子花） | 花瓣场景的粒子与着色器（三层花瓣、面积均匀采样） | 本项目自有 |
| `ZekangLi-Zico/Christmas-Tree` 的 `tree.py` | 圣诞树场景的点生成算法与配色（移植到 WebGL） | 仓库未声明许可证；仅作学习参考 |
| **three.js r187** | WebGL 渲染 | MIT，见 `vendor/three/LICENSE` |
| **MediaPipe Tasks Vision 1.2.3 + hand_landmarker 模型** | 手部 21 点 | Apache-2.0，见 `vendor/mediapipe/LICENSE`（npm 包未附 LICENSE/NOTICE，版权归 Google LLC） |

## 说明

- `vendor/` 里的依赖是**同源 vendored**：不联网、不碰 CDN；`serve.mjs` 只是本地静态服务。
- MediaPipe 的 22 MB 资源只在点「开启手势」时才被请求；不点不会加载，也不会申请摄像头。
- 本仓库**不包含**任何落地页、产品页、后端或业务代码，仅为开场动画的可运行切片。
