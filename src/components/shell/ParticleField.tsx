import { useMemo } from "react";
import { motion } from "framer-motion";

interface Props {
  count?: number;
}

/** Slow floating dust motes — pure transform/opacity for 60fps. */
export function ParticleField({ count = 22 }: Props) {
  const dots = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 2 + Math.random() * 4,
        dur: 8 + Math.random() * 10,
        delay: Math.random() * 8,
        drift: -20 - Math.random() * 40,
      })),
    [count],
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {dots.map((d) => (
        <motion.span
          key={d.id}
          className="absolute rounded-full bg-white/50"
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size,
            filter: "blur(0.5px)",
          }}
          animate={{ y: [0, d.drift, 0], opacity: [0, 0.8, 0] }}
          transition={{
            duration: d.dur,
            delay: d.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
