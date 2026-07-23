import { motion } from "framer-motion";

interface Props {
  size?: number;
  draw?: boolean;
}

/** Mad Shots camera mark — a line-art camera inside a ring. */
export function LogoMark({ size = 96, draw = false }: Props) {
  const drawIn = draw ? { pathLength: 0, opacity: 0 } : false;
  const grow = draw ? { scale: 0 } : false;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="madGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgb(var(--brand-a))" />
          <stop offset="55%" stopColor="rgb(var(--brand-b))" />
          <stop offset="100%" stopColor="rgb(var(--brand-c))" />
        </linearGradient>
      </defs>

      {/* ring */}
      <motion.circle
        cx="50"
        cy="50"
        r="44"
        stroke="url(#madGrad)"
        strokeWidth="2.4"
        initial={drawIn}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1, ease: "easeInOut" }}
      />

      {/* camera body + viewfinder hump (single silhouette) */}
      <motion.path
        d="M28,47 Q28,42 33,42 L43,42 L45,34 L59,34 L61,42 L67,42 Q72,42 72,47 L72,61 Q72,66 67,66 L33,66 Q28,66 28,61 Z"
        stroke="url(#madGrad)"
        strokeWidth="2.7"
        strokeLinejoin="round"
        initial={drawIn}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.9, delay: 0.3, ease: "easeInOut" }}
      />

      {/* rangefinder window */}
      <motion.rect
        x="32"
        y="46.5"
        width="7"
        height="5"
        rx="1.2"
        stroke="url(#madGrad)"
        strokeWidth="2"
        initial={draw ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.95 }}
      />

      {/* shutter dot */}
      <motion.circle
        cx="64"
        cy="47.5"
        r="1.7"
        fill="url(#madGrad)"
        initial={grow}
        animate={{ scale: 1 }}
        transition={{ delay: 1, type: "spring", stiffness: 260, damping: 14 }}
        style={{ transformOrigin: "64px 47.5px" }}
      />

      {/* lens */}
      <motion.circle
        cx="50"
        cy="55"
        r="8.6"
        stroke="url(#madGrad)"
        strokeWidth="2.7"
        initial={drawIn}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.55, ease: "easeInOut" }}
      />
      <motion.circle
        cx="50"
        cy="55"
        r="3.6"
        fill="url(#madGrad)"
        initial={grow}
        animate={{ scale: 1 }}
        transition={{ delay: 0.95, type: "spring", stiffness: 240, damping: 14 }}
        style={{ transformOrigin: "50px 55px" }}
      />
    </svg>
  );
}
