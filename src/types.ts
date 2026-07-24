export type ScreenId =
  | "boot"
  | "welcome"
  | "layout"
  | "capture"
  | "review"
  | "frames"
  | "filter"
  | "editor"
  | "preview"
  | "printing"
  | "qr";

/** RGB triplet string, e.g. "255 77 141". */
export type Rgb = `${number} ${number} ${number}`;

export interface Theme {
  id: string;
  name: string;
  tagline: string;
  emoji: string;
  brand: [Rgb, Rgb, Rgb];
  /** Default filter applied when the guest skips the filter step. */
  defaultFilter: string;
  /** Sticker ids featured for this theme (emoji-based, offline-safe). */
  stickers: string[];
  /** Receipt header line. */
  header: string;
}

export interface LayoutDef {
  id: string;
  name: string;
  shots: number;
  /** How frames are arranged on the receipt. */
  kind: "single" | "strip" | "grid" | "row" | "magazine";
  /** Aspect ratio (w/h) of a single captured frame. */
  frameAspect: number;
  /** Aspect ratio (w/h) of the whole receipt composite. */
  paperAspect: number;
}

export interface FilterDef {
  id: string;
  name: string;
  /** CSS filter string applied live + baked into the composite. */
  css: string;
}

export type PhotoShape = "rounded" | "circle" | "arch" | "heart" | "sharp";

/** The mat/frame behind the photos — a solid color or a repeating pattern. */
export interface FrameStyle {
  id: string;
  name: string;
  kind: "color" | "pattern";
  /** CSS background for the DOM preview. */
  bg: string;
  /** Base fill color used by the canvas compositor. */
  base: string;
  /** For emoji-tiled patterns (hearts/stars). */
  emoji?: string;
  /** For geometric patterns drawn on canvas. */
  motif?: "dots" | "stripes" | "checks";
}

export interface Sticker {
  id: string;
  glyph: string;
  label: string;
}

/** A named, tabbed set of stickers in the editor (themed or seasonal). */
export interface StickerPack {
  id: string;
  name: string;
  /** Emoji shown on the pack's tab. */
  tab: string;
  /** Seasonal packs are surfaced with a subtle badge. */
  seasonal?: boolean;
  glyphs: string[];
}

export type PlacedKind = "sticker" | "text";

export interface PlacedItem {
  id: string;
  kind: PlacedKind;
  /** Sticker glyph or the text content. */
  content: string;
  /** Normalized center position on the paper (0..1). */
  x: number;
  y: number;
  scale: number;
  rotation: number;
  z: number;
}

export interface CapturedPhoto {
  id: string;
  /** JPEG data URL, already un-mirrored for the composite. */
  dataUrl: string;
}
