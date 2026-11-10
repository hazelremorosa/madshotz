import type { LayoutDef } from "@/types";

export const LAYOUTS: LayoutDef[] = [
  {
    id: "single",
    name: "Single",
    shots: 1,
    kind: "single",
    frameAspect: 4 / 5,
    paperAspect: 4 / 5,
  },
  {
    id: "4r",
    name: "4R Photo",
    shots: 1,
    kind: "single",
    // 4×6 in portrait — the standard 4R print.
    frameAspect: 2 / 3,
    paperAspect: 2 / 3,
  },
  {
    id: "duo",
    name: "2 Strip",
    shots: 2,
    kind: "strip",
    frameAspect: 4 / 3,
    paperAspect: 3 / 5,
  },
  {
    id: "strip",
    name: "3 Strip",
    shots: 3,
    kind: "strip",
    frameAspect: 4 / 3,
    // A true 2×6" strip (50.8 × 152.4 mm). It used to be 2:5, which left a band
    // of white above and below once two strips were laid on a 4×6 sheet.
    paperAspect: 1 / 3,
  },
  {
    id: "quad",
    name: "4 Strip",
    shots: 4,
    kind: "strip",
    frameAspect: 4 / 3,
    paperAspect: 1 / 3,
  },
  {
    id: "grid",
    name: "4 Grid",
    shots: 4,
    kind: "grid",
    frameAspect: 1,
    paperAspect: 4 / 5,
  },
  {
    id: "magazine",
    name: "Magazine",
    shots: 3,
    kind: "magazine",
    frameAspect: 4 / 5,
    paperAspect: 4 / 5,
  },
];

export const DEFAULT_LAYOUT = LAYOUTS.find((l) => l.id === "strip")!; // 3 Strip
