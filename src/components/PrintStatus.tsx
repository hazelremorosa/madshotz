import { motion } from "framer-motion";
import { useSession } from "@/store/session";
import { useSettings } from "@/store/settings";
import { usePrinter } from "@/lib/print/engine";

/**
 * Guest-facing print status.
 *
 * Kept small and reassuring rather than diagnostic: a guest doesn't care which
 * IPP attribute the printer rejected, only whether paper is coming. It renders
 * nothing when printing is off, so a booth with no printer looks untouched.
 *
 * A photo printer can take a minute, so this sits on both the Printing and QR
 * screens and follows the job to the end. The Retry button matters: without
 * it, a jam or an empty tray means fetching the host.
 */
export function PrintStatus() {
  const enabled = useSettings((s) => s.printEnabled);
  const hasPrinter = useSettings((s) => !!s.printer);
  const status = usePrinter((s) => s.status);
  const message = usePrinter((s) => s.message);
  const progress = usePrinter((s) => s.progress);
  const print = usePrinter((s) => s.print);
  const lastJobSource = usePrinter((s) => s.lastJobSource);
  const lastPrintedSource = usePrinter((s) => s.lastPrintedSource);
  const composite = useSession((s) => s.composite);

  // Only ever report on THIS guest's composite, never the previous one's.
  const isMine = !!composite && lastJobSource === composite;
  if (!enabled || !hasPrinter || !isMine) return null;

  const printed = lastPrintedSource === composite && status === "done";
  const failed = status === "error";
  const busy =
    status === "preparing" || status === "sending" || status === "printing";
  // Byte-streamed jobs have a real percentage; IPP jobs report stages instead.
  const pct =
    status === "sending" && progress > 0 && progress < 1
      ? ` ${Math.round(progress * 100)}%`
      : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 text-xs font-semibold"
    >
      {busy && (
        <span className="text-cocoa/60">
          🖨️ {message.startsWith("Waiting") ? message : "Printing your copy…"}
          {pct}
        </span>
      )}
      {printed && <span className="text-cocoa/50">🖨️ Printed ♥</span>}
      {failed && (
        <>
          <span className="text-amber-700">🖨️ Print didn't go through</span>
          <button
            type="button"
            onClick={() => composite && void print(composite)}
            className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-cocoa shadow"
          >
            Retry
          </button>
        </>
      )}
    </motion.div>
  );
}
