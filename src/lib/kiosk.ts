/**
 * Kiosk primitives — fullscreen and screen wake lock.
 *
 * A browser can only *enter* fullscreen from a user gesture, so the guard in
 * `useKioskLockdown` re-requests it on the next tap whenever the booth finds
 * itself windowed again (guest swiped the OS gesture, pressed Esc, etc.).
 */

type FsElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>;
};
type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
};

export function isFullscreen(): boolean {
  const d = document as FsDocument;
  return Boolean(d.fullscreenElement || d.webkitFullscreenElement);
}

export async function enterFullscreen(): Promise<boolean> {
  const el = document.documentElement as FsElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else return false;
    return true;
  } catch {
    // iOS Safari has no Fullscreen API on iPhone — the host installs the PWA
    // to the home screen instead, which is already chrome-less.
    return false;
  }
}

export async function exitFullscreen(): Promise<void> {
  const d = document as FsDocument;
  try {
    if (!isFullscreen()) return;
    if (d.exitFullscreen) await d.exitFullscreen();
    else if (d.webkitExitFullscreen) await d.webkitExitFullscreen();
  } catch {
    /* already out */
  }
}

// ── Screen wake lock ────────────────────────────────────────────────────────

interface Sentinel {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", cb: () => void) => void;
}
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<Sentinel> };
};

let sentinel: Sentinel | null = null;

export function wakeLockSupported(): boolean {
  return Boolean((navigator as WakeLockNavigator).wakeLock);
}

/** Keeps the tablet's screen on. Safe to call repeatedly. */
export async function acquireWakeLock(): Promise<boolean> {
  const wl = (navigator as WakeLockNavigator).wakeLock;
  if (!wl) return false;
  if (sentinel && !sentinel.released) return true;
  try {
    sentinel = await wl.request("screen");
    sentinel.addEventListener("release", () => {
      sentinel = null;
    });
    return true;
  } catch {
    // Denied (tab hidden, low battery) — the visibility listener retries.
    return false;
  }
}

export async function releaseWakeLock(): Promise<void> {
  try {
    await sentinel?.release();
  } catch {
    /* already gone */
  }
  sentinel = null;
}

/** True for elements that need native text input/selection to keep working. */
export function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    el.isContentEditable === true
  );
}
