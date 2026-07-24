/**
 * Decorative PNG-style frame overlays — a transparent graphic layered on top of
 * the whole receipt (above the photos, below the guest's stickers/text).
 *
 * Every overlay is generated as an inline SVG data URI sized to the paper's
 * aspect ratio, so the *same* string renders 1:1 in the DOM (`<img>`) and in the
 * canvas compositor (`drawImage`) with no stretching — and it stays offline,
 * asset-free, exactly like the frame patterns in `data/frames.ts`.
 */

export interface OverlayDef {
  id: string;
  name: string;
  /** Emoji shown on the picker chip. */
  emoji: string;
  /** Builds an SVG data URI for a paper of the given aspect (w/h). null = none. */
  svg: ((aspect: number) => string) | null;
}

/** Nominal canvas width the SVGs are authored at; height follows the aspect. */
const W = 1000;

function wrap(aspect: number, body: (w: number, h: number) => string): string {
  const w = W;
  const h = Math.round(W / aspect);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' ` +
    `viewBox='0 0 ${w} ${h}'>${body(w, h)}</svg>`;
  // encodeURIComponent escapes '#', quotes, etc. so the data URI is always valid.
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
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

function laceBorder(w: number, h: number): string {
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
        `<circle cx='${f(x1 + (x2 - x1) * t)}' cy='${f(y1 + (y2 - y1) * t)}' r='${f(r)}' fill='#ffffff' opacity='0.92'/>`,
      );
    }
  };
  run(m, m, w - m, m);
  run(m, h - m, w - m, h - m);
  run(m, m, m, h - m);
  run(w - m, m, w - m, h - m);
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

export const OVERLAYS: OverlayDef[] = [
  { id: "none", name: "None", emoji: "🚫", svg: null },
  { id: "gold", name: "Gold", emoji: "🏆", svg: (a) => wrap(a, goldBorder) },
  { id: "hearts", name: "Hearts", emoji: "💗", svg: (a) => wrap(a, heartsBorder) },
  { id: "stars", name: "Stars", emoji: "⭐", svg: (a) => wrap(a, starsCorners) },
  { id: "film", name: "Film", emoji: "🎞️", svg: (a) => wrap(a, filmStrip) },
  { id: "lace", name: "Lace", emoji: "🤍", svg: (a) => wrap(a, laceBorder) },
  { id: "confetti", name: "Confetti", emoji: "🎊", svg: (a) => wrap(a, confetti) },
];

export const DEFAULT_OVERLAY = OVERLAYS[0]; // None

export const OVERLAY_BY_ID = (id: string): OverlayDef =>
  OVERLAYS.find((o) => o.id === id) ?? OVERLAYS[0];

/** The overlay's SVG data URI for a given paper aspect, or null for "none". */
export function overlaySrc(id: string, aspect: number): string | null {
  const o = OVERLAY_BY_ID(id);
  return o.svg ? o.svg(aspect) : null;
}
