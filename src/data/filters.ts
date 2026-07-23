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
