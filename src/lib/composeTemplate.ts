import type { CapturedPhoto, EventTemplate } from "@/types";

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
}

/** Renders the designed template with the guest photos dropped into its slots. */
export async function composeTemplate(
  opts: TemplateComposeOpts,
): Promise<string> {
  const { template, photos, filterCss } = opts;
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

  return canvas.toDataURL("image/jpeg", 0.9);
}
