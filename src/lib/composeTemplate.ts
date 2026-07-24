import type { CapturedPhoto, EventTemplate, TemplateSlot } from "@/types";
import { qrMatrixSync } from "@/lib/qr";
import { DeliveryService } from "@/lib/delivery";

/**
 * Composites guest photos into a designed template: the finished design is drawn
 * first, then each captured photo is cover-fit into its slot rectangle on top.
 * The design's art/text lives in the margins around the slots, so it stays
 * visible. Output is the full landscape design as a JPEG data URL.
 */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Draws `img` to fill (x,y,w,h), cropping overflow — same as the receipt. */
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

interface TemplateComposeOpts {
  template: EventTemplate;
  photos: CapturedPhoto[];
  /** CSS filter baked into the photos (not the design). */
  filterCss?: string;
  /** Session code the QR links to (a placeholder is used if omitted). */
  code?: string;
}

function slotRect(s: TemplateSlot, W: number, H: number) {
  return { x: s.x * W, y: s.y * H, w: s.w * W, h: s.h * H };
}

/** Draws the "MAD SHOTS" wordmark fit inside the brand slot. */
function drawBrand(ctx: CanvasRenderingContext2D, s: TemplateSlot, W: number, H: number) {
  const r = slotRect(s, W, H);
  const tracked = "MAD SHOTS".split("").join(" ");
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#4a3a44";
  let px = r.h * 0.62;
  const font = (p: number) => `800 ${p}px ui-monospace, "SF Mono", monospace`;
  ctx.font = font(px);
  while (ctx.measureText(tracked).width > r.w * 0.94 && px > 6) {
    px -= 1;
    ctx.font = font(px);
  }
  ctx.fillText(tracked, r.x + r.w / 2, r.y + r.h / 2);
  ctx.restore();
}

/** Draws the QR (square, centred) inside the QR slot with a white quiet zone. */
function drawQr(ctx: CanvasRenderingContext2D, s: TemplateSlot, W: number, H: number, code: string) {
  const r = slotRect(s, W, H);
  const side = Math.min(r.w, r.h);
  const bx = r.x + (r.w - side) / 2;
  const by = r.y + (r.h - side) / 2;
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(bx, by, side, side);
  const pad = side * 0.08;
  const inner = side - pad * 2;
  const matrix = qrMatrixSync(DeliveryService.linkFor(code));
  const n = matrix.length;
  const cell = inner / n;
  ctx.fillStyle = "#111111";
  for (let row = 0; row < n; row++)
    for (let col = 0; col < n; col++)
      if (matrix[row][col])
        ctx.fillRect(bx + pad + col * cell, by + pad + row * cell, cell + 0.6, cell + 0.6);
  ctx.restore();
}

/** Renders the designed template with the guest photos dropped into its slots. */
export async function composeTemplate(
  opts: TemplateComposeOpts,
): Promise<string> {
  const { template, photos, filterCss, code } = opts;
  const bg = await loadImage(template.image);
  const W = bg.naturalWidth || 1280;
  const H = bg.naturalHeight || Math.round(W / (template.aspect || 1.5));

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // White base in case the design has transparency, then the design itself.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(bg, 0, 0, W, H);

  // Photos on top, one per slot, cover-fit and clipped to the slot rect.
  const imgs = await Promise.all(
    photos.map((p) => loadImage(p.dataUrl).catch(() => null)),
  );
  for (let i = 0; i < template.slots.length; i++) {
    const s = template.slots[i];
    const img = imgs[i];
    if (!img) continue;
    const x = s.x * W;
    const y = s.y * H;
    const w = s.w * W;
    const h = s.h * H;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.filter = filterCss && filterCss !== "none" ? filterCss : "none";
    drawCover(ctx, img, x, y, w, h);
    ctx.filter = "none";
    ctx.restore();
  }

  // Branding + QR — reserved in every template, positionable per template.
  if (template.brandSlot) drawBrand(ctx, template.brandSlot, W, H);
  if (template.qrSlot) drawQr(ctx, template.qrSlot, W, H, code ?? "PREVIEW");

  return canvas.toDataURL("image/jpeg", 0.9);
}
