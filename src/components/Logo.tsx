import { motion } from "framer-motion";

interface Props {
  size?: number;
  draw?: boolean;
}

/** MAD SHOT'Z aperture mark. `draw` animates the stroke reveal. */
export function LogoMark({ size = 96, draw = false }: Props) {
  const blades = Array.from({ length: 6 });
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="madGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgb(var(--brand-a))" />
          <stop offset="55%" stopColor="rgb(var(--brand-b))" />
          <stop offset="100%" stopColor="rgb(var(--brand-c))" />
        </linearGradient>
      </defs>
      <motion.circle
        cx="50"
        cy="50"
        r="40"
        stroke="url(#madGrad)"
        strokeWidth="5"
        initial={draw ? { pathLength: 0, opacity: 0 } : false}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1, ease: "easeInOut" }}
      />
      {blades.map((_, i) => {
        const a = (i / 6) * Math.PI * 2;
        const x1 = 50 + Math.cos(a) * 12;
        const y1 = 50 + Math.sin(a) * 12;
        const x2 = 50 + Math.cos(a) * 34;
        const y2 = 50 + Math.sin(a) * 34;
        return (
          <motion.line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="url(#madGrad)"
            strokeWidth="4"
            strokeLinecap="round"
            initial={draw ? { pathLength: 0, opacity: 0 } : false}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 + i * 0.06 }}
          />
        );
      })}
      <motion.circle
        cx="50"
        cy="50"
        r="9"
        fill="url(#madGrad)"
        initial={draw ? { scale: 0 } : false}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.9 }}
        style={{ transformOrigin: "50px 50px" }}
      />
    </svg>
  );
}
