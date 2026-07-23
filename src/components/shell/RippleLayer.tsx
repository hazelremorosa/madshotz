import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface Ripple {
  id: number;
  x: number;
  y: number;
}

/** A soft radial ripple at every touch point, anywhere on screen. */
export function RippleLayer() {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const id = seq.current++;
      setRipples((r) => [...r, { id, x: e.clientX, y: e.clientY }]);
      window.setTimeout(
        () => setRipples((r) => r.filter((x) => x.id !== id)),
        700,
      );
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      <AnimatePresence>
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            className="absolute rounded-full"
            style={{
              left: r.x,
              top: r.y,
              background:
                "radial-gradient(circle, rgb(var(--brand-a)/0.5), transparent 70%)",
            }}
            initial={{ width: 0, height: 0, x: 0, y: 0, opacity: 0.7 }}
            animate={{
              width: 220,
              height: 220,
              x: -110,
              y: -110,
              opacity: 0,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.65, ease: "easeOut" }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
