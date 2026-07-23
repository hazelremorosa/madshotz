import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Props {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "paper";
  disabled?: boolean;
  className?: string;
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  className,
}: Props) {
  const base =
    "relative select-none rounded-full px-8 py-4 text-base font-semibold tracking-wide transition-colors disabled:opacity-40 disabled:pointer-events-none";
  const variants = {
    primary:
      "brand-fill text-white shadow-bloom",
    ghost:
      "glass text-cocoa shadow-glass",
    paper:
      "bg-paper text-paper-ink shadow-paper",
  };
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.95 }}
      whileHover={{ scale: 1.03 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className={cn(base, variants[variant], className)}
    >
      {children}
    </motion.button>
  );
}
