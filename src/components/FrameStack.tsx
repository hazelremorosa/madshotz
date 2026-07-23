import { motion } from "framer-motion";
import type { CapturedPhoto, LayoutDef, PhotoShape } from "@/types";
import { shapeRadius } from "@/data/frames";
import { cn } from "@/lib/cn";

interface Props {
  layout: LayoutDef;
  photos: CapturedPhoto[];
  filterCss: string;
  shape?: PhotoShape;
  /** Slot to visually highlight (next capture). */
  activeIndex?: number;
  className?: string;
}

function Cell({
  photo,
  filterCss,
  active,
  index,
  shape,
}: {
  photo?: CapturedPhoto;
  filterCss: string;
  active?: boolean;
  index: number;
  shape: PhotoShape;
}) {
  const shapeStyle =
    shape === "heart"
      ? { clipPath: "url(#heartClip)" as const }
      : { borderRadius: shapeRadius(shape) };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className={cn(
        "relative min-h-0 min-w-0 flex-1 overflow-hidden bg-paper-shade",
        active && "ring-[3px] ring-[rgb(var(--brand-a))] ring-offset-2 ring-offset-white/40",
      )}
      style={shapeStyle}
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
          <span className="font-mono text-2xl font-bold text-paper-ink/20">
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
  shape = "rounded",
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
      shape={shape}
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
