<task id="ses_f798540abffesfegeaTS5JeMzl" state="completed">
<task_result>
# Android Easter Egg Research Report — batch 1 (Gingerbread → KitKat)

Repo: `hushenghao/AndroidEasterEggs` @ `main` (Apache‑2.0). All five modules are near‑verbatim ports of AOSP `frameworks/base` code; I verified each against `aosp-mirror/platform_frameworks_base` at the matching release tag. Every asset in these five eggs is a **raster bitmap** except two vector drawables in `IceCreamSandwich` and one in `KitKat`. I reverse‑engineered the bitmaps pixel‑exactly (palettes, bounding boxes, 10 px cell grids) so everything below can be re‑drawn with Canvas 2D primitives.

---

## 0. Shared facts (all five eggs)

**`eggs/Base` is NOT a base class for these five.** `eggs/Base/src/main/java/com/android_b/egg/PlatLogoActivity.kt` only implements API 1–8 (Base, Petit Four, Cupcake, Donut, Eclair, Froyo): a Compose `BoxWithConstraints`, centred `Image` sized `min(maxWidth,maxHeight) * 0.6f`, single tap → toast `"Android $versionName: $nickname"`. No long‑press, no vibration, no game. Gingerbread and later each ship a **self‑contained** `PlatLogoActivity` (plain `android.app.Activity`, views built in code — there are **no `res/layout/*.xml` files at all** in any of these five modules).

Shared plumbing (not needed for the Canvas port, but explains the entry points):
* Each module has `Android<Name>EasterEgg.java` — a Hilt `@Module @InstallIn(SingletonComponent.class)` providing an `EasterEgg(iconRes, nameRes, nicknameRes, IntRange(apiLevels), PlatLogoActivity.class)` plus a `List<TimelineEvent>`.
* `SnapshotProvider` classes just rebuild the PlatLogo screen for the app's gallery thumbnails.
* Manifest theme for every PlatLogoActivity: `@android:style/Theme.Wallpaper.NoTitleBar.Fullscreen` → **transparent, the live wallpaper shows through**.
* Resource files present: only `res/values/strings.xml` (all five), `res/values/resources.xml` + `res/values-night/resources.xml` (KitKat only). **There is no `colors.xml` and no `dimens.xml` in any of the five modules**; the single dimen lives inside KitKat's `strings.xml`.

`ViewConfiguration.getLongPressTimeout()` = `DEFAULT_LONG_PRESS_TIMEOUT` = **500 ms** (verified in AOSP `core/java/android/view/ViewConfiguration.java`), which drives the ICS and (via the standard long‑click) the JB/KK timings.

**No egg in this batch has gravity or collision physics.** Nyandroid is constant‑velocity horizontal flight; BeanBag is constant‑velocity drift + spin (the collision loop computes `overlap()` and throws the result away); DessertCase is a grid re‑layout animation.

---

## 1. Gingerbread — Android 2.3 / 2.3.3, API 9–10

### Files
```
eggs/Gingerbread/src/main/AndroidManifest.xml
eggs/Gingerbread/src/main/java/com/android_g/egg/PlatLogoActivity.java
eggs/Gingerbread/src/main/java/com/android_g/egg/AndroidGingerbreadEasterEgg.java
eggs/Gingerbread/src/main/java/com/android_g/egg/SnapshotProvider.java
eggs/Gingerbread/src/main/res/values/strings.xml
eggs/Gingerbread/src/main/res/drawable/g_platlogo.jpg        (720x480, JPEG, no alpha)
eggs/Gingerbread/src/main/res/drawable/g_android_logo.webp   (192x192, repo-authored list icon)
```

### Entry behaviour
The whole egg. `PlatLogoActivity.onCreate` builds a bare `ImageView`, `setImageResource(R.drawable.g_platlogo)`, `ScaleType.FIT_CENTER`, `setContentView(content)`. No padding, no background, no text.

`dispatchTouchEvent`: **every `ACTION_UP` anywhere on screen** re‑shows a single pre‑built `Toast`:

```java
mToast = Toast.makeText(this, "Zombie art by Jack Larson", Toast.LENGTH_SHORT);
```

* Tap → toast. Repeated tap → toast again (same `Toast` instance, `.show()`).
* Long‑press → nothing (no listener registered).
* **There is no secondary screen and no game.** Gingerbread is a static picture + attribution toast.

### Exact strings
| Source | Value |
|---|---|
| `strings.xml` `g_egg_name` | `Gingerbread` |
| Hard‑coded toast (also in AOSP) | `Zombie art by Jack Larson` |
| Timeline (API 10) | `G MR1.\nReleased publicly as Android 2.3.3 in February 2011.` |
| Timeline (API 9) | `G.\nReleased publicly as Android 2.3 in December 2010.` |

### The art (`g_platlogo.jpg`, 720 × 480, 3:2)
A painted illustration, not vector art. Measured composition:

* **Sky** — dark navy/blue across the whole top and upper left. Quantised tones: `#262B3C`, `#2E447B`, `#344041`, `#4F4B50`, `#516577`.
* **Earth** — rust/brown mass filling the left half and the whole bottom: `#5B363E`, `#764C4E`, `#7B6961`, `#8B6E60`, `#634C4F`.
* **The figure** — one large saturated‑green Android robot, dominant green `#72D02F` (JPEG‑noisy ±3 per channel) with pale‑green highlight `#B7E196` / `#B4CF99`. Its silhouette bbox is **(378, 38) – (632, 422), i.e. 254 × 384 px**, right of centre. Measured anatomy:
  * two thin antennae, y ≈ 40…72, left at x ≈ 447–471, right at x ≈ 533–560, each ~10–14 px wide, angled slightly inward;
  * dome head y ≈ 76…156, widening from x 468–539 at y=76 to x 421–590 at y=144;
  * **two dark eye slots, 11 × 6 px, at (484, 112)–(495, 118) and (529, 112)–(540, 118)** — symmetric about the head centre x ≈ 506;
  * torso y ≈ 160…372, widest x 378–632 at y ≈ 200–236;
  * two legs splitting at y ≈ 376…424: x 474–534 and x 549–591.
* **Pale/grey blobs** (connected‑component analysis of pixels with R,G,B > 200): largest 66 × 110 at (342,106)–(408,216) — immediately left of the android's head; then 48 × 64 at (664,76); 52 × 94 at (152,64); 41 × 40 at (292,404); 26 × 44 at (146,230). These read as moon / tombstones / highlights in the night scene. ~4.7 % of all pixels are "bright", so the sky is also speckled.
* Small green tufts at the figure's feet: 48 × 40 at (478,384), 20 × 24 at (610,388), 22 × 16 at (672,424), 6 × 26 at (712,284), 16 × 6 at (532,450).

### Third‑party credit
**Yes — explicit.** The toast string `"Zombie art by Jack Larson"` is the attribution and is verbatim AOSP (`android-2.3.7_r1`, `core/java/com/android/internal/app/PlatLogoActivity.java`). Keep it on screen (toast) in the re‑implementation.

### Canvas 2D suggestion
The painting cannot be reproduced faithfully from primitives; do a **stylised** version and keep the credit text.
1. `fillRect` a vertical linear gradient for the sky: `#262B3C` → `#2E447B` → `#516577` over the top 55 %.
2. Ground: one or two `bezierCurveTo` hills filled `#5B363E`/`#764C4E`, occupying the bottom 45 % and the left third.
3. Moon/tombstones: `arc()` circles or `roundRect()` slabs in `#D8D8D8`‑ish at the measured blob positions, scaled from the 720×480 reference frame.
4. The android: reuse the *exact* ICS 20×24 pixel grid from §3 (it is the same bugdroid silhouette) but draw it upright, filled `#72D02F`, with a 4–6 px `#1B2A10` outline, and punch the two eye slots as black rects. Add a slight `ctx.transform(1,0,-0.05,1,0,0)` lean and desaturate/darken one arm for the "zombie" read.
5. Sprinkle ~60 tiny 2 px `#FFFFFF` dots at 10–30 % alpha for stars.
6. On `pointerup` anywhere: show a toast/HTML overlay reading **`Zombie art by Jack Larson`** for ~2 s.
7. Scale mode: `FIT_CENTER` → `const s = Math.min(w/720, h/480)`, centre it.

---

## 2. Honeycomb — Android 3.0–3.2, API 11–13

### Files
```
eggs/Honeycomb/src/main/java/com/android_h/egg/PlatLogoActivity.java
eggs/Honeycomb/src/main/java/com/android_h/egg/AndroidHoneycombEasterEgg.java
eggs/Honeycomb/src/main/java/com/android_h/egg/SnapshotProvider.java
eggs/Honeycomb/src/main/res/values/strings.xml
eggs/Honeycomb/src/main/res/drawable/h_platlogo.webp     (640x640)  <- AOSP
eggs/Honeycomb/src/main/res/drawable/h_platlogo_1.webp   (640x640)  <- NOT in AOSP
eggs/Honeycomb/src/main/res/drawable/h_android_logo.webp (300x300, repo list icon)
```

### Entry behaviour
Identical shell to Gingerbread, plus a randomiser added by this repo:

```java
mToast = Toast.makeText(this, "REZZZZZZZ...", Toast.LENGTH_SHORT);
content.setImageResource(randomPlatlogo());     // 50/50 per Activity launch
content.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
...
private int randomPlatlogo() {
    double r = Math.random();
    if (r >= 0.5) return R.drawable.h_platlogo_1;
    return R.drawable.h_platlogo;
}
```

* Tap / repeated tap / any `ACTION_UP` → toast `"REZZZZZZZ..."` (a *Tron* reference; Honeycomb's UI was Tron‑themed).
* Long‑press → nothing. **No secondary screen, no game.**
* AOSP `android-3.2.4_r1` has **no** `randomPlatlogo()` and only one `platlogo.png`; the 50/50 pick and `h_platlogo_1` are repo additions.

### Exact strings
| Source | Value |
|---|---|
| `strings.xml` `h_egg_name` | `Honeycomb` |
| Hard‑coded toast (AOSP) | `REZZZZZZZ...` |
| Timeline (API 13) | `H MR2.\nReleased publicly as Android 3.2 in July 2011.` |
| Timeline (API 12) | `H MR1.\nReleased publicly as Android 3.1 in May 2011.` |
| Timeline (API 11) | `H.\nReleased publicly as Android 3.0 in February 2011.` |

### The art — a Tron‑neon **bee with an Android head**, 640 × 640
Both variants are the same creature in two colourways. Exact measured geometry (alpha‑run analysis, symmetric about x = 320):

**`h_platlogo` (AOSP, "blue Tron bee")** — content bbox (6, 88) – (634, 602).
Palette: `#000000` (background/negative space, 33.8 %), `#00467B` dark blue fill (7.0 %, with JPEG‑free ramps `#00477C #00487D #00497E #004A7F #004B80`), `#58BAED` light blue (2.6 %), `#80CCFF` pale blue (1.2 %).

| Part | Geometry (px, 640×640 space) |
|---|---|
| Antennae | two thin strokes, y 96…120; left x 242→271, right x 385→368, converging into the head |
| Head (Android dome) | y 128…232; width grows 134 px (x 253–387) at y=128 to 239 px (x 200–439) at y=224 |
| Eyes | two Android "D" eyes at y ≈ 155…190, x ≈ 240–275 and x ≈ 375–410; fill `#00467B` with a `#58BAED` inner highlight |
| Upper wing pair | a hollow lens/vesica, y 232…312, spanning x 39…600 at y=232, widest **x 16…623 at y 272–280**, back to x 37…602 at y=312. Outline only (`#58BAED`/`#80CCFF`), interior black |
| Lower wing pair | y 320…380; x 109…530 at y=320, splitting into two tapering outlines ending in points at (147, 376) and (492, 376) |
| Abdomen | a column x ≈ 201…438 (237 px wide), y 224…512, divided into **3 filled bands** separated by black gaps: `#00467B` at y ≈ 228–275, 309–365, 405–455; each band rimmed by a 1–2 px `#58BAED` outline |
| Stinger | y 512…592, tapering from x 299–340 down to a 2 px point at x 319–320 |

**`h_platlogo_1` (repo addition, "bumblebee")** — same skeleton, content bbox (0, 37) – (640, 603).
Palette: `#050709` near‑black (33.8 %), **`#F8F068` yellow** (18.2 %, ramps `#F6F168 #F9F068 #F8F06A #F6F266`), `#58BAED` light blue outline.
Differences: antennae at y 80…88 (x 237–284 and 355–402); head dome y 88…180 (x 236–403 → 187–452); upper wings **much taller**, y 184…356, widest x 2…637 at y 240–248; abdomen bands **yellow at y 194–236, 293–331, 384–435** alternating with black at 241–292, 332–383, 436–512; stinger y 496…568 to x 319–320.

### Third‑party credit
None in the code. `"REZZZZZZZ..."` is an AOSP string (Disney/*Tron* allusion, not a legal credit). **`h_platlogo_1` has no AOSP provenance** — it is not present anywhere in `platform/frameworks/base` at `android-3.2.4_r1` (only `core/res/res/drawable-nodpi/platlogo.png` exists). Treat it as unattributed repo/fan art; if you reproduce it, credit it as "after the AOSP Honeycomb platlogo".

### Canvas 2D suggestion
Everything is flat neon fills — perfect for primitives:
1. Fill black. Optional `shadowBlur = 8; shadowColor = '#58BAED'` on the outline passes for the Tron glow.
2. Head: `ctx.beginPath(); ctx.moveTo(200,232); ctx.bezierCurveTo(200,150, 253,128, 320,128); ctx.bezierCurveTo(387,128, 439,150, 439,232); ctx.closePath()` — a半ellipse. Stroke `#58BAED` (2 px), no fill.
3. Antennae: two `moveTo/lineTo` strokes from (253,128)→(248,96) and (387,128)→(392,96), `lineCap='round'`.
4. Eyes: two `roundRect(240,155,35,35,6)` filled `#00467B`, plus a 12×12 `#58BAED` square inset at the inner‑bottom corner of each (mirrored).
5. Wings: `ellipse(320, 272, 303, 44)` **stroked only**, then a second `ellipse(320, 350, 210, 30)` stroked for the lower pair — or draw each wing as two mirrored `quadraticCurveTo` leaf shapes for the pointed tips.
6. Abdomen: three `roundRect(201, y, 237, h, 6)` filled `#00467B` (or `#F8F068`), each stroked `#58BAED`; gaps left black.
7. Stinger: `moveTo(299,512); lineTo(340,512); lineTo(320,592); closePath()` filled with the band colour, stroked light blue.
8. Draw everything through a `scale = min(w,h)/640` transform so the coordinates above work as‑is.
9. Animate nothing (the original is static) — or, for flavour, pulse the outline `globalAlpha` between 0.7 and 1.0 over 2 s.
10. On `pointerup`: toast `REZZZZZZZ...`. Randomise between the blue and yellow palettes 50/50 per screen open, exactly like `randomPlatlogo()`.

---

## 3. Ice Cream Sandwich — Android 4.0 / 4.0.3, API 14–15  →  **Nyandroid**

### Files
```
eggs/IceCreamSandwich/src/main/java/com/android_i/egg/PlatLogoActivity.java
eggs/IceCreamSandwich/src/main/java/com/android_i/egg/Nyandroid.java
eggs/IceCreamSandwich/src/main/java/com/android_i/egg/preview/PlatLogoActivity.java
eggs/IceCreamSandwich/src/main/res/drawable-anydpi/i_platlogo.xml            (VECTOR - key!)
eggs/IceCreamSandwich/src/main/res/drawable-anydpi/i_platlogo_rectangle.xml  (VECTOR - icon)
eggs/IceCreamSandwich/src/main/res/drawable/i_nyandroid_anim.xml
eggs/IceCreamSandwich/src/main/res/drawable/i_star_anim.xml
eggs/IceCreamSandwich/src/main/res/drawable/i_nyandroid00..11.webp  (320x320 each)
eggs/IceCreamSandwich/src/main/res/drawable/i_star0..5.webp         (70x70 each)
eggs/IceCreamSandwich/src/main/res/drawable-nodpi/i_platlogo_preview.png (357x439, repo extra)
eggs/IceCreamSandwich/src/main/res/values/strings.xml
eggs/IceCreamSandwich/src/main/AndroidManifest.xml   (declares <uses-permission VIBRATE/>)
```

### 3.1 Entry screen

`ImageView` + `i_platlogo` (vector), `ScaleType.CENTER_INSIDE`, no padding, transparent theme (wallpaper shows). A single `OnTouchListener` (returns `true` always):

* **`ACTION_DOWN`** → `setPressed(true)`, cancel pending callbacks, `mCount = 0`, `postDelayed(mSuperLongPress, 2 * 500 ms)` → **fires at t = 1000 ms**.
* **`ACTION_UP`** (while pressed) → unpress, cancel, `mToast.show()` where `mToast = Toast.makeText(this, "Android 4.0: Ice Cream Sandwich", Toast.LENGTH_SHORT)`.
* **`mSuperLongPress`** (repeating):
  ```java
  mCount++;
  vibrator.vibrate(50L * mCount);
  final float scale = 1f + 0.25f * mCount * mCount;
  // repo: if the drawable is a VectorDrawable it grows drawable.setBounds() symmetrically
  //       about the centre; otherwise mContent.setScaleX/Y(scale)
  if (mCount <= 3) mHandler.postDelayed(mSuperLongPress, 500);
  else { startActivity(Nyandroid.class); finish(); }
  ```

Exact schedule (verified numerically):

| t (ms after touch‑down) | mCount | vibrate | scale | result |
|---|---|---|---|---|
| 1000 | 1 | 50 ms | **1.25×** | keep holding |
| 1500 | 2 | 100 ms | **2.00×** | keep holding |
| 2000 | 3 | 150 ms | **3.25×** | keep holding |
| 2500 | 4 | 200 ms | **5.00×** | launch `Nyandroid`, `finish()` |

So: **short tap = toast; continuous hold for 2.5 s = the logo pulses 1.25 → 2 → 3.25 → 5× with four escalating buzzes, then the flying‑android screensaver starts.** Lifting the finger at any point cancels and just toasts. Repeated taps do nothing cumulative (mCount resets on each DOWN).

AOSP difference: AOSP 4.0.4 uses `Vibrator mZzz = new Vibrator()` (a stub) and launches by intent category `com.android.internal.category.PLATLOGO` → `com.android.systemui/.Nyandroid`. The repo uses `getSystemService(VIBRATOR_SERVICE)` (so the buzz is real) and a direct `Intent`, plus the `VectorDrawable` bounds branch. Timings are identical.

### 3.2 The logo vector — `i_platlogo.xml` (**the most valuable artefact in this batch**)

```xml
<vector android:width="200dp" android:height="240dp"
        android:viewportWidth="20" android:viewportHeight="24">
```

**I verified this against the AOSP original `platlogo.png` @ `android-4.0.4_r1`: the PNG is 200 × 240 px and is *pure* pixel art — a 20 × 24 grid of 10 × 10 px blocks, every block 100 % one flat colour (0 impure cells).** So the viewport is literally the pixel‑art grid and 1 viewport unit = one 10 px block.

AOSP PNG palette (exact, 6 colours only):
`#95C000` green · `#492700` chocolate · `#FFFFFF` white · `#BEBEBE` grey · `#000000` black · transparent.
The repo's **vector** substitutes `#A4C639` for the green and `#CACACA` for the grey (all other fills/strokes match). The `i_nyandroid*.webp` sprites use `#A4C639` / `#5D3300` / `#FFFFFF` / `#CACACA` / `#000000`.

**Definitive 20 × 24 grid** (legend: `.` transparent, `#` `#000000`, `G` green, `B` chocolate, `W` `#FFFFFF`, `S` grey):

```
     0123456789012345678 9      <- column index (mod 10)
 0  ....##.######.##....
 1  ....#G#GGGGGG#G#....
 2  ....##GGGGGGGG##....
 3  ....#GG##GG##GG#....
 4  ....#GGW#GGW#GG#....
 5  ...#GGGGGGGGGGGG#...
 6  ...#GGGGGGGGGGGG#...
 7  .##################.
 8  #GG#BBBBBBBBBSSB#GG#
 9  #GG#BB#BBB#BBWWB#GG#
10  #GG#BBBBBBBBBWWB#GG#
11  #GG#BBBB#BBBBWWB#GG#
12  #GG#BBBBBBBBBWWB#GG#
13  #GG#BB#BBB#BBWWB#GG#
14  #GG#BBBBBBBBBWWB#GG#
15  .###BBBB#BBBBWWB###.
16  ...#BBBBBBBBBWWB#...
17  ...#BB#BBB#BBWWB#...
18  ...#BBBBBBBBBSSB#...
19  ....############....
20  .....#GG#..#GG#.....
21  .....#GG#..#GG#.....
22  .....#GG#..#GG#.....
23  ......##....##......
```

Reading it: rows 0–6 = head (antennae are the 1‑cell green stalks at cols 5 and 14, rows 0–1; each eye is a 2×2 block at cols 7–8 / 11–12, rows 3–4 with the **white pixel in the lower‑left** of each); row 7 = the 18‑cell shoulder bar; cols 1–2 and 17–18, rows 8–14 = the two arms; cols 4–15, rows 8–18 = the torso; **cols 13–14, rows 8–18 = the ice‑cream stripe (`#FFFFFF`, with `#BEBEBE` caps at rows 8 and 18)**; the eight `#` cells inside the chocolate at (6,9) (10,9) (8,11) (6,13) (10,13) (8,15) (6,17) (10,17) = cross‑stitch zig‑zag; row 19 = hip bar; cols 6–7 and 12–13, rows 20–22 = the two legs, row 23 = the black feet.

The vector's path data encodes exactly this (useful cross‑check):
```
head fill   #A4C639  M4,1 h12 v6 h-12 z
head ink    #000 sw1 M6.5,1 v1 M5,2.5 h1 M6,0.5 h-1.5 v4.5 M7,3.5 h1.5 v1.5
                     M11,3.5 h1.5 v1.5 M7,0.5 h6 M13.5,1 v1 M14,0.5 h1.5 v4.5 M14.5,2 v1
eye glint   #FFF sw1 M7,4.5 h1 M11,4.5 h1
arm ink     #000 sw1 M0.5,8 v7 M1,15.5 h2.5 M19.5,8 v7 M19,15.5 h-2.5
arm fill    #A4C639 sw2 M2,8 v7 M18,8 v7
leg ink     #000 sw1 M5.5,23 v-3 M8.5,23 v-3 M6,23.5 h2 M11.5,23 v-3 M14.5,23 v-3 M12,23.5 h2
leg fill    #A4C639 sw2 M7,20 v3 M13,20 v3
body fill   #492700  M4,8 h12 v11.5 h-12 z
body ink    #000 sw1 M1,7.5 h18 M3.5,5 v14 M16.5,5 v14 M4,19.5 h12
stitches    #000 sw1 M6,9.5 h1 M10,9.5 h1 M8,11.5 h1 M6,13.5 h1 M10,13.5 h1 M8,15.5 h1 M6,17.5 h1 M10,17.5 h1
cream back  #CACACA sw2 M14,8 v11
cream front #FFF    sw2 M14,9 v9
```

`i_platlogo_rectangle.xml` = the identical path set wrapped in
`<group android:pivotX="12" android:pivotY="12" android:scaleX="0.86" android:scaleY="0.86" android:translateX="2">` inside a **24 × 24 viewport, 200 dp × 200 dp** — i.e. the same art occupies x 3.68…20.88, y 1.68…22.32 of a square. Used only as the launcher/list icon.

### 3.3 Nyandroid — the secondary screen

`Nyandroid` activity: `Theme.Black.NoTitleBar.Fullscreen`, `singleInstance`, `excludeFromRecents`, `hardwareAccelerated`, launcher icon `i_nyandroid04`. `onStart` adds `FLAG_ALLOW_LOCK_WHILE_SCREEN_ON | FLAG_SHOW_WHEN_LOCKED`. **`onUserInteraction()` → `finish()`** (any touch/key exits).

`Board extends FrameLayout`:
* `setLayerType(LAYER_TYPE_HARDWARE)`, `SYSTEM_UI_FLAG_LOW_PROFILE | SYSTEM_UI_FLAG_HIDE_NAVIGATION`, `isOpaque() = true`.
* **Background: `setBackgroundColor(0xFF003366)` → `#003366`** (dark navy).
* `onSizeChanged` → `post(postStart)` → `reset(); mAnim.start();` (a `TimeAnimator`).
* Constants: `FIXED_STARS = true`, `NUM_CATS = 20`, `FlyingCat.VMAX = 1000.0f`, `FlyingCat.VMIN = 100.0f`.
* Helpers: `lerp(a,b,f) = (b-a)*f+a`, `randfrange(a,b) = lerp(a,b,rand())`.

**Stars** — 20 of them, created once in `reset()`:
* `ImageView` with `i_star_anim`, `WRAP_CONTENT`.
* `scale = randfrange(0.1f, 1f)` applied to X and Y.
* `x = randfrange(0, boardWidth)`, `y = randfrange(0, boardHeight)` — **static, they never move**.
* every frame's `BitmapDrawable.setTargetDensity(480)`.
* `postDelayed(anim::start, (int) randfrange(0, 1000))` → each star's twinkle starts on a random 0–1000 ms phase.
* Animation: `i_star_anim.xml`, `oneshot="false"`, **6 frames × 200 ms = 1200 ms loop**.

**Flying cats** — `NUM_CATS = 20`, created in `reset()`, index `i = 0…19`:
```java
nv.z = ((float) i / NUM_CATS);   // 0, 0.05, ... 0.95
nv.z *= nv.z;                    // z = (i/20)^2  -> 0 ... 0.9025
nv.reset();
nv.setX(randfrange(0, boardWidth));   // scatter across the screen initially
postDelayed(anim::start, (int) randfrange(0, 1000));
```
`FlyingCat.reset()`:
```java
scale = lerp(0.1f, 2f, z);            // 0.1 ... 1.905
setScaleX/Y(scale);
setX(-scale * getWidth() + 1);        // just off the left edge
setY(randfrange(0, boardHeight - scale * getHeight()));
v = lerp(VMIN, VMAX, z);              // 100 ... 905 px/s, CONSTANT (no accel, no gravity)
dist = 0;
```
`FlyingCat.update(dt)`: `dist += v*dt; setX(getX() + v*dt);` — pure rightward translation, **y never changes**.

Per `TimeAnimator` tick (`dt = deltaTime/1000f`): update every cat, then recycle it when
`x + w*scale < -2 || x > boardW + 2 || y + h*scale < -2 || y > boardH + 2`.

* Cat animation: `i_nyandroid_anim.xml`, `oneshot="false"`, **12 frames × 80 ms = 960 ms loop**.
* Density: all frames `setTargetDensity(480)` ⇒ a 320 px sprite has an intrinsic size of **320/3 = 106.67 dp** (drawn size = `320 * deviceDensity/480 * scale` px). The visible art inside the 320 px frame occupies cells 4…27 × 7…26 → **240 × 200 px = 80 × 66.7 dp**.
* Net effect: 20 cats in 20 discrete depth layers, `scale ∈ {0.1 … 1.905}`, `v ∈ {100 … 905 px/s}`, so tiny distant cats crawl and big near ones streak. There is no spawn rate — the population is fixed at 20 and each is recycled the moment it exits.

### 3.4 Nyandroid sprite geometry — solved exactly

**Frame 4 (`i_nyandroid04.webp`) is a bit‑exact 90°‑clockwise rotation of the AOSP ICS platlogo pixel art**, verified cell‑by‑cell: **480/480 cells match, zero mismatches**, placed at cell offset (row 7, col 4) of the 32 × 32 cell (320 × 320 px) frame. There are **no cat ears and no tail** — the two prongs that look like ears at the leading edge are the android's antennae, now pointing forward. "Nyandroid" is a pun, not a cat.

Rotated base pose (24 cols × 20 rows of 10 px cells; same legend, sprite palette `G=#A4C639`, `B=#5D3300`, `S=#CACACA`, `W=#FFFFFF`, `#=#000000`):

```
   .........#######........
   ........#GGGGGGG#.......
   ........#GGGGGGG#.......
   .....##############.....
   ....#BBBBBBBBBBB#GG#####
   .####BBBBBBBBBBB#GGGG#G#
   #GGG#B#BBB#BBB#B#GGGGG#.
   #GGG#BBBBBBBBBBB#GGW#GG#
   .####BBB#BBB#BBB#GG##GG#
   ....#BBBBBBBBBBB#GGGGGG#
   ....#B#BBB#BBB#B#GGGGGG#
   .####BBBBBBBBBBB#GGW#GG#
   #GGG#BBBBBBBBBBB#GG##GG#
   #GGG#SWWWWWWWWWS#GGGGG#.
   .####SWWWWWWWWWS#GGGG#G#
   ....#BBBBBBBBBBB#GG#####
   .....##############.....
   ........#GGGGGGG#.......
   ........#GGGGGGG#.......
   .........#######........
```
(legs at the left, chocolate torso in the middle with the cream stripe as the horizontal `SWWWWWWWWWS` rows, head at the right with the two antennae prongs and one `W` eye cell per eye.)

**The other 11 frames** are the same artwork with a hand‑authored ±1‑cell (±10 px ≈ 3 % of the sprite) "boil":
* Frame content bboxes: f00 (40,60)-(280,270); f01 (40,60)-(290,260); f02 (40,60)-(290,270); f03 (70,70)-(290,270)→ cell rows 7..26; f04/f05 (70,70)-(280,270); f06 ≡ f00; f07 ≡ f01; f08 ≡ f02; f09 ≡ f03; f10/f11 ≡ f05.
* Centroid path (px): f0 (165.2,162.7) → f1 (169.9,159.5) → f2 (170.0,166.4) → f3 (169.9,169.5) → f4 (165.6,169.5) → f5 (166.2,167.0) → f6 (166.3,162.7) → repeats. Principal axis oscillates −8.8° … +4.5°, so it also rocks slightly.
* **Blink**: pure‑white pixel count is 2000 in frames 0–9 and **1800 in frames 10 and 11** — exactly the two 10×10 eye‑highlight cells removed. Frame 10 vs frame 4 differs in only **6 cells**, all of them the eye/outline cells.
* Frame order is `00,01,…,11` at 80 ms each, so the blink lands at 800–960 ms of every 960 ms loop.

**Star sprites** (`i_star0..5.webp`, 70 × 70, pure `#FFFFFF`, on a 7 × 7 grid of 10 px cells) — an expanding twinkle, all cells fully opaque or fully transparent:

```
frame 0  (completely empty)
frame 1                     frame 2                     frame 3
      . . . . . . .               . . . . . . .               . . . . . . .
      . . . . . . .               . . . . . . .               . . X . . . .
      . . . . . . .               . . . X . . .               . . X . . . .
      . . . X . . .               . . X X X . .               X X . X . X X
      . . . . . . .               . . . X . . .               . . X . . . .
      . . . . . . .               . . . . . . .               . . X . . . .
      . . . . . . .               . . . . . . .               . . . . . . .

frame 4                     frame 5
      . . X . . . .               . . X . . . .
      . . X . . . .               . X . . . X .
      . . . . . . .               . . . . . . .
      X X . X . X X               X . . . . . X
      . . . . . . .               . . . . . . .
      . . X . . . .               . X . . . X .
      . . X . . . .               . . X . . . .
```
Opaque pixel counts 0 / 100 / 400 / 800 / 900 / 800. `setTargetDensity(480)` ⇒ 70 px = **23.33 dp** intrinsic; with `scale ∈ [0.1, 1.0]` the on‑screen star is 2.3 – 23.3 dp.

### 3.5 `preview/PlatLogoActivity` (repo extra, "ICS Preview")
Static `ImageView` + `i_platlogo_preview.png` (357 × 439, bbox (6,3)–(354,434)), `CENTER_INSIDE`, toast `"REZZZZZZZ..."` on every `ACTION_UP`. Palette: `#000000` 58.4 %, `#804000` 9.6 %, `#FFFFFF` 9.6 %, `#C0C0C0` 4.7 %, `#00FF00` 1.2 % — a heavy black‑outlined cartoon of the same ice‑cream‑sandwich android (two antennae at the top converging at y≈90, brown torso y≈99–225, white/silver cream band y≈225–340, black base y≈340–432). No game.

### 3.6 Exact strings
| Source | Value |
|---|---|
| `i_egg_name` | `Nyandroid` |
| `i_android_nickname` (`translatable="false"`) | `Ice Cream Sandwich` |
| `i_preview_nickname` (`translatable="false"`) | `ICS Preview` |
| Hard‑coded toast | `Android 4.0: Ice Cream Sandwich` |
| Timeline (API 15) | `I MR1.\nReleased publicly as Android 4.03 in December 2011.` |
| Timeline (API 14) | `I.\nReleased publicly as Android 4.0 in October 2011.` |

### 3.7 Third‑party credit
None. All art is AOSP/Google. Note the repo replaced the AOSP PNG with its own vector (`#A4C639`/`#CACACA` instead of AOSP `#95C000`/`#BEBEBE`) — decide which palette you want and say so.

### 3.8 Canvas 2D suggestion
**PlatLogo screen**
1. Hard‑code the 20 × 24 grid above as a `string[]`; render with `ctx.fillRect(col*u, row*u, u, u)` where `u = min(w/20, h/24)`. Snap `u` to an integer and centre for crisp pixels; set `imageSmoothingEnabled = false`. This is *exactly* the AOSP art.
2. Keep one `scale` variable. On `pointerdown` record `t0`; run a timer at `t0+1000`, `+1500`, `+2000`, `+2500` ms setting `scale = 1 + 0.25*n²` (n = 1…4) and firing `navigator.vibrate(50*n)`; at n = 4 switch scenes. Redraw with `ctx.translate(cx,cy); ctx.scale(s,s); ctx.translate(-cx,-cy)`.
3. On `pointerup` before 1000 ms → toast `Android 4.0: Ice Cream Sandwich`.

**Nyandroid screen**
1. `fillStyle = '#003366'; fillRect(0,0,w,h)` once per frame (opaque).
2. Pre‑render the 24 × 20 rotated grid **once** into an offscreen canvas (240 × 200 px). Per frame `drawImage` it — do not re‑run 480 `fillRect`s × 20 cats.
3. Wobble: store `t`; use `ox = 10 * Math.round(Math.sin(t/960*2π))`, `oy = 10 * Math.round(Math.cos(t/960*4π))` in *sprite* pixels to mimic the ±1‑cell boil. Blink: when `(t % 960) >= 800`, draw a second offscreen variant whose two `W` eye cells are `G` (or just `fillRect` green over them).
4. 20 cats: `z = (i/20)**2`, `scale = 0.1 + 1.9*z`, `v = 100 + 900*z` px/s, `y = rand(0, h - 200*scale)` once at spawn, `x += v*dt`. Recycle when `x > w + 2` → `x = -240*scale - 2`, new random `y`.
5. 20 stars: fixed `x,y`, `s = 0.1 + rand()*0.9`; twinkle = a 1200 ms cycle with a random start phase; draw the 5 non‑empty frames as `fillRect` crosses on a 10 px cell grid scaled by `s * (70/ (7*10))`. Cheap alternative: draw a plus‑sign with two rects and lerp the arm length 0 → 3 cells → 0 over the cycle.
6. Exit the scene on any `pointerdown`/`keydown` (mirrors `onUserInteraction → finish`).
7. Use `requestAnimationFrame` with `dt = (now - last)/1000`, clamped to ≤ 0.05 s.

---

## 4. Jelly Bean — Android 4.1–4.3, API 16–18  →  **BeanBag / BeanFlinger**

### Files
```
eggs/JellyBean/src/main/java/com/android_j/egg/PlatLogoActivity.java
eggs/JellyBean/src/main/java/com/android_j/egg/BeanBag.java
eggs/JellyBean/src/main/java/com/android_j/egg/BeanBagDream.java
eggs/JellyBean/src/main/res/values/strings.xml
eggs/JellyBean/src/main/res/drawable/j_platlogo.webp       (768x768)  <- AOSP platlogo.png
eggs/JellyBean/src/main/res/drawable/j_platlogo_alt.webp   (768x768)  <- AOSP platlogo_alt.png
eggs/JellyBean/src/main/res/drawable/j_redbean0.webp       (256x256)
eggs/JellyBean/src/main/res/drawable/j_redbean1.webp       (256x256)
eggs/JellyBean/src/main/res/drawable/j_redbean2.webp       (256x256)
eggs/JellyBean/src/main/res/drawable/j_redbeandroid.webp   (256x256)
eggs/JellyBean/src/main/res/drawable/j_jandycane.webp      (131x256)
eggs/JellyBean/src/main/res/drawable/j_android_logo.webp   (300x300, repo list icon)
```

### 4.1 Entry screen
`ImageView` + **`j_platlogo_alt`**, `ScaleType.CENTER_INSIDE`, **padding `32 * density` on all four sides** (32 dp). Transparent theme → the wallpaper shows behind the bean.

* **Click** → `mToast.show()` **and** `mContent.setImageResource(R.drawable.j_platlogo)` — the plain bean is swapped for the bean **with a face**. The swap is one‑way and permanent for the lifetime of the Activity (subsequent clicks just re‑toast).
* **Long‑press** → `startActivity(BeanBag.class)` + `finish()`. On `ActivityNotFoundException`: `Log.e("PlatLogoActivity", "Couldn't find a bag of beans.")`.

The toast has a **custom view** (`mToast.setView(makeView())`, `LENGTH_LONG`), built entirely in code:

```
LinearLayout(VERTICAL, WRAP_CONTENT, WRAP_CONTENT)      // repo comments out AOSP's 8dp padding
  TextView#1  typeface "sans-serif-light" NORMAL
              textSize = 1.25f * (14 * density)   -> 17.5 (sp units via setTextSize(float))
              textColor 0xFFFFFFFF
              setShadowLayer(4*density, 0, 2*density, 0x66000000)
              text = "Android 4." + (new Random().nextInt(3) + 1)   // "Android 4.1" | "4.2" | "4.3"
              gravity CENTER
              LayoutParams(WRAP,WRAP) gravity=CENTER_HORIZONTAL bottomMargin = -4*density
  TextView#2  typeface "sans-serif" BOLD
              textSize = 14 * density  (sp via setTextSize(float))
              textColor 0xFFFFFFFF, same shadowLayer
              text = "JELLY BEAN"
              same LayoutParams (gravity CENTER_HORIZONTAL, bottomMargin -4dp)
```
AOSP uses `"Android " + Build.VERSION.RELEASE`; the repo randomises the minor version because it runs on any API level.

### 4.2 The two platlogo bitmaps (768 × 768)
Both are the same **red jelly bean**, tilted, with the long axis running lower‑left → upper‑right:

| | `j_platlogo_alt` | `j_platlogo` |
|---|---|---|
| alpha bbox | (15, **169**) – (745, 652) | (15, **107**) – (745, 652) |
| `#FF0000` | 63.4 % | 59.8 % |
| `#000000` | 12.4 % | 15.7 % |
| `#7F0000` | 7.2 % | 7.0 % |
| `#800000` | 5.3 % | 5.6 % |
| `#810000` | 5.1 % | 4.9 % |
| `#FF7F7F` | 1.6 % | 1.55 % |
| `#FFFFFF` | 1.4 % | 1.5 % |

Shared body: bright red `#FF0000`, dark‑red shading `#7F0000`/`#800000`/`#810000` along the lower‑right rim, specular highlight `#FFFFFF`→`#FF7F7F`→`#FF8080` in the upper‑left, 2–6 % black `#000000` outline.

**`j_platlogo` = `j_platlogo_alt` + 5 black `#000000` features** (pixel‑diffed; 15 317 differing pixels in 7 components):

| Feature | bbox (px) | Size | Shape |
|---|---|---|---|
| Right antenna | (552,107)–(618,216) | 67 × 110 | hollow stalk, black outline with red/white interior, rising from the bean's upper‑right shoulder |
| Left antenna | (86,177)–(167,261) | 82 × 85 | same construction, rising up‑left from the bean's left edge |
| Left eye | (204,337)–(291,388) | 88 × 52 | thick crescent, convex up‑right, open at the bottom‑right → a closed happy `⌢` eye |
| Right eye | (423,314)–(495,350) | 73 × 37 | same `⌢` crescent, higher and further right |
| Mouth | (307,448)–(412,491) | 106 × 44 | crescent sweeping from upper‑right (x≈400,y≈452) down‑left to (x≈310,y≈470) then thickening rightwards along y≈474–490 → a wide smile |

So: **tap makes the bean grin** (two antennae + two `⌢` eyes + a smile). This is the same mascot as `j_redbeandroid` and `j_android_logo`.

### 4.3 Bean sprite geometry (`j_redbean0`, 256 × 256)
Content bbox **(5, 56) – (247, 216) = 243 × 161 px**. Silhouette row extents (every 8 px) — normalise to this bbox to draw it:

| y | t=(y−56)/161 | x_left | x_right | width |
|---|---|---|---|---|
| 56 | 0.00 | 131 | 149 | 19 |
| 64 | 0.05 | 86 | 188 | 103 |
| 72 | 0.10 | 66 | 206 | 141 |
| 80 | 0.15 | 52 | 217 | 166 |
| 88 | 0.20 | 41 | 225 | 185 |
| 96 | 0.25 | 32 | 232 | 201 |
| 104 | 0.30 | 25 | 237 | 213 |
| 112 | 0.35 | 19 | 241 | 223 |
| 120 | 0.40 | 14 | 245 | 232 |
| 128 | 0.45 | 10 | 246 | 237 |
| 136 | 0.50 | 8 | 247 | 240 |
| 144 | 0.55 | 6 | 247 | 242 |
| 152 | 0.60 | 5 | 247 | **243** (widest) |
| 160 | 0.65 | 5 | 244 | 240 |
| 168 | 0.70 | 6 | 241 | 236 |
| 176 | 0.75 | 8 | 236 | 229 |
| 184 | 0.80 | 11 | 229 | 219 |
| 192 | 0.85 | 15 | 220 | 206 |
| 200 | 0.90 | 21 | 209 | 189 |
| 208 | 0.95 | 30 | 107 | 78 |
| 216 | 1.00 | 53 | 73 | 21 |

→ an asymmetric kidney: a broad rounded top‑right lobe and a tapered tail curling to the bottom‑left.
* Specular highlight: pure `#FFFFFF`, bbox **(64, 73) – (120, 100)**, 338 px — an elongated blob in the upper‑left.
* Shading: `#800000`, bbox (28, 73) – (233, 208), 3385 px — a crescent hugging the lower/right rim.
* `j_redbean1` and `j_redbean2` are **the same bitmap**: only 953 and 429 pixels out of 30 614 differ, all sub‑pixel anti‑aliasing. You only need one bean shape.
* `j_redbeandroid` (bbox (4,35)–(249,218)) = the same bean **plus** two antennae (a stalk at x≈192–216, y≈40–64 and a smaller one at x≈32–56, y≈56–72) and two black eyes (x≈144–160,y≈104 and x≈64–88,y≈112) plus mouth marks at (104,152) and (128,152).
* `j_jandycane` (131 × 256, bbox (3,5)–(131,256)): a **candy cane** — a straight shaft on the right (x ≈ 90–126) from y=6 down to y≈186, then a crook curving down‑left to (x ≈ 6–120, y ≈ 186–250). Diagonal stripes alternate `#FF0000` and `#FFFFFF` about every 30 px, with `#C0C0C0` shading and a `#000000` outline. Palette: `#FF0000` 23.5 %, `#FFFFFF` 22.6 %, `#000000` 13.1 %, `#C0C0C0` 1.2 %.

### 4.4 BeanBag — the secondary screen (mechanics in full)

Activity: `Theme.Wallpaper.NoTitleBar.Fullscreen`, `singleInstance`, `excludeFromRecents`, `hardwareAccelerated`, icon `j_redbean2`, label `BeanBag`. `onStart` adds `FLAG_ALLOW_LOCK_WHILE_SCREEN_ON | FLAG_SHOW_WHEN_LOCKED` and (repo/AOSP 4.2+) enables the `BeanBagDream` component — the commented `// ACHIEVEMENT UNLOCKED`.

`Board extends FrameLayout`: `SYSTEM_UI_FLAG_LOW_PROFILE`, `setWillNotDraw(!DEBUG)`, **`isOpaque() = false`** → **the board is transparent; the beans fly over the user's live wallpaper.** `startAnimation()` posts `reset()` on first call; `onPause`/`onResume` stop/start; `onDetachedFromWindow` stops.

Constants:
```java
static int   NUM_BEANS   = 40;
static float MIN_SCALE   = 0.2f;
static float MAX_SCALE   = 1f;
static float LUCKY       = 0.001f;
static int   MAX_RADIUS  = (int)(576 * MAX_SCALE);   // 576
public static final float VMAX = 1000.0f;            // declared, never used for beans
public static final float VMIN = 100.0f;             // declared, never used for beans
```

Weighted sprite table (`pickInt` = uniform over the array):
```java
BEANS = { redbean0, redbean0, redbean0, redbean0,   // 4/9
          redbean1, redbean1,                       // 2/9
          redbean2, redbean2,                       // 2/9
          redbeandroid };                           // 1/9
```
Since redbean0/1/2 are visually identical, that is **8/9 plain bean, 1/9 bean‑with‑face**. Then:
```java
if (randfrange(0,1) <= LUCKY /*0.001*/) beanId = R.drawable.j_jandycane;   // 0.1 % candy cane
```

Tint palette (`COLORS`, 13 entries, uniform pick):
```
#00CC00  #CC0000  #0000CC  #FFFF00  #FF8000  #00CCFF  #FF0080
#8000FF  #FF8080  #8080FF  #B0C0D0  #DDDDDD  #333333
```
(all used with alpha `FF`.)

**Tinting algorithm** — a `ColorMatrixColorFilter` on a hardware layer:
```java
M[0]  = ((color & 0x00FF0000) >> 16) / 255f;   // R' = Rr/255 * R_in
M[5]  = ((color & 0x0000FF00) >>  8) / 255f;   // G' = Gg/255 * R_in + G_in
M[10] = ((color & 0x000000FF))       / 255f;   // B' = Bb/255 * R_in + B_in
                                               // A' = A_in   (identity)
setLayerType(LAYER_TYPE_HARDWARE, (beanId == j_jandycane) ? null : pt);
```
i.e. **the sprite's red channel is used as the intensity ramp for the chosen colour** ("we assume the color information is in the red channel"). Consequences, given the bean art:
`#FF0000` body → exactly the chosen colour; `#800000` shadow → half the chosen colour; `#FFFFFF` highlight → `(Rr, min(255, Gg+255), min(255, Bb+255))` = a pale tint of it; `#000000` outline → stays black. **The candy cane gets `null` paint, so it keeps its native red/white.**

Per‑bean state and `reset()`:
```java
pickBean();                                        // sprite + tint
scale = lerp(MIN_SCALE, MAX_SCALE, z);             // z = (i/40)^2, so 0.2 ... 1.0
setScaleX/Y(scale);
r  = 0.3f * Math.max(h, w) * scale;                // h,w = RAW bitmap px (256) -> r = 76.8*scale
a  = randfrange(0, 360);                           // degrees
va = randfrange(-30, 30);                          // deg / s
vx = randfrange(-40, 40) * z;                      // px / s
vy = randfrange(-40, 40) * z;                      // px / s
if (flip()) {   // enter horizontally
    x = (vx < 0 ? boardW + 2*r : -r*4f);
    y = randfrange(0, boardH - 3*r)*0.5f + ((vy < 0) ? boardH*0.5f : 0);
} else {        // enter vertically
    y = (vy < 0 ? boardH + 2*r : -r*4f);
    x = randfrange(0, boardW - 3*r)*0.5f + ((vx < 0) ? boardW*0.5f : 0);
}
```
The initial `reset()` loop then **overrides** `x = randfrange(0, boardWidth)`, `y = randfrange(0, boardHeight)` so the first 40 beans are scattered, not streamed in.

`update(dt)`:
```java
if (grabbed) {
    vx = vx*0.75f + ((grabx - x)/dt)*0.25f;   x = grabx;
    vy = vy*0.75f + ((graby - y)/dt)*0.25f;   y = graby;
} else {
    x += vx*dt;  y += vy*dt;  a += va*dt;     // NO gravity, NO drag, NO bouncing
}
```
Per frame the view is written back as `setRotation(a); setX(x - pivotX); setY(y - pivotY);` → **`(x, y)` is the bean's rotation centre (its view pivot), not its top‑left.**

Recycle test (per frame, per bean):
```java
if (x < -576 || x > boardW + 576 || y < -576 || y > boardH + 576) reset();
```

Collisions: the double loop computes `final float overlap = nv.overlap(nv2);` where
`overlap(other) = mag(x-other.x, y-other.y) - r - other.r` — **and then discards it.** Beans pass straight through each other. (Reproduce that; adding collisions would be unfaithful.)

Touch handling (per bean; `onTouchEvent` returns `true`):
* `ACTION_DOWN` → **repo addition**: `isTouchedBean(e)` samples the backing bitmap at the touch point and returns `false` if `Color.alpha == 0`, so you must hit the bean, not its bounding box. Then `grabbed = true`, `grabx_offset = rawX - x`, `graby_offset = rawY - y`, `va = 0`, falls through into MOVE.
* `ACTION_MOVE` → `grabx = rawX - grabx_offset`, `graby = rawY - graby_offset`, `grabtime = eventTime`.
* `ACTION_UP` / `ACTION_CANCEL` → `grabbed = false`; then
  ```java
  float a = randsign() * clamp(mag(vx, vy) * 0.33f, 0, 1080f);
  va = randfrange(a * 0.5f, a);      // fling spin proportional to throw speed, ±, up to 1080 deg/s
  ```
  The linear velocity is whatever the drag EMA left behind, so **throwing a bean flings it and spins it**; there is no gravity, so it keeps going until it exits the ±576 px margin and respawns.

Density: `bean.setTargetDensity(480)` ("fix Bean size") ⇒ a 256 px bean is **85.33 dp** intrinsic; visible art 243 × 161 px = **81 × 53.7 dp**; at `scale ∈ [0.2, 1.0]` that's 17 – 85 dp on screen. The candy cane is 131 × 256 px = **43.7 × 85.3 dp**.

`DEBUG` mode (off) would stroke `#FFFF0000` 4 px around the board and `#FFFFCC00` 1 px circles of radius `r` + a heading line per bean.

`BeanBagDream` (`DreamService`, `enabled=false` until unlocked, label `BeanFlinger`) simply hosts `BeanBag.Board` with `setInteractive(false)`, `setFullscreen(true)`.

### 4.5 Exact strings
| Source | Value |
|---|---|
| `j_egg_name` | `BeanBag` |
| `j_jelly_bean_dream_name` (comment: "Name of the Jelly Bean platlogo screensaver") | `BeanFlinger` |
| `j_android_nickname` (`translatable="false"`) | `Jelly Bean` |
| Toast line 1 | `"Android 4." + (Random.nextInt(3)+1)` → `Android 4.1` / `Android 4.2` / `Android 4.3` |
| Toast line 2 | `JELLY BEAN` |
| Log on failure | `Couldn't find a bag of beans.` |
| Timeline (API 18) | `J MR2.\nReleased publicly as Android 4.3 in July 2013.` |
| Timeline (API 17) | `J MR1.\nReleased publicly as Android 4.2 in November 2012.` |
| Timeline (API 16) | `J.\nReleased publicly as Android 4.1 in July 2012.` |

### 4.6 Exact dimensions
Only from code (no dimens.xml): toast text 14 dp base and 17.5 dp (1.25×); text shadow radius 4 dp, dy 2 dp, colour `0x66000000`; TextView bottomMargin −4 dp; ImageView padding 32 dp; AOSP toast container padding 8 dp (commented out in the repo).

### 4.7 Third‑party credit
None in code. The candy cane sprite is credited in the KitKat source as `// thx nes` (see §5), so the same artist's `j_jandycane` here is presumably also "nes". The bean‑with‑face mascot is AOSP/Google.

### 4.8 Canvas 2D suggestion
**PlatLogo**
1. Bean path: build one `Path2D` from the 21 row‑extent samples above (mirror the left column up, the right column down, close), scaled into a 243 × 161 box, `CENTER_INSIDE` fitted with 32 dp of padding.
2. Fill `#FF0000`; overlay a lower‑right crescent in `#800000` (clip to the bean path and fill an offset copy of it); overlay an upper‑left ellipse highlight `#FFFFFF` at (59,17)–(115,44) in bean‑local coords, then a softer `#FF7F7F` ring around it; stroke `#000000` ~6 px (relative to 768) around the outside.
3. Face layer, drawn only after the first click: two antennae as `roundRect`/tapered quads with a black outline and red fill at the two measured bboxes; two eyes as thick `arc()` crescents (stroke `lineWidth ≈ 14`, `lineCap='round'`, arc from ~200° to ~340°); one smile as a wider `arc()` crescent below. All `#000000`.
4. Toast = an HTML/CSS pill: two centred lines, 17.5 px light + 14 px bold white with `text-shadow: 0 2px 4px rgba(0,0,0,0.4)`, lines pulled 4 px together (`margin-bottom:-4px`).

**BeanBag**
1. Transparent canvas over your wallpaper/background image (the original is `isOpaque()==false`).
2. Pre‑render **one bean shape per tint** into an offscreen canvas. Emulate the ColorMatrix cheaply: draw the bean silhouette in the tint colour, then a half‑alpha tint crescent for the `#800000` shadow, then a near‑white tint‑mixed highlight, then a black outline. Or, exactly: keep a greyscale "red‑channel" bean mask and do `out = tint * (mask/255)` per pixel once at load.
3. 40 beans, `z = (i/40)**2`, `scale = 0.2 + 0.8*z`, `vx,vy = rand(-40,40)*z` px/s, `a = rand(0,360)`, `va = rand(-30,30)` deg/s. Sprite draw size = `243 * scale` × `161 * scale` dp (use 85.33 dp = the 256 px sprite at density 480 as the reference box).
4. Frame loop: `x += vx*dt; y += vy*dt; a += va*dt;` then `ctx.save(); ctx.translate(x,y); ctx.rotate(a*Math.PI/180); ctx.drawImage(sprite, -w/2, -h/2, w, h); ctx.restore();` Recycle at ±576 px outside the viewport.
5. Pointer: hit‑test with `ctx.isPointInPath(beanPath, px, py)` (that reproduces the transparent‑pixel filter). While dragging, `vx = vx*0.75 + ((grabX - x)/dt)*0.25; x = grabX;` (same for y) and `va = 0`. On release, `const s = Math.sign(Math.random()-0.5) * Math.min(Math.hypot(vx,vy)*0.33, 1080); va = s*(0.5 + Math.random()*0.5);`
6. Give the candy cane a 0.1 % spawn chance and **do not tint it**.

---

## 5. KitKat — Android 4.4 / 4.4W, API 19–20  →  **Dessert Case**

### Files
```
eggs/KitKat/src/main/java/com/android_k/egg/PlatLogoActivity.java
eggs/KitKat/src/main/java/com/android_k/egg/DessertCase.java
eggs/KitKat/src/main/java/com/android_k/egg/DessertCaseView.java
eggs/KitKat/src/main/java/com/android_k/egg/DessertCaseDream.java
eggs/KitKat/src/main/java/com/android_k/egg/preview/PlatLogoActivity.java
eggs/KitKat/src/main/res/values/strings.xml          (also holds the only <dimen>)
eggs/KitKat/src/main/res/values/resources.xml        (<color> only)
eggs/KitKat/src/main/res/values-night/resources.xml
eggs/KitKat/src/main/res/drawable-anydpi/k_android_logo_2014_2015.xml   (VECTOR wordmark)
eggs/KitKat/src/main/res/drawable/k_platlogo.webp                       (920x546)  <- AOSP
eggs/KitKat/src/main/res/drawable/k_dessert_*.webp  (17 files, 512x512) <- AOSP
eggs/KitKat/src/main/res/drawable-nodpi/k_platlogo_preview.webp (800x800, repo extra)
eggs/KitKat/src/main/res/drawable/k_android_logo.webp (192x192, repo extra)
```

### 5.1 Exact colours / dimensions from resources
```xml
<!-- res/values/resources.xml -->        <color name="k_android_logo_color">#000</color>
<!-- res/values-night/resources.xml -->   <color name="k_android_logo_color">#FFF</color>
<!-- res/values/strings.xml -->           <dimen name="k_dessert_case_cell_size">192dp</dimen>
```
```java
static final int BGCOLOR = 0xffed1d24;      // PlatLogoActivity  -> #ED1D24 (KitKat red)
mContent.setBackgroundColor(0xC0000000);    // 75 % black scrim over the wallpaper
letter.setTextColor(0xFFFFFFFF);
tv.setTextColor(0xFFFFFFFF);
// preview variant only:
letter.setShadowLayer(12*density, 0, 0, 0xC085F985);
tv.setShadowLayer(4*density, 0, 2*density, 0x66000000);
```
AOSP `packages/SystemUI/res/values/dimens.xml` confirms `<dimen name="dessert_case_cell_size">192dp</dimen>`.

### 5.2 Entry screen — the full view tree
`FrameLayout mContent`, background `0xC0000000`, children added in this z‑order:

| # | View | Properties |
|---|---|---|
| 1 | `View bg` | `setBackgroundColor(0xffed1d24)`, `setAlpha(0f)` — full‑screen KitKat red, initially invisible |
| 2 | `TextView letter` | `sans-serif` **BOLD**, `setTextSize(300)` (sp), `#FFFFFFFF`, gravity CENTER, text **`"K"`** (AOSP: `String.valueOf(Build.ID).substring(0,1)`), LayoutParams WRAP/WRAP gravity CENTER |
| 3 | `ImageView logo` | `k_platlogo`, `CENTER_INSIDE`, `setVisibility(INVISIBLE)`, LayoutParams WRAP/WRAP gravity CENTER |
| 4 | `TextView tv` | `sans-serif-light` NORMAL, `setTextSize(30)` (sp), padding `4*density` all round, `#FFFFFFFF`, gravity CENTER, `AllCapsTransformationMethod`, text **`"Android 4.4"`** → renders **`ANDROID 4.4`** (AOSP: `"Android " + Build.VERSION.RELEASE`), `INVISIBLE`; LayoutParams copied from `lp` with `gravity = BOTTOM | CENTER_HORIZONTAL` and `bottomMargin = 10 * p = 40 dp` |

**Click on `mContent`** (counter `clicks` local to the listener):
```java
clicks++;
if (clicks >= 6) { mContent.performLongClick(); return; }   // 6 taps == one long press
letter.animate().cancel();
final float offset = (int) letter.getRotation() % 360;      // NOTE: int cast truncates
letter.animate()
      .rotationBy((Math.random() > 0.5f ? 360 : -360) - offset)
      .setInterpolator(new DecelerateInterpolator())
      .setDuration(700).start();
```
→ **each of the first 5 taps spins the giant white "K" a full ±360° in 700 ms with `DecelerateInterpolator` (`f(t) = 1-(1-t)²`), direction random, snapping to a whole multiple of 360°. The 6th tap triggers the long‑press reveal.**

**Long‑press on `mContent`** (only while `logo` is not VISIBLE; otherwise returns `false`):
```java
bg.setScaleX(0.01f);
bg.animate().alpha(1f).scaleX(1f).setStartDelay(500).start();                  // default 300 ms duration
letter.animate().alpha(0f).scaleY(0.5f).scaleX(0.5f).rotationBy(360)
        .setInterpolator(new AccelerateInterpolator()).setDuration(1000).start();
logo.setAlpha(0f); logo.setVisibility(VISIBLE); logo.setScaleX(0.5f); logo.setScaleY(0.5f);
logo.animate().alpha(1f).scaleX(1f).scaleY(1f)
        .setDuration(1000).setStartDelay(500)
        .setInterpolator(new AnticipateOvershootInterpolator()).start();
tv.setAlpha(0f); tv.setVisibility(VISIBLE);
tv.animate().alpha(1f).setDuration(1000).setStartDelay(1000).start();
```
Timeline of the reveal:

| t | what |
|---|---|
| 0 ms | `K` starts shrinking to 0.5× + fading + spinning another 360°, `AccelerateInterpolator` (`t²`), 1000 ms |
| 500 ms | red `#ED1D24` background expands from `scaleX = 0.01` to `1.0` and fades 0→1 (300 ms); the logo starts appearing at 0.5× |
| 500–1500 ms | logo scales 0.5 → 1.0 and alpha 0 → 1 with `AnticipateOvershootInterpolator` (tension 2.0 ⇒ s = 3.40316; undershoot to **−0.1506** and overshoot to **1.1506**; `f(t) = 0.5·a(2t,s)` for t<0.5, else `0.5·(o(2t−2,s)+2)` with `a(t,s)=t²((s+1)t−s)`, `o(t,s)=t²((s+1)t+s)`) |
| 1000–2000 ms | `ANDROID 4.4` fades in at the bottom |

**Long‑press on `logo`** (a separate listener, only reachable after the reveal):
```java
if (SpUtils.getLong(ctx, "k_egg_mode", 0) == 0)
    SpUtils.putLong(ctx, "k_egg_mode", System.currentTimeMillis());  // AOSP: Settings.System.EGG_MODE
startActivity(new Intent(this, DessertCase.class));                  // AOSP: PLATLOGO category intent
finish();
```
Log on failure: `"Couldn't catch a break."`

### 5.3 `k_platlogo.webp` (920 × 546) — solved
Fully opaque inside a **horizontally sheared ellipse**; the four corners are transparent. Alpha extents: y=0 → x 531…578; y=270 (widest) → x 11…910; y=545 → x 341…388. Fitting: semi‑axes **a = 450, b = 273**, centre y = 272, and centre‑x sheared linearly `x_c(y) = 554.5 − 0.347·y` (verified: predicted widths 77/474/639/805 vs measured 48/472/639/804 at y = 0/40/80/150).

Palette (flat, 6 colours): `#FFFFFF` 48.0 % (interior), **`#ED1D24`** 25.4 % (ring + lettering), `#F68E92` 1.9 %, `#F2565B` 0.3 %, `#FBC7C8` 0.2 % (anti‑aliasing), rest transparent (22.9 %). The red ring is ~23 px thick at the left/right extremes and ~60 px thick where the shear makes it near‑horizontal at the top/bottom.

Inside the ring: **the word "Android" — capital A, lowercase ndroid — in a very bold condensed sans, red `#ED1D24`, italic‑sheared and rotated ≈10° counter‑clockwise** (the baseline rises left→right). I proved this by connected‑component analysis: exactly **4 enclosed white counters**, which is precisely the count for `A`, `d`, `o`, `d`:

| Counter | bbox | size | glyph |
|---|---|---|---|
| tapered/triangular, area 3539 ≈ ½·55·132 | (150,240)–(204,371) | 55 × 132 | **A** (apex at y≈240, crossbar at y≈371) |
| tall narrow, area 2566 | (425,252)–(455,345) | 31 × 94 | **d** |
| tall narrow, area 2461 | (613,220)–(644,311) | 32 × 92 | **o** |
| tall narrow, area 2573 | (779,188)–(809,281) | 31 × 94 | **d** |

Supporting components: the `i` **dot** is a separate 40 × 45 blob at (690,126)–(729,170) and its **stem** a 40 × 146 bar at (691,178)–(730,323); the first `d` is a standalone 110 × 205 component at (385,171)–(494,375); `r`+`o` merge into one 180 × 166 component at (505,192)–(684,357); `A`, `n` and the final `d` merge with the ring. Baseline rises: `A` bottom ≈ y 430, `d` 375, `r/o` 357, `i` 323, final `d` ≈ 290 → rotation ≈ 10.6° CCW over 750 px.

This is the AOSP original (`core/res/res/drawable-nodpi/platlogo.png` @ `android-4.4.2_r1`) — byte‑identical colour histogram. It is a parody of the Nestlé **KitKat** wrapper oval.

### 5.4 `k_android_logo_2014_2015.xml` — the vector wordmark
```xml
<vector android:width="542dp" android:height="114dp"
        android:viewportWidth="542" android:viewportHeight="114">
```
8 `<path>`s, all `android:fillColor="@color/k_android_logo_color"` (**`#000000`** light / **`#FFFFFF`** night), spelling lowercase **`android`**. Per‑glyph bounding boxes in viewport units (all cubic Béziers, each round letter is 2 subpaths — outer + counter):

| glyph | path # | approx. bbox (x, y) | notes |
|---|---|---|---|
| `a` | 4 | (1.1, 25.3) – (88.6, 114.2) | 2 subpaths, 1 counter |
| `n` | 5 | (103.8, 23.8) – (181.1, 111.9) | 1 subpath |
| `d` | 1 | (188.3, 2.3) – (277.0, 114.9) | ascender stem on the right at x 268.9–277.0 from y 2.6 down; bowl counter ≈ (198, 35)–(269, 106) |
| `r` | 6 | (290.8, 25.5) – (329.0, 112.4) | 1 subpath |
| `o` | 7 | (326.5, 25.7) – (415.0, 113.9) | 2 subpaths |
| `i` dot | 3 | (426.8, 2.1) – (441.0, 15.3) | small closed blob |
| `i` stem | 8 | (428.9, 27.7) – (438.4, 110.3) | 1 subpath |
| `d` | 2 | (451.2, 1.0) – (539.0, 113.5) | 2 subpaths |

Used only for the timeline card, not by the egg itself.

### 5.5 DessertCase / DessertCaseView — the secondary screen

`DessertCase` activity: `Theme.Black.NoTitleBar.Fullscreen`, `singleInstance`, `excludeFromRecents`, `hardwareAccelerated`, **`android:screenOrientation="locked"`**, icon+label from `k_platlogo` / `k_dessert_case`. `onStart` enables the `DessertCaseDream` component if not already enabled (`PackageManager.DONT_KILL_APP`; the `Slog.v("DessertCase","ACHIEVEMENT UNLOCKED")` line is commented out in the repo), then builds `DessertCaseView` inside a `DessertCaseView.RescalingContainer`. `onResume` posts `mView.start()` after **1000 ms**; `onPause` cancels and stops.

`RescalingContainer extends FrameLayout`:
```java
setSystemUiVisibility(FULLSCREEN | HIDE_NAVIGATION | LAYOUT_HIDE_NAVIGATION
                    | LAYOUT_FULLSCREEN | LAYOUT_HIDE_NAVIGATION | IMMERSIVE_STICKY);
onLayout: w2 = (int)(w / SCALE / 2);  h2 = (int)(h / SCALE / 2);   // = 2w, 2h
          mView.layout(cx-w2, cy-h2, cx+w2, cy+h2);                // child is 4x the screen
setDarkness(p): setBackgroundColor(((int)(p*0xff) << 24) & 0xFF000000);   // black scrim, unused here
```

`DessertCaseView extends FrameLayout` — **constants:**
```java
static final int START_DELAY = 5000;   // ms before the first auto-juggle
static final int DELAY       = 2000;   // ms between juggles
static final int DURATION    = 500;    // ms for every move/pop animation
public static final float SCALE = 0.25f;   // natural display size = SCALE * mCellSize
private static final float PROB_2X = 0.33f;
private static final float PROB_3X = 0.1f;
private static final float PROB_4X = 0.01f;
```
Cell size `mCellSize = 192 dp` (in px). Because the container lays the view out 4× oversize and the view then does `setScaleX/Y(SCALE * scaleS)` with
```java
scaleS = Math.max(mWidth / (mCellSize * mColumns), mHeight / (mCellSize * mRows));   // repo fix for issue #349
setTranslationX(0.5f * (mWidth  - mCellSize * mColumns) * scale);
setTranslationY(0.5f * (mHeight - mCellSize * mRows)    * scale);
```
**the net on‑screen cell is 192 dp × 0.25 = 48 dp** (AOSP used a bare `SCALE`; the repo multiplies by `scaleS` so no black edge remains). Grid: `mRows = height/mCellSize`, `mColumns = width/mCellSize`, `mCells = new View[mRows*mColumns]`, `mFreeList = HashSet<Point>` of every cell.

**Sprite → alpha mask pipeline.** Every dessert bitmap is fully opaque 512 × 512 (verified: alpha is 255 at all 262 144 pixels of all 17 files). The constructor:
```java
opts.inSampleSize = (mCellSize < 512) ? 2 : 1;   opts.inMutable = true;   // reuses one Bitmap
MASK       = {0,0,0,0,255, 0,0,0,0,255, 0,0,0,0,255, 1,0,0,0,0}   // A_out = R_in, RGB = 255
ALPHA_MASK = {0,0,0,0,255, 0,0,0,0,255, 0,0,0,0,255, 0,0,1,0,0}   // A_out = A_in, RGB = 255
WHITE_MASK = {0,0,0,0,255, 0,0,0,0,255, 0,0,0,0,255, -1,0,0,0,255}// (declared, unused)
Bitmap a = Bitmap.createBitmap(w, h, ALPHA_8);
canvas.drawBitmap(source, 0, 0, paintWith(MASK));                  // alpha := source RED channel
BitmapDrawable d = new BitmapDrawable(res, a);
d.setColorFilter(new ColorMatrixColorFilter(ALPHA_MASK));          // draw pure white at that alpha
d.setBounds(0, 0, mCellSize, mCellSize);
```
**⇒ every dessert is drawn as pure `#FFFFFF` with per‑pixel alpha equal to the source image's RED channel, over a random solid cell colour.** The sprites are therefore greyscale alpha maps, not colour art. Measured red‑channel distributions (512² = 262 144 px each):

| sprite | R>250 (opaque) | R 10–250 (partial) | R<10 (transparent) | mask bbox |
|---|---|---|---|---|
| `dessert_android` | 101 149 | 2 698 | 158 297 | (65,30)–(446,481) 382 × 452 |
| `dessert_cupcake` | 110 408 | 2 471 | 149 265 | (55,40)–(456,444) 402 × 405 |
| `dessert_donut` | 76 202 | 57 394 | 128 548 | (42,42)–(469,469) 428 × 428 |
| `dessert_eclair` | 3 515 | 45 872 | 212 757 | (38,164)–(474,316) 437 × 153 |
| `dessert_froyo` | 85 574 | 32 328 | 144 242 | (52,64)–(459,460) 408 × 397 |
| `dessert_gingerbread` | 29 119 | 69 507 | 163 518 | (88,59)–(423,463) 336 × 405 |
| `dessert_honeycomb` | 40 774 | 12 342 | 209 028 | (67,72)–(444,461) 378 × 390 |
| `dessert_ics` | 14 852 | 102 617 | 144 675 | (91,50)–(420,461) 330 × 412 |
| `dessert_jandycane` | 39 968 | 3 213 | 218 963 | (123,27)–(388,484) 266 × 458 |
| `dessert_jellybean` | 96 998 | 1 628 | 163 518 | (41,95)–(470,415) 430 × 321 |
| `dessert_keylimepie` | 33 640 | 42 893 | 185 611 | (106,49)–(400,467) 295 × 419 |
| `dessert_kitkat` | 61 072 | 74 466 | 126 606 | (61,56)–(450,455) 390 × 400 |
| `dessert_petitfour` | 66 674 | 4 092 | 191 378 | (82,12)–(429,488) 348 × 477 |
| `dessert_donutburger` | 38 314 | 73 556 | 150 274 | (7,62)–(504,445) 498 × 384 |
| `dessert_flan` | 32 916 | 28 296 | 200 932 | (135,133)–(376,400) 242 × 268 |
| `dessert_dandroid` | 73 807 | 4 280 | 184 057 | (61,79)–(454,432) 394 × 354 |
| `dessert_zombiegingerbread` | 23 844 | 68 256 | 170 044 | (43,55)–(425,467) 383 × 413 |

**Silhouettes** (derived from the red‑channel masks; all fit a 512 × 512 frame):

| sprite | shape to draw |
|---|---|
| `dessert_android` | the classic bugdroid: semicircular head with 2 straight antennae, 2 eye holes, rounded‑rect body, 2 capsule arms detached at the sides, 2 capsule legs |
| `dessert_cupcake` | 3‑lobe swirl on top (fluted frosting), flared trapezoid cup below, widest at ~60 % height |
| `dessert_donut` | full annulus, outer Ø 428, **hole ≈ 4 × 4 cells at the centre** (≈ 90 × 90 px), plus ~57 k px of mid‑alpha **sprinkles** scattered on the icing |
| `dessert_eclair` | very wide/low rounded capsule 437 × 153 with domed ends, mostly *mid*-alpha (45 872 px at R 10–250) → a soft, translucent icing look with speckles |
| `dessert_froyo` | soft‑serve swirl (a tapering S‑spiral, ~10 grid rows) sitting on a straight‑sided cup (12 rows, full width) |
| `dessert_gingerbread` | gingerbread **man**, mostly *outline*: head+torso+2 outstretched arms+2 legs, interior only ~25 % alpha, with `#`‑density icing details at the cuffs/ankles |
| `dessert_zombiegingerbread` | same man, ragged: left arm detached and raised, chunks missing from the torso and legs, one leg ending in a stub |
| `dessert_honeycomb` | the **Honeycomb bee** (§2) reduced to a silhouette: domed head with 2 antennae, 2 pairs of outlined wings spanning nearly the full 378 px width, banded abdomen, pointed stinger |
| `dessert_ics` | an **ice cream sandwich** as a tilted rounded rectangle 330 × 412: opaque white cookie faces at top/bottom/left/right, a large *low*-alpha (grey `#404040` → α≈0.25) cream interior, and a few fully transparent chocolate‑chip holes |
| `dessert_jellybean` | one big kidney bean 430 × 321 (upper left) **plus a small second bean** at the top right |
| `dessert_jandycane` | candy cane, 266 × 458: straight shaft on the right, crook curling down‑left at the bottom, diagonal red/white stripes (stripe = alpha alternation) |
| `dessert_keylimepie` | a **pie wedge** 295 × 419 pointing down: crimped crust + meringue swirls across the top third, tapering to a point at the bottom |
| `dessert_kitkat` | a **KitKat bar, 4 fingers**: 4 identical vertical bars each ≈ 80 px wide separated by ≈ 20 px grooves, 390 × 400, with a chamfered bottom edge; heavy mid‑alpha (74 466 px) for the chocolate shading |
| `dessert_petitfour` | a **rhombus/diamond** 348 × 477 with nested diagonal lattice lines inside (the original Android 1.1 "petit four" motif) |
| `dessert_donutburger` | a **burger** 498 × 384: domed top bun with sesame seeds, a mid band (the patty, higher alpha), a lower bun, tapering; the widest sprite in the set |
| `dessert_flan` | **crème caramel** 242 × 268: a domed caramel top with drip tongues, then a flaring ramekin body widest at the bottom |
| `dessert_dandroid` | an android head+shoulders blob 394 × 354 with a bite/chunk missing and internal mid‑alpha texture |

**Rarity tables (verbatim, including the in‑source credits):**
```java
PASTRIES = { k_dessert_kitkat,      // used with permission
             k_dessert_android };   // thx irina

RARE_PASTRIES = { k_dessert_cupcake,       // 2009
                  k_dessert_donut,         // 2009
                  k_dessert_eclair,        // 2009
                  k_dessert_froyo,         // 2010
                  k_dessert_gingerbread,   // 2010
                  k_dessert_honeycomb,     // 2011
                  k_dessert_ics,           // 2011
                  k_dessert_jellybean };   // 2012

XRARE_PASTRIES = { k_dessert_petitfour,    // the original and still delicious
                   k_dessert_donutburger,  // remember kids, this was long before cronuts
                   k_dessert_flan,         //     sholes final approach
                                           //     landing gear punted to flan
                                           //     runway foam glistens
                                           //         -- mcleron
                   k_dessert_keylimepie }; // from an alternative timeline

XXRARE_PASTRIES = { k_dessert_zombiegingerbread, // thx hackbod
                    k_dessert_dandroid,          // thx morrildl
                    k_dessert_jandycane };       // thx nes

NUM_PASTRIES = 2 + 8 + 4 + 3 = 17;
```

**Cell filling** (`fillFreeList(int animationLen)`), for every free cell:
```java
v.setBackgroundColor(random_color());
final float which = frand();
if      (which < 0.0005f) d = pick(XXRARE_PASTRIES);   //  0.05 %
else if (which < 0.005f)  d = pick(XRARE_PASTRIES);    //  0.45 %
else if (which < 0.5f)    d = pick(RARE_PASTRIES);     // 49.50 %
else if (which < 0.7f)    d = pick(PASTRIES);          // 20.00 %
else                      d = null;                    // 30.00 %  -> blank coloured tile
if (d != null) v.getOverlay().add(d);
addView(v, lp); place(v, pt, false);
if (animationLen > 0) {
    final float s = (Integer) v.getTag(TAG_SPAN);
    v.setScaleX(0.5f*s); v.setScaleY(0.5f*s); v.setAlpha(0f);
    v.animate().withLayer().scaleX(s).scaleY(s).alpha(1f).setDuration(animationLen);
}
```
`random_color()`:
```java
final int COLORS = 12;
hsv[0] = irand(0, COLORS) * (360f / COLORS);   // irand(0,12) = (int)(rand()*12) -> 0..11
// hsv = { h, 1f, .85f }  ->  Color.HSVToColor
```
→ exactly 12 possible tile colours:

`#D90000` `#D96C00` `#D9D900` `#6CD900` `#00D900` `#00D96C` `#00D9D9` `#006CD9` `#0000D9` `#6C00D9` `#D900D9` `#D9006C`

**Placement** (`place(View v, Point pt, boolean animate)`), `synchronized`:
```java
rnd = frand();
if      (rnd < 0.01f) { if (!(i >= mColumns-3 || j >= mRows-3)) scale = 4; }   // P = 0.01
else if (rnd < 0.10f) { if (!(i >= mColumns-2 || j >= mRows-2)) scale = 3; }   // P = 0.09
else if (rnd < 0.33f) { if (!(i == mColumns-1 || j == mRows-1)) scale = 2; }   // P = 0.23
else scale = 1;                                                                // P = 0.67
```
(the edge guards silently downgrade an oversized tile to 1×). It frees `v`'s old cells, collects every `squatter` under the new `scale × scale` footprint, frees those cells, and for each squatter ≠ v:
```java
squatter.animate().withLayer().scaleX(0.5f).scaleY(0.5f).alpha(0)
        .setDuration(500).setInterpolator(new AccelerateInterpolator())
        .setListener(... onAnimationEnd -> removeView(squatter)).start();
```
Then, if animating:
```java
final float rot = (float) irand(0, 4) * 90f;     // 0, 90, 180 or 270 degrees, uniform
v.bringToFront();
set1: SCALE_X, SCALE_Y -> (float) scale,  AnticipateOvershootInterpolator, 500 ms
set2: ROTATION -> rot, X -> i*mCellSize + (scale-1)*mCellSize/2,
                       Y -> j*mCellSize + (scale-1)*mCellSize/2,
      DecelerateInterpolator, 500 ms
// both start together; set1 attaches a hardware layer for the duration
```
`start()` / juggle loop:
```java
public void start() { if (!mStarted) { mStarted = true; fillFreeList(DURATION * 4 /*2000 ms*/); }
                      mHandler.postDelayed(mJuggle, START_DELAY /*5000*/); }
mJuggle = () -> {
    final int N = getChildCount();
    final int K = 1;                      //irand(1,3);
    for (int i = 0; i < K; i++)
        place(getChildAt((int)(Math.random() * N)), true);
    fillFreeList();                       // 500 ms pop-in for the holes it made
    if (mStarted) mHandler.postDelayed(mJuggle, DELAY /*2000*/);
};
```
Cell click:
```java
v.setOnClickListener(view -> { place(v, true);
    postDelayed(delayFillFreeList = () -> fillFreeList(), DURATION/2 /*250 ms*/); });
```
`onSizeChanged` tears everything down and rebuilds the grid (and restarts if it was started). `onDetachedFromWindow` → `stop(); removeCallbacks(delayFillFreeList);`. `DEBUG` `onDraw` strokes every child hit rect with `#FFCCCCCC`, 2 px.

**Net behaviour to reproduce:** a full‑screen grid of 48 dp squares, each a random one of 12 saturated colours, 70 % carrying a white dessert silhouette (30 % blank), sizes 1×1 (67 %), 2×2 (23 %), 3×3 (9 %), 4×4 (1 %), each randomly rotated by a multiple of 90°. After 1 s the grid fills with a 2 s staggered pop‑in; 5 s later, and every 2 s thereafter, exactly one random tile pops out to a new random cell (squashing anything it lands on with a 500 ms accelerate‑out), and the vacated cells pop back in over 500 ms. Tapping a tile moves it. **No gravity, no velocity, no physics** — it is purely a choreographed grid.

### 5.6 `preview/PlatLogoActivity` (repo extra, "K Preview" / KeyLimePie)
`FrameLayout` (no background colour), `letter` = `"K"` bold 300sp white with `setShadowLayer(12*density, 0, 0, 0xC085F985)` (a green glow), `logo` = `k_platlogo_preview` INVISIBLE, `tv` = `"Android KeyLimePie"` light 30sp white, all‑caps, shadow `(4dp, 0, 2dp, 0x66000000)`, bottom‑centred with 40 dp margin.
* **Click** (only while the logo is hidden): `letter` → alpha 0.25, scale 0.75 over **2000 ms**; `logo` alpha 0→1 over 1000 ms with **500 ms** delay; `tv` alpha 0→1 over 1000 ms with **1000 ms** delay.
* **Long‑press** → just `finish()` (the AOSP PLATLOGO intent is commented out, with the log `"Couldn't find a piece of pie."`).
* `k_platlogo_preview.webp` (800 × 800, bbox (1,59)–(799,743)): `#FFFFFF` 75 %, bright green `#73FF6D`/`#64F35E`/`#79FF74`, dark green `#0F7000`/`#15770E`, `#EEFFED`. A large green rounded mass occupying (208,272)–(760,730) with white marbling/speckles inside, plus two thin green diagonal strokes — one from (272,80) down‑right to (400,272), one from (0,352) down‑right to (240,448). Reads as a key lime (or a lime‑pie) with stem and leaf on white.

### 5.7 Exact strings
| Source | Value |
|---|---|
| `k_dessert_case` (comment: "Name of the K-release easter egg: a display case for all our tastiest desserts. [CHAR LIMIT=30]") | `Dessert Case` |
| `k_android_nickname` (`translatable="false"`) | `KitKat` |
| `k_preview_nickname` (**translatable**) | `K Preview` |
| `k_key_lime_pie` | `KeyLimePie` |
| `letter` text | `K` (AOSP: `Build.ID[0]`) |
| `tv` text (all‑caps applied) | `Android 4.4` → `ANDROID 4.4` |
| preview `tv` text | `Android KeyLimePie` → `ANDROID KEYLIMEPIE` |
| SharedPreferences key | `k_egg_mode` (AOSP: `Settings.System.EGG_MODE`), value = `System.currentTimeMillis()` |
| Log on failure | `Couldn't catch a break.` |
| Timeline (API 20) | `K for watches.\nReleased publicly as Android 4.4W in June 2014.` |
| Timeline (API 19, logo = `k_android_logo_2014_2015`) | `K.\nReleased publicly as Android 4.4 in October 2013.` |

### 5.8 Third‑party credits (must be carried over)
* `dessert_kitkat` — **`// used with permission`** (the Nestlé KitKat bar; the whole `k_platlogo` oval+“Android” wordmark is a KitKat‑wrapper parody). This is the only trademarked artwork in the batch; keep the note and consider omitting the KitKat tile if you ship publicly.
* `dessert_android` — **`// thx irina`**
* `dessert_zombiegingerbread` — **`// thx hackbod`**
* `dessert_dandroid` — **`// thx morrildl`**
* `dessert_jandycane` — **`// thx nes`** (the same "nes" candy cane as Jelly Bean's `j_jandycane`)
* `dessert_flan` — a haiku credited **`-- mcleron`**: *"sholes final approach / landing gear punted to flan / runway foam glistens"*
* `dessert_petitfour` — *"the original and still delicious"*; `dessert_donutburger` — *"remember kids, this was long before cronuts"*; `dessert_keylimepie` — *"from an alternative timeline"*; the RARE list is year‑tagged 2009–2012.
* No credit strings are shown to the user anywhere in KitKat (unlike Gingerbread).

### 5.9 Canvas 2D suggestion
**PlatLogo**
1. Layer order: transparent (wallpaper) → `rgba(0,0,0,0.75)` full‑screen → letter → red bg → logo → caption.
2. Letter: `ctx.font = '700 300px sans-serif'` (treat 300 sp ≈ 300 px at density 1 and scale down to fit), `fillStyle='#FFF'`, `textAlign='center'`, `textBaseline='middle'`. Per tap animate `rot += (Math.random()>0.5?360:-360) - (Math.trunc(rot)%360)` over 700 ms with `1-(1-t)**2`.
3. Tap counter: on the 6th tap run the reveal; also support a real `pointerdown`+500 ms hold.
4. Reveal: run 4 independent tweens on the时间表 in §5.2. Implement the three Android interpolators:
   `accel = t*t`, `decel = 1-(1-t)*(1-t)`, `anticOver = t<0.5 ? 0.5*a(2t,s) : 0.5*(o(2t-2,s)+2)` with `s = 2*1.70158 = 3.40316`, `a(u,s)=u*u*((s+1)*u-s)`, `o(u,s)=u*u*((s+1)*u+s)`.
5. Red bg: `fillStyle='#ED1D24'`, animate `globalAlpha` 0→1 and `ctx.scale(sx,1)` with `sx` 0.01→1 about the screen centre, starting at +500 ms.
6. Logo: draw the oval + wordmark procedurally — `ctx.ellipse` won't shear, so build it as `ctx.transform(1, 0, -0.347, 1, 0, 0)` applied to `ctx.ellipse(460, 272, 450, 273, 0, 0, 2π)` in the 920 × 546 frame; stroke `#ED1D24` with a line width that varies (23 px at the sides, ~60 px at the top/bottom — easiest is to stroke the *unsheared* ellipse with 23 px and let the shear stretch it, which reproduces the effect). Then the word "Android" in a bold condensed face, `#ED1D24`, rotated −10.6°, with the four counters at the measured bboxes.

**DessertCase**
1. Grid: `cell = 48` CSS px on screen (or 192 px in a 4× overscaled backing store, mirroring `RescalingContainer`). `cols = ceil(w/cell)`, `rows = ceil(h/cell)`.
2. Each tile = `fillStyle = one of the 12 hex colours` `fillRect`, plus the dessert silhouette drawn in `#FFFFFF` with `globalAlpha` from a pre‑baked alpha map.
3. **Bake the 17 silhouettes once** into offscreen canvases. The cheapest faithful route: keep the source PNGs' *red channel* as the alpha (that is literally what AOSP does) — `getImageData`, set `a = r`, `r=g=b=255`, `putImageData`, then `drawImage` scaled to the cell. If you must be bitmap‑free, trace each silhouette from the shape table in §5.5 with `arc`/`roundRect`/`bezierCurveTo` and add a soft inner gradient to fake the partial‑alpha sprites (`eclair`, `ics`, `gingerbread`, `zombiegingerbread`, `donut`, `kitkat`, `donutburger`, `flan`, `keylimepie` all rely heavily on mid‑alpha).
4. Per tile store `{col,row,span,rot,color,sprite}`. Occupancy map `cells[row*cols+col]`.
5. Move animation (500 ms): tween `scale` from current → span with `anticOver`, and `x,y,rot` → the target with `decel`, in parallel; `bringToFront` = draw last.
6. Eviction (500 ms): tween `scale → 0.5*span`… actually `scaleX/Y → 0.5` and `alpha → 0` with `accel`, then delete.
7. Pop‑in: start at `scale = 0.5*span`, `alpha = 0` → `span`, `1` over 2000 ms for the initial fill, 500 ms afterwards.
8. Timers: `setTimeout(start, 1000)` after entering the screen; `start()` fills the grid then `setInterval`‑style `setTimeout(juggle, 5000)` and thereafter `2000`; each juggle moves exactly **1** random tile to a random cell, then fills the free list.
9. Click a tile → move it, then fill free cells 250 ms later.
10. Record the unlock timestamp once (`localStorage['k_egg_mode'] ??= Date.now()`).

---

## 6. Upstream license situation and attribution list

**Repo licence.** `hushenghao/AndroidEasterEggs` is **Apache‑2.0** (`LICENSE` at the root = the standard Apache License 2.0, January 2004). The README states `Copyright 2026 Hu Shenghao` under the same Apache‑2.0 text. So your TypeScript port may derive from it provided you keep the Apache‑2.0 notices.

**Derivation from AOSP.** Every Java source in these five modules carries an AOSP header — `Copyright (C) 2010 The Android Open Source Project` (Gingerbread, Honeycomb, ICS, JellyBean, KitKat `PlatLogoActivity`s), `Copyright (C) 2011` (`Nyandroid.java`, `i_nyandroid_anim.xml`, `i_star_anim.xml`), `Copyright (C) 2012` (`BeanBag.java`, `BeanBagDream.java`), `Copyright (C) 2013` (`DessertCase.java`, `DessertCaseView.java`, `DessertCaseDream.java`) — each with the full Apache‑2.0 boilerplate. I diffed the repo files against the AOSP originals and they are functionally identical; the only deltas are package/resource renaming, `Vibrator` via `getSystemService`, direct `Intent`s instead of the `com.android.internal.category.PLATLOGO` category, hard‑coded version strings (`"K"`, `"Android 4.4"`, `"Android 4." + rand(1..3)`) in place of `Build.ID`/`Build.VERSION.RELEASE`, `SpUtils` in place of `Settings.System.EGG_MODE`, and these repo‑only fixes:
* `IceCreamSandwich/PlatLogoActivity`: a `VectorDrawable` branch that grows `drawable.setBounds()` symmetrically instead of `setScaleX/Y`.
* `JellyBean/BeanBag`: `isTouchedBean()` transparent‑pixel hit filtering; `new Paint(ANTI_ALIAS_FLAG)`; `BeanBagDream` enablement in `onStart`.
* `KitKat/DessertCaseView`: the `scaleS` factor (repo issue #349, black edges), `isAttachedToWindow()` guard in `makeHardwareLayerListener`, `delayFillFreeList` field, `stop()` in `onDetachedFromWindow`.
* `Honeycomb/PlatLogoActivity`: the `randomPlatlogo()` 50/50 pick (not AOSP).

**Exact upstream AOSP paths** (repo `aosp-mirror/platform_frameworks_base`, tag in brackets) — cite these in your attribution file:

| Egg | Repo file | AOSP path |
|---|---|---|
| all 5 | `…/PlatLogoActivity.java` | `platform/frameworks/base/core/java/com/android/internal/app/PlatLogoActivity.java` [2.3.7_r1, 3.2.4_r1, 4.0.4_r1, 4.1.2_r1, 4.4.2_r1] |
| Gingerbread | `res/drawable/g_platlogo.jpg` | `platform/frameworks/base/core/res/res/drawable-nodpi/platlogo.jpg` [android-2.3.7_r1] — **art © Jack Larson** ("Zombie art by Jack Larson") |
| Honeycomb | `res/drawable/h_platlogo.webp` | `platform/frameworks/base/core/res/res/drawable-nodpi/platlogo.png` [android-3.2.4_r1] |
| Honeycomb | `res/drawable/h_platlogo_1.webp` | **no AOSP counterpart** — repo addition, provenance unknown; label it as such |
| ICS | `res/drawable-anydpi/i_platlogo.xml`, `i_platlogo_rectangle.xml` | repo‑authored vectorisations of `core/res/res/drawable-nodpi/platlogo.png` [android-4.0.4_r1] (200 × 240 px, 20 × 24 cells of 10 px). Repo hues `#A4C639`/`#CACACA`; AOSP hues `#95C000`/`#BEBEBE` |
| ICS | `Nyandroid.java` | `platform/frameworks/base/packages/SystemUI/src/com/android/systemui/Nyandroid.java` [android-4.0.4_r1] |
| ICS | `i_nyandroid_anim.xml`, `i_star_anim.xml` | `packages/SystemUI/res/drawable/nyandroid_anim.xml`, `star_anim.xml` [android-4.0.4_r1] |
| ICS | `i_nyandroid00..11.webp` | `packages/SystemUI/res/drawable-nodpi/nyandroid00.png … nyandroid11.png` [android-4.0.4_r1] |
| ICS | `i_star0..5.webp` | `packages/SystemUI/res/drawable-nodpi/star0.png … star5.png` [android-4.0.4_r1] |
| ICS | `i_platlogo_preview.png`, `preview/PlatLogoActivity.java` | **no AOSP counterpart** — repo "ICS Preview" extra |
| JellyBean | `j_platlogo.webp`, `j_platlogo_alt.webp` | `core/res/res/drawable-nodpi/platlogo.png`, `platlogo_alt.png` [android-4.1.2_r1] |
| JellyBean | `BeanBag.java` | `packages/SystemUI/src/com/android/systemui/BeanBag.java` [android-4.1.2_r1] |
| JellyBean | `BeanBagDream.java` | `packages/SystemUI/src/com/android/systemui/BeanBagDream.java` (added in 4.2) |
| JellyBean | `j_redbean0/1/2.webp`, `j_redbeandroid.webp`, `j_jandycane.webp` | `packages/SystemUI/res/drawable-nodpi/redbean0.png`, `redbean1.png`, `redbean2.png`, `redbeandroid.png`, `jandycane.png` [android-4.1.2_r1] |
| JellyBean | `j_jelly_bean_dream_name` = `BeanFlinger` | `packages/SystemUI/res/values/strings.xml` |
| JellyBean | `j_android_logo.webp` | **no AOSP counterpart** — repo list icon |
| KitKat | `k_platlogo.webp` | `core/res/res/drawable-nodpi/platlogo.png` [android-4.4.2_r1] |
| KitKat | `DessertCase.java`, `DessertCaseView.java`, `DessertCaseDream.java` | `packages/SystemUI/src/com/android/systemui/DessertCase.java`, `DessertCaseView.java`, `DessertCaseDream.java` [android-4.4.2_r1] |
| KitKat | `k_dessert_*.webp` (17) | `packages/SystemUI/res/drawable-nodpi/dessert_{android,cupcake,dandroid,donut,donutburger,eclair,flan,froyo,gingerbread,honeycomb,ics,jandycane,jellybean,keylimepie,kitkat,petitfour,zombiegingerbread}.png` [android-4.4.2_r1] |
| KitKat | `k_dessert_case_cell_size` = `192dp` | `packages/SystemUI/res/values/dimens.xml` → `dessert_case_cell_size` |
| KitKat | `k_dessert_case` = `Dessert Case` | `packages/SystemUI/res/values/strings.xml` → `dessert_case` |
| KitKat | `k_platlogo_preview.webp`, `preview/*`, `k_android_logo.webp`, `k_android_logo_2014_2015.xml` | **no AOSP counterpart** — repo "K Preview"/KeyLimePie extras and the 2014–2015 Android wordmark (a Google trademark) |
| Gingerbread / Honeycomb / JellyBean / KitKat | `g_/h_/j_/k_android_logo.webp` | **no AOSP counterpart** — repo list icons |

Individual artwork credits to preserve verbatim (all from `DessertCaseView.java` and `PlatLogoActivity.java`):
`Zombie art by Jack Larson` · `dessert_kitkat: used with permission` · `dessert_android: thx irina` · `dessert_zombiegingerbread: thx hackbod` · `dessert_dandroid: thx morrildl` · `dessert_jandycane / j_jandycane: thx nes` · `dessert_flan haiku: -- mcleron`.

Suggested attribution block for your project: *"Android platform Easter eggs © The Android Open Source Project, Apache License 2.0. Ported from hushenghao/AndroidEasterEggs (Apache‑2.0, © Hu Shenghao). Gingerbread zombie art by Jack Larson. KitKat dessert art: `dessert_kitkat` used with permission (Nestlé), `dessert_android` thx irina, `dessert_zombiegingerbread` thx hackbod, `dessert_dandroid` thx morrildl, `dessert_jandycane` thx nes, `dessert_flan` haiku by mcleron. Android is a trademark of Google LLC."*
</task_result>
</task>