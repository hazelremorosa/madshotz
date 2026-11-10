import { decompressFrames, parseGIF } from "gifuct-js";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { cropHeight, type CoverCrop } from "@/assets/covers";

/**
 * Cuts `crop` out of a GIF and returns a new, smaller GIF.
 *
 * Decodes every frame, composites it the way a browser would (GIFs store only
 * the changed patch, plus a disposal rule for what to do before the next
 * frame), copies out the crop region, and re-encodes it. Frame timing and
 * looping are kept. Runs on the main thread — a cover is ~30 small frames, so
 * it takes a couple of seconds — and yields between frames so the dialog's
 * "Cropping…" state keeps painting.
 */
export async function cropGif(url: string, crop: CoverCrop): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Couldn't read the cover");
  const gif = parseGIF(await res.arrayBuffer());
  const frames = decompressFrames(gif, true);
  if (frames.length === 0) throw new Error("That cover has no frames");

  const W = gif.lsd.width;
  const H = gif.lsd.height;
  // Even pixel sizes, kept inside the picture.
  const cw = Math.max(2, Math.min(W, Math.round(crop.w * W)));
  const ch = Math.max(2, Math.min(H, Math.round(cropHeight(crop.w) * H)));
  const x0 = Math.max(0, Math.min(W - cw, Math.round(crop.l * W)));
  const y0 = Math.max(0, Math.min(H - ch, Math.round(crop.t * H)));

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const patchCanvas = document.createElement("canvas");
  const patchCtx = patchCanvas.getContext("2d");
  if (!ctx || !patchCtx) throw new Error("Cropping isn't supported here");

  const enc = GIFEncoder();
  let restore: ImageData | null = null;
  let prev: (typeof frames)[number] | null = null;

  for (const f of frames) {
    // Undo the previous frame as its disposal rule says, before drawing this one.
    if (prev) {
      const d = prev.dims;
      if (prev.disposalType === 2) ctx.clearRect(d.left, d.top, d.width, d.height);
      else if (prev.disposalType === 3 && restore) ctx.putImageData(restore, 0, 0);
    }
    restore = f.disposalType === 3 ? ctx.getImageData(0, 0, W, H) : null;

    patchCanvas.width = f.dims.width;
    patchCanvas.height = f.dims.height;
    patchCtx.putImageData(new ImageData(new Uint8ClampedArray(f.patch), f.dims.width, f.dims.height), 0, 0);
    ctx.drawImage(patchCanvas, f.dims.left, f.dims.top);

    const rgba = ctx.getImageData(x0, y0, cw, ch).data;
    const palette = quantize(rgba, 256);
    enc.writeFrame(applyPalette(rgba, palette), cw, ch, {
      palette,
      delay: Math.max(20, f.delay || 70),
    });
    prev = f;
    await new Promise((r) => setTimeout(r));
  }
  enc.finish();
  return new Blob([new Uint8Array(enc.bytes())], { type: "image/gif" });
}
