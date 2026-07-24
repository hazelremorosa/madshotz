import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Small shared controls for the Admin panel — plain, dense, host-facing. */

export function Section({
  emoji,
  title,
  note,
  children,
}: {
  emoji: string;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="glass-strong rounded-xl2 p-4 shadow-glass">
      <header className="mb-3 flex items-baseline gap-2">
        <span aria-hidden className="text-base">
          {emoji}
        </span>
        <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-cocoa">
          {title}
        </h3>
      </header>
      {note && <p className="-mt-1 mb-3 text-xs leading-snug text-cocoa/50">{note}</p>}
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function Row({
  label,
  hint,
  children,
  stacked,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  /** Put the control on its own line — for wide controls (chips, segments). */
  stacked?: boolean;
}) {
  return (
    <div
      className={cn(
        "gap-2",
        stacked ? "flex flex-col" : "flex items-center justify-between",
      )}
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold text-cocoa">{label}</div>
        {hint && <div className="text-xs leading-snug text-cocoa/50">{hint}</div>}
      </div>
      <div className={cn(stacked ? "w-full" : "shrink-0")}>{children}</div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full transition-colors",
        checked ? "brand-fill shadow-bloom" : "bg-cocoa/20",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all",
          checked ? "left-[1.375rem]" : "left-0.5",
        )}
      />
    </button>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex w-full gap-1 rounded-full bg-cocoa/10 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-full px-2 py-1.5 text-xs font-semibold transition-colors",
            value === o.value ? "brand-fill text-white shadow" : "text-cocoa/60",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "brand-fill border-transparent text-white shadow"
          : "border-cocoa/15 bg-white/60 text-cocoa/50",
      )}
    >
      {children}
    </button>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  maxLength = 28,
  mono,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  maxLength?: number;
  mono?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      className={cn(
        "w-full rounded-xl border border-cocoa/15 bg-white/80 px-3 py-2 text-sm text-cocoa outline-none placeholder:text-cocoa/30 focus:border-[rgb(var(--brand-a))]",
        mono && "font-mono tracking-widest",
      )}
    />
  );
}

export function SmallButton({
  onClick,
  children,
  tone = "ghost",
}: {
  onClick: () => void;
  children: ReactNode;
  tone?: "ghost" | "brand" | "danger";
}) {
  const tones = {
    ghost: "border-cocoa/15 bg-white/70 text-cocoa",
    brand: "border-transparent brand-fill text-white shadow",
    danger: "border-red-300/60 bg-red-50 text-red-600",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-4 py-2 text-xs font-bold transition-colors",
        tones[tone],
      )}
    >
      {children}
    </button>
  );
}
