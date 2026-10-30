import { native } from "./platform";

/**
 * Kiosk primitives for the Android app.
 *
 * The WebView has no Fullscreen API worth the name and no Wake Lock, but the
 * activity can do both better than a browser ever could: immersive mode hides
 * the status *and* navigation bars and re-hides them after a swipe, and
 * FLAG_KEEP_SCREEN_ON needs no re-acquiring when the page is hidden.
 */

let immersive = false;
let awake = false;

export function nativeIsImmersive(): boolean {
  return immersive;
}

export async function nativeSetImmersive(enabled: boolean): Promise<boolean> {
  try {
    await native("set_immersive", { enabled });
    immersive = enabled;
    return true;
  } catch {
    return false;
  }
}

export async function nativeSetKeepAwake(enabled: boolean): Promise<boolean> {
  if (awake === enabled) return true;
  try {
    await native("set_keep_awake", { enabled });
    awake = enabled;
    return true;
  } catch {
    return false;
  }
}
