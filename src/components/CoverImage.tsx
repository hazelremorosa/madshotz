import { useEffect, useRef, useState } from "react";
import {
  COVER_ASPECT,
  cropHeight,
  type CoverCrop,
} from "@/assets/covers";

/**
 * A bundled cover filling its parent, showing `crop` (or, with none, the whole
 * picture zoomed to fill and anchored to the top, where the covers keep their
 * titles).
 *
 * With a crop the region is scaled to cover the box, so a screen that isn't
 * exactly the design shape shows a little extra around it rather than a gap.
 */
export function CoverImage({
  url,
  crop,
  alt = "",
  onLoad,
  imgClassName = "",
}: {
  url: string;
  crop?: CoverCrop | null;
  alt?: string;
  onLoad?: () => void;
  imgClassName?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => {
      const r = e[0]?.contentRect;
      if (r) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  let style: React.CSSProperties | undefined;
  if (crop && size && size.w > 0 && size.h > 0) {
    // Work in picture units: width = COVER_ASPECT, height = 1.
    const rw = crop.w * COVER_ASPECT;
    const rh = cropHeight(crop.w);
    const scale = Math.max(size.w / rw, size.h / rh);
    const imgW = scale * COVER_ASPECT;
    const imgH = scale;
    const cx = crop.l * COVER_ASPECT + rw / 2;
    const cy = crop.t + rh / 2;
    // Never let an edge of the picture slide into view.
    const left = Math.min(0, Math.max(size.w - imgW, size.w / 2 - cx * scale));
    const top = Math.min(0, Math.max(size.h - imgH, size.h / 2 - cy * scale));
    style = { left, top, width: imgW, height: imgH, maxWidth: "none" };
  }

  return (
    <div ref={box} className="absolute inset-0 overflow-hidden">
      <img
        src={url}
        alt={alt}
        draggable={false}
        onLoad={onLoad}
        style={style}
        className={
          (style
            ? "absolute select-none "
            : "absolute inset-0 h-full w-full select-none object-cover object-top ") +
          imgClassName
        }
      />
    </div>
  );
}
