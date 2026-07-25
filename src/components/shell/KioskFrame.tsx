import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Scales the whole booth to fill whatever screen it's running on.
 *
 * The UI is tuned for a portrait phone column — historically a hard
 * `max-w-[540px]` — so on a tablet it sat as a narrow strip with the page
 * background showing down both sides. Widening the column instead of scaling it
 * wouldn't work: there are dozens of pixel constraints tuned to that width (the
 * 230px QR, the 300px printer slot, the receipt previews, every type size), and
 * letting the column grow to 1024px leaves all of them physically unchanged —
 * a small receipt adrift in a wide empty space.
 *
 * So the design box keeps its proportions and gets scaled up bodily. A tablet
 * shows exactly what a phone shows, larger, which is also what you want from a
 * kiosk: bigger touch targets and a composition nobody has to re-tune.
 *
 * `transform` makes this element the containing block for `position: fixed`
 * descendants, so the Admin panel and PIN pad still cover exactly the booth area
 * and scale with it. That's deliberate, not incidental.
 */

/** The width every screen was laid out against. */
export const DESIGN_WIDTH = 540;

/**
 * Least vertical room a screen can be given before it feels cramped.
 *
 * A squarer tablet (iPad portrait is 3:4) would otherwise get a very short
 * design box when scaled to fill the width, and the taller screens — QR, Review —
 * would clip against `overflow-hidden`. When that would happen, height wins and
 * the box is simply allowed to be wider than `DESIGN_WIDTH` instead.
 */
const MIN_DESIGN_HEIGHT = 780;

/**
 * Widest the design box may get. Beyond this the layout reads as stretched rather
 * than roomy, so a landscape screen is centred with matched margins instead.
 */
const MAX_DESIGN_WIDTH = 660;

interface Box {
  /** Design-space size the children are laid out in. */
  width: number;
  height: number;
  /** Multiplier applied to reach the real screen. */
  scale: number;
}

function measure(vw: number, vh: number): Box {
  if (vw <= 0 || vh <= 0) return { width: DESIGN_WIDTH, height: 800, scale: 1 };

  // Never scale below 1: a phone narrower than the design width already fills
  // its screen and reflows fine, exactly as it did before this wrapper existed.
  let scale = Math.max(1, vw / DESIGN_WIDTH);

  // Filling the width would leave too little height — fill the height instead.
  if (vh / scale < MIN_DESIGN_HEIGHT) {
    scale = Math.max(1, vh / MIN_DESIGN_HEIGHT);
  }

  const height = vh / scale;
  // Cap the width rather than stretch; the leftover is centred by the parent.
  const width = Math.min(MAX_DESIGN_WIDTH, vw / scale);
  return { width, height, scale };
}

export function KioskFrame({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  // Seeded from the window so the very first paint is already the right size —
  // measuring first would show one frame at the wrong scale.
  const [box, setBox] = useState<Box>(() =>
    measure(
      typeof window === "undefined" ? 0 : window.innerWidth,
      typeof window === "undefined" ? 0 : window.innerHeight,
    ),
  );

  // Observed rather than read off `window`, because the outer element is sized
  // with `100dvh` and safe-area insets — only the resolved box knows the truth
  // once a mobile browser's toolbars get involved.
  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setBox(measure(r.width, r.height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={outer}
      className="flex h-[100dvh] w-full items-center justify-center overflow-hidden"
    >
      {/* Occupies the post-scale footprint, so centring and layout still work. */}
      <div
        className="relative"
        style={{
          width: box.width * box.scale,
          height: box.height * box.scale,
        }}
      >
        <div
          style={{
            width: box.width,
            height: box.height,
            transform: `scale(${box.scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
