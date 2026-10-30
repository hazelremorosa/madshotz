import { native, splitDataUrl } from "./platform";

/**
 * Photo output for the Android app — saving to the gallery and the OS print
 * dialog, neither of which the WebView can do from a page.
 */

/** Where `saveImage` files land, for the Admin copy. */
export const ANDROID_ARCHIVE_FOLDER = "Pictures/Mad Shots";

/** Writes an image to the shared gallery. Resolves the saved file's URI. */
export async function saveImage(
  dataUrl: string,
  filename: string,
): Promise<string> {
  const { mime, base64 } = splitDataUrl(dataUrl);
  const { uri } = await native<{ uri: string }>("save_image", {
    data: base64,
    mime,
    filename,
  });
  return uri;
}

/**
 * Opens Android's print dialog on one image, pre-sized to the label stock.
 *
 * Resolves once the dialog closes (queued or cancelled). Android, like Chrome
 * before it, always shows the dialog — there's no silent system printing on
 * this platform, which is why the USB/Bluetooth transports exist.
 */
export async function printImage(
  dataUrl: string,
  opts: { widthMm: number; heightMm: number; marginMm: number; copies: number },
): Promise<void> {
  const { mime, base64 } = splitDataUrl(dataUrl);
  await native("print_image", {
    data: base64,
    mime,
    jobName: "Mad Shots",
    ...opts,
  });
}
