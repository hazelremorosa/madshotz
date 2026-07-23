import type {
  CapturedPhoto,
  FrameStyle,
  LayoutDef,
  PhotoShape,
  PlacedItem,
  Theme,
} from "@/types";
import { qrMatrixSync } from "@/lib/qr";
import { DeliveryService } from "@/lib/delivery";

interface ComposeOpts {
  photos: CapturedPhoto[];
  layout: LayoutDef;
  filterCss: string;
  frameStyle: FrameStyle;
  shape: PhotoShape;
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

function pathRounded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  tl: number,
  tr: number,
  br: number,
  bl: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

/** Sets the current path to the photo shape within (x,y,w,h). */
function shapePath(
  ctx: CanvasRenderingContext2D,
  shape: PhotoShape,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (shape === "circle") {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }
  if (shape === "heart") {
    const P = (px: number, py: number): [number, number] => [
      x + px * w,
      y + py * h,
    ];
    ctx.beginPath();
    ctx.moveTo(...P(0.5, 0.86));
    ctx.bezierCurveTo(...P(0.16, 0.62), ...P(0.0, 0.42), ...P(0.0, 0.24));
    ctx.bezierCurveTo(...P(0.0, 0.09), ...P(0.12, 0.02), ...P(0.26, 0.02));
    ctx.bezierCurveTo(...P(0.37, 0.02), ...P(0.46, 0.09), ...P(0.5, 0.2));
    ctx.bezierCurveTo(...P(0.54, 0.09), ...P(0.63, 0.02), ...P(0.74, 0.02));
    ctx.bezierCurveTo(...P(0.88, 0.02), ...P(1.0, 0.09), ...P(1.0, 0.24));
    ctx.bezierCurveTo(...P(1.0, 0.42), ...P(0.84, 0.62), ...P(0.5, 0.86));
    ctx.closePath();
    return;
  }
  const s = Math.min(w, h);
  if (shape === "arch") {
    pathRounded(ctx, x, y, w, h, s * 0.5, s * 0.5, 16, 16);
    return;
  }
  const r = shape === "sharp" ? 4 : 20;
  pathRounded(ctx, x, y, w, h, r, r, r, r);
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

/** Paints the frame mat (solid color or pattern) inside a rounded rect. */
function drawMat(
  ctx: CanvasRenderingContext2D,
  style: FrameStyle,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.save();
  pathRounded(ctx, x, y, w, h, 16, 16, 16, 16);
  ctx.clip();
  ctx.fillStyle = style.base;
  ctx.fillRect(x, y, w, h);

  if (style.motif === "dots") {
    ctx.fillStyle = "#ffb3d1";
    const step = 26;
    for (let gy = y; gy < y + h; gy += step)
      for (let gx = x; gx < x + w; gx += step) {
        ctx.beginPath();
        ctx.arc(gx + step / 2, gy + step / 2, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
  } else if (style.motif === "stripes") {
    ctx.strokeStyle = "#ffdfe9";
    ctx.lineWidth = 14;
    for (let d = -h; d < w + h; d += 34) {
      ctx.beginPath();
      ctx.moveTo(x + d, y + h);
      ctx.lineTo(x + d + h, y);
      ctx.stroke();
    }
  } else if (style.motif === "checks") {
    ctx.fillStyle = "#ffd7e6";
    const step = 30;
    for (let gy = y, row = 0; gy < y + h; gy += step, row++)
      for (let gx = x, col = 0; gx < x + w; gx += step, col++)
        if ((row + col) % 2 === 0) ctx.fillRect(gx, gy, step, step);
  } else if (style.emoji) {
    ctx.font = `26px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const step = 46;
    for (let gy = y; gy < y + h + step; gy += step)
      for (let gx = x; gx < x + w + step; gx += step)
        ctx.fillText(style.emoji, gx, gy);
  }
  ctx.restore();
}

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
  const { photos, layout, filterCss, frameStyle, shape, items, code, dateLabel } =
    opts;
  const W = 760;
  const H = Math.round(W / layout.paperAspect);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#fffdfa";
  ctx.fillRect(0, 0, W, H);

  const pad = Math.round(W * 0.06);
  const headerH = Math.round(W * 0.16);
  const footerH = Math.round(W * 0.28);
  const matX = pad;
  const matY = headerH;
  const matW = W - pad * 2;
  const matH = H - headerH - footerH;
  const matPad = Math.round(W * 0.03);
  const cx = matX + matPad;
  const cy = matY + matPad;
  const cw = matW - matPad * 2;
  const ch = matH - matPad * 2;
  const gap = Math.round(W * 0.022);

  const ink = "#4a3a44";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  // Subtle wordmark.
  ctx.font = `600 ${Math.round(W * 0.033)}px ui-monospace, monospace`;
  ctx.fillStyle = "#9c8794";
  ctx.fillText("M A D   S H O T S", W / 2, Math.round(W * 0.1));
  dashed(ctx, pad, headerH - 10, W - pad, headerH - 10);

  // Frame mat.
  drawMat(ctx, frameStyle, matX, matY, matW, matH);

  // Photos (shaped).
  const rects = frameRects(layout.kind, layout.shots, cx, cy, cw, ch, gap);
  const imgs = await Promise.all(photos.map((p) => loadImage(p.dataUrl)));
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    ctx.save();
    shapePath(ctx, shape, r.x, r.y, r.w, r.h);
    ctx.clip();
    if (imgs[i]) {
      ctx.filter = filterCss && filterCss !== "none" ? filterCss : "none";
      drawCover(ctx, imgs[i], r.x, r.y, r.w, r.h);
      ctx.filter = "none";
    } else {
      ctx.fillStyle = "#efe7dc";
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.restore();
  }

  // Decorations.
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

  // Footer — small QR + details.
  const fy = H - footerH + 6;
  dashed(ctx, pad, fy, W - pad, fy);
  const matrix = qrMatrixSync(DeliveryService.linkFor(code));
  const n = matrix.length;
  const qrSize = Math.round(W * 0.14);
  const qx = Math.round((W - qrSize) / 2);
  const qy = fy + Math.round(W * 0.04);
  const cell = qrSize / n;
  ctx.fillStyle = ink;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (matrix[r][c]) ctx.fillRect(qx + c * cell, qy + r * cell, cell + 0.6, cell + 0.6);
  ctx.font = `600 ${Math.round(W * 0.028)}px ui-monospace, monospace`;
  ctx.fillStyle = "#9c8794";
  ctx.textAlign = "center";
  ctx.fillText(`NO. ${code}  ·  ${dateLabel}`, W / 2, qy + qrSize + Math.round(W * 0.055));
  ctx.fillText("SCAN FOR YOUR PHOTOS ♥", W / 2, qy + qrSize + Math.round(W * 0.095));

  // JPEG keeps the stored/uploaded file small (~5-10x smaller than PNG). The
  // paper background is opaque so no transparency is lost. Lower QUALITY for even
  // smaller files (0.7 ≈ tiny, 0.9 ≈ crisp). WebP is smaller still if you prefer.
  const QUALITY = 0.82;
  return canvas.toDataURL("image/jpeg", QUALITY);
}

function dashed(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  ctx.save();
  ctx.strokeStyle = "rgba(90,69,82,0.35)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 7]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}
