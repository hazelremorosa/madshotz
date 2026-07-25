/**
 * Turning a full-colour composite into something a thermal printer can burn.
 *
 * The Munbyn RealWriter 403B is a *direct thermal* head: every dot is either
 * burned black or left as bare paper. There is no ink, no grey, no colour. So
 * the colour composite has to become a 1-bit bitmap, and the only way a photo
 * survives that is halftoning — trading spatial resolution for apparent tone.
 *
 * At 203 dpi a 4" label is 812 dots across, so the halftone is coarse and very
 * sensitive to exposure. That's why brightness/contrast/threshold are host
 * settings rather than constants: the same photo that looks right on one paper
 * stock comes out as mud on another, and there's no way to guess in advance.
 */

/** How tone is approximated with black-or-nothing dots. */
export type DitherMode = "floyd" | "bayer" | "threshold";

export const DITHER_MODES: { id: DitherMode; label: string; hint: string }[] = [
  {
    id: "floyd",
    label: "Photo",
    hint: "Floyd–Steinberg — smoothest gradients, best for faces.",
  },
  {
    id: "bayer",
    label: "Newsprint",
    hint: "Ordered 8×8 — a visible crosshatch, deliberately retro.",
  },
  {
    id: "threshold",
    label: "Hard",
    hint: "Pure black/white cut — for line art and text-only labels.",
  },
];

/**
 * A packed monochrome bitmap. One bit per dot, MSB first, rows padded to whole
 * bytes.
 *
 * Convention here: **a set bit means a black dot.** That's the intuitive
 * reading, and it is deliberately the opposite of what TSPL's BITMAP command
 * wants — `tspl.ts` owns that inversion so the polarity quirk lives in exactly
 * one place.
 */
export interface Bitmap1 {
  /** Width in dots. */
  width: number;
  /** Height in dots. */
  height: number;
  /** `ceil(width / 8)` — the stride TSPL calls "width in bytes". */
  bytesPerRow: number;
  /** `bytesPerRow * height` bytes, row-major. */
  data: Uint8Array;
}

export interface DitherOpts {
  /** Target width in dots (e.g. 812 for a 4" label at 203 dpi). */
  widthDots: number;
  /**
   * Target height in dots. Omit to keep the source aspect ratio — the usual
   * case, since a photo strip should not be squashed to fit the stock.
   */
  heightDots?: number;
  mode: DitherMode;
  /** Cut point for "threshold" mode, and the bias for the dithered modes. 0–255. */
  threshold: number;
  /**
   * −100…100, applied as a flat offset before thresholding.
   *
   * Defaults to 0 deliberately. Any positive bias here is dangerous: the receipt
   * is mostly white paper with thin dark text, and downscaling to dot resolution
   * already blends those strokes toward grey. Lifting brightness on top of that
   * pushes them past the cut and the label comes out blank. Darkening is a job
   * for DENSITY (how hard the head burns), not for the raster.
   */
  brightness: number;
  /** −100…100. Photos need a push here to survive halftoning. */
  contrast: number;
  /** Swap black and white — for white-on-black designs. */
  invert?: boolean;
}

export const DITHER_DEFAULTS: DitherOpts = {
  widthDots: 812,
  mode: "floyd",
  threshold: 128,
  brightness: 0,
  contrast: 25,
  invert: false,
};

/** 8×8 Bayer matrix, values 0…63. */
const BAYER_8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the image to print"));
    img.src = src;
  });
}

/**
 * Luminance, brightness/contrast applied, as a 0…255 float per pixel.
 *
 * Kept as floats because Floyd–Steinberg pushes quantisation error into
 * neighbours and clamping that to bytes mid-diffusion visibly bands the result.
 */
function toGrayscale(
  px: Uint8ClampedArray,
  n: number,
  brightness: number,
  contrast: number,
): Float32Array {
  const gray = new Float32Array(n);
  // Standard contrast curve around mid-grey; brightness is a flat offset.
  const c = 1 + contrast / 100;
  const b = (brightness / 100) * 255;

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const a = px[o + 3] / 255;
    // Composite against white — unset pixels are bare paper, not black.
    const r = px[o] * a + 255 * (1 - a);
    const g = px[o + 1] * a + 255 * (1 - a);
    const bl = px[o + 2] * a + 255 * (1 - a);
    const lum = 0.299 * r + 0.587 * g + 0.114 * bl;
    // Clamped to a real pixel range, which matters more than it looks:
    // Floyd–Steinberg diffuses `value - quantised` into its neighbours, so an
    // unclamped 297-from-white would inject +42 of error per pixel across every
    // white region and progressively bury the dark text under it. Left
    // unclamped, a mostly-white receipt dithers to a completely blank label.
    gray[i] = Math.min(255, Math.max(0, (lum - 128) * c + 128 + b));
  }
  return gray;
}

/**
 * Natural pixel size of an image source.
 *
 * The print layer needs this *before* rasterising so it can work out a dot size
 * that fits the label without distorting the strip — `imageToBitmap1` stretches
 * to whatever size it is given, so aspect has to be settled beforehand.
 */
export async function imageSize(
  src: string,
): Promise<{ width: number; height: number }> {
  const img = await loadImage(src);
  return {
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
  };
}

/** Allocates an all-white bitmap of the given dot size. */
function blankBitmap(width: number, height: number): Bitmap1 {
  const bytesPerRow = Math.ceil(width / 8);
  return {
    width,
    height,
    bytesPerRow,
    data: new Uint8Array(bytesPerRow * height),
  };
}

/** Sets the bit at (x, y) — i.e. marks that dot to be burned black. */
function setBlack(bm: Bitmap1, x: number, y: number) {
  const byte = y * bm.bytesPerRow + (x >> 3);
  bm.data[byte] |= 0x80 >> (x & 7);
}

/**
 * Renders an image to a 1-bit bitmap at printer resolution.
 *
 * The source is drawn to an offscreen canvas at exactly the dot size first, so
 * the browser's own (good) downscaler does the resampling and the dither only
 * ever sees final-size pixels. Dithering *then* scaling would destroy the
 * halftone pattern.
 */
export async function imageToBitmap1(
  src: string,
  opts: DitherOpts,
): Promise<Bitmap1> {
  const img = await loadImage(src);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  const width = Math.max(8, Math.round(opts.widthDots));
  const height = Math.max(
    8,
    Math.round(opts.heightDots ?? width * (srcH / (srcW || 1))),
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable — cannot rasterise for print");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // White ground: anything the image doesn't cover must stay unburned.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const { data: px } = ctx.getImageData(0, 0, width, height);
  const n = width * height;
  const gray = toGrayscale(px, n, opts.brightness, opts.contrast);
  const bm = blankBitmap(width, height);
  const cut = opts.threshold;
  const dark = (v: number) => (opts.invert ? v >= cut : v < cut);

  if (opts.mode === "threshold") {
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (dark(gray[y * width + x])) setBlack(bm, x, y);
    return bm;
  }

  if (opts.mode === "bayer") {
    for (let y = 0; y < height; y++) {
      const row = BAYER_8[y & 7];
      for (let x = 0; x < width; x++) {
        // Nudge the cut point per-pixel by the matrix, ±~half a step.
        const bias = (row[x & 7] / 64 - 0.5) * 255 * 0.6;
        const v = gray[y * width + x];
        if (opts.invert ? v - bias >= cut : v + bias < cut) setBlack(bm, x, y);
      }
    }
    return bm;
  }

  // Floyd–Steinberg. Error is pushed right and down with the classic
  // 7/16, 3/16, 5/16, 1/16 kernel, serpentine-free for predictability.
  const shift = cut - 128; // let the threshold slider bias exposure here too
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = gray[i] - shift;
      const black = old < 128;
      if (opts.invert ? !black : black) setBlack(bm, x, y);
      const err = old - (black ? 0 : 255);

      if (x + 1 < width) gray[i + 1] += (err * 7) / 16;
      if (y + 1 < height) {
        const below = i + width;
        if (x > 0) gray[below - 1] += (err * 3) / 16;
        gray[below] += (err * 5) / 16;
        if (x + 1 < width) gray[below + 1] += (err * 1) / 16;
      }
    }
  }
  return bm;
}

/**
 * Renders a bitmap back to a PNG data URL, one dot per pixel.
 *
 * This is what makes the feature commissionable without hardware: the host sees
 * the actual halftone on screen instead of discovering it a roll of labels
 * later. Displayed at natural size it looks like the print; scaled down the
 * browser blurs the dots into approximately the right tone, which is also fine.
 */
export function bitmap1ToDataUrl(bm: Bitmap1): string {
  const canvas = document.createElement("canvas");
  canvas.width = bm.width;
  canvas.height = bm.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const img = ctx.createImageData(bm.width, bm.height);
  for (let y = 0; y < bm.height; y++) {
    for (let x = 0; x < bm.width; x++) {
      const bit = bm.data[y * bm.bytesPerRow + (x >> 3)] & (0x80 >> (x & 7));
      const v = bit ? 0 : 255;
      const o = (y * bm.width + x) * 4;
      img.data[o] = v;
      img.data[o + 1] = v;
      img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Share of dots that will actually be burned — a rough "is this too dark?" gauge. */
export function inkCoverage(bm: Bitmap1): number {
  let bits = 0;
  for (let i = 0; i < bm.data.length; i++) {
    let b = bm.data[i];
    while (b) {
      bits += b & 1;
      b >>= 1;
    }
  }
  return bits / (bm.width * bm.height);
}
