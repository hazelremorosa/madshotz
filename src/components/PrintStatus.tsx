import { motion } from "framer-motion";
import { useSession } from "@/store/session";
import { useSettings } from "@/store/settings";
import { usePrinter } from "@/lib/printer";

/**
 * Guest-facing print status.
 *
 * Kept small and reassuring rather than diagnostic: a guest doesn't care which
 * GATT characteristic failed, only whether paper is coming. It renders nothing at
 * all when printing is off, so a booth with no printer looks untouched.
 *
 * The retry button matters more than it looks. Over Bluetooth a job takes 5–20
 * seconds and can drop halfway; without a retry the guest's only recourse is to
 * fetch the host.
 */
export function PrintStatus() {
  const enabled = useSettings((s) => s.printEnabled);
  const status = usePrinter((s) => s.status);
  const progress = usePrinter((s) => s.progress);
  const printImage = usePrinter((s) => s.printImage);
  const lastJobSource = usePrinter((s) => s.lastJobSource);
  const lastPrintedSource = usePrinter((s) => s.lastPrintedSource);
  const composite = useSession((s) => s.composite);

  // Only ever report on THIS guest's composite. Without this the store's
  // "ready" state — which also means "connected, idle" — would read as
  // "Printed ♥" before a single byte had been sent.
  const isMine = !!composite && lastJobSource === composite;
  if (!enabled || !isMine) return null;

  const printed = lastPrintedSource === composite;
  const failed = status === "error";

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 text-xs font-semibold"
    >
      {status === "printing" && (
        <span className="text-cocoa/60">
          🖨️ Printing your copy… {Math.round(progress * 100)}%
        </span>
      )}
      {printed && status !== "printing" && (
        <span className="text-cocoa/50">🖨️ Printed ♥</span>
      )}
      {failed && (
        <>
          <span className="text-amber-700">🖨️ Print didn't go through</span>
          <button
            type="button"
            onClick={() => composite && void printImage(composite)}
            className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-cocoa shadow"
          >
            Retry
          </button>
        </>
      )}
    </motion.div>
  );
}
