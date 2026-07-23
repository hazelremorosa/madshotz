# MAD SHOT'Z

A premium **receipt photobooth** experience — a touch-first PWA that makes guests
remember the moment, not just the photos.

Walk-up cinematic welcome → pick a vibe → choose a layout → pose for the camera →
review & retake → grade with a filter → decorate with stickers & text → watch the
receipt print → scan the QR to take your memories home.

> **Scope (this build):** digital-only (the "print" is a ritual animation; the QR
> download is the real deliverable) and frontend-only (delivery is stubbed behind
> a clean interface). A real thermal/color printer and a cloud backend can drop in
> later without touching any screen.

---

## Run it

```bash
npm install
npm run dev        # http://localhost:5173  (camera needs localhost or HTTPS)
npm run build      # type-check + production build → dist/
npm run preview    # serve the production build
```

Best experienced on a **portrait** touch device (Android tablet, iPad, Windows
touchscreen). Installable as a PWA (fullscreen, portrait-locked).

---

## Tech

React 18 · TypeScript · Vite · TailwindCSS · Framer Motion · Zustand · vite-plugin-pwa.

---

## Design System (tokens in `tailwind.config.ts` + `src/index.css`)

| Token group | What it holds |
|---|---|
| **Color** | `ink` (near-black stage), `paper` (warm receipt stock), `brand.a/b/c` |
| **Brand hues** | CSS variables `--brand-a/b/c` — a selected **Theme recolors the whole room** at runtime |
| **Type** | `font-display` / `font-sans` (system stacks, offline-safe) + `font-mono` for ticket chrome |
| **Radius** | `xl2` `xl3` `xl4` for floating cards |
| **Elevation** | `shadow-glass`, `shadow-float`, `shadow-paper`, `shadow-bloom` (neon glow) |
| **Motion** | spring/smooth easings + ambient keyframes (`drift`, `floaty`, `breathe`, `shimmer`) |
| **Surfaces** | `.glass` / `.glass-strong` (frosted), `.paper` (thermal texture), `.brand-text` / `.brand-fill` |

**Motion language:** nothing appears instantly. Screens slide+scale+blur between
steps (spring 260/30); selections "pop"; draggables lag the finger; signature
bursts for flash, confetti, QR draw-in, and the receipt slide-out. Everything
animates `transform`/`opacity`/`filter` only, and `prefers-reduced-motion` is honored.

---

## Architecture

```
src/
  store/session.ts     Zustand state machine — the single source of truth for the flow
  types.ts             Domain model
  data/                themes · layouts · filters catalogs (add entries here)
  lib/
    camera.ts          shared getUserMedia stream + capture()
    compose.ts         renders the final receipt PNG (matches on-screen editor)
    delivery.ts        DeliveryService.publish() — STUB, swap for a real uploader
    qr.ts · sound.ts · date.ts · cn.ts
  components/
    shell/             AmbientBackground · ParticleField · RippleLayer · ProgressRail · ActionBar
    Receipt.tsx        the hero object (paper + header + FrameStack + footer + overlay)
    FrameStack.tsx     arranges captured frames per layout
    EditorItem.tsx     draggable / resizable / rotatable sticker & text
    AnimatedQR · Confetti · Logo · ui/Button
  screens/             one component per beat (Boot → … → QR)
  App.tsx              shell + AnimatePresence screen transitions + idle reset
```

**State flow:** every screen reads/writes `useSession`. `go(screen, direction)`
drives directional transitions; `reset()` wipes all guest data and returns to
Welcome (also fired by a 90s idle timeout for privacy).

### Extending

- **New theme / layout / filter** → add an entry to the matching file in `src/data/`.
  Themes carry their own brand hues, sticker pack, default filter, and receipt header.
- **Real delivery** → implement `DeliveryService.publish()` in `src/lib/delivery.ts`
  to upload the composite and return a share URL. The QR already encodes a session code.
- **Real printer** → the `PrintingScreen` animation is cosmetic; send
  `useSession.getState().composite` (a PNG data URL) to your print pipeline there.

---

*Prototype analysis and full experience design live in `docs/`.*
