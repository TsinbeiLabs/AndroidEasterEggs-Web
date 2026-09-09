import { drawDroid } from '../../core/art';
import type { Egg, EggContext } from '../../core/types';

/**
 * Android Next — the app's own placeholder for the upcoming release (API level
 * `CUR_DEVELOPMENT`), not an AOSP egg. Tapping it upstream opens a timeline
 * dialog; this reproduces that card with the same release schedule constants
 * (beta in February, platform stability in May, release in August 2026) and the
 * "Wow, Android Next." timeline event.
 */

const RELEASE_YEAR = 2026;

const MILESTONES: ReadonlyArray<readonly [string, string]> = [
  ['2 月', 'Beta 发布'],
  ['5 月', 'Platform Stability'],
  ['8 月', '正式发布'],
];

export default function createAndroidNext(context: EggContext): Egg {
  let wasDown = false;
  let pulse = 0;

  const offFrame = context.onFrame((dt) => {
    const { ctx, width, height, pointer } = context;

    if (pointer.down && !wasDown) {
      context.toast('Wow, Android Next.', 2);
      pulse = 1;
    }
    wasDown = pointer.down;
    pulse = Math.max(0, pulse - dt * 1.6);

    ctx.fillStyle = '#0b0e13';
    ctx.fillRect(0, 0, width, height);

    const cardW = Math.min(560, width - 48);
    const cardH = Math.min(420, height - 48);
    const x = (width - cardW) / 2;
    const y = (height - cardH) / 2;

    ctx.save();
    ctx.translate(cardW / 2 + x, cardH / 2 + y);
    ctx.scale(1 + pulse * 0.02, 1 + pulse * 0.02);
    ctx.translate(-(cardW / 2 + x), -(cardH / 2 + y));

    ctx.fillStyle = '#161b22';
    ctx.strokeStyle = '#3ddc84';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, cardH, 20);
    ctx.fill();
    ctx.stroke();

    drawDroid(ctx, {
      x: x + cardW / 2,
      y: y + 96,
      unit: 40 + pulse * 4,
      bodyColor: '#3ddc84',
      eyeColor: '#161b22',
    });

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Android Next', x + cardW / 2, y + 176);

    ctx.fillStyle = '#9aa7b2';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(
      `API CUR_DEVELOPMENT · 预计 ${RELEASE_YEAR} 年发布`,
      x + cardW / 2,
      y + 202,
    );

    const rowY = y + 248;
    const colW = cardW / MILESTONES.length;
    MILESTONES.forEach(([month, label], i) => {
      const cx = x + colW * i + colW / 2;
      ctx.fillStyle = '#3ddc84';
      ctx.beginPath();
      ctx.arc(cx, rowY, 5, 0, Math.PI * 2);
      ctx.fill();
      if (i < MILESTONES.length - 1) {
        ctx.strokeStyle = 'rgba(61, 220, 132, 0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx + 8, rowY);
        ctx.lineTo(cx + colW - 8, rowY);
        ctx.stroke();
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '700 15px system-ui, sans-serif';
      ctx.fillText(month, cx, rowY + 28);
      ctx.fillStyle = '#9aa7b2';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(label, cx, rowY + 50);
    });

    ctx.fillStyle = 'rgba(154, 167, 178, 0.75)';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('占位彩蛋：下一版 Android 发布前，这里只有时间表', x + cardW / 2, y + cardH - 28);
    ctx.restore();
  });

  return {
    hint: '点击查看发布时间表',
    destroy() {
      offFrame();
    },
  };
}
