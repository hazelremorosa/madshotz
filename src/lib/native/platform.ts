import { invoke, isTauri } from "@tauri-apps/api/core";

/**
 * The installed Android app (Tauri) rather than a browser tab.
 *
 * The booth is one codebase served two ways: as the PWA in Chrome, and wrapped
 * in a Tauri APK. Inside the APK the page runs in the Android System WebView,
 * which has no downloads, `window.print()`, Fullscreen API or Wake Lock — so
 * those, and all printing, route through `BoothPlugin.kt` instead. Everything
 * else is identical.
 */
export function isAndroidApp(): boolean {
  return isTauri() && /android/i.test(navigator.userAgent);
}

/** Calls a command on the native `booth` plugin. */
export function native<T = void>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return invoke<T>(`plugin:booth|${command}`, args).catch((e: unknown) => {
    // Plugin rejections arrive as bare strings; normalise so callers can rely
    // on `Error.message`.
    throw e instanceof Error ? e : new Error(String(e));
  });
}

/**
 * Base64 for the IPC hop. Bytes cross to Kotlin as JSON, where a base64 string
 * is a third the size of a number array and decodes in one call.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** `data:image/jpeg;base64,…` → its MIME type and base64 body. */
export function splitDataUrl(dataUrl: string): {
  mime: string;
  base64: string;
} {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error("Not a data URL");
  const mime = m[1] || "application/octet-stream";
  const base64 = m[2] ? m[3] : btoa(decodeURIComponent(m[3]));
  return { mime, base64 };
}
