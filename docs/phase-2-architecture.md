# Phase 2 — Application Architecture

**Status:** In review
**Depends on:** [Phase 1 audit](./phase-1-prototype-audit.md) and its locked decisions
**Contains no implementation code.** Snippets below are *contracts and shapes*, not files to build.

---

## 0. The one-paragraph version

Electron's **main process owns all durable state and all side effects** — database, filesystem,
printing, payment, the local delivery server, cloud sync. The **renderer owns only ephemeral UI
state** and the live camera. They talk over a single typed, validated IPC contract. Business rules
live in a pure `domain` package with zero runtime dependencies, so they are unit-testable without
Electron, without a database, and without a camera. Everything variable about a booth — layouts,
themes, packages, filters, printers, payment methods — is a database record or an asset manifest,
never a code change.

---

## 1. Process model

```
┌─────────────────────────────────────────────────────────────────────┐
│ MAIN PROCESS (Node.js)                    "owns truth + side effects"│
│                                                                      │
│  Application use cases ──┬── SessionRepository ──► SQLite (Prisma)   │
│                          ├── PhotoStorage      ──► Filesystem        │
│                          ├── PrinterGateway    ──► OS print spooler  │
│                          ├── PaymentProvider   ──► GCash / Maya /    │
│                          │                         coin acceptor     │
│                          ├── DeliveryService   ──► Local HTTP server │
│                          │                         + cloud sync queue│
│                          └── ImageProcessor    ──► Sharp             │
│                                                                      │
│  Offscreen render window ──► print-resolution composition            │
└───────────────────────────┬──────────────────────────────────────────┘
                            │ contextBridge — typed, validated, async
┌───────────────────────────┴──────────────────────────────────────────┐
│ PRELOAD (isolated)   exposes window.madshotz — no ipcRenderer leaked  │
└───────────────────────────┬──────────────────────────────────────────┘
                            │
┌───────────────────────────┴──────────────────────────────────────────┐
│ RENDERER (React)                          "owns pixels + ephemeral"   │
│                                                                       │
│  Kiosk UI  ·  Admin UI  ·  Zustand stores  ·  live <video> preview    │
│  Composition preview (the SAME component the offscreen window renders) │
└───────────────────────────────────────────────────────────────────────┘
```

### Why this split

The renderer is the only place `navigator.mediaDevices` exists, so **webcam capture must be
renderer-side**. But a future tethered DSLR is a native binding and **must be main-side**. The
`CaptureDevice` port is therefore defined in shared code with two adapter *kinds*:

| Adapter | Runs in | Notes |
|---------|---------|-------|
| `WebcamCaptureDevice` | Renderer | `getUserMedia` + `OffscreenCanvas` |
| `DslrCaptureDevice` | Main, proxied to renderer over IPC | gphoto2 / Canon EDSDK, added later |
| `MockCaptureDevice` | Renderer | Replays fixture images — demos and tests without hardware |

The UI depends only on the interface. A factory resolves the active device from settings. **No UI
code changes when the DSLR lands.**

### Window topology

| Window | Purpose |
|--------|---------|
| **Kiosk window** | Fullscreen, always-on-top, frameless, `kiosk: true`. Customer-facing. |
| **Admin window** | Separate window, opened by password gate. Never rendered inside the kiosk tree. |
| **Offscreen render window** | Hidden, sized to exact print pixels. Renders the composition at print resolution. See §7. |

### Security posture

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, no
`@electron/remote`. A strict CSP with no remote origins — **every dependency is bundled**, which
directly fixes audit §2.13. All IPC payloads are validated with Zod at the main boundary; the
renderer is treated as untrusted input even though we wrote it.

---

## 2. Layering (Clean Architecture, mapped onto Electron)

```
    presentation  →  application  →  domain
         │               │             ▲
         │               ▼             │
         └────────►  ports (interfaces)┘
                         ▲
                  infrastructure (adapters)
```

**Dependency rule:** arrows point inward only. `domain` imports nothing. `application` imports
`domain` + `ports`. `infrastructure` implements `ports`. `presentation` calls `application` (via
IPC) and never touches `infrastructure`.

| Layer | Contains | Depends on | Testable with |
|-------|----------|------------|---------------|
| **domain** | `Session`, `Money`, `PrintJob`, `LayoutDefinition`, `PackageRules`, `CompositionSpec`, state machine, validation | *nothing* | Plain Vitest, zero mocks |
| **application** | Use cases: `StartSession`, `CapturePhoto`, `ComposePrint`, `SubmitPrintJob`, `IssueRefund`, `DeliverSession` | domain + ports | In-memory fakes |
| **ports** | `SessionRepository`, `PhotoStorage`, `PrinterGateway`, `PaymentProvider`, `CaptureDevice`, `DeliveryChannel`, `Clock`, `Logger`, `IdGenerator` | domain | — |
| **infrastructure** | `PrismaSessionRepository`, `FsPhotoStorage`, `ElectronPrinterGateway`, `GcashProvider`, `LocalHttpDelivery`, `SharpImageProcessor` | ports | Integration tests |
| **presentation** | React features, Zustand stores, design system | contracts only | RTL + Playwright |

### SOLID, concretely

- **S** — `PrintQueueWorker` schedules; `PrinterGateway` talks to the OS; `PrintTargetResolver`
  computes geometry. Three reasons to change, three units.
- **O** — a new layout, theme, filter, payment method or printer is a new *record* or a new
  *adapter*. No existing file is edited. This is the single most important property of the design.
- **L** — every `PaymentProvider` honours the same contract including failure; the null provider
  for pre-paid events is a legitimate substitute, not a special case sprinkled with `if`s.
- **I** — `PrinterGateway` is not one fat interface. `SupportsConsumableTracking` and
  `SupportsCutModes` are separate capability interfaces that dye-sub implements and inkjet does not.
- **D** — use cases depend on `PhotoStorage`, never on `fs`. Swapping local disk for S3 in the
  future cloud build touches one adapter.

---

## 3. Repository structure

pnpm workspaces. The split is justified by real reuse: `domain` and `contracts` will be consumed
by the future cloud dashboard and mobile companion; `ui` by the cloud dashboard.

```
madshotz/
├── apps/
│   └── desktop/                    # the Electron application
│       ├── electron.vite.config.ts
│       └── src/
│           ├── main/
│           │   ├── bootstrap/      # lifecycle, windows, kiosk hardening, single-instance
│           │   ├── ipc/            # channel registration, Zod validation, error mapping
│           │   ├── modules/        # ← main-process feature modules
│           │   │   ├── session/
│           │   │   ├── imaging/    # Sharp pipeline, derivatives, GIF
│           │   │   ├── composition/# offscreen render orchestration
│           │   │   ├── printing/   # queue worker, gateways, profiles, consumables
│           │   │   ├── payment/    # providers, reconciliation
│           │   │   ├── delivery/   # local HTTP server, email/SMS, cloud sync queue
│           │   │   ├── storage/    # filesystem layout, retention, backup
│           │   │   ├── devices/    # camera + printer enumeration and health
│           │   │   ├── settings/
│           │   │   ├── auth/       # admin accounts, password hashing, sessions
│           │   │   ├── licensing/  # activation (needed to sell to other operators)
│           │   │   └── telemetry/  # logging, crash reports, metrics
│           │   └── infrastructure/ # port implementations
│           │
│           ├── preload/            # contextBridge surface — the ONLY bridge
│           │
│           └── renderer/
│               └── src/
│                   ├── app/        # bootstrap, router, providers, error boundaries
│                   ├── design-system/
│                   ├── features/   # ← renderer feature modules (see below)
│                   └── shared/     # cross-feature hooks, utils, ipc client
│
├── packages/
│   ├── domain/                     # pure business logic — zero runtime deps
│   ├── contracts/                  # IPC channel types + Zod schemas + DTOs
│   ├── database/                   # Prisma schema, migrations, seed, repositories
│   └── ui/                         # design-system primitives (reused by cloud dashboard)
│
├── resources/                      # bundled at build time
│   ├── themes/                     # default theme packs
│   ├── layouts/                    # seed layout definitions
│   ├── fonts/                      # bundled — never CDN
│   └── icons/
│
├── docs/
└── prototype/booth.html            # reference only
```

### Renderer features

```
features/
├── kiosk/
│   ├── attract/          # idle loop, brand screen, consent notice
│   ├── package-select/
│   ├── payment/
│   ├── theme-select/
│   ├── layout-select/
│   ├── capture/          # live preview, countdown, shutter, progress
│   ├── review/           # per-photo keep/retake
│   ├── filters/
│   ├── editor/           # stickers, text, frames, transform, undo/redo
│   ├── preview/          # final approval before print
│   ├── printing/         # progress + failure recovery
│   └── delivery/         # QR, email, SMS, download
└── admin/
    ├── dashboard/ · analytics/ · sessions/ (search + reprint) · packages/
    ├── themes/ · layouts/ · printers/ · devices/ · events/ · users/
    ├── settings/ · storage/ · logs/
```

**Feature module rules**

1. Each feature owns `components/`, `hooks/`, `store.ts`, `api.ts`, `types.ts`, `index.ts`.
2. A feature may import from `shared/`, `design-system/` and `@madshotz/contracts` — never from
   another feature's internals.
3. Cross-feature coordination goes through the **session state machine**, not direct imports.
   This is what keeps the flow re-orderable when a package skips the editor step.
4. `api.ts` is the only file in a feature that touches `window.madshotz`.

---

## 4. Domain model

Entity-relationship level only. The full Prisma DSL, indexes and migration strategy are **Phase 5**.

```
Branch ──< User ──< AuditLog
   │
   ├──< PrinterProfile ──< ConsumableLog
   │
   ├──< Package ─┐
   ├──< Theme ───┤
   ├──< Layout ──┤        (allow-lists, many-to-many)
   ├──< Filter ──┘
   │
   ├──< Event ────────────< Session
   │                          │
   │      ┌───────────────────┼───────────────────┬──────────────┐
   │      │                   │                   │              │
   │   Photo ──< PhotoAsset   Composition ──< PrintJob      Payment
   │                                │                            │
   │                          DeliveryRecord               (refunds)
   │
   └──< SyncQueueItem                       Setting (scoped key/value)
```

### The aggregate root

`Session` is the transactional boundary. It is created the instant a customer engages and is
**written on every state transition** — not at the end. Its fields carry the whole commercial
record: branch, event, package, theme, layout, operator, receipt number, session code, customer
contact (optional), status, timestamps.

**Session code** is a short, unguessable, human-readable identifier (e.g. `MS-7K4Q-92`). It is what
the QR encodes, what the local server routes on, what the cloud link resolves to, and what a
customer reads out over the phone. It is never a file path — that indirection is what lets the same
QR upgrade from local to cloud (locked decision §4).

**Money** is stored as integer minor units (centavos) with an explicit currency. Never a float.

### Key entities

| Entity | Carries |
|--------|---------|
| **Package** | price, photo count, print count, allowed layouts/themes/filters, editing enabled, active, sort order |
| **Theme** | manifest reference: background, frames, sticker pack, fonts, logo, colour palette, animation set |
| **Layout** | slug, aspect ratio, slot geometry (normalised), photo count, safe area, allowed print targets |
| **Filter** | a **single parameter set** (brightness, contrast, saturation, temperature, curve, grain, vignette) — see §8 |
| **PrinterProfile** | system printer name, kind (`DYE_SUB` \| `INKJET`), paper sizes, DPI, cut modes, bleed, tracks-consumable, capacity, remaining |
| **Event** | name, date, logo, overlay, hashtag, forced theme/package, print limit — the wedding/corporate mode |
| **PrintJob** | composition, printer profile, copies, status, attempts, error, is-reprint, reprint-of, operator |
| **DeliveryRecord** | channel (`LOCAL` \| `CLOUD` \| `EMAIL` \| `SMS`), status, target, URL, sent-at |
| **SyncQueueItem** | entity type/id, operation, payload, attempts, status — the offline-first spine |

### Data lifecycle

`Session.retainUntil` is stamped at creation from the branch retention policy. A scheduled purge
job deletes expired photo assets and anonymises contact fields, leaving the financial record
intact for accounting. This satisfies the PH Data Privacy Act obligation identified in audit §3
without destroying revenue history.

---

## 5. IPC contract

One source of truth: `packages/contracts` exports a channel map that types both sides.

```ts
// shape only — Phase 8 builds it
type IpcContract = {
  'session:start':    { req: StartSessionInput;  res: SessionDto }
  'session:capture':  { req: CapturePhotoInput;  res: PhotoDto }
  'print:submit':     { req: SubmitPrintInput;   res: PrintJobDto }
  // …
}

type IpcEvents = {            // main → renderer, push only
  'device:status':   DeviceStatusDto
  'print:progress':  PrintJobDto
  'sync:progress':   SyncStatusDto
}
```

**Three message kinds**

| Kind | Direction | Use |
|------|-----------|-----|
| `invoke` | renderer → main → renderer | Every command and query. Always async, always returns a `Result`. |
| `event` | main → renderer | Printer status, device changes, sync progress, consumable warnings. |
| `stream` | main → renderer | Long operations (composition render, cloud upload) reporting progress. |

**Error discipline.** Main never throws raw across the bridge. Every handler returns

```ts
Result<T, { code: AppErrorCode; userMessage: string; correlationId: string }>
```

`code` is what the renderer switches on; `userMessage` is pre-localised and safe to show a
customer on a kiosk; `correlationId` ties the UI error to the log line. **No stack traces or
filesystem paths ever cross to the renderer.**

This directly replaces the prototype's `alert("Camera connection missing.")` — a kiosk shows an
in-flow recovery panel, never a modal nobody can dismiss.

---

## 6. Camera pipeline

```
enumerate → acquire stream → live preview (MIRRORED, CSS only)
                                    │
                            countdown (configurable)
                                    │
              draw to OffscreenCanvas at native resolution, UN-MIRRORED
                                    │
                    encode → ArrayBuffer → IPC → main
                                    │
              Sharp: orient, colour-manage, write original to disk
                                    │
              return { photoId, path, thumbnailDataUrl } to renderer
```

**Decisions**

- **Mirror policy.** Preview mirrors (people need it to pose); the captured frame does not. Fixes
  audit §2.7 — no more backwards wedding signage.
- **Resolution policy.** Request the highest resolution the device offers that satisfies the
  chosen layout's slot requirement at the target print DPI. If the camera cannot reach it, the
  **admin panel warns at configuration time**, not the customer at print time.
- **The renderer never holds full-resolution pixels.** It holds a photo id, a file path and a small
  thumbnail. Fixes audit §2.11.
- **Lifecycle.** The stream is acquired on session start and explicitly released — `track.stop()`
  — on session end, abandonment or error. Fixes audit §2.9.
- **Health.** A device monitor in main emits `device:status`; the admin dashboard shows camera
  state, and the kiosk refuses to start a session with a dead camera rather than failing mid-flow.

---

## 7. Composition engine — the WYSIWYG guarantee

This is the answer to audit §2.2, §2.3 and §2.4, and the most important section of this document.

### The spec

A `CompositionSpec` is serialisable JSON describing the entire artwork in **normalised
coordinates (0–1)** relative to the canvas:

```ts
type CompositionSpec = {
  layoutId: string
  themeId: string
  canvas: { aspect: number }                    // no pixel dimensions — resolution-independent
  nodes: Array<
    | { kind: 'photo';   slot: number; photoId: string; filter?: FilterParams; transform: Transform }
    | { kind: 'sticker'; assetId: string; transform: Transform }
    | { kind: 'text';    value: string; style: TextStyle; transform: Transform }
    | { kind: 'frame' | 'overlay' | 'logo' | 'watermark'; assetId: string; transform: Transform }
  >
}

type Transform = { x: number; y: number; w: number; h: number; rotation: number; z: number }
//                 ▲ all normalised 0–1 — the fix for stickers printing 30% smaller
```

Because every dimension is a fraction of the canvas, **the same spec renders correctly at 280 px
preview width and 1800 px print width**. There is no second coordinate system to get wrong.

### One renderer, two consumers

```
                    CompositionSpec (JSON, in the DB, auto-saved)
                            │
             ┌──────────────┴──────────────┐
             ▼                             ▼
   <CompositionRenderer/>          <CompositionRenderer/>
   in the kiosk preview            in the OFFSCREEN window
   (CSS-sized to fit)              (sized to exact print pixels)
             │                             │
        what the customer            capturePage() → PNG
          approves                         │
                                    Sharp post-process:
                                    exact DPI · ICC profile ·
                                    sharpening · encode
                                           │
                                    print-ready file
```

**It is literally the same React component.** Not a port, not a parallel canvas implementation.
Divergence is impossible because there is nothing to diverge from.

**Why offscreen Chromium and not Sharp compositing.** Text rendering, web fonts, letter-spacing,
CSS filters and blend modes are what make the receipt aesthetic work. Reproducing them in Sharp
means re-implementing a text engine and re-tuning every theme twice. Rendering in the same
Chromium that drew the preview gives pixel identity for free. **Sharp's job is post-processing**
— exact resize to the print target, ICC colour management, output sharpening, encoding, and
generating the web/thumbnail/GIF derivatives. Each tool does what it is best at.

### Editor state

The editor mutates the spec through a command log, which gives undo/redo for free and is the
missing feature from audit §2.12: `AddNode`, `MoveNode`, `ResizeNode`, `RotateNode`, `DeleteNode`,
`ReorderNode`, `SetText`, `ApplyFilter`. Undo/redo is past/present/future stacks over the spec.
The spec is auto-saved to the session on every settled command, so a crash mid-edit loses nothing.

---

## 8. Filters — one definition, not two

A filter is **one parameter set**, not a CSS version plus a Sharp version. Preview applies the
parameters as CSS `filter` plus overlay layers; the offscreen print render applies **exactly the
same CSS** at print scale. Sharp never applies filters.

This is the §7 principle applied again: two implementations of one visual effect will drift, so
there is only ever one. Black & White, Vintage, Warm, Cold, Bright, Soft, Korean and Film all ship
as **records** — the operator can tune them, and new ones need no build.

---

## 9. Print pipeline

```
Composition approved
      │
      ▼
PrintJob written to DB as QUEUED  ◄── durable BEFORE anything is sent; survives a crash
      │
      ▼
PrintQueueWorker (one worker per printer, sequential)
      │
      ├─► PrintTargetResolver:  Layout (aspect + safe area)
      │                       × PrinterProfile (paper, DPI, bleed, cut)
      │                       = exact pixel geometry
      │
      ├─► render at that geometry (§7) → print-ready file
      │
      ├─► PrinterGateway.print({ silent: true, deviceName, copies, margins: none })
      │
      ├─► success → decrement consumable → mark COMPLETED
      └─► failure → retry with backoff → FAILED + operator alert
```

**Layout × profile resolution** is the mechanism that makes the "both printer kinds" decision work.
A layout declares *shape*; a profile declares *paper*. Neither knows the other exists.

| | Dye-sub | Inkjet/laser |
|---|---|---|
| 4×6 portrait @300 DPI | 1200 × 1800 | 1200 × 1800 |
| 2×6 strip | two-up on 4×6 with a 2-inch cut | printed as-is, no cut |
| Consumables | ribbon countdown, warn at 100/50/10 | not tracked (capability interface absent) |
| Margins | zero, full bleed | printer-reported hardware margins |

**Operator features that fall out of a durable queue:** reprint (a new job referencing the same
composition, written to the audit log), cancel, multiple copies, print history, and multi-printer
routing. All of audit §3's printing gap is covered by this one design.

---

## 10. Storage pipeline

```
{storageRoot}/                                   ← configurable; external drive supported
├── events/{event-slug}/sessions/{yyyy-mm-dd}/{sessionCode}/
│     ├── originals/    001.jpg …                ← untouched capture
│     ├── edited/                                ← filtered/edited derivatives
│     ├── print/        composition.png, print-ready.png
│     ├── web/                                   ← downscaled, for delivery
│     ├── animation/    session.gif, boomerang.mp4
│     └── session.json                           ← self-describing manifest
├── assets/themes/{theme-slug}/
├── backups/
└── logs/
```

**The manifest is the disaster-recovery story.** `session.json` contains the full session record
and its `CompositionSpec`. If the database is lost or corrupted, it can be rebuilt by walking the
storage tree. Losing a customer's photos should require losing the disk, not losing a file.

A storage monitor reports free space and total usage to the admin dashboard, warns at configurable
thresholds, and refuses to start a session below a hard floor rather than failing at write time.
Retention purge runs on schedule per §4.

---

## 11. State management

Zustand, with deliberately narrow store boundaries:

| Store | Owns | Persisted? |
|-------|------|-----------|
| `useKioskStore` | operating mode, active screen, idle timer, attract loop | no |
| `useSessionStore` | the session state machine | **yes — after every transition** |
| `useEditorStore` | `CompositionSpec` + undo/redo stacks | **yes — debounced** |
| `useDeviceStore` | camera/printer/storage/network health (fed by `device:status`) | no |
| `useSettingsStore` | branch settings, theme defaults | read-through from main |
| `useAuthStore` | admin identity, permissions | session-scoped |

### The session state machine

```
ATTRACT ─► PACKAGE ─► PAYMENT ─► THEME ─► LAYOUT ─► PREPARE ─► CAPTURING(n)
                                                                    │
   COMPLETE ◄─ DELIVERY ◄─ PRINTING ◄─ PREVIEW ◄─ EDIT ◄─ FILTERS ◄─ REVIEW
      │                                                                │
      └──────────────────► ATTRACT                            (retake ─┘)

   any state ─► ERROR (recoverable) ─► back to the last safe state
   any state ─► ABANDONED (idle timeout) ─► cleanup ─► ATTRACT
```

- **Transitions are gated by package rules.** A package with editing disabled transitions
  `FILTERS → PREVIEW`, skipping `EDIT`. A pre-paid event package skips `PAYMENT`. The flow is
  data-driven, which is why features must not import each other directly (§3).
- **Every transition persists.** Crash recovery reads the last state on boot and either resumes or
  cleanly closes the orphaned session. Fixes audit §2.14.
- **`ABANDONED` is a first-class state.** An idle timeout tears down the camera, purges the
  in-progress artwork, and returns to attract. Fixes audit §2.10 and §2.14 — the next customer can
  never see the previous customer's photos, because reset is a machine transition rather than a
  function someone remembered to call.

---

## 12. Delivery pipeline

```
Session completes
      │
      ├─► LocalHttpServer (bound to LAN)  →  http://{booth-ip}:8080/s/{sessionCode}
      │        serves: originals · edited · print layout · GIF · boomerang
      │        auth: the unguessable session code, rate-limited
      │
      ├─► QR encodes a resolver URL keyed on {sessionCode}
      │        offline → resolves to the local address
      │        online  → resolves to the permanent cloud link
      │
      └─► SyncQueue → cloud upload when connectivity returns
                   → DeliveryRecord updated with the permanent URL
                   → email / SMS dispatched from the same queue
```

Because the QR encodes a **code, not a path**, one printed QR is valid both at the venue and
permanently afterwards. This is the locked delivery decision made concrete, and it is also the
seam where the future cloud dashboard and mobile app attach.

---

## 13. Extension seams — how the future features land

Every item on the future list attaches to a named seam without a rewrite:

| Future feature | Seam |
|----------------|------|
| AI background removal, face enhance | `ImageProcessor` pipeline stage |
| Green screen | `ImageProcessor` stage + a `CaptureDevice` capability flag |
| Boomerang, GIF, video | `AnimationEncoder` port; capture already stores frame sequences |
| GCash, Maya, credit card | `PaymentProvider` adapter |
| Social media upload | `DeliveryChannel` adapter |
| Cloud dashboard, mobile app | `SyncTarget` + the existing `SyncQueue`; reuse `domain`, `contracts`, `ui` |
| Multi-branch | `Branch` is already the root of the data model |
| Booking system | New feature module + new entity; no existing module changes |
| DSLR | `CaptureDevice` adapter (§1) |

**None of these require editing an existing use case.** That is the Open/Closed principle being
worth its cost.

---

## 14. Non-functional design

| Requirement | Mechanism |
|-------------|-----------|
| **Offline first** | SQLite + filesystem are the source of truth; cloud is a queue, never a dependency. Every asset bundled — no CDN (fixes §2.13). |
| **Fast** | Renderer holds thumbnails, not full-res; heavy work in main; virtualised admin lists; lazy-loaded admin routes. |
| **Auto-save** | Every state transition and settled editor command persists. |
| **Auto-recovery** | Boot-time reconciliation of orphaned sessions and stuck print jobs; watchdog restarts a crashed renderer into the last safe state. |
| **Error handling** | `Result` at every boundary; React error boundaries per feature; kiosk shows recovery panels, never modals. |
| **Logging** | Structured, rotating, correlation-id threaded from IPC call to log line. Viewable in the admin panel. |
| **Type safety** | `strict` TypeScript; Zod at every external boundary (IPC, filesystem manifests, theme manifests, cloud responses). |
| **Dark mode** | Design tokens (Phase 4). The kiosk ships dark; the admin panel supports both. |
| **Touch + mouse** | 44 px minimum targets, no hover-only affordances, gesture support in the editor, full keyboard shortcuts in admin. |
| **Testing** | Vitest for domain/application (fast, no mocks); integration tests for adapters; Playwright for the kiosk flow; a golden-image test asserting preview and print render identically. |
| **Licensing** | Activation module — required before selling to other operators. |

---

## 15. Open questions for Phase 3

1. **Target OS** — Windows-only, or Windows + Linux? It affects the print gateway implementation
   and the packaging story.
2. **Screen size and orientation** — the prototype assumes 9:16 portrait. Confirm the physical
   panel; wireframes depend on it.
3. **Attendant workflow** — in `ATTENDED` mode, does staff use the same screen (a hidden gesture to
   open controls) or a second device?
4. **Consent moment** — where in the flow does the privacy notice appear? My recommendation is the
   attract screen, acknowledged once per session, non-blocking.

---

## Approval requested

On sign-off, **Phase 3** delivers wireframes for every screen in §3's feature list — both kiosk and
admin — including the error, empty, offline and abandoned states that the prototype has none of.
