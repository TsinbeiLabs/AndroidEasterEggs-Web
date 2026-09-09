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

见站点左侧列表（`src/core/registry.ts` 中的 `status` 字段）：
`ready` 可玩 · `wip` 施工中 · `planned` 待移植。

## 致谢与许可

代码以 **Apache License 2.0** 发布。移植参考 AOSP `frameworks/base` 与
[hushenghao/AndroidEasterEggs](https://github.com/hushenghao/AndroidEasterEggs)（同为 Apache-2.0），
细节见 [NOTICE.md](./NOTICE.md)。

Google、Android 及各版本甜品代号均为 Google LLC 的商标；本项目与 Google LLC 无关联，仅供学习与致敬。
