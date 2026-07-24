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
  brandSlot: TemplateSlot;
  qrSlot: TemplateSlot;
  onChange: (patch: {
    slots?: TemplateSlot[];
    brandSlot?: TemplateSlot;
    qrSlot?: TemplateSlot;
  }) => void;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

const MIN = 0.05;

type Target = number | "brand" | "qr";
type Action =
  | { type: "move"; px: number; py: number; ox: number; oy: number }
  | { type: "resize"; px: number; py: number; ow: number; oh: number }
  | null;

/**
 * Drag/resize the photo-slot boxes plus the reserved branding + QR boxes over an
 * uploaded template. All are stored as fractions (0..1) of the design.
 */
export function TemplateSlotEditor({
  image,
  slots,
  brandSlot,
  qrSlot,
  onChange,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<Target | null>(null);
  const action = useRef<Action>(null);
  const target = useRef<Target | null>(null);

  const rect = () => wrapRef.current!.getBoundingClientRect();
  const getSlot = (t: Target): TemplateSlot =>
    t === "brand" ? brandSlot : t === "qr" ? qrSlot : slots[t];
  const emit = (t: Target, next: TemplateSlot) => {
    if (t === "brand") onChange({ brandSlot: next });
    else if (t === "qr") onChange({ qrSlot: next });
    else onChange({ slots: slots.map((v, j) => (j === t ? next : v)) });
  };

  const startMove = (e: ReactPointerEvent, t: Target) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setSel(t);
    target.current = t;
    const s = getSlot(t);
    action.current = { type: "move", px: e.clientX, py: e.clientY, ox: s.x, oy: s.y };
  };

  const startResize = (e: ReactPointerEvent, t: Target) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setSel(t);
    target.current = t;
    const s = getSlot(t);
    action.current = { type: "resize", px: e.clientX, py: e.clientY, ow: s.w, oh: s.h };
  };

  const onMove = (e: ReactPointerEvent) => {
    const a = action.current;
    const t = target.current;
    if (!a || t === null) return;
    const r = rect();
    const dx = (e.clientX - a.px) / r.width;
    const dy = (e.clientY - a.py) / r.height;
    const s = getSlot(t);
    const next: TemplateSlot =
      a.type === "move"
        ? { ...s, x: clamp(a.ox + dx, 0, 1 - s.w), y: clamp(a.oy + dy, 0, 1 - s.h) }
        : { ...s, w: clamp(a.ow + dx, MIN, 1 - s.x), h: clamp(a.oh + dy, MIN, 1 - s.y) };
    emit(t, next);
  };

  const onUp = () => {
    action.current = null;
    target.current = null;
  };

  const addBox = () => {
    const n = slots.length;
    const off = (n % 4) * 0.04;
    onChange({ slots: [...slots, { x: 0.28 + off, y: 0.28 + off, w: 0.4, h: 0.34 }] });
    setSel(slots.length);
  };
  const removeBox = (i: number) => {
    onChange({ slots: slots.filter((_, j) => j !== i) });
    setSel(null);
  };

  const specials: { t: "brand" | "qr"; slot: TemplateSlot; label: string; cls: string }[] = [
    { t: "brand", slot: brandSlot, label: "MAD SHOTS", cls: "border-amber-400 bg-amber-400/20" },
    { t: "qr", slot: qrSlot, label: "QR", cls: "border-cocoa/70 bg-cocoa/20" },
  ];

  const box = (
    t: Target,
    slot: TemplateSlot,
    on: boolean,
    body: React.ReactNode,
    extraCls: string,
    resizeCls: string,
    removable?: () => void,
  ) => (
    <div
      onPointerDown={(e) => startMove(e, t)}
      className={cn(
        "absolute cursor-move rounded-[3px] border-2",
        extraCls,
        on && "ring-2 ring-white",
      )}
      style={{
        left: `${slot.x * 100}%`,
        top: `${slot.y * 100}%`,
        width: `${slot.w * 100}%`,
        height: `${slot.h * 100}%`,
      }}
    >
      {body}
      {on && removable && (
        <button
          type="button"
          aria-label="Remove box"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={removable}
          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[11px] font-bold text-white shadow"
        >
          ×
        </button>
      )}
      {on && (
        <span
          onPointerDown={(e) => startResize(e, t)}
          className={cn(
            "absolute bottom-0 right-0 h-5 w-5 translate-x-1/2 translate-y-1/2 cursor-nwse-resize rounded-full border-2 bg-white shadow",
            resizeCls,
          )}
          style={{ touchAction: "none" }}
        />
      )}
    </div>
  );

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
        <img src={image} alt="" draggable={false} className="block w-full" />

        {slots.map((s, i) =>
          box(
            i,
            s,
            sel === i,
            <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[rgb(var(--brand-a))] text-[11px] font-bold text-white shadow">
              {i + 1}
            </span>,
            sel === i
              ? "border-[rgb(var(--brand-a))] bg-[rgb(var(--brand-a))]/15"
              : "border-white/90 bg-black/10",
            "border-[rgb(var(--brand-a))]",
            () => removeBox(i),
          ),
        )}

        {specials.map(({ t, slot, label, cls }) =>
          box(
            t,
            slot,
            sel === t,
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-bold uppercase tracking-wider text-cocoa/80">
              {label}
            </span>,
            cls,
            "border-amber-400",
          ),
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addBox}
          className="rounded-full brand-fill px-4 py-1.5 text-xs font-bold text-white shadow"
        >
          + Add photo box
        </button>
        <span className="text-xs text-cocoa/50">
          {slots.length} photo{slots.length === 1 ? "" : "s"} · the amber MAD SHOTS
          + QR boxes are always included
        </span>
      </div>
    </div>
  );
}
