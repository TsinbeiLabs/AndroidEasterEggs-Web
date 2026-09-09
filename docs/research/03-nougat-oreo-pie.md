<task id="ses_f7984c027ffeNv6grgwXYmPbca" state="completed">
<task_result>
# Android Easter Egg Research Report — `Nougat`, `Oreo`, `Pie`

Repo: `hushenghao/AndroidEasterEggs` @ `main`. All findings below are read directly from the sources listed at the end of each section.

**Two premise corrections up front:**
1. There is **no `Dish` class** in this repo's Nougat module. The dish/food model lives in `Food.java` + `NekoDialog.java` + `NekoTile.java` + `NekoService.java` (AOSP's `Dish` was renamed/split).
2. There is **no `PaintTiles`** anywhere in `eggs/Pie`. Pie's secondary screen is **`PAINT.APK`** — a full-screen pressure-sensitive finger-painting app (`PaintActivity` + `Painting` + `SpotFilter`). `PaintChipsActivity`/`PaintChipsWidget` exist only in `eggs/S` and `eggs/Tiramisu` (a different batch).

`eggs/Base/PlatLogoActivity.kt` is **not** shared by these three — it only serves API 1–8 (Cupcake…Froyo) with a static Compose `Image` + toast. N/O/P each ship their own hand-written `PlatLogoActivity`.

---

# 1. Nougat (Android 7.0/7.1, API 24–25) — "Neko"

## 1.1 PlatLogo screen

Single `ImageView` centred in a `FrameLayout`, wallpaper-themed (transparent) activity.

| Property | Value |
|---|---|
| View size | `min(min(screenW, screenH), 600dp) − 100dp`, square, `Gravity.CENTER` |
| Padding | `40dp` all sides → the art occupies `size − 80dp` |
| `translationZ` | `20` |
| Background | `RippleDrawable(0xFFFFFFFF, n_platlogo, null)` — **white** ripple |
| Entry animation | `scaleX/Y 0.5 → 1.0`, `alpha 0 → 1`, **startDelay 800 ms**, **duration 500 ms**, `PathInterpolator(0,0, 0.5,1)` (strong ease-out) |

**Interaction** (`PlatLogoActivity.java`):
- The `OnLongClickListener` is only *installed* inside `onClick`, so a long-press before the first tap does nothing.
- Each tap increments `mTapCount` and fires the white ripple.
- Long-press is ignored (`return false`) until `mTapCount >= 5`.
- On a successful long-press: write `n_egg_mode = System.currentTimeMillis()` (only if currently `0`), then `startActivity(NekoActivationActivity)` and `finish()` (only if `FINISH`, which is `false` in the shipping class → the PlatLogo stays behind).
- Keyboard/TV: any non-BACK key-down increments `mKeyCount`; from the 3rd key onward it calls `performClick()` while `mTapCount <= 5`, otherwise `performLongClick()`.
- `REVEAL_THE_NAME = false` in `PlatLogoActivity`. The **`preview.PlatLogoActivity`** variant sets it to `true`: the long-press then cross-fades the `n_platlogo_m` wordmark overlay in over **500 ms** (`ObjectAnimator alpha 0→255`) and returns without launching the egg.

**No colour cycling on the N PlatLogo** (unlike Pie). The only animated thing is the ripple and the entry scale/fade.

### `n_platlogo.xml` geometry (viewport **48 × 48**, intrinsic 512dp)

The Android "N" ribbon. Draw order matters:

| # | pathData (absolute) | Fill |
|---|---|---|
| A | `M32,12.5 L32,40.5 L44,35.5 L44,7.5 Z` (right vertical bar, parallelogram) | `#C7D4B6` |
| B | `M4,40.5 L16,35.5 L16,24.5 L4,12.5 Z` (left vertical bar) | `#FBD3CB` |
| C | `M44,35.5 L32,23.5 L32,19.5 Z` (joint shadow, right) | `#000000` @ alpha `0x40` = 25.1 % |
| D | `M4,12.5 L16,24.5 L16,28.5 Z` (joint shadow, left) | `#000000` @ 25.1 % |
| E | `M32,23.5 L16,7.5 L4,12.5 L16,24.5 L32,40.5 L44,35.5 Z` (the diagonal stroke, on top) | `#E0E0D6` |

`n_icon.xml` / `n_platlogo_preview.xml` / `n_android_logo_fg.xml` use the **identical geometry** with different colours: bars `#7E5BBF`, diagonal `#55C4F5`, same `#40000000` joint shadows. Adaptive-icon background `n_android_logo_bg` = `#B5DDEF`; `n_android_logo_fg` wraps the art in a `<group>` scaled 0.5 about pivot (24,24) inside a 108-viewport canvas.

`n_platlogo_m.xml` (the "nougat" wordmark overlay, Preview variant only): viewport 48×48, 18 white (`#FFFFFF`) paths — two long parallel diagonal bars (`M33.8,38 L8.3,12.5 L6.6,13.2 L32.1,38.7 Z` and `M40.8,34.8 L15.4,9.3 L13.7,10 L39.2,35.5 Z`) plus 16 small letterform paths running diagonally between them. Not worth porting unless you want the Preview egg.

## 1.2 Unlock flow

`NekoActivationActivity` (theme `NoDisplay`) toggles the `NekoTile` QS component: if enabled → disable + toast `🚫` (`\uD83D\uDEAB`); if disabled → enable + toast `🐱` (`\uD83D\uDC31`), then `finish()`. On SDK < N it just toasts 🐱.

## 1.3 Food / dish model

Five food types, index `0..4`. Index 0 is never selectable in the dialog (`NekoDialog.Adapter` starts the loop at `i = 1`).

| idx | name (`n_food_names`) | icon (`n_food_icons`) | interval **minutes** (`n_food_intervals`) | new-cat **%** (`n_food_new_cat_prob`) |
|---|---|---|---|---|
| 0 | `Empty dish` | `n_food_dish` | 0 | 0 |
| 1 | `Bits` | `n_food_bits` | 15 | 5 |
| 2 | `Fish` | `n_food_sysuituna` | 30 | 35 |
| 3 | `Chicken` | `n_food_chicken` | 60 | 65 |
| 4 | `Treat` | `n_food_donut` | 120 | 90 |

All five food vectors are **48×48 viewport, single-colour `#FF000000`**, tinted at runtime with `?android:attr/colorControlNormal` (see `n_food_layout.xml`). They are line-art icons:
- **dish**: an ellipse `rx=23, ry=10.2` centred (24,24) with an inner ellipse cut-out (the bowl rim).
- **bits**: 4 small scattered rounded quads (kibble) around (12–35, 19–36).
- **fish** (`n_food_sysuituna`): a stylised fish body with tail fins, an X-eye at (12.6,23.1) and two gill arcs.
- **chicken**: a drumstick — roasted-body semicircle `M9,25 a15,15 0 0,0 30,0` with 3 grill lines, a bone shaft `M27,38.6 h2 v6 h-2`, a diagonal bone `M17.4,44.6 l-2.2,0 l4.4,-6 l2.2,0`, plus a head/comb cluster at the top-left.
- **donut**: outer circle `r=19` @(24,23.5), hole `r=6.5` @(24,23.5), and ~25 tiny rotated sprinkle capsules (`≈1.5–2.0` long, `≈0.6` wide, round caps) scattered in the ring.

### Cat arrival timing & probability (`NekoService.java`)

```
SECONDS = 1000;  MINUTES = 60_000
INTERVAL_FLEX      = 5 * MINUTES          // JobScheduler flex window
INTERVAL_JITTER_FRAC = 0.25
CAT_CAPTURE_PROB   = 1.0f                 // "generous" — always fires
JOB_ID             = 42 + 24 = 66
CAT_NOTIFICATION   = 1 + 24 = 25
CHAN_ID            = "N_EGG"
PURR (vibration)   = {0,40,20,40,20,40,20,40,20,40,20,40}
```

Scheduling (`registerJob`): `interval = minutes*60000`; `jitter = 0.25*interval`; `interval += random()*(2*jitter) − jitter` → **±25 % jitter**; then `JobInfo.setPeriodic(interval, 5min)`. `registerJobIfNeeded` only schedules when no pending job with that ID exists.

On job fire (`onStartJob`):
1. `food = prefs.getFoodState()`; if `food == 0` → cancel job, return.
2. `prefs.setFoodState(0)` — **the dish is emptied ("nom")**.
3. `if (rng.nextFloat() <= 1.0)` (always):
   - `new_cat_prob = (food < probs.length ? probs[food] : 50) / 100f`
   - `if (cats.size() == 0 || rng.nextFloat() <= new_cat_prob)` → **new cat**: `Cat.create()`, `prefs.addCat(cat)`, log `"A new cat is here: " + name`
   - else → **returning cat**: `cats.get(rng.nextInt(cats.size()))`, log `"A cat has returned: " + name`
   - post the notification.
4. `cancelJob()`.

Notification: small icon `n_stat_icon`, `setColor(bodyColor)`, `PRIORITY_LOW`, title `"A cat is here."` (`notification_title`), text = cat name, subText `"Android N Neko"` (`n_notification_name`), `CATEGORY_STATUS`, `setShowWhen(true)`, `setAutoCancel(true)`, `setVibrate(PURR)`, channel `"N_EGG"` (named `"New cats (N)"`, silent sound, PURR vibration, `VISIBILITY_PUBLIC`). Tapping opens `NekoLand`.

So the **effective expected wait** for a visit is `interval_minutes × (1 ± 0.25)`: Bits ≈ 11.25–18.75 min, Fish ≈ 22.5–37.5, Chicken ≈ 45–75, Treat ≈ 90–150.

### Tile behaviour (`NekoTile.java`)
- `updateState()`: if `foodState != 0` re-register the job if needed; icon = food icon, label = food name, `STATE_ACTIVE` when food is loaded else `STATE_INACTIVE`.
- `onClick()`: if food is loaded → **empty the dish** (`setFoodState(0)` + `cancelJob`); else open `NekoDialog` (via `NekoLockedActivity` when the keyguard is secure).
- Tile is `android:enabled="false"` in the manifest, label `\????` (`n_default_tile_name`, literally four question marks), icon `n_stat_tint_icon`.

### `NekoDialog` (the food picker)
`Dialog` with `Theme_Material_Dialog_NoActionBar`; content is a bare `RecyclerView`, `GridLayoutManager(2)`, padding `16dp` all sides. Items (`n_food_layout.xml`): vertical `LinearLayout`, 4dp L/R padding, 6dp T/B padding, `selectableItemBackgroundBorderless`; `ImageView` **64 × 64dp** tinted `colorControlNormal`; `TextView` **64dp** wide, `gravity="top|center_horizontal"`. Selecting food `i`: if the current state is `0` and `i != 0` → `NekoService.registerJob(ctx, interval[i])`; then `setFoodState(i)`; `dismiss()`.

## 1.4 Cat sprite — exact vector geometry

**All 27 cat parts share viewport `48 × 48`** (`android:width/height = 48dp`). Everything is `#FF000000` and gets `setTint()` at runtime. `Cat.slowDraw()` sets each drawable's bounds to the target square and draws in `drawingOrder`.

Draw order (index → part), which is also the array layout used by `feature/cat-editor/CatPartColors.kt`:

```
 0 collar
 1 leftEar        2 leftEarInside    3 rightEar      4 rightEarInside
 5 head
 6 faceSpot
 7 cap
 8 leftEye        9 rightEye
10 nose          11 mouth
12 tail          13 tailCap         14 tailShadow
15 foot1         16 leg1
17 foot2         18 leg2
19 foot3         20 leg3
21 foot4         22 leg4
23 leg2Shadow
24 body          25 belly
26 bowtie
```

> `D.back` (`n_back.xml`) is loaded and tinted but **never appears in `drawingOrder`** — dead art, exactly as in AOSP. Don't draw it.

Exact paths (all fill unless noted):

| Part | pathData | Notes |
|---|---|---|
| `collar` | `M9,18.4 h30 v1.7 h-30 z` | rect x 9→39, y 18.4→20.1 |
| `leftEar` | `M15.4,1 L20.5,6.3 L14.2,9.1 Z` | triangle |
| `leftEarInside` | `M15.4,1 L18.9,7.2 L14.2,9.1 Z` | triangle |
| `rightEar` | `M32.6,1 L27.5,6.3 L33.8,9.1 Z` | triangle |
| `rightEarInside` | `M33.8,9.1 L29.1,7.2 L32.6,1 Z` | triangle |
| `head` | `M9,18.5 C9,10.2 15.8,3.5 24,3.5 S39,10.2 39,18.5 H9 Z` |半円 dome, r=15, centre (24,18.5), flat bottom at y=18.5 |
| `faceSpot` | ellipse centre **(24, 15.2)**, `rx=4.5`, `ry=3.2` | `M19.5,15.2 a4.5,3.2 0 1,0 9,0 a4.5,3.2 0 1,0 -9,0 z` |
| `cap` | `M27.2,3.8 C26.2,3.6 25.1,3.5 24,3.5 S21.9,3.6 20.8,3.8 C21,5.1 22.3,6 24,6 C25.6,6.1 26.9,5.1 27.2,3.8 Z` | small head-top patch |
| `leftEye` | `M20.5,11 C20.5,12.7 17.5,12.7 17.5,11 C17.5,9.3 20.5,9.3 20.5,11 Z` | lens/oval ≈3×1.7 centred (19,11) |
| `rightEye` | `M30.5,11 C30.5,12.7 27.5,12.7 27.5,11 C27.5,9.3 30.5,9.3 30.5,11 Z` | centred (29,11) |
| `nose` | `M25.2,13 C25.2,14.3 22.9,14.3 22.9,13 S25.2,11.7 25.2,13 Z` | oval ≈2.3×1.3 centred (24.05,13) |
| `mouth` | **stroke**, `strokeWidth=1.2`, `strokeLineCap=round`, two subpaths:<br>`M29,14.3 C28.6,15.1 27.7,15.7 26.7,15.7 C25.3,15.7 24,14.4 24,13`<br>`M24,13 C24,14.5 22.8,15.7 21.3,15.7 C20.3,15.7 19.4,15.2 19,14.3` | the classic "ω" cat mouth |
| `tail` | **stroke**, `strokeWidth=5`, `strokeLineCap=round`:<br>`M35,35.5 H40.9 C43,35.5 44.7,33.8 44.7,31.7 V25.5` | rises from the body's right, curls up |
| `tailCap` | `M42.2,25.5 C42.2,24.1 43.3,23 44.7,23 S47.2,24.1 47.2,25.5 H42.2 Z` | half-disc r=2.5 on the tail tip |
| `tailShadow` | `M40,38 L40,33 L39,33 L39,38 Z` | 1×5 rect |
| `foot1..4` | circles **r=2.5** at `(11.5,43)`, `(18.5,43)`, `(29.5,43)`, `(36.5,43)` | `M cx,43 m-2.5,0 a2.5,2.5 0 1,1 5,0 a2.5,2.5 0 1,1 -5,0` |
| `leg1..4` | rects **5 wide × 6 tall**, y 37→43, x = `9`, `16`, `27`, `34` | |
| `leg2Shadow` | rect x 16→21, y 37→40 (5×3) | top half of leg2 |
| `body` | `M9,20 h30 v18 h-30 z` → rect x 9→39, y 20→38 | |
| `belly` | `M20.5,25 C16.9,25 14,27.9 14,31.5 V38 H27 V31.5 C27,27.9 24.1,25 20.5,25 Z` | rounded-top rect x 14→27, y 25→38. **Note: centred on x = 20.5, not 24** — asymmetric, but that is literally what this repo ships (and what its own `CatParts.kt` reproduces). Mirror as-is or re-centre to 24 if you prefer symmetry. |
| `bowtie` | `M29,16.8 L19,21.8 L19,16.8 L29,21.8 Z` | a bow-tie "Z" wedge under the chin |
| `back` *(unused)* | `M37.1,22 C36,22 35.2,22.8 35.2,23.9 V29.5 C35.2,30.6 36,31.4 37.1,31.4 H39 V29.5 V23.9 V22 H37.1 Z` | |

Overall silhouette: 48×48 with the cat occupying roughly x 9→47, y 1→45.5.

### Cat colour model (`Cat.java` constructor)

`chooseP(rng, table)` walks a `[weight, colour, weight, colour, …]` int array: `pct = rng.nextInt(1000)`, subtract weights at even indices until negative, return the following odd-index colour; if the weights are exhausted it returns the **last** entry. Consequences of the exact tables:

**`P_BODY_COLORS`** (weights sum to 959, so the tail case yields the "random" branch — net probabilities over 1000):

| Prob | Colour | Comment in source |
|---|---|---|
| 18.0 % | `#212121` | black |
| 18.0 % | `#FFFFFF` | white |
| 14.0 % | `#616161` | gray |
| 14.0 % | `#795548` | brown |
| 10.0 % | `#90A4AE` | steel |
| 10.0 % | `#FFF9C4` | buff |
| 10.0 % | `#FF8F00` | orange |
| 0.5 % | `#29B6F6` | blue..? |
| 0.5 % | `#FFCDD2` | pink!? |
| 0.5 % | `#CE93D8` | purple?!?!? |
| 0.4 % | `#43A047` | yeah, why not green |
| **4.1 %** | `0` → random | `Color.HSVToColor({rand()*360, frandrange(0.5,1), frandrange(0.5,1)})` |

**`P_COLLAR_COLORS`**: 25 % `#FFFFFF`, 25 % `#000000`, 25 % `#F44336`, 5 % `#1976D2`, 5 % `#FDD835`, 5 % `#FB8C00`, 5 % `#F48FB1`, 5 % `#4CAF50`.
**`P_BELLY_COLORS`** (used for `belly`, `back`, `faceSpot`): 75 % `0` (transparent), 25 % `#FFFFFF`.
**`P_DARK_SPOT_COLORS`** (used for `cap` when the body is light): 70 % transparent, 25 % `#212121`, 5 % `#6D4C41`.
**`P_LIGHT_SPOT_COLORS`** (used for `cap` when the body is dark): 70 % transparent, 30 % `#FFFFFF`.

Fixed tints:
- body/head/legs/feet/tail/ears/tailCap ← `bodyColor`
- `leg2Shadow`, `tailShadow` ← `#000000` @ alpha `0x20` (12.5 %)
- if `isDark(bodyColor)` (i.e. `r+g+b < 0x80`): `leftEye`, `rightEye`, `mouth`, `nose` ← `#FFFFFF`
- `leftEarInside`/`rightEarInside` ← `#EF9A9A` if body is dark, else `#D50000` @ alpha `0x20`
- if `!isDark(faceColor)`: `mouth`, `nose` ← `#000000` (**quirk**: `faceColor == 0` is transparent → `isDark(0) == true` → mouth/nose are *not* forced black)
- `tailCap` ← `#FFFFFF` with p = 0.333, else `bodyColor`
- `bowtie` ← `collarColor` with p = 0.1, else tint `0` (invisible)

**Foot patterns** (`mFootType`), evaluated as a nested if-chain of `nextFloat()`:
| p | `mFootType` | white feet |
|---|---|---|
| 0.25 | 4 | foot1, foot2, foot3, foot4 |
| 0.75×0.25 = 0.1875 | 2 | foot1, foot3 |
| 0.5625×0.25 = 0.140625 | 3 | foot2, foot4 |
| 0.421875×0.10 = 0.0421875 | 1 | one of foot1..4 chosen uniformly |
| ≈0.3797 | 0 | none |

**Exact RNG draw order** (needed to make seed → art reproducible):
1. `nextInt(1000)` body table → *(if 0)* `nextFloat` hue, `nextFloat` sat, `nextFloat` val
2. `nextInt(1000)` belly
3. `nextInt(1000)` back (unused but still consumed!)
4. `nextInt(1000)` faceSpot
5. `nextFloat` (all-4 feet) → else `nextFloat` (pair 1&3) → else `nextFloat` (pair 2&4) → else `nextFloat` (single) → `nextInt(4)`
6. `nextFloat` (tailCap white)
7. `nextInt(1000)` cap
8. `nextInt(1000)` collar
9. `nextFloat` (bowtie)

RNG is `java.util.Random` seeded with the cat's `long seed` (`new Random(); setSeed(seed)`). **To make seeds portable you must reimplement `java.util.Random` exactly**: `seed = (s ^ 0x5DEECE66D) & ((1<<48)-1)`; `next(bits)`: `seed = (seed*0x5DEECE66D + 0xB) & ((1<<48)-1)`, return `seed >>> (48-bits)` (use BigInt in JS); `nextFloat() = next(24) / (1<<24)`; `nextInt(bound)`: if bound is a power of two → `(bound * next(31)) >> 31`, else rejection loop `bits=next(31); val=bits%bound; while (bits-val+(bound-1) < 0) repeat`.

Seed generation: `CatRandom.nextSeed() = abs(Random(UUID.randomUUID().mostSignificantBits).nextLong())` — i.e. a uniformly random non-negative 64-bit long. In TS: `Math.floor(Math.random() * 2**53)` stored as a decimal string is fine (only exactness *from* the seed matters).

Default name: `context.getString(R.string.n_default_cat_name, String.valueOf(mSeed % 1000))` → **`"Cat #%s"`**, e.g. `Cat #417`.

### Cat icon/badge rendering (`Cat.createIcon`)
- Background: filled circle `r = w/2` at `(w/2, w/2)` in the body colour with HSV value shifted: `V' = V > 0.5 ? V − 0.25 : V + 0.25` (S and H unchanged), alpha forced 255.
- Cat: drawn into the inset square `[m, m, w−m, h−m]` where `m = w/10` (10 % margin each side).
- Sizes used: grid thumbnail `n_neko_display_size` = **64dp**; rename-dialog icon `android.R.dimen.app_icon_size` (48dp); notification large icon `2 × notification_large_icon_width/height`; share/export bitmap **600 × 600 px** (`EXPORT_BITMAP_SIZE`).

## 1.5 Collection UI — `NekoLand`

- `Activity`, `Theme.Material.NoActionBar`, layout `n_neko_activity.xml` = a `FrameLayout` containing one `RecyclerView` (`@+id/holder`, `match_parent × wrap_content`, `layout_gravity="center_horizontal"`).
- Action bar logo = a freshly generated random `Cat` drawable (`actionBar.setLogo(Cat.create(this))`, `setDisplayUseLogoEnabled(false)`, `setDisplayShowHomeEnabled(true)`).
- `GridLayoutManager(this, 3)` → **3 columns**.
- Cats are sorted **ascending by body-colour hue** (`Color.colorToHSV` → compare `hsv[0]`).
- Item layout `n_cat_view.xml`: vertical `LinearLayout`, `minHeight = listPreferredItemHeightSmall`, padding start/end = `listPreferredItemPadding*`, top/bottom `8dp`, `selectableItemBackgroundBorderless`, `gravity=center_horizontal`, `clipToPadding=false`. Inside: a `FrameLayout` **96dp** wide holding
  - `ImageView @+id/icon`, `wrap_content`, `padding=10dp`, `layout_gravity=center`, `scaleType=fitCenter` (fed a 64dp `Icon`)
  - `LinearLayout @+id/contextGroup`, `match_parent × wrap_content`, `layout_gravity=bottom`, initially `invisible`, containing
    - `ImageView @+id/shareText` 40×40dp, padding 8dp, `src=n_ic_share`, `background=#40000000`
    - `Space` weight 1
    - `ImageView @+id/closeButton` 40×40dp, padding 4dp, `src=n_ic_close`, `background=#40000000`
  - then `TextView @+id/title`, `wrap_content`, `textAppearanceListItem`, `gravity=center` → the cat's name.
- Context group animation: show → `alpha 0→1` over **333 ms**, auto-hide scheduled at **+5000 ms**; hide → `alpha →0` over **250 ms** then `INVISIBLE`.
- Tap on an item → `showNameDialog(cat)`: `AlertDialog` themed `Theme_Material_Light_Dialog_NoActionBar`, title `" "` (a single space), icon = `cat.createIcon(app_icon_size)`, view = `n_edit_text.xml` (a `FrameLayout` with 20dp start/end padding wrapping a single-line `EditText @android:id/edit`), positive button `android.R.string.ok` → `cat.setName(text.trim())` + `prefs.addCat(cat)` (addCat doubles as rename).
- Long-press an item → reveal the context group.
- Delete button → `AlertDialog` titled `getString(R.string.n_confirm_delete, name)` = **`"Forget %s?"`**, negative `cancel`, positive `ok` → `prefs.removeCat(cat)`.
- Share button → `cat.createBitmap(600, 600)` → `ShareCatUtils.shareCat(...)`.
- `DEBUG = false`, `DEBUG_NOTIFICATIONS = false`, `CAT_GEN = false` (when true it shows 50 random cats and tapping adds them).
- Implements `PrefState.PrefsListener`; any pref change re-runs `updateCats()`.

`NekoLockedActivity`: transparent activity with `FLAG_SHOW_WHEN_LOCKED | FLAG_DISMISS_KEYGUARD | FLAG_KEEP_SCREEN_ON | FLAG_TURN_SCREEN_ON` that just shows a `NekoDialog` and finishes on dismiss.

## 1.6 Persistence

**Two stores.**

1. App-wide `SharedPreferences` (via `com.dede.basic.SpUtils`, a single `pref` file):
   - `"n_egg_mode"` : **Long**, epoch millis of first unlock, written once (only when currently `0`).

2. Neko store `PrefState`, file name **`"N_mPrefs"`**, mode `0` (`MODE_PRIVATE`):
   - `"food"` : **Int**, 0–4 (0 = empty dish). Default `0`.
   - `"cat:<seed>"` : **String** — the cat's display name. `<seed>` is the decimal `long` seed. Key prefix constant `CAT_KEY_PREFIX = "cat:"`.
   - `getCats()` enumerates all keys starting with `cat:`, `Long.parseLong` the suffix, rebuilds `new Cat(context, seed)` and applies the stored name. **Only the seed and the name are stored — all art is regenerated deterministically from the seed.**
   - `addCat()` is also used for rename; `removeCat()` removes the key.
   - `registerOnSharedPreferenceChangeListener` drives the live UI/tile refresh.

### localStorage mirror
```
n_egg_mode      -> "neko.eggMode"   : number (Date.now())
N_mPrefs/food   -> "neko.food"      : 0..4
N_mPrefs/cat:*  -> "neko.cats"      : { [seedString]: nameString }
```
Plus (not persisted upstream, but you will want it) `"neko.pendingJob"`: `{ food, scheduledAt, intervalMs }` so a visit can be resolved on next load — upstream relies on `JobScheduler` and simply re-registers from the tile whenever `food != 0`.

## 1.7 Canvas implementation suggestion

- **PlatLogo**: one `<canvas>`, `ctx.setTransform(s,0,0,s,ox,oy)` with `s = (size − 80dp)/48`. Draw paths A–E above as `Path2D` objects built once from the absolute coordinate lists. Ripple = an expanding white circle clipped to the rounded square with `globalAlpha` decaying over ~300 ms. Entry: `t` from 0→1 over 500 ms after an 800 ms delay, `scale = 0.5 + 0.5*ease(t)`, `alpha = ease(t)`, where `ease` is the cubic Bézier `(0,0)-(0.5,1)` (i.e. `PathInterpolator(0,0,0.5,1)`); solve with Newton/bisection on x.
- **Cat**: build 27 `Path2D`s in the 48-unit space once (module-level constants), then `drawCat(ctx, seed, px)` = `save(); scale(px/48); for each part in drawingOrder: ctx.fillStyle/strokeStyle = tint[i]; ctx.fill(path)`. Cache the per-seed colour array (27 entries) — it's pure function of the seed. Render the badge by first filling a circle of radius `px/2` with the V-shifted body colour, then drawing the cat inset by `px/10`.
- **Mouth & tail** are the only stroked parts: `lineWidth = 1.2` and `5` in viewport units, `lineCap = 'round'`.
- **Gallery**: CSS grid, 3 columns; each cell = badge canvas (64dp) + name; long-press/`contextmenu` reveals the share/delete overlay with the same 333 ms / 5000 ms / 250 ms timings.
- **Visit loop**: replace `JobScheduler` with `setTimeout(interval ± 25 %)` while `food != 0`; on fire, apply the probability table, `setFood(0)`, and show a toast/notification-styled card with the PURR pattern via `navigator.vibrate([0,40,20,40,20,40,20,40,20,40,20,40])`.
- Keep a `javaRandom` helper (BigInt-based 48-bit LCG) so seeds reproduce identical cats across reloads.

## 1.8 Upstream files (Nougat)

```
eggs/Nougat/src/main/AndroidManifest.xml
eggs/Nougat/src/main/java/com/android_n/egg/PlatLogoActivity.java
eggs/Nougat/src/main/java/com/android_n/egg/AndroidNougatEasterEgg.java
eggs/Nougat/src/main/java/com/android_n/egg/preview/PlatLogoActivity.java
eggs/Nougat/src/main/java/com/android_n/egg/neko/Cat.java
eggs/Nougat/src/main/java/com/android_n/egg/neko/Food.java
eggs/Nougat/src/main/java/com/android_n/egg/neko/PrefState.java
eggs/Nougat/src/main/java/com/android_n/egg/neko/NekoService.java
eggs/Nougat/src/main/java/com/android_n/egg/neko/NekoLand.java
eggs/Nougat/src/main/java/com/android_n/egg/neko/NekoDialog.java
eggs/Nougat/src/main/java/com/android_n/egg/neko/NekoTile.java
eggs/Nougat/src/main/java/com/android_n/egg/neko/NekoActivationActivity.java
eggs/Nougat/src/main/java/com/android_n/egg/neko/NekoLockedActivity.java
eggs/Nougat/src/main/res/values/strings.xml
eggs/Nougat/src/main/res/values/dimens.xml
eggs/Nougat/src/main/res/layout/{n_cat_view,n_edit_text,n_food_layout,n_neko_activity}.xml
eggs/Nougat/src/main/res/drawable/n_platlogo.xml
eggs/Nougat/src/main/res/drawable/n_platlogo_m.xml
eggs/Nougat/src/main/res/drawable/n_platlogo_preview.xml
eggs/Nougat/src/main/res/drawable/n_icon.xml
eggs/Nougat/src/main/res/drawable/n_android_logo{,_fg}.xml
eggs/Nougat/src/main/res/drawable/n_stat_icon.xml, n_stat_tint_icon.xml
eggs/Nougat/src/main/res/drawable/n_{body,head,belly,back,face_spot,cap,nose,mouth,left_eye,right_eye,left_ear,left_ear_inside,right_ear,right_ear_inside,collar,bowtie}.xml
eggs/Nougat/src/main/res/drawable/n_{leg1,leg2,leg3,leg4,leg2_shadow,foot1,foot2,foot3,foot4,tail,tail_cap,tail_shadow}.xml
eggs/Nougat/src/main/res/drawable/n_food_{dish,bits,sysuituna,chicken,donut}.xml
eggs/Nougat/src/main/res/drawable/n_ic_{share,close}.xml
core/basic/src/main/java/com/dede/basic/utils/CatRandom.kt
core/basic/src/main/java/com/dede/basic/SpEx.kt        (SpUtils)
feature/cat-editor/src/main/java/com/dede/android_eggs/cat_editor/CatParts.kt       (independent path re-encoding — useful cross-check)
feature/cat-editor/src/main/java/com/dede/android_eggs/cat_editor/CatPartColors.kt  (independent colour-model re-encoding)
```

---

# 2. Oreo (Android 8.0/8.1, API 26–27) — "Octopus"

## 2.1 PlatLogo screen

Same skeleton as Nougat (`ImageView` in a `FrameLayout`, wallpaper theme) with these differences:

| Property | Value |
|---|---|
| Size / padding / z / entry animation | identical: `min(min(w,h),600dp) − 100dp`, `40dp` padding, `translationZ 20`, scale `0.5→1` + alpha `0→1`, delay **800 ms**, duration **500 ms**, `PathInterpolator(0,0,0.5,1)` |
| Ripple colour | **`0xFF776677`** (dusty purple-grey) |
| 8.0 background | `o_platlogo` |
| 8.1 background | `o_point_platlogo` + `ViewOutlineProvider.setOval(w*0.125, h*0.125, w*0.96, h*0.96)` + `elevation = 12dp` |
| Tap gate | `mTapCount >= 5` then long-press |
| On unlock | write `"o_egg_mode" = currentTimeMillis()` (once), `startActivity(Ocquarium)`, `FINISH = true` → `finish()` |
| Keyboard | identical 3-key rule |

There are two entry points: `PlatLogoActivity` (8.0) and the nested `PlatLogoActivity$Point1` (8.1) which just sets the intent extra `"isOreoPoint" = true` before delegating to `super.onAttachedToWindow()`. **No colour cycling** — the Oreo logo is static.

### `o_platlogo.xml` — Android 8.0 (viewport **48 × 48**, intrinsic 480dp)

Concentric "cookie" with a shaded lower-right half. Draw order:

1. Circle centre **(25, 25)**, r **20.5**, `#000000` @ `fillAlpha 0.066` (offset drop shadow).
2. Circle centre **(24, 24)**, r **20**, `#FFC107`.
3. Lower-right half of that circle, `#FE9F00`. Original path: `M44,24.201 L33.9005,14.1015 L14.1015,33.9005 L24.201,44 C29.2526,43.9498 34.2888,41.9975 38.1431,38.1431 C41.9975,34.2888 43.9498,29.2526 44,24.201 Z` — equivalently: `ctx.arc(24,24,20, −π/4, 3π/4)` + `closePath()`.
4. Circle r **14**, `#FED44F`.
5. Lower-right half of the r=14 circle, `#FFC107`. Original path: `M37.7829,26.4692 L29.6578,18.3441 L18.3441,29.6578 L26.4692,37.7829 C29.1912,37.2979 31.7972,36.0038 33.9005,33.9005 C36.0038,31.7972 37.2979,29.1912 37.7829,26.4692 Z` — equivalently `ctx.arc(24,24,14, −π/4, 3π/4)` + close. (The straight chord edges land at r=8/r=14 rather than the true diameter, but they're covered by step 6, so the sector form is pixel-identical.)
6. Circle r **8**, `#FFFFFF`.

Net look: a white cream centre (r 8), a two-tone yellow ring (r 8–14: `#FED44F` upper-left / `#FFC107` lower-right), a two-tone amber ring (r 14–20: `#FFC107` upper-left / `#FE9F00` lower-right), plus a faint 6.6 % black shadow offset (+1,+1).

`o_icon.xml` is the same geometry in indigo: shadow `#000000`@0.066, r20 `#283593`, half `#1A237E`, r14 `#5C6BC0`, half `#3F51B5`, r8 `#FFFFFF`. `o_android_logo_fg.xml` scales it 0.8 about (24,24) inside a 108 viewport; `o_android_logo.xml` layers it over `o_octo_bg` with `inset="-11dp"`.

### `o_point_platlogo.xml` — Android 8.1 (viewport **48 × 48**, intrinsic 480dp)

A 3D "stacked cookie" with an embossed Android robot and a dotted rim.

1. `#2C292A` circle: `M6,26 a20,20 0 0,1 40,0 a20,20 0 0,1 −40,0 z` → centre **(26,26)**, r **20** (bottom layer / shadow).
2. `#FAFAFA` circle centre **(24,24)**, r **20** (the cream).
3. `#2C292A` circle centre **(22,22)**, r **20** (the chocolate top, offset up-left by 2).
4. Android-robot outline, `fillColor="#00000000"`, `strokeColor="#453F41"`, `strokeWidth=1`: a body rounded-rect from (17,17.5) to (28.5,29.5) with two 2-unit legs at x 19.5–23.5 and 22.5–26.5 going to y 34.5, two side arms as rounded capsules centred x=13.5 and x=30.5 (y 17.5–28.5, r 2), and a dome head `A6.46,6.46` from (15.5,17) to (28.5,17) with two antennae (rounded 0.98-radius strokes) reaching to (16.6,11.2) and (27.2,11.2). All centred around (22,22).
5. Two eyes `#453F41`: circles r **0.65** at **(19.5, 14.5)** and **(24.5, 14.5)**.
6. `#453F41` **dotted rim**: ~44 tiny quadrilateral segments arranged around centre **(22,22)**, each spanning from radius ≈15.5 to ≈18.5, spaced ~5° apart (the path is a long list of `M…l…a…l…z` sub-paths starting at `M22 40.5`). Simplest canvas equivalent: 44 radial capsules, `for k in 0..43: θ = k*2π/44 + phase; line from (22+15.5cosθ, 22+15.5sinθ) to (22+18.5cosθ, 22+18.5sinθ)` with `lineWidth ≈ 1.0`, `lineCap = 'butt'`.

## 2.2 `Ocquarium` — the aquarium screen

`Activity`, `Theme.DeviceDefault.NoActionBar.Fullscreen`, `excludeFromRecents`, `launchMode=singleInstance`.

- Window background = `o_octo_bg`: linear gradient, `android:angle="-90"` (top → bottom), `startColor #FF205090` → `endColor #FF001040`.
- Content: a `FrameLayout bg` with `alpha = 0`, animated to `alpha = 1` with **startDelay 500 ms** and **duration 5000 ms** (a very slow 5-second fade-in of the whole scene).
- Inside: an `ImageView` `MATCH_PARENT × MATCH_PARENT` whose drawable is a single `OctopusDrawable`.
- Octopus size: `octo.setSizePx((int)(OctopusDrawable.randfrange(40f, 180f) * dp))` → **a uniformly random diameter between 40dp and 180dp**, chosen once per activity launch.
- `octo.startDrift()` immediately.
- Touch on the `ImageView` (always returns `true`):
  - `ACTION_DOWN`: `if (octo.hitTest(x,y)) { touching = true; octo.stopDrift(); }`
  - `ACTION_MOVE`: `if (touching) octo.moveTo(x, y)` — **direct, 1:1, no smoothing, no inertia on the head**; the tentacles lag via springs.
  - `ACTION_UP` / `ACTION_CANCEL`: `touching = false; octo.startDrift()`.
- No persistence at all in the aquarium. No score, no state.

## 2.3 `OctopusDrawable` — full mechanics

### Coordinate space
`BASE_SCALE = 100f`. All drawing happens in a **100-unit virtual space** transformed by `M = scale(sizePx/100)` (and `M_inv` for input mapping). So `1 unit = sizePx/100 px`.

### Colours (hardcoded)
```
BODY_COLOR      = 0xFF101010   // #101010
ARM_COLOR       = 0xFF101010   // #101010  (front arms)
ARM_COLOR_BACK  = 0xFF000000   // #000000  (back arms — darker, reads as "behind")
EYE_COLOR       = 0xFF808080   // #808080
PATH_DEBUG      = false
```
Arm z-order: `BACK_ARMS = {1, 3, 4, 6}` drawn **before** the body; `FRONT_ARMS = {0, 2, 5, 7}` drawn **after**.

### Head / body (all in base units, relative to `point = (px, py)`)
Draw order:
1. Back arms (`#000000`).
2. `EYE_COLOR` circle **r = 36** at `(px, py)` — a grey disc that ends up entirely hidden by the mantle except where the mouth slit reveals it.
3. `BODY_COLOR` **ellipse** `drawOval(px−40, py−60, px+40, py+40)` → width **80**, height **100**, centre `(px, py−10)`, drawn with `clipOutRect(px−61, py+8, px+61, py+12)` → a **4-unit-tall horizontal slit at y = py+8** is cut out of the mantle, exposing the grey disc behind it. That slit *is* the mouth.
4. Eyes, `EYE_COLOR`:
   - open: `drawCircle(px−16, py−12, 6)` and `drawCircle(px+16, py−12, 6)`.
   - blinking (`drawPupil(..., open=false)`): `drawRoundRect(x−6, y−0.6, x+6, y+0.6, 0.6, 0.6)` — a 12×1.2 capsule (with `size=6`: `r = size*0.1 = 0.6`).
   - Dead code (`if (false)`) would draw `#FF000000` pupils via `drawPupil(..., open=true)` → `roundRect(x−5, y−1.65, x+5, y+1.65, 1.65, 1.65)`.
5. Front arms (`#101010`).

Silhouette summary: a tall black mantle 80 × 100 whose centre sits 10 units above `point`, two grey r=6 eyes at (±16, −12), a grey mouth slit spanning x −35.1…+35.1 at y +8…+12, and eight tapered tentacles anchored along y = +26.

### Tentacles
8 arms, each a 3-link chain. Per-arm randomisation happens once in the constructor:

```java
final float bias = (float) i / 7 - 0.5f;      // i = 0..7
new Arm(0, 0,
    /*d1*/ 10f*bias + randfrange(0, 20f),  randfrange(20f, 50f),
    /*d2*/ 40f*bias + randfrange(-60f,60f), randfrange(30f, 80f),
    /*d3*/ randfrange(-40f, 40f),           randfrange(-80f, 40f),
    /*max*/ 14f, /*min*/ 2f);
```
`bias` per index: `−0.5, −0.357143, −0.214286, −0.071429, +0.071429, +0.214286, +0.357143, +0.5`.

Anchor (updated every frame in `repositionArms()`): `(point.x + bias*30, point.y + 26)` → x offsets `−15, −10.714, −6.429, −2.143, +2.143, +6.429, +10.714, +15`; y always `+26` (inside the mantle, so tentacles appear to emerge from under it).

Link structure:
- `link1` — **always locked** (rigid): `setAnchor` calls `setStart(x,y)`, which teleports it and immediately propagates.
- `link2`, `link3` — spring-animated (`androidx.dynamicanimation.SpringAnimation` on two `FloatValueHolder`s, one per axis).
- Each `Link` holds `coords` (its start point) and a fixed `dx, dy`; `end() = coords + d`, `mid() = coords + 0.5*d`.
- Chain propagation: `Link.onAnimationUpdate` → `next.animateTo(end())`. So link2 springs toward link1's end, link3 springs toward link2's end.
- Spring parameters (`SpringForce`):
  - `dampingRatio = DAMPING_RATIO_LOW_BOUNCY` = **0.3** for every link/axis (visible overshoot/wobble).
  - `stiffness` selected by the link's `index` argument: link1 → `STIFFNESS_LOW` = **50**, link2 → `STIFFNESS_VERY_LOW` = **10**, link3 → `STIFFNESS_VERY_LOW / 2` = **5**. (Same stiffness for both x and y of a given link.)
  - `finalPosition` is set per call via `animateToFinalPosition`.
- `setLocked(true)` (used by `lockArms` during `onBoundsChange`) makes link2/link3 teleport via `setStart` instead of springing.

Arm path (`Arm.getPath()`):
```
moveTo(link1.start())                 // = anchor
quadTo(link2.start(), link2.mid())    // ctrl = link2.start, end = link2.mid
quadTo(link2.end(),   link3.end())    // ctrl = link2.end,   end = link3.end
```
i.e. a smooth 2-segment quadratic whip from the anchor through the middle of link2 to the tip of link3. Note `link1`'s own delta is only used for propagation, not for the path — the path goes anchor → link2 curve.

### Tapered stroke (`TaperedPathStroke`)
"the variable-width brush algorithm from the Markers app":
```java
pm.setPath(p, false);  len = pm.getLength();
t = 0;
loop {
  if (t >= len) { t = len; last = true; }
  pm.getPosTan(t, pos, tan);
  r = len > 0 ? lerp(t/len, r1, r2) : r1;      // r1 = 14 (base), r2 = 2 (tip)
  c.drawCircle(pos.x, pos.y, r, pt);            // FILLED circle stamp
  t += Math.max(r * 0.25f, sMinStepPx);         // advance 1/4 radius, floored
  if (last) break;
}
```
`sMinStepPx` is set in `setSizePx`: `TaperedPathStroke.setMinStep(8f * BASE_SCALE / mSizePx)` = `800 / sizePx` **base units**. (A commented-out alternative was `20f * BASE_SCALE / mSizePx` — "nice little floaty circles".) So a tentacle is a chain of overlapping filled discs, radius lerping **14 → 2** base units from base to tip, spaced `max(r/4, 800/sizePx)` units apart.

Canvas equivalent: sample the quadratic path with `Path2D`+`getPointAtLength` semantics (or evaluate the two quads analytically), stamp `ctx.arc(x,y,r)` fills, `r = 14 + (2−14)*t/len`, `t += max(r*0.25, 800/sizePx)`. Because the stamps overlap heavily this reads as a solid tapered tube.

### Hit testing
`hitTest(x, y)`: map to base space with `M_inv`, then `hypot(x − point.x, y − point.y) < BASE_SCALE/2` → **radius 50 base units = sizePx/2 px**, centred on `point` (not on the mantle centre, which is 10 units higher).

### Drift physics (`startDrift`, a `TimeAnimator`)
Constants captured in the listener closure:
```
MAX_VY = 35f;  JUMP_VY = -100f;  MAX_VX = 15f;
ax = 0f, ay = 30f;   vx = vy = 0;   nextjump = 0;   unblink = 0;
```
Per frame (`t`, `dt` in ms; `t_sec = t/1000`, `dt_sec = dt/1000`), **all velocities in base units/second**:
1. `if (t > nextjump) { vy = JUMP_VY; nextjump = t + randfrange(5000, 10000); }` — a "jet propulsion" impulse every **5–10 s** (uniform).
2. Blink: `if (unblink > 0 && t > unblink) { setBlinking(false); unblink = 0; } else if (Math.random() < 0.001f) { setBlinking(true); unblink = t + 200; }` — ~0.1 % chance per frame, eyes closed for **200 ms**.
3. `ax = MAX_VX * sin(t_sec * 0.25f)` — a very slow lateral sway (period ≈ 25 s in the sine argument `0.25 rad/s` → full cycle 2π/0.25 ≈ 25.1 s).
4. `vx = clamp(vx + dt_sec*ax, −15, 15)`; `vy = clamp(vy + dt_sec*ay, −3500, 35)` — gravity `ay = 30` pulls down, terminal fall speed 35, jump impulse −100.
5. Out-of-bounds: `if (point.y − 50 > scaledBounds[1]) vy = JUMP_VY;` (fell below the bottom → jump) `else if (point.y + 100 < 0) vy = MAX_VY;` (floated above the top → sink).
6. `point.x = clamp(point.x + dt_sec*vx, 0, scaledBounds[0])`; `point.y += dt_sec*vy`. **y is not clamped** — it can leave the screen and comes back via the OOB rules.
7. `repositionArms()`.

`scaledBounds` = the drawable bounds (w, h) mapped through `M_inv`, i.e. in base units.

Because `TimeAnimator.cancel()` + `start()` resets `totalTime` to 0, and `nextjump` persists as a closure field, releasing the octopus after a drag makes `t > nextjump` true on the first frame → **it always jets (vy = −100) the instant you let go.** Nice touch to reproduce.

`stopDrift()` = `mDriftAnimation.cancel()`. While dragging, no drift integration runs; only `moveTo()` + the springs animate the tentacles.

`onBoundsChange`: `lockArms(true); moveTo(w/2, h/2); lockArms(false);` then store `scaledBounds = M_inv.map(w, h)`. So the octopus starts dead-centre with its tentacles in their rigid rest pose.

### Rest pose geometry
With all links rigid, arm `i` runs: `anchor` → `anchor + d1` → `+ d2` → `+ d3`. `d1` is mostly straight down (dy 20–50) with a small rightward bias (dx 0–20 plus ±5); `d2` sweeps outward (dx = 40·bias ± 60, dy 30–80 down); `d3` is the curl (dx ±40, dy −80…+40 — often *upward*, giving the classic hooked tentacle tip).

## 2.4 Persistence

Only `"o_egg_mode"` (Long, epoch millis, written once) in the shared app prefs. **The octopus itself is not persisted** — size and all tentacle randomness are re-rolled on every launch of `Ocquarium`.

localStorage mirror: `oreo.eggMode -> number`. Optionally persist `oreo.octopus = { sizeDp, armSeeds[] }` if you want a stable pet across reloads (an intentional deviation).

## 2.5 Canvas implementation suggestion

- One full-screen `<canvas>`, `requestAnimationFrame` loop with real `dt`.
- **Background**: a single `createLinearGradient(0,0,0,H)` from `#205090` to `#001040`, wrapped in a scene group whose `globalAlpha` ramps 0→1 over 5000 ms after a 500 ms delay.
- **Space**: keep everything in the 100-unit space. `const k = sizePx/100`; each frame `ctx.save(); ctx.scale(k,k); …draw…; ctx.restore()`. Map pointer input with `x/k`.
- **Springs**: replace `SpringAnimation` with a semi-implicit Euler per-axis spring: `a = −stiffness*(x − target) − damping*velocity`. AndroidX's `SpringForce` uses `dampingRatio` → `c = 2*dampingRatio*sqrt(stiffness*mass)` with `mass = 1`. So for stiffness 10 and ratio 0.3: `c = 2*0.3*sqrt(10) ≈ 1.897`. Substep at a fixed 1/60 s (or smaller) for stability; `stiffness = 5` with ratio 0.3 is very floppy and will overshoot a lot, which is the desired look.
- **Chain**: on each physics step, set link2's target to link1's end and link3's target to link2's end. When dragging, link1 teleports (`setStart`) — do not spring it.
- **Tentacle rendering**: build the two quads, compute total arc length by flattening to ~64 segments, then stamp filled discs with `r = lerp(t/len, 14, 2)` and `t += max(r*0.25, 800/sizePx)`. Use `ctx.beginPath(); ctx.arc(...); ctx.fill()` per stamp with the same colour — overlapping same-colour opaque fills are seam-free.
- **Mouth slit**: draw the grey r=36 disc, then the black mantle ellipse, but instead of `clipOutRect` simply draw a `#808080` rounded rect `(px−35.1 … px+35.1, py+8 … py+12)` on top — visually identical and cheaper. (Or use `ctx.save(); ctx.beginPath(); ctx.rect(...); ctx.clip()` with an even-odd path for exactness.)
- **Blink**: interpolate the eye shape — `r` from 6 (open circle) to the 12×1.2 capsule. A quick 60 ms close/open ramp looks better than the hard 200 ms toggle, but upstream is a hard toggle.
- **Pointer**: `pointerdown` → hit test radius `sizePx/2`; on hit set `dragging = true` and stop the drift integrator (but keep rendering); `pointermove` → set `point` directly; `pointerup` → resume drift with `vy = −100` immediately and `nextjump = now + rand(5000,10000)`.

## 2.6 Upstream files (Oreo)

```
eggs/Oreo/src/main/AndroidManifest.xml
eggs/Oreo/src/main/java/com/android_o/egg/PlatLogoActivity.java        (incl. nested Point1)
eggs/Oreo/src/main/java/com/android_o/egg/AndroidOreoEasterEgg.java
eggs/Oreo/src/main/java/com/android_o/egg/octo/Ocquarium.java
eggs/Oreo/src/main/java/com/android_o/egg/octo/OctopusDrawable.java
eggs/Oreo/src/main/java/com/android_o/egg/octo/TaperedPathStroke.java
eggs/Oreo/src/main/res/values/strings.xml
eggs/Oreo/src/main/res/drawable/o_platlogo.xml
eggs/Oreo/src/main/res/drawable/o_point_platlogo.xml
eggs/Oreo/src/main/res/drawable/o_icon.xml
eggs/Oreo/src/main/res/drawable/o_octo_bg.xml
eggs/Oreo/src/main/res/drawable/o_android_logo.xml, o_android_logo_fg.xml
eggs/Oreo/src/main/res/drawable-v26/o_android_logo.xml
core/basic/src/main/java/com/dede/basic/SpEx.kt   (SpUtils)
```

---

# 3. Pie (Android 9.0, API 28) — "PAINT.APK"

## 3.1 PlatLogo screen — the animated "P"

`PlatLogoActivity` sets a custom `Drawable` (`PBackground`) as the **background of the root `FrameLayout`** — it fills the whole window, no `ImageView`. A `TimeAnimator` runs in `onStart()`/`onStop()` and calls `bg.setOffset(totalTime / 60000f)` + `bg.invalidateSelf()` every frame.

### Palette generation (`randomizePalette`)
```java
slots   = 2 + (int)(Math.random() * 2);      // 2 or 3, 50/50
color   = { Math.random()*360, 1f, 1f };     // random hue, S=1, V=1
for i in 0..slots-1:
    palette[i] = Color.HSVToColor(color);
    color[0]   = (color[0] + 360f/slots) % 360f;
    if (lum(palette[i]) < lum(palette[darkest])) darkest = i;
```
`lum(rgb) = (299*R + 587*G + 114*B) / 1000` (W3C AERT). So: **2 or 3 fully saturated, fully bright colours evenly spaced around the hue wheel**, plus the index of the darkest. Called once in the constructor, again in `onStart()`, and again on every qualifying tap. The generated palette is logged as `"color palette: #aarrggbb #aarrggbb "`.

### Geometry
State: `maxRadius` (unused), `radius`, `x`, `y`, `dp`, `palette[]`, `darkest`, `offset`.

- `setRadius(r)` → `radius = max(48dp, r)`.
- First `draw()` with `radius == 0`: `setPosition(width/2, height/2)` and `setRadius(width/6)`. So the default logo radius is **one sixth of the window width**, floored at 48dp.
- `inner_w = radius * 0.667`.

`draw(canvas)` (after `canvas.translate(x, y)`; `paint.strokeCap = BUTT`):

**Ring stack** — `w = max(canvas.getWidth(), canvas.getHeight()) * 1.414` (the diagonal, so the outermost circle always covers the corners):
```java
int i = 0;
while (w > radius*2 + inner_w*2) {
    paint.setStyle(FILL);
    paint.setColor(0xFF000000 | palette[i % palette.length]);
    canvas.drawOval(-w/2, -w/2, w/2, w/2, paint);           // filled circle, diameter w
    w -= inner_w * (1.1f + Math.sin((i/20f + offset) * PI)); // shrink
    i++;
}
```
Ring thickness therefore oscillates between `0.1*inner_w` and `2.1*inner_w` with a period of **40 rings** in `i` (`sin` advances `π` per 20 rings). `offset` advances `1.0` per **60 seconds**, so the band pattern drifts by 20 rings per minute — a slow hypnotic moiré pulse. There is no discrete "colour cycling" event; colours change only when the palette is re-rolled.

**Centre disc** — `paint.setColor(0xFF000000 | palette[(darkest+1) % palette.length]); drawOval(-radius, -radius, radius, radius)`. Comment: *"the innermost circle needs to be a constant color to avoid rapid flashing"*.

**The "P" glyph** — a stroked path, built twice (the first build is used only for the fill pass, which is skipped):
```
p.moveTo(-radius, height);                                  // height = canvas.getHeight(), i.e. off the bottom
p.lineTo(-radius, 0);
p.arcTo(-radius, -radius, radius, radius, -180, 270, false); // 3/4 arc, 9 o'clock -> 12 -> 3 -> 6 o'clock
p.lineTo(-radius + inner_w, radius);                         // bottom foot, going left
```
Then:
```java
paint.setStyle(STROKE);
paint.setStrokeWidth(inner_w * 2);  paint.setColor(palette[darkest]);  canvas.drawPath(p, paint);
paint.setStrokeWidth(inner_w);      paint.setColor(0xFFFFFFFF);        canvas.drawPath(p, paint);
```
So the "P" is a **dark outline of width `1.334*radius`** with a **white core of width `0.667*radius`**, butt caps. In canvas terms: `ctx.arc(0, 0, radius, Math.PI, Math.PI*2.5)` (i.e. start 180°, sweep 270° clockwise, ending at 90° = `(0, radius)`), preceded by a `moveTo(-radius, canvasH)` / `lineTo(-radius, 0)`, then `lineTo(-radius + inner_w, radius)`. Stroke it twice: dark then white.

Note the stem runs from `y = canvasHeight` (below the viewport after the translate) up to `y = 0`, so it visually exits the bottom of the screen.

### Interaction (`layout.setOnTouchListener`)
Tracks `maxPointers` and `tapCount` per gesture.
- `ACTION_DOWN` / `ACTION_MOVE`: record the max pointer count seen; if `pointerCount > 1`, read `PointerCoords` 0 and 1 and `bg.setRadius(hypot(dx, dy) / 2f)` — **two-finger pinch resizes the P** (clamped to ≥ 48dp). The logo centre does *not* follow the fingers.
- `ACTION_UP` / `ACTION_CANCEL`:
  - if `maxPointers == 1`: `tapCount++`; **if `tapCount < 7` → `bg.randomizePalette()`** (a fresh 2–3 colour scheme per tap); **else → `launchNextStage()`**.
  - else (`maxPointers > 1`): `tapCount = 0` — any pinch resets the tap counter.
  - `maxPointers = 0`.
- `launchNextStage()`: write `"p_egg_mode" = currentTimeMillis()` if currently 0; `startActivity(PaintActivity)`; `finish()`.
- Commented-out code would have persisted `touch.stats` (`{"min":…,"max":…}` pressure extremes) to prefs; `Painting` still *reads* that key from `Settings.System`.

So: **7 single-finger taps** to unlock. Taps 1–6 each recolour the rings.

### Launcher art
- `p_icon_bg.xml` = solid `#C5E1A5` (light green).
- `p.xml` (viewport **108 × 108**, 108dp): the same P glyph as two strokes —
  - `strokeWidth=16`, `strokeColor=#7CB342`: `M49,65 L54,65 C60.075,65 65,60.075 65,54 C65,47.925 60.075,43 54,43 C47.925,43 43,47.925 43,54 L43,108`
  - `strokeWidth=8`, `strokeColor=#FFFFFF`: `M51,65 L54,65 C60.075,65 65,60.075 65,54 C65,47.925 60.075,43 54,43 C47.925,43 43,47.925 43,54 L43,108` (note the stem starts at x=51 instead of 49, so the white core is offset 2 units right on the horizontal foot)
  - both `fillType=evenOdd`, `fillColor=#00000000`.
- `p_icon.xml` = layer-list: `p_icon_bg` then `p` with `inset="-18dp"` (bleeds the glyph past the icon bounds).

## 3.2 `PaintActivity` — the paint app

`Activity`, theme `PAppTheme` (`Theme.DeviceDefault.Light.NoActionBar.Fullscreen`, `windowLayoutInDisplayCutoutMode=shortEdges`, `windowLightNavigationBar=true`); the activity also sets `layoutInDisplayCutoutMode = NEVER` on API 28+. `excludeFromRecents`, `launchMode=singleInstance`, label `"PAINT.APK"` (`p_app_name`).

Constants:
```
MAX_BRUSH_WIDTH_DP = 100f;  MIN_BRUSH_WIDTH_DP = 1f;
NUM_BRUSHES = 6;            NUM_COLORS = 6;
```

### Layout (`p_activity_paint.xml`)
Root `FrameLayout @+id/contentView`, background **`#666`**. The `Painting` view is added programmatically `MATCH_PARENT × MATCH_PARENT`. Three stacked bars, all `layout_gravity="top"`:
- `p_toolbar` (`CutoutAvoidingToolbar`, a `LinearLayout`), `match_parent × 50dp`, background `p_toolbar_bg` (solid `p_toolbar_bg_color`), `elevation = 20dp`, `orientation=horizontal`, `gravity=left`.
- `p_colors` (`LinearLayout`), `match_parent × 48dp`, same bg, `elevation = 10dp`, initially `visibility="gone"`.
- `p_brushes` (`LinearLayout`), `match_parent × 48dp`, same bg, `elevation = 10dp`, initially `gone`.

Toolbar children, in order, with `Space` tags `cutoutLeft` / `cutoutCenter` / `cutoutRight` (widths set from `WindowInsets.displayCutout.boundingRects` by `CutoutAvoidingToolbar.adjustLayout()`, only for rects with `top == 0`):
- left group (`layout_weight=1`, horizontal): `btnBrush` (48dp wide, weight 1, `tint=p_toolbar_icon_color`, bg `p_toolbar_button_bg`), `btnColor` (same), `btnSample` (same, `src=p_ic_dropper`).
- right group (`layout_weight=1`): `btnZen` (`src=p_ic_hourglass`), `btnClear` (`src=p_ic_clear`).
- All buttons are `48dp × match_parent`, `layout_weight=1`, so they stretch to fill; background is a ripple with a `4dp`-corner-radius black mask and `?android:attr/colorControlHighlight`.

`btnBrush` and `btnColor` have no `src` — they get a `BrushPropertyDrawable` at runtime.

### `BrushPropertyDrawable` (the round brush/colour swatch icon)
Intrinsic size `24dp × 24dp`. `draw()`:
```
inset = _size / 12                  // 2dp in a 24dp icon
r     = min(w, h) / 2
drawCircle(w/2, h/2, (r - inset) * _scale + 1, wellPaint)      // filled "well"
path = circle(r) CCW + circle(r - inset) CW                     // even-odd ring
drawPath(path, framePaint)                                     // 2dp ring
```
`framePaint` colour = `p_toolbar_icon_color`; `wellPaint` = the current paint colour (or, for brush buttons, the icon colour). `_scale = brushWidth / maxBrushWidth`.

### Colour model
| | Day | Night (`values-night`, `color-night`) |
|---|---|---|
| `p_toolbar_bg_color` | `#FFDDDDDD` | `#FF333333` |
| `p_paper_color` | `#FFFFFFFF` | `#FF000000` |
| `p_paint_color` | `#FF000000` | `#FFFFFFFF` |
| `p_toolbar_icon_color` (selector) | selected `#FFCC0000`, default `#FF000000` | selected `#FFFF3333`, default `#FFFFFFFF` |

Switching night mode (`onConfigurationChanged` → `refreshNightMode`) calls `painting.invertContents()`, tears the `Painting` view out and re-adds it with the new paper/paint colours, and flips `SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR`.

### Brush size ramp
Six buttons, `width = lerp(pow(i/6, 2), minBrushWidth, maxBrushWidth)` with min = 1dp, max = 100dp:

| i | `(i/6)²` | width (dp) | wellScale |
|---|---|---|---|
| 0 | 0.000000 | 1.000 | 0.010 |
| 1 | 0.027778 | 3.750 | 0.0375 |
| 2 | 0.111111 | 12.000 | 0.120 |
| 3 | 0.250000 | 25.750 | 0.2575 |
| 4 | 0.444444 | 45.000 | 0.450 |
| 5 | 0.694444 | 69.750 | 0.6975 |

Note `_brushWidth` starts at **`100f` px** in `Painting` (not dp) until a button is pressed.

### Colour palette row
`Palette(NUM_COLORS = 6)` → 6 random evenly-spaced HSV colours (`S = 1`, `V = 1`, `hue0 = random*360`, step `360/6 = 60°`), then **prepended with `Color.BLACK` and `Color.WHITE`** → 8 swatches total. `Palette` also tracks `lightest`/`darkest` by the same AERT luminance formula (unused by the activity).

Long-press `btnColor` → rebuild the colour row from scratch (`colors.removeAllViews()` + `refreshBrushAndColor()`), i.e. **re-roll the 6 random swatches**.

### Toolbar show/hide animations
- `showToolbar(bar)`: `visibility = VISIBLE`, `translationY = toolbar.height/2`, then animate `translationY → toolbar.height` and `alpha → 1` over **220 ms**.
- `hideToolbar(bar)`: animate `translationY → toolbar.height/2`, `alpha → 0` over **150 ms**, then `GONE`.
- `btnBrush` / `btnColor` set `view.setSelected(true)` (→ the red `#CC0000`/`#FF3333` icon tint), hide the other row, and toggle their own.

### Button behaviours
- `btnBrush` → toggle the brush-size row.
- `btnColor` → toggle the colour row. Long-press → re-roll the palette.
- `btnSample` (dropper) → `sampling = true`, `setSelected(true)`. While sampling, `ACTION_DOWN`/`ACTION_MOVE` on the painting show an Android `Magnifier` at the touch point and live-update `colorButtonDrawable.setWellColor(painting.sampleAt(x,y))`. On `ACTION_UP` the sampled colour becomes the paint colour; on `ACTION_CANCEL` it is discarded. Either way `sampling = false`, `btnSample.setSelected(false)`, `magnifier.dismiss()`, and the event is consumed (no stroke is drawn).
- `btnZen` (hourglass) → `painting.setZenMode(!getZenMode())`, then animate the button's `rotation` to `0f` (zen on) or `90f` (zen off) with an `OvershootInterpolator` and `startDelay = 200 ms`.
- `btnClear` → `painting.clear()`. **Long-press `btnClear` → `painting.invertContents()`.**

### Toolbar vector icons (all 24 × 24 viewport, `#000000`, tinted at runtime)
- `p_ic_clear`: an X — `M19,6.41 l−1.41,−1.41 l−5.59,5.59 l−5.59,−5.59 l−1.41,1.41 l5.59,5.59 l−5.59,5.59 l1.41,1.41 l5.59,−5.59 l5.59,5.59 l1.41,−1.41 l−5.59,−5.59 z` (`fillType=nonZero`).
- `p_ic_dropper`: three subpaths — the pen body `M13.6789,5.6997 L3,16.3784 L3,20 L4,21 L7.6216,21 L18.3004,10.3212 Z` with the inner cut `M7,19 L5,19 L5,17 L13.788,8.344 L15.6561,10.212 Z` (`nonZero`); the rounded bulb `M20.9983,2.4982 …` (`evenOdd`); the ferrule quad `M13.8284,3 l7.0711,7.0711 l−2.8284,2.8284 l−7.0711,−7.0711 z` (`evenOdd`).
- `p_ic_hourglass`: `M12.5,11 L16,7.5 L16,4 L8,4 L8,7.5 L11.5,11 L11.5,13 L8,16.5 L8,20 L16,20 L16,16.5 L12.5,13 Z` (the sand) plus the glass outline `M6,2 L18,2 L18,8 … L6,2 Z` (`nonZero`).

## 3.3 `Painting` view — the drawing engine

A `View` implementing `SpotFilter.Plotter`. It owns an off-screen `Bitmap` sized `displayMetrics.widthPixels × heightPixels`, filled initially with `paperColor`, plus a `Canvas` over it (`_paintCanvas`). `onDraw` just blits the bitmap with `_drawPaint`.

Companion constants:
```kotlin
FADE_MINS = 3 minutes in ms  = 180000
ZEN_RATE  = 2 seconds in ms  = 2000
ZEN_FADE  = max(1f, ZEN_RATE / FADE_MINS * 255f) = 2.8333f
FADE_TO_WHITE_CF = ColorMatrix( identity RGB, translate +ZEN_FADE on R,G,B, alpha row [0,0,0,1,0] )
FADE_TO_BLACK_CF = same with −ZEN_FADE
INVERT_CF        = ColorMatrix( -1 on the RGB diagonal, +255 translate, alpha untouched )
TOUCH_STATS      = "touch.stats"      // Settings.System key
```
`zenMode` defaults to **`true`**. Every 2000 ms the fade runnable redraws the bitmap onto itself through `FADE_TO_WHITE_CF` (if `paperColor & 0xFF > 0x80`) or `FADE_TO_BLACK_CF` — i.e. **the artwork fades toward the paper colour and a drawing disappears in about 3 minutes**. Toggling zen off stops the runnable (`removeCallbacks`).

### Stroke plotting
`onTouchEvent`:
- `ACTION_DOWN` → `_lastR = -1f`, `_filter.add(event)`, `invalidate()`
- `ACTION_MOVE` → `_filter.add(event)`, `invalidate()`
- `ACTION_UP` / `ACTION_CANCEL` → `_filter.add(event)`, `_filter.finish()`, `invalidate()`

`plot(s: PointerCoords)` — the actual rasterisation, in bitmap pixels:
```kotlin
var x = _lastX; var y = _lastY; var r = _lastR
val newR = max(1f, pow(adjustPressure(s.pressure), 2f) * _brushWidth)
if (r >= 0) {
    val d = hypot(s.x - x, s.y - y)
    if (d > 1f && (r + newR) > 1f) {
        val N = (2 * d / min(4f, r + newR)).toInt()
        val stepX = (s.x - x)/N; val stepY = (s.y - y)/N; val stepR = (newR - r)/N
        for (i in 0 until N-1) { x += stepX; y += stepY; r += stepR; c.drawCircle(x, y, r, _drawPaint) }
    }
}
c.drawCircle(s.x, s.y, newR, _drawPaint)
_lastX = s.x; _lastY = s.y; _lastR = newR
```
So: **radius** (not diameter) = `pressure² × brushWidth`, floored at 1 px. Between samples the stroke is filled with `N−1` interpolated discs where `N = floor(2·distance / min(4, r+newR))` — i.e. discs spaced at most `min(4, r+newR)/2` px apart, guaranteeing a gapless tube, with the radius lerped across the gap.

`adjustPressure(p)`: dynamically widens `[devicePressureMin, devicePressureMax]` (seeded from `Settings.System "touch.stats"` JSON `{"min":…,"max":…}`, defaults `0f`/`1f`, clamped so `min >= 0` and `max >= min+1` if bogus), then returns `invlerp(p, min, max) = (p − min)/(max − min)` (or `1f` if `max <= min`). Because most touchscreens report a constant pressure of 1.0, real strokes are essentially **full-width constant-radius** unless a stylus is used.

### `SpotFilter` — input smoothing
Constructed as `SpotFilter(10, 0.5f, 0.9f, this)` → buffer size **10**, `posDecay = 0.5`, `pressureDecay = 0.9`, `PRECISE_STYLUS_INPUT = true`.
- `add(evt)` feeds **all** `historySize` batched historical coords first (`getHistoricalPointerCoords`), then the current one — so no coalesced samples are dropped.
- `addInternal` pushes the coord to the front of a `LinkedList` (evicting the oldest past 10), then `filterInto(tmpSpot, tool)` and `plot`.
- `filterInto` computes an exponentially weighted mean, **newest sample first**: position weights `1, 0.5, 0.25, 0.125, …`; pressure/size weights `1, 0.9, 0.81, …`; `out = Σ(v·w)/Σw`.
- If `PRECISE_STYLUS_INPUT && tool == TOOL_TYPE_STYLUS`, it `break`s after the newest sample — no smoothing for pens.
- `finish()` (on UP/CANCEL) drains the buffer: repeatedly re-filters, pops the **oldest** entry, and plots — so the stroke tail settles onto the true last point instead of stopping at the smoothed position.

### Other operations
- `clear()` → `bitmap = null; setupBitmaps(); invalidate()` (recreates and repaints with `paperColor`).
- `invertContents()` → redraws the bitmap onto itself through `INVERT_CF` (`c' = 255 − c`, alpha preserved).
- `sampleAt(x, y)` → `bitmap.getPixel(x − left, y − top)`, or `Color.BLACK` if out of bounds.
- `setupBitmaps()` on size change: if the aspect flipped (orientation change), the old artwork is **rotated ±90° and scaled to fit** the new bitmap (`postRotate(-90) + postTranslate(0, h)` when going landscape, `postRotate(90) + postTranslate(w, 0)` when going portrait, plus `postScale` if the dimensions aren't an exact swap); otherwise it is just blitted at the origin. A brand-new bitmap is filled with `paperColor`.
- `onTrimMemory()` is a no-op.
- `_insets` is captured in `onApplyWindowInsets` and used to trigger `setupBitmaps()`.

There is **no tile grid, no cell-based painting, and no persistent storage of the artwork** — the painting is a raster bitmap that lives only for the activity's lifetime and fades away in zen mode. (The "PaintTiles"-style grid interaction the brief anticipated belongs to `eggs/S` and `eggs/Tiramisu`'s `PaintChipsActivity`/`PaintChipsWidget`, not to Pie.)

## 3.4 Persistence

- `"p_egg_mode"` : Long, epoch millis, written once by `PlatLogoActivity.launchNextStage()` into the shared app prefs.
- `"touch.stats"` : a JSON string `{"min": <double>, "max": <double>}` read from **`Settings.System`** (not app prefs) by `Painting.loadDevicePressureData()`. The writer side is commented out in `PlatLogoActivity`, so upstream it is read-only in practice.
- **Nothing else.** Brush width, paint colour, zen mode and the artwork itself are all volatile.

localStorage mirror:
```
pie.eggMode      -> number (Date.now())
pie.touchStats   -> { min: number, max: number }   // optional; default {0,1}
// optional quality-of-life (deviation from upstream):
pie.brushWidth   -> number (px)
pie.paintColor   -> string (#rrggbb)
pie.zenMode      -> boolean (default true)
pie.artwork      -> canvas.toDataURL()             // upstream never saves this
```

## 3.5 Canvas implementation suggestion

**PlatLogo**
- Full-window `<canvas>`; keep `radius`, `x`, `y`, `palette[2|3]`, `darkest`, `offset` in a state object.
- `randomizePalette()`: `slots = 2 + Math.floor(Math.random()*2)`, `h0 = Math.random()*360`, `palette[i] = hsvToRgb((h0 + i*360/slots) % 360, 1, 1)`; compute `darkest` with `(299r + 587g + 114b)/1000`.
- Ring loop: `let w = Math.max(W,H) * 1.414; let i = 0; while (w > radius*2 + inner_w*2) { fill circle of diameter w; w -= inner_w * (1.1 + Math.sin((i/20 + offset) * Math.PI)); i++; }`. Then the centre disc, then the P strokes. `offset = elapsedMs / 60000`.
- P path: `ctx.translate(x,y)`; `moveTo(-radius, H)`; `lineTo(-radius, 0)`; `arc(0,0,radius, Math.PI, Math.PI*2.5, false)`; `lineTo(-radius + inner_w, radius)`. Stroke twice: `lineWidth = inner_w*2` in `palette[darkest]`, then `lineWidth = inner_w` in `#FFFFFF`. `lineCap = 'butt'`, `lineJoin = 'miter'`.
- Input: single tap = `pointerdown`→`pointerup` with no second pointer ever → `tapCount++`; `<7` → re-roll palette, `==7` → save `p_egg_mode` and switch screens. Two pointers → `radius = max(48*dpr, dist/2)` live, and reset `tapCount` on release.

**Paint**
- Two canvases: an off-screen `<canvas>` (the "bitmap", sized to the CSS pixel viewport × `devicePixelRatio`) and the visible one that just `drawImage`s it. Everything below happens on the off-screen context.
- Paper: `fillRect` with `#FFFFFF` (day) / `#000000` (night).
- Port `SpotFilter` verbatim (10-entry ring buffer, `posDecay 0.5`, `pressureDecay 0.9`, newest-first EWA mean, `finish()` drain on pointerup). Feed it every `pointermove` **and** the coalesced events from `event.getCoalescedEvents()` where available.
- Port `plot()` verbatim, including `newR = max(1, pressure² * brushWidth)` and `N = floor(2*d / min(4, r+newR))`. Web `PointerEvent.pressure` is `0.5` for mouse/untouched-pen and `0` for hover — normalise with `p === 0 ? 1 : p` if you want mouse strokes at full width, matching Android's constant-1.0 behaviour.
- Zen fade: every 2000 ms, `tmpCtx.putImageData` or `drawImage` the artwork through a `ctx.filter = 'brightness(...)'`-style pass — but for exactness use `getImageData` + a per-pixel `c += ZEN_FADE` (or `−=`) on RGB, alpha untouched. `ZEN_FADE = 2000/180000*255 ≈ 2.8333`. Cheaper alternative: `ctx.globalCompositeOperation='source-over'; fillStyle='rgba(255,255,255,0.0111)'` (2.8333/255) — visually equivalent for a white paper.
- Invert: `getImageData` → `c = 255 − c` on RGB, alpha preserved.
- Eyedropper: `ctx.getImageData(x, y, 1, 1).data` — same as `sampleAt`. For the magnifier, draw a small zoomed circle (e.g. `drawImage(artwork, x−20, y−20, 40, 40, …)` into a 96px circle) above the finger while sampling.
- Toolbar: plain HTML/CSS is fine — 50dp bar, `#DDDDDD`/`#333333`, five 48dp buttons, `elevation 20dp` → `box-shadow: 0 3px 5px -1px rgba(0,0,0,.2), 0 6px 10px 0 rgba(0,0,0,.14), 0 1px 18px 0 rgba(0,0,0,.12)`. Brush/colour swatches: a 24dp canvas drawing a `2dp` ring plus a filled inner disc of radius `(r − 2dp) * scale + 1`. Sub-rows slide in with `transform: translateY(...)` + `opacity`, 220 ms show / 150 ms hide.
- Brush widths (dp): `[1, 3.75, 12, 25.75, 45, 69.75]`; colours: `[#000000, #FFFFFF, …6 random hues at 60° spacing…]`.

## 3.6 Upstream files (Pie)

```
eggs/Pie/src/main/AndroidManifest.xml
eggs/Pie/src/main/java/com/android_p/egg/PlatLogoActivity.java        (contains PBackground)
eggs/Pie/src/main/java/com/android_p/egg/AndroidPieEasterEgg.kt
eggs/Pie/src/main/java/com/android_p/egg/paint/PaintActivity.java
eggs/Pie/src/main/java/com/android_p/egg/paint/Painting.kt
eggs/Pie/src/main/java/com/android_p/egg/paint/Palette.kt
eggs/Pie/src/main/java/com/android_p/egg/paint/SpotFilter.kt
eggs/Pie/src/main/java/com/android_p/egg/paint/BrushPropertyDrawable.kt
eggs/Pie/src/main/java/com/android_p/egg/paint/CutoutAvoidingToolbar.kt
eggs/Pie/src/main/java/com/android_p/egg/paint/ToolbarView.kt          (unused by the layout)
eggs/Pie/src/main/res/layout/{p_activity_paint,p_toolbar,p_brushes,p_colors}.xml
eggs/Pie/src/main/res/values/{strings.xml,colors.xml,styles.xml,attrs_toolbar_view.xml}
eggs/Pie/src/main/res/values-night/{colors.xml,styles.xml}
eggs/Pie/src/main/res/color/p_toolbar_icon_color.xml
eggs/Pie/src/main/res/color-night/p_toolbar_icon_color.xml
eggs/Pie/src/main/res/drawable/{p,p_icon,p_icon_bg,p_toolbar_bg,p_toolbar_button_bg,p_ic_clear,p_ic_dropper,p_ic_hourglass}.xml
eggs/Pie/src/main/res/drawable-v26/p_icon.xml
core/basic/src/main/java/com/dede/basic/SpEx.kt   (SpUtils)
```

---

# License & attribution

- **Upstream repository**: `hushenghao/AndroidEasterEggs`, default branch `main`, GitHub-reported license **`Apache-2.0`** (`LICENSE`, 11 357 bytes, SPDX `Apache-2.0`).
- **Derivation from AOSP**: every substantive source file in these three modules carries the standard AOSP header — `Copyright (C) 2010 / 2015 / 2016 / 2017 / 2018 The Android Open Source Project` followed by the Apache-2.0 boilerplate (`http://www.apache.org/licenses/LICENSE-2.0`). The Java/Kotlin is a lightly repackaged port of AOSP's `PlatLogoActivity`, `neko`, `octo` and `paint` easter-egg sources (package names rewritten to `com.android_n/o/p.egg`, `MetricsLogger` calls commented out, `androidx`/Hilt/Dagger and `com.dede.basic` helpers added). The `res/drawable/*.xml` vector art is AOSP artwork verbatim.
- **Consequence for a TS/Canvas port**: Apache-2.0 permits derivative works. You must (a) include a copy of the Apache-2.0 license, (b) retain the copyright notices and the AOSP attribution, and (c) state significant changes. A practical notice block for the re-implementation:

  > Portions derived from the Android Open Source Project easter-egg sources (Neko / Octopus / PAINT.APK), as repackaged in `hushenghao/AndroidEasterEggs` (Apache-2.0). Copyright (C) 2010–2018 The Android Open Source Project. Modified for a TypeScript + HTML Canvas 2D re-implementation: Android `Drawable`/`VectorDrawable` art re-expressed as procedural canvas primitives, `SharedPreferences` persistence replaced with `localStorage`, `JobScheduler` replaced with timers, and `androidx.dynamicanimation` springs replaced with an equivalent damped-spring integrator.

- **Note on `feature/cat-editor`**: `CatParts.kt` and `CatPartColors.kt` are this repo's *own* independent re-encoding of the Neko cat as path builders + a colour table (no AOSP header, © the repo author, also Apache-2.0). They are an excellent cross-check for a canvas port — `CatParts.drawOrders` is exactly the 27-entry draw order listed above, and `CatParts.VIEW_PORT_SIZE = 48f`, `SHADOW_BLUR_RADIUS = 0.3f`, `MOUTH_STROKE_WIDTH = 1.2f`, `TAIL_STROKE_WIDTH = 5f` confirm the stroke constants. `CatPartColors` uses two's-complement negative literals for the same colours (`-0xdededf` = `0xFF212121`, etc.) and differs from `Cat.java` in one harmless way: when the belly roll yields transparent it leaves the belly at `bodyColor` instead of alpha 0 — visually identical since it's drawn over the body.
</task_result>
</task>