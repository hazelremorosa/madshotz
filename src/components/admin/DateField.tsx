import { useState } from "react";
import { cn } from "@/lib/cn";

interface Props {
  /** yyyy-mm-dd (empty = none). */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function iso(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
function parse(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { y: +match[1], m: +match[2] - 1, d: +match[3] };
}
function pretty(value: string): string {
  const p = parse(value);
  if (!p) return "";
  return `${MONTHS[p.m].slice(0, 3)} ${p.d}, ${p.y}`;
}

/** A modern, brand-styled date picker replacing the native <input type=date>. */
export function DateField({ value, onChange, placeholder = "Pick a date" }: Props) {
  const [open, setOpen] = useState(false);
  const sel = parse(value);
  const today = new Date();
  const [view, setView] = useState(() => {
    const p = sel ?? { y: today.getFullYear(), m: today.getMonth() };
    return { y: p.y, m: p.m };
  });

  const first = new Date(view.y, view.m, 1).getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];

  const step = (delta: number) => {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };

  const isToday = (d: number) =>
    view.y === today.getFullYear() &&
    view.m === today.getMonth() &&
    d === today.getDate();
  const isSel = (d: number) =>
    !!sel && sel.y === view.y && sel.m === view.m && sel.d === d;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-2 rounded-xl border border-cocoa/15 bg-white/80 px-3 py-2 text-left text-sm outline-none transition-colors focus:border-[rgb(var(--brand-a))]",
          open && "border-[rgb(var(--brand-a))]",
        )}
      >
        <span aria-hidden>📅</span>
        <span className={cn("flex-1", value ? "text-cocoa" : "text-cocoa/40")}>
          {value ? pretty(value) : placeholder}
        </span>
        {value && (
          <span
            role="button"
            aria-label="Clear date"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="text-cocoa/40"
          >
            ✕
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="glass-strong absolute left-0 top-full z-50 mt-1 w-[17rem] rounded-2xl p-3 shadow-float">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => step(-1)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-cocoa/60 active:bg-cocoa/10"
              >
                ‹
              </button>
              <span className="text-sm font-bold text-cocoa">
                {MONTHS[view.m]} {view.y}
              </span>
              <button
                type="button"
                onClick={() => step(1)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-cocoa/60 active:bg-cocoa/10"
              >
                ›
              </button>
            </div>
            <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-semibold uppercase text-cocoa/40">
              {WEEKDAYS.map((w, i) => (
                <span key={i}>{w}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((d, i) =>
                d === null ? (
                  <span key={i} />
                ) : (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      onChange(iso(view.y, view.m, d));
                      setOpen(false);
                    }}
                    className={cn(
                      "flex h-8 items-center justify-center rounded-full text-sm transition-colors",
                      isSel(d)
                        ? "brand-fill font-bold text-white shadow"
                        : isToday(d)
                          ? "font-bold text-[rgb(var(--brand-a))]"
                          : "text-cocoa hover:bg-cocoa/5",
                    )}
                  >
                    {d}
                  </button>
                ),
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
