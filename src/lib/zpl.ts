import type { Bitmap1 } from "@/lib/dither";
import { mmToDots, type JobOpts } from "@/lib/tspl";

/**
 * ZPL command encoding — Zebra's label language, also spoken by the RW403B
 * (its self-test reports `PCL: ZPL or TSPL`) and most other label printers.
 *
 * Two differences from `tspl.ts` matter:
 *
 * 1. **Polarity is the intuitive way round.** In ZPL's `^GF` a set bit is a black
 *    dot, so `Bitmap1` goes out as-is — no inversion, and no `invertRaster` knob.
 * 2. **The raster travels as ASCII hex**, which doubles the payload. Fine over
 *    USB; noticeably slower over Bluetooth.
 *
 * Geometry helpers are shared with `tspl.ts` — dots, millimetres and label stock
 * are properties of the printer, not of either language.
 */

/** ZPL darkness runs 0–30; the shared `density` setting runs 0–15. */
function darkness(density: number): number {
  return Math.min(30, Math.max(0, Math.round(density * 2)));
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(v)));
}

const ascii = new TextEncoder();

/**
 * Label setup shared by every job.
 *
 * `^MNY` asks for gap ("web") sensing and `^MNN` for continuous stock — the same
 * distinction TSPL's `GAP` makes, and just as important: sensing a gap that isn't
 * there makes the printer feed and hunt.
 */
function preamble(o: JobOpts): string[] {
  return [
    "^XA",
    "^LH0,0",
    `^PW${mmToDots(o.stock.widthMm)}`,
    `^LL${mmToDots(o.stock.heightMm)}`,
    o.stock.gapMm > 0 ? "^MNY" : "^MNN",
    `^MD${darkness(o.density)}`,
    `^PR${clampInt(o.speed, 1, 6)}`,
  ];
}

/** Uppercase hex, which is what `^GFA` expects. */
function toHex(data: Uint8Array): string {
  let out = "";
  for (let i = 0; i < data.length; i++)
    out += data[i].toString(16).padStart(2, "0").toUpperCase();
  return out;
}

/**
 * A full image job.
 *
 * `^GFA,<bytes>,<bytes>,<bytesPerRow>,<hex>` — the first two counts are equal for
 * uncompressed data. Placement is in dots (not bytes, as TSPL insists), so the
 * bitmap can be centred exactly rather than to the nearest 8 dots.
 */
export function zplImageJob(bm: Bitmap1, o: JobOpts): Uint8Array {
  const headDots = mmToDots(o.stock.widthMm);
  const tallDots = mmToDots(o.stock.heightMm);
  const x = Math.max(0, Math.round((headDots - bm.width) / 2));
  // Only centre vertically when it fits; a longer strip stays pinned to the top
  // so it loses its tail rather than being cropped at both ends.
  const y = Math.max(0, Math.round((tallDots - bm.height) / 2));
  const total = bm.bytesPerRow * bm.height;

  return ascii.encode(
    [
      ...preamble(o),
      // Origin, graphic and terminator on one line with no break anywhere inside
      // the hex. Parsers do generally skip CR/LF within `^GFA` data, but there's
      // no reason to lean on that when the canonical form is unambiguous.
      `^FO${x},${y}^GFA,${total},${total},${bm.bytesPerRow},${toHex(bm.data)}^FS`,
      `^PQ${clampInt(o.copies, 1, 9)}`,
      "^XZ",
    ].join("\r\n") + "\r\n",
  );
}
