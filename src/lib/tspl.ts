/**
 * TSPL command encoding — the TSC label language (Munbyn RW403B, TSC, Xprinter
 * label models, and most "4×6 shipping label" printers).
 *
 * TSPL is *not* ESC/POS. That matters
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

const ascii = new TextEncoder();

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
 * The bitmap is centred on the stock in both axes. Vertical centring only kicks
 * in when the raster is shorter than the label — a strip printed in "fill the
 * width" mode can be taller than one label, and that must stay pinned to the top
 * so it loses its tail rather than being cropped at both ends.
 */
export function tsplImageJob(bm: Bitmap1, o: JobOpts): Uint8Array {
  const headDots = mmToDots(o.stock.widthMm);
  const tallDots = mmToDots(o.stock.heightMm);
  // BITMAP's x offset is in *bytes*, not dots — a hard-won detail. Anything
  // else silently shifts the image by up to 7 dots.
  const xBytes = Math.max(0, Math.floor((headDots - bm.width) / 2 / 8));
  // y is in dots, so this one centres exactly.
  const y = Math.max(0, Math.round((tallDots - bm.height) / 2));

  const raster = o.invertRaster ?? true ? invert(bm.data) : bm.data;

  return concat([
    preamble(o).join("\r\n") + "\r\n",
    `BITMAP ${xBytes},${y},${bm.bytesPerRow},${bm.height},0,`,
    raster,
    `\r\nPRINT ${clampInt(o.copies, 1, 9)},1\r\n`,
  ]);
}

function invert(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ 0xff;
  return out;
}
