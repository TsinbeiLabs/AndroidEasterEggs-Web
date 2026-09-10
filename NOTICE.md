# NOTICE

本项目是 Android 系统彩蛋的 Web 移植实现，遵循 Apache License 2.0。

## 移植参考

- **AOSP** `frameworks/base`（`com.android.internal.app.PlatLogoActivity` 以及各版本 SystemUI 彩蛋源码）
  - <https://cs.android.com/android/platform/superproject/main>
  - Apache License 2.0，Copyright The Android Open Source Project
- **hushenghao/AndroidEasterEggs** —— 完整的 Android 彩蛋合集 App，本项目按模块逐一对照其实现细节
  - <https://github.com/hushenghao/AndroidEasterEggs>
  - Apache License 2.0，Copyright 2026 Hu Shenghao

移植过程中未复制任何上游二进制资源（位图、音频），所有画面均由 Canvas 2D 矢量绘制。
具体的行为、时序、配色、几何参数取自上述源码中的常量与 `VectorDrawable` 路径数据；
其中 Android 14–17 的 platlogo、1.0–2.2 的六个 `b_android_*` 图标、Android Next 的
`android_17_platlogo`，以及 Cinnamon Bun `landroid/Assets.kt` 里的飞船路径与 10 张行星纹理，
是由 `tools/` 下的脚本从 AOSP 的 XML/Kotlin 源文件**逐字提取**的路径数据（`npm run gen:art`、
`npm run gen:assets`），因此这些图形本身仍是 AOSP 的 Apache-2.0 作品。
`docs/research/` 下保留了逐模块的对照记录。

## 逐字移植的其他上游代码

以下三处不是“参考后重写”，而是按原始实现逐行转写，因此保留各自的版权与许可：

- **`src/eggs/shared/kotlinRandom.ts`** —— Kotlin 标准库 `kotlin.random.XorWowRandom`
  与 `kotlin.random.Random` 基类（`nextInt`/`nextBits`/`nextFloat`/`nextDouble`/
  `nextInt(from, until)` 的 2 的幂分支与拒绝采样、`MutableList.shuffle`），以及
  Landroid `MainActivity.kt` 的 `dailySeed()`。
  Copyright 2010-2018 JetBrains s.r.o. and Kotlin Programming Language contributors，
  Apache License 2.0。算法出自 Marsaglia, *Xorshift RNGs*, JSS 8(14), 2003。
- **`src/eggs/shared/hct.ts`** —— Google `material-color-utilities` 的 sRGB/线性互换、
  L*↔Y、CAM16 前向变换与 `HctSolver` 色域映射，以及 AOSP
  `core/system-colors/SystemTonalColors.kt` 的调色板配方。
  Copyright 2021 Google LLC，Apache License 2.0。
- **`src/eggs/nougat/javaRandom.ts`** —— OpenJDK `java.util.Random` 的 48 位 LCG
  （`next(bits)`、`nextInt(bound)`、`nextFloat()`、`nextLong()`）。
  Copyright The OpenJDK Project，GNU GPL v2 with the Classpath Exception。

## 第三方作品

- Android 2.3 Gingerbread 彩蛋中的僵尸插画原作：**Jack Larson**（原彩蛋点击后显示的
  `Zombie art by Jack Larson` 即为其署名，本项目在 Web 版中保留该署名）。
- Android 3.0 Honeycomb 彩蛋的 `REZZZZZZZ...` 文案出自 AOSP，为对 *Tron* 的致敬。

## 商标

Google、Android、Google Play 以及各版本甜品代号（Cupcake、Donut、Eclair、Froyo、
Gingerbread、Honeycomb、Ice Cream Sandwich、Jelly Bean、KitKat、Lollipop、Marshmallow、
Nougat、Oreo、Pie、Quince Tart、Red Velvet Cake、Snow Cone、Tiramisu、Upside Down Cake、
Vanilla Ice Cream、Baklava 等）均为 Google LLC 的商标。本项目与 Google LLC 无任何关联，
仅为学习与致敬用途的非商业实现。
