import { useEffect } from "react";
import { useSettings } from "@/store/settings";
import {
  acquireWakeLock,
  enterFullscreen,
  exitFullscreen,
  isEditable,
  isFullscreen,
  releaseWakeLock,
} from "@/lib/kiosk";

/**
 * Kiosk lockdown — keeps a public booth on the booth.
 *
 * Three independent pieces:
 *  1. Wake lock (`keepAwake`) — the tablet never sleeps mid-session.
 *  2. Fullscreen guard (`kioskMode`) — re-enters fullscreen on the next tap
 *     whenever the browser drops out of it (Esc, OS gesture, notification).
 *  3. Input guards (`kioskMode`) — no context menu, no pinch-zoom, no browser
 *     shortcuts, no back-navigation, and a confirm before unload.
 *
 * The input guards stand down while the Admin panel is open so the host can
 * type, select text and use the keyboard normally.
 */
export function useKioskLockdown() {
  const kioskMode = useSettings((s) => s.kioskMode);
  const keepAwake = useSettings((s) => s.keepAwake);
  const adminOpen = useSettings((s) => s.adminOpen);

  // 1. Screen wake lock — re-acquired when the tab comes back to the front,
  //    since the browser drops the lock whenever the page is hidden.
  useEffect(() => {
    if (!keepAwake) {
      releaseWakeLock();
      return;
    }
    acquireWakeLock();
    const onVisible = () => {
      if (document.visibilityState === "visible") acquireWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      releaseWakeLock();
    };
  }, [keepAwake]);

  // 2. Fullscreen guard.
  useEffect(() => {
    if (!kioskMode) {
      exitFullscreen();
      return;
    }
    // Fullscreen can only be requested from a user gesture, so try immediately
    // (works when kiosk mode was just switched on by a tap) and then latch onto
    // every subsequent tap until it sticks.
    const claim = () => {
      if (!isFullscreen()) enterFullscreen();
    };
    claim();
    window.addEventListener("pointerdown", claim);
    document.addEventListener("fullscreenchange", claim);
    return () => {
      window.removeEventListener("pointerdown", claim);
      document.removeEventListener("fullscreenchange", claim);
    };
  }, [kioskMode]);

  // 3. Input guards.
  useEffect(() => {
    if (!kioskMode || adminOpen) return;

    const block = (e: Event) => {
      if (!isEditable(e.target)) e.preventDefault();
    };

    // Pinch-zoom: any second finger. (Single-finger drags — the sticker editor
    // — are untouched; double-tap zoom is already off via touch-action.)
    const onTouchStart = (e: Event) => {
      if ((e as TouchEvent).touches.length > 1) e.preventDefault();
    };

    // Reload / close / print / devtools / save shortcuts on a hardware keyboard.
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      const blocked =
        k === "f5" ||
        k === "f11" ||
        k === "f12" ||
        (mod && ["r", "w", "n", "t", "p", "s", "o", "j", "u"].includes(k)) ||
        (mod && e.shiftKey && ["i", "c", "j"].includes(k)) ||
        (e.altKey && (k === "arrowleft" || k === "arrowright"));
      if (blocked) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Back-navigation: keep one spare history entry in front of us and push it
    // straight back whenever the guest pops it.
    const pushGuard = () => history.pushState({ kiosk: true }, "", location.href);
    const onPopState = () => pushGuard();

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    if (!(history.state as { kiosk?: boolean } | null)?.kiosk) pushGuard();

    // `gesturestart` (Safari pinch) isn't in the DOM typings.
    const doc = document as unknown as {
      addEventListener(t: string, cb: EventListener, o?: AddEventListenerOptions): void;
      removeEventListener(t: string, cb: EventListener): void;
    };

    doc.addEventListener("contextmenu", block);
    doc.addEventListener("selectstart", block);
    doc.addEventListener("dragstart", block);
    doc.addEventListener("gesturestart", block);
    doc.addEventListener("touchstart", onTouchStart, { passive: false });
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      doc.removeEventListener("contextmenu", block);
      doc.removeEventListener("selectstart", block);
      doc.removeEventListener("dragstart", block);
      doc.removeEventListener("gesturestart", block);
      doc.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [kioskMode, adminOpen]);
}
