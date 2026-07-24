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
  store/settings.ts    Host settings (Admin panel), persisted to localStorage
  types.ts             Domain model
  data/                themes · layouts · filters catalogs (add entries here)
  lib/
    camera.ts          shared getUserMedia stream + device picker + capture()
    compose.ts         renders the final receipt PNG (matches on-screen editor)
    delivery.ts        DeliveryService.publish() — Cloudflare R2 + Worker
    kiosk.ts           fullscreen + screen wake lock primitives
    qr.ts · sound.ts · date.ts · cn.ts
  hooks/
    useIdleReset.ts    privacy timeout back to Welcome
    useKioskLockdown.ts fullscreen guard + input/navigation guards
  components/
    shell/             AmbientBackground · ParticleField · RippleLayer · ProgressRail · ActionBar
    admin/             AdminRoot (hidden entry) · AdminPinPad · shared controls
    Receipt.tsx        the hero object (paper + header + FrameStack + footer + overlay)
    FrameStack.tsx     arranges captured frames per layout
    EditorItem.tsx     draggable / resizable / rotatable sticker & text
    AnimatedQR · Confetti · Logo · ui/Button
  screens/             one component per beat (Boot → … → QR) + AdminPanel
  App.tsx              shell + screen transitions + idle reset + kiosk lockdown
```

**State flow:** every screen reads/writes `useSession`. `go(screen, direction)`
drives directional transitions; `reset()` wipes all guest data and returns to
Welcome (also fired by the idle timeout for privacy).

**Two stores, on purpose:** `useSession` is per-guest and is wiped by `reset()`;
`useSettings` is the host's booth config and survives resets, reloads and power
cycles (localStorage key `madshots.settings.v1`).

### Extending

- **New theme / layout / filter** → add an entry to the matching file in `src/data/`.
  Themes carry their own brand hues, sticker pack, default filter, and receipt header.
- **Real delivery** → see "Photo delivery" below. `DeliveryService` in
  `src/lib/delivery.ts` uploads the composite to a Cloudflare Worker (R2) and the QR points to it.
- **Real printer** → the `PrintingScreen` animation is cosmetic; send
  `useSession.getState().composite` (a PNG data URL) to your print pipeline there.

---

## Admin panel & kiosk lockdown

**Getting in:** tap the **top-left corner 5 times** (within 3 seconds), then enter the
PIN — **`1234` by default, change it in Admin → Security**. Five wrong tries locks the pad
for 30 seconds. The hotspot is invisible to guests; a faint row of dots confirms taps are
registering from the 2nd tap on.

Two shortcuts for setup on a laptop, where a fullscreen kiosk gives you no address bar:

- **`Ctrl+Alt+A`** — opens the same PIN prompt.
- **`?admin`** — e.g. `http://localhost:5173/?admin` opens the PIN prompt on load. The
  param is stripped from the URL once used, so a reload won't land back here. The PIN still
  guards the panel, but prefer the corner tap at a live event — a URL is easy to shoulder-surf.

Everything saves the moment you change it, and survives reloads:

| Section | What the host controls |
|---|---|
| **Camera** | Which video input to shoot with (live preview), mirror on/off |
| **Capture** | Countdown 3/5/10s, whether guests may change it, screen flash fill light |
| **Layouts** | Which layouts are offered, and which one a session starts on |
| **Filters** | Which looks appear in the filter reel |
| **Event branding** | Receipt header + footer line + brand palette — baked into the exported photo too |
| **Sound & timing** | Default sound state, idle reset (45s–5m), QR auto-restart (15–90s) |
| **Kiosk lockdown** | Kiosk mode, keep-screen-awake, enter fullscreen now |
| **Security** | Change the PIN |
| **Status / Danger** | Delivery + wake-lock support, restart session, factory reset |

**Kiosk mode** locks the booth to the app: it re-enters fullscreen on the next tap
whenever the browser drops out, and blocks the context menu, pinch-zoom, text
selection, drag, browser shortcuts (F5, F11, F12, Ctrl+R/W/T/N/P/S…), back-navigation
and accidental page closes. Those input guards **stand down while the Admin panel is
open** so the host can type normally. **Keep the screen awake** holds a Wake Lock
(Chrome/Edge/Android; iOS Safari has none — use the OS display settings there).

> iPhone Safari has no Fullscreen API. Install the PWA to the home screen instead —
> it launches chrome-less, and the rest of the lockdown still applies.

---

## Photo delivery (cloud, 24h expiry)

By default the QR is a **placeholder** — the app is fully usable (Download/Share work),
but scanning the QR won't show a photo until you connect cloud storage. It uses
**Cloudflare R2 + a Worker** (free tier is plenty).

The Worker (upload + branded viewer page + 24h expiry) lives in **`cloudflare/`** —
see [`cloudflare/README.md`](cloudflare/README.md) for the deploy steps. In short:

```bash
cd cloudflare
wrangler login
wrangler r2 bucket create madshotz-photos
wrangler deploy          # prints your Worker URL
```

Then copy `.env.example` to `.env` and set the Worker URL:

```
VITE_DELIVERY_BASE=https://madshotz-delivery.YOURNAME.workers.dev
```

Rebuild/restart (`npm run dev` or `npm run build`) — Vite reads env at build time.

Now finishing a session uploads the photo, and the QR (both the on-screen one and the
small one on the receipt) opens a branded page showing the image with a **Save** button.
The Worker refuses to serve anything older than **24h**, so links expire after a day.
Guests who tapped **Download/Share** keep their copy regardless.

> **Note:** uploads are open (no auth) so the browser kiosk can post directly; the
> Worker's 8 MB cap + 24h expiry keep abuse cheap. Add a shared-secret header or
> Cloudflare Access later if you want to lock it down.

---

*Prototype analysis and full experience design live in `docs/`.*
