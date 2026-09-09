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
```

推送到 `main` 后由 `.github/workflows/deploy.yml` 自动构建并发布到 GitHub Pages。

## 结构

```
src/
├── main.ts              # 外壳：列表、hash 路由、挂载/卸载彩蛋
├── shell.css
├── core/
│   ├── types.ts         # Egg / EggContext / EggMeta 等契约
│   ├── registry.ts      # 全部彩蛋元数据（按 API 升序）
│   ├── host.ts          # Canvas 运行时：DPR 适配、帧循环、指针/键盘、存档、Toast
│   ├── store.ts         # 按彩蛋命名空间隔离的 localStorage 封装
│   ├── rng.ts           # mulberry32 可复现随机数
│   ├── art.ts           # 公共矢量绘制（bugdroid、圆角矩形、缓动等）
│   └── toast.ts         # Android 风格 Toast
└── eggs/
    └── <codename>/index.ts   # 每个彩蛋一个模块，默认导出 EggFactory
docs/research/           # 逐模块的上游实现对照记录（配色、时序、几何、常量）
```

每个彩蛋模块只需 `export default (ctx: EggContext) => Egg`：拿到 canvas、2D 上下文、
帧回调、指针/键盘状态、持久化存储与 Toast，自行决定画什么。宿主负责 DPR 缩放、
`requestAnimationFrame` 驱动、页面隐藏时暂停以及卸载清理。

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
| — | Android Next | 发布时间表 |
| — | RocketLauncher | launcher2 桌面 |

## 与上游的已知偏差

- 不使用任何位图：AOSP 的 raster 素材（Gingerbread 僵尸插画、Honeycomb 蜜蜂、KitKat 甜点 sprite 等）
  改为矢量/程序化重绘，保留原尺寸、配色与时序。
- KitKat 的 `dessert_kitkat`（Nestlé KitKat 包装，上游标注 "used with permission"）替换为通用的四指威化剪影。
- 动态取色（`system_accent*`）在 Web 上不存在，Paint Chips 用随机种子色相生成的色调梯度替代。
- Icon Quiz 的题库改为自绘的 16×16 图标，仍走上游 `alpha * 1.25` 后取整的量化流程。
- Neko 的 `JobScheduler` 改为 `localStorage` 里的到期时间戳 + 打开页面时结算；额外提供“喂猫”按钮立即结算一次。
- 多点触控（MLand 的分列操作、Pie 的双指缩放）在单指针宿主下降级：MLand 单指控制一列、Pie 用滚轮缩放 logo。
- HDR（Baklava/Cinnamon Bun 的超亮星空与 bloom）在 SDR 面板上按 alpha 近似。
- 随机数：Neko 的猫严格复刻 `java.util.Random`（seed 与 Android 互通），Landroid 的宇宙生成用 mulberry32
  替代 `kotlin.random.Random`，seed 不与 Android 互通。

## 致谢与许可

代码以 **Apache License 2.0** 发布。移植参考 AOSP `frameworks/base` 与
[hushenghao/AndroidEasterEggs](https://github.com/hushenghao/AndroidEasterEggs)（同为 Apache-2.0），
细节见 [NOTICE.md](./NOTICE.md)。

Google、Android 及各版本甜品代号均为 Google LLC 的商标；本项目与 Google LLC 无关联，仅供学习与致敬。
