/**
 * Decorative PNG-style frame overlays — a transparent graphic layered on top of
 * the whole receipt (above the photos, below the guest's stickers/text).
 *
 * Every overlay is generated as an inline SVG data URI sized to the paper's
 * aspect ratio, so the *same* string renders 1:1 in the DOM (`<img>`) and in the
 * canvas compositor (`drawImage`) with no stretching — and it stays offline,
 * asset-free, exactly like the frame patterns in `data/frames.ts`.
 */

/** Event bucket the overlay is filed under in the picker. */
export type OverlayCategory =
  | "Classic"
  | "Wedding"
  | "Birthday"
  | "Christening"
  | "Baby";

/** Category tabs, in display order. */
export const OVERLAY_CATEGORIES: OverlayCategory[] = [
  "Classic",
  "Wedding",
  "Birthday",
  "Christening",
  "Baby",
];

/** Per-event accent used by photo templates and event borders. */
export const ACCENT_BY_CATEGORY: Record<OverlayCategory, string> = {
  Classic: "#e8749b",
  Wedding: "#caa54e",
  Birthday: "#ff6d94",
  Christening: "#7fb3e0",
  Baby: "#9cc6ea",
};

/**
 * Customization fed into a photo-template overlay: the host's uploaded feature
 * photo (couple/celebrant) plus title/subtitle text and an accent colour.
 */
export interface OverlayOpts {
  photo?: string | null;
  title?: string;
  subtitle?: string;
  accent?: string;
}

export interface OverlayDef {
  id: string;
  name: string;
  /** Emoji shown on the picker chip. */
  emoji: string;
  /** Which event bucket this frame belongs to. */
  category: OverlayCategory;
  /** Builds an SVG data URI for a paper of the given aspect (w/h). null = none. */
  svg: ((aspect: number, opts?: OverlayOpts) => string) | null;
}

/** A photo template — an overlay that embeds a host-supplied photo + text. */
export interface OverlayTemplate {
  id: string;
  name: string;
  emoji: string;
  svg: (aspect: number, opts?: OverlayOpts) => string;
}

/** Nominal canvas width the SVGs are authored at; height follows the aspect. */
const W = 1000;

function wrap(aspect: number, body: (w: number, h: number) => string): string {
  const w = W;
  const h = Math.round(W / aspect);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' ` +
    `width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body(w, h)}</svg>`;
  // encodeURIComponent escapes '#', quotes, etc. so the data URI is always valid.
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Escapes XML-special characters in host text before it goes into <text>. */
function esc(s: string): string {
  return (s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[
        c
      ] as string,
  );
}

/** Unit heart (x:0..1, y:0.02..0.86, visual center ≈ 0.5,0.44). */
const HEART_D =
  "M0.5 0.86C0.16 0.62 0 0.42 0 0.24C0 0.09 0.12 0.02 0.26 0.02C0.37 0.02 " +
  "0.46 0.09 0.5 0.2C0.54 0.09 0.63 0.02 0.74 0.02C0.88 0.02 1 0.09 1 0.24C1 " +
  "0.42 0.84 0.62 0.5 0.86Z";

function heart(x: number, y: number, s: number, fill: string, rot = 0): string {
  // Coords apply right-to-left: center → rotate → scale → move into place.
  return `<path d='${HEART_D}' fill='${fill}' transform='translate(${f(x)} ${f(y)}) scale(${f(s)}) rotate(${rot}) translate(-0.5 -0.44)'/>`;
}

function starPoints(cx: number, cy: number, r: number, spikes = 5): string {
  let pts = "";
  let rot = -Math.PI / 2;
  const step = Math.PI / spikes;
  for (let i = 0; i < spikes * 2; i++) {
    const rr = i % 2 ? r * 0.42 : r;
    pts += `${f(cx + Math.cos(rot) * rr)},${f(cy + Math.sin(rot) * rr)} `;
    rot += step;
  }
  return pts.trim();
}

/** Small deterministic PRNG so a "scatter" overlay looks the same every render. */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const f = (n: number) => Math.round(n * 100) / 100;

// ── Overlay builders ─────────────────────────────────────────────────────────

function goldBorder(w: number, h: number): string {
  const m = w * 0.028;
  return (
    `<rect x='${f(m)}' y='${f(m)}' width='${f(w - 2 * m)}' height='${f(h - 2 * m)}' rx='20' fill='none' stroke='#caa54e' stroke-width='7'/>` +
    `<rect x='${f(m + 15)}' y='${f(m + 15)}' width='${f(w - 2 * m - 30)}' height='${f(h - 2 * m - 30)}' rx='14' fill='none' stroke='#e6cd86' stroke-width='2' stroke-dasharray='3 9'/>`
  );
}

function heartsBorder(w: number, h: number): string {
  const s = w * 0.07;
  const pad = w * 0.045;
  const cols = ["#ff8fb3", "#ff6d94", "#ffa9c4"];
  const out: string[] = [];
  let k = 0;
  const tilt = (i: number) => (i % 2 ? -12 : 12);
  const cols4 = 8;
  for (let i = 0; i < cols4; i++) {
    const x = pad + (i / (cols4 - 1)) * (w - 2 * pad);
    out.push(heart(x, pad, s, cols[k++ % 3], tilt(i)));
    out.push(heart(x, h - pad, s, cols[k++ % 3], -tilt(i)));
  }
  const rows = Math.max(2, Math.round((h - 2 * pad) / (s * 2.4)));
  for (let i = 1; i < rows; i++) {
    const y = pad + (i / rows) * (h - 2 * pad);
    out.push(heart(pad, y, s, cols[k++ % 3], tilt(i)));
    out.push(heart(w - pad, y, s, cols[k++ % 3], -tilt(i)));
  }
  return out.join("");
}

function starsCorners(w: number, h: number): string {
  const cols = ["#ffd166", "#ffb703", "#fff1b8"];
  const R = w * 0.05;
  const out: string[] = [];
  // Three stars fanned into each corner.
  const cluster = (ox: number, oy: number, sx: number, sy: number) => {
    const spots: [number, number, number][] = [
      [0, 0, 1],
      [R * 1.7, R * 1.2, 0.62],
      [R * 1.1, R * 2.1, 0.48],
    ];
    spots.forEach(([dx, dy, sc], i) => {
      out.push(
        `<polygon points='${starPoints(ox + sx * dx, oy + sy * dy, R * sc)}' fill='${cols[i % 3]}'/>`,
      );
    });
  };
  const mx = w * 0.07;
  const my = h * 0.05;
  cluster(mx, my, 1, 1);
  cluster(w - mx, my, -1, 1);
  cluster(mx, h - my, 1, -1);
  cluster(w - mx, h - my, -1, -1);
  return out.join("");
}

function filmStrip(w: number, h: number): string {
  const barW = w * 0.05;
  const holeW = barW * 0.5;
  const holeH = h * 0.028;
  const n = Math.max(6, Math.round(h / (holeH * 2.4)));
  let holes = "";
  const gap = (barW - holeW) / 2;
  for (let i = 0; i < n; i++) {
    const y = (i + 0.5) * (h / n) - holeH / 2;
    holes +=
      `<rect x='${f(gap)}' y='${f(y)}' width='${f(holeW)}' height='${f(holeH)}' rx='4' fill='#fdfdfd'/>` +
      `<rect x='${f(w - barW + gap)}' y='${f(y)}' width='${f(holeW)}' height='${f(holeH)}' rx='4' fill='#fdfdfd'/>`;
  }
  return (
    `<rect x='0' y='0' width='${f(barW)}' height='${f(h)}' fill='#1d1d24'/>` +
    `<rect x='${f(w - barW)}' y='0' width='${f(barW)}' height='${f(h)}' fill='#1d1d24'/>` +
    holes
  );
}

// ── Small shape helpers (shared by the event-themed frames) ──────────────────

const circle = (cx: number, cy: number, r: number, fill: string) =>
  `<circle cx='${f(cx)}' cy='${f(cy)}' r='${f(r)}' fill='${fill}'/>`;

const ring = (cx: number, cy: number, r: number, stroke: string, sw: number) =>
  `<circle cx='${f(cx)}' cy='${f(cy)}' r='${f(r)}' fill='none' stroke='${stroke}' stroke-width='${f(sw)}'/>`;

const ellipse = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: string,
  rot = 0,
) =>
  `<ellipse cx='${f(cx)}' cy='${f(cy)}' rx='${f(rx)}' ry='${f(ry)}' fill='${fill}' transform='rotate(${f(rot)} ${f(cx)} ${f(cy)})'/>`;

const star = (cx: number, cy: number, r: number, fill: string) =>
  `<polygon points='${starPoints(cx, cy, r)}' fill='${fill}'/>`;

function crossMark(cx: number, cy: number, s: number, fill: string): string {
  const t = s * 0.32;
  return (
    `<rect x='${f(cx - t / 2)}' y='${f(cy - s)}' width='${f(t)}' height='${f(s * 2)}' rx='${f(t * 0.3)}' fill='${fill}'/>` +
    `<rect x='${f(cx - s * 0.7)}' y='${f(cy - s * 0.35)}' width='${f(s * 1.4)}' height='${f(t)}' rx='${f(t * 0.3)}' fill='${fill}'/>`
  );
}

function laceRun(w: number, h: number, color: string, op: number): string {
  const m = w * 0.022;
  const r = w * 0.022;
  const step = r * 1.7;
  const out: string[] = [];
  const run = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const cnt = Math.max(1, Math.round(len / step));
    for (let i = 0; i <= cnt; i++) {
      const t = i / cnt;
      out.push(
        `<circle cx='${f(x1 + (x2 - x1) * t)}' cy='${f(y1 + (y2 - y1) * t)}' r='${f(r)}' fill='${color}' opacity='${op}'/>`,
      );
    }
  };
  run(m, m, w - m, m);
  run(m, h - m, w - m, h - m);
  run(m, m, m, h - m);
  run(w - m, m, w - m, h - m);
  return out.join("");
}

// ── Wedding ──────────────────────────────────────────────────────────────────

function weddingRings(w: number, h: number): string {
  const parts = [goldBorder(w, h)];
  const r = w * 0.045;
  const sw = w * 0.013;
  const gold = "#caa54e";
  const pair = (cy: number) => {
    parts.push(ring(w / 2 - r * 0.7, cy, r, gold, sw));
    parts.push(ring(w / 2 + r * 0.7, cy, r, gold, sw));
  };
  pair(h * 0.06);
  pair(h * 0.94);
  return parts.join("");
}

function rose(cx: number, cy: number, s: number): string {
  return (
    circle(cx, cy, s, "#f7b8cf") +
    circle(cx - s * 0.4, cy - s * 0.2, s * 0.55, "#ffcfe0") +
    circle(cx + s * 0.4, cy - s * 0.2, s * 0.55, "#ffcfe0") +
    circle(cx, cy + s * 0.35, s * 0.5, "#ffcfe0") +
    circle(cx, cy, s * 0.4, "#e8749b")
  );
}

function weddingFloral(w: number, h: number): string {
  const s = w * 0.045;
  const out: string[] = [];
  const cluster = (x: number, y: number, sx: number, sy: number) => {
    out.push(ellipse(x + sx * s * 1.5, y + sy * s * 0.7, s * 0.75, s * 0.34, "#8fd39a", 25 * sx * sy));
    out.push(ellipse(x + sx * s * 0.7, y + sy * s * 1.5, s * 0.75, s * 0.34, "#8fd39a", -25 * sx * sy));
    out.push(rose(x, y, s));
    out.push(rose(x + sx * s * 1.6, y + sy * s * 1.5, s * 0.7));
  };
  const mx = w * 0.09;
  const my = h * 0.055;
  cluster(mx, my, 1, 1);
  cluster(w - mx, my, -1, 1);
  cluster(mx, h - my, 1, -1);
  cluster(w - mx, h - my, -1, -1);
  return out.join("");
}

// ── Birthday ─────────────────────────────────────────────────────────────────

function balloon(cx: number, cy: number, s: number, fill: string): string {
  return (
    ellipse(cx, cy, s * 0.82, s, fill) +
    `<polygon points='${f(cx - s * 0.12)},${f(cy + s)} ${f(cx + s * 0.12)},${f(cy + s)} ${f(cx)},${f(cy + s * 1.18)}' fill='${fill}'/>` +
    `<path d='M${f(cx)} ${f(cy + s * 1.18)} Q${f(cx + s * 0.5)} ${f(cy + s * 2.2)} ${f(cx)} ${f(cy + s * 3.2)}' fill='none' stroke='#c9b8d0' stroke-width='${f(s * 0.08)}'/>`
  );
}

function birthdayBalloons(w: number, h: number): string {
  const cols = ["#ff6d94", "#ffd166", "#6dd3ff", "#a78bfa"];
  const s = w * 0.05;
  const out: string[] = [];
  out.push(balloon(w * 0.1, h * 0.05, s, cols[0]));
  out.push(balloon(w * 0.18, h * 0.04, s * 0.88, cols[1]));
  out.push(balloon(w * 0.9, h * 0.05, s, cols[2]));
  out.push(balloon(w * 0.82, h * 0.04, s * 0.88, cols[3]));
  // A little confetti fall along the bottom.
  const rnd = prng(99);
  for (let i = 0; i < 20; i++) {
    const x = rnd() * w;
    const y = h - rnd() * h * 0.13;
    out.push(circle(x, y, w * (0.006 + rnd() * 0.008), cols[Math.floor(rnd() * cols.length)]));
  }
  return out.join("");
}

function birthdayStreamers(w: number, h: number): string {
  const cols = ["#ff6d94", "#ffd166", "#6dd3ff", "#a78bfa"];
  const out: string[] = [];
  const streamer = (x0: number, dir: number, color: string) => {
    let d = `M${f(x0)} 0`;
    let x = x0;
    let y = 0;
    const seg = h * 0.12;
    for (let i = 0; i < 5; i++) {
      const nx = x + dir * w * 0.055 * (i % 2 ? -0.7 : 1);
      const ny = y + seg;
      d += ` Q${f(x + dir * w * 0.09)} ${f(y + seg * 0.5)} ${f(nx)} ${f(ny)}`;
      x = nx;
      y = ny;
    }
    out.push(
      `<path d='${d}' fill='none' stroke='${color}' stroke-width='${f(w * 0.012)}' stroke-linecap='round'/>`,
    );
  };
  streamer(w * 0.06, 1, cols[0]);
  streamer(w * 0.14, 1, cols[1]);
  streamer(w * 0.94, -1, cols[2]);
  streamer(w * 0.86, -1, cols[3]);
  out.push(confetti(w, h));
  return out.join("");
}

// ── Christening ──────────────────────────────────────────────────────────────

function christeningCross(w: number, h: number): string {
  const gold = "#cbb26b";
  const blue = "#bcd7f0";
  const m = w * 0.03;
  const out: string[] = [];
  out.push(
    `<rect x='${f(m)}' y='${f(m)}' width='${f(w - 2 * m)}' height='${f(h - 2 * m)}' rx='18' fill='none' stroke='${blue}' stroke-width='6'/>`,
  );
  out.push(
    `<rect x='${f(m + 13)}' y='${f(m + 13)}' width='${f(w - 2 * m - 26)}' height='${f(h - 2 * m - 26)}' rx='12' fill='none' stroke='${gold}' stroke-width='2' stroke-dasharray='2 8'/>`,
  );
  out.push(crossMark(w * 0.5, h * 0.055, w * 0.045, gold));
  out.push(crossMark(w * 0.5, h * 0.945, w * 0.045, gold));
  return out.join("");
}

function christeningBlessing(w: number, h: number): string {
  const out = [laceRun(w, h, "#bcd7f0", 0.95)];
  const gold = "#cbb26b";
  const s = w * 0.028;
  // Tiny crosses tucked into the four corners.
  out.push(crossMark(w * 0.08, h * 0.05, s, gold));
  out.push(crossMark(w * 0.92, h * 0.05, s, gold));
  out.push(crossMark(w * 0.08, h * 0.95, s, gold));
  out.push(crossMark(w * 0.92, h * 0.95, s, gold));
  return out.join("");
}

// ── Baby ─────────────────────────────────────────────────────────────────────

function cloud(cx: number, cy: number, s: number, fill: string): string {
  return (
    circle(cx, cy, s, fill) +
    circle(cx - s * 0.9, cy + s * 0.2, s * 0.7, fill) +
    circle(cx + s * 0.9, cy + s * 0.2, s * 0.7, fill) +
    `<rect x='${f(cx - s * 1.6)}' y='${f(cy + s * 0.1)}' width='${f(s * 3.2)}' height='${f(s * 0.9)}' rx='${f(s * 0.45)}' fill='${fill}'/>`
  );
}

function babyClouds(w: number, h: number): string {
  const c = "#c8e0fb";
  const out: string[] = [];
  out.push(cloud(w * 0.13, h * 0.05, w * 0.03, c));
  out.push(cloud(w * 0.88, h * 0.06, w * 0.028, c));
  out.push(cloud(w * 0.15, h * 0.95, w * 0.026, c));
  out.push(cloud(w * 0.85, h * 0.94, w * 0.03, c));
  const rnd = prng(7);
  for (let i = 0; i < 12; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    if (x > w * 0.24 && x < w * 0.76 && y > h * 0.2 && y < h * 0.8) continue;
    out.push(star(x, y, w * 0.014, "#ffe6a3"));
  }
  return out.join("");
}

function crescent(cx: number, cy: number, r: number, fill: string): string {
  return `<path d='M ${f(cx)} ${f(cy - r)} A ${f(r)} ${f(r)} 0 1 0 ${f(cx)} ${f(cy + r)} A ${f(r * 0.78)} ${f(r * 0.78)} 0 1 1 ${f(cx)} ${f(cy - r)} Z' fill='${fill}'/>`;
}

function babyMoon(w: number, h: number): string {
  const out = [crescent(w * 0.14, h * 0.06, w * 0.05, "#ffd873")];
  const cols = ["#ffd873", "#b9a0f5", "#9cc6ea"];
  const rnd = prng(21);
  for (let i = 0; i < 18; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    if (x > w * 0.24 && x < w * 0.76 && y > h * 0.24 && y < h * 0.76) continue;
    out.push(star(x, y, w * (0.01 + rnd() * 0.011), cols[Math.floor(rnd() * cols.length)]));
  }
  return out.join("");
}

function confetti(w: number, h: number): string {
  const cols = ["#ff6d94", "#ffd166", "#6dd3ff", "#a78bfa", "#4ade80", "#ff9f6d"];
  const rnd = prng(1337);
  const bandX = w * 0.15;
  const bandY = h * 0.12;
  const out: string[] = [];
  for (let i = 0; i < 46; i++) {
    // Keep the scatter to the four edge bands so faces in the middle stay clear.
    const region = Math.floor(rnd() * 4);
    let x: number, y: number;
    if (region === 0) {
      x = rnd() * w;
      y = rnd() * bandY;
    } else if (region === 1) {
      x = rnd() * w;
      y = h - rnd() * bandY;
    } else if (region === 2) {
      x = rnd() * bandX;
      y = rnd() * h;
    } else {
      x = w - rnd() * bandX;
      y = rnd() * h;
    }
    const c = cols[Math.floor(rnd() * cols.length)];
    const s = w * (0.008 + rnd() * 0.012);
    if (rnd() < 0.5) {
      out.push(`<circle cx='${f(x)}' cy='${f(y)}' r='${f(s)}' fill='${c}'/>`);
    } else {
      const rot = Math.round(rnd() * 360);
      out.push(
        `<rect x='${f(x - s)}' y='${f(y - s * 1.4)}' width='${f(s * 2)}' height='${f(s * 2.8)}' rx='${f(s * 0.4)}' fill='${c}' transform='rotate(${rot} ${f(x)} ${f(y)})'/>`,
      );
    }
  }
  return out.join("");
}

// ── Modern (accent-aware) decorative frames ──────────────────────────────────

/** Minimal L-shaped brackets in the four corners. */
function modernCorners(w: number, h: number, accent: string): string {
  const m = w * 0.04;
  const L = w * 0.13;
  const sw = w * 0.011;
  const corner = (x: number, y: number, dx: number, dy: number) =>
    `<path d='M ${f(x)} ${f(y + dy * L)} L ${f(x)} ${f(y)} L ${f(x + dx * L)} ${f(y)}' fill='none' stroke='${accent}' stroke-width='${f(sw)}' stroke-linecap='round'/>`;
  return (
    corner(m, m, 1, 1) +
    corner(w - m, m, -1, 1) +
    corner(m, h - m, 1, -1) +
    corner(w - m, h - m, -1, -1)
  );
}

/** An elegant arched outline (chapel/window vibe) + a thin base line. */
function modernArch(w: number, h: number, accent: string): string {
  const m = w * 0.05;
  const sw = w * 0.007;
  const r = (w - 2 * m) / 2;
  const ay = m + r;
  const d = `M ${f(m)} ${f(h - m)} L ${f(m)} ${f(ay)} A ${f(r)} ${f(r)} 0 0 1 ${f(w - m)} ${f(ay)} L ${f(w - m)} ${f(h - m)}`;
  return (
    `<path d='${d}' fill='none' stroke='${accent}' stroke-width='${f(sw)}'/>` +
    `<line x1='${f(m)}' y1='${f(h - m)}' x2='${f(w - m)}' y2='${f(h - m)}' stroke='${accent}' stroke-width='${f(sw)}'/>`
  );
}

/** Slim editorial bands top & bottom with a thin echo line. */
function modernBand(w: number, h: number, accent: string): string {
  const bh = w * 0.02;
  return (
    `<rect x='0' y='0' width='${f(w)}' height='${f(bh)}' fill='${accent}'/>` +
    `<rect x='0' y='${f(h - bh)}' width='${f(w)}' height='${f(bh)}' fill='${accent}'/>` +
    `<rect x='0' y='${f(bh * 1.7)}' width='${f(w)}' height='${f(bh * 0.32)}' fill='${accent}' opacity='0.5'/>` +
    `<rect x='0' y='${f(h - bh * 2.02)}' width='${f(w)}' height='${f(bh * 0.32)}' fill='${accent}' opacity='0.5'/>`
  );
}

/** Terrazzo-style scatter of tiny shapes hugging the edges. */
function terrazzo(w: number, h: number, accent: string): string {
  const rnd = prng(55);
  const cols = [accent, "rgba(0,0,0,0.08)", "#ffffff", accent];
  const bandX = w * 0.16;
  const bandY = h * 0.1;
  const out: string[] = [];
  for (let i = 0; i < 44; i++) {
    const region = Math.floor(rnd() * 4);
    let x: number, y: number;
    if (region === 0) {
      x = rnd() * w;
      y = rnd() * bandY;
    } else if (region === 1) {
      x = rnd() * w;
      y = h - rnd() * bandY;
    } else if (region === 2) {
      x = rnd() * bandX;
      y = rnd() * h;
    } else {
      x = w - rnd() * bandX;
      y = rnd() * h;
    }
    const s = w * (0.006 + rnd() * 0.012);
    const c = cols[Math.floor(rnd() * cols.length)];
    const shape = Math.floor(rnd() * 3);
    if (shape === 0) {
      out.push(circle(x, y, s, c));
    } else if (shape === 1) {
      out.push(
        `<rect x='${f(x - s)}' y='${f(y - s)}' width='${f(s * 2)}' height='${f(s * 2)}' rx='${f(s * 0.4)}' fill='${c}' transform='rotate(${Math.round(rnd() * 90)} ${f(x)} ${f(y)})'/>`,
      );
    } else {
      out.push(
        `<path d='M ${f(x)} ${f(y - s)} L ${f(x + s)} ${f(y + s)} L ${f(x - s)} ${f(y + s)} Z' fill='${c}'/>`,
      );
    }
  }
  return out.join("");
}

/** Soft double waves along the top and bottom. */
function softWaves(w: number, h: number, accent: string): string {
  const sw = w * 0.008;
  const out: string[] = [];
  const wave = (y: number, amp: number, op: number) => {
    let d = `M 0 ${f(y)}`;
    const seg = w / 6;
    for (let i = 0; i < 6; i++) {
      const cx = (i + 0.5) * seg;
      const dir = i % 2 ? 1 : -1;
      d += ` Q ${f(cx)} ${f(y + dir * amp)} ${f((i + 1) * seg)} ${f(y)}`;
    }
    out.push(
      `<path d='${d}' fill='none' stroke='${accent}' stroke-width='${f(sw)}' opacity='${op}' stroke-linecap='round'/>`,
    );
  };
  wave(h * 0.05, w * 0.02, 0.9);
  wave(h * 0.082, w * 0.015, 0.45);
  wave(h - h * 0.05, w * 0.02, 0.9);
  wave(h - h * 0.082, w * 0.015, 0.45);
  return out.join("");
}

// ── Photo templates (embed the couple/celebrant photo + title/subtitle) ──────

function svgText(
  x: number,
  y: number,
  text: string,
  size: number,
  weight: number,
  fill: string,
  family: string,
  anchor: "start" | "middle" | "end" = "middle",
): string {
  return `<text x='${f(x)}' y='${f(y)}' font-size='${f(size)}' font-family='${family}' font-weight='${weight}' fill='${fill}' text-anchor='${anchor}'>${esc(text)}</text>`;
}

// No multi-word font names here: the SVG attributes use single quotes, so a
// quoted family like 'Times New Roman' would prematurely close the attribute.
const SERIF = "Georgia, serif";
const SANS = "system-ui, Arial, sans-serif";

/** A circular photo disc (embeds the photo, or a soft silhouette placeholder). */
function photoDisc(
  cx: number,
  cy: number,
  r: number,
  photo: string | null | undefined,
  ringColor: string,
  clipId: string,
): string {
  let inner: string;
  if (photo) {
    inner =
      `<clipPath id='${clipId}'><circle cx='${f(cx)}' cy='${f(cy)}' r='${f(r)}'/></clipPath>` +
      `<image href='${photo}' xlink:href='${photo}' x='${f(cx - r)}' y='${f(cy - r)}' width='${f(r * 2)}' height='${f(r * 2)}' preserveAspectRatio='xMidYMid slice' clip-path='url(#${clipId})'/>`;
  } else {
    inner =
      circle(cx, cy, r, "#f0e6ee") +
      `<g clip-path='url(#${clipId})'><clipPath id='${clipId}'><circle cx='${f(cx)}' cy='${f(cy)}' r='${f(r)}'/></clipPath>` +
      circle(cx, cy - r * 0.22, r * 0.4, "#cdb8c8") +
      ellipse(cx, cy + r * 0.75, r * 0.66, r * 0.5, "#cdb8c8") +
      `</g>`;
  }
  return inner + ring(cx, cy, r, ringColor, r * 0.08);
}

function accentBorder(w: number, h: number, color: string): string {
  const m = w * 0.028;
  return (
    `<rect x='${f(m)}' y='${f(m)}' width='${f(w - 2 * m)}' height='${f(h - 2 * m)}' rx='20' fill='none' stroke='${color}' stroke-width='6'/>` +
    `<rect x='${f(m + 13)}' y='${f(m + 13)}' width='${f(w - 2 * m - 26)}' height='${f(h - 2 * m - 26)}' rx='14' fill='none' stroke='${color}' stroke-width='1.5' stroke-dasharray='3 9' opacity='0.7'/>`
  );
}

/** Modern masthead: an accent bar across the header with a photo + names. */
function tplBanner(w: number, _h: number, o: OverlayOpts): string {
  const accent = o.accent || "#caa54e";
  const hbar = w * 0.155;
  const out: string[] = [];
  out.push(
    `<path d='M0 0 H${f(w)} V${f(hbar - 26)} Q${f(w)} ${f(hbar)} ${f(w - 26)} ${f(hbar)} H26 Q0 ${f(hbar)} 0 ${f(hbar - 26)} Z' fill='${accent}'/>`,
  );
  const r = hbar * 0.34;
  out.push(photoDisc(w * 0.12, hbar * 0.5, r, o.photo, "#ffffff", "pb"));
  const tx = w * 0.23;
  if (o.title) out.push(svgText(tx, hbar * 0.46, o.title, w * 0.05, 700, "#ffffff", SERIF, "start"));
  if (o.subtitle)
    out.push(svgText(tx, hbar * 0.75, o.subtitle, w * 0.03, 400, "rgba(255,255,255,0.9)", SANS, "start"));
  return out.join("");
}

/** Formal emblem: accent border, centred photo medallion, ribbon of names. */
function tplEmblem(w: number, h: number, o: OverlayOpts): string {
  const accent = o.accent || "#caa54e";
  const out = [accentBorder(w, h, accent)];
  const r = w * 0.092;
  const cx = w / 2;
  const cy = w * 0.11;
  out.push(photoDisc(cx, cy, r, o.photo, accent, "pe"));
  const ry = cy + r + w * 0.018;
  out.push(
    `<rect x='${f(w * 0.22)}' y='${f(ry)}' width='${f(w * 0.56)}' height='${f(w * 0.07)}' rx='${f(w * 0.01)}' fill='${accent}'/>`,
  );
  if (o.title) out.push(svgText(cx, ry + w * 0.049, o.title, w * 0.038, 700, "#ffffff", SERIF));
  if (o.subtitle) out.push(svgText(cx, ry + w * 0.105, o.subtitle, w * 0.028, 400, "#9c8794", SANS));
  return out.join("");
}

/** Playful snapshot: a taped square photo in the corner + names by the header. */
function tplSnapshot(w: number, h: number, o: OverlayOpts): string {
  const accent = o.accent || "#caa54e";
  const out = [accentBorder(w, h, accent)];
  const s = w * 0.2;
  const x = w - s - w * 0.055;
  const y = w * 0.05;
  const rot = 6;
  const cx = x + s / 2;
  const cy = y + s / 2;
  out.push(`<g transform='rotate(${rot} ${f(cx)} ${f(cy)})'>`);
  out.push(
    `<rect x='${f(x - 9)}' y='${f(y - 9)}' width='${f(s + 18)}' height='${f(s + 38)}' rx='4' fill='#ffffff' stroke='rgba(0,0,0,0.08)'/>`,
  );
  if (o.photo) {
    out.push(
      `<clipPath id='ps'><rect x='${f(x)}' y='${f(y)}' width='${f(s)}' height='${f(s)}' rx='2'/></clipPath>` +
        `<image href='${o.photo}' xlink:href='${o.photo}' x='${f(x)}' y='${f(y)}' width='${f(s)}' height='${f(s)}' preserveAspectRatio='xMidYMid slice' clip-path='url(#ps)'/>`,
    );
  } else {
    out.push(`<rect x='${f(x)}' y='${f(y)}' width='${f(s)}' height='${f(s)}' rx='2' fill='#f0e6ee'/>`);
  }
  out.push(`</g>`);
  // Washi tape.
  out.push(
    `<rect x='${f(cx - s * 0.22)}' y='${f(y - 20)}' width='${f(s * 0.44)}' height='22' fill='${accent}' opacity='0.55' transform='rotate(${rot - 18} ${f(cx)} ${f(y)})'/>`,
  );
  // Names, header-left.
  if (o.title) out.push(svgText(w * 0.06, w * 0.085, o.title, w * 0.052, 700, "#4a3a44", SERIF, "start"));
  if (o.subtitle) out.push(svgText(w * 0.06, w * 0.125, o.subtitle, w * 0.03, 400, "#9c8794", SANS, "start"));
  return out.join("");
}

export const PHOTO_TEMPLATES: OverlayTemplate[] = [
  { id: "tpl-banner", name: "Banner", emoji: "🎀", svg: (a, o) => wrap(a, (w, h) => tplBanner(w, h, o ?? {})) },
  { id: "tpl-emblem", name: "Emblem", emoji: "💐", svg: (a, o) => wrap(a, (w, h) => tplEmblem(w, h, o ?? {})) },
  { id: "tpl-snapshot", name: "Snapshot", emoji: "📸", svg: (a, o) => wrap(a, (w, h) => tplSnapshot(w, h, o ?? {})) },
];

export const TEMPLATE_BY_ID = (id: string): OverlayTemplate | undefined =>
  PHOTO_TEMPLATES.find((t) => t.id === id);

export const OVERLAYS: OverlayDef[] = [
  { id: "none", name: "None", emoji: "🚫", category: "Classic", svg: null },

  // ── Classic (all-purpose) ──
  { id: "gold", name: "Gold", emoji: "🏆", category: "Classic", svg: (a) => wrap(a, goldBorder) },
  { id: "hearts", name: "Hearts", emoji: "💗", category: "Classic", svg: (a) => wrap(a, heartsBorder) },
  { id: "stars", name: "Stars", emoji: "⭐", category: "Classic", svg: (a) => wrap(a, starsCorners) },
  { id: "film", name: "Film", emoji: "🎞️", category: "Classic", svg: (a) => wrap(a, filmStrip) },
  { id: "confetti", name: "Confetti", emoji: "🎊", category: "Classic", svg: (a) => wrap(a, confetti) },
  { id: "cl-corners", name: "Corners", emoji: "⌜", category: "Classic", svg: (a, o) => wrap(a, (w, h) => modernCorners(w, h, o?.accent ?? ACCENT_BY_CATEGORY.Classic)) },
  { id: "cl-band", name: "Bands", emoji: "▬", category: "Classic", svg: (a, o) => wrap(a, (w, h) => modernBand(w, h, o?.accent ?? ACCENT_BY_CATEGORY.Classic)) },

  // ── Wedding ──
  { id: "wed-rings", name: "Rings", emoji: "💍", category: "Wedding", svg: (a) => wrap(a, weddingRings) },
  { id: "wed-floral", name: "Floral", emoji: "🌹", category: "Wedding", svg: (a) => wrap(a, weddingFloral) },
  { id: "lace", name: "Lace", emoji: "🤍", category: "Wedding", svg: (a) => wrap(a, (w, h) => laceRun(w, h, "#f4c9da", 0.92)) },
  { id: "wed-arch", name: "Arch", emoji: "⛪", category: "Wedding", svg: (a, o) => wrap(a, (w, h) => modernArch(w, h, o?.accent ?? ACCENT_BY_CATEGORY.Wedding)) },
  { id: "wed-corners", name: "Minimal", emoji: "⌜", category: "Wedding", svg: (a, o) => wrap(a, (w, h) => modernCorners(w, h, o?.accent ?? ACCENT_BY_CATEGORY.Wedding)) },

  // ── Birthday ──
  { id: "bday-balloons", name: "Balloons", emoji: "🎈", category: "Birthday", svg: (a) => wrap(a, birthdayBalloons) },
  { id: "bday-streamers", name: "Streamers", emoji: "🎉", category: "Birthday", svg: (a) => wrap(a, birthdayStreamers) },
  { id: "bday-terrazzo", name: "Pop", emoji: "🟡", category: "Birthday", svg: (a, o) => wrap(a, (w, h) => terrazzo(w, h, o?.accent ?? ACCENT_BY_CATEGORY.Birthday)) },
  { id: "bday-band", name: "Bands", emoji: "▬", category: "Birthday", svg: (a, o) => wrap(a, (w, h) => modernBand(w, h, o?.accent ?? ACCENT_BY_CATEGORY.Birthday)) },

  // ── Christening ──
  { id: "christening-cross", name: "Cross", emoji: "✝️", category: "Christening", svg: (a) => wrap(a, christeningCross) },
  { id: "christening-blessing", name: "Blessing", emoji: "🕊️", category: "Christening", svg: (a) => wrap(a, christeningBlessing) },
  { id: "chr-arch", name: "Halo", emoji: "⛪", category: "Christening", svg: (a, o) => wrap(a, (w, h) => modernArch(w, h, o?.accent ?? ACCENT_BY_CATEGORY.Christening)) },
  { id: "chr-waves", name: "Serene", emoji: "〜", category: "Christening", svg: (a, o) => wrap(a, (w, h) => softWaves(w, h, o?.accent ?? ACCENT_BY_CATEGORY.Christening)) },

  // ── Baby ──
  { id: "baby-clouds", name: "Clouds", emoji: "☁️", category: "Baby", svg: (a) => wrap(a, babyClouds) },
  { id: "baby-moon", name: "Moon", emoji: "🌙", category: "Baby", svg: (a) => wrap(a, babyMoon) },
  { id: "baby-waves", name: "Waves", emoji: "〜", category: "Baby", svg: (a, o) => wrap(a, (w, h) => softWaves(w, h, o?.accent ?? ACCENT_BY_CATEGORY.Baby)) },
  { id: "baby-terrazzo", name: "Confetti", emoji: "🔵", category: "Baby", svg: (a, o) => wrap(a, (w, h) => terrazzo(w, h, o?.accent ?? ACCENT_BY_CATEGORY.Baby)) },
];

export const DEFAULT_OVERLAY = OVERLAYS[0]; // None

export const OVERLAY_BY_ID = (id: string): OverlayDef =>
  OVERLAYS.find((o) => o.id === id) ?? OVERLAYS[0];

/** Built-in overlays filed under an event category (excludes "none"). */
export const overlaysInCategory = (cat: OverlayCategory): OverlayDef[] =>
  OVERLAYS.filter((o) => o.svg !== null && o.category === cat);

/** True for the built-in overlay ids (as opposed to a host-uploaded frame). */
export const isBuiltInOverlay = (id: string): boolean =>
  OVERLAYS.some((o) => o.id === id);

/** True if the id names a real overlay, photo template, or uploaded frame. */
export function isKnownOverlay(
  id: string,
  customFrames: { id: string }[] = [],
): boolean {
  return (
    id === "none" ||
    OVERLAYS.some((o) => o.id === id) ||
    PHOTO_TEMPLATES.some((t) => t.id === id) ||
    customFrames.some((c) => c.id === id)
  );
}

/** The overlay's SVG data URI for a given paper aspect, or null for "none". */
export function overlaySrc(
  id: string,
  aspect: number,
  opts?: OverlayOpts,
): string | null {
  const o = OVERLAY_BY_ID(id);
  return o.svg ? o.svg(aspect, opts) : null;
}

/**
 * Resolves an overlay id to a renderable image source. Order: host-uploaded
 * frames (a stored PNG, stretched to the paper) → photo templates (embed the
 * event photo + text) → built-in generated overlays. Returns null for
 * "none"/unknown.
 */
export function resolveOverlaySrc(
  id: string,
  aspect: number,
  customFrames: { id: string; url: string }[] = [],
  opts?: OverlayOpts,
): string | null {
  const custom = customFrames.find((f) => f.id === id);
  if (custom) return custom.url;
  const tpl = TEMPLATE_BY_ID(id);
  if (tpl) return tpl.svg(aspect, opts);
  return overlaySrc(id, aspect, opts);
}
