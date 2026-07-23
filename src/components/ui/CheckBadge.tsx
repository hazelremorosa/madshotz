import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

interface Props {
  className?: string;
  small?: boolean;
}

/** A brand-gradient circular badge with a white check — marks the selected item. */
export function CheckBadge({ className, small }: Props) {
  return (
    <motion.span
      initial={{ scale: 0, rotate: -25 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 18 }}
      className={cn(
        "pointer-events-none absolute z-30 flex items-center justify-center rounded-full brand-fill text-white shadow-md ring-2 ring-white",
        small ? "h-5 w-5" : "h-6 w-6",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className={small ? "h-3 w-3" : "h-3.5 w-3.5"}
        fill="none"
        stroke="currentColor"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </motion.span>
  );
}
