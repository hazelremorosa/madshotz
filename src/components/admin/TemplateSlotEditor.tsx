import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { TemplateSlot } from "@/types";
import { cn } from "@/lib/cn";

interface Props {
  image: string;
  slots: TemplateSlot[];
  onChange: (slots: TemplateSlot[]) => void;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

const MIN = 0.06;

type Action =
  | { type: "move"; px: number; py: number; ox: number; oy: number }
  | { type: "resize"; px: number; py: number; ow: number; oh: number }
  | null;

/**
 * Drag/resize photo-slot boxes over an uploaded template. Slots are stored as
 * fractions (0..1) of the design, so they map straight onto the composite.
 */
export function TemplateSlotEditor({ image, slots, onChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<number | null>(null);
  const action = useRef<Action>(null);
  const dragIndex = useRef<number>(-1);

  const rect = () => wrapRef.current!.getBoundingClientRect();

  const startMove = (e: ReactPointerEvent, i: number) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setSel(i);
    dragIndex.current = i;
    action.current = {
      type: "move",
      px: e.clientX,
      py: e.clientY,
      ox: slots[i].x,
      oy: slots[i].y,
    };
  };

  const startResize = (e: ReactPointerEvent, i: number) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setSel(i);
    dragIndex.current = i;
    action.current = {
      type: "resize",
      px: e.clientX,
      py: e.clientY,
      ow: slots[i].w,
      oh: slots[i].h,
    };
  };

  const onMove = (e: ReactPointerEvent) => {
    const a = action.current;
    const i = dragIndex.current;
    if (!a || i < 0) return;
    const r = rect();
    const dx = (e.clientX - a.px) / r.width;
    const dy = (e.clientY - a.py) / r.height;
    const s = slots[i];
    let next: TemplateSlot;
    if (a.type === "move") {
      next = {
        ...s,
        x: clamp(a.ox + dx, 0, 1 - s.w),
        y: clamp(a.oy + dy, 0, 1 - s.h),
      };
    } else {
      next = {
        ...s,
        w: clamp(a.ow + dx, MIN, 1 - s.x),
        h: clamp(a.oh + dy, MIN, 1 - s.y),
      };
    }
    onChange(slots.map((v, j) => (j === i ? next : v)));
  };

  const onUp = () => {
    action.current = null;
    dragIndex.current = -1;
  };

  const addBox = () => {
    // Stagger new boxes so they don't stack exactly.
    const n = slots.length;
    const off = (n % 4) * 0.04;
    onChange([...slots, { x: 0.28 + off, y: 0.28 + off, w: 0.4, h: 0.34 }]);
    setSel(slots.length);
  };

  const removeBox = (i: number) => {
    onChange(slots.filter((_, j) => j !== i));
    setSel(null);
  };

  return (
    <div>
      <div
        ref={wrapRef}
        className="relative w-full touch-none select-none overflow-hidden rounded-lg border border-cocoa/10 bg-cocoa/5"
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerDown={() => setSel(null)}
      >
        <img
          src={image}
          alt=""
          draggable={false}
          className="block w-full"
        />
        {slots.map((s, i) => {
          const on = sel === i;
          return (
            <div
              key={i}
              onPointerDown={(e) => startMove(e, i)}
              className={cn(
                "absolute cursor-move rounded-[3px] border-2",
                on
                  ? "border-[rgb(var(--brand-a))] bg-[rgb(var(--brand-a))]/15"
                  : "border-white/90 bg-black/10",
              )}
              style={{
                left: `${s.x * 100}%`,
                top: `${s.y * 100}%`,
                width: `${s.w * 100}%`,
                height: `${s.h * 100}%`,
              }}
            >
              <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[rgb(var(--brand-a))] text-[11px] font-bold text-white shadow">
                {i + 1}
              </span>
              {on && (
                <>
                  <button
                    type="button"
                    aria-label={`Remove box ${i + 1}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => removeBox(i)}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[11px] font-bold text-white shadow"
                  >
                    ×
                  </button>
                  <span
                    onPointerDown={(e) => startResize(e, i)}
                    className="absolute bottom-0 right-0 h-5 w-5 translate-x-1/2 translate-y-1/2 cursor-nwse-resize rounded-full border-2 border-[rgb(var(--brand-a))] bg-white shadow"
                    style={{ touchAction: "none" }}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={addBox}
          className="rounded-full brand-fill px-4 py-1.5 text-xs font-bold text-white shadow"
        >
          + Add box
        </button>
        <span className="text-xs text-cocoa/50">
          {slots.length} photo{slots.length === 1 ? "" : "s"} · drag to move,
          corner to resize
        </span>
      </div>
    </div>
  );
}
