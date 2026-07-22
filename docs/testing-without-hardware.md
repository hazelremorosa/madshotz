# Testing on a Laptop, Without Booth Hardware

**Short answer: yes — the entire application runs and is fully testable on a laptop with no tablet,
no dye-sub printer, no payment terminal and, if necessary, no camera.**

This is not a workaround bolted on later. It is a direct payoff of the Phase 2 ports-and-adapters
design: every piece of hardware sits behind an interface, so every piece of hardware has a fake.

---

## 1. What "runs on a laptop" means

`pnpm dev` opens the real Electron application in a window. Same code, same database, same flow,
same renderer. Nothing is stubbed at the UI layer.

| Concern | On the laptop |
|---------|---------------|
| **App shell** | Real. Windowed instead of kiosk-locked. |
| **Orientation** | Landscape natively; **portrait previewable** via a dev device-frame toggle (§3). |
| **Database** | Real SQLite file, real Prisma migrations, seeded with demo data. |
| **Camera** | Laptop webcam via the real `WebcamCaptureDevice`. No camera at all → `MockCaptureDevice`. |
| **Printing** | `VirtualPrinterGateway` — the full pipeline, output written to a folder. |
| **Payment** | `MockPaymentProvider` with success / failure / timeout buttons. |
| **Delivery** | Real local HTTP server. Scan the QR with your phone on the same WiFi — **it genuinely works.** |
| **Cloud sync** | Real queue, fake target. Toggle "offline" to watch it queue and drain. |

---

## 2. The mock adapters

Each is a legitimate implementation of a Phase 2 port — not an `if (dev)` branch scattered through
the codebase. That distinction matters: mocks that live behind interfaces cannot rot, because they
must keep satisfying the same contract as the real adapter.

| Port | Mock | Behaviour |
|------|------|-----------|
| `CaptureDevice` | `MockCaptureDevice` | Replays a folder of fixture photos on the same countdown timing. Deterministic — the same session produces the same photos, which is what makes automated tests possible. |
| `PrinterGateway` | `VirtualPrinterGateway` | Runs the **real** render pipeline at true print resolution, then writes `print-ready.png` and a PDF to `./virtual-printer/` instead of spooling. Simulates duration, and can be told to fail, jam or run out of ribbon. |
| `PaymentProvider` | `MockPaymentProvider` | Approve / decline / timeout on demand. |
| `DeliveryChannel` | `MockEmailChannel`, `MockSmsChannel` | Writes the message to disk; nothing is actually sent. |
| `SyncTarget` | `MockCloudTarget` | Accepts uploads with artificial latency; can be forced offline. |

**The critical one is `VirtualPrinterGateway`.** Because it runs the genuine composition render, you
can verify print geometry, DPI, bleed, safe areas, sticker placement and text rendering **exactly**,
on a laptop, before ever buying a printer. Open the PNG at 100% and you are looking at what the
dye-sub would have produced.

---

## 3. Previewing the tablet's portrait design on a laptop

Portrait is canonical (Phase 2 §1), so you need to see it without owning the tablet. A dev-only
toolbar offers device frames:

```
┌──────────────────────────────────────────────────────────┐
│  DEV   [ Tablet 3:2 ▾ ]  [ ⟳ rotate ]  [ ● touch sim ]   │
├──────────────────────────────────────────────────────────┤
│                  ┌──────────────────┐                    │
│                  │                  │                    │
│                  │   the kiosk,     │                    │
│                  │   letterboxed    │                    │
│                  │   to the chosen  │                    │
│                  │   tablet aspect  │                    │
│                  │                  │                    │
│                  └──────────────────┘                    │
└──────────────────────────────────────────────────────────┘
```

Presets cover 3:2 (Surface class), 16:10 and 9:16, since the panel is not yet chosen — see
[Hardware Recommendations](./hardware-recommendations.md). **Touch simulation** forces
`useInputModality()` to report `touch`, so you can verify 48 px targets and confirm nothing depends
on hover, using a mouse.

---

## 4. The simulator panel — testing what you cannot break on purpose

You cannot test "out of ribbon at a wedding" by running out of ribbon at a wedding. A dev-only panel
forces every failure state:

```
┌────────────────────────────────────────┐
│  SIMULATOR                        ✕    │
├────────────────────────────────────────┤
│  Camera      ● ok  ○ missing ○ crashed │
│  Printer     ● ok  ○ offline ○ jammed  │
│  Ribbon      [ 612 ] prints  [ set 3 ] │
│  Storage     ● ok  ○ low     ○ full    │
│  Network     ● online        ○ offline │
│  Payment     ● approve ○ decline ○ t/o │
├────────────────────────────────────────┤
│  [ skip to screen ▾ ]  [ seed 50 sess ]│
│  [ trigger idle timeout ]              │
│  [ simulate crash & recover ]          │
└────────────────────────────────────────┘
```

Every state in [System States](./phase-3-wireframes-system-states.md) is reachable from here. This
panel is compiled out of production builds entirely.

---

## 5. What a laptop genuinely cannot verify

Honest limits — these need the real hardware, and none of them are software risks:

| Cannot verify | Why it matters | When to check |
|---------------|----------------|---------------|
| **Colour accuracy** | Dye-sub colour differs from your screen; needs an ICC profile from real prints | On printer purchase |
| **True print sharpness** | Depends on the actual camera and venue lighting | On camera purchase |
| **2-inch cut on strips** | A physical dye-sub mechanism | On printer purchase |
| **Real ribbon counting** | Read from the driver | On printer purchase |
| **Sustained thermal behaviour** | A fanless tablet throttles; a laptop may not | On tablet purchase |
| **Touch ergonomics** | Whether a real thumb can reach the editor tray | On tablet purchase |
| **GCash/Maya live flow** | Real accounts and real money | Before unattended mode goes live |

Everything above is a **hardware validation task**, not a development blocker. You can build,
demo and sell against the laptop build, then validate these as equipment arrives.

---

## 6. Practical consequence

You can develop the whole product, run a full demo for a client, and test every screen and every
failure path **before spending anything on hardware.** When the tablet and printer arrive, the work
is swapping two adapters and calibrating colour — not rewriting the application.
