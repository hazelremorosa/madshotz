import { motion } from "framer-motion";

/** Living gradient mesh that adopts the current theme's brand hues. */
export function AmbientBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-ink">
      <motion.div
        className="absolute -left-1/4 -top-1/4 h-[70%] w-[70%] rounded-full blur-3xl animate-drift"
        style={{ background: "radial-gradient(circle, rgb(var(--brand-a)/0.55), transparent 65%)" }}
      />
      <motion.div
        className="absolute -right-1/4 top-1/4 h-[75%] w-[75%] rounded-full blur-3xl animate-drift"
        style={{
          background: "radial-gradient(circle, rgb(var(--brand-b)/0.5), transparent 65%)",
          animationDelay: "-7s",
        }}
      />
      <motion.div
        className="absolute bottom-[-20%] left-1/4 h-[65%] w-[65%] rounded-full blur-3xl animate-drift"
        style={{
          background: "radial-gradient(circle, rgb(var(--brand-c)/0.45), transparent 65%)",
          animationDelay: "-14s",
        }}
      />
      {/* vignette + grain */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.55))]" />
    </div>
  );
}
