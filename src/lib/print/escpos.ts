import type { Bitmap1 } from "@/lib/dither";

/**
 * ESC/POS raster encoding — the language of nearly every receipt printer
 * (Epson TM, Xprinter, Rongta, Goojprt, the 58/80 mm Bluetooth ones…).
 *
 * The image goes out as `GS v 0` raster bands. A set bit is a black dot, which
 * matches `Bitmap1`, so no inversion is needed (unlike TSPL).
 */

export interface EscPosOpts {
  copies: number;
  /** Feed and cut after each copy, on printers with a cutter. */
  cut: boolean;
}

/**
 * Rows per `GS v 0` band. The command allows far more, but cheap heads have
 * small buffers and silently drop a band that overflows them; 128 rows is a
 * size every printer in this class accepts.
 */
const BAND = 128;

export function escposImageJob(bm: Bitmap1, o: EscPosOpts): Uint8Array {
  const bands = Math.ceil(bm.height / BAND);
  const tail = o.cut ? 7 : 3;
  // Per copy: centre (3) + per band header (8) + raster + feed/cut.
  const bodyLen = 3 + bands * 8 + bm.bytesPerRow * bm.height + tail;
  const body = new Uint8Array(bodyLen);
  let at = 0;
  const put = (...b: number[]) => {
    body.set(b, at);
    at += b.length;
  };

  put(0x1b, 0x61, 0x01); // ESC a 1 — centre
  for (let y = 0; y < bm.height; y += BAND) {
    const rows = Math.min(BAND, bm.height - y);
    put(0x1d, 0x76, 0x30, 0x00); // GS v 0, normal density
    put(
      bm.bytesPerRow & 0xff,
      (bm.bytesPerRow >> 8) & 0xff,
      rows & 0xff,
      (rows >> 8) & 0xff,
    );
    const start = y * bm.bytesPerRow;
    body.set(bm.data.subarray(start, start + rows * bm.bytesPerRow), at);
    at += rows * bm.bytesPerRow;
  }
  put(0x1b, 0x64, 0x04); // ESC d 4 — feed past the tear bar
  if (o.cut) put(0x1d, 0x56, 0x42, 0x00); // GS V 66 0 — feed and partial cut

  const copies = Math.max(1, Math.min(9, Math.round(o.copies)));
  const out = new Uint8Array(2 + bodyLen * copies);
  out.set([0x1b, 0x40]); // ESC @ — reset
  for (let c = 0; c < copies; c++) out.set(body, 2 + c * bodyLen);
  return out;
}
