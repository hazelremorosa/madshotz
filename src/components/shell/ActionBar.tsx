import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";

interface Props {
  onBack?: () => void;
  primaryLabel?: string;
  onPrimary?: () => void;
  primaryDisabled?: boolean;
  hint?: string;
}

/** Floating bottom control bar. Each screen supplies its own actions. */
export function ActionBar({
  onBack,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  hint,
}: Props) {
  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className="absolute inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3"
    >
      {onBack ? (
        <Button variant="ghost" onClick={onBack} className="px-6">
          ← Back
        </Button>
      ) : (
        <span />
      )}
      {hint && (
        <span className="pointer-events-none flex-1 text-center text-xs font-medium uppercase tracking-[0.25em] text-cocoa/50">
          {hint}
        </span>
      )}
      {primaryLabel ? (
        <Button onClick={onPrimary} disabled={primaryDisabled} className="px-9">
          {primaryLabel}
        </Button>
      ) : (
        <span />
      )}
    </motion.div>
  );
}
