# Hardware Recommendations

Written because the tablet is not yet purchased. **Read this before buying.** Every item here is
driven by a requirement already locked in Phase 2 — nothing is aspirational.

---

## 1. The single most important finding

> **Do not rely on the tablet's built-in camera. Budget for an external USB webcam.**

A 4×6" print at 300 DPI is **1200 × 1800 = 2.2 megapixels of real detail**. Tablet front-facing
cameras are typically 1080p (2.07 MP) with small sensors, fixed focus, heavy noise reduction and
poor low-light performance. At a dim reception venue the output will be soft and grainy — and
because it is *printed*, there is nowhere to hide it. This is the exact failure the Phase 1 audit
found in the prototype (§2.1), and buying the wrong camera reintroduces it in hardware.

An external webcam also lets you position the lens at guest eye level independently of the screen,
which is how commercial booths are built.

| Camera | Verdict |
|--------|---------|
| Tablet built-in | ❌ Print quality inadequate. Fine for the `MockDevice` and development only. |
| Logitech Brio 4K / Obsbot Tiny 2 class | ✅ **Recommended.** 4K stills, autofocus, decent low light. |
| Tethered DSLR/mirrorless | ✅ Best quality. Phase 2 already has the `CaptureDevice` seam for it — you can start on a webcam and upgrade without a rewrite. |

---

## 2. Tablet PC minimum specification

The load is not the UI. It is the **print-resolution render** (offscreen Chromium at 1800 px) plus
**Sharp** derivatives, GIF encoding and SQLite writes — several times per session, back to back, for
hours.

| Component | Minimum | Recommended | Why |
|-----------|---------|-------------|-----|
| **CPU** | Intel N100 / Core i3 12th gen | **Core i5 12th gen+ or Ryzen 5** | Composition render + Sharp are CPU-bound and run per print |
| **RAM** | 8 GB | **16 GB** | Electron + Chromium + offscreen window + Sharp buffers |
| **Storage** | 256 GB SSD | **512 GB SSD** | See §3 |
| **Screen size** | 11" | **12–13"** | Customers must see the preview from arm's length |
| **Resolution** | 1920 × 1200 | 2K+ | Editor precision |
| **Brightness** | 350 nits | **400+ nits** | Venues are bright, or lit for photography |
| **Touch** | 10-point multi-touch | same | Pinch/rotate in the editor requires it |
| **OS** | Windows 11 **Pro** | same | Pro gives Assigned Access (true kiosk lockdown); Home does not |
| **Architecture** | **x86/x64** | same | See §5 — ARM is a real risk |
| **Ports** | USB-C with **Power Delivery** | + USB-A | Must charge *while* the printer and webcam are attached |

### Aspect ratio — a design note

Do not assume 9:16. A Surface Pro is **3:2** (2880 × 1920), which is 2:3 in portrait. Common Windows
tablets are 16:10. The Phase 2 adaptive shell (§1.1) is built for this — it arranges slots by
orientation, not by a hardcoded ratio — but tell me the panel once you buy so the Phase 4 spacing
scale is tuned to the real device.

---

## 3. Storage sizing

Roughly, per session: 4–8 originals at ~4 MB, edited derivatives, a print-ready PNG, web copies and
optionally a GIF. **Budget ~40–60 MB per session.**

| Usage | Sessions | Storage |
|-------|----------|---------|
| One busy wedding | ~150 | ~8 GB |
| One month of weekend events | ~1,200 | ~65 GB |
| One year, before retention purge | ~14,000 | ~750 GB |

**Conclusion:** 512 GB internal is comfortable for months of operation with the Phase 2 retention
purge running. Plan on an external SSD for archive — the Phase 2 storage root is configurable
precisely so you can point it at one.

---

## 4. Printer connection — settle this before you buy

Dye-sub printers (DNP RX1, Citizen CY, Mitsubishi) use **USB-B** and draw meaningful power. Most
tablets expose only one or two USB-C ports.

| Option | Pros | Cons |
|--------|------|------|
| **Powered USB-C hub** ✅ recommended | Cheap, simple, charges tablet through the same hub | One more thing to fail; buy a good one |
| Network print server | Tablet stays cable-free | Extra box, extra config, more failure modes |
| Mini-PC hosts printer, tablet is pure kiosk | Most robust for permanent installs | Most expensive; two machines to maintain |

Whichever you choose selects the `PrinterGateway` adapter. Not urgent — needed by Phase 8.

---

## 5. Two risks worth avoiding

**Windows on ARM.** Some thin, attractive, well-priced tablets are ARM64. Electron runs on ARM64
fine — but **dye-sub printer vendor drivers frequently do not**, and Sharp needs a matching native
binary. If you are drawn to an ARM device, verify the exact printer model's ARM driver support
before purchase. **Safest path: buy x86/x64.**

**Windows 11 Home.** Assigned Access — the OS feature that locks a machine to one application, hides
the shell and survives reboot — is **Pro only**. Without it, kiosk lockdown relies entirely on the
app, and a determined guest can reach the desktop. The Pro upgrade is small; buy Pro.

---

## 6. Suggested starting kit

| Item | Note |
|------|------|
| Windows 11 **Pro**, x64 tablet PC, 12–13", i5, 16 GB, 512 GB | The kiosk |
| External USB webcam (Brio-class) | **The quality decision** — §1 |
| Dye-sub printer, 4×6 with 2-inch cut | 2×6 strips are the classic photobooth product |
| Powered USB-C hub with PD passthrough | Printer + webcam + charging |
| Portrait tablet mount / floor stand | Portrait is the canonical orientation |
| Continuous LED light panel | Biggest single quality gain after the camera; fixes the venue-lighting problem |
| External SSD | Archive beyond the retention window |

The two line items that most affect what a customer sees in their hand are the **camera** and the
**light**. Neither is software.
