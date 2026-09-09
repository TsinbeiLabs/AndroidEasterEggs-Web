# NOTICE

本项目是 Android 系统彩蛋的 Web 移植实现，遵循 Apache License 2.0。

## 移植参考

- **AOSP** `frameworks/base`（`com.android.internal.app.PlatLogoActivity` 以及各版本 SystemUI 彩蛋源码）
  - <https://cs.android.com/android/platform/superproject/main>
  - Apache License 2.0，Copyright The Android Open Source Project
- **hushenghao/AndroidEasterEggs** —— 完整的 Android 彩蛋合集 App，本项目按模块逐一对照其实现细节
  - <https://github.com/hushenghao/AndroidEasterEggs>
  - Apache License 2.0，Copyright 2026 Hu Shenghao

移植过程中未复制任何上游二进制资源（位图、音频），所有画面均由 Canvas 2D 矢量绘制；
具体的行为、时序、配色、几何参数取自上述源码中的常量与 `VectorDrawable` 路径数据。
`docs/research/` 下保留了逐模块的对照记录。

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
