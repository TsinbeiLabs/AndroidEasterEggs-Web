# Android Easter Eggs · Web

把 Android 系统彩蛋（设置 → 关于手机 → 连点 “Android 版本”）从 2.3 Gingerbread 一路移植到最新版本，
纯 **TypeScript + Canvas 2D**，不依赖任何框架，也**不打包任何位图/音频素材**——所有画面都由矢量绘制。

在线试玩：<https://tsinbeilabs.github.io/AndroidEasterEggs-Web/>

## 开发

```bash
npm install
npm run dev        # 本地开发服务器
npm run build      # 类型检查 + 生产构建（输出到 dist/）
npm run typecheck  # 仅类型检查
npm test           # vitest 单元测试（112 项：随机数、缓动、HCT 取色、星空、Landroid 等）
```

推送到 `main` 后由 `.github/workflows/deploy.yml` 自动构建并发布到 GitHub Pages。

两个代码生成脚本（产物已提交，平时不需要重跑）：

```bash
npm run gen:art     # AOSP VectorDrawable XML  ->  src/eggs/shared/{platlogoArt,baseArt}.ts
npm run gen:assets  # Landroid Assets.kt 路径   ->  src/eggs/shared/landroidAssets.ts
```

## 结构

```
src/
├── main.ts              # 外壳：列表、hash 路由、挂载/卸载彩蛋
├── shell.css
├── core/
│   ├── types.ts         # Egg / EggContext / EggMeta / PointerState 等契约
│   ├── registry.ts      # 全部彩蛋元数据（按 API 升序）
│   ├── host.ts          # Canvas 运行时：DPR、帧循环、多指针/键盘、存档、Toast
│   ├── store.ts         # 按彩蛋命名空间隔离的 localStorage 封装
│   ├── rng.ts           # mulberry32 可复现随机数（外壳用）
│   ├── easing.ts        # Android 各 Interpolator 的闭式实现
│   ├── art.ts           # 公共矢量绘制（bugdroid、圆角矩形等）
│   └── toast.ts         # Android 风格 Toast
└── eggs/
    ├── <codename>/index.ts   # 每个彩蛋一个模块，默认导出 EggFactory
    └── shared/
        ├── kotlinRandom.ts   # kotlin.random.Random（XorWow）逐位复刻 + dailySeed()
        ├── vectorArt.ts      # VectorDrawable 渲染器（分组变换、渐变、填充/描边）
        ├── platlogoArt.ts    # 生成：14–17 与 Android Next 的 platlogo 路径数据
        ├── baseArt.ts        # 生成：1.0–2.2 六个 b_android_* 路径数据
        ├── landroidAssets.ts # 生成：飞船路径与 10 张 A17 行星纹理
        ├── hct.ts            # CAM16/HCT 与 Material You 色调调色板求解器
        ├── starfield.ts      # 14–17 的曲速星空（线性/径向两种）
        ├── warpLogo.ts       # 按住进入曲速 + 十七角星一笔画
        ├── landroid.ts       # Landroid 沙盒（PBD 物理、开普勒轨道、自动驾驶）
        ├── flappy.ts         # LLand / MLand 共用引擎
        └── ...               # clock、neko、paintchips、patches 等
tests/                   # vitest 单元测试（含一个记录式 CanvasRenderingContext2D 桩）
tools/                   # 上面两个代码生成脚本
docs/research/           # 逐模块的上游实现对照记录（配色、时序、几何、常量）
```

每个彩蛋模块只需 `export default (ctx: EggContext) => Egg`（可以是 async）：拿到 canvas、
2D 上下文、帧回调、指针/多指针/键盘状态、持久化存储与 Toast，自行决定画什么。宿主负责
DPR 缩放、`requestAnimationFrame` 驱动、页面隐藏时暂停以及卸载清理。

## 移植进度

全部版本已移植完成（`src/core/registry.ts`，按 API 升序）：

| Android | 代号 | 彩蛋 |
|---|---|---|
| 1.0 – 2.2 | Base / Petit Four / Cupcake / Donut / Eclair / Froyo | PlatLogo |
| 2.3 | Gingerbread | Zombie Art |
| 3.0 – 3.2 | Honeycomb | REZZZZZZZ |
| 4.0 | Ice Cream Sandwich | Nyandroid |
| 4.1 – 4.3 | Jelly Bean | BeanBag |
| 4.4 | KitKat | Dessert Case |
| L Preview | L Preview | Webdriver Torso |
| 5.0 – 5.1 | Lollipop | LLand |
| 6.0 | Marshmallow | MLand |
| 7.0 – 7.1 | Nougat | Neko |
| 8.0 – 8.1 | Oreo | Ocquarium |
| 9.0 | Pie | PAINT.APK |
| 10 | Quince Tart | Icon Quiz |
| 11 | Red Velvet Cake | Cat Controls |
| 12 – 12L | Snow Cone | Paint Chips |
| 13 | Tiramisu | Paint Chips + emoji 气泡 |
| 14 | Upside Down Cake | Landroid |
| 15 | Vanilla Ice Cream | Landroid + Autopilot |
| 16 | Baklava | Landroid + AUTO |
| 17 | Cinnamon Bun | 十七角星一笔画 + Landroid |
| — | Android Next | 发布时间表（底部弹窗） |
| — | RocketLauncher | 曲速屏保（点击图标跳转到对应彩蛋） |

## 与上游的已知偏差

已经**不再是偏差**的几项（此前为受限实现，现已按上游源码逐行对齐）：

- **矢量素材**：Android 14–17 的 `*_platlogo.xml`、1.0–2.2 的六个 `b_android_*.xml`、
  Android Next 的 `android_17_platlogo.xml`，以及 A17 `Assets.kt` 里的飞船路径与 10 张行星纹理，
  现在都由 `tools/` 下的脚本直接从 AOSP 的 `VectorDrawable` 提取路径数据（Apache-2.0），
  包括 `<group>` 变换与 `<aapt:attr>` 内联渐变，不再是手工近似的重绘。
- **动态取色**：Paint Chips 与 S/T 的时钟不再是“随机色相梯度”，而是完整的 Material You 推导
  （sRGB ↔ 线性 ↔ CAM16 ↔ HCT，含色域映射求解器），按上游 `SystemTonalColors` 的
  accent1 chroma 36 / accent2 16 / accent3 hue+60 chroma 24 / neutral1 4 / neutral2 8
  与 13 档 shade→tone 阶梯（含 shade 500 → tone 49.6）生成五组色调调色板。
- **多点触控**：宿主现在提供 `context.pointers`，MLand 恢复“每根手指控制一列”、
  Pie 恢复双指捏合改变 logo 半径、Landroid 支持双指缩放与平移。
- **Landroid 宇宙 seed**：`kotlin.random.Random`（XorWowRandom + `nextInt(bound)` 的
  2 的幂分支与拒绝采样、`nextFloat`、Float 精度）已逐位复刻，并且默认使用上游的
  `dailySeed()`——所以网页上今天生成的星系与 Android 设备今天的是同一个（可用“设定 seed”按钮复现任意 seed）。

仍然存在的偏差：

- **位图素材**：AOSP 的 raster 资源（Gingerbread 僵尸插画、Honeycomb 蜜蜂、KitKat 甜点 sprite、
  Jelly Bean 豆子贴图等）不打包，改为矢量/程序化重绘，保留原尺寸、配色与时序。
- **商标**：KitKat 的 `dessert_kitkat`（Nestlé KitKat 包装，上游标注 "used with permission"）
  替换为通用的四指威化剪影。
- **Icon Quiz**：题库无法引用 framework drawable，改为自绘的 16×16 图标，
  但量化流程与上游一致（`f = min(1, a/255 * 1.25)` 后四舍五入）。
- **Neko**：`JobScheduler` 改为 `localStorage` 里的到期时间戳 + 打开页面时结算；
  额外提供“喂猫”按钮立即结算一次。
- **HDR**：Baklava/Cinnamon Bun 的超亮星空（`packHdrWhite`，逐平面亮度最高 4/3、bloom 2.0）
  在 SDR 面板上按 alpha 近似，超过 1.0 的部分截断为纯白。
- **着陆判定**：上游用 `|ship.angle - a|` 的**原始差值**判断机头是否对准地表法线，
  由于 `ship.angle` 会不断累加，转过 π 之后就无法着陆；本项目改为归一化到 (-π, π] 的角差。
- **上游的整数除法**：`mass = 4 / 3 * PIf * r^3 * density` 在 Kotlin 里 `4 / 3` 是整数除法，
  实际质量是 `π·r³·density`。本项目**照原样复刻**（它会影响所有开普勒周期），而不是“修正”成 4/3。

## 致谢与许可

代码以 **Apache License 2.0** 发布。移植参考 AOSP `frameworks/base` 与
[hushenghao/AndroidEasterEggs](https://github.com/hushenghao/AndroidEasterEggs)（同为 Apache-2.0），
细节见 [NOTICE.md](./NOTICE.md)。

Google、Android 及各版本甜品代号均为 Google LLC 的商标；本项目与 Google LLC 无关联，仅供学习与致敬。
