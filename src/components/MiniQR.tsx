import { useMemo } from "react";
import { qrMatrixSync } from "@/lib/qr";
import { cn } from "@/lib/cn";

interface Props {
  text: string;
  className?: string;
}

/** A small, static QR rendered as crisp SVG — used on the receipt footer. */
export function MiniQR({ text, className }: Props) {
  const matrix = useMemo(() => qrMatrixSync(text), [text]);
  const n = matrix.length;
  return (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      shapeRendering="crispEdges"
      className={cn("block", className)}
    >
      {matrix.map((row, r) =>
        row.map((on, c) =>
          on ? (
            <rect key={`${r}-${c}`} x={c} y={r} width={1.02} height={1.02} fill="#4a3a44" />
          ) : null,
        ),
      )}
    </svg>
  );
}
