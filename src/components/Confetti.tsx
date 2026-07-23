import { useMemo } from "react";
import { motion } from "framer-motion";

/** One-shot celebratory confetti burst from the top-center. */
export function Confetti({ count = 44 }: { count?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 320,
        y: 200 + Math.random() * 360,
        rot: Math.random() * 720 - 360,
        delay: Math.random() * 0.3,
        color: [
          "rgb(var(--brand-a))",
          "rgb(var(--brand-b))",
          "rgb(var(--brand-c))",
          "#fff",
        ][i % 4],
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 10,
      })),
    [count],
  );

  return (
    <div className="pointer-events-none absolute inset-x-0 top-24 z-50 flex justify-center">
      {bits.map((b) => (
        <motion.span
          key={b.id}
          className="absolute rounded-[2px]"
          style={{ width: b.w, height: b.h, background: b.color }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={{ x: b.x, y: b.y, rotate: b.rot, opacity: [1, 1, 0] }}
          transition={{ duration: 1.6, delay: b.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}
