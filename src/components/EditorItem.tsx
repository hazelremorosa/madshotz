import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { motion } from "framer-motion";
import type { PlacedItem } from "@/types";
import { useSession } from "@/store/session";
import { cn } from "@/lib/cn";

interface Props {
  item: PlacedItem;
  paperRef: RefObject<HTMLDivElement>;
  selected: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Action =
  | { type: "move"; px: number; py: number; ix: number; iy: number }
  | { type: "resize"; startDist: number; startScale: number }
  | { type: "rotate" }
  | null;

export function EditorItem({ item, paperRef, selected }: Props) {
  const update = useSession((s) => s.updateItem);
  const select = useSession((s) => s.selectItem);
  const action = useRef<Action>(null);

  const centerPx = () => {
    const r = paperRef.current!.getBoundingClientRect();
    return { cx: r.left + item.x * r.width, cy: r.top + item.y * r.height, r };
  };

  const onBodyDown = (e: ReactPointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    select(item.id);
    action.current = { type: "move", px: e.clientX, py: e.clientY, ix: item.x, iy: item.y };
  };

  const onResizeDown = (e: ReactPointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const { cx, cy } = centerPx();
    action.current = {
      type: "resize",
      startDist: Math.hypot(e.clientX - cx, e.clientY - cy) || 1,
      startScale: item.scale,
    };
  };

  const onRotateDown = (e: ReactPointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    action.current = { type: "rotate" };
  };

  const onMove = (e: ReactPointerEvent) => {
    const a = action.current;
    if (!a) return;
    if (a.type === "move") {
      const r = paperRef.current!.getBoundingClientRect();
      const dx = (e.clientX - a.px) / r.width;
      const dy = (e.clientY - a.py) / r.height;
      update(item.id, {
        x: clamp(a.ix + dx, 0.02, 0.98),
        y: clamp(a.iy + dy, 0.02, 0.98),
      });
    } else if (a.type === "resize") {
      const { cx, cy } = centerPx();
      const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
      update(item.id, { scale: clamp((a.startScale * dist) / a.startDist, 0.4, 4) });
    } else if (a.type === "rotate") {
      const { cx, cy } = centerPx();
      const deg = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
      update(item.id, { rotation: Math.round(deg) });
    }
  };

  const onUp = () => {
    action.current = null;
  };

  const fontSize =
    item.kind === "sticker" ? `${12 * item.scale}cqw` : `${5 * item.scale}cqw`;

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 18 }}
      className="absolute touch-none"
      style={{
        left: `${item.x * 100}%`,
        top: `${item.y * 100}%`,
        transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
        zIndex: item.z + 10,
      }}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div
        onPointerDown={onBodyDown}
        className={cn(
          "relative cursor-grab whitespace-nowrap px-1 leading-none active:cursor-grabbing",
          selected && "rounded-md outline-dashed outline-2 outline-offset-4 outline-[rgb(var(--brand-a))]",
        )}
        style={{ fontSize }}
      >
        {item.kind === "text" ? (
          <span className="font-extrabold text-paper-ink">{item.content}</span>
        ) : (
          <span>{item.content}</span>
        )}

        {selected && (
          <>
            {/* rotate handle */}
            <span
              onPointerDown={onRotateDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              className="absolute left-1/2 top-0 flex h-6 w-6 -translate-x-1/2 -translate-y-10 cursor-grab items-center justify-center rounded-full brand-fill text-[10px] text-white shadow"
              style={{ touchAction: "none" }}
            >
              ↻
            </span>
            {/* resize handle */}
            <span
              onPointerDown={onResizeDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              className="absolute bottom-0 right-0 h-6 w-6 translate-x-1/2 translate-y-1/2 cursor-nwse-resize rounded-full bg-white shadow ring-2 ring-[rgb(var(--brand-a))]"
              style={{ touchAction: "none" }}
            />
          </>
        )}
      </div>
    </motion.div>
  );
}
