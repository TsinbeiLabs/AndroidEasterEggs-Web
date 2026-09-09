# 上游实现对照记录

这些文档是移植前的调研笔记：逐个模块记录 `hushenghao/AndroidEasterEggs`
（其本身移植自 AOSP `frameworks/base`）中各版本彩蛋的行为、时序、配色、
几何路径与游戏常量，作为 Web 实现的参照，避免凭记忆臆造参数。

| 文件 | 覆盖版本 |
|---|---|
| `01-gingerbread-to-kitkat.md` | 2.3 Gingerbread、3.0 Honeycomb、4.0 Ice Cream Sandwich、4.1–4.3 Jelly Bean、4.4 KitKat |
| `02-lollipop-marshmallow.md` | 5.0 Lollipop（LLand）、L Preview（Webdriver Torso）、6.0 Marshmallow（MLand） |
| `03-nougat-oreo-pie.md` | 7.0 Nougat（Neko）、8.0/8.1 Oreo（Octopus）、9.0 Pie（PAINT.APK） |
| `04-q-to-cinnamonbun.md` | 10 Quince Tart、11 Red Velvet Cake、12 Snow Cone、13 Tiramisu、14 Upside Down Cake、15 Vanilla Ice Cream、16 Baklava、17 Cinnamon Bun、AndroidNext、RocketLauncher |

文档由自动调研生成，保留了原始文件路径清单；实现某个彩蛋时可直接在其中检索
对应的模块名（如 `LLand`、`OctopusDrawable`、`Cat.java`）取用常量。

许可与署名见仓库根目录的 [NOTICE.md](../../NOTICE.md)。
