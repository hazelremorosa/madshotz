import { useEffect, useState } from "react";

interface Props {
  matrix: boolean[][] | null;
  size?: number;
}

/** QR that "draws itself" via a diagonal staggered reveal, then reads live. */
export function AnimatedQR({ matrix, size = 220 }: Props) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!matrix) return;
    const t = window.setTimeout(() => setRevealed(true), 60);
    return () => window.clearTimeout(t);
  }, [matrix]);

  if (!matrix) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl bg-white"
        style={{ width: size, height: size }}
      >
        <span className="h-10 w-10 animate-spinslow rounded-full border-4 border-ink/20 border-t-ink" />
      </div>
    );
  }

  const n = matrix.length;
  const maxDelay = (n - 1) * 2;

  return (
    <div className="rounded-2xl bg-white p-3 shadow-xl">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${n} ${n}`}
        shapeRendering="crispEdges"
      >
        {matrix.map((row, r) =>
          row.map((on, c) =>
            on ? (
              <rect
                key={`${r}-${c}`}
                x={c}
                y={r}
                width={1.03}
                height={1.03}
                fill="#0b0b12"
                style={{
                  opacity: revealed ? 1 : 0,
                  transform: revealed ? "scale(1)" : "scale(0.2)",
                  transformOrigin: `${c + 0.5}px ${r + 0.5}px`,
                  transition: "opacity 0.25s ease, transform 0.25s ease",
                  transitionDelay: `${((r + c) * 2) / maxDelay * 0.9}s`,
                }}
              />
            ) : null,
          ),
        )}
      </svg>
    </div>
  );
}
