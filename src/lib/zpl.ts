import type { Bitmap1 } from "@/lib/dither";
import { mmToDots, type JobOpts } from "@/lib/tspl";

/**
 * ZPL command encoding — the RW403B's other language.
 *
 * Its own self-test label reports `PCL: ZPL or TSPL`, so both are supported. This
 * exists because TSPL demonstrably produced nothing on real hardware while the
 * printer was otherwise proven healthy (it prints its own config label, FEED is
 * calibrated, and the vendor app prints), which makes the second language the
 * obvious thing to try rather than a hypothetical.
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

/** ZPL's built-in fonts are ASCII, and `^` and `~` are command introducers. */
function toAscii(text: string): string {
  return text
    .replace(/[♥♡]/g, "<3")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[–—]/g, "-")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/[\^~]/g, "-");
}

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

/**
 * A tiny text label for commissioning — a few hundred bytes, so it proves the
 * link and the geometry in about a second even over Bluetooth.
 */
export function zplTestJob(o: JobOpts, lines: string[]): Uint8Array {
  const headDots = mmToDots(o.stock.widthMm);
  const tallDots = mmToDots(o.stock.heightMm);
  const inset = mmToDots(3);

  const body: string[] = [
    ...preamble(o),
    // A border proves the printable area matches the declared stock.
    `^FO${inset},${inset}^GB${headDots - inset * 2},${tallDots - inset * 2},4^FS`,
  ];

  let y = inset + mmToDots(4);
  lines.forEach((line, i) => {
    const h = i === 0 ? 60 : 30;
    body.push(`^FO${inset + mmToDots(3)},${y}^A0N,${h},${h}^FD${toAscii(line)}^FS`);
    y += h + mmToDots(2);
  });

  body.push(`^PQ${clampInt(o.copies, 1, 9)}`, "^XZ");
  return ascii.encode(body.join("\r\n") + "\r\n");
}

/**
 * Probe payloads for ZPL.
 *
 * `~WC` is the decisive one: it tells the printer to print its **own**
 * configuration label. If that produces paper, ZPL is arriving and being parsed,
 * and switching the language setting is the whole fix. It uses none of our
 * geometry, so it can't be defeated by a wrong label size or gap.
 */
export function zplProbeBytes(id: "config" | "label"): Uint8Array {
  if (id === "config") return ascii.encode("~WC\r\n");
  return ascii.encode(
    "^XA^LH0,0^MNY^FO40,40^A0N,60,60^FDZPL TEST^FS^PQ1^XZ\r\n",
  );
}
