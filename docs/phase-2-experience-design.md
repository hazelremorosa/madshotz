# MAD SHOT'Z — Phase 2: Experience Design

> Digital-only, frontend-only, React PWA. Portrait-primary, touch-first.
> This document designs **every screen**: layout, components, interaction, animation, transitions, and the UX reasoning behind each.

---

## 0. Design North Star

**Feeling:** walking up to an Apple Store product. Confident, calm, alive. Playful but never noisy.

**Three promises the UI must keep on every screen:**
1. **Nothing pops.** Everything enters, settles, and leaves with motion. No instant show/hide.
2. **One clear thing to do.** Each screen has a single primary action, oversized and obvious. Everything else is quiet.
3. **The booth is always breathing.** Ambient gradient drift + particles persist behind every screen so it never feels like static software.

**Signature MAD SHOT'Z motifs (the recognizable DNA):**
- **The Receipt** — a torn-edge paper card is our hero object. It appears as the layout-strip preview, the final composite, and the "print." It ties the brand together.
- **The Ticket Stamp** — perforated dashed dividers, mono-spaced micro-labels (`* MAD SHOT'Z *`, timestamps, session codes) used as decorative chrome.
- **Soft neon bloom** — a single accent glow (brand gradient) that follows the primary action and the current step in the progress rail.
- **Physicality** — cards have weight: they tilt slightly toward touch, cast layered shadows, and snap with spring physics.

---

## 1. Spatial & Navigation Model

**Metaphor:** a horizontal filmstrip of steps. Forward = slide/scale in from the right with a slight blur-out of the previous screen. Back = reverse. This gives an implicit sense of place ("I'm moving through a process").

**Persistent chrome (over every step except Welcome, Printing, and Done):**
- **Top:** a slim **Progress Rail** — dot/segment per step (Theme · Layout · Capture · Review · Filter · Decorate · Print), current step blooms with the accent glow, completed steps fill in. Doubles as a back affordance (tap a completed step to jump back).
- **Bottom:** a floating **Action Bar** (glass) holding Back (ghost) + Primary (filled, glowing). Large hit targets. It morphs its label per screen; it never disappears abruptly, it slides.

**Global systems running underneath:**
- **Ambient layer** (z-0): moving gradient mesh + 20–30 slow floating particles, GPU-friendly (`transform`/`opacity` only).
- **Idle/attract:** any screen with no touch for 45s gently pulses a "Still there?" toast; at 90s it runs the **Session Reset** animation back to Welcome (protects privacy — clears photos).
- **Ripple:** every touch anywhere spawns a soft radial ripple at the contact point.

---

## 2. Screen-by-Screen

Each screen: **Purpose · Layout · Components · Interaction · Motion · UX decisions.**

### 2.0 Boot / Splash (≈1.6s, first load only)
- **Purpose:** hide asset/camera warmup; first "wow."
- **Layout:** centered logo mark on near-black with the ambient mesh already alive behind.
- **Motion:** logo mark draws in (SVG stroke reveal) → fills → a single light-sweep passes across the wordmark → the whole mark scales down and docks into the Welcome layout (shared-element transition, no cut).
- **UX:** if camera permission is needed, we pre-warm it here silently so Capture is instant later.

### 2.1 Welcome / Attract Loop
- **Purpose:** invite the first touch; look expensive from across the room.
- **Layout:** full-bleed animated gradient; centered **MAD SHOT'Z** logo lockup; a breathing **"Touch anywhere to begin"** hint; small `STUDIO CREATIVE` kicker; subtle corner ticket-stamp chrome (date, "OPEN").
- **Components:** `AmbientBackground`, `LogoReveal`, `PulseHint`, `ParticleField`.
- **Interaction:** the **entire screen** is the button (no hunting for a small target). Touch → ripple blooms from contact point → logo lifts → gradient accelerates → transition to Theme.
- **Motion:** logo does a slow parallax float; particles drift; gradient hue slowly rotates over ~20s. Hint text fades in/out on a gentle 2.5s loop.
- **UX:** no menus, no text to read. Lowest-friction possible entry. Because this is where curious people gather, it's the most cinematic screen.

### 2.2 Theme Selection
- **Purpose:** set the vibe (drives sticker packs, frame art, default filter, receipt header copy).
- **Layout:** heading "Pick your vibe"; a **horizontally swipeable carousel of theme cards** (Birthday, Wedding, Kawaii, Vintage, Minimal, Christmas, Corporate, Film, Retro), center card enlarged (peek of neighbors on both sides). Below: pager dots.
- **Components:** `ThemeCard` (preview art, name, tiny descriptor), `SnapCarousel`, `SelectionGlow`.
- **Interaction:** swipe to browse (snap physics); tap a card to select. Selected card lifts, gains the accent glow ring, and its background art briefly bleeds into the ambient layer (the whole booth adopts the theme's palette — a magic moment). Primary action becomes enabled.
- **Motion:** cards scale/opacity by distance from center; on select, a spring "pop" + a soft confetti-free sparkle. Non-selected cards dim.
- **UX decisions:** carousel over grid because 9 themes in a grid feels like a spreadsheet; a swipeable deck feels like flipping through Polaroids. Selecting a theme *changes the room's color* — that reactivity is what makes it feel alive and premium. Theme is optional-skippable (defaults to Minimal) so we never block a shy user.

### 2.3 Layout Selection
- **Purpose:** choose composition; this **sets the capture count** (core business rule).
- **Layout:** heading "Choose your layout"; a **2-column card grid** of layouts, each rendered as a **live receipt-paper mockup** (torn edges) showing the frame arrangement: Single (1), 2-Strip (2), 3-Strip (3), 4-Grid (4), Landscape (3 row), Magazine (hero + caption), Receipt (tall strip). Each card shows a `×N shots` badge.
- **Components:** `LayoutCard` (miniature receipt), `ShotCountBadge`, `SelectionGlow`.
- **Interaction:** tap → card flips/tilts and the mini-receipt "prints" a hair to preview; shot count animates up (`×1 → ×4`). Selecting updates the Progress Rail's Capture step to show `n` sub-dots (so the user knows how many poses are coming).
- **Motion:** cards enter staggered (60ms) from below with spring; hover/press tilt toward finger (3D). Selected card's receipt does a tiny slide-out teaser.
- **UX decisions:** rendering layouts *as receipts* previews the final artifact and reinforces the brand. Showing shot count up front sets expectations so Capture never surprises anyone.

### 2.4 Camera / Capture
- **Purpose:** take `N` photos with delight and zero confusion.
- **Layout:** near-full-bleed **live preview** in a rounded receipt-framed viewport (mirrored, selfie convention). Top: capture progress `Frame 2 of 4` + a row of `N` slots that fill with thumbnails as you shoot. Composition guide overlay matched to the chosen layout (grid lines for 4-Grid, etc.). Bottom: big circular **shutter** with a live ring.
- **Components:** `CameraView`, `FrameGuideOverlay`, `ShotTray`, `ShutterButton`, `CountdownRing`, `FlashLayer`, `ShakeController`.
- **Interaction:**
  - Tap shutter (or auto-advance option) → shutter ring fills → **3·2·1 countdown** as big numbers that scale-bounce and blur-swap.
  - On 0: **flash** (white overlay bloom), **screen shake** (subtle 2–3px spring), **shutter sound**, and a **sparkle** burst at frame center.
  - Captured thumbnail **flies** into its slot in the shot tray (shared-element).
  - Auto re-arm for the next frame with a friendly "Nice! Next pose…" micro-toast.
  - When the last frame lands, the tray briefly assembles into the receipt shape → auto-advance to Review.
- **Motion:** countdown numbers use scale + blur transitions; flash is opacity bloom (100ms in, 700ms out); shake is a decaying spring on the viewport only; thumbnail fly uses layout animation.
- **UX decisions:** countdown gives people time to pose (kills blurry candids). The **fly-to-tray** makes progress tangible and joyful. Sound + flash + shake fired together = the "camera capture" signature moment. A `Restart shots` ghost button exists but is de-emphasized.

### 2.5 Review / Retake
- **Purpose:** let users approve or reshoot before investing in decoration.
- **Layout:** heading "Love them?"; a **swipeable photo carousel** of the N captures; under each, a small `Retake this` control; primary "Looks great →".
- **Components:** `PhotoCarousel`, `RetakeChip`, per-photo `ApproveTick`.
- **Interaction:** swipe through shots; tap `Retake this` on any single frame → returns to Capture for **just that frame** (surgical retake, not full restart), then back to Review with the new shot flown in. Approve → continue.
- **Motion:** carousel parallax + snap; retake sends the rejected photo shattering/fading out and the camera slides up under it.
- **UX decisions:** single-frame retake is a big upgrade over the prototype's all-or-nothing. Reviewing *before* filters/stickers respects the user's effort — no one wants to redecorate after a reshoot.

### 2.6 Filter Selection
- **Purpose:** set the color grade across all frames at once.
- **Layout:** large **live-preview** of the composite (all frames, current filter applied); below, a **horizontal filter reel** of thumbnails (Natural, Warm, Vintage, Film, B&W, Soft, Korean, Cold), each showing the actual photo pre-graded. Selected chip glows.
- **Components:** `FilterReel`, `FilterThumb`, `LivePreviewStage`, CSS/canvas filter engine.
- **Interaction:** swipe the reel or tap a thumb → the big preview **cross-fades/blur-morphs** to the new grade in ~250ms. Optional intensity slider appears on long-press (advanced, hidden by default).
- **Motion:** filter change = blur-out → swap → blur-in cross-dissolve so it feels like glass sliding, not a hard cut. Selected thumb lifts with spring.
- **UX decisions:** thumbnails graded with the *user's own photo* (not stock) so choice is honest and instant. One global filter (not per-frame) keeps it simple and cohesive; theme pre-selects a flattering default so even a no-touch user looks good.

### 2.7 Editor — Stickers · Frames · Text
- **Purpose:** personalize. The most interactive screen; must feel like a toy, not a form.
- **Layout:** the **receipt canvas** centered (the composite from filter step). A bottom **glass tool dock** with 3 tabs: **Stickers** (theme-aware pack, scrollable tray), **Frames** (border styles, tap to apply), **Text** (add editable text; presets: Event Name, Date, custom). A floating contextual toolbar appears above a selected element (delete, duplicate, rotate handle, resize handle, layer).
- **Components:** `EditorCanvas`, `DraggableItem` (sticker/text), `TransformHandles`, `ToolDock`, `StickerTray`, `FramePicker`, `TextEditorSheet`, `ContextToolbar`.
- **Interaction:**
  - Drag a sticker from the tray → it **lifts and grows** under the finger, drops onto the canvas.
  - One-finger **drag** to move; two-finger **pinch to resize / twist to rotate**; tap to select (shows handles); drag handle for resize/rotate on single touch too.
  - **Snap:** elements gently snap to canvas center lines and to each other (haptic + subtle guide line flash).
  - **Delete:** drag to a trash zone that appears at bottom, or tap ✕ on the context toolbar → element scales-to-zero and puffs.
  - **Text:** tap Text → a **bottom sheet** keyboard entry with font/case options; committing flies the text onto the canvas.
  - **Frames:** tapping a frame morphs the canvas border with a spring.
- **Motion:** items follow the finger with a tiny lag (spring) for "weight"; snap = quick spring + guide-line flash; delete = scale/blur puff; tray items float idle. Everything obeys "nothing instant."
- **UX decisions:** direct manipulation only — no numeric inputs, no modes to learn. Pinch/twist is the natural gesture people expect from photos. Theme-aware sticker packs mean the content is always relevant. A "Reset decorations" ghost + "Skip" keep it non-blocking.

### 2.8 Receipt Preview
- **Purpose:** the reveal — show the finished artifact as a beautiful receipt.
- **Layout:** dim the room; a **receipt** (torn top+bottom edges, subtle paper texture, faint thermal-print vignette as *style*) **slides down into view** from the top like it's emerging from a slot, carrying the composite + theme header (`* MAD SHOT'Z *`, event name, date, session code, a decorative barcode). Actions: **Back**, **Print**, **Get QR**.
- **Components:** `ReceiptCard`, `PaperTexture`, `PerforatedEdge`, `Barcode`, `ActionBar`.
- **Interaction:** receipt is draggable a little (springs back) so it feels physical. Back returns to editor with state intact. Print → Printing screen. Get QR → QR screen.
- **Motion:** the **receipt slide-out** is the signature moment — eased with a slight overshoot + a paper "settle" wobble; a soft shadow grows under it as it lands; ambient particles part around it.
- **UX decisions:** this is the "worth paying for" beat. Treating the composite as a *received object* (not a preview pane) makes people want to photograph the screen — that's the Instagram moment.

### 2.9 Printing
- **Purpose:** even though digital-only, sell the ritual of "printing your memories."
- **Layout:** a stylized **printer slot**; the receipt feeds *out* progressively (mask reveal top→bottom) with a moving print-head glow line; a progress bar + rotating friendly copy ("Warming up the paper…", "Adding the magic…", "Almost yours…").
- **Components:** `PrinterAnimation`, `PrintHeadGlow`, `ProgressBar`, `RotatingCaption`.
- **Interaction:** none required (it's a moment); a tiny `skip` after 1s for repeat users.
- **Motion:** ~2.5–3.5s reveal with mechanical easing; faint paper-feed texture scroll; head-glow sweeps in sync. Ends by handing the finished receipt into the QR screen (shared element).
- **UX decisions:** because there's no real printer yet, this animation *is* the product's tactility. It's tuned to be satisfying but not slow. Fully swappable for a real thermal/color job later (same interface).

### 2.10 QR / Share / Done
- **Purpose:** deliver the digital copy + celebrate + reset.
- **Layout:** the receipt now docked small at top; center stage a **large QR code** on a glass card; buttons **Download**, **Share**, and helper text "Scan to save your photos." A **countdown ring** ("New session in 20…") sits quietly; a `Start over` button lets users end early.
- **Components:** `QRCard`, `AnimatedQR`, `ShareSheet`, `Confetti`, `CountdownReset`, `SuccessGlow`.
- **Interaction:** QR **draws itself** module-by-module (or scan-line reveal) before becoming "live/scannable" (a subtle shimmer signals ready). Download saves the composite; Share opens the native share sheet (Web Share API where available). Countdown auto-returns to Welcome; any touch pauses it briefly.
- **Motion:** on entry, a **confetti burst** + success glow + "Your memories are ready!" headline. The QR draw-in is the signature moment here. Countdown ring depletes smoothly.
- **UX decisions:** QR encodes a **session code** (not a file path) per the delivery model — real hosting is stubbed behind `DeliveryService.publish(session)`. Auto-reset guarantees the booth is ready for the next guest and protects the previous guest's photos (privacy).

### 2.11 Session Reset (transition, not a screen)
- **Purpose:** wipe state and return to Welcome, gracefully.
- **Motion:** current screen exhales (scale down + blur + fade), particles converge to center, logo re-forms → Welcome attract loop resumes. All photos/stickers cleared from memory.
- **UX decisions:** triggered by countdown end, idle timeout, or `Start over`. A single, reused, satisfying "curtain" so the loop feels intentional.

---

## 3. Cross-Cutting UX Systems

- **Progress & orientation:** the top rail is the user's map; morphing Action Bar is their control. Together they mean nobody is ever lost, even mid-carousel.
- **Non-blocking optionality:** Theme, Filter, and Decorate are all skippable with smart defaults so a shy or rushed guest still gets a gorgeous result in ~20s.
- **Error/edge states (designed, not afterthoughts):**
  - *No camera / permission denied:* a friendly illustrated card ("We can't see you 👀") with a retry + attendant hint — never a raw `alert()`.
  - *Slow device:* animations degrade gracefully (fewer particles, simpler filters) via a perf tier check.
- **Sound (optional, muteable):** shutter, soft UI ticks, filter whoosh, print feed, success chime. Ships off by default for silent-venue safety; attendant toggle in admin.
- **Hidden admin:** long-press logo on Welcome (3s) → PIN → settings (camera pick, sound, theme/layout limits, idle timings, branding). Out of the customer flow entirely.
- **Accessibility & comfort:** large hit targets (≥64px), high-contrast text over glass (scrim behind text), reduced-motion respects `prefers-reduced-motion` (swaps big motion for gentle fades), one-hand reachability (primary actions bottom-anchored).

---

## 4. Motion Language (principles, formalized in Phase 3)

- **Enter:** slide+scale+blur-in, spring (stiffness ~260, damping ~26). **Exit:** faster, ease-out, slight blur.
- **Selection:** spring "pop" (overshoot ~1.05) + accent glow.
- **Object physics:** draggables lag the finger slightly; snaps overshoot then settle.
- **Signature bursts:** flash (opacity bloom), confetti (physics), QR draw (staggered reveal), receipt slide (overshoot + wobble).
- **Rule:** target 60fps → animate only `transform`/`opacity`/`filter`; no layout-thrash animations.

---

## 5. Full Screen Inventory (for build tracking)

Boot · Welcome · Theme · Layout · Capture · Review/Retake · Filter · Editor · Receipt Preview · Printing · QR/Done · Reset transition · (Error states, Admin — out of main flow).

---

*Next: Phase 3 turns the motifs, palette hints, and motion principles above into a concrete, reusable Design System (color, type, spacing, radius, elevation, motion tokens, components, icon/illustration/sound direction).*
