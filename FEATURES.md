# Mad Shots — Feature Roadmap & Ideas

A menu of features you can add to make the app better, tailored to what's already
built. Pick from the **Quick Wins** first — they're the best effort-to-impact ratio.

**Legend** — Impact: ⭐ nice · ⭐⭐ strong · ⭐⭐⭐ game-changer ·
Effort: **S** (hours) · **M** (a day or two) · **L** (bigger project) ·
🔌 needs a backend/hardware/paid service.

---

## ✅ Already built (so you know the baseline)

Welcome → Layout (Single / 2·3·4 Strip / 4 Grid / Magazine) → **auto-capture** with
countdown → Review & single-frame retake → **Frames** (6 colors + 5 patterns, 5 photo
shapes) → Filters (8) → **Sticker/Text editor** (drag/resize/rotate) → Receipt preview
→ Printing animation → **QR + Download + Share** → auto-reset. Plus: PWA/offline shell,
idle reset, sound toggle, **Cloudflare delivery with 24h-expiry links**, JPEG compression.

---

## 🚀 Quick Wins (do these first)

| Feature | What it does | Impact | Effort |
|---|---|---|---|
| **Email the photo** | Guest types their email → gets the photo in their inbox (great for capturing leads at events). | ⭐⭐⭐ | M 🔌 |
| **Haptic feedback** | Small vibration on capture/selection (Vibration API) — feels premium on tablets. | ⭐ | S |
| **Countdown length setting** | Let the host pick 3 / 5 / 10s before each shot. | ⭐⭐ | S |
| **Screen "flash" fill light** | Flash the whole screen white just before capture to light faces in dark venues. | ⭐⭐ | S |
| **Retake-all button on Review** | One tap to redo the whole set, not just one frame. | ⭐ | S |
| **"Saving… / Saved ✓" status** | Confirm the cloud upload actually succeeded on the final screen. | ⭐⭐ | S |
| **Filter intensity slider** | Dial a filter up/down instead of on/off. | ⭐⭐ | S |
| **More stickers + seasonal packs** | Bigger emoji/graphic library, holiday sets. | ⭐⭐ | S |
| **Camera picker** | Choose which camera (front/back/external webcam) — important for kiosks. | ⭐⭐ | S |
| **Boomerang / GIF mode** | Capture a short looping GIF instead of stills — very shareable. | ⭐⭐⭐ | M |

---

## 📸 Capture & Camera

| Feature | What it does | Impact | Effort |
|---|---|---|---|
| Boomerang / GIF / short video | Looping GIF or 3–5s clip; export as GIF/MP4. | ⭐⭐⭐ | M |
| Burst + best-shot pick | Take several, let the guest choose the best. | ⭐⭐ | M |
| Smile / face-detection auto-capture | Fires the shutter when it sees a smile (MediaPipe/face-api). | ⭐⭐ | M |
| Pose guides / silhouettes | Faint pose outlines to help guests frame up. | ⭐ | S |
| Beauty / skin-smoothing | Subtle smoothing filter (toggle). | ⭐⭐ | M |
| Background removal / virtual backgrounds | Green-screen effect with fun backdrops (MediaPipe Selfie Segmentation). | ⭐⭐⭐ | L |
| Grid / rule-of-thirds toggle | Composition helper. | ⭐ | S |
| Mirror toggle | Flip the selfie mirror on/off. | ⭐ | S |

## 🎨 Editing & Personalization

| Feature | What it does | Impact | Effort |
|---|---|---|---|
| Undo / redo in editor | Safety net while decorating. | ⭐⭐ | S |
| Doodle / freehand pen | Draw on the photo with color + brush size. | ⭐⭐ | M |
| Text upgrades | Font picker, colors, outline/shadow, curved text. | ⭐⭐ | M |
| Animated / GIF stickers | Moving stickers (needs GIF/video export). | ⭐ | M |
| Uploadable custom stickers | Host uploads their own PNG stickers/props. | ⭐⭐ | M 🔌 |
| PNG frame overlays | Transparent decorative frames layered on top. | ⭐⭐ | S |
| Layer ordering UI | Explicit bring-forward/back panel. | ⭐ | S |
| AI style filters | Cartoon / anime / oil-paint style transfer. | ⭐⭐⭐ | L 🔌 |

## 🏷️ Event Branding & Templates (sell this to clients)

| Feature | What it does | Impact | Effort |
|---|---|---|---|
| **Event mode** | Per-event name, date, hashtag, logo, and color theme baked into every receipt. | ⭐⭐⭐ | M |
| **Custom watermark / logo** | Client logo on every photo. | ⭐⭐⭐ | S |
| Saved event presets | Store a "Wedding of A&B" config and reuse it. | ⭐⭐ | M 🔌 |
| Booth modes | One-tap switch between Wedding / Birthday / Corporate looks. | ⭐⭐ | M |
| Custom QR landing branding | The scanned page shows the client's branding, not just Mad Shots. | ⭐⭐ | S |

## 📤 Delivery & Sharing

| Feature | What it does | Impact | Effort |
|---|---|---|---|
| **Email delivery** | Send the photo to a typed email (lead capture!). | ⭐⭐⭐ | M 🔌 |
| SMS delivery | Text the link to a phone number. | ⭐⭐ | M 🔌 |
| One-tap social share | Instagram Story / Facebook / TikTok with pre-filled caption + hashtag. | ⭐⭐⭐ | M |
| **Event gallery page** | A single link/QR showing ALL photos from the event (host & guests love this). | ⭐⭐⭐ | L 🔌 |
| Real printing | Thermal (ESC/POS) or dye-sub printer for physical receipts/strips. | ⭐⭐⭐ | L 🔌 |
| Zip / "download all" | Grab a whole session at once. | ⭐ | S |
| Thumbnail/resized variants | Faster QR pages via Cloudflare Images transforms. | ⭐ | M 🔌 |

## 💳 Payments & Monetization

| Feature | What it does | Impact | Effort |
|---|---|---|---|
| **GCash / Maya / card before session** | Paid unattended mode (Philippines-friendly). | ⭐⭐⭐ | L 🔌 |
| Coin / bill acceptor | For fully unattended coin-op booths. | ⭐⭐ | L 🔌 |
| Pricing tiers | Charge for extra prints / video / digital copy. | ⭐⭐ | M 🔌 |
| Voucher / coupon codes | Discounts and event freebies. | ⭐ | M 🔌 |
| Free / host-paid mode | Toggle payments off for sponsored events. | ⭐⭐ | S |

## 🛠️ Admin & Operations

| Feature | What it does | Impact | Effort |
|---|---|---|---|
| **Admin panel (PIN-locked)** | Camera pick, enabled layouts, branding, pricing, sound, idle timings — no code edits. | ⭐⭐⭐ | M |
| Kiosk lockdown | Fullscreen guard, block accidental exits/gestures. | ⭐⭐ | S |
| **Upload retry queue** | If wifi drops, queue photos and upload when it's back (don't lose any). | ⭐⭐⭐ | M |
| Offline mode | Full session offline, sync later. | ⭐⭐ | L |
| Session analytics | Count, popular layouts/filters, busy times. | ⭐⭐ | M 🔌 |
| Live slideshow screen | Second display looping the event's photos. | ⭐⭐ | M 🔌 |
| Multi-language | Tagalog / English toggle (or more). | ⭐⭐ | M |
| Low-supplies warnings | Paper/ink alerts (once printing exists). | ⭐ | S |

## ✨ Engagement & "Wow"

| Feature | What it does | Impact | Effort |
|---|---|---|---|
| **AR face filters / props** | Snapchat-style effects that track the face (MediaPipe/Deep AR). | ⭐⭐⭐ | L |
| Prompts / challenges | "Make a funny face!", themed dares. | ⭐ | S |
| Guest name + guestbook | Names on photos + a digital guestbook. | ⭐⭐ | M 🔌 |
| Soundtrack during session | Music/SFX while posing. | ⭐ | S |
| Celebration variety | Different confetti/effects per theme. | ⭐ | S |

## 🔒 Privacy, Reliability & Quality

| Feature | What it does | Impact | Effort |
|---|---|---|---|
| Consent + marketing opt-in | Privacy notice; opt-in checkbox for email marketing. | ⭐⭐ | S |
| Configurable retention | Let host set expiry (12h / 24h / 7d) per event. | ⭐⭐ | S |
| Worker abuse protection | Shared-secret header / Cloudflare Access on uploads. | ⭐⭐ | S |
| Error tracking | Sentry (or similar) to catch crashes in the field. | ⭐⭐ | S 🔌 |
| Automated tests + CI | Unit/e2e tests so changes don't break the booth. | ⭐⭐ | M |
| Resume-on-reload | Restore session state if the tab reloads mid-session. | ⭐ | M |

---

## 🗺️ Suggested order

1. **Make money & capture leads:** Event mode + watermark → Email delivery → Payments.
2. **Delight & go viral:** Boomerang/GIF → One-tap social share → AR face filters.
3. **Run it reliably:** Admin panel → Upload retry queue → Kiosk lockdown → Analytics.
4. **Physical product:** Real printer integration → Event gallery page.

> Tell me which line items you want and I'll build them in priority order. The
> ⭐⭐⭐ / low-effort ones (Event mode, Watermark, Email, GIF mode, Admin panel) are
> where I'd start.
