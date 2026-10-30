import type { PrintFit, PrintRotate } from "./types";

/**
 * Lays a composite out on a page of paper. Every printer goes through this —
 * IPP, the print dialog and thermal alike — so the Admin preview, a test print
 * and a guest's print are all the same picture.
 */
export interface PageSpec {
  widthPx: number;
  /** 0 for a continuous roll: the page is as tall as the photo needs. */
  heightPx: number;
  marginPx: number;
  /** "fit" letterboxes on white; "fill" covers the page and crops the overflow. */
  fit: PrintFit;
  /** "auto" turns the photo a quarter when that uses more of the page. */
  rotate: PrintRotate;
  /**
   * Two copies side by side — the classic photo booth trick of printing a pair
   * of 2×6 strips on one 4×6 sheet and cutting it down the middle.
   */
  twoUp: boolean;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("The photo couldn't be loaded for printing"));
    img.src = src;
  });
}

interface Slot {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Fraction of the slot the image covers when contained in it. */
function coverage(imgW: number, imgH: number, slot: Slot): number {
  const s = Math.min(slot.w / imgW, slot.h / imgH);
  return (imgW * s * imgH * s) / (slot.w * slot.h);
}

export async function renderPage(
  src: string,
  spec: PageSpec,
): Promise<HTMLCanvasElement> {
  const img = await loadImage(src);
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const m = Math.max(0, Math.round(spec.marginPx));
  const W = Math.round(spec.widthPx);
  const continuous = spec.heightPx <= 0;
  const cols = spec.twoUp ? 2 : 1;
  const slotW = (W - m * 2) / cols;

  // A roll grows to fit the photo; no rotation, since the width is the head's.
  let quarter = false;
  let H = Math.round(spec.heightPx);
  if (continuous) {
    H = Math.round(ih * (slotW / iw)) + m * 2;
  } else {
    const slot: Slot = { x: 0, y: 0, w: slotW, h: H - m * 2 };
    if (spec.rotate === 90) quarter = true;
    else if (spec.rotate === "auto") {
      // "fit": whichever way round covers more. "fill": whichever crops less,
      // which is the same comparison.
      quarter = coverage(ih, iw, slot) > coverage(iw, ih, slot) + 0.02;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable — cannot lay out the print");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Dimensions of the photo as it will sit on the page.
  const pw = quarter ? ih : iw;
  const ph = quarter ? iw : ih;

  for (let c = 0; c < cols; c++) {
    const slot: Slot = { x: m + c * slotW, y: m, w: slotW, h: H - m * 2 };
    const scale =
      spec.fit === "fill" && !continuous
        ? Math.max(slot.w / pw, slot.h / ph)
        : Math.min(slot.w / pw, slot.h / ph);
    const dw = pw * scale;
    const dh = ph * scale;

    ctx.save();
    ctx.beginPath();
    ctx.rect(slot.x, slot.y, slot.w, slot.h);
    ctx.clip();
    ctx.translate(slot.x + slot.w / 2, slot.y + slot.h / 2);
    if (quarter) ctx.rotate(Math.PI / 2);
    // Drawn in the image's own (unrotated) frame, centred on the slot.
    const w = quarter ? dh : dw;
    const h = quarter ? dw : dh;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  return canvas;
}

/** A test page: border, label, colour bars and a grey ramp. */
export function testPage(
  title: string,
  lines: string[],
  aspect = 2 / 3,
): string {
  const W = 1200;
  const H = Math.round(W / aspect);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 12;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  ctx.fillStyle = "#000";
  ctx.font = "bold 96px sans-serif";
  ctx.fillText(title, 80, 200);
  ctx.font = "44px sans-serif";
  lines.forEach((l, i) => ctx.fillText(l, 80, 290 + i * 62));

  const top = 290 + lines.length * 62 + 40;
  const colors = [
    "#ff2d55",
    "#ff9500",
    "#ffcc00",
    "#34c759",
    "#007aff",
    "#af52de",
  ];
  const bw = (W - 160) / colors.length;
  colors.forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.fillRect(80 + i * bw, top, bw, 140);
  });
  for (let i = 0; i < 10; i++) {
    const v = Math.round((i / 9) * 255);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(80 + i * ((W - 160) / 10), top + 170, (W - 160) / 10, 140);
  }
  return c.toDataURL("image/png");
}
