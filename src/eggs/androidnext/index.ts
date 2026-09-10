import { FAST_OUT_SLOW_IN, LINEAR_OUT_SLOW_IN } from '../../core/easing';
import { Tweens, type TweenHandle } from '../../core/tween';
import type { Egg, EggContext } from '../../core/types';
import { drawPatch } from '../shared/patches';
import { android17Platlogo } from '../shared/platlogoArt';
import { drawVectorArt } from '../shared/vectorArt';

/**
 * Android Next — the app's placeholder egg for the upcoming release (API level
 * `CUR_DEVELOPMENT`), not an AOSP egg. `AndroidNextEasterEgg.kt` has no
 * PlatLogo minigame: activating it shows the `AndroidNextTimelineDialog` bottom
 * sheet ("Wow, Android Next." is only the timeline entry's caption), and this
 * reproduces that sheet with the upstream release-schedule constants —
 * `RELEASE_YEAR = 2026`, beta in February, platform stability in May, release
 * in August (`BETA_RELEASE_MONTH` / `PLATFORM_STABILITY_MONTH` /
 * `RELEASE_MONTH`).
 *
 * Sheet contents (`AndroidNextTimelineDialog.kt`): a 42dp adaptive icon next to
 * the nickname (`nickname_android_next` = "CinnamonBun", translatable=false),
 * the summary that flips to "released" once the local date passes
 * `getReleaseDate()` = 2026-08-01 (`Utiles.kt`), the `AndroidScheduleArtist`
 * serpentine timeline at a 4:3 aspect, and Cancel / Releases text buttons, the
 * latter opening `url_android_releases` (the values-zh google.cn mirror).
 *
 * `AndroidScheduleArtist.kt` geometry, all in dp on the 4:3 canvas: the full
 * serpentine (top row, right U-turn, middle row, left U-turn, bottom row to
 * 70 % of the width) is stroked 30 wide in 0x222E9B49; the blue beta path
 * (0xFF3B78EF, stroke 14) covers it from the start to just short of the
 * leftmost point of the middle U-turn (`arcGapDegrees` = degrees(14*0.8/
 * arcRadius)/2 short); the 0x202E9B49 platform-stability path re-covers the
 * middle row from 60 % through the U-turn to the release point, where the solid
 * green release path (0xFF2E9B49, stroke 14) runs back along the bottom row
 * and 80°-gap up the U-turn. Milestone dots are r=11 (0xFFAFCFFF, release
 * 0xFF76D28A), each with a bubble label 28 above its anchor (pill, 12/4
 * padding, 14sp text) and the path labels "Beta 版"/"平台稳定版本" in 12sp on
 * and under their strokes.
 */

const RELEASE_YEAR = 2026; // AndroidNextEasterEgg.RELEASE_YEAR
const BETA_RELEASE_MONTH = 1; // Calendar.FEBRUARY (JS month index)
const PLATFORM_STABILITY_MONTH = 4; // Calendar.MAY
const RELEASE_MONTH = 7; // Calendar.AUGUST

/** `nickname_android_next`, translatable="false". */
const NICKNAME = 'CinnamonBun';

/** `url_android_releases` from values-zh/strings_locality.xml. */
const RELEASES_URL = 'https://developer.android.google.cn/about/versions/17';

/** values-zh strings.xml, and `getLocaleFormatMonth` ("MMMM") in Chinese. */
const SUMMARY_WAITING = '尚未发布';
const SUMMARY_RELEASED = '最终版本已经发布。';
const LABEL_CANCEL = '取消';
const LABEL_RELEASES = '版本';
const LABEL_BETA = 'Beta 版';
const LABEL_STABILITY = '平台稳定版本';
const LABEL_FINAL_RELEASE = '最终发布';
const MONTH_NAMES_ZH = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

// ArtistDrawScope constants (dp == CSS px here).
const FULL_STROKE = 30;
const INNER_STROKE = 14;
const LINE_STROKE = 1.5;
const LABEL_SPACE = 6;
const LINE_POINT_RADIUS = 2;
const POINT_RADIUS = 11;
const PATH_LABEL_SIZE = 12; // 12.sp
const BUBBLE_LABEL_SIZE = 14; // 14.sp
const BUBBLE_ANCHOR_SPACE = 28;
const BUBBLE_PAD_X = 12;
const BUBBLE_PAD_Y = 4;

// AndroidScheduleArtist colours.
const C_FULL_PATH = 'rgba(46, 155, 73, 0.133)'; // Color(0x22_2E9B49)
const C_STABILITY_PATH = 'rgba(46, 155, 73, 0.125)'; // Color(0x20_2E9B49)
const C_BETA = '#3B78EF';
const C_RELEASE = '#2E9B49';
const C_BETA_INNER = '#F6FEFF';
const C_BETA_INNER_END = 'rgba(255, 255, 255, 0.933)'; // Color(0xEE_FFFFFF)
const C_POINT = '#AFCFFF';
const C_RELEASE_POINT = '#76D28A';
const C_BETA_TEXT = '#F6FEFF';
const C_STABILITY_TEXT = '#2E9B49';
const C_BUBBLE_BETA_BG = '#72A9FE';
const C_BUBBLE_BETA_FG = '#00397E';
const C_BUBBLE_STABILITY_BG = '#D3D3D3';
const C_BUBBLE_STABILITY_FG = '#575B5E';
const C_BUBBLE_RELEASE_BG = '#76D386';
const C_BUBBLE_RELEASE_FG = '#095A16';

/** Approximation of a Compose Text line height for the fixed sp sizes. */
const lineHeight = (fontSize: number): number => Math.round(fontSize * 1.4);

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  maxWidth: number,
): string[] {
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) return [text];
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    const next = line + ch;
    if (line !== '' && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = ch;
    } else {
      line = next;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

/** `drawBubbleLabel`: anchor dot -> 28dp stem -> pill centred above it. */
function drawBubbleLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  textColor: string,
  bubbleColor: string,
  anchorX: number,
  anchorY: number,
  maxWidth: number,
): void {
  const font = `${BUBBLE_LABEL_SIZE}px system-ui, sans-serif`;
  const lines = wrapText(ctx, label, font, maxWidth);
  const lineH = lineHeight(BUBBLE_LABEL_SIZE);
  ctx.font = font;
  let textW = 0;
  for (const line of lines) textW = Math.max(textW, ctx.measureText(line).width);
  const pillW = textW + BUBBLE_PAD_X * 2;
  const pillH = lines.length * lineH + BUBBLE_PAD_Y * 2;

  ctx.strokeStyle = bubbleColor;
  ctx.lineWidth = LINE_STROKE;
  ctx.beginPath();
  ctx.moveTo(anchorX, anchorY);
  ctx.lineTo(anchorX, anchorY - BUBBLE_ANCHOR_SPACE - pillH / 2);
  ctx.stroke();

  const top = anchorY - BUBBLE_ANCHOR_SPACE - pillH;
  ctx.fillStyle = bubbleColor;
  ctx.beginPath();
  // cornerRadius = CornerRadius(height, height): a full pill.
  ctx.roundRect(anchorX - BUBBLE_PAD_X, top, pillW, pillH, pillH);
  ctx.fill();

  ctx.fillStyle = textColor;
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    ctx.fillText(line, anchorX, top + BUBBLE_PAD_Y + i * lineH);
  });
}

/** `AndroidScheduleArtist`, drawn at the current origin with width `w`. */
function drawScheduleArtist(ctx: CanvasRenderingContext2D, w: number): void {
  const h = (w * 3) / 4; // Modifier.aspectRatio(4 / 3f)
  const rect = {
    top: h * 0.2,
    left: FULL_STROKE / 2,
    right: w - FULL_STROKE / 2,
    bottom: h - FULL_STROKE / 2,
  };
  const endOffsetX = rect.left + (rect.right - rect.left) * 0.7;
  const arcRadius = (rect.bottom - rect.top) / 2 / 2;
  // arcGapDegrees = (innerStroke * 0.8 / arcRadius).toDegrees() / 2, in radians.
  const arcGap = INNER_STROKE * 0.8 / arcRadius / 2;
  const midY = rect.top + arcRadius * 2;
  const centerX = (rect.left + rect.right) / 2;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // drawFullPath: the whole serpentine, faint green under everything.
  ctx.strokeStyle = C_FULL_PATH;
  ctx.lineWidth = FULL_STROKE;
  ctx.beginPath();
  ctx.moveTo(rect.left, rect.top);
  ctx.arc(rect.right - arcRadius, rect.top + arcRadius, arcRadius, -Math.PI / 2, Math.PI / 2, false);
  ctx.arc(rect.left + arcRadius, rect.top + arcRadius * 3, arcRadius, -Math.PI / 2, Math.PI / 2, true);
  ctx.lineTo(endOffsetX, rect.bottom);
  ctx.stroke();

  // drawBetaPath: top row + right U-turn + the middle row up to the leftmost
  // point of the left U-turn, minus the gap, in blue.
  ctx.strokeStyle = C_BETA;
  ctx.lineWidth = INNER_STROKE;
  ctx.beginPath();
  ctx.moveTo(rect.left, rect.top);
  ctx.arc(rect.right - arcRadius, rect.top + arcRadius, arcRadius, -Math.PI / 2, Math.PI / 2, false);
  ctx.arc(
    rect.left + arcRadius,
    rect.top + arcRadius * 3,
    arcRadius,
    -Math.PI / 2,
    -Math.PI + arcGap,
    true,
  );
  ctx.stroke();

  // The "Beta 版" path label sits on the blue top row.
  const betaLabelX = rect.left + POINT_RADIUS + LABEL_SPACE;
  ctx.font = `${PATH_LABEL_SIZE}px system-ui, sans-serif`;
  const betaLabelW = ctx.measureText(LABEL_BETA).width;
  ctx.fillStyle = C_BETA_TEXT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(LABEL_BETA, betaLabelX, rect.top);

  // betaInnerPath: the 1.5dp light inline inside the blue stroke, starting
  // after the label and ending in a dot at the arc end.
  ctx.strokeStyle = C_BETA_INNER;
  ctx.lineWidth = LINE_STROKE;
  ctx.beginPath();
  ctx.moveTo(betaLabelX + betaLabelW + LABEL_SPACE, rect.top);
  ctx.arc(rect.right - arcRadius, rect.top + arcRadius, arcRadius, -Math.PI / 2, Math.PI / 2, false);
  ctx.arc(
    rect.left + arcRadius,
    rect.top + arcRadius * 3,
    arcRadius,
    -Math.PI / 2,
    -Math.PI + arcGap,
    true,
  );
  ctx.stroke();
  ctx.fillStyle = C_BETA_INNER_END;
  ctx.beginPath();
  ctx.arc(
    rect.left + arcRadius + arcRadius * Math.cos(-Math.PI + arcGap),
    rect.top + arcRadius * 3 + arcRadius * Math.sin(-Math.PI + arcGap),
    LINE_POINT_RADIUS,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // The beta milestone bubble + dot at the start of the top row.
  drawBubbleLabel(
    ctx,
    MONTH_NAMES_ZH[BETA_RELEASE_MONTH],
    C_BUBBLE_BETA_FG,
    C_BUBBLE_BETA_BG,
    rect.left,
    rect.top,
    Infinity,
  );
  ctx.fillStyle = C_POINT;
  ctx.beginPath();
  ctx.arc(rect.left, rect.top, POINT_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // drawPlatformStabilityPath: middle row from 60 % through the left U-turn to
  // the release point, in translucent green over the full path.
  ctx.strokeStyle = C_STABILITY_PATH;
  ctx.lineWidth = FULL_STROKE;
  ctx.beginPath();
  ctx.moveTo(rect.left + (rect.right - rect.left) * 0.6, midY);
  ctx.arc(rect.left + arcRadius, rect.top + arcRadius * 3, arcRadius, -Math.PI / 2, Math.PI / 2, true);
  ctx.lineTo(endOffsetX, rect.bottom);
  ctx.stroke();

  drawBubbleLabel(
    ctx,
    MONTH_NAMES_ZH[PLATFORM_STABILITY_MONTH],
    C_BUBBLE_STABILITY_FG,
    C_BUBBLE_STABILITY_BG,
    centerX,
    midY,
    Infinity,
  );
  ctx.fillStyle = C_POINT;
  ctx.beginPath();
  ctx.arc(centerX, midY, POINT_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // The "平台稳定版本" label under the centre dot and its leader line down
  // around the U-turn to a dot just short of the release point.
  const stabilityFont = `${PATH_LABEL_SIZE}px system-ui, sans-serif`;
  const stabilityLines = wrapText(
    ctx,
    LABEL_STABILITY,
    stabilityFont,
    rect.right - rect.left - FULL_STROKE - arcRadius - LABEL_SPACE * 2,
  );
  ctx.font = stabilityFont;
  let stabilityW = 0;
  for (const line of stabilityLines) stabilityW = Math.max(stabilityW, ctx.measureText(line).width);
  const labelOffsetX = centerX - stabilityW / 2;
  ctx.fillStyle = C_STABILITY_TEXT;
  ctx.font = stabilityFont;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const stabilityTextY = midY + LABEL_SPACE + POINT_RADIUS;
  stabilityLines.forEach((line, i) => {
    ctx.fillText(line, labelOffsetX, stabilityTextY + i * lineHeight(PATH_LABEL_SIZE));
  });

  const firstLineHeight = lineHeight(PATH_LABEL_SIZE);
  const lineArcRadius = arcRadius - firstLineHeight / 2 - FULL_STROKE / 2;
  const leaderY = midY + FULL_STROKE / 2 + firstLineHeight / 2;
  ctx.strokeStyle = C_RELEASE;
  ctx.lineWidth = LINE_STROKE;
  ctx.beginPath();
  ctx.moveTo(Math.max(labelOffsetX - LABEL_SPACE, rect.left + arcRadius), leaderY);
  ctx.arc(rect.left + arcRadius, leaderY + lineArcRadius, lineArcRadius, -Math.PI / 2, Math.PI / 2, true);
  ctx.lineTo(endOffsetX - LABEL_SPACE, leaderY + lineArcRadius * 2);
  ctx.stroke();
  ctx.fillStyle = C_RELEASE;
  ctx.beginPath();
  ctx.arc(endOffsetX - LABEL_SPACE, leaderY + lineArcRadius * 2, LINE_POINT_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // drawReleasePath: the bottom row back from the release point and 80°-gap up
  // the left U-turn, in solid green.
  ctx.strokeStyle = C_RELEASE;
  ctx.lineWidth = INNER_STROKE;
  ctx.beginPath();
  ctx.moveTo(endOffsetX, rect.bottom);
  ctx.arc(
    rect.left + arcRadius,
    rect.bottom - arcRadius,
    arcRadius,
    Math.PI / 2,
    Math.PI / 2 + ((80 * Math.PI) / 180 - arcGap),
    false,
  );
  ctx.stroke();

  drawBubbleLabel(
    ctx,
    LABEL_FINAL_RELEASE,
    C_BUBBLE_RELEASE_FG,
    C_BUBBLE_RELEASE_BG,
    endOffsetX,
    rect.bottom,
    rect.right - endOffsetX,
  );
  ctx.fillStyle = C_RELEASE_POINT;
  ctx.beginPath();
  ctx.arc(endOffsetX, rect.bottom, POINT_RADIUS, 0, Math.PI * 2);
  ctx.fill();
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Layout {
  sheetX: number;
  sheetY: number;
  sheetW: number;
  sheetH: number;
  contentX: number;
  artistX: number;
  artistY: number;
  artistW: number;
  cancel: Rect;
  releases: Rect;
}

const inRect = (px: number, py: number, rect: Rect): boolean =>
  px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;

export default function createAndroidNext(context: EggContext): Egg {
  const tweens = new Tweens();

  // getTimelineMessage: local midnight today vs getReleaseDate() midnight.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const releaseDate = new Date(RELEASE_YEAR, RELEASE_MONTH, 1);
  const summary = today.getTime() > releaseDate.getTime() ? SUMMARY_RELEASED : SUMMARY_WAITING;

  /** 0 = sheet hidden, 1 = fully shown. */
  let sheet = 0;
  let idle = false;
  /** Sheet slide target consumed on the next frame (tweens need frame time). */
  let target: number | null = 1; // activating the egg shows the dialog
  let sheetTween: TweenHandle | null = null;
  let hovered: 'cancel' | 'releases' | null = null;
  let layoutCache: Layout | null = null;

  const animateSheet = (to: number, now: number): void => {
    sheetTween?.cancel();
    sheetTween = null;
    const from = sheet;
    if (from === to) {
      idle = to === 0;
      return;
    }
    // ModalBottomSheet slide in/out, scaled by the remaining distance.
    const duration = Math.abs(to - from) * (to === 1 ? 350 : 250);
    sheetTween = tweens.add(
      {
        duration,
        ease: to === 1 ? LINEAR_OUT_SLOW_IN : FAST_OUT_SLOW_IN,
        from,
        to,
        onUpdate: (v) => (sheet = v),
        onComplete: () => {
          sheet = to;
          idle = to === 0;
        },
      },
      now,
    );
    idle = false;
  };

  const layout = (): Layout => {
    const { ctx, width, height } = context;
    const sheetW = Math.min(width, 560);
    const sheetX = (width - sheetW) / 2;
    const padX = 24; // Column padding(horizontal = 24.dp)
    const contentX = sheetX + padX;
    const contentW = sheetW - padX * 2;
    const handleTop = 16;
    const handleH = 4;
    const headerH = 42; // AlterableAdaptiveIcon size(42.dp)
    const messageH = lineHeight(BUBBLE_LABEL_SIZE) + 2;
    const buttonH = 40;
    const bottomPad = 12; // padding(bottom = 12.dp + insets)
    const gaps = 16 * 4; // Arrangement.spacedBy(16.dp) between the four blocks

    // The upstream column scrolls; here the artist shrinks to fit the stage.
    const fixed = handleTop + handleH + gaps + headerH + messageH + buttonH + bottomPad;
    const artistW = Math.max(200, Math.min(contentW, ((height - fixed) / 3) * 4));
    const artistH = (artistW * 3) / 4;
    const sheetH = fixed + artistH;
    const sheetY = height - sheetH * sheet;

    ctx.font = '500 14px system-ui, sans-serif';
    const cancelW = Math.max(48, ctx.measureText(LABEL_CANCEL).width + 24);
    const releasesW = Math.max(48, ctx.measureText(LABEL_RELEASES).width + 24);
    const buttonsY =
      sheetY + handleTop + handleH + 16 + headerH + 16 + messageH + 16 + artistH + 16;

    return {
      sheetX,
      sheetY,
      sheetW,
      sheetH,
      contentX,
      artistX: contentX + (contentW - artistW) / 2,
      artistY: buttonsY - 16 - artistH,
      artistW,
      cancel: {
        x: contentX + contentW - releasesW - 8 - cancelW,
        y: buttonsY,
        w: cancelW,
        h: buttonH,
      },
      releases: { x: contentX + contentW - releasesW, y: buttonsY, w: releasesW, h: buttonH },
    };
  };

  const offUp = context.onPointerUp((x, y) => {
    if (idle) {
      target = 1;
      return;
    }
    if (sheet < 1 || layoutCache === null) return;
    if (inRect(x, y, layoutCache.releases)) {
      window.open(RELEASES_URL, '_blank', 'noopener');
      target = 0;
    } else if (inRect(x, y, layoutCache.cancel)) {
      target = 0;
    } else if (y < layoutCache.sheetY) {
      // Scrim tap = ModalBottomSheet onDismissRequest.
      target = 0;
    }
  });

  const offFrame = context.onFrame((_dt, t) => {
    const now = t * 1000;
    const { ctx, width, height, pointer } = context;
    tweens.update(now);

    if (target !== null) {
      animateSheet(target, now);
      target = null;
    }

    ctx.fillStyle = '#0b0e13';
    ctx.fillRect(0, 0, width, height);

    // The "app screen" behind the dialog: SnapshotProvider shows
    // `android_17_platlogo` without a background.
    const logoSize = Math.max(140, Math.min(300, Math.min(width, height) * 0.5));
    const logoX = width / 2 - logoSize / 2;
    const logoY = height / 2 - logoSize / 2 - 16;
    ctx.save();
    ctx.translate(logoX, logoY);
    drawVectorArt(ctx, android17Platlogo, logoSize);
    ctx.restore();
    if (idle) {
      ctx.fillStyle = 'rgba(154, 167, 178, 0.85)';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('点击打开发布时间表', width / 2, logoY + logoSize + 20);
    }

    if (sheet <= 0) {
      context.canvas.style.cursor = idle ? 'pointer' : 'default';
      layoutCache = null;
      return;
    }

    // BottomSheetDefaults scrim over the content behind the sheet.
    ctx.fillStyle = `rgba(0, 0, 0, ${0.4 * sheet})`;
    ctx.fillRect(0, 0, width, height);

    const l = layout();
    layoutCache = sheet >= 1 ? l : null;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(l.sheetX, l.sheetY, l.sheetW, l.sheetH, [28, 28, 0, 0]);
    ctx.fillStyle = '#161b22';
    ctx.fill();
    ctx.clip();

    // Drag handle (BottomSheetDefaults.DragHandle).
    ctx.fillStyle = 'rgba(230, 237, 243, 0.32)';
    ctx.beginPath();
    ctx.roundRect(l.sheetX + l.sheetW / 2 - 16, l.sheetY + 16, 32, 4, 2);
    ctx.fill();

    // Header row: 42dp adaptive icon + nickname (titleLarge).
    const headerY = l.sheetY + 16 + 4 + 16;
    const iconX = l.contentX;
    const iconCY = headerY + 21;
    ctx.save();
    ctx.beginPath();
    ctx.arc(iconX + 21, iconCY, 21, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF'; // ic_droid_logo_background
    ctx.fill();
    ctx.clip();
    // Adaptive foreground: the 512 art at 0.6 scale inside the mask.
    ctx.translate(iconX + 21 - (42 * 0.72) / 2, iconCY - (42 * 0.72) / 2);
    drawPatch(ctx, 'cinnamon', 42 * 0.72);
    ctx.restore();

    ctx.fillStyle = '#e6edf3';
    ctx.font = '22px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(NICKNAME, iconX + 42 + 12, iconCY + 1);

    // Summary (bodyMedium).
    ctx.fillStyle = '#9aa7b2';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(summary, l.contentX, headerY + 42 + 16);

    // AndroidScheduleArtist (fillMaxWidth, 4:3). Overflow above the box (the
    // beta bubble) stays unclipped, as in Compose.
    ctx.save();
    ctx.translate(l.artistX, l.artistY);
    drawScheduleArtist(ctx, l.artistW);
    ctx.restore();

    // Text buttons, end aligned with 8dp spacing.
    hovered = null;
    if (sheet >= 1) {
      if (inRect(pointer.x, pointer.y, l.releases)) hovered = 'releases';
      else if (inRect(pointer.x, pointer.y, l.cancel)) hovered = 'cancel';
    }
    const drawButton = (rect: Rect, label: string, key: 'cancel' | 'releases'): void => {
      if (hovered === key) {
        ctx.fillStyle = 'rgba(114, 169, 254, 0.12)';
        ctx.beginPath();
        ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 20);
        ctx.fill();
      }
      ctx.fillStyle = '#72A9FE';
      ctx.font = '500 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
    };
    drawButton(l.cancel, LABEL_CANCEL, 'cancel');
    drawButton(l.releases, LABEL_RELEASES, 'releases');

    ctx.restore();
    context.canvas.style.cursor = hovered !== null ? 'pointer' : 'default';
  });

  return {
    hint: '弹窗即上游的时间表对话框；取消后点击画面可重新打开',
    destroy() {
      offUp();
      offFrame();
      tweens.cancelAll();
      context.canvas.style.cursor = '';
    },
  };
}
