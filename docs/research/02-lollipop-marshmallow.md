<task id="ses_f7984fc84ffeS5ouCtlnW8RdWz" state="completed">
<task_result>
# Android Easter Egg Research — Batch: `Lollipop` + `Marshmallow`

Repo `hushenghao/AndroidEasterEggs`, branch `main`, commit `e8e58366ae91ec380da34fa5b9e68ef6a78d6480`.
Note: this repo's Lollipop game is **`LLand`** (not `MLand`); Marshmallow's is **`MLand`**. Both are ports of AOSP `frameworks/base` `LLand.java` / `MLand.java`. `eggs/Base` contains **no shared PlatLogo behaviour for these two** — its `PlatLogoActivity.kt` is a Compose stub used only by API 1–8 eggs (static logo + toast). Lollipop/Marshmallow each ship a self-contained `PlatLogoActivity.java`.

**Universal implementation tip:** every Android `VectorDrawable` `android:pathData` is verbatim SVG path syntax. `new Path2D(pathData)` + `ctx.scale(size/viewportWidth, size/viewportHeight)` reproduces all art below exactly. I give primitive recipes too, for hand-drawing.

---

# Egg 1 — Lollipop (Android 5.0/5.1, API 21–22)

## 1.1 PlatLogo screen (`com.android_l.egg.PlatLogoActivity`)

### Layout / geometry
- Root: plain `FrameLayout`, theme `@android:style/Theme.Wallpaper.NoTitleBar.Fullscreen` → **background is transparent; the live wallpaper shows through**. Do not paint a solid backdrop.
- `size = (int)(min(min(widthPx, heightPx), 600dp) - 100dp)` — the candy diameter, centred (`Gravity.CENTER`).
- Two children:
  1. **`stick`** — `32dp` wide, `MATCH_PARENT` tall, `Gravity.CENTER_HORIZONTAL`, initial `alpha = 0`.
     Its `onDraw` translates by `h = height/2` and draws **only in the bottom half of the screen**:
     - Horizontal linear gradient rect `(0,0,w,h)`, colours `[0xFFFFFFFF, 0xFFAAAAAA]` (`GradientDrawable` `LEFT_RIGHT`; it also calls `setGradientCenter(w*0.75, 0)` but Android ignores gradient-center for LINEAR orientation → treat as a plain left→right gradient).
     - Shadow quad, fill `#FFAAAAAA`: `(0,0) → (w,0) → (w, size/2 + 1.5*w) → (0, size/2) → close` (drawn in the translated space, i.e. starting at screen vertical centre). This is the candy's shadow falling on the stick; deeper on the right.
     - View outline (for elevation shadow) = bottom half only: `setRect(0, height/2, width, height)`.
  2. **`im`** — `ImageView`, `size × size`, centred, `translationZ = 20`.
     - background = `RippleDrawable(ColorStateList(FLAVORS[idx+1]), ShapeDrawable(OvalShape) painted FLAVORS[idx], null)` → a **solid coloured disc** with a material ripple in the lighter tint.
     - image = `R.drawable.l_platlogo`, initial `alpha = 0`.
     - overlay: `ShapeDrawable(OvalShape)`, colour `0x10FFFFFF`, bounds `(size*0.15, size*0.15) → (size*0.6, size*0.6)` — a soft specular highlight in the upper-left of the candy (drawn **above** the wordmark).

### FLAVORS (lollipop flavours; pairs are `[fill, ripple]`)
```
0xFF9C27B0, 0xFFBA68C8   // grape
0xFFFF9800, 0xFFFFB74D   // orange
0xFFF06292, 0xFFF8BBD0   // bubblegum
0xFFAFB42B, 0xFFCDDC39   // lime
0xFFFFEB3B, 0xFFFFF176   // lemon
0xFF795548, 0xFFA1887F   // mystery flavor
```
`newColorIndex() = 2 * (int)(Math.random() * FLAVORS.length/2)` → picks a random **pair** (index 0,2,4,6,8,10).

### `l_platlogo.xml` — the artwork (560 × 560 viewport, all fills `#FFFFFF`)
It is the lowercase wordmark **“lollipop”** in a monoline geometric sans (stroke ≈ 11.17 units, cap/ascender top y=221, baseline y≈319.27, descender y=339). Glyph geometry:

| glyph | x-range | geometry |
|---|---|---|
| `l` | 65.40 – 76.57 | rect, y 221 → 319.27 |
| `o` | 87.64 – 169.49 | ring, centre (128.57, 279.88), outer r ≈ 40.9, counter r ≈ 29.4 (y 239 → 321) |
| `l` | 180.58 – 191.75 | rect, y 221 → 319.27 |
| `l` | 204.80 – 215.97 | rect, y 221 → 319.27 |
| `i` | 229.02 – 240.19 | dot rect y 221 → 232.48; stem rect y 240.65 → 319.27 |
| `p` | 253.24 – 333.60 | stem rect x 253.24–264.56, y 240.73 → **339** (descender); bowl outer from (264.08,250.56) via cubics to (292.15,239.0) → (332.95,280.12) → (292.15,321.0) → (264.56,310.07); counter centred ≈ (292.2, 280.1) rx≈29.95 ry≈29.8 |
| `o` | 341.68 – 423.79 | ring, centre (382.74, 279.88), outer r ≈ 41.0, counter r ≈ 29.4 |
| `p` | 434.89 – 514.60 | same as first `p`, translated +181.65 in x |

Wordmark bbox ≈ x 65.4 → 514.6, y 221 → 339; visually centred in the 560 box.
Canvas: `ctx.scale(size/560, size/560)` then `new Path2D(...)` per glyph (use `'evenodd'` for the `o`/`p` counters), fill white.

### Animations & timings (all use `PathInterpolator(0f, 0f, 0.5f, 1f)` — a fast-out cubic Bézier `cubic-bezier(0.5, 0, 0.5, 1)`-ish ease; control points P1=(0,0), P2=(0.5,1))

On window attach (no input yet):
| t (ms) | target | property | from → to | dur |
|---|---|---|---|---|
| 800 | `im` | scaleX/scaleY | 0 → 0.3 | 500 |

`stick` stays `alpha=0`, `im` image alpha 0 → you see only a small coloured disc.

On **first tap** (`mTapCount == 0`):
| t rel. to tap (ms) | target | property | from → to | dur |
|---|---|---|---|---|
| 500 | `im` | scaleX/scaleY | 0.3 → 1.0, translationZ 20 → 40 | 700 |
| 750 | `stick` | alpha 0 → 1, translationZ 0 → 20 | | 700 |
| 1000 | `l_platlogo` drawable | alpha 0 → 255 | | 300 (ObjectAnimator default) |

Also on first tap a long-click listener is installed.

On **every subsequent tap**: `im.setBackground(makeRipple())` → the candy **re-randomises its flavour colour** (and the ripple colour). `mTapCount++`.

**Long press** (only honoured when `mTapCount >= 5`, otherwise returns false): writes `SpUtils "l_egg_mode" = System.currentTimeMillis()` once, then `startActivity(LLandActivity)` + `finish()`.

**Keyboard (TV support):** view is focusable + requests focus. Any key-down except `KEYCODE_BACK`: `++mKeyCount`; once `mKeyCount > 2` → if `mTapCount > 5` perform long-click, else perform click. (So key #3 = first synthetic click, and from then on every key triggers a click/long-click.)

## 1.2 The game — `LLand` ("L Land")

Class `com.android_l.egg.LLand extends FrameLayout`. Layout `l_lland.xml`: `FrameLayout(layoutDirection="ltr")` → `LLand @id/world` (match_parent) + `TextView @id/score` + `TextView @id/welcome` (splash, `visibility="gone"`, no text — effectively unused).

Activity `LLandActivity`: theme `Theme.Material.NoActionBar.Fullscreen`, `excludeFromRecents`, `singleInstance`, `hardwareAccelerated`, `screenOrientation="locked"`. It only wires `setScoreField(R.id.score)` / `setSplash(R.id.welcome)` and adds window-inset margins to the score field.

### All constants (`res/values/lland_config.xml`, dp)
```
l_obstacle_spacing      380dp     → OBSTACLE_PERIOD = (int)(380dp_px / 100dp_px) = 3  (SECONDS, int cast!)
l_translation_per_sec   100dp     → world scroll speed
l_boost_dv              550dp     → upward impulse velocity (px/s)
l_player_hit_size        40dp
l_player_size            40dp     → inset = (40-40)/2 = 0
l_obstacle_width         90dp     → Pop diameter / container
l_obstacle_stem_width    12dp
l_obstacle_gap          170dp
l_obstacle_height_min    40dp     → OBSTACLE_MIN
l_building_width_min     20dp
l_building_width_max    250dp
l_building_height_min    20dp
l_cloud_size_min         10dp
l_cloud_size_max        100dp
l_sun_size               45dp     → also used for the MOON
l_star_size_min           3dp
l_star_size_max           5dp
l_G                      30dp     → PER-FRAME dv increment (NOT per second!)
l_max_v                1000dp     → |dv| clamp
l_scenery_z               6dp
l_obstacle_z             18dp
l_player_z               18dp
l_player_z_boost         20dp
l_hud_z                  35dp
```
Derived: `inset = (90-12)/2 = 39dp`, `yinset = 90/2 = 45dp`.
There are **no `values-*` qualifier overrides** — one config for all screens.

### Flags
`AUTOSTART = true`, `HAVE_STARS = true`, `DEBUG = Log.isLoggable("LLand", DEBUG)`, `DEBUG_DRAW = false`, `DEBUG_SPEED_MULTIPLIER = 1f`, `DEBUG_IDDQD = false`.

### Loop / timestep
`TimeAnimator` → `step(t_ms, dt_ms)` each frame. `t = t_ms/1000`, `dt = dt_ms/1000`.
**Variable timestep, and gravity is per-frame not per-second** → `dv += G` once per frame. At 60 Hz that is an effective `g = 30dp × 60 = 1800 dp/s²`. **Use a fixed 1/60 s timestep** in TS to reproduce the feel.

Per-frame order:
1. every child implementing `GameView.step(t_ms, dt_ms, t, dt)` (scenery, obstacles, player),
2. floor check: `mPlaying && mDroid.below(mHeight)` → `stop()`,
3. obstacle check + scoring,
4. off-screen recycling,
5. spawn new obstacles if due.

### Player physics (`Player extends ImageView implements GameView`)
```java
if (mBoosting) dv = -BOOST_DV;      // held: constant -550 dp/s (NOT accumulating)
else           dv += G;             // +30 dp/s per frame
dv = clamp(dv, -MAX_V, +MAX_V);     // ±1000 dp/s
y  = translationY + dv*dt;
if (y < 0) y = 0;                   // hard ceiling clamp, no bounce, no death
translationY = y;
rotation = 90 + lerp(clamp(rlerp(dv, MAX_V, -MAX_V)), 90, -90);
```
`rlerp(dv, MAX_V, -MAX_V) = (MAX_V - dv)/(2*MAX_V)`, so `rotation = 180 - 180*x`:
- `dv = -550` (boosting) → **39.5°**
- `dv = 0` → **90°** (droid lies horizontal, head pointing right — the "cruising" pose)
- `dv = +1000` (terminal fall) → **180°** (upside down)

Numbers worth quoting: boost rise = 550 dp/s ≈ 9.17 dp/frame; time to apex from a single tap ≈ 550/30 ≈ 18.3 frames ≈ 0.31 s; apex height ≈ 550²/(2·1800) ≈ 84 dp; terminal fall reached after ~33 frames.

`boost()`: `mBoosting = true`, `dv = -BOOST_DV`, cancel animation, animate `scaleX/Y → 1.25`, `translationZ → PLAYER_Z_BOOST(20dp)` over **100 ms**, **and immediately `setScaleX/Y(1.25)`**.
`unboost()`: `mBoosting = false`, animate `scaleX/Y → 1`, `translationZ → PLAYER_Z(18dp)` over **200 ms**.
⚠️ Because the hitbox is mapped through `getMatrix()`, the **1.25× boost scale enlarges the collision hull by 25 %** while the finger is down.

Player starts at `setX(mWidth/2)`, `setY(mHeight/2)`; `LayoutParams(PLAYER_SIZE, PLAYER_SIZE)` = 40×40 dp.
`setVisibility(GONE)` while not playing; `VISIBLE` on `start(true)`.

### Player hitbox (identical in LLand and MLand)
Normalised 8-gon `sHull` (fractions of the 40 dp box), in order:
```
(0.30, 0.00)  left antenna
(0.70, 0.00)  right antenna
(0.92, 0.33)  right shoulder
(0.92, 0.75)  right hand
(0.60, 1.00)  right foot
(0.40, 1.00)  left foot
(0.08, 0.75)  left hand
(0.08, 0.33)  left shoulder
```
`corners[i] = PLAYER_HIT_SIZE * sHull[i] + inset` (inset = 0 here), then `getMatrix().mapPoints(corners)` → parent (game) coords, so translation + rotation + boost scale all apply.
`below(h)`: any corner `y >= h`.
View outline (elevation shadow only): `setRect(w*0.3, h*0.2, w-w*0.3, h-h*0.2)`.

### Player art — `l_android.xml` (48 × 48 viewport, tinted)
Tinted at runtime: `getBackground().setTintMode(SRC_ATOP); setTint(0xFF00FF00)` → **solid `#00FF00` green droid** in LLand.
Four sub-paths (all `#FFFFFF` before tint):

**Torso + legs** — `M12,36 c0,1.1 0.9,2 2,2 l2,0 l0,7 c0,1.7 1.3,3 3,3 c1.7,0 3,-1.3 3,-3 l0,-7 l4,0 l0,7 c0,1.7 1.3,3 3,3 c1.7,0 3,-1.3 3,-3 l0,-7 l2,0 c1.1,0 2,-0.9 2,-2 L36,16 L12,16 L12,36 z`
→ Canvas: body = rect `(12,16)–(36,38)` with the two bottom corners rounded r=2; legs = two capsules `roundRect(16,38,6,10,r=3)` and `roundRect(26,38,6,10,r=3)` (bottoms reach y=48).

**Left arm** — `M7,16 c-1.7,0 -3,1.3 -3,3 l0,14 c0,1.7 1.3,3 3,3 c1.7,0 3,-1.3 3,-3 L10,19 C10,17.3 8.7,16 7,16 z` → capsule `roundRect(4,16,6,20,r=3)`.
**Right arm** — mirror: capsule `roundRect(38,16,6,20,r=3)`.

**Head + antennae + eyes** — `M31.1,4.3 l2.6,-2.6 c0.4,-0.4 0.4,-1 0,-1.4 c-0.4,-0.4 -1,-0.4 -1.4,0 l-3,3 C27.7,2.5 25.9,2 24,2 c-1.9,0 -3.7,0.5 -5.3,1.3 l-3,-3 c-0.4,-0.4 -1,-0.4 -1.4,0 c-0.4,0.4 -0.4,1 0,1.4 l2.6,2.6 C13.9,6.5 12,10 12,14 l24,0 C36,10 34.1,6.5 31.1,4.3 z` + eye counters `M20.31,9 a1.31,1.31 …` and `M30.31,9 a1.31,1.31 …`.
→ Canvas recipe:
- Dome: `moveTo(29.3,3.3); bezierCurveTo(27.7,2.5, 25.9,2, 24,2); bezierCurveTo(22.1,2, 20.3,2.5, 18.7,3.3); bezierCurveTo(13.9,6.5, 12,10, 12,14); lineTo(36,14); bezierCurveTo(36,10, 34.1,6.5, 31.1,4.3); closePath()`.
- Antennae: round-capped strokes, `lineWidth ≈ 2`, `lineCap='round'`: `(33.0,1.0)→(30.0,4.0)` and `(15.0,1.0)→(18.0,4.0)`.
- Eyes: **holes** r = 1.31 at `(19,9)` and `(29,9)` → build one `Path2D` and fill with `'evenodd'`.
Whole sprite occupies y ∈ [0.3, 48], x ∈ [4, 44] of the 48 box, i.e. it is drawn edge-to-edge in the 40 dp view.

### Obstacles — “pops on stems” (lollipops)
Spawn rule (`mPlaying && (t - mLastPipeTime) > OBSTACLE_PERIOD`, i.e. every ~3 s; on `startPlaying`, `mLastPipeTime = -OBSTACLE_PERIOD` so a pair spawns on frame 1):

```
obstacley = (int)(Math.random() * (H - 2*OBSTACLE_MIN - OBSTACLE_GAP)) + OBSTACLE_MIN
          ∈ [40dp, H - 210dp)                       // top of the intended gap
inset  = 39dp ; yinset = 45dp
d1 = irand(0,250)   // LLand irand = (int)(frand()*(b-a)+a) → [0,249]
d2 = irand(0,250)
```
| piece | size | x | y (final) | y (start) | anim | Z |
|---|---|---|---|---|---|---|
| `s1` top Stem | 12 × (obstacley−45) | `W+39` | `0` | `-h1-45` | translationY→0, delay `d1`, **250 ms** | `18*0.75 = 13.5dp` |
| `p1` top Pop | 90 × 90 | `W` | `h1-39` = obstacley−84 | `-90` | translationY + scale 0.25→1, delay `d1`, **250 ms** | `18dp` |
| `s2` bottom Stem | 12 × (H−obstacley−170−45) | `W+39` | `H-h2` = obstacley+215 | `H+45` | translationY, delay `d2`, **400 ms** | `13.5dp` |
| `p2` bottom Pop | 90 × 90 | `W` | `H-h2-45` = obstacley+170 | `H` | translationY + scale 0.25→1, delay `d2`, **400 ms** | `18dp` |

`W` = game width. Stems are centred under their pop (pop centre x = `W+45`, stem centre x = `W+39+6 = W+45`). ✔
Animations use `ViewPropertyAnimator` defaults → `AccelerateDecelerateInterpolator` (ease-in-out).
`p1`/`p2` also get `setScaleX(frand()<0.5 ? -1 : 1)` (random horizontal mirror) inside `Pop`'s constructor.

⚠️ **Quirk to reproduce or fix deliberately:** the top pop is placed at `h1 - inset` (39) while the top stem ends at `h1 = obstacley - yinset` (45). The 6 dp mismatch means the top pop is **6 dp lower than centred**: its bottom edge is `obstacley + 6`. The bottom pop *is* exactly centred on its stem (top edge `obstacley + 170`). **Effective vertical gap between pop edges = 170 − 6 = 164 dp**, and the gap is shifted 3 dp downward. (MLand has the same bug with a 4 dp offset.)
⚠️ LLand lacks MLand's `OBSTACLE_MIN` sanity clamp, so `obstacley ∈ [40,45)` yields a **negative stem height**. Clamp `h1 = max(0, obstacley - yinset)`.

**Scrolling:** `Obstacle.step` → `translationX -= TRANSLATION_PER_SEC * dt` (100 dp/s), then `getHitRect(hitRect)`.
**Removal:** `translationX + width < 0` → removed from the view tree (and, in LLand, already removed from `mObstaclesInPlay` when `cleared`).

#### `Pop` (the candy)
- Random from `POPS` (resid, spinny flag):
```
l_pop_belt,    0     l_pop_droid,   0     l_pop_pizza,   1
l_pop_stripes, 0     l_pop_swirl,   1     l_pop_vortex,  1     l_pop_vortex2, 1
```
`int idx = 2 * irand(0, POPS.length/2)` → uniform over the 7.
- `mRotate = spinny ? (frand()<0.5 ? -1 : +1) : 0`; `step()` → `rotation += dt * 45 * mRotate` → **45 °/s**.
- Outline: `setOval(pad, pad, w-pad, h-pad)` with `pad = w*0.02`.
- **Collision is a circle, not the AABB:** `cx = (hitRect.left+right)/2`, `cy = (hitRect.top+bottom)/2`, `r = getWidth()/2 = 45dp`; hit if any hull corner satisfies `hypot(x-cx, y-cy) <= r`. (Rotation doesn't change `r`; the AABB centre is stable.)
- `cleared(p)` (base `Obstacle`): true when `hitRect.right < x` for **all** hull corners.

#### Pop artwork (all 100 × 100 viewport, centred at (50,50))
- **`l_pop_belt`** (static): disc r = 47.6 `#D81B60`; upper-left half-disc `#F06292` bounded by the diameter from `(16.28, 83.84)` to `(83.72, 16.40)`; then a **full-bleed horizontal band** `x 0→100, y 41.573→58.663` in `#D81B60` (it deliberately overhangs the circle); then triangle `(0,58.663) → (0,41.573) → (100,41.573)` in `#F06292`. Net look: two-tone pink disc with a magenta ribbon across the middle, ribbon's upper half lighter.
- **`l_pop_droid`** (static): disc r = 50 `#9E9D24`; **upper** half-disc (y ≤ 50) `#C0CA33`; two white eyes r = 4.21 at `(30.776, 24.528)` and `(69.227, 24.528)`. → an Android-head lollipop.
- **`l_pop_pizza`** (spins): 8 pie wedges of 45°, 4 colours in opposite pairs. Using canvas angles θ measured **clockwise from +x with y down**: `[0,45)=#7BAAF7`, `[45,90)=#FFF176`, `[90,135)=#F06292`, `[135,180)=#D81B60`, `[180,225)=#7BAAF7`, `[225,270)=#FFF176`, `[270,315)=#F06292`, `[315,360)=#D81B60`. Radius 50.
- **`l_pop_stripes`** (static): disc r = 50 base `#F57C00`; horizontal bands clipped to the disc: `y∈[0,15.308] #FFA726`, `[15.308,31.631] #FB8C00`, `[31.631,68.370] #F57C00`, `[68.370,84.692] #EF6C00`, `[84.692,100] #E65100`.
- **`l_pop_swirl`** (spins): 12 curved pinwheel blades from the centre to the rim, in path order: `#82B1FF, #76FF03, #76FF03, #303F9F, #FAFAFA, #303F9F, #76FF03, #303F9F, #FAFAFA, #76FF03, #82B1FF, #303F9F`. Each blade is bounded by two spiral-ish cubics — **use `new Path2D(pathData)`**, hand-approximating as 12 × 30° wedges with bowed leading edges is acceptable.
- **`l_pop_vortex`** (spins): disc r = 50 `#FFF176` + one tapered spiral band `#7BAAF7` (path starts at (58.658,89.648), spirals inward through radii 35 → 24.5 → 17.15 → 12.006 → 8.403 and back out). Use raw path data.
- **`l_pop_vortex2`** (spins): disc r = 50 `#D81B60` + spiral `#F06292`. Use raw path data.

#### `Stem` (the stick) — custom `onDraw`
```java
w = canvas.width (=12dp), h = canvas.height
GradientDrawable g; orientation LEFT_RIGHT; gradientCenter(w*0.75f, 0);
g.setColors({0xFFFFFFFF, 0xFFAAAAAA}); g.setBounds(0,0,w,h); g.draw(c);
if (mDrawShadow) {            // only the BOTTOM stem (drawShadow = true)
  mShadow: (0,0) → (w,0) → (w, OBSTACLE_WIDTH/2 + w*1.5) → (0, OBSTACLE_WIDTH/2) → close
  paint 0xFFAAAAAA (solid, antialiased)
}
```
With LLand numbers: shadow left edge depth = 45 dp, right edge depth = 45 + 18 = 63 dp, drawn from the **top** of the bottom stem (the pop's cast shadow).
Canvas: horizontal linear gradient `#FFFFFF → #AAAAAA` across the 12 dp width; then the quad in `#AAAAAA`.

### Scoring
`setScore(int)` → `mScoreField.setText(String.valueOf(score))`. `addScore(1)` once per frame in which **any `Stem`** was `cleared` (`passedBarrier`). One point per pipe pair.
`cleared` is evaluated per obstacle; cleared obstacles are removed from `mObstaclesInPlay` immediately.

### Death / game over
Any hull corner inside a Stem's AABB, or inside a Pop's circle, or any corner `y >= mHeight` → `stop()`:
```java
mAnim.cancel(); mAnim = null; mAnimating = false;
mScoreField.setTextColor(0xFFFFFFFF);
mScoreField.setBackgroundResource(R.drawable.l_scorecard_gameover);   // #FFFF0000, radius 8dp
mTimeOfDay = irand(0, SKIES.length);      // new random sky for the NEXT reset
mFrozen = true;  postDelayed(250ms) { mFrozen = false; }
```
There is **no death animation for the droid** — the whole `TimeAnimator` is cancelled, so everything freezes instantly (scenery, pops, rotation). Only the score chip flips from white/grey to red/white. `poke()`/`unpoke()` are ignored for 250 ms. Next tap → `reset()` (new sky, new scenery, new flip) + `start(true)`.
`DEBUG_IDDQD` (false) would make it invincible.

### HUD (`l_lland.xml` + code)
`TextView @id/score`: `textSize 32sp`, `layout_gravity top|left`, `marginTop 32dp`, `marginLeft 16dp`, `paddingLeft/Right 16dp`, `paddingTop/Bottom 8dp`, background `l_scorecard`.
- `l_scorecard.xml` = `<shape rectangle><corners radius="8dp"/><solid color="#ffffffff"/></shape>`
- `l_scorecard_gameover.xml` = same but `#ffff0000`.
- Playing: text colour `0xFFAAAAAA` (grey on white). Game over: `0xFFFFFFFF` (white on red).
- `translationZ = HUD_Z = 35dp`.
- Before play, `setScoreField` sets `translationY = -500` (parked above the screen). On `start(true)`: `mScoreField.animate().translationY(0).setInterpolator(new DecelerateInterpolator()).setDuration(1500)`.
- Splash: `mSplash.animate().alpha(0).translationZ(0).setDuration(400)` — but the `welcome` TextView is `visibility="gone"` and has no text, so nothing is visible.

### Sky / time of day
```java
DAY=0, NIGHT=1, TWILIGHT=2, SUNSET=3
SKIES = {
  {0xFFc0c0FF, 0xFFa0a0FF}, // DAY      (bottom, top)
  {0xFF000010, 0xFF000000}, // NIGHT
  {0xFF000040, 0xFF000010}, // TWILIGHT
  {0xFFa08020, 0xFF204080}, // SUNSET
};
```
`GradientDrawable(Orientation.BOTTOM_TOP, SKIES[mTimeOfDay])`, `setDither(true)` → vertical linear gradient, **`SKIES[i][0]` at the bottom, `[1]` at the top**. Chosen by `irand(0, SKIES.length)` = `(int)(frand()*4)` → **uniform 25 % each**, re-rolled on every death (applied at the next `reset()`).

### World flip
`mFlipped = frand() > 0.5f; setScaleX(mFlipped ? -1 : 1);` — **50 % of runs the entire world is mirrored horizontally**: obstacles enter from the left, the droid faces left, the sun/moon and scenery scroll the other way. Reproduce this (mirror the whole canvas) for fidelity.

### Scenery generation (20 items, plus optional sun/moon)
```java
mh = mHeight / 6;  cloudless = frand() < 0.25;  N = 20;
for i in 0..19:
  r1 = frand()
  if (HAVE_STARS && r1 < 0.3 && mTimeOfDay != DAY)      -> Star
  else if (r1 < 0.6 && !cloudless)                      -> Cloud
  else                                                  -> Building
```
**Sun** (before the loop): if `(mTimeOfDay == DAY || SUNSET) && frand() > 0.25`:
- a `Star` view with `l_sun` background, size = `l_sun_size` = 45 dp;
- `translationX = frand(45dp, W-45dp)`;
- DAY: `translationY = frand(45dp, H*0.66)`, tint `0` (no tint);
- SUNSET: `translationY = frand(H*0.66, H-45dp)`, `tintMode SRC_ATOP`, `tint 0xC0FF8000` (75 % orange).

**Moon** (only when no sun): `dark = (NIGHT || TWILIGHT)`; `ff = frand()`; show if `(dark && ff < 0.75) || ff < 0.5`:
- `l_moon` background, size 45 dp, `alpha = dark ? 255 : 128`, `scaleX = ±1` random, `rotation = scaleX * frand(5,30)` degrees, `translationX = frand(45dp, W-45dp)`, `translationY = frand(45dp, H-45dp)`.

**Per scenery item layout:**
- `LayoutParams(s.w, s.h)`; `Building` → `gravity = BOTTOM`; Star/Cloud → `gravity = TOP` with
  - Star: `topMargin = (int)(r*r * H)`, `r = frand()` (biased to the top),
  - Cloud: `topMargin = (int)(1 - r*r*H/2) + H/2` → lands in `[1, H/2]` (top half). *(The `1 -` is an upstream typo; the expression is `(int)(1 - r²H/2) + H/2`.)*
- `translationX = frand(-lp.width, W + lp.width)`.

**Building**: `w = irand(20dp, 250dp)`; `z = i/N`; `translationZ = SCENERY_Z*(1+z) = 6..12dp`; `v = 0.85f * z`; background colour `Color.HSVToColor({175°, 0.25f, 1*z})` → **teal, brightness = depth** (z=0 → black, z=1 → `#BFFFF9`); `h = irand(20dp, H/6)`.
**Cloud**: `w = h = irand(10dp, 100dp)`, `z = 0`, `v = frand(0.15f, 0.5f)`, background `l_cloud` (or `l_cloud_off` with **1 %** chance), `alpha = 0x40` (25 %).
**Star**: `w = h = irand(3dp, 5dp)` → 3 or 4 dp, `v = z = 0` (**stars never move**), background `l_star`.
**Sun/Moon** are `Star` instances → `v = 0` → static.

`Scenery.step`: `translationX -= TRANSLATION_PER_SEC * dt * v`. Recycle: `translationX + s.w < 0` → `translationX = getWidth()`.

**Parallax summary:** stars/sun/moon `v=0` (fixed), clouds `v ∈ [0.15,0.5]`, buildings `v = 0.85·(i/20)` ∈ [0, 0.85], obstacles/player `v = 1.0` (100 dp/s).

### Scenery art (48 × 48 viewport unless noted)
- **`l_star`**: 4-point sparkle, 8-vertex polygon `(30.25,17.75) (24,4) (17.75,17.75) (4,24) (17.75,30.25) (24,44) (30.25,30.25) (44,24)`, fill `#FFFFFF`.
- **`l_sun`**: (1) disc r = 16 at (24,24) fill `#FFFFFFCC` (80 % white); (2) an 8-point ray ring, fill `#FFFFFF40` (25 % white), outer path `(40,30.6)→(46.6,24)→(40,17.4)→(40,8)→(30.6,8)→(24,1.4)→(17.4,8)→(8,8)→(8,17.4)→(1.4,24)→(8,30.6)→(8,40)→(17.4,40)→(24,46.6)→(30.6,40)→(40,40)→close`, with a circular **hole** r = 12 at (24,24) (use `evenodd`).
- **`l_moon`**: crescent, fill `#FFF2F2FF`. Outer boundary = right half of the circle centre (18,24) r = 20 (from (18,44) through (38,24) to (18,4)); inner boundary = the curve `(12,4.9) → C(20.1,7.5)(26,15) → (26,24) → S(-5.9,16.5)(-14,19.1) → (12,43.1)`. Lit limb on the right, horns pointing left; randomly mirrored by `scaleX=-1` and tilted 5–30°.
- **`l_cloud`**: single path `M38.7,20.1 C37.3,13.2 31.3,8 24,8 c-5.8,0 -10.8,3.3 -13.3,8.1 C4.7,16.7 0,21.8 0,28 c0,6.6 5.4,12 12,12 l26,0 c5.5,0 10,-4.5 10,-10 C48,24.7 43.9,20.4 38.7,20.1 z`, fill `#FFFFFF`, drawn at 25 % alpha. Bbox x 0→48, y 8→40.
- **`l_cloud_off`** (24 × 24 viewport, 1 % easter egg): the Material "cloud off" icon — a cloud outline with a diagonal slash, fill `#FFFFFF`. Use raw path data.

### Input model
- `onTouchEvent`: `ACTION_DOWN` → `poke()`; `ACTION_UP` → `unpoke()`. **Tap-and-hold anywhere on the whole view** = continuous rise at 550 dp/s; release = fall. No multi-touch handling (single pointer).
- `onTrackballEvent`: same (down/up).
- `onKeyDown`/`onKeyUp`: `DPAD_CENTER`, `DPAD_UP`, `SPACE`, `ENTER`, `BUTTON_A`.
- `poke()`: if `mFrozen` return; if `!mAnimating` → `reset(); start(true)`; else if `!mPlaying` → `start(true)`; then `mDroid.boost()`.
- `unpoke()`: if `mFrozen || !mAnimating` return; `mDroid.unboost()`.
- The view is focusable and grabs focus in `LLandActivity`.

### Audio / haptics
**None.** LLand has no `Vibrator`, no `SoundPool`, no `MediaPlayer`, no `res/raw`. Death is silent.

### Attract mode
`onSizeChanged` → `stop(); reset(); if (AUTOSTART) start(false)`. `start(false)` hides the droid and starts the animator but never sets `mPlaying`, so **scenery scrolls and the sky is shown, but no obstacles spawn and there is no score**, until the first tap.

### Sound/`DEBUG_DRAW` overlay (off by default)
`onDraw` (only when `DEBUG_DRAW`) draws: white 4 px dots + lines for the hull polygon; `0x8000FF00` stroke outlines of every obstacle's hit rect (and circles `cx,cy,r` for Pops) at `strokeWidth = density`; and black 20 px text `"obstacles: …"` at (20,100).

## 1.3 Bonus egg in the same module — “Webdriver Torso” (Android L **Preview**)
`com.android_l.egg.preview.PlatLogoActivity`, label `@string/l_webdriver_torso` = **“Webdriver Torso”**, nickname `l_preview_nickname` = **“L Preview”**, theme `Theme.Wallpaper.NoTitleBar.Fullscreen`.
- Root `Torso extends FrameLayout`, background `Color.WHITE`.
- Two child `View`s, added in order i=0,1: `setBackgroundColor(i%2==0 ? Color.BLUE : Color.RED)` → **child 0 = `#0000FF`, child 1 = `#FF0000`**.
- A `TextView`, `textColor BLACK`, `textSize 14sp`, `Typeface.create("monospace", BOLD)`, `MATCH_PARENT × WRAP_CONTENT`, `Gravity.BOTTOM|LEFT`, padded by system-bar/cutout insets plus a rounded-corner offset `radius - sqrt(radius²/2)` on left/bottom.
- Every **1000 ms** (`postDelayed(this, 1000)` while attached): text = `String.format("android_%s.flv - build %s", Build.VERSION.CODENAME, Build.VERSION.INCREMENTAL)`; each non-TextView child gets a new random rect: `w = rand*parentW`, `h = rand*parentH`, `x = rand*(parentW-w)`, `y = rand*(parentH-h)`, tweened over **200 ms** linear (`RefreshTorso.kt`, `ValueAnimator.ofFloat(0,1)`, interpolating x/y/width/height).
- **Long-press on child 0 (the BLUE rect)** → writes `"l_egg_mode"` timestamp → launches `com.android_k.egg.DessertCase` (KitKat's Dessert Case, via `Class.forName`) → `finish()`. Failure logs `"Couldn't catch a break."`
- Module icon `l_android_preview_fg.xml` (108 dp adaptive-icon foreground, 100 viewport, group scale 0.4156 / translate 29.22): two rects `0,0,50,100 #FF0000` and `50,0,50,100 #0000FF`; `l_android_preview_logo.xml` is a layer-list of `@color/l_android_preview_bg` (`#FFFFFF`) + that foreground inset `-9dp`.

## 1.4 Lollipop — canvas implementation plan
1. **Units**: treat 1 dp = 1 logical CSS px; size the canvas to the container. Everything above is already in dp.
2. **Fixed timestep**: accumulator with `STEP = 1/60`. Gravity is `dv += 30` **per step** (not `*dt`); position is `y += dv*STEP`. Render interpolation is optional. Do *not* use `dv += g*dt` or the game will feel wrong at 120 Hz.
3. **State machine**: `ATTRACT` (scenery scrolls, no droid, no pipes) → `PLAYING` → `DEAD` (frozen 250 ms, red score chip) → tap → new `reset()` + `PLAYING`.
4. **Entity lists**: `scenery[]` (20 + optional sun/moon, each `{kind, x, y, w, h, z, v, tint}`), `obstacles[]` (`{type:'stem'|'pop', x, y, w, h, art, rot, rotDir, scaleX, scaleY, spawnAnim{delay,dur,t0}, id}`), single `player {y, dv, boosting, rot, scale}`.
5. **Draw order (ascending Z)**: sky vertical gradient → sun/moon (Z 0) → stars (Z 0) → clouds (Z 0, α 0.25) → buildings (Z 6–12, ascending by `z`) → top/bottom Stems (Z 13.5) → Pops (Z 18) → Player (Z 18, 20 while boosting → draw player **last** while boosting, **under** the pops otherwise) → HUD score chip.
6. **World mirror**: if `flipped`, wrap everything in `ctx.setTransform(-1,0,0,1,W,0)`.
7. **Pop-in animation**: for 250 ms (top) / 400 ms (bottom) after `delay`, ease-in-out interpolate `y` and `scale` (0.25→1) — the pops scroll left at 100 dp/s *during* the animation too (their `step()` runs regardless).
8. **Collision**: build the 8 hull points in local 40×40 space, transform by `translate(x,y) → rotate(rot) → scale(s)`, then: Stems = point-in-AABB, Pops = `dist ≤ 45`. Floor = any point `y ≥ H`. Ceiling = clamp `y ≥ 0`.
9. **Art**: `Path2D` from the raw `pathData` for the pops, star, sun, moon, cloud, droid; primitives (roundRect / arc / gradient) where I gave recipes.
10. **PlatLogo screen**: separate scene. Timeline driver with the tap counter; re-roll a FLAVOURS pair on every tap after the first; the disc + stick + wordmark + highlight are 4 draw calls.

## 1.5 Lollipop — exact strings & colours
```
l_lland                = "L Land"            (activity label, DO NOT TRANSLATE)
l_android_nickname     = "Lollipop"
l_webdriver_torso      = "Webdriver Torso"
l_preview_nickname     = "L Preview"
l_android_logo_bg      = #9B27AF
l_android_preview_bg   = #FFFFFF
SharedPreferences key  = "l_egg_mode" (long, System.currentTimeMillis())
```
```
Player tint      #FF00FF00 (SRC_ATOP over the white droid)
Stem gradient    #FFFFFFFF -> #FFAAAAAA      Stem shadow   #FFAAAAAA
Pop art          see §1.2 per drawable
Scorecard        #FFFFFFFF r=8dp / playing text #FFAAAAAA
Scorecard over   #FFFF0000 r=8dp / dead text    #FFFFFFFF
Skies            DAY #FFc0c0FF→#FFa0a0FF, NIGHT #FF000010→#FF000000,
                 TWILIGHT #FF000040→#FF000010, SUNSET #FFa08020→#FF204080  (bottom→top)
Sun tint (SUNSET) 0xC0FF8000 SRC_ATOP ; moon #FFF2F2FF @ α255 (dark) / α128 (light)
Cloud α 0x40 ; star/sun/moon #FFFFFF
PlatLogo stick   gradient #FFFFFFFF -> #FFAAAAAA, shadow #FFAAAAAA
PlatLogo highlight oval 0x10FFFFFF
Debug overlay    hull #FFFFFFFF, boxes 0x8000FF00, text #FF000000
```

## 1.6 Lollipop — upstream files used
```
eggs/Lollipop/src/main/AndroidManifest.xml
eggs/Lollipop/src/main/java/com/android_l/egg/PlatLogoActivity.java
eggs/Lollipop/src/main/java/com/android_l/egg/LLand.java
eggs/Lollipop/src/main/java/com/android_l/egg/LLandActivity.java
eggs/Lollipop/src/main/java/com/android_l/egg/SnapshotProvider.java
eggs/Lollipop/src/main/java/com/android_l/egg/AndroidLollipopEasterEgg.java
eggs/Lollipop/src/main/java/com/android_l/egg/preview/PlatLogoActivity.java
eggs/Lollipop/src/main/java/com/android_l/egg/preview/RefreshTorso.kt
eggs/Lollipop/src/main/java/com/android_l/egg/preview/SnapshotProvider.kt
eggs/Lollipop/src/main/res/values/lland_config.xml
eggs/Lollipop/src/main/res/values/lland_strings.xml
eggs/Lollipop/src/main/res/values/l_android_preview.xml
eggs/Lollipop/src/main/res/layout/l_lland.xml
eggs/Lollipop/src/main/res/drawable/l_platlogo.xml
eggs/Lollipop/src/main/res/drawable/l_android.xml
eggs/Lollipop/src/main/res/drawable/l_scorecard.xml
eggs/Lollipop/src/main/res/drawable/l_scorecard_gameover.xml
eggs/Lollipop/src/main/res/drawable/l_pop_belt.xml
eggs/Lollipop/src/main/res/drawable/l_pop_droid.xml
eggs/Lollipop/src/main/res/drawable/l_pop_pizza.xml
eggs/Lollipop/src/main/res/drawable/l_pop_stripes.xml
eggs/Lollipop/src/main/res/drawable/l_pop_swirl.xml
eggs/Lollipop/src/main/res/drawable/l_pop_vortex.xml
eggs/Lollipop/src/main/res/drawable/l_pop_vortex2.xml
eggs/Lollipop/src/main/res/drawable/l_star.xml
eggs/Lollipop/src/main/res/drawable/l_sun.xml
eggs/Lollipop/src/main/res/drawable/l_moon.xml
eggs/Lollipop/src/main/res/drawable/l_cloud.xml
eggs/Lollipop/src/main/res/drawable/l_cloud_off.xml
eggs/Lollipop/src/main/res/drawable/l_icon.xml
eggs/Lollipop/src/main/res/drawable/l_android_preview_fg.xml
eggs/Lollipop/src/main/res/drawable/l_android_preview_logo.xml
```
(`SnapshotProvider.java` confirms the PlatLogo composition independently: `size = min(min(w,h),500dp) - 200dp`, stick `32dp`, same gradient/shadow math, same FLAVORS table.)

---

# Egg 2 — Marshmallow (Android 6.0, API 23)

## 2.1 PlatLogo screen (`com.android_m.egg.PlatLogoActivity`)

- Same `size` formula as Lollipop: `(int)(min(min(wPx,hPx), 600dp) - 100dp)`, centred, theme `Theme.Wallpaper.NoTitleBar.Fullscreen` (transparent, wallpaper behind).
- **No stick.** A single `View im`: `translationZ = 20`, initial `scaleX = scaleY = 0.5`, `alpha = 0`, outline `setOval(0,0,w,h)` (an earlier `setOval(8dp, 8dp, w-8dp, h-8dp)` is immediately overwritten).
- Background = `RippleDrawable(ColorStateList.valueOf(0xFFFFFFFF), platlogo, null)` where `platlogo` is an **anonymous Drawable** drawn procedurally:
  ```java
  hue = (float) Math.random();                       // random per launch
  bgPaint = HSBtoColor(hue, 0.4f, 1f);               // lighter, less saturated
  fgPaint = HSBtoColor(hue, 0.5f, 1f);               // darker/more saturated
  r = canvasWidth / 2f;
  c.drawCircle(r, r, r, bgPaint);                    // full disc
  c.drawArc(0, 0, 2r, 2r, 135, 180, false, fgPaint); // filled circular SEGMENT
  M.setBounds(0,0,w,h); M.draw(c);                   // R.drawable.m_platlogo_m
  ```
  `drawArc(..., useCenter=false)` with a FILL paint fills the segment between the chord and the arc. Android angles are clockwise with y-down, so **135° → 315° is the upper-left half-disc**: the disc is split by the diameter from lower-left `(r - r·cos45, r + r·sin45)` to upper-right, with the **upper-left half in `fgPaint`** and the **lower-right half in `bgPaint`**. Ripple colour is white.
  `HSBtoColor(h,s,b)` is the classic 6-sector HSV→RGB (full source in the file), alpha forced to `0xFF`.
- **`m_platlogo_m.xml`** (48 × 48 viewport) — the “M” wordmark:
  - shadow `M13.5,34.5 l13.3,13.3 c11,-1.3 19.7,-10 21,-21 L34.5,13.5 L13.5,34.5 z` fill `#08000000` (3 % black, lower-right region)
  - `M24,24 c0,0 0,2.4 0,5.2 s0,5.2 0,5.2 L34.5,24 V13.5 L24,24 z` fill `#FFFFFF` (right arm)
  - `M24,24 L13.5,13.5 V24 L24,34.5 c0,0 0,-2.4 0,-5.2 S24,24 24,24 z` fill `#EEEEEE` (left arm)
  - `M13.5,34.5 l10.5,0 l-10.5,-10.5 z` fill `#DDDDDD` (left foot facet)
  - `M34.5,34.5 l0,-10.5 l-10.5,10.5 z` fill `#DDDDDD` (right foot facet)
  → A geometric “M” occupying x,y ∈ [13.5, 34.5] with faceted white/grey shading.
- **First tap** (or first key press) → `showMarshmallow(im)`:
  ```java
  fg = getDrawable(R.drawable.m_platlogo);
  fg.setBounds(0,0, im.getWidth(), im.getHeight());
  fg.setAlpha(0); im.getOverlay().add(fg);
  ObjectAnimator.ofInt(fg, "alpha", 255)
      .setInterpolator(PathInterpolator(0f,0f,0.5f,1f))
      .setDuration(300).start();
  ```
  The marshmallow fades in **on top of** the M over **300 ms** and stays. Further taps do nothing except fire the white ripple; `mTapCount++` each tap.
- **`m_platlogo.xml`** (48 × 48) — the marshmallow candy:
  - body `M34.9,13.2 c-0.8,-0.8 -4.2,-2.4 -10.9,-2.4 s-10.1,1.6 -10.9,2.4 c-0.8,0.8 -2.4,4.2 -2.4,10.9 s1.6,10.1 2.4,10.9 c0.8,0.8 4.2,2.4 10.9,2.4 s10.1,-1.6 10.9,-2.4 c0.8,-0.8 2.4,-4.2 2.4,-10.9 S35.6,14 34.9,13.2 z` fill `#FFFFFF` → a squircle spanning `(10.7,10.8)–(37.3,37.2)`, corner radius ≈ 6.7 with slightly convex edges (superellipse-ish). Canvas approximation: `roundRect(10.7,10.8,26.6,26.4, r≈6.5)` or a superellipse `n≈4`.
  - top face `M34.7,13.7 c0,0.8 -1.2,1.5 -3.1,2.1 c-1.9,0.5 -4.6,0.8 -7.6,0.8 s-5.6,-0.3 -7.6,-0.8 c-1.9,-0.5 -3.1,-1.2 -3.1,-2.1 s1.2,-1.5 3.1,-2.1 c1.9,-0.5 4.6,-0.8 7.6,-0.8 s5.6,0.3 7.6,0.8 C33.5,12.1 34.7,12.9 34.7,13.7 z` fill `#EBEBEB` → an ellipse centred `(24, 13.7)`, rx ≈ 10.7, ry ≈ 1.6 (the marshmallow's top surface).
  - two white antennae (thin tapered strokes): right `M30,13 c-0.1,0 -0.1,0 -0.2,0 c-0.4,-0.1 -0.7,-0.6 -0.6,-1 l1.3,-5.5 c0.1,-0.4 0.6,-0.7 1,-0.6 c0.4,0.1 0.7,0.6 0.6,1 l-1.3,5.5 C30.7,12.7 30.4,13 30,13 z` (from ≈(31.7,5.9) to ≈(29.9,12.9)); left mirrored, from ≈(16.5,5.9) to ≈(18.2,12.9). Both `#FFFFFF`, ≈1.4 units thick, round ends.
- **Entry animation** on attach: `im.animate().scaleX(1).scaleY(1).alpha(1)`, `PathInterpolator(0,0,0.5,1)`, duration **500 ms**, startDelay **800 ms**. (0.5 → 1.0 scale, 0 → 1 alpha.)
- **Long press** (only when `mTapCount >= 5`): writes `"m_egg_mode"` = `System.currentTimeMillis()` once (wrapped in try/catch, logs `"Can't write settings"`), then `startActivity(MLandActivity)` + `finish()`. Failure logs `"No more eggs."`
- **Keyboard**: any key-down except BACK → if `mKeyCount == 0` call `showMarshmallow(im)`; `++mKeyCount`; if `mKeyCount > 2` → perform long-click (when `mTapCount > 5`) else perform click.

## 2.2 The game — `MLand` ("Marshmallow Land")

`com.android_m.egg.MLand extends FrameLayout`. Comment in source: *“It's like LLand, but "M"ultiplayer.”*

### Structural differences from LLand
| | LLand | MLand |
|---|---|---|
| players | 1 (`mDroid`) | 1–6 (`mPlayers`), `DEFAULT_PLAYERS=1`, `MIN_PLAYERS=1`, `MAX_PLAYERS=6` |
| obstacle art | 7 lollipop discs | marshmallow head + random antenna/eyes/mouth |
| stem colour | white→#AAA | #BCAAA4→#A1887F (1 % candy-cane) |
| pop hit radius | `getWidth()/2` | `getWidth()/3` (art is 2/3 of container) |
| pop spin | 4 of 7 spin at 45°/s | **never** (`mRotate` stays 0) |
| scenes | buildings only | CITY buildings / TX cacti / ZRH mountains |
| death | whole game stops | per-player death; game stops when all dead |
| HUD | one chip, 32sp | N chips, 22sp bold, tinted per player |
| splash | unused | play button + 3-2-1-0 countdown |
| haptics | none | `Vibrator.vibrate(80ms)` on each death |
| touch overlay | none | `SHOW_TOUCHES = true` |
| `irand` | `(int)lerp(frand(),a,b)` (truncate) | `Math.round(frand(a,b))` (round) |
| `mTimeOfDay` | `irand(0,4)` → uniform 4 | `irand(0,3)` → P(DAY)=P(SUNSET)=1/6, P(NIGHT)=P(TWILIGHT)=1/3 |

### All constants (`res/values/mland_config.xml`, dp)
```
m_obstacle_spacing      380dp   → OBSTACLE_PERIOD = (int)(380/100) = 3 s
m_translation_per_sec   100dp
m_boost_dv              550dp
m_player_hit_size        40dp
m_player_size            40dp
m_obstacle_width        130dp   → Pop container
m_obstacle_stem_width     8dp
m_obstacle_gap          140dp
m_obstacle_height_min    48dp   → SANITY CLAMP: 48 <= 130/2=65 ⇒ OBSTACLE_MIN = 66dp
m_building_width_min     50dp
m_building_width_max    250dp
m_building_height_min    20dp
m_cloud_size_min         10dp
m_cloud_size_max        100dp
m_sun_size               45dp   → also the moon
m_star_size_min           3dp
m_star_size_max           5dp
m_G                      30dp   → per-frame dv increment
m_max_v                1000dp
m_scenery_z               6dp   (declared but UNUSED — the setTranslationZ call is commented out)
m_obstacle_z             18dp
m_player_z               18dp
m_player_z_boost         20dp
m_hud_z                  10dp
```
Derived: `inset = (130-8)/2 = 61dp`, `yinset = 130/2 = 65dp`.
Physics constants are **identical to LLand** (G 30/frame, boost 550, max_v 1000, scroll 100 dp/s, period 3 s, player 40 dp, same 8-point hull, same rotation curve, same 100/200 ms scale animations).

### Pipe geometry (per spawn, every ~3 s)
```
obstacley = (int)(frand() * (H - 2*OBSTACLE_MIN - OBSTACLE_GAP)) + OBSTACLE_MIN
          = (int)(frand() * (H - 132dp - 140dp)) + 66dp   ∈ [66dp, H-206dp)
d1 = irand(0,250) → Math.round(frand()*250) ∈ [0,250]
d2 = irand(0,250)
```
| piece | size | x | final y | start y | anim | scaleY | Z |
|---|---|---|---|---|---|---|---|
| `s1` top Stem | 8 × (obstacley−65) | `W+61` | `0` | `-h1-65` | →0, delay `d1`, **250 ms** | 1 | 13.5dp |
| `p1` top Pop | 130 × 130 | `W` | `h1-61` = obstacley−126 | `-130` | delay `d1`, **250 ms** | **0.25 → −1** (flipped) | 18dp |
| `s2` bottom Stem | 8 × (H−obstacley−140−65) | `W+61` | `H-h2` = obstacley+205 | `H+65` | delay `d2`, **400 ms** | 1 | 13.5dp |
| `p2` bottom Pop | 130 × 130 | `W` | `H-h2-65` = obstacley+140 | `H` | delay `d2`, **400 ms** | 0.25 → 1 | 18dp |

Both pops scale **x and y** from 0.25; the top pop's y-scale goes negative (−0.25 → −1) so the marshmallow is vertically mirrored on top.
⚠️ Same asymmetry quirk: top pop centre = `obstacley−61` vs stem end `obstacley−65` → 4 dp low; **effective gap between pop edges = 140 − 4 = 136 dp**.

### Pop (`MLand.Pop`) — marshmallow
```java
setBackgroundResource(R.drawable.m_mm_head);
antenna = pick(ANTENNAE);                       // ALWAYS present
if (frand() > 0.5f) {                           // 50 % get eyes
    eyes = pick(EYES);
    if (frand() > 0.8f) mouth = pick(MOUTHS);   // 20 % of those → 10 % overall get a mouth
}
outline: setOval(w/6, w/6, w-w/6, h-w/6);
r = getWidth()/3;                               // 130/3 = 43.33dp  == the visible marshmallow radius
mRotate is never assigned -> 0 -> no spin
onDraw: background (head) then antenna, eyes, mouth, each setBounds(0,0,canvasW,canvasH)
```
```
ANTENNAE = { m_mm_antennae, m_mm_antennae2 }
EYES     = { m_mm_eyes, m_mm_eyes2 }
MOUTHS   = { m_mm_mouth1, m_mm_mouth2, m_mm_mouth3, m_mm_mouth4 }
pick(l) = l[irand(0, l.length-1)]
```
**All marshmallow art is in a 24 × 24 viewport**, scaled to the full 130 dp box. The head occupies the middle 2/3 (x,y ∈ [4,20] of 24) — which is exactly why `r = getWidth()/3`.

- **`m_mm_head`**: body `M18.6,5.4 C18.1,5 16,4 12,4 S5.9,5 5.4,5.4 C5,5.9 4,8 4,12 s1,6.1 1.4,6.6 C5.9,19 8,20 12,20 s6.1,-1 6.6,-1.4 C19,18.1 20,16 20,12 S19,5.9 18.6,5.4 z` fill `#FFFFFF` — a 16×16 squircle centred (12,12). Expanded (S/s are smooth-cubic shorthands):
  `(18.6,5.4) →C(18.1,5)(16,4)→ (12,4) →C(8,4)(5.9,5)→ (5.4,5.4) →C(5,5.9)(4,8)→ (4,12) →C(4,16)(5,18.1)→ (5.4,18.6) →C(5.9,19)(8,20)→ (12,20) →C(16,20)(18.1,19)→ (18.6,18.6) →C(19,18.1)(20,16)→ (20,12) →C(20,8)(19,5.9)→ (18.6,5.4)`.
  Plus top-face shading: ellipse centre `(12, 5.7)`, rx `6.6`, ry `1.7`, fill `#33000000` (20 % black).
- **`m_mm_antennae`**: two thin white sticks splaying up from the head — right `M15.6,5.3 …L16,1.4 …l-0.8,3.3` (from ≈(16.2,1.1) to ≈(15.9,5.0)), left `M8.4,5.3 …L7.1,1.6 …l0.8,3.3` (from ≈(7.6,1.1) to ≈(8.2,5.0)). Fill `#FFFFFF`, ≈0.9 units wide, round ends.
- **`m_mm_antennae2`**: two short **diagonal** white sticks crossing outward — right from ≈(17.7,2.3) to ≈(15.6,5.4); left from ≈(6.2,2.3) to ≈(8.4,5.4).
- **`m_mm_eyes`**: two black discs r = 0.7 at `(7.4,12)` and `(16.6,12)`, `#FF000000`.
- **`m_mm_eyes2`**: two “happy/closed” eyes — small crescent paths at `(7.4,11.7)` and `(16.6,11.7)`, `#FF000000`.
- **`m_mm_mouth1`**: a wide flat smile line spanning x ≈ 5.4 → 18.6 at y ≈ 15.3–15.7, `#FF000000`.
- **`m_mm_mouth2`**: a broader shallow smile, x ≈ 5.3 → 18.7, y ≈ 15.1–16.3.
- **`m_mm_mouth3`**: tiny open smile `M10.3,15.2 c0.1,0.9 0.7,1.7 1.7,1.7 s1.6,-0.8 1.7,-1.7` (filled → a small crescent at x 10.3–13.7, y 15.2–16.9).
- **`m_mm_mouth4`**: black disc r = 0.9 at `(12,16)` — an “o” mouth.

### Stem (`MLand.Stem`) — the stick, custom `onDraw`
```java
id = mCurrentPipeId;                       // for scoring
mGradient: LEFT_RIGHT, gradientCenter(w*0.75,0)
if (frand() < 0.01f) {                     // 1 % candy cane
   gradient {0xFFFFFFFF, 0xFFDDDDDD}
   mJandystripe path, paint 0xFFFF0000 (MULTIPLY filter 0xFFFF0000)
} else {
   gradient {0xFFBCAAA4, 0xFFA1887F}       // normal brown "chocolate" stick
}
mPaint = 0xFF000000 with PorterDuffColorFilter(0x22000000, MULTIPLY)  // ~13 % black shadow
onDraw:
  gradient over (0,0,w,h)
  if candy cane: stripe quad (0,w)→(w,0)→(w,2w)→(0,3w)→close, repeated every 4w down the stem
  if (mDrawShadow):                        // BOTTOM stem only
     (0,0) → (w,0) → (w, OBSTACLE_WIDTH*0.4 + w*1.5) → (0, OBSTACLE_WIDTH*0.4) → close
```
With `OBSTACLE_WIDTH = 130dp`, `w = 8dp`: shadow depth left = 52 dp, right = 52 + 12 = 64 dp, measured from the top of the bottom stem.

### Players
- Colours, assigned round-robin by `sNextColor` (with a fix that re-syncs `sNextColor` from the last existing player's colour):
```java
sColors = { 0xFFDB4437, 0xFF3B78E7, 0xFFF4B400, 0xFF0F9D58, 0xFF7B1880, 0xFF9E9E9E };
// 0xFF78C557 is commented out upstream
```
- `m_android.xml` is **byte-identical to `l_android.xml`** (same 48 × 48 droid, same 4 sub-paths, see §1.2), tinted `SRC_ATOP` with the player colour.
- Same hull, same `prepareCheckIntersections`, same `below`, same physics, same boost/unboost (100 ms / 200 ms, scale 1.25).
- `reset()`: `setY(H/2 + (int)(Math.random()*PLAYER_SIZE) - PLAYER_SIZE/2)` → `y ∈ [H/2−20dp, H/2+19dp]`; `setScore(0)`; `mBoosting=false`; `dv=0`.
- `realignPlayers()`: `x = (W - (N-1)*PLAYER_SIZE)/2`, then `p.setX(x); x += PLAYER_SIZE` → players stand **side by side, 40 dp apart, group-centred**. Each player has a fixed x for the whole run.
- `start()`: `mAlive = true`.
- `die()`: `mAlive = false` (the score-card recolouring is commented out upstream).
- **Dead-player animation**: `step()` short-circuits to `setTranslationX(getTranslationX() - TRANSLATION_PER_SEC*dt)` → the corpse **scrolls left at 100 dp/s with the world**, keeping its last rotation and scale, and stops colliding/scoring (“float away with the garbage”). It is never removed.
- `startPlaying()` gives each player `boost(-1,-1)` immediately followed by `unboost()` → an initial `dv = -550` kick without holding (`// start you off flying! … not forever, though`).

### Scoring
`mCurrentPipeId` increments once per spawned pipe pair; each `Stem` stores `id = mCurrentPipeId`.
Per player per frame: `maxPassedStem = max(id of every Stem where cleared(p))`; if `maxPassedStem > p.mScore` → `p.addScore(1)`.
`cleared(p)` = `hitRect.right < x` for all hull corners. **Cleared obstacles stay in `mObstaclesInPlay`** (unlike LLand) and are only removed when `translationX + width < 0` (where the repo also fixed an upstream index bug — see the `// Fix:` comment and `i = getChildCount()-1`).
`setScore` writes `DEBUG_IDDQD ? "??" : String.valueOf(score)`.

### Death / game over
```java
// per player, when below(H) or intersecting an obstacle:
thump(i, 80);   // vibrate 80 ms
p.die();
// when livingPlayers == 0:
stop();
```
`stop()`: `mAnim.cancel(); mAnim=null; mAnimating=false; mPlaying=false;` re-roll `mTimeOfDay = irand(0, SKIES.length-1)` and `mScene = irand(0, SCENE_COUNT)` for the next reset; `mFrozen = true` for **250 ms**; and `p.die()` for every player.
`thump(playerIndex, ms)`: skipped entirely if `AudioManager.getRingerMode() == RINGER_MODE_SILENT`; if a game controller is bound to that player and has a vibrator → `dev.getVibrator().vibrate(ms * CONTROLLER_VIBRATION_MULTIPLIER=2f)` = **160 ms**; else `mVibrator.vibrate(80ms, AudioAttributes{USAGE_GAME})`.
Requires `<uses-permission android:name="android.permission.VIBRATE" />`.
**There are no sounds at all** — no `res/raw`, no `SoundPool`.

### Splash / play button / countdown (`m_mland.xml`)
```
FrameLayout (root)
├── MLand @id/world (match_parent)
├── FrameLayout @id/welcome  match_parent, background #a0000000, clickable, visibility=gone
│   └── FrameLayout @id/play_button  72dp×72dp, centred, background @drawable/m_ripplebg,
│       │                            clickable, focusable, onClick="startButtonPressed"
│       ├── ImageView @id/play_button_image 48dp×48dp, centred, fitCenter, src=m_play, tint #000000
│       └── TextView  @id/play_button_text  wrap, centred, alpha 0, textColor #000000, textSize 40dp
└── LinearLayout @id/player_setup  wrap, top|center_horizontal, horizontal, gravity center_vertical
    ├── ImageButton @id/player_minus_button 48dp, padding 10dp, centerInside, src=m_minus,
    │                                       style Widget.Material.Button.Borderless, onClick="playerMinus"
    ├── LinearLayout @id/scores  wrap × 64dp, horizontal, padding 12dp, clipToPadding=false
    └── ImageButton @id/player_plus_button  48dp, padding 10dp, centerInside, src=m_plus, onClick="playerPlus"
```
- `m_ripplebg.xml` = `<selector>`: focused → `<ripple color="#DDDDDD">` over an oval `#FFFFFF`; otherwise oval `#AAAAAA`.
- `m_play.xml` (48 dp, 24 viewport): triangle `M8,5 L8,19 L19,12 Z` `#FF000000` (+ transparent 24×24 pad path), tinted `#000000`.
- `m_plus.xml` (48 viewport): rects `(4,20,40,8)` and `(20,4,8,40)`, `#FFFFFF`. `m_minus.xml`: only `(4,20,40,8)`.
- `showSplash()`: clickable, `alpha 0 → 1` over **1000 ms**, VISIBLE; play image alpha 1, play text alpha 0; button enabled + `requestFocus()`.
- `hideSplash()`: clickable=false, `alpha → 0`, `translationZ → 0` over **300 ms**, then GONE.
- `start(true)` (`startButtonPressed` hides the ± buttons first): disables the play button, `playImage.animate().alpha(0)` and `playText.animate().alpha(1)` (300 ms default), sets `mCountdown = 3`, then a self-reposting runnable:
  ```java
  run() { if (mCountdown == 0) startPlaying(); else postDelayed(this, 500);
          playText.setText(String.valueOf(mCountdown)); mCountdown--; }
  ```
  → text shows **“3”, “2”, “1”, “0” at 500 ms intervals**; `startPlaying()` fires at the moment “0” is set, i.e. **1500 ms after pressing play**.
- `startPlaying()`: `mPlaying = true; t = 0; mLastPipeTime = -OBSTACLE_PERIOD; hideSplash(); realignPlayers(); mTaps = 0;` then per player `VISIBLE; reset(); start(); boost(-1,-1); unboost();`.
- `start(false)` (attract mode) also sets every player `INVISIBLE`.
- `MLandActivity.onResume` → `mLand.onAttachedToWindow()` (reset + autostart), `updateSplashPlayers()`, `showSplash()`; `onPause` → `mLand.stop()`.
- `updateSplashPlayers()`: N==1 → minus INVISIBLE / plus VISIBLE (+focus); N==MAX_PLAYERS(6) → minus VISIBLE / plus INVISIBLE (+focus); else both VISIBLE.
- `MLandActivity.onCreate` also calls `mLand.setupPlayers(numControllers)` if any game controllers are connected (one player per pad).
- `mScoreFields` (`@id/scores`) gets a `LayoutTransition` with **duration 250 ms** (animated add/remove of score chips).

### HUD score chips (`m_mland_scorefield.xml`)
`TextView @id/score`: `wrap_content × match_parent`, `textStyle bold`, `textSize 22sp`, `gravity center`, `textColor #FFAAAAAA`, `paddingStart/End 12dp`, `paddingTop/Bottom 4dp`, background `m_scorecard`, `elevation = @dimen/m_hud_z` (10dp).
- `m_scorecard.xml` = `<shape rectangle><corners radius="4dp"/><solid color="#ffffffff"/></shape>` (**4dp**, vs Lollipop's 8dp).
- Per player: `mScoreField.getBackground().setColorFilter(color, SRC_ATOP)` → the chip is filled with the player colour; `setTextColor(luma(color) > 0.7f ? 0xFF000000 : 0xFFFFFFFF)`.
- `luma(c) = 0.2126·R/255 + 0.7152·G/255 + 0.0722·B/255`. Result: **only `#F4B400` (luma 0.708) gets black text**; `#DB4437` 0.389, `#3B78E7` 0.451, `#0F9D58` 0.478, `#7B1880` 0.206, `#9E9E9E` 0.620 all get white text.

### Sky / scene
Same `SKIES` table and same `DAY/NIGHT/TWILIGHT/SUNSET` indices as LLand, same `BOTTOM_TOP` gradient with dither.
```java
SCENE_CITY = 0, SCENE_TX = 1, SCENE_ZRH = 2, SCENE_COUNT = 3
mScene = irand(0, SCENE_COUNT)   // Math.round(frand(0,3)) → P(0)=1/6, P(1)=1/3, P(2)=1/3, P(3)=1/6
                                 // case 3 falls through to default → SCENE_CITY
                                 // ⇒ P(CITY)=1/3, P(TX)=1/3, P(ZRH)=1/3
```
Re-rolled in `stop()`, applied at the next `reset()`.

### Scenery generation — identical structure to LLand with these changes
Same `mh = H/6`, `cloudless = frand()<0.25`, `N = 20`, same sun/moon logic and same `l_*`→`m_*` drawables (**`m_star`, `m_sun`, `m_moon`, `m_cloud`, `m_cloud_off` are byte-identical to their `l_` counterparts apart from the file name**), same `topMargin` formulas, same `translationX = frand(-lp.width, W+lp.width)`, same recycling.
The third branch becomes:
```java
switch (mScene) {
  case SCENE_ZRH: s = new Mountain(...); break;
  case SCENE_TX:  s = new Cactus(...);   break;
  case SCENE_CITY:
  default:        s = new Building(...); break;
}
s.z = (float) i / N;
// s.setTranslationZ(PARAMS.SCENERY_Z * (1+s.z));   ← COMMENTED OUT ("no more shadows for these things")
s.v = 0.85f * s.z;
if (mScene == SCENE_CITY) { s.setBackgroundColor(Color.GRAY); s.h = irand(BUILDING_HEIGHT_MIN, mh); }
int c = (int)(255f * s.z);
Drawable bg = s.getBackground();
if (bg != null) bg.setColorFilter(Color.rgb(c,c,c), PorterDuff.Mode.MULTIPLY);
```
So **all three ground-scenery types get a depth-based brightness multiply `× z`** (z=0 → black silhouette, z≈1 → full colour). In canvas this is exactly `ctx.filter = 'brightness(z)'`, or multiply each source colour by `z`.
- `Building` (CITY): `w = irand(50dp, 250dp)`; `h = irand(20dp, H/6)`; base colour `Color.GRAY` (`#FF888888`) × brightness(z) → a grey slab, `gravity BOTTOM`.
- `Cactus extends Building`: `setBackgroundResource(pick(CACTI))`, `w = h = irand(BUILDING_WIDTH_MAX/4, BUILDING_WIDTH_MAX/2)` → `irand(62,125)` px-of-250dp ≈ **62.5–125 dp square**, `gravity BOTTOM`.
  `CACTI = { m_cactus1, m_cactus2, m_cactus3 }`
- `Mountain extends Building`: `setBackgroundResource(pick(MOUNTAINS))`, `w = h = irand(125, 250)` px-of-250dp ≈ **125–250 dp square**; the constructor sets `z = 0` but `reset()` overwrites it with `i/N`.
  `MOUNTAINS = { m_mountain1, m_mountain2, m_mountain3 }`
- `Cloud`: `w = h = irand(10dp,100dp)`, `z=0`, `v = frand(0.15,0.5)`, `m_cloud` (1 % `m_cloud_off`), `alpha 0x40`. **Note `z=0` but Clouds get no colour filter** (the filter is applied only in the third `else` branch).
- `Star`: `w = h = irand(3dp,5dp)` → 3, 4 or 5 (MLand rounds), `v = z = 0`.

### Cactus / mountain art (48 × 48 viewport)
- **`m_cactus1`**: a 3-armed saguaro. Base silhouette `#0D904F`; shading overlays `#097138` (mid) and `#055524` (dark) drawn as separate strips down the trunk/arms. Trunk centred x≈19.7–31, arms at x≈9.8–17.3 (left, short) and x≈29.7–37.9 (right, taller). Bbox roughly x 9.8→37.9, y 9→51 (extends below the viewport).
- **`m_cactus2`**: a rounded 2-arm cactus, `#0D904F` body with `#097138` / `#055524` facets; **plus a flower at the top-right**: an 8-point starburst `#AB47BC`, a second offset starburst `#BA68C8`, and a centre dot r = 0.4 at `(38.3,19)` in `#FFA726`. Bbox x 7.8→41.1, y 2.7→44.2.
- **`m_cactus3`**: a shorter multi-arm cactus, `#0D904F` + `#097138` + `#055524`. Bbox x 10.8→38.9, y 15.9→51.
- **`m_mountain1`**: full triangle `(0,48) (24,12) (48,48)` `#4DB6AC`; right-face triangle `(24,12) (14.1,48) (48,48)` `#00897B`; snow cap `#CCCCCC` `(24,12) (31.7,23.5) (26.4,18.5) (25.5,19.4) (24,18.1) (19.4,28.6)`; snow highlight `#FFFFFF` `(24,12) (15.9,24.2) (18.2,26.1) (19.4,28.6)`.
- **`m_mountain2`**: same two triangles, right face `(24,12) (10.8,48) (48,48)`; no snow.
- **`m_mountain3`**: **three overlapping peaks**, some vertices outside the 48 box (y up to 59.1) and are clipped by the view bounds. Peak A: `(0.1,48) (21.1,16.5) (42.1,48)` `#4DB6AC` + `(21.1,16.5) (13.6,48) (42.1,48)` `#00897B` + snow `#FFFFFF` `(13.2,28.4)(21.1,16.5)(20.1,20.5)` + `#CCCCCC` `(20.1,20.5)(24.6,21.9)(21.1,16.5)`. Peak B: `(2.1,55.8)(27.6,17.4)(53.2,55.8)` + `(27.6,17.4)(18.6,55.8)(53.2,55.8)` + snow `#FFFFFF` `(18.6,31)(27.6,17.4)(26.1,24.1)` + `#CCCCCC` `(26.1,24.1)(28.3,21.9)(32,23.9)(27.6,17.4)`. Peak C: `(8.9,59.1)(28.8,29.2)(48.8,59.1)` + `(28.8,29.2)(21.8,59.1)(48.8,59.1)` + snow `#FFFFFF` `(25.1,34.9)(28.8,29.2)(26.7,38.2)` + `#CCCCCC` `(26.7,38.2)(32.2,34.3)(28.8,29.2)`.

### Touch-overlay (`SHOW_TOUCHES = true`, drawn in `MLand.onDraw`)
```java
mTouchPaint: FILL, antialiased, base 0x80FFFFFF
mPlayerTracePaint: STROKE, antialiased, strokeWidth = 2*dp, base 0x80FFFFFF
for each player with mTouchX > 0:
    paint colour = 0x80FFFFFF & p.color         // 50 % alpha player colour
    drawCircle(mTouchX, mTouchY, 100, mTouchPaint)      // radius 100 PIXELS (not dp)
    x2 = p.getX() + p.getPivotX();  y2 = p.getY() + p.getPivotY();
    angle = PI/2 - atan2(x2-x1, y2-y1);
    x1 += 100*cos(angle);  y1 += 100*sin(angle);
    drawLine(x1, y1, x2, y2, mPlayerTracePaint)
```
i.e. a 100 px-radius translucent disc at the touch point plus a 2 dp line from that disc's rim toward the player's centre. `mTouchX/mTouchY` are set by `boost(x,y)` and cleared (`-1`) by `unboost()`. This does render: `willNotDraw()` returns `!DEBUG` (true), but the view has a background (the sky), which clears `PFLAG_SKIP_DRAW`, so `onDraw` runs. `step()` calls `invalidate()` because `SHOW_TOUCHES` is true.

### Input model
```java
onTouchEvent(ev):
   actionIndex = ev.getActionIndex(); x = ev.getX(actionIndex); y = ev.getY(actionIndex);
   playerIndex = (int)(getNumPlayers() * (x / getWidth()));
   if (mFlipped) playerIndex = getNumPlayers() - 1 - playerIndex;
   ACTION_DOWN / ACTION_POINTER_DOWN -> poke(playerIndex, x, y)
   ACTION_UP   / ACTION_POINTER_UP   -> unpoke(playerIndex)
```
→ **The screen is split into N equal vertical columns; touching/holding a column flaps that player. Full multi-touch** (each finger tracked independently via `getActionIndex`). With N=1, tap anywhere.
`onTrackballEvent`: down/up → `poke(0)`/`unpoke(0)`.
`onKeyDown`/`onKeyUp` (`DPAD_CENTER`, `DPAD_UP`, `SPACE`, `ENTER`, `BUTTON_A`): `player = getControllerPlayer(ev.getDeviceId())` → the index of that gamepad in `mGameControllers` (0 if unknown).
`getGameControllers()` enumerates `InputDevice.getDeviceIds()` and keeps those with `SOURCE_GAMEPAD` or `SOURCE_JOYSTICK`; `getControllerPlayer(id)` = `indexOf(id)`, or 0 if out of range.
`poke(i,x,y)`: `if (mFrozen) return; if (!mAnimating) reset(); if (!mPlaying) start(true); else { p = getPlayer(i); if (p==null) return; p.boost(x,y); mTaps++; }`
`unpoke(i)`: `if (mFrozen || !mAnimating || !mPlaying) return; p.unboost();`
`setLayoutDirection(LAYOUT_DIRECTION_LTR)` is forced in the constructor.

### Attract mode & autostart
`onAttachedToWindow()` and `onSizeChanged()` both do `dp = density; stop(); reset(); if (AUTOSTART) start(false);` → sky + scrolling scenery, players INVISIBLE (and, since `mAlive == false`, drifting left), no obstacles, splash shown by the Activity's `onResume`.

## 2.3 Bonus egg — M Preview / “Shruggy”
`com.android_m.egg.preview.PlatLogoActivity`: same tap-count + long-press(≥5) skeleton, but the artwork is a **static** `RippleDrawable(white, m_platlogo_preview, null)`, no procedural hue, no marshmallow fade-in, entry animation `scale 0.5→1, alpha 0→1`, 500 ms, delay 800 ms. Long press writes `"m_egg_mode"` and launches `ShruggyActivity`.
`m_platlogo_preview.xml` (480 dp, 48 viewport) = the `m_icon` art with orange instead of pink: two half-discs `#F57C00` / `#FF9800` split along the `(8.4,39.6)–(39.6,8.4)` diameter, an overlay wedge `#F57C00` at `fillAlpha 0.33` (`M45.9,25.9 L34,14 L14,34 l11.9,11.9 C36.5,45 45,36.5 45.9,25.9 z`), then the same 4-facet white “M” (`#FFFFFF`, `#EEEEEE`, `#DDDDDD`, `#DDDDDD`) at `[14,34]`.
`m_icon.xml` is the same art with `#E91E63` / `#F06292`.
`ShruggyActivity`: `Theme.NoDisplay`, shows `Toast.LENGTH_SHORT` of `@string/m_regrettable_lack_of_easter_egg` = **`¯\_(ツ)_/¯`** (stored in XML as `¯\\_(ツ)_/¯`), logs `"Hey, it's just a preview; what did you expect?"` under tag `SystemUI`, then `finish()`.

## 2.4 Marshmallow — canvas implementation plan
1. **Reuse the LLand engine.** Identical physics, timestep requirement (fixed 1/60 s because `dv += G` per frame), pipe cadence (3 s), scroll (100 dp/s), hull, rotation curve, boost scaling, world flip, sky table, scenery loop. Parameterise only: `POP_SIZE=130`, `STEM_W=8`, `GAP=140`, `MIN=66` (after the sanity clamp), `POP_HIT_R = POP_SIZE/3`, `BUILDING_W_MIN=50`, `HUD_Z=10`.
2. **Add a `Player[]`** (1–6). Fixed x per player from `realignPlayers`. Per-player `alive`, `score`, `colour`, `touchX/Y`.
3. **Death is per-player**: on hit/floor → vibrate(80 ms) (use `navigator.vibrate(80)`), `alive=false`; the corpse keeps scrolling left at 100 dp/s. Only when `livingPlayers === 0` → global `stop()` (freeze everything, 250 ms input lock, re-roll sky+scene).
4. **Scoring via pipe ids**: give each spawned pair an incrementing `id`, store it on both stems; per player per frame take `max(id of cleared stems)` and `if (max > score) score++`. Don't remove cleared obstacles from the active list.
5. **Input**: `pointerdown`/`pointerup` with pointer ids; column index `= floor(N * x / W)`, mirrored when `flipped`. Keep a `Map<pointerId, playerIndex>` so `pointerup` releases the right player. Keyboard: Space/Enter/ArrowUp → player 0.
6. **Scene selection** once per run: `CITY | TX | ZRH`, each 1/3; sky `DAY|NIGHT|TWILIGHT|SUNSET` with weights 1/6, 1/3, 1/3, 1/6.
7. **Depth tint**: `ctx.filter = 'brightness(z)'` (or pre-multiply colours) for buildings/cacti/mountains only — not clouds/stars/sun/moon.
8. **Marshmallow pop**: draw `m_mm_head` (squircle + 20 %-black top ellipse), then optional antenna/eyes/mouth, all from a 24-unit viewport scaled to 130 dp. Roll the decorations once at spawn: antenna always, eyes at p=0.5, mouth at p=0.5×0.2=0.1. Top pop is drawn with `scaleY = -1`.
9. **Splash scene**: `#a0000000` veil, 72 dp `#AAAAAA` circle with the black play triangle, ± buttons; on press, cross-fade triangle→text and tick “3”→“2”→“1”→“0” every 500 ms, then start.
10. **Touch overlay**: 100 **px** (not dp) radius disc at 50 % alpha in the player colour + a 2 dp line from the disc rim to the player centre, drawn above everything except the HUD.

## 2.5 Marshmallow — exact strings & colours
```
m_mland                            = "Marshmallow Land"      (activity label)
m_android_nickname                 = "Marshmallow"
m_preview_land                     = "Shruggy"
m_preview_nickname                 = "M Preview"
m_regrettable_lack_of_easter_egg   = "¯\_(ツ)_/¯"
SharedPreferences key              = "m_egg_mode" (long)
```
```
Player colours   #FFDB4437  #FF3B78E7  #FFF4B400  #FF0F9D58  #FF7B1880  #FF9E9E9E
                 (text: white, except #F4B400 → #FF000000)
Stem gradient    #FFBCAAA4 -> #FFA1887F     (1 %: #FFFFFFFF -> #FFDDDDDD + #FFFF0000 stripes)
Stem shadow      #FF000000 × MULTIPLY 0x22000000
Marshmallow      body #FFFFFF, top face #33000000, features #FF000000, antennae #FFFFFF
Cacti            #0D904F / #097138 / #055524 ; flower #AB47BC / #BA68C8 / #FFA726
Mountains        #4DB6AC / #00897B / #FFFFFF / #CCCCCC
City buildings   #FF888888 × brightness(z)
Skies            identical to LLand (DAY/NIGHT/TWILIGHT/SUNSET, bottom→top)
Splash veil      #a0000000 ; play button #AAAAAA (focused #FFFFFF, ripple #DDDDDD) ; glyph #000000
Score chip       #FFFFFFFF r=4dp, tinted SRC_ATOP with the player colour, default text #FFAAAAAA
Touch overlay    0x80FFFFFF & playerColour, trace stroke 2dp
PlatLogo disc    HSB(randHue,0.4,1) lower-right / HSB(randHue,0.5,1) upper-left, ripple #FFFFFFFF
PlatLogo "M"     #FFFFFF #EEEEEE #DDDDDD #DDDDDD, shadow #08000000
PlatLogo marshmallow  #FFFFFF body, #EBEBEB top face, #FFFFFF antennae
m_icon           #E91E63 / #F06292 / #E91E63@33% ; m_platlogo_preview #F57C00 / #FF9800 / #F57C00@33%
```

## 2.6 Marshmallow — upstream files used
```
eggs/Marshmallow/src/main/AndroidManifest.xml
eggs/Marshmallow/src/main/java/com/android_m/egg/PlatLogoActivity.java
eggs/Marshmallow/src/main/java/com/android_m/egg/MLand.java
eggs/Marshmallow/src/main/java/com/android_m/egg/MLandActivity.java
eggs/Marshmallow/src/main/java/com/android_m/egg/SnapshotProvider.java
eggs/Marshmallow/src/main/java/com/android_m/egg/AndroidMarshmallowEasterEgg.java
eggs/Marshmallow/src/main/java/com/android_m/egg/preview/PlatLogoActivity.java
eggs/Marshmallow/src/main/java/com/android_m/egg/preview/ShruggyActivity.java
eggs/Marshmallow/src/main/res/values/mland_config.xml
eggs/Marshmallow/src/main/res/values/strings.xml
eggs/Marshmallow/src/main/res/layout/m_mland.xml
eggs/Marshmallow/src/main/res/layout/m_mland_scorefield.xml
eggs/Marshmallow/src/main/res/drawable/m_platlogo.xml
eggs/Marshmallow/src/main/res/drawable/m_platlogo_m.xml
eggs/Marshmallow/src/main/res/drawable/m_platlogo_preview.xml
eggs/Marshmallow/src/main/res/drawable/m_android.xml
eggs/Marshmallow/src/main/res/drawable/m_mm_head.xml
eggs/Marshmallow/src/main/res/drawable/m_mm_antennae.xml
eggs/Marshmallow/src/main/res/drawable/m_mm_antennae2.xml
eggs/Marshmallow/src/main/res/drawable/m_mm_eyes.xml
eggs/Marshmallow/src/main/res/drawable/m_mm_eyes2.xml
eggs/Marshmallow/src/main/res/drawable/m_mm_mouth1.xml
eggs/Marshmallow/src/main/res/drawable/m_mm_mouth2.xml
eggs/Marshmallow/src/main/res/drawable/m_mm_mouth3.xml
eggs/Marshmallow/src/main/res/drawable/m_mm_mouth4.xml
eggs/Marshmallow/src/main/res/drawable/m_cactus1.xml
eggs/Marshmallow/src/main/res/drawable/m_cactus2.xml
eggs/Marshmallow/src/main/res/drawable/m_cactus3.xml
eggs/Marshmallow/src/main/res/drawable/m_mountain1.xml
eggs/Marshmallow/src/main/res/drawable/m_mountain2.xml
eggs/Marshmallow/src/main/res/drawable/m_mountain3.xml
eggs/Marshmallow/src/main/res/drawable/m_star.xml
eggs/Marshmallow/src/main/res/drawable/m_sun.xml
eggs/Marshmallow/src/main/res/drawable/m_moon.xml
eggs/Marshmallow/src/main/res/drawable/m_cloud.xml
eggs/Marshmallow/src/main/res/drawable/m_cloud_off.xml
eggs/Marshmallow/src/main/res/drawable/m_play.xml
eggs/Marshmallow/src/main/res/drawable/m_plus.xml
eggs/Marshmallow/src/main/res/drawable/m_minus.xml
eggs/Marshmallow/src/main/res/drawable/m_ripplebg.xml
eggs/Marshmallow/src/main/res/drawable/m_scorecard.xml
eggs/Marshmallow/src/main/res/drawable/m_icon.xml
```
Also consulted for shared/base behaviour (no impact on these two eggs):
```
eggs/Base/src/main/java/com/android_b/egg/PlatLogoActivity.kt
eggs/Base/src/main/java/com/android_b/egg/BaseEasterEgg.kt
eggs/Base/src/main/java/com/android_b/egg/AndroidBaseEasterEgg.kt
eggs/Base/src/main/res/values/strings.xml
```

---

# License & attribution

- Repo `hushenghao/AndroidEasterEggs` reports **`Apache-2.0`** via the GitHub API; the root `LICENSE` file is the verbatim *Apache License, Version 2.0, January 2004*.
- Every source file in both modules carries an AOSP header: `Copyright (C) 2014 The Android Open Source Project` (LLand, `l_*` drawables, Lollipop `PlatLogoActivity` — the latter says 2010, matching AOSP's long-lived `PlatLogoActivity`) and `Copyright (C) 2015 The Android Open Source Project` (MLand, `m_*` drawables, `lland_config.xml`/`mland_config.xml`/layouts). These are **derivatives of AOSP `frameworks/base` `core/java/com/android/internal/app/PlatLogoActivity.java`, `packages/SystemUI` / `LLand.java` / `MLand.java`**, also Apache-2.0.
- Repo-local (non-AOSP) additions you should attribute to `hushenghao/AndroidEasterEggs` rather than to Google: the `com.dede.basic.SpUtils` egg-unlock persistence, the `SnapshotProvider` preview renderers, `EdgeToEdgeCompat`/`WindowInsets` handling in `LLandActivity`/`MLandActivity`, `eggs/Lollipop/.../preview/RefreshTorso.kt`, the `AndroidLollipopEasterEgg` / `AndroidMarshmallowEasterEgg` Hilt providers, resource prefixing (`l_` / `m_` / `b_`), the MLand off-screen-removal index fix (see the `// Fix:` comment in `MLand.step`), the `Player.sNextColor` fix (references upstream issue #387), and the `irand`/`OBSTACLE_MIN` differences from stock AOSP.
- For a TypeScript re-implementation: keep the Apache-2.0 NOTICE/attribution, reproduce the `Copyright (C) 2014/2015 The Android Open Source Project` headers on the ported logic, and state changes (per Apache-2.0 §4(b)). The vector artwork is AOSP material under the same licence.
</task_result>
</task>