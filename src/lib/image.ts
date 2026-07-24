/**
 * Turns a host-uploaded image file into a small, transparent PNG data URL ready
 * to store in settings (localStorage) and drop onto the receipt as a sticker.
 *
 * We downscale to a modest max dimension and re-encode as PNG so transparency is
 * preserved and the persisted settings blob stays well under the localStorage
 * quota even with a full tray of custom props.
 */

/** Longest edge a stored custom sticker is scaled down to. */
export const STICKER_MAX_DIM = 256;

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = src;
  });
}

/** Reads an image File and returns a downscaled PNG data URL (keeps alpha). */
export async function fileToStickerUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Not an image");
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImg(objectUrl);
    const longest = Math.max(img.width, img.height) || 1;
    const scale = Math.min(1, STICKER_MAX_DIM / longest);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
