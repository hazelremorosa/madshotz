import type { CapturedPhoto, LayoutDef, PlacedItem, Theme } from "@/types";

interface ComposeOpts {
  photos: CapturedPhoto[];
  layout: LayoutDef;
  filterCss: string;
  items: PlacedItem[];
  theme: Theme;
  code: string;
  dateLabel: string;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const ir = img.width / img.height;
  const tr = w / h;
  let sw = img.width;
  let sh = img.height;
  let sx = 0;
  let sy = 0;
  if (ir > tr) {
    sw = img.height * tr;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / tr;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/** Compute frame rectangles inside the content box for a given layout. */
function frameRects(
  kind: LayoutDef["kind"],
  shots: number,
  x: number,
  y: number,
  w: number,
  h: number,
  g: number,
): { x: number; y: number; w: number; h: number }[] {
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  if (kind === "single") {
    rects.push({ x, y, w, h });
  } else if (kind === "strip") {
    const fh = (h - g * (shots - 1)) / shots;
    for (let i = 0; i < shots; i++)
      rects.push({ x, y: y + i * (fh + g), w, h: fh });
  } else if (kind === "row") {
    const fw = (w - g * (shots - 1)) / shots;
    for (let i = 0; i < shots; i++)
      rects.push({ x: x + i * (fw + g), y, w: fw, h });
  } else if (kind === "grid") {
    const fw = (w - g) / 2;
    const fh = (h - g) / 2;
    const pos = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ];
    for (let i = 0; i < 4; i++)
      rects.push({
        x: x + pos[i][0] * (fw + g),
        y: y + pos[i][1] * (fh + g),
        w: fw,
        h: fh,
      });
  } else if (kind === "magazine") {
    const heroH = h * 0.58;
    rects.push({ x, y, w, h: heroH });
    const fw = (w - g) / 2;
    const smH = h - heroH - g;
    rects.push({ x, y: y + heroH + g, w: fw, h: smH });
    rects.push({ x: x + fw + g, y: y + heroH + g, w: fw, h: smH });
  }
  return rects;
}

/** Renders the receipt composite to a PNG data URL. */
export async function composeReceipt(opts: ComposeOpts): Promise<string> {
  const { photos, layout, filterCss, items, theme, code, dateLabel } = opts;
  const W = 760;
  const H = Math.round(W / layout.paperAspect);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Paper.
  ctx.fillStyle = "#f8f4ea";
  ctx.fillRect(0, 0, W, H);

  const pad = Math.round(W * 0.06);
  const headerH = Math.round(W * 0.2);
  const footerH = Math.round(W * 0.26);
  const cx = pad;
  const cy = headerH;
  const cw = W - pad * 2;
  const ch = H - headerH - footerH;
  const gap = Math.round(W * 0.028);

  // Header.
  const ink = "#211d17";
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 ${Math.round(W * 0.075)}px system-ui, sans-serif`;
  ctx.fillText("MAD SHOT'Z", W / 2, Math.round(W * 0.1));
  ctx.font = `600 ${Math.round(W * 0.03)}px ui-monospace, monospace`;
  ctx.fillStyle = "#6b6255";
  ctx.fillText(
    theme.header.toUpperCase(),
    W / 2,
    Math.round(W * 0.1) + Math.round(W * 0.05),
  );
  // dashed divider
  dashed(ctx, pad, headerH - 10, W - pad, headerH - 10);

  // Frames.
  const rects = frameRects(layout.kind, layout.shots, cx, cy, cw, ch, gap);
  const imgs = await Promise.all(photos.map((p) => loadImage(p.dataUrl)));
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    ctx.save();
    roundRect(ctx, r.x, r.y, r.w, r.h, 14);
    ctx.clip();
    if (imgs[i]) {
      ctx.filter = filterCss && filterCss !== "none" ? filterCss : "none";
      drawCover(ctx, imgs[i], r.x, r.y, r.w, r.h);
      ctx.filter = "none";
    } else {
      ctx.fillStyle = "#e7e0d0";
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.restore();
    ctx.save();
    roundRect(ctx, r.x, r.y, r.w, r.h, 14);
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // Decorations (stickers + text), normalized to full paper.
  for (const it of [...items].sort((a, b) => a.z - b.z)) {
    ctx.save();
    ctx.translate(it.x * W, it.y * H);
    ctx.rotate((it.rotation * Math.PI) / 180);
    if (it.kind === "sticker") {
      const size = W * 0.12 * it.scale;
      ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(it.content, 0, 0);
    } else {
      const size = W * 0.05 * it.scale;
      ctx.font = `800 ${size}px system-ui, sans-serif`;
      ctx.fillStyle = ink;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(it.content, 0, 0);
    }
    ctx.restore();
  }

  // Footer: dashed line, barcode, code, date.
  const fy = H - footerH + 6;
  dashed(ctx, pad, fy, W - pad, fy);
  // faux barcode
  let bx = pad;
  const bTop = fy + Math.round(W * 0.05);
  const bH = Math.round(W * 0.09);
  ctx.fillStyle = ink;
  while (bx < W - pad) {
    const bw = 2 + Math.floor(Math.random() * 5);
    if (Math.random() > 0.35) ctx.fillRect(bx, bTop, bw, bH);
    bx += bw + 2 + Math.floor(Math.random() * 3);
  }
  ctx.font = `600 ${Math.round(W * 0.028)}px ui-monospace, monospace`;
  ctx.fillStyle = "#6b6255";
  ctx.textAlign = "center";
  ctx.fillText(
    `NO. ${code}   ·   ${dateLabel}`,
    W / 2,
    bTop + bH + Math.round(W * 0.05),
  );
  ctx.fillText("★ THANK YOU FOR VISITING ★", W / 2, bTop + bH + Math.round(W * 0.09));

  return canvas.toDataURL("image/png");
}

function dashed(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 7]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}
