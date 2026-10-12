// Renders a branded PNG card of panel data (canvas), then shares via the
// Web Share API when available, otherwise downloads the image.

export interface ShareRow {
  label: string;
  pct: number;      // 0-100 bar fill
  value: string;    // right-aligned text (e.g. "82%" or "14d")
  color: string;
}

const W = 1080; // square-ish card renders well on most social platforms
const PAD = 72;

function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const ch = (v: string) => `rgb(${css.getPropertyValue(v).trim()})`;
  return {
    bg: ch('--forest-950'),
    card: ch('--forest-900'),
    line: ch('--line'),
    ink: ch('--ink'),
    soft: ch('--ink-soft'),
    mint: ch('--mint'),
    track: ch('--forest-800'),
  };
}

export async function shareCard(title: string, subtitle: string, rows: ShareRow[]) {
  const c = themeColors();
  const rowH = 84;
  const headerH = 220;
  const footerH = 120;
  const H = headerH + rows.length * rowH + footerH;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // background
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);

  // header
  ctx.fillStyle = c.ink;
  ctx.font = '700 56px Inter, system-ui, sans-serif';
  ctx.fillText(title, PAD, 128);
  ctx.fillStyle = c.soft;
  ctx.font = '400 30px Inter, system-ui, sans-serif';
  ctx.fillText(subtitle, PAD, 176);

  // rows
  rows.forEach((r, i) => {
    const y = headerH + i * rowH;
    ctx.fillStyle = c.ink;
    ctx.font = '600 32px Inter, system-ui, sans-serif';
    ctx.fillText(truncate(ctx, r.label, 330), PAD, y + 42);

    const barX = PAD + 360;
    const barW = W - barX - PAD - 130;
    const barY = y + 18;
    roundRect(ctx, barX, barY, barW, 26, 13, c.track);
    roundRect(ctx, barX, barY, Math.max(26, barW * Math.min(100, r.pct) / 100), 26, 13, r.color);

    ctx.fillStyle = c.soft;
    ctx.font = '600 30px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(r.value, W - PAD, y + 42);
    ctx.textAlign = 'left';
  });

  // footer brand
  const fy = H - 56;
  ctx.fillStyle = c.mint;
  roundRect(ctx, PAD, fy - 34, 44, 44, 12, c.mint);
  ctx.strokeStyle = c.bg;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(PAD + 11, fy - 11);
  ctx.lineTo(PAD + 20, fy - 2);
  ctx.lineTo(PAD + 34, fy - 22);
  ctx.stroke();
  ctx.fillStyle = c.ink;
  ctx.font = '700 32px Inter, system-ui, sans-serif';
  ctx.fillText('OpenHabit', PAD + 60, fy);
  ctx.fillStyle = c.soft;
  ctx.font = '400 26px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('self-hosted habit tracking', W - PAD, fy);
  ctx.textAlign = 'left';

  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'));
  const file = new File([blob], 'openhabit.png', { type: 'image/png' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text: `${title} — ${subtitle}` });
      return;
    } catch {
      /* user cancelled or share failed -> fall through to download */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'openhabit.png';
  a.click();
  URL.revokeObjectURL(url);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text;
  while (text.length > 1 && ctx.measureText(`${text}…`).width > maxW) text = text.slice(0, -1);
  return `${text}…`;
}
