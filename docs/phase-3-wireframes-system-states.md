# Phase 3c — Wireframes: System, Error & Recovery States

**The prototype had none of these.** It had one `alert("Camera connection missing.")` — a modal, on
an unattended kiosk, that nobody could dismiss (audit §2.9).

Three rules govern every screen here:

1. **Never a modal a customer cannot resolve.** Errors render in-flow, with a next action.
2. **Never lose the customer's photos.** A printing failure must not cost them their digital copies.
3. **Always tell staff what to physically do.** "Print failed" is useless. "Open the front cover and
   clear the jam" is an instruction.

---

## E1 · Camera unavailable — blocks at the door

Detected on the attract screen, **before** a session starts. The booth refuses to begin rather than
failing mid-capture with a paid customer standing there.

```
┌────────────────────────────────────────────────┐
│ ⟨staff⟩                                        │
│                                                │
│           M A D   S H O T ' Z                  │
│                                                │
│              ┌──────────┐                      │
│              │    ⚠     │                      │
│              └──────────┘                      │
│                                                │
│           BOOTH UNAVAILABLE                    │
│                                                │
│        We're fixing a small problem.           │
│         Please ask our staff for help.         │
│                                                │
│   ┌──────────────────────────────────────┐     │
│   │ ░░░░░  T A P   T O   S T A R T  ░░░░ │     │  ← disabled
│   └──────────────────────────────────────┘     │
│                                                │
│   ─────────────────────────────────────────    │
│   STAFF: camera not detected.                  │
│   1. check USB cable                           │
│   2. Settings → Camera → re-select device      │
│   3. retry                     [ RETRY NOW ]   │
└────────────────────────────────────────────────┘
```

Customer-facing copy is calm and blames nobody. The staff block below is plain, technical and
actionable. Auto-retries every 10 s and clears itself the moment the device returns.

---

## E2 · Camera lost mid-session — the expensive case

The customer has paid. Photos already taken must survive.

```
┌────────────────────────────────────────────────┐
│         ▓ POSE FOR FRAME  3 / 4 ▓              │
├────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────┐  │
│  │              ⚠                           │  │
│  │      CAMERA DISCONNECTED                 │  │
│  │                                          │  │
│  │  Your first 2 photos are safe.           │  │
│  │  Reconnecting…  ⟳                        │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│   ┌──────────────────┐ ┌───────────────────┐   │
│   │  ↻ TRY AGAIN     │ │  CONTINUE WITH 2  │   │
│   └──────────────────┘ └───────────────────┘   │
│                                                │
│   Staff can also finish this session from      │
│   the attendant drawer.                        │
└────────────────────────────────────────────────┘
```

`CONTINUE WITH 2` is the important affordance: a 4-grid layout can still print with two frames and a
theme fill, and **a partial print beats a refund**. The session persists throughout (Phase 2 §11), so
even a hard crash here resumes at frame 3.

---

## E3 · Printer offline — sell anyway

```
┌────────────────────────────────────────────────┐
│  ‹                 PRINT READY                 │
├────────────────────────────────────────────────┤
│         [ composition preview ]                │
├────────────────────────────────────────────────┤
│   ┌──────────────────────────────────────────┐ │
│   │ ⚠  Printer is offline                    │ │
│   │                                          │ │
│   │ Your print is saved and will come out    │ │
│   │ as soon as it's back. You can still      │ │
│   │ download your photos now.                │ │
│   └──────────────────────────────────────────┘ │
│                                                │
│   ┌───────────────┐  ┌───────────────────┐     │
│   │ ↻ retry print │  │ ▓ GET MY PHOTOS ▓ │     │
│   └───────────────┘  └───────────────────┘     │
│                                                │
│   STAFF: DNP RX1 not responding · power/USB    │
└────────────────────────────────────────────────┘
```

The job is **already queued in the database** (Phase 2 §9) before anything is sent, so it survives
and prints later. The customer proceeds to delivery. **Rule 2 in action.**

---

## E4 · Out of ribbon / paper

The one failure that is *guaranteed* to happen at an event. Warned early, three times.

```
   ── at 100 remaining, staff-only strip on the attract screen ──
   ┌──────────────────────────────────────────────┐
   │ ◐ ribbon low · 100 prints left               │
   └──────────────────────────────────────────────┘

   ── at 10 remaining, attendant drawer badge + dashboard alert ──

   ── at 0, mid-session ──
┌────────────────────────────────────────────────┐
│                  PRINTING                      │
├────────────────────────────────────────────────┤
│              ┌──────────┐                      │
│              │    ⚠     │                      │
│              └──────────┘                      │
│           OUT OF PAPER                         │
│                                                │
│   Your print is saved in the queue. Staff are  │
│   loading more paper — it'll print shortly.    │
│                                                │
│   Meanwhile, grab your digital copies:         │
│   ┌──────────────────────────────────────┐     │
│   │ ▓▓▓▓▓  G E T   M Y   P H O T O S  ▓▓ │     │
│   └──────────────────────────────────────┘     │
├────────────────────────────────────────────────┤
│  STAFF: load ribbon + paper, then                │
│  Printers → reset ribbon count → resume queue  │
└────────────────────────────────────────────────┘
```

Queued jobs resume automatically once the count is reset. Nobody has to remember who was owed a
print — the queue does.

---

## E5 · Print failed (jam)

```
              ┌────────────────────────────────────┐
              │  ⚠  PRINT FAILED                   │
              │  Job #1283 · MS-9QP2-40            │
              │                                    │
              │  Paper jam reported by DNP RX1     │
              │  Attempt 3 of 3                    │
              ├────────────────────────────────────┤
              │  1. open the front cover           │
              │  2. remove any jammed paper        │
              │  3. close and press RETRY          │
              ├────────────────────────────────────┤
              │  [ RETRY ]  [ SKIP ]  [ REASSIGN ▾]│
              └────────────────────────────────────┘
```

Staff-facing, appears in the attendant drawer — never over a customer's screen. `REASSIGN` sends the
job to another printer profile, which is why multi-printer support earns its keep.

---

## E6 · Storage low / full

```
   ── below 10 GB: dashboard + attract strip warn ──
   ── below 2 GB: sessions refuse to start ──

┌────────────────────────────────────────────────┐
│           BOOTH UNAVAILABLE                    │
│                                                │
│      We're freeing up space. One moment.       │
│                                                │
│   ┌──────────────────────────────────────┐     │
│   │ ░░░░  T A P   T O   S T A R T  ░░░░░ │     │
│   └──────────────────────────────────────┘     │
│   ─────────────────────────────────────────    │
│   STAFF: 1.2 GB free — below the 2 GB floor.   │
│   Storage → purge expired, or change root      │
│   to an external drive.        [ OPEN ]        │
└────────────────────────────────────────────────┘
```

Refusing at a **hard floor** is deliberate: a session that dies at the write step after payment is
far worse than a session that never starts.

---

## E7 · Payment failed / unverifiable offline

```
┌────────────────────────────────────────────────┐
│  ‹                  PAYMENT               2/5  │
├────────────────────────────────────────────────┤
│                 ₱  3 4 9                       │
│   ┌──────────────────────────────────────────┐ │
│   │ ⚠  We couldn't confirm that payment.     │ │
│   │    Nothing has been charged.             │ │
│   └──────────────────────────────────────────┘ │
│                                                │
│   ┌──────────────┐  ┌──────────────┐           │
│   │ ░░ GCash ░░  │  │ ░░  Maya ░░  │           │
│   │ offline      │  │ offline      │           │
│   └──────────────┘  └──────────────┘           │
│   ┌──────────────────────────────────────┐     │
│   │ ▓▓▓▓  PAY CASH TO ATTENDANT  ▓▓▓▓▓▓▓ │     │
│   └──────────────────────────────────────┘     │
│                                                │
│           [ ↻ try again ]  [ cancel ]          │
└────────────────────────────────────────────────┘
```

*"Nothing has been charged"* is the single most important sentence on this screen. The Phase 1 risk
resolution holds: **the booth refuses a sale it cannot verify rather than taking money it may lose.**

---

## E8 · Idle warning → abandoned

```
              ┌────────────────────────────────────┐
              │                                    │
              │        STILL THERE?                │
              │                                    │
              │              ⏱ 20                  │
              │                                    │
              │   We'll restart for the next       │
              │   guest in 20 seconds.             │
              │                                    │
              │   ┌────────────────────────────┐   │
              │   │ ▓▓▓  I ' M   H E R E  ▓▓▓  │   │
              │   └────────────────────────────┘   │
              │                                    │
              │        [ finish and exit ]         │
              └────────────────────────────────────┘
```

Any touch dismisses it. On expiry the session transitions to `ABANDONED` (Phase 2 §11): camera
released, in-progress artwork purged, preview and QR cleared, back to attract. **This is the
structural fix for audit §2.10** — the next customer cannot see the previous customer's photos,
because reset is a state transition rather than a function someone remembered to call.

Timeout is per-screen: generous in the editor (3 min), short at capture (60 s). Paid sessions warn
staff in the drawer before discarding rather than silently binning a sale.

---

## E9 · Offline / sync queued

Not an error — a normal condition. Rendered as information, never alarm.

```
   ── attract strip ──
   ┌──────────────────────────────────────────────┐
   │ ◑ offline · 3 sessions will upload later     │
   └──────────────────────────────────────────────┘

   ── on the delivery screen ──
   ┌──────────────────────────────────────────────┐
   │ ◑ Photos upload when we're back online.      │
   │   Your code MS-7K4Q-92 works either way.     │
   └──────────────────────────────────────────────┘
```

Because the QR encodes a **session code, not a path** (Phase 2 §12), the printed code stays valid
through the transition from local to cloud. Nothing reprints, nothing breaks.

---

## E10 · Crash recovery on boot

```
┌────────────────────────────────────────────────┐
│                                                │
│            M A D   S H O T ' Z                 │
│                                                │
│         ┌──────────────────────────┐           │
│         │  SESSION RECOVERED       │           │
│         │                          │           │
│         │  MS-7K4Q-92 · Premium    │           │
│         │  paid ₱349 · 4 photos    │           │
│         │  stopped at: EDITING     │           │
│         └──────────────────────────┘           │
│                                                │
│   ┌──────────────────────────────────────┐     │
│   │ ▓▓▓▓  R E S U M E   S E S S I O N ▓▓ │     │
│   └──────────────────────────────────────┘     │
│   ┌──────────────────────────────────────┐     │
│   │        close and start fresh         │     │
│   └──────────────────────────────────────┘     │
│                                                │
│   Photos and edits were saved automatically.   │
└────────────────────────────────────────────────┘
```

Possible only because Phase 2 persists on **every** state transition and after every settled editor
command. A paid customer whose booth crashed mid-edit gets their session back with their artwork
intact. Unpaid, un-captured sessions close silently — no operator prompt for nothing.

Boot-time reconciliation also re-queues print jobs left `PRINTING` when the process died.

---

## E11 · Update available

```
   ── attendant drawer, never customer-facing ──
   ┌────────────────────────────────────┐
   │ ⬆ Update 1.1.0 ready               │
   │   Installs on next restart.        │
   │   [ restart now ]  [ tonight ]     │
   └────────────────────────────────────┘
```

Updates **never** install mid-event. Staff choose the moment.

---

## Summary — state coverage

| State | Blocks session? | Customer keeps photos? | Staff instruction? |
|-------|-----------------|------------------------|--------------------|
| E1 camera missing | ✅ at the door | n/a | ✅ |
| E2 camera lost mid-session | ❌ continues degraded | ✅ | ✅ |
| E3 printer offline | ❌ queues | ✅ | ✅ |
| E4 out of ribbon | ❌ queues | ✅ | ✅ |
| E5 print jam | ❌ staff-only | ✅ | ✅ |
| E6 storage full | ✅ hard floor | n/a | ✅ |
| E7 payment unverifiable | ✅ until resolved | n/a | ✅ |
| E8 idle | purges cleanly | n/a | drawer warns if paid |
| E9 offline | ❌ normal | ✅ | informational |
| E10 crash | resumes | ✅ | ✅ |

**No state in this table loses a paying customer's photos.** That was the design target.
