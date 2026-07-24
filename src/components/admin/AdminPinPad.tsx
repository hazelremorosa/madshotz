import { useEffect, useRef, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { useSettings } from "@/store/settings";
import { cn } from "@/lib/cn";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "ok"];
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

/** PIN challenge shown before the Admin panel opens. */
export function AdminPinPad({
  onUnlock,
  onCancel,
}: {
  onUnlock: () => void;
  onCancel: () => void;
}) {
  const pin = useSettings((s) => s.pin);
  const [entry, setEntry] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [lockedFor, setLockedFor] = useState(0);
  const shake = useAnimationControls();
  const locked = lockedFor > 0;
  const timer = useRef<number | undefined>(undefined);

  // Count the lockout down.
  useEffect(() => {
    if (!locked) return;
    timer.current = window.setTimeout(() => setLockedFor((s) => s - 1), 1000);
    return () => window.clearTimeout(timer.current);
  }, [locked, lockedFor]);

  const submit = (value: string) => {
    if (value === pin) {
      onUnlock();
      return;
    }
    setEntry("");
    shake.start({ x: [0, -10, 9, -6, 0], transition: { duration: 0.35 } });
    const next = attempts + 1;
    setAttempts(next);
    if (next >= MAX_ATTEMPTS) {
      setAttempts(0);
      setLockedFor(LOCKOUT_SECONDS);
    }
  };

  const press = (key: string) => {
    if (locked) return;
    if (key === "clear") {
      setEntry("");
      return;
    }
    if (key === "ok") {
      submit(entry);
      return;
    }
    const next = (entry + key).slice(0, 8);
    setEntry(next);
    // Auto-submit once the entry is as long as the PIN — feels instant.
    if (next.length === pin.length) window.setTimeout(() => submit(next), 120);
  };

  // Hardware keyboard support (Windows kiosks, dev). Re-bound every render on
  // purpose so the handler always sees the current `entry`.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      else if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") setEntry((s) => s.slice(0, -1));
      else if (e.key === "Enter") press("ok");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-cocoa/40 backdrop-blur-md"
      onClick={onCancel}
    >
      <motion.div
        animate={shake}
        onClick={(e) => e.stopPropagation()}
        className="glass-strong w-[19rem] rounded-xl3 p-6 shadow-float"
      >
        <h2 className="text-center text-sm font-bold uppercase tracking-[0.25em] text-cocoa">
          Booth Admin
        </h2>
        <p className="mt-1 text-center text-xs text-cocoa/50">
          {locked ? `Locked — try again in ${lockedFor}s` : "Enter the host PIN"}
        </p>

        <div className="my-5 flex items-center justify-center gap-3">
          {Array.from({ length: Math.max(pin.length, entry.length) }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-3 w-3 rounded-full transition-colors",
                i < entry.length ? "brand-fill" : "bg-cocoa/20",
              )}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              disabled={locked}
              onClick={() => press(k)}
              className={cn(
                "rounded-xl2 py-3 text-lg font-bold transition-colors disabled:opacity-30",
                k === "ok"
                  ? "brand-fill text-white shadow"
                  : k === "clear"
                    ? "bg-white/60 text-xs uppercase tracking-widest text-cocoa/60"
                    : "bg-white/70 text-cocoa",
              )}
            >
              {k === "clear" ? "Clear" : k === "ok" ? "✓" : k}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="mt-4 w-full text-center text-[11px] font-semibold uppercase tracking-[0.25em] text-cocoa/40"
        >
          Cancel
        </button>
      </motion.div>
    </motion.div>
  );
}
