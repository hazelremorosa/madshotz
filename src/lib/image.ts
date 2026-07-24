/**
 * Turns a host-uploaded image file into a small, transparent PNG data URL ready
 * to store in settings (localStorage) and drop onto the receipt — either as a
 * sticker/prop or as a full-receipt frame overlay.
 *
 * We downscale to a modest max dimension and re-encode as PNG so transparency is
 * preserved and the persisted settings blob stays well under the localStorage
 * quota even with a full tray of custom props/frames.
 */

/** Longest edge a stored custom sticker is scaled down to. */
export const STICKER_MAX_DIM = 256;

/** Frame overlays cover the whole receipt, so they keep a bit more detail. */
export const FRAME_MAX_DIM = 800;

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = src;
  });
}

/** A feature photo (couple/celebrant) — a photo, so JPEG keeps it small. */
export const PHOTO_MAX_DIM = 520;

async function downscale(
  file: File,
  maxDim: number,
  render: (canvas: HTMLCanvasElement) => string,
): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Not an image");
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImg(objectUrl);
    const longest = Math.max(img.width, img.height) || 1;
    const scale = Math.min(1, maxDim / longest);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(img, 0, 0, w, h);
    return render(canvas);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Reads an image File and returns a downscaled PNG data URL (keeps alpha). */
export function fileToPngDataUrl(
  file: File,
  maxDim = STICKER_MAX_DIM,
): Promise<string> {
  return downscale(file, maxDim, (c) => c.toDataURL("image/png"));
}

/** Reads a photo File and returns a downscaled JPEG data URL (small). */
export function fileToJpegDataUrl(
  file: File,
  maxDim = PHOTO_MAX_DIM,
): Promise<string> {
  return downscale(file, maxDim, (c) => c.toDataURL("image/jpeg", 0.85));
}

/** Longest edge a designed template is scaled down to (keeps text crisp). */
export const TEMPLATE_MAX_DIM = 1280;

/**
 * Reads a designed template File and returns a downscaled data URL, keeping PNG
 * (so transparent slots survive) and using JPEG for everything else. Also
 * reports the natural aspect ratio so slots can be positioned against it.
 */
export async function fileToTemplate(
  file: File,
  maxDim = TEMPLATE_MAX_DIM,
): Promise<{ url: string; aspect: number }> {
  if (!file.type.startsWith("image/")) throw new Error("Not an image");
  const png = file.type === "image/png";
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImg(objectUrl);
    const longest = Math.max(img.width, img.height) || 1;
    const scale = Math.min(1, maxDim / longest);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(img, 0, 0, w, h);
    const url = png
      ? canvas.toDataURL("image/png")
      : canvas.toDataURL("image/jpeg", 0.9);
    return { url, aspect: w / h };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
