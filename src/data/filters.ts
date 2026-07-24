import type { FilterDef } from "@/types";

/**
 * CSS filter grades. The exact same string is applied to the live <video>,
 * the preview, and baked into the exported composite (ctx.filter), so what the
 * guest picks is exactly what they get.
 */
export const FILTERS: FilterDef[] = [
  { id: "natural", name: "Natural", css: "none" },
  {
    id: "warm",
    name: "Warm",
    css: "saturate(1.15) contrast(1.05) sepia(0.18) brightness(1.03)",
  },
  {
    id: "vintage",
    name: "Vintage",
    css: "sepia(0.45) saturate(0.9) contrast(0.95) brightness(1.05) hue-rotate(-10deg)",
  },
  {
    id: "film",
    name: "Film",
    css: "contrast(1.15) saturate(0.85) brightness(0.98) sepia(0.12)",
  },
  { id: "bw", name: "B&W", css: "grayscale(1) contrast(1.1) brightness(1.03)" },
  {
    id: "soft",
    name: "Soft",
    css: "saturate(1.05) contrast(0.92) brightness(1.08) blur(0.3px)",
  },
  {
    id: "korean",
    name: "Korean",
    css: "saturate(1.08) contrast(0.95) brightness(1.12) sepia(0.05)",
  },
  {
    id: "cold",
    name: "Cold",
    css: "saturate(1.1) contrast(1.08) brightness(1.02) hue-rotate(15deg)",
  },
];

export const FILTER_BY_ID = (id: string): FilterDef =>
  FILTERS.find((f) => f.id === id) ?? FILTERS[0];

/**
 * Subtle skin-smoothing look, layered on top of the chosen filter when the
 * Beauty toggle is on. A soft micro-blur plus a gentle brightness/contrast lift
 * reads as smoother skin without a heavyweight per-pixel bilateral pass — and it
 * bakes into the composite for free since the whole pipeline uses CSS filters.
 */
export const BEAUTY_CSS = "blur(0.7px) brightness(1.04) saturate(1.05) contrast(0.98)";

/** Identity value each CSS filter function collapses to at intensity 0. */
const FILTER_IDENTITY: Record<string, number> = {
  saturate: 1,
  contrast: 1,
  brightness: 1,
  opacity: 1,
  sepia: 0,
  grayscale: 0,
  invert: 0,
  blur: 0,
  "hue-rotate": 0,
};

/**
 * Dials a filter up or down by lerping every function value toward its identity.
 * intensity 1 → the filter as authored, 0 → no visible effect. Unknown functions
 * are passed through untouched.
 */
export function scaleFilterCss(css: string, intensity: number): string {
  if (!css || css === "none") return "none";
  const t = Math.max(0, Math.min(1, intensity));
  if (t >= 1) return css;
  return css.replace(
    /([a-z-]+)\(\s*(-?[\d.]+)([a-z%]*)\s*\)/gi,
    (whole, fn: string, num: string, unit: string) => {
      const identity = FILTER_IDENTITY[fn.toLowerCase()];
      if (identity === undefined) return whole;
      const scaled = identity + (parseFloat(num) - identity) * t;
      return `${fn}(${Math.round(scaled * 1000) / 1000}${unit})`;
    },
  );
}

/**
 * The single source of truth for the CSS filter applied to the live camera,
 * every preview, and the exported composite. Combines the chosen filter (scaled
 * by intensity) with the optional beauty layer.
 */
export function activeFilterCss(
  id: string,
  intensity = 1,
  beauty = false,
): string {
  const base = scaleFilterCss(FILTER_BY_ID(id).css, intensity);
  const parts: string[] = [];
  if (base && base !== "none") parts.push(base);
  if (beauty) parts.push(BEAUTY_CSS);
  return parts.length ? parts.join(" ") : "none";
}
