/**
 * TSPL command encoding for the Munbyn RealWriter 403B.
 *
 * The 403B speaks **TSPL** (the TSC label language), *not* ESC/POS. That matters
 * a lot: ESC/POS is the receipt-printer language every "web thermal printing"
 * snippet on the internet uses, and none of it will work here. TSPL is
 * line-oriented ASCII — one command per line, CRLF-terminated — with `BITMAP`
 * taking a raw binary payload inline after its header.
 *
 * A minimal job looks like:
 *
 *     SIZE 101.6 mm,152.4 mm
 *     GAP 3 mm,0 mm
 *     DIRECTION 1,0
 *     REFERENCE 0,0
 *     DENSITY 8
 *     SPEED 4
 *     CLS
 *     BITMAP 0,0,102,1218,0,<binary>
 *     PRINT 1,1
 */

import type { Bitmap1 } from "@/lib/dither";

/** Native resolution of the RW403B print head. */
export const PRINTER_DPI = 203;

const MM_PER_INCH = 25.4;

/** Millimetres → printer dots at 203 dpi. */
export function mmToDots(mm: number, dpi = PRINTER_DPI): number {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

/** Printer dots → millimetres. */
export function dotsToMm(dots: number, dpi = PRINTER_DPI): number {
  return (dots / dpi) * MM_PER_INCH;
}

/** A roll of stock the host has loaded. */
export interface LabelStock {
  /** Label width in mm. The 403B head covers roughly 40–108 mm. */
  widthMm: number;
  /** Label height (feed direction) in mm. */
  heightMm: number;
  /**
   * Gap between die-cut labels in mm, or 0 for continuous stock.
   * Getting this wrong is the usual cause of "it feeds a blank label every
   * time" — the printer hunts for a gap that isn't there.
   */
  gapMm: number;
}

/** Stock sizes worth one tap, including the two that fit our layouts. */
export const LABEL_PRESETS: {
  id: string;
  label: string;
  hint: string;
  stock: LabelStock;
}[] = [
  {
    id: "4x6",
    label: '4 × 6"',
    hint: "The standard shipping label the printer ships with.",
    stock: { widthMm: 101.6, heightMm: 152.4, gapMm: 3 },
  },
  {
    id: "2x6",
    label: '2 × 6"',
    hint: "Classic photobooth strip — matches the Quad layout exactly.",
    stock: { widthMm: 50.8, heightMm: 152.4, gapMm: 3 },
  },
  {
    id: "3x2",
    label: '3 × 2"',
    hint: "Small product label — fits the Single layout.",
    stock: { widthMm: 76.2, heightMm: 50.8, gapMm: 3 },
  },
  {
    id: "cont80",
    label: "80 mm continuous",
    hint: "Gapless roll — the printer cuts nothing, so length is up to you.",
    stock: { widthMm: 80, heightMm: 150, gapMm: 0 },
  },
];

export interface JobOpts {
  stock: LabelStock;
  /** Burn intensity, 0–15. Higher = darker but slower and shorter head life. */
  density: number;
  /** Feed speed in inches/sec, 1–6 on this class of head. */
  speed: number;
  /** How many identical labels to print. */
  copies: number;
  /**
   * TSPL's `BITMAP` treats a **clear** bit as a dot to burn, which is the
   * opposite of `Bitmap1`'s "set bit = black". So the raster is inverted on the
   * way out by default.
   *
   * This is exposed rather than hardcoded because it is the single most likely
   * thing to be wrong on first contact with real hardware: if the very first
   * test print comes out as a photographic negative, flip this and nothing else.
   */
  invertRaster?: boolean;
}

export const JOB_DEFAULTS: Omit<JobOpts, "stock"> = {
  density: 8,
  speed: 4,
  copies: 1,
  invertRaster: true,
};

const ascii = new TextEncoder();

/**
 * TSPL has no string escaping to speak of, and the built-in fonts are ASCII
 * only — a stray "♥" would arrive as multi-byte UTF-8 and print as garbage.
 */
function toAscii(text: string): string {
  return text
    .replace(/[♥♡]/g, "<3")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/"/g, "'");
}

/** Joins ASCII lines and binary blobs into one buffer to hand the transport. */
function concat(parts: (string | Uint8Array)[]): Uint8Array {
  const bufs = parts.map((p) => (typeof p === "string" ? ascii.encode(p) : p));
  const total = bufs.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const b of bufs) {
    out.set(b, at);
    at += b.length;
  }
  return out;
}

/** One decimal is plenty — TSPL parses `101.6 mm` happily. */
const mm = (v: number) => `${Math.round(v * 10) / 10} mm`;

/**
 * The per-job preamble. Sent before every job rather than once at connect time,
 * because a label printer can be power-cycled or shared and must never inherit
 * geometry from whatever printed last.
 */
function preamble(o: JobOpts): string[] {
  return [
    `SIZE ${mm(o.stock.widthMm)},${mm(o.stock.heightMm)}`,
    // Continuous stock has no gap to detect, and asking for one makes the
    // printer feed and hunt.
    o.stock.gapMm > 0 ? `GAP ${mm(o.stock.gapMm)},${mm(0)}` : "GAP 0 mm,0 mm",
    "DIRECTION 1,0",
    "REFERENCE 0,0",
    `DENSITY ${clampInt(o.density, 0, 15)}`,
    `SPEED ${clampInt(o.speed, 1, 6)}`,
    "CLS",
  ];
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(v)));
}

/**
 * Encodes a full image job: geometry, then the raster, then PRINT.
 *
 * The bitmap is centred horizontally on the stock. Vertical placement is top-
 * aligned, since a photo strip taller than the label should lose its tail rather
 * than be silently cropped at both ends.
 */
export function tsplImageJob(bm: Bitmap1, o: JobOpts): Uint8Array {
  const headDots = mmToDots(o.stock.widthMm);
  // BITMAP's x offset is in *bytes*, not dots — a hard-won detail. Anything
  // else silently shifts the image by up to 7 dots.
  const xBytes = Math.max(0, Math.floor((headDots - bm.width) / 2 / 8));

  const raster = o.invertRaster ?? true ? invert(bm.data) : bm.data;

  return concat([
    preamble(o).join("\r\n") + "\r\n",
    `BITMAP ${xBytes},0,${bm.bytesPerRow},${bm.height},0,`,
    raster,
    `\r\nPRINT ${clampInt(o.copies, 1, 9)},1\r\n`,
  ]);
}

function invert(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ 0xff;
  return out;
}

/**
 * A tiny text-and-boxes label for commissioning.
 *
 * Deliberately not an image: it is a few hundred bytes rather than ~120 KB, so
 * it proves the connection and the stock geometry in about a second even over
 * Bluetooth. If this prints and a photo doesn't, the problem is the raster path,
 * not the link.
 */
export function tsplTestJob(o: JobOpts, lines: string[]): Uint8Array {
  const headDots = mmToDots(o.stock.widthMm);
  const tallDots = mmToDots(o.stock.heightMm);
  const inset = mmToDots(3);

  const body: string[] = [
    ...preamble(o),
    // A border proves the printable area matches the stock the host declared.
    `BOX ${inset},${inset},${headDots - inset},${tallDots - inset},4`,
  ];

  let y = inset + mmToDots(5);
  lines.forEach((line, i) => {
    // Font "3" is a legible built-in bitmap face; the first line prints double
    // size as a headline.
    const scale = i === 0 ? 2 : 1;
    body.push(
      `TEXT ${inset + mmToDots(3)},${y},"3",0,${scale},${scale},"${toAscii(line)}"`,
    );
    y += mmToDots(i === 0 ? 9 : 5);
  });

  // A greyscale ladder: the fastest way to find the right DENSITY for a stock.
  const swatchY = Math.min(y + mmToDots(4), tallDots - inset - mmToDots(12));
  const swatchW = Math.floor((headDots - inset * 2 - mmToDots(6)) / 6);
  for (let i = 0; i < 6; i++) {
    const bx = inset + mmToDots(3) + i * (swatchW + mmToDots(1));
    // Progressively taller bars read as a coarse density ramp on paper.
    body.push(`BAR ${bx},${swatchY},${swatchW},${mmToDots(2 + i)}`);
  }

  body.push(`PRINT ${clampInt(o.copies, 1, 9)},1`);
  return concat([body.join("\r\n") + "\r\n"]);
}

/**
 * How wide, in dots, the raster should be rendered for a given stock — i.e. the
 * number to hand `imageToBitmap1` as `widthDots`.
 *
 * Clamped to whole bytes because TSPL positions bitmaps on byte boundaries, and
 * to the head width because dots past it are simply dropped.
 */
export function rasterWidthForStock(stock: LabelStock, marginMm = 2): number {
  const usable = Math.max(8, stock.widthMm - marginMm * 2);
  return Math.floor(mmToDots(usable) / 8) * 8;
}

/** Dot height available on the stock, for fitting a whole design onto one label. */
export function rasterHeightForStock(stock: LabelStock, marginMm = 2): number {
  return Math.max(8, mmToDots(Math.max(4, stock.heightMm - marginMm * 2)));
}
