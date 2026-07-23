import type { FrameStyle, PhotoShape } from "@/types";

// Emoji-tiled pattern background as an inline SVG data URI.
function emojiTile(emoji: string, size = 26, rotate = -12): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><text x='50%' y='55%' font-size='${size * 0.62}' text-anchor='middle' dominant-baseline='middle' transform='rotate(${rotate} ${size / 2} ${size / 2})'>${emoji}</text></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export const FRAME_STYLES: FrameStyle[] = [
  // ── Colors ──
  { id: "cream", name: "Cream", kind: "color", bg: "#fffdf8", base: "#fffdf8" },
  { id: "blush", name: "Blush", kind: "color", bg: "#ffdfeb", base: "#ffdfeb" },
  { id: "butter", name: "Butter", kind: "color", bg: "#fff1c4", base: "#fff1c4" },
  { id: "mint", name: "Mint", kind: "color", bg: "#d4f3e4", base: "#d4f3e4" },
  { id: "sky", name: "Sky", kind: "color", bg: "#d9edff", base: "#d9edff" },
  { id: "lilac", name: "Lilac", kind: "color", bg: "#e9e0ff", base: "#e9e0ff" },

  // ── Patterns ──
  {
    id: "dots",
    name: "Dots",
    kind: "pattern",
    base: "#fff2f8",
    motif: "dots",
    bg: "radial-gradient(#ffb3d1 2.2px, transparent 2.3px) 0 0/13px 13px, #fff2f8",
  },
  {
    id: "stripes",
    name: "Stripes",
    kind: "pattern",
    base: "#ffffff",
    motif: "stripes",
    bg: "repeating-linear-gradient(45deg, #ffe1ec 0 9px, #ffffff 9px 18px)",
  },
  {
    id: "checks",
    name: "Gingham",
    kind: "pattern",
    base: "#ffffff",
    motif: "checks",
    bg: "conic-gradient(#ffd7e6 0 25%, #ffffff 0 50%) 0 0/18px 18px",
  },
  {
    id: "hearts",
    name: "Hearts",
    kind: "pattern",
    base: "#fff2f7",
    emoji: "💗",
    bg: `${emojiTile("💗")} 0 0/26px 26px, #fff2f7`,
  },
  {
    id: "stars",
    name: "Stars",
    kind: "pattern",
    base: "#f2f6ff",
    emoji: "⭐",
    bg: `${emojiTile("⭐")} 0 0/26px 26px, #f2f6ff`,
  },
];

export const DEFAULT_FRAME_STYLE = FRAME_STYLES[0]; // Cream

export const FRAME_STYLE_BY_ID = (id: string): FrameStyle =>
  FRAME_STYLES.find((f) => f.id === id) ?? FRAME_STYLES[0];

export interface ShapeDef {
  id: PhotoShape;
  name: string;
  emoji: string;
}

export const PHOTO_SHAPES: ShapeDef[] = [
  { id: "rounded", name: "Rounded", emoji: "▢" },
  { id: "circle", name: "Circle", emoji: "◯" },
  { id: "arch", name: "Arch", emoji: "⌓" },
  { id: "heart", name: "Heart", emoji: "♡" },
  { id: "sharp", name: "Sharp", emoji: "▧" },
];

/** CSS border-radius for a shape (used for rounded/circle/arch/sharp). */
export function shapeRadius(shape: PhotoShape): string {
  switch (shape) {
    case "rounded":
      return "18px";
    case "circle":
      return "50%";
    case "arch":
      return "48% 48% 14px 14px / 42% 42% 14px 14px";
    case "sharp":
      return "3px";
    case "heart":
      return "0";
  }
}
