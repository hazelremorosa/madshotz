/**
 * Printing via RawBT — an Android bridge app.
 *
 * RawBT ("Raw BlueTooth") pairs with a printer over **Bluetooth Classic SPP** and
 * passes bytes straight through. That's the interesting part: the RW403B
 * advertises SPP, its vendor app prints, and a browser is barred from Classic
 * Bluetooth entirely — so an app that is *just a pipe* may be the shortest route
 * to paper without writing a native wrapper. Whether RawBT genuinely passes TSPL
 * through untouched (it's built around ESC/POS receipt printers) is exactly what
 * this branch is for.
 *
 * There's no connection to hold: a job is handed over by navigating to a
 * `rawbt:` URL, which Android routes to the app. Two consequences follow —
 *
 * 1. **Nothing comes back.** There is no acknowledgement, no status, no error. A
 *    job that RawBT drops looks identical to one it prints, so "sent" here means
 *    strictly "handed to Android".
 * 2. **It needs user activation.** Firing a custom-scheme navigation without a
 *    recent tap gets blocked, which puts auto-print at the mercy of how long the
 *    composite takes to build.
 *
 * RawBT's payload encoding isn't something I can verify from here, so all the
 * plausible forms are offered rather than guessed at — same approach as the BLE
 * UUIDs.
 */

export type RawBtFormat = "base64Prefix" | "bare" | "intent" | "dataUri";

export const RAWBT_FORMATS: { value: RawBtFormat; label: string; hint: string }[] =
  [
    {
      value: "base64Prefix",
      label: "base64,",
      hint: "rawbt:base64,<data> — the documented form, try this first.",
    },
    {
      value: "bare",
      label: "bare",
      hint: "rawbt:<data> — older builds accept the payload with no prefix.",
    },
    {
      value: "intent",
      label: "intent://",
      hint: "An explicit Android intent naming RawBT's package. Skips any app chooser.",
    },
    {
      value: "dataUri",
      label: "data URI",
      hint: "rawbt:data:application/octet-stream;base64,<data>",
    },
  ];

/** RawBT's package name, for the explicit-intent form. */
const RAWBT_PACKAGE = "ru.a402d.rawbtprinter";

/**
 * Base64 without blowing the stack.
 *
 * `btoa(String.fromCharCode(...bytes))` spreads every byte as an argument, which
 * throws on anything approaching a real print job — a 4×6 raster is ~68,000 of
 * them. Chunked instead.
 */
export function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Builds the URL for a payload in the chosen form. */
export function rawbtUrl(bytes: Uint8Array, format: RawBtFormat): string {
  const b64 = toBase64(bytes);
  switch (format) {
    case "bare":
      return `rawbt:${b64}`;
    case "intent":
      return `intent:base64,${b64}#Intent;scheme=rawbt;package=${RAWBT_PACKAGE};end`;
    case "dataUri":
      return `rawbt:data:application/octet-stream;base64,${b64}`;
    case "base64Prefix":
    default:
      return `rawbt:base64,${b64}`;
  }
}

/**
 * Practical ceiling on a URL handed to Android.
 *
 * Chrome tolerates very long URLs, but an intent crossing the Android IPC
 * boundary does not — oversized extras are silently truncated or dropped, which
 * would look exactly like RawBT ignoring the job. Better to refuse and say why.
 */
export const RAWBT_MAX_URL = 700_000;

/**
 * Hands a payload to RawBT.
 *
 * Uses a synthetic anchor click rather than assigning `location.href`: it keeps
 * the current page put, and Chrome treats it as a genuine navigation for the
 * purposes of external protocol handling.
 */
export function sendToRawBt(bytes: Uint8Array, format: RawBtFormat): void {
  const url = rawbtUrl(bytes, format);
  if (url.length > RAWBT_MAX_URL) {
    throw new Error(
      `Job is too large to hand over as a URL (${Math.round(url.length / 1024)} KB ` +
        `encoded, limit ~${Math.round(RAWBT_MAX_URL / 1024)} KB). Use a narrower ` +
        "label, or the system print dialog instead.",
    );
  }

  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
  }
}
