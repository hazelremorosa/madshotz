import { motion } from "framer-motion";

/** Soft pastel gradient wash for the cute/light theme. */
export function AmbientBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-cream">
      <motion.div
        className="absolute -left-1/4 -top-1/4 h-[70%] w-[70%] rounded-full blur-3xl animate-drift"
        style={{ background: "radial-gradient(circle, rgb(var(--brand-a)/0.4), transparent 68%)" }}
      />
      <motion.div
        className="absolute -right-1/4 top-1/4 h-[75%] w-[75%] rounded-full blur-3xl animate-drift"
        style={{
          background: "radial-gradient(circle, rgb(var(--brand-b)/0.36), transparent 68%)",
          animationDelay: "-7s",
        }}
      />
      <motion.div
        className="absolute bottom-[-20%] left-1/4 h-[65%] w-[65%] rounded-full blur-3xl animate-drift"
        style={{
          background: "radial-gradient(circle, rgb(var(--brand-c)/0.34), transparent 68%)",
          animationDelay: "-14s",
        }}
      />
      {/* soft top light */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(255,255,255,0.7),transparent_45%)]" />
    </div>
  );
}
