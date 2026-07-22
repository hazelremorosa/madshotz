# MAD SHOT'Z — Documentation

Production photobooth kiosk software. Electron + React + TypeScript, offline-first,
designed to be sold to photobooth operators.

## Phases

| Phase | Document | Status |
|-------|----------|--------|
| 1 | [Prototype Audit](./phase-1-prototype-audit.md) | ✅ Approved |
| 2 | [Application Architecture](./phase-2-architecture.md) | ✅ Approved |
| 3 | Wireframes — [Kiosk](./phase-3-wireframes-kiosk.md) · [Admin](./phase-3-wireframes-admin.md) · [System states](./phase-3-wireframes-system-states.md) | 🔵 In review |
| 4 | [UI/UX Design System](./phase-4-design-system.md) — [**live version**](./phase-4-design-system.html) | 🔵 In review |
| 5 | SQLite Schema (full Prisma DSL, indexes, migrations) | ⬜ Pending |
| 6 | API Layer (local delivery server + cloud sync contract) | ⬜ Pending |
| 7 | Reusable Component Library | ⬜ Pending |
| 8 | Feature-by-feature implementation | ⬜ Pending |

Each phase requires sign-off before the next begins.

## Practical guides

- [Hardware Recommendations](./hardware-recommendations.md) — read before buying the tablet,
  camera or printer
- [Testing Without Hardware](./testing-without-hardware.md) — how the whole app runs and is
  testable on a laptop

## Locked decisions

Recorded in [Phase 1 §6](./phase-1-prototype-audit.md#6-locked-decisions). Summary:

| Area | Decision |
|------|----------|
| **Camera** | Webcam (getUserMedia) for v1, behind a `CaptureDevice` port so tethered DSLR drops in later |
| **Printer** | Dye-sub **and** inkjet/laser, both driven by data-defined printer profiles, per branch |
| **Payment** | All modes — attended, unattended (GCash/Maya/coin), and free/event-hosted |
| **Delivery** | Local WiFi server first, same QR code upgrades to a cloud link once synced |

## Governing principles

1. **One renderer.** Preview and print run the same composition code at different scales.
   WYSIWYG is guaranteed by construction, not by discipline.
2. **Session is the aggregate root.** Every photo, print, payment and delivery hangs off a
   session persisted as it happens. A power cut costs one screen, not one customer.
3. **Layouts, themes, packages, filters and printers are data, not code.** New ones ship
   without a build.

## Reference

`booth.html` in the repo root is the original proof-of-concept. It is kept for reference
only — none of its code carries forward. See Phase 1 for the full audit.
