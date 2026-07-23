import { motion } from "framer-motion";
import type { CapturedPhoto, LayoutDef } from "@/types";
import { cn } from "@/lib/cn";

interface Props {
  layout: LayoutDef;
  photos: CapturedPhoto[];
  filterCss: string;
  /** Slot to visually highlight (next capture). */
  activeIndex?: number;
  className?: string;
}

function Cell({
  photo,
  filterCss,
  active,
  index,
}: {
  photo?: CapturedPhoto;
  filterCss: string;
  active?: boolean;
  index: number;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className={cn(
        "relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl bg-paper-shade",
        active && "ring-2 ring-[rgb(var(--brand-a))] ring-offset-2 ring-offset-paper",
      )}
    >
      {photo ? (
        <img
          src={photo.dataUrl}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
          style={{ filter: filterCss === "none" ? undefined : filterCss }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="font-mono text-2xl font-bold text-paper-ink/25">
            {index + 1}
          </span>
        </div>
      )}
    </motion.div>
  );
}

/** Arranges captured frames per the chosen layout. */
export function FrameStack({
  layout,
  photos,
  filterCss,
  activeIndex,
  className,
}: Props) {
  const cells = Array.from({ length: layout.shots }).map((_, i) => (
    <Cell
      key={i}
      index={i}
      photo={photos[i]}
      filterCss={filterCss}
      active={activeIndex === i}
    />
  ));

  const gap = "gap-2";

  if (layout.kind === "single") {
    return <div className={cn("flex h-full w-full", className)}>{cells}</div>;
  }
  if (layout.kind === "strip") {
    return (
      <div className={cn("flex h-full w-full flex-col", gap, className)}>
        {cells}
      </div>
    );
  }
  if (layout.kind === "row") {
    return (
      <div className={cn("flex h-full w-full flex-row", gap, className)}>
        {cells}
      </div>
    );
  }
  if (layout.kind === "grid") {
    return (
      <div
        className={cn(
          "grid h-full w-full grid-cols-2 grid-rows-2",
          gap,
          className,
        )}
      >
        {cells}
      </div>
    );
  }
  // magazine: hero + 2 below
  return (
    <div className={cn("flex h-full w-full flex-col", gap, className)}>
      <div className="flex min-h-0 flex-[1.6]">{cells[0]}</div>
      <div className={cn("flex min-h-0 flex-1 flex-row", gap)}>
        {cells[1]}
        {cells[2]}
      </div>
    </div>
  );
}
