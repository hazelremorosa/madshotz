# Phase 1 — Prototype Audit

**Subject:** `booth.html` (815 lines, single file)
**Date:** 2026-07-22
**Verdict:** Keep the flow and the brand identity. Discard 100% of the implementation.

---

## 1. What the prototype gets right

**The flow is correct.** Welcome → Layout → Capture → Decorate → Preview/QR → Finish matches
what commercial booths actually ship. The Phase-1 target flow only *adds* to it; nothing
needs re-ordering.

**Layout drives capture count.** `setLayoutFormat()` sets `expectedTotalImages` from the
chosen layout — correct dependency direction, and the seed of a real layout registry.

**The brand identity is marketable.** The receipt metaphor — perforated edge, monospace
tracking, zinc/black palette, dot-grid paper background, the `* MAD SHOT'Z PHOTO EVENT *`
footer — is distinctive and coherent. **This is an asset. It becomes the default theme.**

**Portrait kiosk framing.** The 9:16 device shell shows the right mental model.

**Capture ceremony.** Progress label → countdown → shutter flash is the emotional core of a
photobooth, and it is already present.

**Two-canvas separation.** A live buffer canvas distinct from an export canvas is the correct
instinct: preview resolution and print resolution must never share a surface.

---

## 2. Defects

Each of these is a customer-visible failure, not a style complaint.

### 2.1 The output is not printable — the #1 problem
Capture is `640×480`; export is `800×1000`. A 4×6" print at 300 DPI needs **1200×1800**; a
2×6" strip needs **600×1800**. At 4×6 the export is ~167 DPI of upscaled 480p frames. Worse,
the export is **4:5**, matching neither 4×6 (2:3) nor 2×6 (1:3) — every print crops or
letterboxes. The whole capture→export chain must be re-specced around print geometry.

### 2.2 "Bottom Row" silently exports the wrong image
`renderFinalPrintOutputReceipt()` handles `window-grid` and `vertical-strip`, then falls to
`else` which draws **only `imgObjects[0]`**. A customer picking Bottom Row shoots 3 photos and
receives 1. Invisible on screen, because preview uses a different renderer entirely.

### 2.3 Preview and export are two implementations — the root architectural sin
`buildStickerWorkspaceMatrixBlueprint()` composes with DOM + CSS grid.
`renderFinalPrintOutputReceipt()` composes with hardcoded canvas coordinates. They will drift
forever; §2.2 proves they already have. Every future layout must be implemented twice.

### 2.4 Sticker export math is wrong
Positions scale proportionally but every sticker draws at a fixed `110×110`. On screen a
sticker is 56px in a ~280px box (20% of width); in export it is 110px in an 800px canvas
(13.75%). **Stickers print ~30% smaller than placed.** Additionally
`querySelectorAll(".stamp-item-node img")` searches the whole document *after* the workspace
was cloned into the preview box, so every sticker is enumerated twice.

### 2.5 "Silent auto-save" saves nothing
- The Cache Storage write stores a data-URL string in a private, origin-scoped, evictable
  browser cache. No human can retrieve those files.
- The `<a download>` is the opposite of silent, and the `photobooth/` directory prefix in the
  `download` attribute is stripped by every browser for security. Files land loose in Downloads.

No filesystem, no folder structure, no per-event organisation, no backup.

### 2.6 The QR code points at nothing
`https://madshotz.local/prints/{filename}` — no server serves it, `.local` is mDNS-only, and
the file was never uploaded. Photo delivery is 0% implemented.

### 2.7 Prints come out mirrored
Capture bakes in the horizontal flip, so any text in frame — event signage, shirt logos, a
monogrammed wedding sign — prints backwards. Industry standard: **mirror the live preview**
(people need it to pose), **save and print un-mirrored**.

### 2.8 The countdown lies
`setInterval(…, 750)` × 3 = **2.25 s**, displayed as "3". Not configurable; real events need
3/5/10 s.

### 2.9 The camera stream is never released
No `track.stop()` anywhere. The webcam LED stays on between customers and handles leak across
sessions. On failure the only handling is `alert("Camera connection missing.")` — a modal on an
unattended kiosk that nobody can dismiss.

### 2.10 Session reset is incomplete — a privacy incident
`restoreApplicationStateDefaults()` returns to **view2**, not the welcome screen, so the attract
screen never shows again. It does not reset the layout, clear the rendered receipt, or clear the
QR. **The next customer sees the previous customer's photos.**

### 2.11 Base64 data URLs don't scale
`rawImageBufferQueue` holds data-URL strings injected into CSS `background-image`. ~50 KB each
at 480p; ~8–12 MB each at print resolution, as strings in DOM style attributes. This collapses
the moment resolution rises.

### 2.12 No undo; stickers are permanent
No resize, rotate, delete, z-order or selection. One mis-drop and the only recourse is
restarting the session.

### 2.13 The kiosk requires internet to boot
Tailwind, Font Awesome and QRCode.js all load from CDNs. A venue with bad WiFi gets an unstyled
page with no icons and no QR generator — fatal for an offline-first product.

### 2.14 No kiosk hardening
No fullscreen lock, no exit prevention, no idle/abandonment timeout (a customer who walks away
strands the booth forever), no attract loop, no admin escape hatch, no crash recovery.

### 2.15 Minor fragilities
`hidden` and `flex` on the same element, working only by Tailwind's stylesheet ordering;
placeholder sticker art (a triangle named `dino-party`); global functions and inline `onclick`;
no types, no build, no tests.

---

## 3. Missing business features

The prototype is a **photo toy**; a photobooth business needs a **transaction system**.

- **Money.** No packages, pricing, payment, receipt numbers (despite the receipt aesthetic),
  refunds, or revenue record. The booth cannot take money.
- **Session identity.** No session object exists. Nothing ties photos → package → theme →
  payment → prints → customer → time. Without it: no history, search, reprint, analytics,
  support, or crash recovery.
- **Printing.** Entirely absent — and printing *is* the product. Missing silent print, copies,
  queue, reprint, cancel, history, multi-printer, and **consumable tracking** (a DNP RX1 ribbon
  is 700 prints; the operator must be warned at 50 left, not discover it mid-wedding).
- **Operator tooling.** No admin panel, password gate, settings, diagnostics, storage monitor,
  logs, staff accounts, or audit trail on reprints and refunds.
- **Event mode.** Weddings and corporate — the highest-margin work — need event name, date,
  logo, overlay and hashtag set once and branded onto every print.
- **Delivery.** QR, download page, email, SMS, GIF/boomerang: all absent.
- **Data lifecycle & consent.** Identifiable faces of the public are captured with no consent
  moment, stated retention, or deletion path. Required under the PH Data Privacy Act (and GDPR
  for EU-facing clients). Cheap now, expensive to retrofit.
- **Product-grade concerns.** Licensing/activation, auto-update, crash telemetry, per-branch
  config, backup/restore, data-migration story.

---

## 4. Governing principles carried into Phase 2

1. **One renderer.** Preview and print run the same composition engine at different scales.
   *Kills 2.2, 2.3, 2.4.*
2. **Session is the aggregate root.** Everything persists to SQLite as it happens.
   *Kills 2.10; enables history, search, analytics, reprint, recovery.*
3. **Layouts, themes, packages, filters and printers are data, not code.**
   *This is what makes the product sellable to other operators.*

---

## 5. Locked decisions

| Area | Decision | Consequence |
|------|----------|-------------|
| **Camera** | Webcam now, DSLR later | React never touches `getUserMedia`; it asks a `CaptureDevice` port for a frame and receives a file path. A `MockDevice` makes the app demoable on hardware with no camera. |
| **Printer** | Dye-sub **and** inkjet, configurable per branch | A layout must not know what paper it lands on. Layout declares aspect + safe area; printer profile declares paper sizes, DPI, cut modes, bleed, consumables. Resolved at print time. |
| **Payment** | All three modes | Booth **operating mode** (`ATTENDED` / `UNATTENDED` / `EVENT`) is first-class runtime config. A `PaymentProvider` strategy covers cash, GCash, Maya, coin/bill, and a null provider for pre-paid events. |
| **Delivery** | Local now, cloud when synced | QR encodes a stable **session code**, not a file path. Resolves locally immediately; the same code upgrades to a permanent public link once uploaded. |

### Open risk logged at Phase 1

Unattended GCash/Maya payment **requires internet** — it collides with offline-first. Resolution
adopted: unattended mode declares its accepted providers; when connectivity drops the booth
degrades to coin/bill if fitted, otherwise posts *attendant required*. **The booth refuses a sale
it cannot verify rather than taking money it may lose.**
