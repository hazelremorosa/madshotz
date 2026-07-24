import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSettings } from "@/store/settings";
import { AdminPinPad } from "@/components/admin/AdminPinPad";
import { AdminPanel } from "@/screens/AdminPanel";

/** Taps needed on the hidden corner, and the window they must land in. */
const TAPS_REQUIRED = 5;
const TAP_WINDOW_MS = 3000;

/**
 * The way into the Admin panel: five quick taps on the (invisible) top-left
 * corner, then the PIN. Guests never see it; a host can find it blindfolded.
 * Ctrl+Alt+A does the same on a keyboard.
 */
export function AdminRoot() {
  const adminOpen = useSettings((s) => s.adminOpen);
  const setAdminOpen = useSettings((s) => s.setAdminOpen);
  const [pinOpen, setPinOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const taps = useRef<number[]>([]);

  const tap = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < TAP_WINDOW_MS), now];
    if (taps.current.length >= TAPS_REQUIRED) {
      taps.current = [];
      setProgress(0);
      setPinOpen(true);
      return;
    }
    setProgress(taps.current.length);
  };

  // Clear a half-finished tap run so the hint doesn't linger.
  useEffect(() => {
    if (!progress) return;
    const t = window.setTimeout(() => {
      taps.current = [];
      setProgress(0);
    }, TAP_WINDOW_MS);
    return () => window.clearTimeout(t);
  }, [progress]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setPinOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // `?admin` opens the PIN pad straight away — handy on a laptop, where a
  // fullscreen kiosk has no address bar. The param is stripped once consumed so
  // a reload (or a guest reading the URL bar) doesn't land back here.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has("admin")) return;
    setPinOpen(true);
    params.delete("admin");
    const qs = params.toString();
    history.replaceState(
      history.state,
      "",
      `${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`,
    );
  }, []);

  return (
    <>
      {/* Hidden entry hotspot. */}
      <button
        type="button"
        onClick={tap}
        aria-label="Booth admin"
        className="absolute left-0 top-0 z-[60] h-16 w-16 opacity-0"
      />

      {/* Faint confirmation that taps are registering (2 of 5, 3 of 5…). */}
      <AnimatePresence>
        {progress >= 2 && !pinOpen && !adminOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute left-3 top-[max(1rem,env(safe-area-inset-top))] z-[61] flex gap-1"
          >
            {Array.from({ length: TAPS_REQUIRED }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full ${
                  i < progress ? "bg-cocoa/50" : "bg-cocoa/15"
                }`}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pinOpen && (
          <AdminPinPad
            onUnlock={() => {
              setPinOpen(false);
              setAdminOpen(true);
            }}
            onCancel={() => setPinOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
