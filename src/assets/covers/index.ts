import cover1 from "./cover-1.gif";
import cover2 from "./cover-2.gif";
import cover9 from "./cover-9.gif";
import cover10 from "./cover-10.gif";
import cover3 from "./cover-3.gif";
import cover4 from "./cover-4.gif";
import cover5 from "./cover-5.gif";
import cover6 from "./cover-6.gif";
import cover7 from "./cover-7.gif";
import cover8 from "./cover-8.gif";

/** Ready-made home pages bundled with the app, selectable from Admin. */
export interface BuiltInCover {
  id: string;
  name: string;
  url: string;
}

export const BUILT_IN_COVERS: BuiltInCover[] = [
  { id: "cover-1", name: "Cover 1", url: cover1 },
  { id: "cover-2", name: "Cover 2", url: cover2 },
  { id: "cover-9", name: "Cover 3", url: cover9 },
  { id: "cover-10", name: "Cover 4", url: cover10 },
  { id: "cover-3", name: "Aurora", url: cover3 },
  { id: "cover-4", name: "Polaroid", url: cover4 },
  { id: "cover-5", name: "Film Roll", url: cover5 },
  { id: "cover-6", name: "Synthwave", url: cover6 },
  { id: "cover-7", name: "Party Pop", url: cover7 },
  { id: "cover-8", name: "Mono", url: cover8 },
];

/** "classic" is the original Mad Shots screen, not a file. */
export type WelcomeCoverId = "classic" | (typeof BUILT_IN_COVERS)[number]["id"];

export function builtInCover(id: string): BuiltInCover | null {
  return BUILT_IN_COVERS.find((c) => c.id === id) ?? null;
}

/**
 * A crop rectangle over a bundled cover, as fractions of the picture (0–1).
 *
 * Non-destructive: the GIF file is never re-cut, so it keeps animating and
 * stays small — the guest screen just shows this region of it. The rectangle's
 * shape is locked to the guest screen (`GUEST_ASPECT`), so only its left/top
 * and width are stored; the height follows.
 */
export interface CoverCrop {
  l: number;
  t: number;
  w: number;
}

/** Every bundled cover is a 9:16 portrait GIF (width ÷ height). */
export const COVER_ASPECT = 9 / 16;
/** The guest screen's design box is ~540×780. */
export const GUEST_ASPECT = 540 / 780;
/** Smallest crop width — past this a 360px-wide GIF is just blurry pixels. */
export const MIN_CROP_W = 0.25;

/** Crop height as a fraction of the picture's height. */
export const cropHeight = (w: number) => (w * COVER_ASPECT) / GUEST_ASPECT;

/** Saved crops from older builds (a pan/zoom shape) are ignored, not trusted. */
export function validCrop(c: unknown): CoverCrop | null {
  const k = c as Partial<CoverCrop> | null | undefined;
  if (!k || typeof k.l !== "number" || typeof k.t !== "number" || typeof k.w !== "number") {
    return null;
  }
  return k as CoverCrop;
}
