/**
 * Saving the finished composite to the kiosk's own disk.
 *
 * This is a *local archive*, not delivery — it's the host's copy on the tablet,
 * separate from the Cloudflare upload the guest's QR points at. The two are
 * deliberately independent: a booth with no network still fills its Downloads
 * folder, and a booth with no auto-save still delivers.
 *
 * The browser, not this code, decides where the file lands. On a kiosk that
 * means two Chrome settings have to be right or nothing appears:
 *   - Downloads → "Ask where to save each file" OFF, or every session parks a
 *     modal file dialog in front of the next guest;
 *   - Site settings → Automatic downloads → Allow, because the page is a
 *     long-lived SPA and Chrome prompts from the second unattended download on.
 * `AUTO_DOWNLOAD_SETUP` is that guidance, shown to the host in Admin.
 */

export const AUTO_DOWNLOAD_SETUP =
  "In Chrome, set Downloads → “Ask where to save each file” OFF and allow " +
  "Automatic downloads for this site — otherwise a save dialog blocks the " +
  "next guest.";

/** `20260912-1435` — sorts chronologically in a folder listing. */
function stamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}`
  );
}

/**
 * The archive filename for one session's composite.
 *
 * Timestamp first so a whole event's worth of files sits in shooting order,
 * session code last so a guest asking "where's mine?" can be answered from the
 * code still on their receipt.
 */
export function compositeFilename(code: string, at?: Date): string {
  return `mad-shots-${stamp(at)}-${code}.jpg`;
}

/**
 * Writes a data URL to the device's Downloads folder.
 *
 * Returns false rather than throwing: a failed archive save must never take the
 * QR screen down with it, since the guest's actual copy is the upload.
 */
export function saveToDevice(dataUrl: string, filename: string): boolean {
  try {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    // Firefox only honours a click on an anchor that's in the document.
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    return false;
  }
}
