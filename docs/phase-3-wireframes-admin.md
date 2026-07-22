# Phase 3b — Wireframes: Staff & Admin

Two tiers, per Phase 2 §1: the **attendant drawer** for mid-session actions, and the **admin panel**
for everything else. Both live in the kiosk window — there is no second screen.

**Responsive rule:** admin is the one area authored **landscape-first** (it is used mostly on the
laptop, and during setup). On the portrait tablet, every table collapses to a card list and the nav
rail becomes a bottom sheet. No admin screen is designed twice.

---

## S1 · Attendant drawer

Entry: long-press the fixed top-left 64×64 zone for 1.5 s (touch) or `Ctrl+Shift+A` (laptop), then a
4-digit PIN. **Overlays the current screen. Does not disturb session state.**

```
                    ┌────────────────────────────────┐
                    │  ATTENDANT              ✕      │
                    ├────────────────────────────────┤
                    │  Session  MS-7K4Q-92           │
                    │  Premium · ₱349 · UNPAID       │
                    │  Screen: PAYMENT               │
                    ├────────────────────────────────┤
                    │  ┌──────────────────────────┐  │
                    │  │ ▓▓  MARK AS PAID  ▓▓▓▓▓  │  │
                    │  └──────────────────────────┘  │
                    │   cash ▾   ₱349                │
                    ├────────────────────────────────┤
                    │  [ ↻ reprint last ]            │
                    │  [ ⏸ pause session ]           │
                    │  [ ⏭ skip this step ]          │
                    │  [ ✕ void session ]            │
                    ├────────────────────────────────┤
                    │  ● camera ok                   │
                    │  ● printer ready · 612 left    │
                    │  ● storage 41% · ◑ 3 queued    │
                    ├────────────────────────────────┤
                    │  [  ADMIN PANEL  →  ]          │
                    └────────────────────────────────┘
```

Slides in from the right, 380 px, dimming the screen behind. **Every action is written to the audit
log with the operator's identity** — this is how you find out who voided sessions on a night when
the till was short.

`⏭ skip this step` exists because live events go wrong: a customer walks off mid-capture, a payment
device hangs. Staff need an override that does not destroy the session.

### S1b · PIN pad

```
              ┌────────────────────┐
              │   STAFF ACCESS     │
              │                    │
              │    ● ● ● ○         │
              │                    │
              │   ┌──┐┌──┐┌──┐     │
              │   │1 ││2 ││3 │     │
              │   ├──┤├──┤├──┤     │
              │   │4 ││5 ││6 │     │
              │   ├──┤├──┤├──┤     │
              │   │7 ││8 ││9 │     │
              │   ├──┤├──┤├──┤     │
              │   │← ││0 ││ ✓│     │
              │   └──┘└──┘└──┘     │
              │                    │
              │   3 attempts left  │
              └────────────────────┘
```

Lockout after 5 failures, escalating delay. Auto-dismisses after 10 s idle so a half-open drawer
never faces a customer.

---

## A0 · Admin login

Full password, separate from the PIN. Requires the customer session to be closed or parked first.

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│                  M A D   S H O T ' Z                     │
│                    ADMIN  ACCESS                         │
│                                                          │
│          ┌────────────────────────────────┐              │
│          │ user       [ hazel          ▾] │              │
│          │ password   [ ••••••••••      ] │              │
│          │                                │              │
│          │      ┌──────────────────┐      │              │
│          │      │ ▓▓   SIGN IN  ▓▓ │      │              │
│          │      └──────────────────┘      │              │
│          └────────────────────────────────┘              │
│                                                          │
│              booth: MAIN · v1.0.0 · licensed             │
└──────────────────────────────────────────────────────────┘
```

---

## A1 · Dashboard

The landing screen. Answers "how is today going?" without a single click.

```
┌────────┬─────────────────────────────────────────────────┐
│ ◆ MAD  │  DASHBOARD              Today · Tue 22 Jul  ⟳   │
│ SHOT'Z ├─────────────────────────────────────────────────┤
│        │  ┌───────────┐┌───────────┐┌───────────┐        │
│ ▸ Dash │  │ REVENUE   ││ SESSIONS  ││ PRINTS    │        │
│   Sess │  │ ₱ 8,450   ││    27     ││    41     │        │
│   Anal │  │ ▲ 12% wk  ││ ▲ 3 vs wk ││ 612 left  │        │
│        │  └───────────┘└───────────┘└───────────┘        │
│ ─────  │  ┌───────────┐┌───────────┐┌───────────┐        │
│   Pack │  │ AVG SESS  ││ TOP LAYOUT││ TOP THEME │        │
│   Them │  │  4m 12s   ││ 4-GRID 48%││ RECEIPT   │        │
│   Layo │  └───────────┘└───────────┘└───────────┘        │
│   Filt ├─────────────────────────────────────────────────┤
│        │  SYSTEM                                         │
│ ─────  │  ● Camera    Logitech Brio      1920×1080  ok   │
│   Prnt │  ● Printer   DNP RX1            ready           │
│   Even │  ◐ Ribbon    ▓▓▓▓▓▓▓▓▓▓▓▓░░░░   612 / 700       │
│   Users│  ● Storage   ▓▓▓▓▓▓░░░░░░░░░░   198GB free 41%  │
│   Sett │  ◑ Sync      3 sessions queued · offline        │
│   Logs ├─────────────────────────────────────────────────┤
│        │  TODAY BY HOUR                                  │
│ ─────  │   6 ┤          ▄▄                               │
│ hazel  │   4 ┤      ▄▄  ██  ▄▄                           │
│ ⏻ exit │   2 ┤  ▄▄  ██  ██  ██  ▄▄                       │
│        │   0 ┼──┴───┴───┴───┴───┴───┴──                  │
│        │     10  12  14  16  18  20                      │
│        ├─────────────────────────────────────────────────┤
│        │  RECENT              [ view all → ]             │
│        │  MS-7K4Q-92  19:42  Premium  ₱349  ✓ ●2 prints  │
│        │  MS-3B8X-11  19:31  Basic    ₱199  ✓ ●1         │
│        │  MS-9QP2-40  19:22  Premium  ₱349  ⚠ print fail │
│        └─────────────────────────────────────────────────┘
└────────┴─────────────────────────────────────────────────┘
```

**Ribbon remaining is a headline metric, not a footnote.** It is the consumable that ends an event
when it runs out, and the operator must see it without navigating.

*Portrait:* stat cards go 2-up, nav collapses to a bottom sheet, chart spans full width.

---

## A2 · Sessions — search & history

Covers every search key from the brief: date, customer, code, receipt, phone, email.

```
┌────────┬─────────────────────────────────────────────────┐
│        │  SESSIONS                                       │
│        │  ┌───────────────────────────────────────────┐  │
│        │  │ 🔍 code · receipt · name · phone · email   │  │
│        │  └───────────────────────────────────────────┘  │
│        │  [ Today ▾ ][ All events ▾ ][ Any status ▾ ]    │
│        ├─────────────────────────────────────────────────┤
│        │ CODE        TIME   PKG      AMT   PRINT  STATUS │
│        │ ─────────────────────────────────────────────── │
│        │ MS-7K4Q-92  19:42  Premium  349   2      ✓ done │
│        │ MS-3B8X-11  19:31  Basic    199   1      ✓ done │
│        │ MS-9QP2-40  19:22  Premium  349   0      ⚠ fail │
│        │ MS-2LL8-77  19:04  Basic    199   1      ✓ done │
│        │ MS-8XR1-05  18:51  —          0   0      ✕ aband│
│        ├─────────────────────────────────────────────────┤
│        │  27 sessions · ₱8,450   [ export CSV ]  1 2 3 › │
└────────┴─────────────────────────────────────────────────┘
```

Abandoned sessions are shown, not hidden — the abandonment rate is a real operational metric.

---

## A3 · Session detail

Where a customer support call gets resolved.

```
┌──────────────────────────────────────────────────────────┐
│  ‹  MS-7K4Q-92                        Receipt #001284    │
├──────────────────────────────────────────────────────────┤
│  Tue 22 Jul 2026 · 19:42 – 19:47  (4m 51s)               │
│  Premium ₱349 · paid GCash · Receipt theme · 4-Grid      │
│  Event: Reyes–Cruz Wedding    Operator: hazel            │
│  Customer: ana@example.com · +63 917 555 0134            │
├──────────────────────────────────────────────────────────┤
│  PHOTOS                                                  │
│  ┌────┐┌────┐┌────┐┌────┐   ┌──────────┐                 │
│  │ 01 ││ 02 ││ 03 ││ 04 │   │  PRINT   │                 │
│  └────┘└────┘└────┘└────┘   │  LAYOUT  │                 │
│  originals · edited          └──────────┘                │
├──────────────────────────────────────────────────────────┤
│  PRINTS                                                  │
│  #1  19:46  DNP RX1  4×6 ×2   ✓ completed                │
│  ┌──────────────┐ ┌──────────────┐                       │
│  │ ↻ REPRINT    │ │ ⤓ open files │                       │
│  └──────────────┘ └──────────────┘                       │
├──────────────────────────────────────────────────────────┤
│  DELIVERY                                                │
│  ● local  http://192.168.1.44:8080/s/MS-7K4Q-92          │
│  ◑ cloud  queued — will upload when online               │
│  ● email  sent 19:47                                     │
├──────────────────────────────────────────────────────────┤
│  Retention: photos purge 21 Aug 2026   [ delete now ]    │
│  [ audit trail ▾ ]                                       │
└──────────────────────────────────────────────────────────┘
```

**Reprint** creates a new `PrintJob` against the stored composition — no re-editing, no
regeneration, byte-identical to the original. `[delete now]` is the Data Privacy Act erasure path.

---

## A4 · Analytics

```
┌────────┬─────────────────────────────────────────────────┐
│        │  ANALYTICS      [ Day │ Week │ Month │ Year ]   │
│        ├─────────────────────────────────────────────────┤
│        │  REVENUE                       ₱ 184,300 ▲ 22%  │
│        │  ₱30k ┤                        ▄▄                │
│        │  ₱20k ┤        ▄▄      ▄▄  ▄▄  ██  ▄▄           │
│        │  ₱10k ┤   ▄▄   ██  ▄▄  ██  ██  ██  ██           │
│        │     0 ┼───┴────┴───┴───┴───┴───┴───┴──          │
│        │        Jan Feb Mar Apr May Jun Jul              │
│        ├──────────────────────┬──────────────────────────┤
│        │ PEAK HOURS           │ PACKAGE MIX              │
│        │  18–20h  ████████ 34%│  Premium   ██████ 52%    │
│        │  20–22h  ██████   28%│  Basic     ████   31%    │
│        │  16–18h  ████     19%│  Unlimited ██     17%    │
│        ├──────────────────────┼──────────────────────────┤
│        │ TOP LAYOUTS          │ TOP THEMES               │
│        │  4-Grid    ████ 48%  │  Receipt   █████ 44%     │
│        │  3-Strip   ███  31%  │  Wedding   ███   29%     │
│        ├──────────────────────┴──────────────────────────┤
│        │ Avg session 4m 12s · Repeat customers 8%        │
│        │ Abandonment 6% · Prints/session 1.5             │
│        │                              [ export CSV ]     │
└────────┴─────────────────────────────────────────────────┘
```

Every metric here is derivable from the Phase 2 session record — none required extra instrumentation.
That was the point of making `Session` the aggregate root.

---

## A5 · Packages

```
┌────────┬─────────────────────────────────────────────────┐
│        │  PACKAGES                      [ + NEW ]        │
│        ├─────────────────────────────────────────────────┤
│        │ ⣿ BASIC       ₱199  4ph 1pr  ● active    ✎  ⧉  │
│        │ ⣿ PREMIUM     ₱349  8ph 2pr  ● active ★  ✎  ⧉  │
│        │ ⣿ UNLIMITED   ₱599   ∞  4pr  ● active    ✎  ⧉  │
│        │ ⣿ WEDDING     ₱0     ∞  ∞    ○ event     ✎  ⧉  │
│        │   ⣿ drag to reorder — this is kiosk order       │
└────────┴─────────────────────────────────────────────────┘
```

### A5b · Package editor

```
┌──────────────────────────────────────────────────────────┐
│  ‹  EDIT PACKAGE                          [ SAVE ]       │
├──────────────────────────────────────────────────────────┤
│  Name      [ Premium              ]  ★ mark as popular   │
│  Price     [ ₱ 349                ]                      │
│  Badge     [ MOST POPULAR         ]                      │
├──────────────────────────────────────────────────────────┤
│  Photos    [ 8 ]      Retakes  [ 2 ]                     │
│  Prints    [ 2 ]      Copies allowed [ 2 ]               │
├──────────────────────────────────────────────────────────┤
│  ALLOWED LAYOUTS      ☑ all                              │
│   ☑ Single  ☑ 3-Strip  ☑ 4-Grid  ☑ Bottom Row  ☐ Polaroid│
│  ALLOWED THEMES       ☐ all                              │
│   ☑ Receipt  ☑ Wedding  ☑ Birthday  ☐ Corporate          │
│  ALLOWED FILTERS      ☑ all                              │
├──────────────────────────────────────────────────────────┤
│  ☑ editing enabled   ☑ stickers  ☑ text  ☑ frames        │
│  ☑ digital download  ☑ GIF       ☐ boomerang             │
├──────────────────────────────────────────────────────────┤
│  These toggles change the customer flow directly:        │
│  editing off → the editor step is skipped.               │
└──────────────────────────────────────────────────────────┘
```

That closing note is the Phase 2 §11 rule made visible to the operator: **package rules gate state
machine transitions.** Turning off editing does not hide a button; it removes a step.

---

## A6 · Themes

```
┌────────┬─────────────────────────────────────────────────┐
│        │  THEMES                  [ + NEW ] [ ⤒ import ] │
│        ├─────────────────────────────────────────────────┤
│        │ ┌─────────┐ ┌─────────┐ ┌─────────┐             │
│        │ │▓RECEIPT▓│ │ WEDDING │ │BIRTHDAY │             │
│        │ │ default │ │         │ │         │             │
│        │ │  ✎ ⧉ ⤓  │ │  ✎ ⧉ ⤓  │ │  ✎ ⧉ ⤓  │             │
│        │ └─────────┘ └─────────┘ └─────────┘             │
└────────┴─────────────────────────────────────────────────┘
```

### A6b · Theme editor — no code required

```
┌──────────────────────────────────────────────────────────┐
│  ‹  WEDDING THEME              [ preview ]  [ SAVE ]     │
├─────────────────────────────┬────────────────────────────┤
│  ▸ Colours                  │   ┌──────────────────┐     │
│    primary   [■ #1a1a1a]    │   │                  │     │
│    accent    [■ #c9a227]    │   │   LIVE PREVIEW   │     │
│    paper     [■ #fffdf8]    │   │   rendered with  │     │
│  ▸ Fonts                    │   │   the real       │     │
│    heading  [ Playfair  ▾]  │   │   renderer       │     │
│    body     [ Inter     ▾]  │   │                  │     │
│  ▸ Background   [ ⤒ upload ]│   │                  │     │
│  ▸ Frames       3 files  ⤒  │   └──────────────────┘     │
│  ▸ Stickers     24 files ⤒  │                            │
│  ▸ Logo         [ ⤒ ]       │   [ 4-Grid ▾ ] preview as  │
│  ▸ Watermark    ☑ on        │                            │
│  ▸ Animation    [ fade   ▾] │                            │
└─────────────────────────────┴────────────────────────────┘
```

Upload assets, pick colours and fonts, see it render live. **A new theme ships without a build** —
the Phase 2 §13 promise, made operable.

---

## A7 · Printers

```
┌────────┬─────────────────────────────────────────────────┐
│        │  PRINTERS                       [ + ADD ]       │
│        ├─────────────────────────────────────────────────┤
│        │ ● DNP RX1                    dye-sub  DEFAULT   │
│        │   4×6 · 2×6 strip (2-cut) · 300 dpi             │
│        │   ribbon ▓▓▓▓▓▓▓▓▓▓▓▓░░░░  612/700   ✎          │
│        │                                                 │
│        │ ● Virtual Printer            testing            │
│        │   writes to ./virtual-printer/       ✎          │
│        │                                                 │
│        │ ○ EPSON L3210                inkjet  offline    │
│        │   A4 · 4×6 · 300 dpi · no cut        ✎          │
│        ├─────────────────────────────────────────────────┤
│        │  QUEUE                                          │
│        │  #1284  MS-7K4Q-92  4×6 ×2  ▓▓▓░ printing       │
│        │  #1285  MS-3B8X-11  4×6 ×1  ⋯ queued   [ ✕ ]    │
│        │  #1283  MS-9QP2-40  4×6 ×1  ⚠ failed   [ ↻ ]    │
│        ├─────────────────────────────────────────────────┤
│        │  [ test print ]  [ reset ribbon count ]         │
└────────┴─────────────────────────────────────────────────┘
```

Printer profiles are records (Phase 2 §9). `reset ribbon count` is what staff press when they load a
new roll. The `Virtual Printer` sitting alongside real hardware is the laptop-testing path from
[Testing Without Hardware](./testing-without-hardware.md).

---

## A8 · Events

The wedding/corporate mode — highest-margin work.

```
┌────────┬─────────────────────────────────────────────────┐
│        │  EVENTS                          [ + NEW ]      │
│        ├─────────────────────────────────────────────────┤
│        │ ● Reyes–Cruz Wedding    22 Jul   ACTIVE NOW     │
│        │   Wedding theme · Premium forced · 300 print cap │
│        │   used 41/300 · 27 sessions          ✎  ■ end   │
│        │                                                 │
│        │ ○ Acme Corp Year-End    15 Aug   scheduled  ✎   │
│        │ ○ Santos 18th Birthday  02 Jul   ended      ⤓   │
└────────┴─────────────────────────────────────────────────┘
```

### A8b · Event editor

```
┌──────────────────────────────────────────────────────────┐
│  ‹  EVENT SETUP                            [ SAVE ]      │
├──────────────────────────────────────────────────────────┤
│  Name      [ Reyes–Cruz Wedding        ]                 │
│  Date      [ 22 Jul 2026 ]  Venue [ Manila Hotel     ]   │
│  Hashtag   [ #ReyesCruz2026            ]                 │
│  Logo      [ ⤒ upload ]   Overlay [ ⤒ upload ]           │
├──────────────────────────────────────────────────────────┤
│  Force theme    [ Wedding    ▾ ]  ☑ lock for guests      │
│  Force package  [ Wedding    ▾ ]  ☑ skip payment         │
│  Print cap      [ 300 ]  ☑ warn at 90%                   │
│  Storage folder [ events/reyes-cruz-2026 ]               │
├──────────────────────────────────────────────────────────┤
│  ☑ imprint event name and date on every print            │
│  ☑ guests may not delete the event text                  │
└──────────────────────────────────────────────────────────┘
```

Set once, brands every print for the day — the missing feature identified in the Phase 1 audit.

---

## A9 · Settings

```
┌────────┬─────────────────────────────────────────────────┐
│        │  SETTINGS                                       │
│        │  ┌────────────────────────────────────────────┐ │
│        │  │ Business │ Camera │ Print │ Kiosk │ Cloud  │ │
│        │  └────────────────────────────────────────────┘ │
│        │  CAMERA                                         │
│        │  Device      [ Logitech Brio        ▾ ]  [test] │
│        │  Resolution  [ 1920×1080            ▾ ]         │
│        │    ⚠ 1920×1080 is below 300 dpi for 4×6.        │
│        │      Prints may look soft. Use 2560×1440+.      │
│        │  Countdown   [ 3s ▾ ]   Between shots [ 2s ▾ ]  │
│        │  ☑ mirror live preview   ☐ mirror saved photo   │
│        │  ☑ show slot guides on grid layouts             │
│        └─────────────────────────────────────────────────┘
└────────┴─────────────────────────────────────────────────┘
```

**That inline warning is the fix for the Phase 1 §2.1 defect**, surfaced at configuration time to the
operator rather than at print time to a customer. The two mirror checkboxes are separate on purpose,
defaulting to preview-on / saved-off (audit §2.7).

Other tabs: **Business** (name, logo, socials, currency, receipt numbering), **Print** (default
printer, copies, paper, watermark, auto-print), **Kiosk** (idle timeout, attract loop, PIN, admin
password, language, dark mode, orientation lock), **Cloud** (sync on/off, target, retention days,
storage root, backup schedule).

---

## A10 · Storage & A11 · Logs

```
┌────────┬─────────────────────────────────────────────────┐
│        │  STORAGE                                        │
│        │  Root  D:\MadShotz\storage        [ change ]    │
│        │  ▓▓▓▓▓▓▓▓░░░░░░░░░░░░  198 GB free of 476 GB    │
│        │  photos 241GB · db 84MB · backups 12GB          │
│        │  [ run backup now ]  [ purge expired ]          │
│        │  Retention 30 days · next purge 23 Jul 03:00    │
│        ├─────────────────────────────────────────────────┤
│        │  LOGS          [ all ▾ ][ 🔍 ][ export ]        │
│        │  19:46:02 INFO  print #1284 completed           │
│        │  19:45:58 WARN  ribbon low: 612 remaining       │
│        │  19:44:11 ERROR print #1283 failed · paper jam  │
│        │                 corr: a3f9-22e1  [ details ]    │
└────────┴─────────────────────────────────────────────────┘
```

`corr:` is the Phase 2 §5 correlation id — it links the message a customer saw to the exact log line.

---

**Next:** [System & error states](./phase-3-wireframes-system-states.md)
