<task id="ses_f79847599ffeZwaxuPvhTvL4YZ" state="completed">
<task_result>
Nothing was written to the workspace (sources were mirrored to a scratch dir under `%TEMP%\opencode\repo` for reading only). Report follows.

---

# Android Easter Eggs — Research Report (batch: Q → CinnamonBun + AndroidNext/RocketLauncher)

Repo: `hushenghao/AndroidEasterEggs` @ `main`. Every module lives under `eggs/<Name>/src/main/`. All are near-verbatim ports of AOSP `frameworks/base/packages/SystemUI/…/PlatLogoActivity` + `com.android.internal.app` egg code, re-namespaced to `com.android_<x>.egg` and re-plumbed onto the app's Hilt/DI provider system (`com.dede.basic.provider.EasterEgg`). `Settings.System.EGG_MODE` is replaced by `SpUtils` SharedPreferences in most modules (Baklava is the exception — it writes the real `Settings.System`).

## Shared infrastructure (`eggs/Base`)

`eggs/Base` is **not** a base class for the modules in this batch — it only covers API 1–8 (Base/Petit Four/Cupcake/Donut/Eclair/Froyo). Its `PlatLogoActivity.kt` is an abstract Compose activity: centred `Image` sized `min(maxWidth,maxHeight)*0.6`, `contentDescription = "Android $versionName: $nickname"`, single tap → `toast(desc)`. No animation. Modules from Q onward do **not** extend it; each has its own standalone `PlatLogoActivity`.

What *is* shared across the batch:
- `core/analog-clock/…/AnalogClock.java` — AOSP `AnalogClock` (API 7 vintage) ported to `java.util.Calendar`; `onDraw` rotates `mHour/12*360` and `mMinutes/60*360` about the view centre; `now()` is `protected` so S/T can override it.
- `core/system-colors/…/SystemColorDrawables.kt` — `create(ctx, colorName, bg, fgRes, fallbackRes)`: resolves `android:color/<colorName>` reflectively; if found, tints the background drawable (`GradientDrawable.setColor` or `PorterDuff.SRC_IN`) and returns `LayerDrawable(bg, fg)`; otherwise returns the static fallback drawable.
- `ResourcesUtils.getSystemColor(ctx, name)` — the same lookup used to fill colour arrays.

---

# 1. `eggs/Q` — Android 10, API 29 (README: "Android 10 , API 29"; shipped through API 30 devices)

**Codename confirmed:** `q_android_nickname` = **"Quince Tart"**. Egg name `q_egg_name` = **"Icon Quiz"**. Timeline text: `"Q.\nReleased publicly as Android 10 in September 2019."`

## PlatLogo behaviour
`eggs/Q/src/main/java/com/android_q/egg/PlatLogoActivity.java`

Not a tap-count egg — it's a **drag-and-align puzzle**. Layout `q_platlogo_layout.xml` (RelativeLayout, transparent bg, `clipChildren=false`):
| id | size | placement |
|---|---|---|
| `text` | 400dp × wrap, `adjustViewBounds` | `centerInParent`, `translationY=-100dp`, `marginBottom=-80dp`, src `q_android_logotype`, tint `?android:attr/textColorPrimary` |
| `one` | 200dp × 200dp | `below=text`, `alignLeft=text`, `marginLeft=24dp` |
| `zero` | 200dp × 200dp | `below=text`, `alignRight=text`, `marginRight=34dp` |

Root background = `BackslashDrawable(50dp)` with `setAlpha(0x20)` (≈12.5 %).
Nav/status bar colours forced to `0`; theme `QAppTheme` = `Theme.DeviceDefault.Light.NoActionBar.Fullscreen` + `windowLightNavigationBar=true`, cutout `shortEdges`.

**Interaction (per-view `OnTouchListener`):**
- `ACTION_DOWN` → `animate().scaleX/Y(1.1)`, `bringChildToFront`, record grab offset. If `now - mClickTime < 350 ms` (double-tap) → `ObjectAnimator(ROTATION, r → r+3600)` duration **10 000 ms**; `mClickTime = 0`.
- `ACTION_MOVE` → follow finger; haptic `TEXT_HANDLE_MOVE`.
- `ACTION_UP/CANCEL` → `animate().scaleX/Y(1)`, cancel rot anim, `testOverlap()`.
- `one` uses `OffsetRotationAnimatorTouchListener(offset = 315f)` — identical but the spin target is `r + 3600 + 315`, so the glyph ends on the required 315° without a manual nudge.

**`testOverlap()`** (`w = zero.width`):
```
targetX = zero.x + w*0.2 ; targetY = zero.y + w*0.3
if hypot(targetX-one.x, targetY-one.y) < w*0.2 && |one.rotation % 360 - 315| < 15:
    animate one → (zero.x + w*0.2, zero.y + w*0.3); rotation = rotation%360 then animate → 315
    haptic CONFIRM ; backslash.startAnimating() ; mClicks++
    if mClicks >= 7 → launchNextStage()
else: backslash.stopAnimating()
```
`onPause` resets `mClicks = 0` and stops the scroll. `launchNextStage()` writes `q_egg_mode = System.currentTimeMillis()` once, then `startActivity(QuaresActivity)` + `finish()`.

**`BackslashDrawable`** — a 50dp × 50dp `ALPHA_8` tile, `BitmapShader(REPEAT,REPEAT)`, driven by `TimeAnimator`. Tile path (w=h=tile size):
`(0,0) → (w/2,0) → (w,h/2) → (w,h) → close`, plus `(0,h/2) → (w/2,h) → (0,h) → close`, filled `0xFF000000`. Animation: `mMatrix.postTranslate(deltaTime/4f, 0)` each frame → **scrolls right at 250 px/s** (0.25 px per ms).

**`ZeroDrawable`** — 24×24 viewport scaled to bounds; `Paint{STROKE, width 4f, Cap.SQUARE}`; `drawCircle(12,12,10)`.
**`OneDrawable`** — same paint; on Q+ a `Path`: `moveTo(12, 21.83)`, `rLineTo(0, -19.67)`, `rLineTo(-5, 0)` (i.e. `M12,21.83 L12,2.16 L7,2.16`). Pre-Q: two `drawLine`s.
Both take colour from `setTintList(...).getDefaultColor() | 0xFF000000`.

So the "solution" is: the ⌐-shaped "1" rotated 315° becomes the **tail slash of a Q**, docked onto the "0".

## Secondary screen — `QuaresActivity` (nonogram / "Icon Quiz")
`quares/QuaresActivity.kt` + `quares/Quare.kt`, layout `q_activity_quares.xml`, theme `QuaresTheme = Theme.Wallpaper.NoTitleBar.Fullscreen`.

- Board: `Quare(width=16, height=16, depth=1)` → 16×16 binary grid.
- `GridLayout` with `columnCount = 17`, `rowCount = 17`. Cell size = `(smallestScreenWidthDp - 25) / (16 + 0.5) * density`, margins 1px on all sides.
- Cell (0,0) hidden. Row 0 = **column clues** (`textRotation = 90f`); portrait → `height = 96dp`; landscape → `height /= 2` and `showText = false`. Column 0 = **row clues**; landscape → `width = 96dp`; portrait → `width /= 2`, `showText = false`.
- `ClueView`: `TextPaint{ textSize = 14f*density, bold, Align.CENTER, color = q_clue_text }`; background `q_clue_bg` (unsolved) / `q_clue_bg_correct` (solved). Clue text = run-lengths joined with `"-"` (e.g. `3-2-5`); empty row → `"0"`.
- `PixelButton` (CompoundButton) background `q_pixel_bg` selector (`exitFadeDuration=100`): pressed → `q_red`; checked → `q_pixel_on`; else → `q_pixel_off`.
- On each toggle, the touched row-clue and column-clue re-check; if both correct → `checkVictory()` (full `data.contentEquals(user)`).
- Victory button: `label.text = resName.replace(Regex("^.*/"), "")`, 32dp compound drawable tinted `label.currentTextColor`, `textSize=18dp`, `drawablePadding=8dp`, `padding=12dp`, `backgroundTint=q_clue_bg_correct`, `textColor=q_clue_text`, `marginBottom=48dp`, `elevation=30dp`. Tapping it → `newPuzzle()`.
- Puzzle source: random entry from `R.array.q_puzzles` (≈200 entries: `q` ×5, `android:drawable/stat_*`, `ic_*`, `perm_group_*`, `com.android.settings:drawable/*`, `com.android.systemui:drawable/*`). Up to 4 tries to get a resolvable, non-duplicate id; fallback `android.R.drawable.stat_sys_warning`; blank renders (`data.sum()==0`) → `recreate()`.
- Quantisation (`Quare.loadAndQuantize`): render drawable into 16×16 `ALPHA_8`, tinted `0xFF000000`; `f = alpha/255; f *= 1.25; f = min(f,1); out = round(f)*255` → **binary threshold at alpha ≥ 0.4**.

## Colours (`res/values/q_colors.xml`, night overrides)
| name | light | night |
|---|---|---|
| `q_emerald` | `#3ddc84` | — |
| `q_red` (actually yellow) | `#f8c734` | — |
| `q_navy` | `#073042` | — |
| `q_tan` | `#eff7cf` | — |
| `q_pixel_off` | `#FFFFFF` | `#000000` |
| `q_pixel_on` | `#000000` | `#FFFFFF` |
| `q_clue_bg` | `q_tan` | `q_navy` |
| `q_clue_text` | `q_navy` | `q_tan` |
| `q_clue_bg_correct` | `q_emerald` | `q_emerald` |
| `q_icon_fg` | `q_emerald` | — |
| `q_android_logo_color` | `#000` | — |

Icon: `q_icon.xml` = layer-list(`q_icon_bg` = solid `q_clue_text` (#073042), + `q` inset 5dp). `q.xml` (90dp, viewport 24): the "Q" ring `M12,6 a6,6 0 1,1 -6,6 …` + outer `8.5` arc, and the tail `M19.45,22.89 l-10.25,-10.25 l-2.66,2.66 l-1.77,-1.76 l4.43,-4.43 l12.02,12.02 l-1.77,1.76 z`, both `q_icon_fg`.

## Canvas port suggestion
Two canvases. **(a)** PlatLogo: DOM/canvas layer with 3 draggable sprites; `one` drawn as a 3-unit polyline in a 24-unit space with `lineWidth = 4/24*size`, `lineCap='square'`; `zero` as `arc(12,12,10)`. Backslash backdrop = `createPattern` from a 50px offscreen tile, `pattern.setTransform(new DOMMatrix().translateSelf(t*0.25,0))` per frame (t in ms). Rotation spring: on double-tap set `targetRot += 3600 (+315 for one)`, animate over 10 s linear, cancel on pointer-up. Snap test exactly as above. **(b)** Nonogram: pure DOM grid or one canvas; render icons procedurally by rasterising your own 16×16 sprite library (you cannot use `android:drawable/*` on the web — build ~20 hand-made 16×16 bitmaps and threshold at 0.4).

**Complexity: M** (PlatLogo S, nonogram M — the puzzle *art library* is the real work).

---

# 2. `eggs/R` — Android 11, API 30, **Red Velvet Cake**

**Confirmed:** `r_android_nickname` = "Red Velvet Cake"; `r_egg_name` = "Cat Controls (Collection)"; `r_app_name` = "Android R Easter Egg"; timeline `"R.\nReleased publicly as Android 11 in September 2020."`

## PlatLogo — the volume dial ("turn it up to 11")
`eggs/R/src/main/java/com/android_r/egg/PlatLogoActivity.java`. Full-screen `FrameLayout` (bg `0xFFFF0000`, never visible) containing a `BigDialView extends ImageView` with a custom `BigDialDrawable`.

Constants (verbatim from AOSP, including the deliberate shadowing bug):
```
COLOR_GREEN      = 0xff3ddc84
COLOR_BLUE       = 0xff4285f4      (declared, unused)
COLOR_NAVY       = 0xff073042
COLOR_ORANGE     = 0xfff86734
COLOR_CHARTREUSE = 0xffeff7cf      (declared, unused)
COLOR_LIGHTBLUE  = 0xffd7effe
BigDialView.STEPS      = 11   (static, used by touch/performClick)
BigDialDrawable.STEPS  = 10   (instance field, shadows inside draw/setValue)
VALUE_CHANGE_MAX = 1f/11
UNLOCK_TRIES = 3
R_EGG_UNLOCK_SETTING = "r_egg_mode"
```

**`draw()`** (bounds w×h, `w2=w/2, h2=h/2, radius=w/4`):
1. `canvas.drawColor(night ? COLOR_NAVY : COLOR_LIGHTBLUE)`. Night = `Configuration.isNightModeActive()`.
2. Wedge shadow: `save(); rotate(45, w2, h2); clipRect(w2, h2-radius, min(w,h), h2+radius)`; `LinearGradient(w2,h2 → min(w,h),h2)` from `gradientColor` to `0x00FFFFFF & gradientColor`, `gradientColor = night ? 0x60000020 : (0x10FFFFFF & COLOR_NAVY)`; `drawPaint`; `restore`.
3. `drawCircle(w2, h2, radius)` filled `COLOR_GREEN`.
4. Ticks: `cx = w*0.85`; for `i in 0..9`: `angle = valueToAngle(i/10)`; `rotate(-angle, w2, h2)`; `drawCircle(cx, h2, i <= userLevel ? 20 : 5, night ? COLOR_LIGHTBLUE : COLOR_NAVY)`.
5. "11" glyph when `mElevenAnim > 0`: `size2 = (0.5 + 0.5*anim) * w/14`; `cx11 = cx + size2/4`; bounds `[cx11±size2, h2±size2]`; tint `COLOR_ORANGE` with `alpha = clamp(0xFF*2*anim,0,0xFF)`.
6. Pointer dimple: `rotate(-valueToAngle(mValue), w2, h2)`; `drawCircle(w - radius - dimple*2, h2, dimple, WHITE)` with `dimple = w2/12 = w/24`.

Angle mapping: `valueToAngle(v) = (1-v)*(360-45) = (1-v)*315` (min at 4:30, max at 3:00); `angleToValue(a) = 1 - clamp(a/315, 0, 1)`.
`getUserLevel() = round(value*10 - 0.25)`; `setValue` clamps to `max = locked ? 0.9 : 1.0`.

**Touch:** `angle = toPositiveDegrees(atan2(x-cx, y-cy))` where `toPositiveDegrees(rad) = (deg + 360 - 90) % 360`. `touchAngle(a)` only accepts the new value if `|newValue - value| < 1/11` (prevents jumps). Unlock state machine:
- locked && oldLevel != 9 && newLevel == 9 → `mUnlockTries--`
- !locked && newLevel == 0 → `mUnlockTries = 3` (re-locks)
- when `!locked`: level == 10 → `mElevenShowAnimator` (**300 ms**, `PathInterpolator(0.4,0,0.2,1)`); level != 10 → `mElevenHideAnimator` (**500 ms**, `PathInterpolator(0.8,0.2,0.6,1)`).
- Haptics: level change → `CONFIRM` at level 11 else `CLOCK_TICK`.
- `performClick()` bumps level by 1 while `< STEPS-1` (accessibility path).
- `ACTION_UP` with a changed lock state → `launchNextStage(locked)`: writes `r_egg_mode`, starts `NekoActivationActivity`. **Does not finish** ("it's fun to frob the dial").

Initial tries: `3` if `r_egg_mode == 0`, else `0` (already unlocked).

## Secondary — Neko (Cat Controls collection)
`neko/NekoActivationActivity.java`, `NekoControlsService.kt`, `NekoService.java`, `NekoLand.java`, `Cat.java`, `PrefState.java`.

- **Activation**: toggles `NekoControlsService` component enabled/disabled per `r_egg_mode`; toasts `🐱` (U+1F431) on enable, `🚫` (U+1F6AB) on disable.
- **Controls** (`ControlsProviderService`, Android 11 device-control tiles). IDs `water` / `food` / `toy`; `FOOD_SPAWN_CAT_DELAY_MINS = 5L`.
  - Colours: `COLOR_FOOD_FG=0xFFFF8000`, `COLOR_WATER_FG=0xFF0080FF`, `COLOR_TOY_FG=0xFFFF4080`; each `_BG = FG & 0x40FFFFFF`.
  - Water: `RangeTemplate("waterlevel", min 0, max 200, value, step 10, "%.0f mL")`, `TYPE_KETTLE`, icon `r_ic_water` / `r_ic_water_filled` at ≥100.
  - Food: `ToggleTemplate("foodbowl", ControlButton(filled,"Refill"))`; sets `prefs.foodState = 11`; status text `Full` tinted `0xCCFFFFFF` / `Empty` tinted `0x80FFFFFF`.
  - Toy: `StatelessTemplate`; icon uniformly random from `P_TOY_ICONS = {r_ic_toy_mouse, r_ic_toy_fish, r_ic_toy_ball, r_ic_toy_laser}` (weights 1/1/1/1); on tap shows `Cat attracted!` then after `(1 + rnd(4)) * 1000 ms` re-notifies an existing cat and re-rolls the icon.
- **`NekoService` (JobService)**: `JOB_ID = 42 + 30`, `CAT_NOTIFICATION = 31`, `DEBUG_NOTIFICATION = 1264`; `CAT_CAPTURE_PROB = 1.0`; `INTERVAL_FLEX = 5 min`; `INTERVAL_JITTER_FRAC = 0.25`; interval = `5 min ± 25 %` jitter, `setPeriodic(interval, flex)`. Channel `R_EGG`, name "New cats (R)", silent (`Uri.EMPTY`), vibration pattern `PURR = {0,40,20,40,20,40,20,40,20,40,20,40}`, `VISIBILITY_PUBLIC`.
  - Cat spawn: consumes `foodState`; `new_cat_prob = (food < probs.length ? probs[food] : waterLevel/2) / 100` with `r_food_new_cat_prob = [0, 5, 35, 65, 90]`; first cat always new.
- **`Cat.java`** — deterministic from a `long seed` (`Random.setSeed`). Name default `"Cat #%s"` with `seed % 1000`. Weighted tables (`chooseP`, pairs of `weight, value`, sum 1000):
  - `P_BODY_COLORS`: 180 `#FF212121` black, 180 `#FFFFFFFF` white, 140 `#FF616161` gray, 140 `#FF795548` brown, 100 `#FF90A4AE` steel, 100 `#FFFFF9C4` buff, 100 `#FFFF8F00` orange, 5 `#FF29B6F6` blue, 5 `#FFFFCDD2` pink, 5 `#FFCE93D8` purple, 4 `#FF43A047` green, 1 `0` → random HSV `(rnd*360, 0.5..1, 0.5..1)`.
  - `P_COLLAR_COLORS`: 250 white, 250 `#FF000000`, 250 `#FFF44336`, 50 `#FF1976D2`, 50 `#FFFDD835`, 50 `#FFFB8C00`, 50 `#FFF48FB1`, 50 `#FF4CAF50`.
  - `P_BELLY_COLORS`: 750 `0` (body colour), 250 white. `P_DARK_SPOT_COLORS`: 700 `0`, 250 `#FF212121`, 50 `#FF6D4C41`. `P_LIGHT_SPOT_COLORS`: 700 `0`, 300 white.
  - Feet: 25 % all four white (`mFootType=4`); else 25 % `foot1+foot3` (2); else 25 % `foot2+foot4` (3); else 10 % one random foot (1).
  - `tailCap`: 33.3 % white else body. `bowTie`: 10 % (tinted collar colour, else 0).
  - Dark body (`(r+g+b) < 0x80`) → eyes/mouth/nose white, ear-insides `#FFEF9A9A`; light body → ear-insides `0x20D50000`. Leg/tail shadows `0x20000000`.
  - Message: 10 % from `r_rare_cat_messages` = `🍩🍭🍫🍨🔔🐝🍪🥧` (U+1F369, 1F36D, 1F36B, 1F368, 1F514, 1F41D, 1F36A, 1F967); else `r_cat_messages` = `😸😹😺😻😼😽😾😿🙀💩🐁` (1F638,1F639,1F63A,1F63B,1F63C,1F63D,1F63E,1F63F,1F640,1F4A9,1F401). 50 % chance of triple-repeating it.
  - Notification: `MessagingStyle` with a bot `Person`, bubble metadata, small icon `r_stat_icon`, `setColor(bodyColor)`, title "A cat is here.", text = cat name, subText "Android R Neko". Adaptive icon = body colour with V flipped ±0.25, cat drawn inset `w/4`.
- **`NekoLand`** — 3-column `RecyclerView` grid of collected cats sorted by body hue; `r_neko_display_size = 64dp`; tap → rename dialog; long-press → share/delete overlay fading in over **333 ms**, auto-hiding after **5000 ms**, fade-out **250 ms**; delete confirm `"Forget %s?"`; share exports a **600×600** bitmap.

## Cat vector art — viewport **48×48** (identical in R, S and Tiramisu)
Drawing order (`Cat.CatParts.getDrawingOrder()`):
`collar, leftEar, leftEarInside, rightEar, rightEarInside, head, faceSpot, cap, leftEye, rightEye, nose, mouth, tail, tailCap, tailShadow, foot1, leg1, foot2, leg2, foot3, leg3, foot4, leg4, leg2Shadow, body, belly, bowtie`

| part | path (viewport 48) | notes |
|---|---|---|
| head | `M9,18.5 c0,-8.3 6.8,-15 15,-15 s15,6.7 15,15 H9 z` |半circle r=15 centred (24,18.5) |
| body | `M9,20 h30 v18 h-30 z` | rect (9,20)-(39,38) |
| collar | `M9,18.4 h30 v1.7 h-30 z` | |
| belly | `M20.5,25 c-3.6,0 -6.5,2.9 -6.5,6.5 V38 h13 v-6.5 C27,27.9 24.1,25 20.5,25 z` | r=6.5 rounded top |
| back | `M37.1,22 c-1.1,0 -1.9,0.8 -1.9,1.9 v5.6 c0,1.1 0.8,1.9 1.9,1.9 H39 v-1.9 v-5.6 V22 H37.1 z` | |
| leftEar | `M15.4,1 l5.1,5.3 l-6.3,2.8 z` | triangle |
| leftEarInside | `M15.4,1 l3.5,6.2 l-4.7,1.9 z` | |
| rightEar | `M32.6,1 l-5.1,5.3 l6.3,2.8 z` | |
| rightEarInside | `M33.8,9.1 l-4.7,-1.9 l3.5,-6.2 z` | |
| faceSpot | `M19.5,15.2 a4.5,3.2 0 1,0 9,0 a4.5,3.2 0 1,0 -9,0 z` | ellipse rx 4.5 ry 3.2 at (24,15.2) |
| cap | `M27.2,3.8 c-1,-0.2 -2.1,-0.3 -3.2,-0.3 s-2.1,0.1 -3.2,0.3 c0.2,1.3 1.5,2.2 3.2,2.2 C25.6,6.1 26.9,5.1 27.2,3.8 z` | |
| leftEye | `M20.5,11 c0,1.7 -3,1.7 -3,0 C17.5,9.3 20.5,9.3 20.5,11 z` | lens/eye shape |
| rightEye | `M30.5,11 c0,1.7 -3,1.7 -3,0 C27.5,9.3 30.5,9.3 30.5,11 z` | |
| nose | `M25.2,13 c0,1.3 -2.3,1.3 -2.3,0 S25.2,11.7 25.2,13 z` | |
| mouth | stroke, `width 1.2`, round cap: `M29,14.3 c-0.4,0.8 -1.3,1.4 -2.3,1.4 c-1.4,0 -2.7,-1.3 -2.7,-2.7` + `M24,13 c0,1.5 -1.2,2.7 -2.7,2.7 c-1,0 -1.9,-0.5 -2.3,-1.4` | two "w" lobes |
| tail | stroke, `width 5`, round cap: `M35,35.5 h5.9 c2.1,0 3.8,-1.7 3.8,-3.8 v-6.2` | |
| tailCap | `M42.2,25.5 c0,-1.4 1.1,-2.5 2.5,-2.5 s2.5,1.1 2.5,2.5 H42.2 z` | |
| tailShadow | `M40,38 l0,-5 l-1,0 l0,5 z` | |
| leg1..leg4 | `M9,37 h5 v6 h-5 z` / `M16,…` / `M27,…` / `M34,…` | 5×6 rects |
| leg2Shadow | `M16,37 h5 v3 h-5 z` | |
| foot1..foot4 | circles r=2.5 at (11.5,43), (18.5,43), (29.5,43), (36.5,43) | |
| bowtie | `M29,16.8 l-10,5 l0,-5 l10,5 z` | double triangle |

Also `r_ic_fullcat_icon.xml` (viewport 48) is the same cat pre-composited in greys (`#808080` body, `#666` shadows/inner ears, `#fff` feet/belly/faceSpot, `#3ddc84` collar+bowtie) — handy as a single-path reference.
`r_android_11_dial.xml` (viewport 108): static version of the dial — two `#F86734` "1" bars (`M77.773,51.064…`, `M83.598,51.064…`), 10 `#d7effe` tick circles at radii 0.644→1.368 around centre, `#3ddc84` circle r=18.999 at (53.928, 54.17), white dimple r=3.185 at (66.353, 54.17). `r_ic_number11.xml` (viewport 24): two rounded vertical bars `M5.14,5 H1.59 a0.88…` and `M18.19,5 H14.64 …`, `#000000`. `r_icon_bg.xml` = solid `#073042`.

Toy/control icons are 24×24: bowl `#FF8000` (baseline `M3,19 L21,19` sw 2, trapezoid `M7,12 L4.5,19 H19.5 L17,12 H7 Z` sw 2 round join, plus a `sw 1` highlight `M7.5257,18.8419 L9.5257,12.8419`); filled bowl adds five r=1 kibble circles at (9,9),(12,9),(15,9),(13.5,7),(10.5,7) and an even-odd bowl body. Water drop `#0080FF`.

## Canvas port
Dial: one canvas, `radius = w/4`. Draw order = bg colour → clipped rotated linear gradient wedge → green disc → 10 ticks (rotate about centre) → orange "11" → white dimple. Keep a float `value` and the `|Δ| < 1/11` guard. Cat: a `drawCat(ctx, seed, size)` function that walks the 28-part list; implement a small mulberry32/`java.util.Random`-compatible PRNG if you want seed-identical cats (AOSP `Random` = LCG `(seed*0x5DEECE66D + 0xB) mod 2^48`, `nextFloat = next(24)/2^24`).

**Complexity: M** (dial S; cat generator + NekoLand gallery M; the Controls/notification half is Android-only and can be replaced by a simple "feed bowl → wait 5 min → cat arrives" loop).

---

# 3. `eggs/S` — Android 12 / 12L, API 31–32, **Snow Cone**

**Confirmed:** README "Android 12-12L , API 31-32"; `s_android_nickname` = "Snow Cone"; `s_egg_name` = **"Paint Chips"**; `s_app_name` = "Android S Easter Egg".

## PlatLogo — the settable analog clock
`eggs/S/src/main/java/com/android_s/egg/PlatLogoActivity.java`. `FrameLayout` (transparent, `Theme.Wallpaper.NoTitleBar.Fullscreen`) with:
- `SettableAnalogClock` — `widgetSize = min(widthPixels, heightPixels) * 0.75`, centred.
- `ImageView mLogo` — same LayoutParams, `GONE` initially, drawable from `SystemColorDrawables.create(this, "system_accent3_500", {GradientDrawable(OVAL)}, R.drawable.s_platlogo_nobg, R.drawable.s_platlogo)`.
- `BubblesDrawable mBg` as layout background, `level = 0`, `avoid = widgetSize/2`, `padding = 0.5dp`, `minR = 1dp`.

**Clock art** (`core/analog-clock/res/drawable`), all viewport **380×380**:
- `clock_dial.xml` — the Android 12 "squircle"/12-lobed flower: a single closed cubic path starting `M177.389,2.803 C185.381,-0.934 194.619,-0.934 202.611,2.803 L231.193,16.169 …` with 4-fold symmetry (12 lobes, corners at 45° multiples, control points `±0.934`/`±2.803`). Fill tinted `system_neutral1_200`.
- `clock_hand_hour.xml` — rounded rect `M190,96 A16,16 0 0 1 206,112 L206,190 A16,16 0 0 1 190,206 …` → x∈[174,206] (w=32, r=16), y∈[96,206]; tint `system_accent1_700`.
- `clock_hand_minute.xml` — same but y∈[60,206]; tint `system_accent2_500`.
- Rotation applied about (190,190) = view centre.

**Interaction (`SettableAnalogClock.onTouchEvent`):**
- `ACTION_DOWN` → `mOverride = true` (falls through to MOVE).
- `angle = toPositiveDegrees(atan2(x-cx, y-cy))`; `minutes = (75 - (int)(angle/6)) % 60`.
- On minute change: if `|minuteDelta| > 45` and hour known → hour ±1 (mod 24). Haptic: `LONG_PRESS` at minute 0 (+ a 1.05→1.0 scale pop over **150 ms**), else `CLOCK_TICK`.
- `ACTION_UP`: if `minute == 0 && (hour % 12) == 0` (**12:00 or 00:00**) → `LONG_PRESS` + `launchNextStage(false)`.

**`launchNextStage`**: clock animates `alpha→0, scale→0.5` then `GONE`; logo `alpha 0, scale 0.5 → 1,1` with `OvershootInterpolator`; **after 500 ms** `ObjectAnimator.ofInt(mBg,"level",0,10000)` with `DecelerateInterpolator(1f)` (default 300 ms duration); writes `s_egg_mode`; starts `ComponentActivationActivity` (enables `NekoControlsService`, and on >R also `PaintChipsActivity` + `PaintChipsWidget`). Does not finish.

**`BubblesDrawable`** — `MAX_BUBBS = 2000`. Colours resolved from `system_accent1_400/500/600` and `system_accent2_400/500/600`; hard-coded fallback `{0xff598df7, 0xff3771df, 0xff2559bc, 0xff8a91a3, 0xff707687, 0xff585e6f}`. `randomize()` on bounds change:
```
maxR = min(w,h)/3
bubble[0] = {w/2, h/2, r=avoid, color=0}   // exclusion zone, never drawn
repeat 2000 times:
   up to 5 tries:
     x = rnd*w; y = rnd*h; r = min(x, w-x, y, h-y)
     for each existing b: r = min(r, hypot(x-b.x, y-b.y) - b.r - padding); break if r < minR
     if r >= minR: r = min(maxR, r); keep with a random colour; break
```
`draw()`: `f = level/10000`; each bubble → `drawCircle(x, y, r*f)`. So the whole field **grows from zero radius** as `level` runs 0→10000.

## Logo art
`s_platlogo.xml` / `s_android_logo.xml` / `s_icon.xml`, viewport **128×128**:
- disc `M64,64 m-64,0 a64,64 0 1,1 128,0 a64,64 0 1,1 -128,0` fill `system_accent3_500` (`s_icon.xml` hard-codes `#787296`).
- "1": `M32.5,34.15 a10,10 0 0 1 9.94,10 V93.85`, stroke `#fff`, **width 4**, round cap.
- "2": `M95.5,93.85 H55.71 V83.9 A19.9,19.9 0 0 1 75.61,64 h10 a9.94,9.94 0 0 0 9.94,-10 a19.9,19.9 0 0 0 -38.69,-6.56 A20.77,20.77 0 0 0 56,50.73`, same stroke.
`s_android_snowcone_fg.xml` = the two strokes only, wrapped in `<group pivotX/Y=64 scale 0.65>` on a 108dp/viewport-128 adaptive foreground.
`s_platlogo_nobg.xml` = strokes only (composed over the tinted oval at runtime).

## Secondary — Paint Chips (`widget/PaintChipsWidget.kt`, `PaintChipsActivity.kt`)
The real S egg. A grid of the dynamic-colour palette.
- `SHADE_NUMBERS = [0,10,50,100,200,300,400,500,600,700,800,900,1000]` (13 rows).
- `COLORS = [NEUTRAL1, NEUTRAL2, ACCENT1, ACCENT2, ACCENT3]`, `COLOR_NAMES = ["N1","N2","A1","A2","A3"]` (5 columns) → **65 chips**.
- Chip text `"${COLOR_NAMES[i]}-${SHADE_NUMBERS[j]}"`; text colour = `colorlist[0]` (shade 0) if `shade > 500` else `colorlist[last]` (shade 1000).
- Cell layout `s_paint_chip.xml`: `TextView`, 10dp min, `layout_columnWeight/rowWeight = 1`, `layout_margin = 2dp`, `singleLine`, background `s_roundrect` (`<shape rectangle><solid #FF000000/><corners radius 12dp/>`) with `setBackgroundTintList(resId)`.
- Grid `s_paint_chips_grid.xml`: `GridLayout`, `orientation="vertical"`, `alignmentMode="alignBounds"`, `rowOrderPreserved="false"` → **column-major** fill.
- Responsive `RemoteViews(SizeF)` map: 16 sizes from `50×50` (1×1) through `250×250` (full). Column-count gating: N1 needs ≥2, A2 ≥3, N2 ≥4, A3 ≥5, A1 always. Row gating: 500 always; 300/700 need ≥3; 100/900 need ≥5; the rest need all 13.
- `PaintChipsActivity` = full 13×5 grid, 8dp padding, `ClickBehavior.SHARE`: tapping a chip shares
  `"A1-500 (@android:color/system_accent1_500)\ncurrently: #rrggbb"`.
- Widget info: `minWidth/minHeight 50dp`, `resizeMode horizontal|vertical`, `updatePeriodMillis 86400000`.

## Strings / dimens
`s_notification_name` "Android Neko", `s_notification_channel_name` "New cats (S)", `s_notification_title` "A cat is here.", `s_default_cat_name` "Cat #%s", `s_confirm_delete` "Forget %s?", `s_food_new_cat_prob = [0,5,35,65,90]`, identical cat/rare-cat emoji arrays to R, control strings identical ("Toy"/"Tap to use"/"Cat attracted!"/"Water bubbler"/"Swipe to fill"/"Food bowl"/"Tap to refill"/"Full"/"Empty"). `s_neko_display_size = 64dp`.

Cat art and `Cat.java` are **byte-identical to R** (verified by diff, modulo package/prefix). `NekoService` differs only in `JOB_ID = 42+31`, `CAT_NOTIFICATION = 32`, `DEBUG_NOTIFICATION = 1265`.

## Canvas port
Clock: implement the 12-lobe squircle once as a `Path2D` (the cubic data above is directly usable — convert `C` triples to `bezierCurveTo`). Hands are `roundRect(174, 96, 32, 110, 16)` and `roundRect(174, 60, 32, 146, 16)` rotated about (190,190) by `hour/12*2π` and `min/60*2π`. Pointer math: `angle = (atan2(dx,dy)*180/π + 270) mod 360`, `minutes = (75 - floor(angle/6)) % 60`. Bubbles: run the packing once per resize, then animate `r*f` with `f` easing 0→1 over 300 ms after a 500 ms delay. Paint Chips: pure DOM grid — for the web you must substitute a palette (e.g. generate HCT/Material tonal palettes from a seed colour, or just show a fixed 13×5 sRGB ramp).

**Complexity: M** (clock+bubbles M; Paint Chips S but needs a colour-science substitute).

---

# 4. `eggs/Tiramisu` — Android 13, API 33

**Confirmed:** README "Android 13 , API 33"; `t_android_nickname` = "Tiramisu"; second entry `t_android_nickname_beta` = "T Beta" (`VERSION_CODES_FULL.T_BETA = TIRAMISU*100000 - 1`); `t_egg_name` = "Paint Chips"; `t_app_name` = "Android T Easter Egg"; timeline `TimelineEvent(2022, SEPTEMBER, TIRAMISU, "Tiramisu.")`.

## PlatLogo
`eggs/Tiramisu/src/main/java/com/android_t/egg/PlatLogoActivity.java` — structurally identical to S (same clock, same `widgetSize = minSide*0.75`, same bubble packer, same 500 ms→level-anim sequence) with three differences:

1. **Unlock at 13:00**, not 12:00: `if (mOverrideMinute == 0 && (mOverrideHour % 12) == 1) { Log.v(TAG,"13:00"); launchNextStage(false); }`
2. Logo colour is **`system_accent1_400`**: `SystemColorDrawables.create(this, "system_accent1_400", R.drawable.t_platlogo_bg, R.drawable.t_platlogo_nobg, R.drawable.t_platlogo)`.
3. **Long-press the background** (`layout.setOnLongClickListener(mBg)`) swaps every bubble for an emoji.

`BubblesDrawable` additionally: `MAX_BUBBS = isSupportedCOLR ? 2000 : 1000`; `draw()` early-returns when `level == 0`; `onLongClick` → `chooseEmojiSet()` (only if `level != 0`).

**`chooseEmojiSet()`** picks `mEmojiSet = rnd * EMOJI_SETS.length` and assigns every bubble a random member. `draw()` per bubble:
- COLR font present → `paint.textSize = r * 1.75f`, `textAlign = CENTER`, `drawText(text, x, y + r*f*0.6)`.
- else → `COLREmojiCompat.drawCOLREmoji`: sets drawable bounds to `[x ± r*f, y ± r*f]` and draws the vector emoji.
- else → plain coloured circle (as in S).

`EMOJI_SETS` (14 sets, verbatim):
1. fruits `🍇🍈🍉🍊🍋🍌🍍🥭🍎🍏🍐🍑🍒🍓🫐🥝`
2. cats `😺😸😹😻😼😽🙀😿😾`
3. faces (53) `😀😃😄😁😆😅🤣😂🙂🙃🫠😉😊😇🥰😍🤩😘😗☺️😚😙🥲😋😛😜🤪😝🤑🤗🤭🫢🫣🤫🤔🫡🤐🤨😐😑😶🫥😏😒🙄😬🤥😌😔😪🤤😴😷`
4. love-face `🤩😍🥰😘🥳🥲🥹`
5. `🫠`
6. hearts `💘💝💖💗💓💞💕❣💔❤🧡💛💚💙💜🤎🖤🤍`
7. space `👽🛸✨🌟💫🚀🪐🌙⭐🌍`
8. moon phases `🌑🌒🌓🌔🌕🌖🌗🌘`
9. ocean `🐙🪸🦑🦀🦐🐡🦞🐠🐟🐳🐋🐬🫧🌊🦈`
10. monkeys `🙈🙉🙊🐵🐒`
11. zodiac `♈♉♊♋♌♍♎♏♐♑♒♓`
12. clock faces (24) `🕛🕧🕐🕜🕑🕝🕒🕞🕓🕟🕔🕠🕕🕡🕖🕢🕗🕣🕘🕤🕙🕥🕚🕦`
13. flowers `🌺🌸💮🏵️🌼🌿`
14. `🐢✨🌟👑`

Fallback art: 176 hand-converted vector emoji in `res/drawable-anydpi/t_emoji_u<hex>.xml` (viewport **128×128**), resolved by `EmojiUtils.getEmojiUnicode(..., prefix="t_emoji_u")`. Example `t_emoji_u1f63a.xml` (😺): ears `#FFC022` (`M110.47,59.02 c9.51,-24.83 3.65,-43.83 0.29,-49.28 …`), head `#FFC022`, inner ears `#FFD1D1`, eyes `#FF000000` ellipses, whiskers `#9E9E9E` stroke 3 round cap, muzzle `#EF7F9D`, mouth strokes `#000000` width 3.77/4.

`COLREmojiCompat.kt` finds a COLRv1 emoji font (`^\S*Emoji\S*.[to]t[fc]$` over `SystemFonts.getAvailableFonts()`, else the `und-Zsye` family via reflection on `SystemFonts.getSystemPreinstalledFontConfig()`), `COLRv1.analyzeCOLR(file)` parses the `COLR` table. `onDestroy` → `releaseIdentifiedCOLREmoji()` clears the `WeakHashMap` cache. **All of this is Android-only; a web port just uses native emoji text.**

## Logo art (`t_platlogo.xml`, viewport **24×24**, 128dp)
- Background = the Material You 12-point "flower/squircle" as one long path: `M11,0.3 c0.6,-0.3 1.4,-0.3 2,0 l0.6,0.4 c0.7,0.4 1.4,0.6 2.2,0.6 l0.7,-0.1 …Z` (fill `system_accent1_400`). `t_platlogo_bg.xml` is this path alone; `t_platlogo_nobg.xml` is the glyphs alone.
- "1": `M6.3,6.5 l3,0 l0,12.2`
- "3": `M12.3,6.5 h4 l-2,4 c2.2,0.3 3.6,2.4 3.3,4.5 c-0.3,1.9 -1.9,3.3 -3.8,3.3 c-0.5,0 -1,-0.1 -1.4,-0.3`
- Each glyph drawn **twice**: first `strokeWidth = 2.22` in `system_accent3_800`, then `strokeWidth = 0.56` in `system_neutral1_100` (a thin inline highlight). Butt caps, no fill.

**Beta variant** `t_platlogo_beta.xml` (viewport 24): same flower path but fill `system_accent3_400` and expressed with arcs (`M11 0.51 a2.06 2.06 0 0 1 2 0 l0.58 0.37 a4.15 4.15 0 0 0 2.23 0.55 …Z`), and only the "3": `M12.34 6.53 h4.05 l-2 4.05 a3.95 3.95 0 0 1 -0.57 7.85 a4.1 4.1 0 0 1 -1.45 -0.27`, `strokeWidth 2` `system_accent1_800` + `strokeWidth 0.5` `system_neutral1_100`. `beta/PlatLogoActivity.java` unlocks at **12:00** (`hour % 12 == 0`), has no emoji long-press, `MAX_BUBBS = 2000`, and uses `createDrawable() = SystemColorDrawables.create(this, "system_accent3_400", t_platlogo_bg, t_platlogo_beta_nobg, t_platlogo_beta)`.

`t_android_13.xml` (viewport 108) is the adaptive-icon glyph: "1" `M37,39.03 l8.58,0 l0,33.94` and "3" `M53.98,39.03 h11.31 l-5.59,11.31 c6.02,0.96 10.11,6.62 9.15,12.64 c-0.85,5.3 -5.38,9.22 -10.74,9.29 c-1.38,0 -2.76,-0.26 -4.05,-0.75`, each `strokeWidth 6.2` `system_accent1_800` + `strokeWidth 1.56` `system_neutral1_100`.

## Secondary
Same Neko stack as R/S (`JOB_ID = 42+33`, ids 34/1267; `t_neko_display_size = 64dp`; cat art byte-identical) **plus** the same Paint Chips widget/activity as S (files are 1:1 copies under `com.android_t.egg.widget`, layouts `t_paint_chip.xml`, `t_paint_chips_grid.xml`, `t_paint_chips_widget_info.xml`). `ComponentActivationActivity` enables `NekoControlsService` + `PaintChipsActivity` + `PaintChipsWidget` when `t_egg_mode != 0`.

## Canvas port
Reuse the S port; change the unlock target to 13:00, swap the disc for the 24-viewport flower path, and add a long-press handler that assigns each packed bubble a random emoji from the 14 sets and renders it with `ctx.font = ${r*1.75}px serif; ctx.textAlign='center'; ctx.fillText(e, x, y + r*f*0.6)`.

**Complexity: S–M** (delta over S is small; the emoji vector fallback library is unnecessary on the web).

---

# 5. `eggs/UpsideDownCake` — Android 14, API 34, **Upside Down Cake** → egg **"Landroid"**

**Confirmed:** README "Android 14 , API 34", Egg "Landroid"; `u_android_nickname` = "Upside Down Cake"; `u_egg_name` = "Landroid"; timeline `TimelineEvent(2023, SEPTEMBER, UPSIDE_DOWN_CAKE, "Upside Down Cake.")`.

## PlatLogo — starfield + warp
`eggs/UpsideDownCake/src/main/java/com/android_u/egg/PlatLogoActivity.java`.
```
LAUNCH_TIME = 5000 ms ; MIN_WARP = 1f ; MAX_WARP = 10f
U_EGG_UNLOCK_SETTING = "egg_mode_u" ; FINISH_AFTER_NEXT_STAGE_LAUNCH = false
```
FrameLayout, system bars hidden/transparent; background = `Starfield(new Random(), dp*2)` with `setVelocity(200*(rnd-0.5), 200*(rnd-0.5))`; centred `ImageView` of `widgetSize = minSide*0.75`.

- **Press-and-hold** (touch DOWN, or hold SPACE) → `startWarp()`: `ObjectAnimator.ofFloat(starfield,"warp",1,10).setDuration(5000)` and `postDelayed(launchNextStage, 5000+1000)`.
- **Release** → `stopWarp()`: cancel, `warp = 1`, remove the launch callback. So you must hold for the full 5 s (the launch still fires at 6 s).
- Per frame: `warpFrac = (warp-1)/9`; logo jitters `translationX/Y = rnd*warpFrac*5*dp` (only if `Settings.Global.ANIMATOR_DURATION_SCALE > 0`); `RumblePack.rumble(warpFrac)`.
- `RumblePack`: `HandlerThread` "VibratorThread", MSG 6464, INTERVAL 50 ms; if `PRIMITIVE_SPIN` supported → `VibrationEffect.startComposition().addPrimitive(PRIMITIVE_SPIN, warpFrac³)`; else `if (rnd < warpFrac) performHapticFeedback(CLOCK_TICK)`.
- `launchNextStage(false)` writes `egg_mode_u` and starts `landroid.MainActivity`.

**`Starfield`** (`NUM_STARS = 34`, `NUM_PLANES = 2`, `mSize = 2dp`):
- `mBuffer = mSize*NUM_PLANES*2*MAX_WARP = 80dp`; `mSpace = bounds` inset by `-mBuffer`; stars random in `mSpace`.
- Each star stores `[x0,y0,x1,y1]` = (tail, head). `dx = vx*dtSec*warp`, `dy = vy*dtSec*warp`.
- `plane = floor(i/NUM_STARS * NUM_PLANES) + 1` ∈ {1,2}.
- head = `(head + d*plane + size) % size`; tail = `inWarp ? head - d*warp*2*plane : -100` (off-screen when not warping).
- `inWarp = warp > 1`. Draw: `drawColor(BLACK)`; jitter-translate by `rnd*(warp-1)`; for each plane set `strokeWidth = mSize*(p+1)` (2dp, 4dp), `drawLines` (only in warp) then `drawPoints`, all `Color.WHITE`, `Paint.Style.STROKE`.
- Logo choice: `randomPlatlogo()` → `nextInt(100) >= 90` (10 %) → `u_platlogo_1` (developer-preview art), else `u_platlogo`.

## Logo art
`u_platlogo.xml` (108dp, viewport **512×512**) — release art:
- disc `M256,256 m-200,0 a200,200 0 1,1 400,0 …` fill `#FF073042`
- clipped to that disc:
  - green antenna `#3ddc84`: `M195.27,187.64 l2.25,-6.69 c13.91,78.13 50.84,284.39 50.84,50.33 …` (the two swooping antenna stalks) plus two rounded rects `M250.26,187.66 …A2.13,2.13…` (16.16×32.32 at y 187.66–219.98) and `M250.12,170.29 …` (16.16×8.08), plus the head-antenna `M256.22,126.57 c-6.69,0 -12.12,5.27 -12.12,11.77 v14.52 …`
  - white Android bust `#ffffff`: `M158.77,180.68 l-33.17,57.45 c-1.9,3.3 -0.77,7.52 2.53,9.42 …C411.08,149.71 450.03,92.04 455.73,23.91 H57.17 c5.7,68.12 44.65,125.79 101.61,156.76 z`
  - 14 white "sprinkle" squares: nine `4.04×4.04` at (171.92,216.82), (188.8,275.73), (369.04,337.63), (285.93,252.22), (318.96,218.84), (294.05,288.55), (188.8,298.95) and five `8.08×8.08` at (330.82,273.31), (220.14,238.94), (272.1,318.9), (293.34,349.25), (161.05,254.24), (378.92,192), (137.87,323.7)
- ring: same circle, `fillColor #00000000`, `strokeWidth 56.561`, `strokeColor #f86734`
- white "ANDROID" wordmark arcs around the top (single path, `fillColor #fff`)

`u_platlogo_1.xml` — preview art: rounded-triangle "cake" silhouette `M256.22,437.7 c-26.38,0 -43.81,-18.3 -61.2,-48.42 …` fill `#FF073042`, same green antenna, white bust `M186.69,167.97 …`, 15 white sprinkles, outline stroke `#f86733` width **55**.
`u_android14_patch_adaptive*.xml` (viewport 108) = the same motif reduced to an adaptive icon (`_background`, `_foreground`, `_monochrome`).

## Landroid (the sandbox) — see §7 for the full physics write-up
U is the **first** version, so it is the leanest: `Colors.kt, ComposeTools.kt, MainActivity.kt, Maths.kt, Namer.kt, PathTools.kt, Physics.kt, Randomness.kt, Universe.kt, Vec2.kt, VisibleUniverse.kt` (11 files, no Autopilot, no DreamUniverse).

U-specific values that later versions change:
- `DEFAULT_CAMERA_ZOOM = 0.25f`, `TOUCH_CAMERA_ZOOM = true` (pinch-zoom enabled), `TOUCH_CAMERA_PAN = false`, `DYNAMIC_ZOOM = false` — all `const val`.
- `Colors`: `Eigengrau #FF16161D`, `Eigengrau2 #FF292936`, `Eigengrau3 #FF3C3C4F`, `Eigengrau4 #FFA7A7CA`, `Console #FFB7B7FF`. No Android/Autopilot/Track/Flag entries.
- Planet colour is always `Colors.Eigengrau4` (no per-planet hue).
- `Spark(lifetime=…)` (renamed `ttl` later); `RING` sparks drawn as a fixed `drawCircle(color, size, pos, Stroke(1/zoom))`; exhaust `size = 3f`.
- `Landing(ship, planet, angle)` — non-nullable ship, no fuse, no activity text; drawn as a **red X** (`drawLine(Color.Red, v±5)`).
- `thrustPath = createPolygon(-3f, 3).translate(Vec2(-4f, 0f))` (V+ uses `-5f`).
- Track colour `Color.Green`; no landing legs; no flag; no `AUTO` button; no notification.
- Telemetry `ALT` = `(closest.pos - pos).mag().toInt()` (V+ subtracts `closest.radius`); `THR` only shown when thrusting; designation hard-coded `"UDC-${seed % 100_000}"`.
- `Spaaaace` is driven by `VisibleUniverse.simulateAndDrawFrame(nanos)` which writes `triggerDraw.value = nanos` (a Compose snapshot ticker) before `step(nanos)`.
- `Maths.kt`: `smooth(x) = x³(x(6x-15)+10)` (Perlin), `invsmoothish(x) = 0.25((2x-1)⁵+1)+0.5x`, `lexp(start,end,p) = (p-start)/(end-start)`. No `expSmooth`.
- `PathTools.parseSvgPathData` regex `([A-Z])([-.,0-9e ]+)` → only `M`, `C`, `L`, `Z`.
- Namer word lists are prefixed `u_` and have no `activities`/`*_generic_plurals` arrays.

## Canvas port
Black canvas; 34 stars in 2 parallax planes; store `[tailX,tailY,headX,headY]` per star; on hold, ramp `warp` 1→10 over 5 s and draw `lineTo(tail)→(head)` with `lineWidth = 2*plane`, plus square dot caps. Logo = the 512-viewport art scaled to `0.75*minSide`. Then hand off to the Landroid canvas (see §7).

**Complexity: L** (PlatLogo S, Landroid L).

---

# 6. `eggs/VanillaIceCream` — Android 15, API 35, **Vanilla Ice Cream** → "Landroid"

**Confirmed:** README "Android 15 , API 35", Egg "Landroid"; `v_android_nickname` = "Vanilla Ice Cream"; `v_egg_name` = "Landroid"; `v_dream_description` = `"---- AUTOPILOT ENGAGED ----"`.

## PlatLogo
Byte-for-byte the U activity except: package/imports, `V_EGG_UNLOCK_SETTING = "egg_mode_v"`, logo is always `R.drawable.v_platlogo` (no 10 % preview variant), and `Starfield.NUM_STARS = Build.VERSION_CODES.UPSIDE_DOWN_CAKE` (**34**) — the same value as U's hard-coded 34. `MAX_WARP` stays **10**. Everything else (5 s hold, 6 s launch, jitter, rumble, `Starfield` math with `NUM_PLANES = 2`) is unchanged.

## Logo art — `v_platlogo.xml` (512dp, viewport **512×512**)
- **"space"** — a downward-pointing rounded "patch/shield": `M256,446.36 C229.63,446.36 212.19,428.06 194.8,397.94 C177.41,367.82 91.54,219.08 74.14,188.96 C56.75,158.84 49.63,134.59 62.81,111.75 C76,88.91 100.56,82.95 135.35,82.95 C170.13,82.95 341.87,82.95 376.65,82.95 C411.44,82.95 436,88.91 449.19,111.75 C455.25,…Z` fill `#202124`.
- clipped to that shape:
  - **thrust plume** `#C6FF00`, `fillType=evenOdd`: `M253,153 C249.82,187.48 225.67,262.17 167.98,285.04 C110.3,307.92 73.96,318.12 63,320.36 L256,399 L449,320.36 C438.04,318.12 …Z`
  - inner white plume `#ffffff` evenOdd: `M253,153 C251.5,187.42 241.7,261.98 214.5,284.82 …L256,398.58 L347,320.08 …Z`
  - white dot `M256,153 m-3,0 a3,3 …` (r=3)
  - **Android head+body** `#5F6368`: rect `M151,350 h199 v104 h-199 z` plus the long head/antennae path `M358.42,350.44 C358.36,350.02 …L359,354.98 Z`
- **stars** (outside the clip): 15 white squares — 4.04×4.04 at (131.04,134.34),(167.04,256),(373.49,127),(292.04,226),(319.04,186.91),(355.04,222),(192.04,136),(222.04,212) and 8.08×8.08 at (336.08,196),(163.08,175),(211.08,143),(369.08,204),(169.21,204.34),(383.04,160.07),(192.08,183)
- **patch frame**: same shield path, `fillColor #00000000`, `strokeWidth 55`, `strokeColor #34A853`
- **"ANDROID"** wordmark `#E9F3EB` (one path, y≈70–96)
- **"15"** `#E9F3EB` (one path, y≈295–368)
- **spacecraft** `#E9F3EB`: `M256.12,121 C249.43,121 244,126.27 244,132.77 V147.29 …Z` (the little rocket/antenna at the top)

`v_android15_patch_adaptive.xml` (adaptive-icon) = `_background` (viewport 108: `#202124` full-bleed + 1×1 and 2×2 white star squares at (32,34),(33,61),(71,34),(62,56),(68,47),(72,55),(39,36) and (72,49),(46,53),(32,45),(43,37),(78,51),(34,51),(76,41)…) + `_foreground` (viewport 108: `#C6FF00` zoomies plume, white inner plume, white r=1 dot at (54,42), `#34A853` head circle r=26.25 at (54,94.25), two `#34A853` antennae strokes `M38,63.5 L44.5,74.5` / `M70,63.5 L63.5,74.5` width 5 round cap, plus a `#34A853` "ant" and a `strokeWidth 1` `#40FFFFFF` centre line `M54,40 V67`) + `_monochrome` (same silhouette in `#000000`).
`v_android_logo_2024_.xml` is the timeline logo.

## Landroid deltas vs U
- **New files**: `Autopilot.kt`, `DreamUniverse.kt`; `ComponentActivationActivity.java` + `flags/Flags.java`; `res/xml/v_landroid_dream.xml` (`<dream android:previewImage="@drawable/v_platlogo"/>`); manifest declares `DreamUniverse` (`BIND_DREAM_SERVICE`, `enabled=false`) and `MainActivity`.
- `Colors.kt` gains `object Android { Green #FF34A853, Blue #FF4285F4, Mint #FFE8F5E9, Chartreuse #FFC6FF00 }` and `Autopilot = Android.Blue`, `Track = Android.Green`, `Flag = Android.Chartreuse`.
- `Maths.kt` gains `expSmooth(current, target, dt = 1/60, speed = 5) = current + (target-current)*(1 - exp(-dt*speed))`.
- `PathTools.kt` gains `createPolygonPoints(radius, sides): List<Vec2>`; the SVG regex becomes `([A-Za-z])\s*([-.,0-9e ]+)` and supports lowercase `l` (`relativeLineTo`).
- `Physics.kt`: `Removable`/`Fuse(lifetime)` moved here from `Universe.kt`.
- `Universe.kt`: `LANDING_REMOVAL_TIME = 60*15f` (900 s of sim time); `Landing(var ship: Spacecraft?, planet, angle, text = "", fuse = Fuse(LANDING_REMOVAL_TIME)) : Constraint, Removable by fuse` — `solve()` re-derives `landingVector` each frame and calls `fuse.update(dt)`; `postUpdateAll` also sweeps removable **constraints**. `Spark(ttl=…, fuse = Fuse(ttl))`, `Body(name="Spark")`, exhaust `size = 1f`. `Spacecraft.autopilot: Autopilot?`. Launch detaches via `landing.ship = null` instead of `sim.remove(landing)`. `initTest()` starts the ship at `planets.last().pos + Vec2(planets.first().radius*1.5f, 0)`.
- `VisibleUniverse.kt`: adds `spaceshipLegs` (two `M-7 ∓6.5 l-3.5,0 l-1,-2 l0,4 l1,-2 Z` chevrons) drawn in `#FFCCCCCC` when landed; `thrustPath` moves to `-5f`; `drawLanding` becomes the **flag** (`Colors.Flag #C6FF00`, height 80, path `(0,0)→(80,0)→(70,20)→(60,0)→close`, rotated by `landing.angle` about the surface point, stroke `2/zoom`) gated on `flagFlag()`; `RING` sparks now animate — `life = 1 - fuse.lifetime/ttl`, `radius = exp(lerp(size, 3*size, life)) - 1`, `alpha *= (1-life)`; track colour `Colors.Track`; new `drawAutopilot()`.
- `MainActivity.kt`: `DEFAULT_CAMERA_ZOOM = 1f`; `TOUCH_CAMERA_PAN/ZOOM/DYNAMIC_ZOOM` become `var`; `getDessertCode()` (from `DessertUtils`: LMP/LM1/MNC/NYC/NM1/OC/OM1/PIE/QT/RVC/SC/SC2/TM/UDC/VIC/BKL) replaces the hard-coded `UDC-` designation; `enableEdgeToEdge()`; telemetry moves to a `BoxWithConstraints` (bottom-end + 45 % width on wide screens), gains `letterSpacing 1.sp / lineHeight 12.sp`, an autopilot block in `Colors.Autopilot`, a `LND:/JOB:` two-liner, always-on `THR:`, `ALT` measured from the surface, and a self-shrinking catalogue (`9.sp` → `8.sp` on `didOverflowHeight`); dynamic zoom is `expSmooth`-ed at `speed = 1.5`. Autopilot is **commented out** in `MainActivity` (V only enables it in the Daydream) — Baklava re-enables it with an `AUTO` button.
- `DreamUniverse.kt`: a `DreamService` hosting a `ComposeView` with a hand-rolled `SavedStateRegistryOwner`/`LifecycleRegistry`; `isInteractive = false`; builds a fresh `VisibleUniverse(randomSeed())`, `initRandom()`, then **re-randomises the ship position with `kotlin.random.Random`** (not `universe.rng`) to break determinism; attaches an `Autopilot` with `enabled = true`; sets `DYNAMIC_ZOOM = true` on attach and `false` in `onDestroy`.

## Namer additions (V, reused verbatim by Baklava/CinnamonBun)
```kotlin
private var activities           = Bag(R.array.v_activities)
private var floraGenericPlurals  = Bag(R.array.v_flora_generic_plurals)
private var faunaGenericPlurals  = Bag(R.array.v_fauna_generic_plurals)
private var atmoGenericPlurals   = Bag(R.array.v_atmo_generic_plurals)

val TEMPLATE_REGEX = Regex("""\{(flora|fauna|planet|atmo)\}""")
fun describeActivity(rng, target: Planet?): String =
    activities.pull(rng).replace(TEMPLATE_REGEX) {
        when (it.groupValues[1]) {
            "flora"  -> (target?.flora      ?: "SOME") + " " + floraPlural(rng)
            "fauna"  -> (target?.fauna      ?: "SOME") + " " + faunaPlural(rng)
            "atmo"   -> (target?.atmosphere ?: "SOME") + " " + atmoPlural(rng)
            "planet" -> (target?.description ?: "SOME BODY")   // "once told me"
        }
    }.uppercase()
```
`v_activities` (23): refueling, sightseeing, vacationing, luncheoning, recharging, taking up space, reticulating space splines, using facilities, spelunking, repairing, `herding {fauna}`, `taming {fauna}`, `breeding {fauna}`, `singing lullabies to {fauna}`, `singing lullabies to {flora}`, `singing lullabies to the {planet}`, `gardening {flora}`, `collecting {flora}`, `surveying the {planet}`, `mapping the {planet}`, `breathing {atmo}`, `reprocessing {atmo}`, `bottling {atmo}`.
`v_fauna_generic_plurals`: fauna, animals, locals, creatures, critters, wildlife, specimens, life, cells.
`v_flora_generic_plurals`: flora, plants, flowers, trees, mosses, specimens, life, cells.
`v_atmo_generic_plurals`: air, atmosphere, clouds, atmo, gases.

**Complexity: L** (adds Autopilot + landing legs/flag + smoothed camera over U).

---

# 7. `eggs/Baklava` — Android 16, API 36, **Baklava** → "Landroid" (deep dive)

**Confirmed:** README "Android 16 , API 36", Egg "Landroid"; `baklava_android_nickname` = "Baklava"; `baklava_egg_name` = "Landroid"; `baklava_dream_description` = `"---- AUTOPILOT ENGAGED ----"`; `fullApiLevelRange = BAKLAVA..BAKLAVA_1`; timeline `2025/MAY "Baklava."` and `2025/DECEMBER "Baklava.\nAndroid 16.1"`. Manifest permissions add `POST_PROMOTED_NOTIFICATIONS`; theme `baklava_Theme.Landroid` = `android:Theme.Material.NoActionBar` with light status/nav bars **false**.

## 7a. PlatLogo — HDR starfield
Differences from V (everything else identical: `LAUNCH_TIME = 5000`, hold-to-warp, `MIN_WARP = 1`, jitter, `RumblePack` with `PRIMITIVE_SPIN` at `warpFrac³` throttled to 50 ms, launch at 6 s, no finish):

```java
EGG_UNLOCK_SETTING = "egg_mode_baklava"   // written to Settings.System, not SharedPreferences
MAX_WARP = 16f                            // "must go faster"
window.setColorMode(ActivityInfo.COLOR_MODE_HDR)   // API 26+, silently ignored on SDR panels
mLogo.setImageResource(R.drawable.baklava_platlogo)
```
`Starfield` (now package-private `static class`, reused by the snapshot provider):
```
NUM_STARS  = 128        (was 34)
NUM_PLANES = 4          (was 2)
ROTATION   = 45f        (new: the whole field is rotated 45°)
mBuffer    = mSize * NUM_PLANES * 2 * MAX_WARP = 2dp*4*2*16 = 256dp
mRadius    = hypot(bounds.w, bounds.h)/2 + mBuffer
stars initialised uniformly in [-mRadius, +mRadius]²  (head == tail)
```
`draw()`:
```
diameter = 2R ; triameter = 3R
drawColor(BLACK); translate(cx, cy); rotate(45°)
if 0 < dt < 1000: translate(rnd*(warp-1), rnd*(warp-1))     // shake
  plane = floor(i/128 * 4) + 1                               // 1..4
  head  = (head + d*plane + 3R) % 2R - R
  tail  = inWarp ? head - d*warp*plane : -10000              // note: no ×2 here
slice = 128/4*4 = 128 floats per plane
for p in 0..3:
   value = (p+1)/(NUM_PLANES-1)  -> 1/3, 2/3, 1, 4/3
   paint.color = isSRgbExtSupported ? packHdrColor(value,1) : packColor(value,1)
   paint.strokeWidth = mSize*(p+1)                            // 2,4,6,8 dp
   if inWarp: drawLines(stars, p*slice, slice)
   drawPoints(stars, p*slice, slice)
if inWarp:
   frac = (warp-1)/(16-1)
   drawColor(frac² of HDR white 2.0)                          // full-screen bloom
```
`packColor(v,a) = Color.argb(a*255, v*255, v*255, v*255)`; `packHdrColor(v,a) = Color.valueOf(v,v,v,a, ColorSpace.EXTENDED_SRGB).pack()` — grey **above** 1.0, i.e. `4/3` for the nearest plane and `2.0` for the bloom. `isSRgbExtSupported = SDK_INT >= Q`.

## 7b. PlatLogo art — `baklava_platlogo.xml` (512dp, viewport **512×512**)
1. **Badge**: rounded square `M127,58.5 L385,58.5 A68.5,68.5 0 0 1 453.5,127 L453.5,385 A68.5,68.5 0 0 1 385,453.5 L127,453.5 A68.5,68.5 0 0 1 58.5,385 L58.5,127 A68.5,68.5 0 0 1 127,58.5 z`, fill `#1D2126`, stroke `#4285F4`, `strokeWidth 55`.
2. **"BAKLAVA"** wordmark in `#ffffff` — one path, occupying roughly x∈[148,362], y∈[45.6,72.6] (hand-outlined letterforms A-N-D-R-O-I-D style: `M152.157,72 …Z` etc.).
3. **The Android 16 "patch"**: 16 triangles forming a diamond centred (257.84, 259.04) with half-diagonal 121.739 (corners at (257.84,137.301), (379.579,259.04), (257.84,380.778), (136.101,259.04)), alternating `#34A853` (8 facets) and `#1F8E3D` (8 facets). Each is `M x1,y1 L x2,y2 L 257.84,259.04 Z`-style against the midpoints 196.971/318.709 × 198.17/319.909.
4. **Diamond outline**: `M265.087,135.953 L380.927,251.793 A10.249,10.249 90,0 1,380.927 266.287 L265.087,382.126 A10.249,10.249 90,0 1,250.593 382.126 L134.753,266.287 A10.249,10.249 0,0 1,134.753 251.793 L250.593,135.953 A10.249,10.249 90,0 1,265.087 135.953 z`, `fillColor #00000000`, `strokeWidth 14.3349`, `strokeColor #5F6368` (rounded corners r=10.249).
5. **Chartreuse swoosh** `#C6FF00`, `fillType evenOdd`: `M172.353,318.422 C172.818,317.837 172.778,316.987 172.249,316.459 …C212.272,358.818 145.748,405.747 133.662,393.66 C126.026,386.024 141.946,356.659 172.353,318.422 Z`.
6. **Black chain-link** (`#000000`, 3 paths): two capsule "bars" `M347.267,248.089 C348.867,247.66 …` / `M325.111,230.175 …` and the interlocking "C" `M335.665,242.984 C327.494,234.813 314.434,234.623 306.498,242.559 L288.774,260.283 …Z`.
7. **"16"** in `#E8F5E9` — `M342.409,405.074 …Z` (the "1") and `M382.377,405.522 …Z` (the "6"), y≈339–405.
8. **16 sparkle diamonds** `#E8F5E9`, two sizes: half-diagonal `7.071` (e.g. `M123.071,117.004 l7.071,7.071 l-7.071,7.071 l-7.071,-7.071 z`) and `10.607`; some wound clockwise, some counter-clockwise.

`baklava_android16_patch_adaptive.xml` = layer-list(`_background` inset −15dp, `_foreground`); `_background` (viewport 108) = `#16161D` full-bleed + the same 16 `#E8F5E9` sparkle diamonds at 108 scale; `_foreground` (viewport 512) = items 3–6 above inside `<group scale 0.73 translate 69.12,69.12>`; `_monochrome` (viewport 108) = a white line-art version: rounded diamond outline (`strokeWidth 1` and `1.5`), inner `19×19` square `M44.5,44.5 h19 v19 h-19 z`, diamond `M54,44.5 l9.5,9.5 l-9.5,9.5 l-9.5,-9.5 z`, cross-hairs `M54,35 V73` and `M73,54 L35,54` (all `#ffffff`, `strokeWidth 0.75`), the 16 sparkles, and a white swoosh + chain-link.

Notification icons: `baklava_ic_spacecraft.xml` (24 viewport, `<group translateX=10 translateY=12>`, stroke `#FFFFFF` width 2, the Landroid ship outline), `baklava_ic_spacecraft_filled.xml` (same + `fillColor #000000`), `baklava_ic_spacecraft_rotated.xml` = `<rotate fromDegrees=0 toDegrees=360>` wrapper (level-driven rotation), and `baklava_ic_planet_{tiny,small,medium,large}.xml` = circles r = 4/6/9/11 at (12,12), fill `#16161D`, stroke `#ffffff` width 2.

## 7c. The physics model (`landroid/Physics.kt`, `Universe.kt`)

**Integrator: position-based dynamics (PBD)**, explicitly commented as such. Per `Simulator.step(nanos)`:
```
dt = (nanos - wallClockNanos)/1e9 * TIME_SCALE(=1)
if firstFrame || dt > MAX_VALID_DT(=1s) return       // pauses on activity pause
now += dt
snapshot entities/constraints into local ArraySets
1. updateAll(dt)      // integrate
2. solveAll(dt)       // satisfy constraints
3. postUpdateAll(dt)  // velocity = (pos - opos)/dt
4. simStepListeners.forEach { it() }                   // Baklava-new
```
`Body.update`: `opos = pos; pos += velocity*dt` (angular integration is commented out). `Body.postUpdate`: `velocity = (pos - opos)/dt`. Fields: `pos, opos, velocity, mass, angle, radius, collides, omega/oangle` (omega unused).

`Constraint.solve(sim, dt)`. `Container(radius)`: `softness = 0.0`; if `|p.pos| + p.radius > radius` then `p.pos = unit(p.pos) * (radius - p.radius)` — a hard circular **ringfence** at `UNIVERSE_RANGE = 200_000`. Only the ship is added to it.

`Removable { canBeRemoved() }` and `Fuse(var lifetime)` (`update(dt){lifetime -= dt}`, removable when `< 0`) live in `Physics.kt` from V onward.

**Universe constants** (identical U/V/Baklava):
```
UNIVERSE_RANGE      = 200_000f
NUM_PLANETS_RANGE   = 1..10
STAR_RADIUS_RANGE   = 1_000f..8_000f
PLANET_RADIUS_RANGE = 50f..2_000f
PLANET_ORBIT_RANGE  = (STAR_RADIUS_RANGE.end*2)..(UNIVERSE_RANGE*0.75) = 16_000..150_000
GRAVITATION         = 1e-2f
KEPLER_CONSTANT     = 50f
PLANETARY_DENSITY   = 2.5f     STELLAR_DENSITY = 0.5f
SPACECRAFT_MASS     = 10f
CRAFT_SPEED_LIMIT   = 5_000f
MAIN_ENGINE_ACCEL   = 1000f    // px/s²
LAUNCH_MECO         = 2f       // s of zero gravity after launch
SCALED_THRUST       = true
LANDING_REMOVAL_TIME= 60*15f   // V+
TRACK_LENGTH        = 10_000   SIMPLE_TRACK_DRAWING = true
```

**Generation (`initRandom()`)** — all from `Simulator.rng = kotlin.random.Random(seed)`:
```
systemName = namer.nameSystem(rng)
star = Star(cls = rng.choose(StarClass.values()), radius = rng.nextFloatInRange(1000..8000))
star.mass = 4/3 * π * r³ * 0.5 ; star.collides = false ; star.pos = Zero ; star.anim = 0
repeat(rng.nextInt(1, 11)) {                    // 1..10 planets
   radius      = rng.nextFloatInRange(50..2000)
   orbitRadius = lerp(16_000, 150_000, rng.nextFloat().pow(1f))
   period      = sqrt(orbitRadius³ / star.mass) * 50         // Kepler III
   speed       = 2π * orbitRadius / period
   pos         = star.pos + polar(rng()*2π, orbitRadius)
   color       = Colors.Eigengrau4                            // CB: Color.hsv(radius % 360, 0.75, 1)
   mass        = 4/3 * π * radius³ * 2.5
   description = namer.describePlanet(rng)   // "<descriptor> <type>"
   atmosphere  = namer.describeAtmo(rng)
   flora       = namer.describeLife(rng)
   fauna       = namer.describeLife(rng)
}
planets.sortBy { distance to star } ; planet[i].name = "$systemName ${i+1}"
ship = Spacecraft()                            // mass 10, radius 12
ship.pos = star.pos + polar(rng()*2π, rng in 16_000..150_000) ; ship.angle = rng()*2π
ringfence.add(ship) ; follow = ship
```
`initTest()` (`TEST_UNIVERSE = false`) builds 10 planets linearly interpolated across both ranges, an `A`-class star at max radius, `description = "TEST PLANET #n"`, `atmosphere = "radius=…"`, `flora = "mass=…"`, `fauna = "speed=…"`, system name `"TEST SYSTEM"`; ship starts at `polar(π/4, 16_000)` in U, at `planets.last().pos + Vec2(planets.first().radius*1.5, 0)` from V on.

**Planet kinematics** (`Planet.update` / `postUpdate`): planets are *not* gravitating; they are constrained to a circle.
```
update:     orbitAngle = (pos - orbitCenter).angle()
            velocity   = polar(orbitAngle + π/2, speed)     // constant linear speed
            super.update()                                  // opos=pos; pos += v*dt
postUpdate: pos = orbitCenter + polar((pos-orbitCenter).angle(), orbitRadius)
            super.postUpdate()
```
`Star.update` only does `anim += dt` (drives the corona rotation).

**Gravity** (`Universe.updateAll`, applied to the **ship only**):
```
ship.transit = false
for (planet in planets + star) {
   vector = planet.pos - ship.pos ; d = |vector|
   if (d < planet.radius) { if (planet is Star) ship.transit = true }   // occlusion, no collision (star.collides=false)
   else if (now > ship.launchClock + LAUNCH_MECO)
      ship.velocity += polar(vector.angle(), GRAVITATION * (ship.mass * planet.mass) / d²) * dt
}
```
Note the impulse is `G·m₁·m₂/d²·dt` added directly to velocity (no division by ship mass) — replicate exactly or the feel changes.

**Ship thrust** (`Spacecraft.update`):
```
thrustMag = |thrust|
if (thrustMag > 0) {
   deltaV = MAIN_ENGINE_ACCEL * dt
   if (SCALED_THRUST) deltaV *= clamp(thrustMag, 0, 1)
   landing?.let {
      if (launchClock == 0) launchClock = sim.now + 1f
      if (sim.now > launchClock) { landing.ship = null; this.landing = null }   // detach
      else deltaV = 0f                                                          // held down 1 s
   }
   velocity += polar(angle, deltaV)          // always thrusts forward along `angle`
} else if (launchClock != 0f) launchClock = 0f
if (|velocity| > CRAFT_SPEED_LIMIT) velocity = polar(velocity.angle(), 5000)
super.update()
```
**Exhaust** (`Spacecraft.postUpdate`): `track.add(pos.x, pos.y, angle)`; then with probability `thrustMag` per frame, spawn
`Spark(ttl = rng(0.5..1), collides = true, mass = 1, style = RING, size = 1f /*3f in U*/, color = 0x40FFFFFF)` at `pos` with `velocity = ship.velocity + polar(angle + rng(-0.2..0.2), -MAIN_ENGINE_ACCEL*mag*10*dt)`.
`Track.add` drops two entries and appends one when `size >= TRACK_LENGTH-1` (an upstream off-by-one; a faithful port can simply cap at 10 000).

**Collision / landing / impact** (`Universe.solveAll`, only when `ship.landing == null`):
```
planet = closestPlanet()                     // nearest of planets+star by centre distance
if (planet.collides) {
   d = |ship.pos - planet.pos| - ship.radius - planet.radius
   a = (ship.pos - planet.pos).angle()
   if (d < 0) {
      vDiff = |ship.velocity - planet.velocity|       // computed but unused
      aDiff = |ship.angle - a|
      if (aDiff < π/4) {                              // LANDING (speed check is commented out upstream)
         landing = Landing(ship, planet, a, namer.describeActivity(rng, planet))  // V+
         ship.thrust = Vec2.Zero ; ship.landing = landing ; ship.velocity = planet.velocity
         add(landing) ; planet.explored = true ; latestDiscovery = planet
      } else {                                        // IMPACT
         impact = planet.pos + polar(a, planet.radius)
         ship.pos = planet.pos + polar(a, planet.radius + ship.radius - d)   // push out
         repeat(10) { Spark(ttl = rng(0.5..2), DOT, White, size=1) at
                       impact + polar(rng(0..2π), rng(0.1..0.5)) with
                       velocity = ship.velocity*0.8 + polar(rng(0..2π), rng(0.1..0.5)) }
      }
   }
}
super.solveAll(dt, constraints)
```
`Landing.solve`: `desired = planet.pos + polar(angle, ship.radius + planet.radius)`; `ship.pos = 0.5*ship.pos + 0.5*desired` (a soft 50 % projection, marked `@@@ FIXME`); `ship.angle = angle`; `fuse.update(dt)`. Landings auto-expire after `LANDING_REMOVAL_TIME = 900` s of sim time (V+); `postUpdateAll` sweeps removable entities **and** constraints.

So: **land by pointing the nose at the surface** (within 45°) at any speed; crash otherwise. The star cannot be landed on (you just go dark — `transit`).

## 7d. Autopilot (`landroid/Autopilot.kt`, new in V; enabled by a button in Baklava)
An `Entity` added to the sim. Constants: `BRAKING_TIME = 5f`, `SIGHTSEEING_TIME = 15f`, `LAUNCH_THRUST_TIME = 5f`, `STRATEGY_MIN_TIME = 0.5f`. State: `enabled`, `target: Planet?`, `landingAltitude`, `nextStrategyTime`, `brakingDistance`, plus `leadingPos`/`leadingVector` for rendering, and `strategy`/`debug` strings (Baklava makes `strategy` public for the notification).

`update(sim, dt)` — no-op unless `enabled` and `sim.now >= nextStrategyTime`:

- **Landed, with a target still set** → `strategy = "LANDED"`, clear target, `landingAltitude = 0`, `nextStrategyTime = now + 15`.
- **Landed, no target** → `thrust = polar(ship.angle, 1f)` (full power), `strategy = "LAUNCHING"`, `nextStrategyTime = now + 5`.
- **In flight**:
  - if `target == null`: pick the **nearest unexplored** planet (`sortedBy distance .firstOrNull { !it.explored }`); if all explored, `planets.random()`; `brakingDistance = 0`.
  - `shipV/targetV`, `targetVector = target.pos - ship.pos`, `altitude = |targetVector| - target.radius`, `landingAltitude = min(target.radius, 100f)`.
  - relative frame: `relativeV = shipV - targetV`; `projection = relativeV · unit(targetVector)`; `relativeSpeed = |relativeV| * sign(projection)`; `timeToTarget = altitude/relativeSpeed` (or `1000` if 0).
  - `newBrakingDistance = BRAKING_TIME * (relativeSpeed > 0 ? relativeSpeed : MAIN_ENGINE_ACCEL)`; `brakingDistance = expSmooth(brakingDistance, newBrakingDistance, dt = sim.dt, speed = 5f)`.
  - **Lead the target**: `leadingPos = target.pos + polar(target.velocity.angle(), min(altitude/2, |target.velocity|))`; `leadingVector = leadingPos - ship.pos`.
  - `altitude < landingAltitude` → **LANDING**: `ship.angle = (ship.pos - target.pos).angle()` (nose away from the ground), `thrust = Zero`.
  - else if `relativeSpeed < 0 || altitude > brakingDistance` → **CHASING**: `ship.angle = leadingVector.angle()`, `thrust = polar(angle, 1.0)`.
  - else → **APPROACHING**: `ship.angle = (-ship.velocity).angle()` (retrograde); `decel = relativeSpeed / timeToTarget`; `thrust = polar(angle, decel/MAIN_ENGINE_ACCEL * 0.9f)` ("not quite slowing down enough").
  - `debug = "DV=%.0f D=%.0f T%+.1f"` (relativeSpeed, altitude, timeToTarget).
  - On any strategy change: `nextStrategyTime = now + 0.5`.

Telemetry block (Baklava returns `""` when disabled):
```
---- AUTOPILOT ENGAGED ----
TGT: <NAME|SELECTING...>
EXE: <STRATEGY> (DV=… D=… T±…)
```

Baklava wiring (`MainActivity.onCreate`): create `Autopilot(ship, universe)`, `ship.autopilot = it`, `universe.add(it)`, `enabled = false`. The `AUTO` `ConsoleButton` toggles `it.enabled`, sets `DYNAMIC_ZOOM = enabled`, and zeroes thrust when turning off.

## 7e. `Universe` progression / rendering (`VisibleUniverse.kt`)
Baklava drops the `VisibleUniverse` wrapper class entirely — `MainActivity`/`DreamUniverse` use plain `Universe`, and redraw is driven by `Simulator.addSimulationStepListener { invalidateDraw() }` through a custom `Modifier.Node` + `DrawModifierNode` (`UniverseElement`/`UniverseModifierNode`, exposed as `Modifier.drawUniverse(u){…}` and `@Composable UniverseCanvas`). `Telescope(subject){…}` is a `RememberObserver`-based helper that registers/unregisters a step listener and lets `Telemetry` call `currentRecomposeScope.invalidate()`.

`drawUniverse` order: constraints (`Landing` → flag, `Container` → ringfence) → `drawStar` → entities except the star (`Spark`, `Planet`; the ship is skipped here) → `ship.autopilot?.let{drawAutopilot}` → `drawSpacecraft(ship)`.

`Spaaaace` (the frame): `drawRect(Colors.Eigengrau)` full-bleed → `closest = u.closestPlanet()`; `distToNearestSurf = max(0, |ship.pos-closest.pos| - closest.radius*1.2)`; `targetZoom = DYNAMIC_ZOOM ? clamp(500/distToNearestSurf, MIN, MAX) : DEFAULT_CAMERA_ZOOM`; `cameraZoom = expSmooth(cameraZoom, targetZoom, dt = u.dt, speed = 1.5f)` when touch-zoom is off; `cameraOffset = -follow.pos` when touch-pan is off. `MIN_CAMERA_ZOOM = 250/200_000 = 0.00125`, `MAX_CAMERA_ZOOM = 5`. Visible rect = `size/cameraZoom` centred on `-cameraOffset`, with fold-aware `centerFracX/Y` animating to `0.25` when the device is half-folded (`FoldingFeature`, orientation-dependent). Grid: `gridStep = 1000`, `*= 10` while `gridStep*zoom < 32dp`; lines in `Eigengrau2`, width `3/zoom` when `coord % (gridStep*10) == 0` else `1.5/zoom`.

`ZoomedDrawScope` = a `DrawScope` that remembers `zoom` so strokes can be divided by it (`1f/zoom`, `2f/zoom`, `3f/zoom`) to stay hairline-thin.

Drawing primitives:
- **Container/ringfence**: circle r=200 000 at origin, `Color(0xFF800000)`, stroke `1/zoom`, `dashPathEffect([8/zoom, 8/zoom])`.
- **Gravity field** (per planet, 8 rings): `force = lerp(200f, 0.01f, i/8)`; `r = sqrt(GRAVITATION * planet.mass * SPACECRAFT_MASS / force)`; `Color(1,0,0, lerp(0.5, 0.1, i/8))`, stroke `2/zoom`.
- **Planet**: orbit circle `Color(0x8000FFFF)` stroke `1/zoom`; gravity field; disc filled `Eigengrau`; rim stroked `planet.color` width `2/zoom`.
- **Star**: disc `star.color`; gravity field; two rotating coronae — `createStar(radius1 = R+80, radius2 = R+250, points = STAR_POINTS)` rotated by `anim/23 * 2π`, and `createStar(R+20, R+200, STAR_POINTS+1)` rotated by `anim/-19 * 2π`; both stroked `star.color` width `3/zoom` with `cornerPathEffect(200f)` (rounds the spikes). `STAR_POINTS = Build.VERSION.SDK_INT.takeIf { it in 1..99 } ?: 31` → normally **31**.
  Star classes → colours: `O #FF6666FF`, `B #FFCCCCFF`, `A #FFEEEEFF`, `F #FFFFFFFF`, `G #FFFFFF66`, `K #FFFFCC33`, `M #FFFF8800`.
- **Ship**: `rotateRad(angle, pos) { translate(pos) { … } }` — `spaceshipPath` filled `Eigengrau` (faux-opaque) then stroked `White` (or `Black` while `transit`) width `2/zoom`; `spaceshipLegs` stroked `#FFCCCCCC` when landed; `thrustPath` (a triangle `createPolygon(-3f, 3)` translated `(-5,0)`) stroked `#FFFF8800` width `2/zoom` with `cornerPathEffect(1f)` when thrusting. Then `drawTrack`.
- **Track**: `drawPoints(positions, PointMode.Lines, Colors.Track /*#FF34A853*/, 1/zoom)` (`SIMPLE_TRACK_DRAWING = true`); the alternative branch fades alpha from 0.5 by `1/TRACK_LENGTH` per segment.
- **Spark** styles: `LINE`/`LINE_ABSOLUTE` (`opos→pos`, width `size` or `size/zoom`), `DOT`/`DOT_ABSOLUTE` (`drawCircle(color,size,pos)` / `pos/zoom`), `RING` (animated: `alpha *= (1-life)`, `radius = exp(lerp(size, 3*size, life)) - 1`, stroke `1/zoom`, `life = 1 - fuse.lifetime/ttl`).
- **Autopilot**: `Colors.Autopilot (#FF4285F4) @ alpha 0.5`; a **15-gon** (`sides = 15 // Autopilot introduced in Android 15`) of radius `target.radius + brakingDistance` rotating at `now * 2π / 10`; a circle of radius `target.radius + landingAltitude/2` stroked with `width = landingAltitude` at `alpha 0.25` (a thick annulus); a line `ship.pos → leadingPos`; a circle `r = 5/zoom` at `leadingPos`.
- **Flag** (`flagFlag()` always true): as described in §6.

`spaceshipPath` (SVG, parsed by `parseSvgPathData`), local origin at the ship centre, nose at +x:
```
M11.853 0  C11.853 -4.418 8.374 -8 4.083 -8  L-5.5 -8
C-6.328 -8 -7 -7.328 -7 -6.5  C-7 -5.672 -6.328 -5 -5.5 -5  L-2.917 -5
C-1.26 -5 0.083 -3.657 0.083 -2  L0.083 2
C0.083 3.657 -1.26 5 -2.917 5  L-5.5 5
C-6.328 5 -7 5.672 -7 6.5  C-7 7.328 -6.328 8 -5.5 8  L4.083 8
C8.374 8 11.853 4.418 11.853 0 Z
```
i.e. a rounded nose cone (r≈4.29 at x≈4.08), a body waist at x=0.083 (±2), and two rear "fins"/pads at x=−7 (±6.5, r=1.5). Extent ≈ x∈[−7, 11.85], y∈[−8, 8] — matches `radius = 12f`.
`spaceshipLegs`: two chevrons `M-7 ∓6.5 l-3.5,0 l-1,-2 l0,4 l1,-2 Z`.

`createStar(r1, r2, points)`: `moveTo(r1,0)`, `lineTo(polar(r2, step*0.5))`, then for `i in 1..points-1` `lineTo(polar(r1, step*i))`, `lineTo(polar(r2, step*(i+0.5)))`, `close()`, `step = 2π/points`.
`createPolygon(radius, sides)`: `moveTo(radius,0)` then `lineTo(polar(radius, step*i))` for `i in 1..sides-1`, `close()`. Note `createPolygon(-3f, 3)` yields a triangle with `radius = -3` (pointing −x).

## 7f. Namer (`landroid/Namer.kt` + `res/values/landroid_strings.xml`)
Probabilities: `SUFFIX_PROB = 0.75`, `LETTER_PROB = 0.3`, `NUMBER_PROB = 0.3`, `RARE_PROB = 0.05`.
Two primitives from `Randomness.kt`:
- `Bag<T>(items)` — a shuffle bag: copies the array, `next = size` so the first `pull` shuffles; returns `remaining[next++]`; reshuffles when exhausted. **No duplicates within a cycle.**
- `RandomTable<T>(vararg Pair<Float,T>)` — weights need not sum to 1; `roll` walks `x = rng.nextFloatInRange(0, total)` subtracting each weight.

Tables: `planetTable 0.75 planetDescriptors / 0.25 anyDescriptors`; `lifeTable 0.75/0.25`; `atmoTable 0.75/0.25`; `constellationsTable 0.05 rare / 0.95`; `suffixesTable 0.05 rare / 0.95`;
`delimiterTable = { 15:" ", 3:"-", 1:"_", 1:"/", 1:".", 1:"*", 1:"^", 1:"#", 0.1:"(^*!%@##!!" }`.

```
describePlanet = planetTable.roll().pull() + " " + planetTypes.pull()
describeLife   = lifeTable.roll().pull()
describeAtmo   = atmoTable.roll().pull()
nameSystem     = constellation
               + [ 75%: delimiter + suffix  (+5%: " " + rareSuffix) ]
               + [ 30%: delimiter + ('A'+rnd(0,26)) (+5%: extra delimiter) ]
               + [ 30%: delimiter + rnd(2, 5039) ]
```
Word lists (`baklava_*`, identical to `v_*`):
- `planet_descriptors` (32): earthy, swamp, frozen, grassy, arid, crowded, ancient, lively, homey, modern, boring, compact, expensive, polluted, rusty, sandy, undulating, verdant, tessellated, hollow, scalding, hemispherical, oblong, oblate, vacuum, high-pressure, low-pressure, plastic, metallic, burned-out, bucolic.
- `life_descriptors` (50): aggressive, passive-aggressive, shy, timid, nasty, brutish, short, absent, teen-aged, confused, transparent, cubic, quadratic, higher-order, huge, tall, wary, loud, yodeling, purring, slender, cats, adorable, eclectic, electric, microscopic, trunkless, myriad, cantankerous, gargantuan, contagious, fungal, cattywampus, spatchcocked, rotisserie, farm-to-table, organic, synthetic, unfocused, focused, capitalist, communal, bossy, malicious, compliant, psychic, oblivious, passive, bonsai.
- `any_descriptors` (75): silly, dangerous, vast, invisible, superfluous, superconducting, superior, alien, phantom, friendly, peaceful, lonely, uncomfortable, charming, fractal, imaginary, forgotten, tardy, gassy, fungible, bespoke, artisanal, exceptional, puffy, rusty, fresh, crusty, glossy, lovely, processed, macabre, reticulated, shocking, void, undefined, gothic, beige, mid, milquetoast, melancholy, unnerving, cheery, vibrant, heliotrope, psychedelic, nondescript, indescribable, tubular, toroidal, voxellated, low-poly, low-carb, 100% cotton, synthetic, boot-cut, bell-bottom, bumpy, fluffy, sous-vide, tepid, upcycled, sous-vide, bedazzled, ancient, inexplicable, sparkling, still, lemon-scented, eccentric, tilted, pungent, pine-scented, corduroy, overengineered, bioengineered, impossible.
- `atmo_descriptors` (26): toxic, breathable, radioactive, clear, calm, peaceful, vacuum, stormy, freezing, burning, humid, tropical, cloudy, obscured, damp, dank, clammy, frozen, contaminated, temperate, moist, minty, relaxed, skunky, breezy, soup.
- `planet_types` (20): planet, planetoid, moon, moonlet, centaur, asteroid, space garbage, detritus, satellite, core, giant, body, slab, rock, husk, planemo, object, planetesimal, exoplanet, ploonet.
- `constellations` (46): Aries, Taurus, Gemini, Cancer, Leo, Virgo, Libra, Scorpio, Sagittarius, Capricorn, Aquarius, Pisces, Andromeda, Cygnus, Draco, Alcor, Calamari, Cuckoo, Neko, Monoceros, Norma, Abnorma, Morel, Redlands, Cupcake, Donut, Eclair, Froyo, Gingerbread, Honeycomb, Icecreamsandwich, Jellybean, Kitkat, Lollipop, Marshmallow, Nougat, Oreo, Pie, Quincetart, Redvelvetcake, Snowcone, Tiramisu, Upsidedowncake, Vanillaicecream, Android, Binder, Campanile, Dread.
- `constellations_rare` (19, 5 %): Jandycane, Zombiegingerbread, Astro, Bender, Flan, Untitled-1, Expedit, Petit Four, Worcester, Xylophone, Yellowpeep, Zebraball, Hutton, Klang, Frogblast, Exo, Keylimepie, Nat, Nrp.
- `star_suffixes` (36, 75 %): Alpha…Omega (24 Greek), Prime, Secundo, Major, Minor, Diminished, Augmented, Ultima, Penultima, Mid, Proxima, Novis, Plus.
- `star_suffixes_rare` (12, 5 %): Serif, Sans, Oblique, Grotesque, Handtooled, `III “Trey”` (U+201C/U+201D curly quotes), Alfredo, 2.0, (Final), (Final (Final)), (Draft), Con Carne.

## 7g. `DreamUniverse` (Baklava)
Same as V except: builds a plain `Universe`, `Telemetry(universe, showControls = false)` (no `AUTO` button in the screensaver), creates a `UniverseProgressNotifier(this, universe)`, cancels it in `onDestroy`. Manifest: `enabled=false`, `BIND_DREAM_SERVICE`, `meta-data android.service.dream → @xml/baklava_landroid_dream` (`previewImage = @drawable/baklava_platlogo`). `ComponentActivationActivity.lockUnlockComponents()` (called from `MainActivity.onCreate`) force-enables it because `Flags.flagFlag()` is hard-coded `true` (`unlockValue = 1`, `shouldReLock = false`).

## 7h. `UniverseProgressNotifier` (Baklava-only, API 36 `Notification.ProgressStyle`)
```
CHANNEL_ID = "progress" ; CHANNEL_NAME = "Spacecraft progress" ; IMPORTANCE_LOW ; VISIBILITY_PUBLIC
UPDATE_FREQUENCY_SEC = 1f           // one notification per simulated second
notificationId = universe.randomSeed.toInt()
lerpRange(PLANET_RADIUS_RANGE, x) = lerp(50f, 2000f, x)
```
Registered via `universe.addSimulationStepListener(this::onSimulationStep)`; `cancel()` disposes and cancels the notification. Builder: `setContentIntent(MainActivity, SINGLE_TOP)`, `setOngoing(true)`, `setColor(Colors.Eigengrau2.toArgb())`, `FLAG_ONLY_ALERT_ONCE`, `setRequestPromotedOngoing(true)` on `SDK_INT_FULL >= BAKLAVA_1`, `setStyle(progress)` when supported. `ProgressStyle.setProgressTrackerIcon(baklava_ic_spacecraft_filled)`; planet end-icon chosen by radius: `> lerp(0.75)=1512.5` → large, `> lerp(0.5)=1025` → medium, `> lerp(0.25)=537.5` → small, else tiny. On launch the end icon is promoted to the start icon.

States (title / text / `setShortCriticalText`):
| condition | title | text | critical | progress |
|---|---|---|---|---|
| landed | `landed: <NAME>` | `currently: <activity>` | `landed` | `setProgress(progressMax)`, determinate |
| autopilot + target | `headed to: <NAME>` | `autopilot is <strategy lowercase>` + `\ndist: <N>u // eta: <N>s` (`dist/speed`, or `???`) | `en route` | one segment of `initialDistToTarget` coloured `Colors.Track`, `setProgress(initial - current)` |
| autopilot, no target | `in space` | `selecting new target...` | `launched` | indeterminate |
| manual | `in space` | `under manual control` | `adrift` | `setStyle(null)` |

`setSubText(getSystemDesignation(universe))` = `"${dessertCode}-${seed % 100_000}"` (BKL-… on API 36). `setSmallIcon(baklava_ic_spacecraft_rotated)` and then the joke:
```java
notification.iconLevel = (int)(((ship.angle + 2π) / 2π) * 10_000f)
```
so the status-bar rocket icon **rotates with the ship**.

## 7i. Baklava `ComposeTools.kt` additions
`flickerFadeInAfterDelay(delay)` (1000 ms tween, `CubicBezierEasing(0,1,1,0) * flickerFadeEasing(Random)`); `ConsoleButton(textStyle, color, bgColor, borderColor, text, onClick)` = a `Text` with `.clickable{}.background(bgColor).border(1.dp, borderColor).padding(6.dp).minimumInteractiveComponentSize()`. `flickerFadeEasing(rng) = Easing { frac -> if (rng.nextFloat() < frac) 1f else 0f }` — a stochastic CRT flicker-in. `operator fun Easing.times(next) = { x -> next.transform(transform(x)) }`.

## Canvas port (Landroid, all of U/V/Baklava/CB)
One `requestAnimationFrame` loop. Keep world units = the constants above (200 000-unit universe, 12-unit ship) and a camera `{zoom, offset}`; `ctx.setTransform(zoom,0,0,zoom, cx - (-offset.x)*zoom, cy - (-offset.y)*zoom)`. Stroke widths must be divided by `zoom` (`ctx.lineWidth = 2/zoom`). Ship path is directly transcribable (`moveTo`/`bezierCurveTo`/`lineTo`/`closePath`). Coronae = `createStar` polylines with `ctx.lineJoin='round'` (a decent stand-in for `cornerPathEffect(200)`; for fidelity, round each corner by arc-joining with radius 200 in world units). `PointMode.Lines` = pairs of consecutive track points (`moveTo/lineTo` per pair, not a single polyline). Grid: recompute `gridStep` each frame from `32*dpr` in screen px. Autopilot: implement the state machine verbatim — it is only ~60 lines and the constants are all given above.

**Complexity: L** (the largest single item in this batch; ~1200 lines of TS if you include autopilot + notification-equivalent HUD).

---

# 8. `eggs/CinnamonBun` — Android 17, API 37 (`CINNAMON_BUN`..`CINNAMON_BUN_1`)

**Confirmed:** `cinnamon_bun_egg_name` = **"Cinnamon Bun"** (used for both `nameRes` and `nicknameRes`); `fullApiLevelRange = CINNAMON_BUN..CINNAMON_BUN_1`; timeline `2026/MAY "Cinnamon Bun."` and `2026/AUGUST "Cinnamon Bun.\nAndroid 17.1"`; repo `compileSdk/targetSdk = 37`. There is **no README** for this module. `resourcePrefix = "cinnamon_bun_"`.

## PlatLogo — the heptadecagram minigame
Same skeleton as Baklava (`LAUNCH_TIME = 5000`, `MAX_WARP = 16`, `MIN_WARP = 1`, HDR colour mode, `PRIMITIVE_SPIN` rumble, `EGG_UNLOCK_SETTING = "egg_mode_cinnamon_bun"` written via `SpUtils`) with two big changes:

**(1) A new radial starfield.** `setVelocity` is gone; instead `mStarfield.setWarp(0.1f) // very slow to start`. `NUM_STARS = 128`, `NUM_PLANES = 4`, `ROTATION = 45`, same `mBuffer`/`mRadius`. Initialisation is polar: `angle = rnd*2π`, `dist = rnd*mRadius`, head = `(cos·dist, sin·dist)`, tail = `(-10000,-10000)`. Per frame:
```
speedBase = 0.05 * dtSec * warp
for each star: plane = floor(i/128*4)+1 ; speed = speedBase*plane
   x += x*speed ; y += y*speed                          // exponential radial expansion
   if (x² + y² >= mRadius²) respawn at angle=rnd*2π, dist=rnd*0.1*mRadius
   if inWarp: tailScale = 1/(1 + speed*warp); tail = head*tailScale   // streak toward centre
   else tail = (-10000,-10000)
```
Colours/bloom unchanged: per-plane HDR grey `(p+1)/3`, full-screen `packHdrWhite(2.0, frac²)` when `warp > 1`. `packHdrColor` was renamed `packHdrWhite`, and `isSRgbExtSupported`/`packColor`/`pointInRadius` moved up to the activity.

**(2) A draw-the-star puzzle gates the logo.** The `ImageView` starts `GONE`; instead a `mHeptaDecaView` with a `Heptadecagram` background is added (same centred `widgetSize = minSide*0.75` LayoutParams).

```java
Heptadecagram: MAX_DOTS = 17
mRadius    = min(cx, cy) * 0.9f
mDotRadius = 4 * dp        // drawn as a 45°-rotated SQUARE (diamond), not a circle
mHitRadius = 24 * dp
dot[i] = (cx + cos(-π/2 + 2πi/17)*R, cy + sin(...)*R)     // starts at 12 o'clock
mBgPaint   = BLACK ; background = filled circle of radius mRadius
mDotPaint  = FILL, packHdrWhite(1.5f, 1.0f)               // HDR white at 1.5
mLinePaint = STROKE 0xFFB31F7F, width 4*dp, Join.ROUND, Cap.ROUND
mPath = int[18] ; mPathLength
```
Touch: `ACTION_DOWN` resets the path and starts tracking; `ACTION_MOVE` updates `mTouchX/Y` and calls `checkDot`; `ACTION_UP/CANCEL` stops tracking and clears. `checkDot(x,y)` finds any dot within `mHitRadius`; accepts it if it is the first, or if it differs from the last and is unvisited — **or** if `mPathLength == 17 && mPath[0] == i` (closing the loop). Each accepted dot returns `true` → `performHapticFeedback(CONFIRM)`. `draw()` renders the black disc, the polyline through `mPath[0..len-1]` extended to the live touch point while tracking, then all 17 diamonds on top.

Completion: when `getPathLength() > 17` (i.e. 18 = the loop is closed), `isPendingSwapToPlatlogo = true`; on the next `ACTION_UP` → `swapToPlatlogo()`:
```java
mHeptaDecaView.animate().alpha(0f).setDuration(500).withEndAction(GONE)
mLogo alpha 0 → VISIBLE → animate().alpha(1f).setDuration(500)
mLogo.requestFocus()
ObjectAnimator.ofFloat(mStarfield, "warp", MIN_WARP).setDuration(250)   // 0.1 → 1.0
```
After that the normal press-and-hold warp works. Pressing **SPACE** while the logo is hidden skips the minigame entirely (`swapToPlatlogo()`).

## PlatLogo art — `cinnamon_bun_platlogo.xml` (512dp, viewport **512×512**)
Group `android-17-logo`:
1. `spacebg`: circle `M74,256 a182,182 0 1,0 364,0 a182,182 0 1,0 -364,0` → centre (256,256) r=182, fill `#0D242F`.
2. `heptadecagram-petals` — three tiers of **17 triangles each**, all sharing vertices on the 17-gon:
   - `tier1` `#0D242F` (same as the bg — invisible, structural), e.g. `M432.732 274.756 L442.274 241.221 L446.733 210.010 Z`
   - `tier2` `#66245A`, e.g. `M426.733 210.01 L442.273 241.221 L453.305 202.45 L423.516 175.294 Z` (quads)
   - `tier3` `#B31F7F`
   The 17 outer vertices are at radius ≈196 from (256,256) starting near (256.556, 71.917); secondary ring ≈ (453.305, 202.45) etc. Together they form the classic {17/…} star polygon rosette.
3. `starfield` — 17 four-pointed sparkle stars `#E08DE9`, each a 12-command cubic "astroid" (e.g. `M155.269 226.896 C156.002 226.164 … Z`), three sizes (half-extent ≈2, ≈2.65, ≈5.3).
4. `"planet 17"` → group `planet-17-next`:
   - `planet`: circle centre (256,256) **r=75**, fill `#34A853`, stroke `#61DD82`, `strokeWidth 8`.
   - `atmospheric bands`: 7 groups (`line1`…`line7`) of short `#61DD82` `strokeWidth 8` round-cap diagonal segments (45° chords of the disc), e.g. `M275.799 316.811 L276.506 316.104`, `M286.052 306.558 L330.972 261.638`, `M239.029 326.711 L266.606 299.134`.
   - `storm`: two cross-bars (`M205.727 272.932 H212.5`, `M232.821 245.839 V252.613`), one S-curve `M266.607 299.134 C285.12 280.62 267.057 271.813 287.113 251.757`, and the **`great cinnamon swirl`**: `M266.
</task_result>
</task>