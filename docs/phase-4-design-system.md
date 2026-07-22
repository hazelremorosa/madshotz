# Phase 4 — UI/UX Design System

> **Open the live version first:** [`phase-4-design-system.html`](./phase-4-design-system.html) —
> it renders every token, plays every easing curve and runs the capture ceremony. A motion system
> cannot be evaluated from a table. This file is the implementation reference.

**Direction: "Instrument & Paper."**

---

## 1. The concept

MAD SHOT'Z has exactly two materials, and the product hands you both: a **machined black booth** the
guest walks up to, and a **warm receipt** they walk away holding. Every token derives from one of them.

This is deliberately not "a dark theme with an accent colour" — that is the default look of every AI-
generated SaaS page, and it would make a premium photobooth indistinguishable from a crypto dashboard.
Instead the interface **alternates grounds by purpose**:

| Ground | Used for | Rationale |
|--------|----------|-----------|
| **Instrument** — cool near-black, violet-biased | attract, capture, printing, admin | Screens that stage the experience. The booth is an object, not a website. |
| **Paper** — warm off-white, thermal dot-grid | layout, editor, approve, delivery | Screens showing the customer's artwork. **The print must always look like a print, never like a UI element.** |

The neutrals are biased, not pure: the dark ground leans violet so the gold lamp reads warm against
it; the paper ground leans yellow because thermal stock does. A pure grey would read as unconsidered.

---

## 2. Colour tokens

### Instrument neutrals
```
--ink-950 #08080a   --ink-900 #0d0d11   --ink-850 #131316   --ink-800 #1a1a20
--ink-700 #26262e   --ink-600 #35353f   --ink-400 #6e6e7c   --ink-200 #a8a8b4   --ink-50 #ededf0
```
`ink-900` page · `ink-850` surface / chart ground · `ink-800` raised · `ink-700` border ·
`ink-400` muted text · `ink-200` secondary text · `ink-50` primary text.

### Paper neutrals
```
--pap-0 #fbf9f5   --pap-100 #f3f0e9   --pap-200 #e6e1d6
--pap-400 #b9b2a4  --pap-700 #6a6459   --pap-900 #1a1815
```

### Accent — "the lamp"
```
--gold-300 #f3d07a  --gold-400 #edbe55  --gold-500 #e0a62e  --gold-600 #c98500  --gold-700 #9a6600
```
`gold-500` on the instrument ground, `gold-700` on paper (contrast). **The only saturated hue in the
interface chrome.** One accent, spent in one place, is what separates premium from busy.

### Status — reserved
```
--st-good #35b87c   --st-warn #e08a1e   --st-crit #e2555a   --st-info #5b9be8
```
Never reused as a chart series. **Always ships with an icon and a word** — a red dot alone is
meaningless to a colourblind operator across a dark venue, and the operator is exactly who needs to
read it at a glance.

### Analytics series — validated
Fixed order, **never cycled**; colour follows the entity so filtering never repaints survivors.

| Slot | Instrument | Paper |
|---|---|---|
| 1 | `#c98500` gold | `#eda100` |
| 2 | `#d55181` magenta | `#e87ba4` |
| 3 | `#008300` green | `#008300` |
| 4 | `#3987e5` blue | `#2a78d6` |
| 5 | `#d95926` orange | `#eb6834` |
| 6 | `#199e70` aqua | `#1baf7a` |
| 7 | `#9085e9` violet | `#4a3aa7` |
| 8 | `#e66767` red | `#e34948` |

This ordering was **computed, not chosen by eye**: every gold-leading permutation of the hue set was
run through protan/deutan colourblindness simulation, and only orderings clearing every gate in both
grounds were kept. Result — worst adjacent separation **ΔE 9.4** on instrument, **9.2** on paper
(target ≥ 8); worst normal-vision separation 19.3 / 19.6 (floor ≥ 15).

Constraints that come with it:
- **Scatter, bubble and map forms cap at 2 series** from the head of the order. At 3, the gold↔green
  pair falls into the 6–8 warn band and requires direct labels as secondary encoding.
- **Sequential** encoding (heatmaps, magnitude) uses the documented single-hue blue ramp, not gold —
  gold is reserved for the accent and for single-series hero metrics, where nothing can be confused
  with it.
- **Diverging** uses blue ↔ red with a neutral grey midpoint. Never a rainbow, never a hue at the midpoint.
- A legend is present for ≥ 2 series; ≤ 4 series are also direct-labelled. Identity is never colour alone.

---

## 3. Typography

**Monospace leads.** Most systems bury mono in code blocks; here it is the display face — because a
receipt *is* monospaced, and that is what the brand already sounded like. Set large and tight it reads
as precision equipment; set small with wide tracking it reads as instrument labelling. A neutral
grotesque carries running text, so the mono never has to be comfortable — only characterful.

Both faces are system stacks. The Electron build bundles its own copies (audit §2.13: **never a font
CDN** — an offline kiosk must not depend on the network to render text).

| Role | Face | Size | Weight | Tracking |
|------|------|------|--------|----------|
| Display | mono | `clamp(38px, 7vw, 76px)` | 700 | −0.045em |
| Heading | mono | `clamp(24px, 3.4vw, 36px)` | 700 | −0.035em |
| Subhead | grotesque | 19px | 650 | −0.015em |
| Label | mono | 11px uppercase | 600 | **+0.22em** |
| Metric | mono | 32px | 700 | −0.02em, tabular |
| Body | grotesque | 16px / 1.6, max 68ch | 400 | 0 |
| Caption | grotesque | 13px / 1.5 | 400 | 0 |

**Numerals are always tabular.** Prices, ribbon counts and countdown timers update in place —
proportional figures make them jitter, and a jittering countdown is the most visible bug on a kiosk.

---

## 4. Space, form, depth

4px spine: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96`.
Radii: `6` chips · `10` inputs and buttons · `16` cards · `24` the booth shell · `999` dots, meters
and badges **only — never a button.**

Elevation is **one light source, high and front**: a long soft downward shadow plus a 1px inner
highlight along the top edge. That top highlight is what makes a dark panel read as a machined object
rather than a flat rectangle — the single most valuable pixel in the system.

---

## 5. Motion

Motion is not decoration here. It is the kiosk explaining itself to someone who has never used it and
will use it once. Each curve answers a question: *where did this come from*, *is the machine working*,
*did my tap register*.

### Curves
| Token | Value | Job |
|-------|-------|-----|
| `--e-standard` | `cubic-bezier(.2, 0, 0, 1)` | The workhorse — anything moving between two resting states |
| `--e-entrance` | `cubic-bezier(.16, 1, .3, 1)` | Arrivals. Fast out of the gate, long settle — reads confident |
| `--e-exit` | `cubic-bezier(.4, 0, 1, 1)` | Departures. Accelerates away and never looks back |
| `--e-shutter` | `cubic-bezier(.9, 0, .1, 1)` | The flash. Holds, snaps, holds — a mechanical shutter, not a fade |
| `--e-spring` | `linear(…)` overshoot | Things that should feel physical: toasts, chips, the countdown numeral |

### Durations
`80` instant · `140` quick (press, hover, focus) · `220` base · `380` slow (panels, drawer) ·
`600` deliberate (full kiosk screen change).

**Duration scales with distance and consequence, never with importance.** A chip toggling is 80 ms
because it moved 2 px. A screen change is 600 ms because the whole surface moved and the customer
must follow it. Past 600 ms it must be a deliberate ceremony or it just feels slow.

### Choreography
Siblings enter in reading order **40 ms apart, capped at 8** — past that the delay is longer than
anyone will wait. **Exits never stagger**: leaving is uniform and fast, because nobody wants to watch
a screen they have already dismissed.

### The four rules
1. **Transform and opacity only.** The only two properties the GPU animates for free. Animating
   `width`, `top` or `filter` drops a fanless tablet to single-digit frame rates mid-session.
2. **Motion has an origin.** A panel opened from the top-right corner enters *from* the top-right.
   Motion without an origin reads as noise.
3. **Interrupt, never queue.** A customer tapping twice must not wait through two animations. Every
   transition is cancellable and reversible from wherever it is.
4. **Ceremony is earned.** Only three moments exceed 600 ms — countdown, shutter flash, print
   emerging. They *are* the product. Everything else gets out of the way.

---

## 6. Kiosk ergonomics

| Constraint | Rule |
|------------|------|
| Viewing distance | Body text never below 15px; primary actions never below **48px** tall |
| No hover | **No hover state may carry meaning anywhere.** Hover is a laptop-only bonus |
| Thumb reach | Primary actions in the lower third of the portrait screen; the header orients, never controls |
| One decision per screen | Tapping a choice advances immediately — no choose-then-confirm |
| Venue lighting | Body text holds **7:1**, not 4.5:1. Booths run in dim receptions and blown-out daylight |
| Gloved / wet hands | Nothing depends on a precise gesture; pinch and rotate always have a handle-drag equivalent |

---

## 7. The honest constraint — performance

Worth naming plainly, because it is the one tension in the brief: **the same fanless tablet running
these animations is also compositing a 1200×1800 print, running Sharp, writing SQLite and serving a
local HTTP server.** A luxurious system that throttles the machine is not luxurious — it is a booth
that stutters in front of a paying customer.

| Budget | Rule |
|--------|------|
| Compositor only | `transform` and `opacity`. Nothing else animates, ever |
| Blur rationed | At most one `backdrop-filter` layer on screen — the most expensive effect in the system |
| Nothing loops idle | Except the attract screen, the one moment the machine has nothing else to do |
| Render yields | Print composition is **queued behind** the transition, never raced against it |
| Reduced motion | `prefers-reduced-motion` collapses every duration to near-zero and stops the attract loop. State still changes; it just stops moving |

**Performance tier.** If frame time exceeds budget for a sustained window, the shell drops blur, then
parallax, then stagger — in that order — and keeps the core transitions. The booth degrades
gracefully instead of stuttering proudly.

---

## 8. Implementation

Tokens ship as CSS custom properties on `:root` in `packages/ui`, mapped into `tailwind.config.ts`
via `theme.extend` so Tailwind classes and raw CSS read from one source. Components consume tokens by
role (`--surface-1`, `--text-secondary`), never raw hex — which is what lets the instrument/paper
ground swap happen at the container level with no component changes.

Motion is CSS-first: transitions and keyframes using the curve tokens. A JS animation library is
introduced only where a gesture must be interruptible mid-flight — the editor's drag, pinch and
rotate — and nowhere else.

---

**Next:** Phase 5 — the full SQLite schema: Prisma DSL, indexes, constraints, migrations and seed data.
