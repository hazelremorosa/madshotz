import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  BRAND_PRESETS,
  COUNTDOWN_OPTIONS,
  IDLE_OPTIONS,
  MAX_CUSTOM_FRAMES,
  MAX_CUSTOM_STICKERS,
  MAX_PRESETS,
  QR_RESET_OPTIONS,
  applyBrandVars,
  effectiveBrand,
  receiptFooter,
  receiptHeader,
  snapshotConfig,
  startingLayout,
  startingOverlay,
  useSettings,
  type EventPreset,
} from "@/store/settings";
import {
  FRAME_MAX_DIM,
  PHOTO_MAX_DIM,
  fileToJpegDataUrl,
  fileToPngDataUrl,
  fileToTemplate,
} from "@/lib/image";
import { MAX_TEMPLATES, useTemplates } from "@/store/templates";
import { composeTemplate } from "@/lib/composeTemplate";
import { TemplateSlotEditor } from "@/components/admin/TemplateSlotEditor";
import type { EventTemplate } from "@/types";
import {
  ACCENT_BY_CATEGORY,
  OVERLAY_CATEGORIES,
  PHOTO_TEMPLATES,
  overlaysInCategory,
  resolveOverlaySrc,
  type OverlayCategory,
} from "@/data/overlays";
import { loadPresets, persistPresets } from "@/lib/presets";
import { Receipt } from "@/components/Receipt";
import { DEFAULT_FRAME_STYLE } from "@/data/frames";
import { formatDate } from "@/lib/date";
import { useSession } from "@/store/session";
import { LAYOUTS } from "@/data/layouts";
import { FILTERS } from "@/data/filters";
import { listCameras, stopCameraStream, useCamera, type CameraOption } from "@/lib/camera";
import { enterFullscreen, isFullscreen, wakeLockSupported } from "@/lib/kiosk";
import { DeliveryService } from "@/lib/delivery";
import {
  Chip,
  Row,
  Section,
  Segmented,
  SmallButton,
  TextField,
  Toggle,
} from "@/components/admin/controls";
import { cn } from "@/lib/cn";

const APP_VERSION = "1.0.0";

/**
 * Admin panel — the host's control room. Everything here writes straight to
 * the persisted settings store, so changes survive reloads and take effect on
 * the next screen the guest sees (or immediately, for camera/brand/kiosk).
 */
export function AdminPanel({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  const set = useSettings((st) => st.set);
  const resetSession = useSession((st) => st.reset);
  const theme = useSession((st) => st.theme);
  const [note, setNote] = useState<string | null>(null);

  const toast = (msg: string) => {
    setNote(msg);
    window.setTimeout(() => setNote((n) => (n === msg ? null : n)), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      className="fixed inset-0 z-[100] flex justify-center bg-cream-deep/95 backdrop-blur-xl"
    >
      <div className="flex h-full w-full max-w-[540px] flex-col">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-cocoa">
              Booth <span className="brand-text">Admin</span>
            </h2>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-cocoa/40">
              Saved automatically
            </p>
          </div>
          <SmallButton tone="brand" onClick={onClose}>
            Done ✓
          </SmallButton>
        </header>

        {/* Body */}
        <div className="no-bar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-10">
          <CustomerPreviewSection />

          <CameraSection />

          <EventPresetsSection onToast={toast} />

          <Section
            emoji="⏱️"
            title="Capture"
            note="How each shot is taken. Countdown applies to every frame."
          >
            <Row label="Countdown" stacked>
              <Segmented
                value={s.countdownLength}
                onChange={(v) => set("countdownLength", v)}
                options={COUNTDOWN_OPTIONS.map((n) => ({ value: n, label: `${n}s` }))}
              />
            </Row>
            <Row
              label="Guests can change it"
              hint="Shows the 3/5/10s picker on the capture screen."
            >
              <Toggle
                label="Guests can change countdown"
                checked={s.guestCanSetCountdown}
                onChange={(v) => set("guestCanSetCountdown", v)}
              />
            </Row>
            <Row
              label="Screen flash fill light"
              hint="Flashes the screen white just before each shot — for dark venues."
            >
              <Toggle
                label="Screen flash fill light"
                checked={s.flashFill}
                onChange={(v) => set("flashFill", v)}
              />
            </Row>
          </Section>

          <Section
            emoji="🧩"
            title="Layouts"
            note="Untick what this event shouldn't offer. At least one stays on."
          >
            <div className="flex flex-wrap gap-2">
              {LAYOUTS.map((l) => (
                <Chip
                  key={l.id}
                  active={s.enabledLayoutIds.includes(l.id)}
                  onClick={() => useSettings.getState().toggleLayout(l.id)}
                >
                  {l.name} ×{l.shots}
                </Chip>
              ))}
            </div>
            <Row label="Starts on" hint="Pre-selected when a session begins." stacked>
              <div className="flex flex-wrap gap-2">
                {LAYOUTS.filter((l) => s.enabledLayoutIds.includes(l.id)).map((l) => (
                  <Chip
                    key={l.id}
                    active={s.defaultLayoutId === l.id}
                    onClick={() => set("defaultLayoutId", l.id)}
                  >
                    {l.name}
                  </Chip>
                ))}
              </div>
            </Row>
          </Section>

          <Section emoji="🎨" title="Filters" note="Which looks guests can choose from.">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <Chip
                  key={f.id}
                  active={s.enabledFilterIds.includes(f.id)}
                  onClick={() => useSettings.getState().toggleFilter(f.id)}
                >
                  {f.name}
                </Chip>
              ))}
            </div>
          </Section>

          <CustomStickersSection onToast={toast} />

          <BoothTypeSection onToast={toast} />

          <EventTemplateSection onToast={toast} />

          <FrameOverlaySection onToast={toast} />

          <Section
            emoji="🏷️"
            title="Event branding"
            note="Printed on every receipt — on screen and in the downloaded photo."
          >
            <Row
              label="Header"
              hint={
                s.boothType === "event"
                  ? "Hidden during events — the event frame is the masthead. Set the name under Booth type → Title."
                  : undefined
              }
              stacked
            >
              <TextField
                value={s.eventName}
                onChange={(v) => set("eventName", v)}
                placeholder="MAD SHOTS"
                maxLength={22}
                disabled={s.boothType === "event"}
              />
            </Row>
            <Row label="Footer line" stacked>
              <TextField
                value={s.footerNote}
                onChange={(v) => set("footerNote", v)}
                placeholder="SCAN FOR YOUR PHOTOS ♥"
                maxLength={30}
              />
            </Row>

            {/* Live receipt strip preview */}
            <div className="paper rounded-[6px] px-4 py-3 text-center shadow-paper">
              <div
                className={cn(
                  "font-mono text-[10px] font-semibold uppercase tracking-[0.4em] text-paper-ink/60",
                  s.boothType === "event" && "invisible",
                )}
              >
                {receiptHeader(s.eventName)}
              </div>
              <div className="my-2 border-t border-dashed border-paper-ink/30" />
              <div className="font-mono text-[9px] uppercase tracking-widest text-paper-ink/40">
                {receiptFooter(s.footerNote)}
              </div>
            </div>

            <Row label="Palette" stacked>
              <div className="flex flex-wrap gap-2">
                {BRAND_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={s.brandPresetId === p.id}
                    onClick={() => {
                      set("brandPresetId", p.id);
                      applyBrandVars(
                        p.id === "default" ? theme.brand : p.brand,
                      );
                    }}
                    className={cn(
                      "flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-semibold transition-colors",
                      s.brandPresetId === p.id
                        ? "border-[rgb(var(--brand-a))] bg-white text-cocoa shadow"
                        : "border-cocoa/15 bg-white/60 text-cocoa/50",
                    )}
                  >
                    <span className="flex">
                      {p.brand.map((c, i) => (
                        <span
                          key={i}
                          className={cn(
                            "h-5 w-5 rounded-full border-2 border-white",
                            i > 0 && "-ml-2",
                          )}
                          style={{ background: `rgb(${c})` }}
                        />
                      ))}
                    </span>
                    {p.name}
                  </button>
                ))}
              </div>
            </Row>
          </Section>

          <Section
            emoji="🔔"
            title="Sound & timing"
            note="Idle reset protects guest privacy between sessions."
          >
            <Row label="Sound on by default" hint="Guests can still mute it.">
              <Toggle
                label="Sound on by default"
                checked={s.soundOn}
                onChange={(v) => set("soundOn", v)}
              />
            </Row>
            <Row label="Idle reset" stacked>
              <Segmented
                value={s.idleTimeoutSec}
                onChange={(v) => set("idleTimeoutSec", v)}
                options={IDLE_OPTIONS.map((n) => ({
                  value: n,
                  label: n >= 60 ? `${n / 60}m` : `${n}s`,
                }))}
              />
            </Row>
            <Row label="QR screen auto-restart" stacked>
              <Segmented
                value={s.qrResetSec}
                onChange={(v) => set("qrResetSec", v)}
                options={QR_RESET_OPTIONS.map((n) => ({ value: n, label: `${n}s` }))}
              />
            </Row>
          </Section>

          <KioskSection onToast={toast} />

          <Section
            emoji="🔐"
            title="Security"
            note="The PIN guards this panel. Five wrong tries locks it for 30 seconds."
          >
            <PinChanger onSaved={() => toast("PIN updated")} />
          </Section>

          <Section emoji="🩺" title="Status">
            <StatusRow
              label="Cloud delivery"
              value={DeliveryService.isConfigured ? "Connected" : "Not configured"}
              ok={DeliveryService.isConfigured}
            />
            <StatusRow
              label="Keep-awake support"
              value={wakeLockSupported() ? "Available" : "Not on this browser"}
              ok={wakeLockSupported()}
            />
            <StatusRow label="Version" value={APP_VERSION} ok />
          </Section>

          <Section emoji="⚠️" title="Danger zone">
            <Row label="Restart the guest session" hint="Back to the welcome screen.">
              <SmallButton
                onClick={() => {
                  resetSession();
                  onClose();
                }}
              >
                Restart
              </SmallButton>
            </Row>
            <Row label="Reset all booth settings" hint="Back to factory defaults, PIN included.">
              <SmallButton
                tone="danger"
                onClick={() => {
                  if (!window.confirm("Reset every booth setting to defaults?")) return;
                  useSettings.getState().resetAll();
                  applyBrandVars(effectiveBrand(theme));
                  stopCameraStream();
                  toast("Settings reset");
                }}
              >
                Reset
              </SmallButton>
            </Row>
          </Section>

          <p className="pb-2 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-cocoa/30">
            Mad Shots · Booth Admin
          </p>
        </div>

        {/* Toast */}
        {note && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center"
          >
            <span className="glass-strong rounded-full px-5 py-2 text-sm font-semibold text-cocoa shadow-glass">
              {note}
            </span>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ── Camera ──────────────────────────────────────────────────────────────────

function CameraSection() {
  const cameraDeviceId = useSettings((st) => st.cameraDeviceId);
  const mirrorPreview = useSettings((st) => st.mirrorPreview);
  const set = useSettings((st) => st.set);
  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const { videoRef, status } = useCamera();

  useEffect(() => {
    let alive = true;
    listCameras().then((list) => alive && setCameras(list));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Section
      emoji="📷"
      title="Camera"
      note="Pick the lens this kiosk shoots with. The preview updates live."
    >
      <div className="relative mx-auto aspect-[4/3] w-full max-w-[15rem] overflow-hidden rounded-xl2 bg-black shadow-float">
        {status === "denied" || status === "error" ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-xs text-white/70">
            No camera access — check the browser's site permissions.
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={cn(
              "h-full w-full object-cover",
              mirrorPreview && "scale-x-[-1]",
            )}
          />
        )}
      </div>

      <Row label="Device" stacked>
        <div className="flex flex-wrap gap-2">
          <Chip active={cameraDeviceId === null} onClick={() => set("cameraDeviceId", null)}>
            System default
          </Chip>
          {cameras.map((c) => (
            <Chip
              key={c.deviceId}
              active={cameraDeviceId === c.deviceId}
              onClick={() => set("cameraDeviceId", c.deviceId)}
            >
              {c.label.length > 26 ? `${c.label.slice(0, 26)}…` : c.label}
            </Chip>
          ))}
          {cameras.length === 0 && (
            <span className="text-xs text-cocoa/40">Looking for cameras…</span>
          )}
        </div>
      </Row>

      <Row
        label="Mirror the preview"
        hint="Off for rear/external cameras so text isn't reversed."
      >
        <Toggle
          label="Mirror the preview"
          checked={mirrorPreview}
          onChange={(v) => set("mirrorPreview", v)}
        />
      </Row>
    </Section>
  );
}

// ── Event presets ───────────────────────────────────────────────────────────

function presetId(): string {
  return `ep_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function EventPresetsSection({ onToast }: { onToast: (msg: string) => void }) {
  const theme = useSession((st) => st.theme);
  const applyConfig = useSettings((st) => st.applyConfig);
  const [presets, setPresets] = useState<EventPreset[]>(() => loadPresets());
  const [name, setName] = useState("");

  const full = presets.length >= MAX_PRESETS;
  const canSave = name.trim().length > 0 && !full;

  const save = () => {
    const n = name.trim();
    if (!n) return;
    if (full) {
      onToast(`Only ${MAX_PRESETS} presets — delete one first`);
      return;
    }
    const next = [
      { id: presetId(), name: n, config: snapshotConfig() },
      ...presets,
    ].slice(0, MAX_PRESETS);
    const res = persistPresets(next);
    if (!res.ok) {
      onToast(res.error ?? "Couldn't save the preset.");
      return;
    }
    setPresets(next);
    setName("");
    onToast(`Saved "${n}"`);
  };

  const apply = (p: EventPreset) => {
    applyConfig(p.config);
    applyBrandVars(effectiveBrand(theme));
    onToast(`Loaded "${p.name}"`);
  };

  const remove = (id: string) => {
    const next = presets.filter((p) => p.id !== id);
    persistPresets(next);
    setPresets(next);
  };

  return (
    <Section
      emoji="💾"
      title="Event presets"
      note="Save this whole setup (branding, palette, layouts, filters, overlay, uploads, timings) and reload it for the next event."
    >
      <Row label="Save current setup" stacked>
        <div className="flex gap-2">
          <TextField
            value={name}
            onChange={setName}
            placeholder="e.g. Wedding of A&B"
            maxLength={28}
          />
          <SmallButton tone={canSave ? "brand" : "ghost"} onClick={save}>
            Save
          </SmallButton>
        </div>
      </Row>

      {presets.length > 0 ? (
        <div className="flex flex-col gap-2">
          {presets.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 rounded-xl border border-cocoa/10 bg-white/60 py-1.5 pl-3 pr-1.5"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-cocoa">
                {p.name}
              </span>
              <SmallButton tone="brand" onClick={() => apply(p)}>
                Load
              </SmallButton>
              <button
                type="button"
                aria-label={`Delete ${p.name}`}
                onClick={() => remove(p.id)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-cocoa/50 transition-colors active:bg-red-50 active:text-red-600"
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-cocoa/40">No presets saved yet.</p>
      )}
    </Section>
  );
}

// ── Custom stickers ─────────────────────────────────────────────────────────

function CustomStickersSection({ onToast }: { onToast: (msg: string) => void }) {
  const stickers = useSettings((st) => st.customStickers);
  const addCustomStickers = useSettings((st) => st.addCustomStickers);
  const removeCustomSticker = useSettings((st) => st.removeCustomSticker);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const full = stickers.length >= MAX_CUSTOM_STICKERS;

  const onFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const room = MAX_CUSTOM_STICKERS - stickers.length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const file of picked) {
        try {
          urls.push(await fileToPngDataUrl(file));
        } catch {
          // Skip anything the browser can't decode (e.g. an unsupported format).
        }
      }
      if (urls.length) {
        addCustomStickers(urls);
        onToast(`Added ${urls.length} sticker${urls.length > 1 ? "s" : ""}`);
      } else {
        onToast("Couldn't read those images");
      }
      if (files.length > picked.length) onToast(`Only ${MAX_CUSTOM_STICKERS} fit`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Section
      emoji="🖼️"
      title="Custom stickers"
      note="Upload your own PNG props (logos, cut-outs). They appear as a “Yours” pack in the editor. Transparent PNGs look best."
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/webp,image/*"
        multiple
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />

      {stickers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {stickers.map((cs) => (
            <div
              key={cs.id}
              className="relative h-14 w-14 overflow-hidden rounded-xl border border-cocoa/10 bg-[repeating-conic-gradient(#00000008_0_25%,transparent_0_50%)] bg-[length:12px_12px]"
            >
              <img
                src={cs.url}
                alt=""
                className="h-full w-full object-contain p-1"
              />
              <button
                type="button"
                aria-label="Remove sticker"
                onClick={() => removeCustomSticker(cs.id)}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[11px] font-bold text-white shadow"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <Row
        label={`${stickers.length} / ${MAX_CUSTOM_STICKERS} uploaded`}
        hint={full ? "Remove one to add more." : "PNG, WebP or JPG. Scaled down automatically."}
      >
        <SmallButton
          tone={full ? "ghost" : "brand"}
          onClick={() => {
            if (full) {
              onToast("Sticker tray is full");
              return;
            }
            inputRef.current?.click();
          }}
        >
          {busy ? "Adding…" : "Upload"}
        </SmallButton>
      </Row>
    </Section>
  );
}

// ── Customer preview ────────────────────────────────────────────────────────

/** A soft portrait stand-in so the preview reads as a real receipt. */
const PREVIEW_PHOTO =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='250'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#ffe3c2'/><stop offset='1' stop-color='#e6b89c'/></linearGradient></defs><rect width='200' height='250' fill='url(#g)'/><circle cx='100' cy='96' r='40' fill='#ffffffbb'/><ellipse cx='100' cy='215' rx='72' ry='58' fill='#ffffffbb'/></svg>`,
  );

function CustomerPreviewSection() {
  const theme = useSession((st) => st.theme);
  // Subscribe to everything that changes the look so the preview stays live.
  const boothType = useSettings((st) => st.boothType);
  const eventType = useSettings((st) => st.eventType);
  const eventPhoto = useSettings((st) => st.eventPhoto);
  const eventTitle = useSettings((st) => st.eventTitle);
  const eventSubtitle = useSettings((st) => st.eventSubtitle);
  const eventName = useSettings((st) => st.eventName);
  const defaultOverlayId = useSettings((st) => st.defaultOverlayId);
  const customFrames = useSettings((st) => st.customFrames);
  const defaultLayoutId = useSettings((st) => st.defaultLayoutId);
  const eventTemplateId = useSettings((st) => st.eventTemplateId);
  const templates = useTemplates((st) => st.templates);
  // These selectors exist to re-render the preview when the host changes them.
  void defaultOverlayId;
  void defaultLayoutId;

  // A designed template (event only) replaces the receipt preview entirely.
  const activeTemplate =
    boothType === "event"
      ? templates.find((t) => t.id === eventTemplateId)
      : undefined;

  const layout = startingLayout();
  const overlayId = startingOverlay();
  const activeCat: OverlayCategory =
    boothType === "event" ? eventType : "Classic";
  const opts = {
    photo: eventPhoto,
    title: eventTitle.trim() || eventName.trim(),
    subtitle: eventSubtitle.trim(),
    accent: ACCENT_BY_CATEGORY[activeCat],
  };
  const frameOverlay = resolveOverlaySrc(
    overlayId,
    layout.paperAspect,
    customFrames,
    opts,
  );
  const photos = Array.from({ length: layout.shots }, (_, i) => ({
    id: `pv${i}`,
    dataUrl: PREVIEW_PHOTO,
  }));

  return (
    <Section
      emoji="👀"
      title="Customer preview"
      note="What guests get with the current setup — updates as you change things below."
    >
      {activeTemplate ? (
        // Event with a designed template → show the composited result.
        <TemplatePreview template={activeTemplate} />
      ) : (
        <>
          <div className="mx-auto w-full max-w-[210px]">
            <Receipt
              layout={layout}
              photos={photos}
              filterCss="none"
              frameBg={DEFAULT_FRAME_STYLE.bg}
              shape="rounded"
              frameOverlay={frameOverlay}
              theme={theme}
              code="PREVIEW"
              dateLabel={formatDate()}
            />
          </div>
          {boothType === "event" && overlayId === "none" && (
            <p className="text-center text-xs text-amber-600">
              Upload an event template below, or pick an “Applied to every guest”
              frame, so guests get the event design.
            </p>
          )}
        </>
      )}
    </Section>
  );
}

// ── Booth type / event ──────────────────────────────────────────────────────

/** Event categories the host can set up for (Classic is the "normal booth"). */
const EVENT_TYPES = OVERLAY_CATEGORIES.filter((c) => c !== "Classic");

function BoothTypeSection({ onToast }: { onToast: (msg: string) => void }) {
  const boothType = useSettings((st) => st.boothType);
  const eventType = useSettings((st) => st.eventType);
  const eventPhoto = useSettings((st) => st.eventPhoto);
  const eventTitle = useSettings((st) => st.eventTitle);
  const eventSubtitle = useSettings((st) => st.eventSubtitle);
  const set = useSettings((st) => st.set);
  const photoRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const isEvent = boothType === "event";

  const onPhoto = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      set("eventPhoto", await fileToJpegDataUrl(file, PHOTO_MAX_DIM));
      onToast("Photo added");
    } catch {
      onToast("Couldn't read that image");
    } finally {
      setBusy(false);
      if (photoRef.current) photoRef.current.value = "";
    }
  };

  return (
    <Section
      emoji="🎭"
      title="Booth type"
      note="A normal booth shows guests only the Classic frames. An event booth shows that event's frames — including photo templates you customise below."
    >
      <Row label="This booth is a" stacked>
        <Segmented
          value={boothType}
          onChange={(v) => set("boothType", v as "normal" | "event")}
          options={[
            { value: "normal", label: "Normal" },
            { value: "event", label: "Event" },
          ]}
        />
      </Row>

      {isEvent && (
        <>
          <Row label="Event" hint="Which set of frames guests get." stacked>
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPES.map((c) => (
                <Chip
                  key={c}
                  active={eventType === c}
                  onClick={() => set("eventType", c)}
                >
                  {c}
                </Chip>
              ))}
            </div>
          </Row>

          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => onPhoto(e.target.files)}
          />
          <Row
            label="Feature photo"
            hint="Couple / celebrant photo, shown by the photo-template frames."
          >
            <div className="flex items-center gap-2">
              {eventPhoto && (
                <span className="relative h-12 w-12 overflow-hidden rounded-full border border-cocoa/15">
                  <img src={eventPhoto} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => set("eventPhoto", null)}
                    className="absolute inset-0 flex items-center justify-center bg-black/45 text-xs font-bold text-white opacity-0 transition-opacity active:opacity-100"
                  >
                    ✕
                  </button>
                </span>
              )}
              <SmallButton tone="brand" onClick={() => photoRef.current?.click()}>
                {busy ? "Adding…" : eventPhoto ? "Replace" : "Upload"}
              </SmallButton>
            </div>
          </Row>

          <Row label="Title" hint="e.g. the couple's or celebrant's name." stacked>
            <TextField
              value={eventTitle}
              onChange={(v) => set("eventTitle", v)}
              placeholder="John & Jane"
              maxLength={28}
            />
          </Row>
          <Row label="Subtitle" hint="A date or short message." stacked>
            <TextField
              value={eventSubtitle}
              onChange={(v) => set("eventSubtitle", v)}
              placeholder="December 25, 2026"
              maxLength={32}
            />
          </Row>

          {/* Live preview of the photo templates with the entered details. */}
          <Row label="Photo templates" hint="Guests can pick any of these." stacked>
            <div className="no-bar flex gap-2 overflow-x-auto pb-1">
              {PHOTO_TEMPLATES.map((t) => {
                const src = t.svg(150 / 242, {
                  photo: eventPhoto,
                  title: eventTitle.trim() || useSettings.getState().eventName.trim(),
                  subtitle: eventSubtitle.trim(),
                  accent: ACCENT_BY_CATEGORY[eventType],
                });
                return (
                  <figure key={t.id} className="shrink-0">
                    <span className="block h-[121px] w-[75px] overflow-hidden rounded-md bg-paper shadow">
                      <img src={src} alt="" className="h-full w-full object-cover" />
                    </span>
                    <figcaption className="mt-0.5 text-center text-[10px] font-semibold text-cocoa/60">
                      {t.name}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </Row>
        </>
      )}
    </Section>
  );
}

// ── Event template (designed, uploaded) ─────────────────────────────────────

/** Composites a template with placeholder photos so the host sees the result. */
function TemplatePreview({ template }: { template: EventTemplate }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!template.slots.length) {
      setUrl(null);
      return;
    }
    let alive = true;
    // Debounce so dragging a box doesn't re-composite on every pixel.
    const t = window.setTimeout(() => {
      const photos = template.slots.map((_, i) => ({
        id: `pv${i}`,
        dataUrl: PREVIEW_PHOTO,
      }));
      composeTemplate({ template, photos })
        .then((u) => alive && setUrl(u))
        .catch(() => undefined);
    }, 160);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [template]);

  if (!template.slots.length) {
    return (
      <p className="mt-2 text-xs text-amber-600">
        Add at least one photo box to preview.
      </p>
    );
  }
  return url ? (
    <div className="mt-2">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-cocoa/40">
        Result preview
      </p>
      <img src={url} alt="" className="w-full rounded-lg shadow" />
    </div>
  ) : (
    <p className="mt-2 text-xs text-cocoa/40">Rendering preview…</p>
  );
}

function EventTemplateSection({ onToast }: { onToast: (msg: string) => void }) {
  const boothType = useSettings((st) => st.boothType);
  const eventTemplateId = useSettings((st) => st.eventTemplateId);
  const set = useSettings((st) => st.set);
  const templates = useTemplates((st) => st.templates);
  const addTemplate = useTemplates((st) => st.addTemplate);
  const setSlots = useTemplates((st) => st.setSlots);
  const removeTemplate = useTemplates((st) => st.removeTemplate);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Templates are an event-only feature; a normal booth uses the receipt.
  if (boothType !== "event") return null;

  const full = templates.length >= MAX_TEMPLATES;

  const onFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const { url, aspect } = await fileToTemplate(file);
      const name =
        file.name.replace(/\.[^.]+$/, "").slice(0, 24) ||
        `Template ${templates.length + 1}`;
      const id = addTemplate({ name, image: url, aspect, slots: [] });
      set("eventTemplateId", id);
      setEditingId(id);
      onToast("Template added — now mark the photo boxes");
    } catch {
      onToast("Couldn't read that image");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Section
      emoji="🖼️"
      title="Event template"
      note="Upload your finished landscape design, then drag boxes onto the photo slots. The number of boxes is how many shots guests take. Overrides the receipt for this event."
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => onFile(e.target.files)}
      />

      {templates.length > 0 && (
        <div className="flex flex-col gap-2">
          {templates.map((t) => {
            const active = eventTemplateId === t.id;
            const open = editingId === t.id;
            return (
              <div
                key={t.id}
                className={cn(
                  "rounded-xl border p-2",
                  active
                    ? "border-[rgb(var(--brand-a))] bg-white"
                    : "border-cocoa/10 bg-white/60",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="h-10 w-14 shrink-0 overflow-hidden rounded-md border border-cocoa/10">
                    <img src={t.image} alt="" className="h-full w-full object-cover" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-cocoa">
                      {t.name}
                    </div>
                    <div className="text-xs text-cocoa/50">
                      {t.slots.length} photo{t.slots.length === 1 ? "" : "s"}
                      {active && " · active"}
                    </div>
                  </div>
                  {!active && (
                    <SmallButton tone="brand" onClick={() => set("eventTemplateId", t.id)}>
                      Use
                    </SmallButton>
                  )}
                  <SmallButton onClick={() => setEditingId(open ? null : t.id)}>
                    {open ? "Close" : "Boxes"}
                  </SmallButton>
                  <button
                    type="button"
                    aria-label={`Delete ${t.name}`}
                    onClick={() => {
                      removeTemplate(t.id);
                      if (active) set("eventTemplateId", null);
                      if (open) setEditingId(null);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-cocoa/50 active:bg-red-50 active:text-red-600"
                  >
                    🗑
                  </button>
                </div>
                {open && (
                  <div className="mt-2">
                    <TemplateSlotEditor
                      image={t.image}
                      slots={t.slots}
                      onChange={(slots) => setSlots(t.id, slots)}
                    />
                    <TemplatePreview template={t} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Row
        label={`${templates.length} / ${MAX_TEMPLATES} templates`}
        hint={full ? "Remove one to add more." : "PNG or JPG. Landscape works best."}
      >
        <SmallButton
          tone={full ? "ghost" : "brand"}
          onClick={() => {
            if (full) {
              onToast("Template tray is full");
              return;
            }
            inputRef.current?.click();
          }}
        >
          {busy ? "Adding…" : "Upload"}
        </SmallButton>
      </Row>
    </Section>
  );
}

// ── Frame overlay ───────────────────────────────────────────────────────────

function FrameOverlaySection({ onToast }: { onToast: (msg: string) => void }) {
  const customFrames = useSettings((st) => st.customFrames);
  const defaultOverlayId = useSettings((st) => st.defaultOverlayId);
  const guestCanChangeOverlay = useSettings((st) => st.guestCanChangeOverlay);
  const boothType = useSettings((st) => st.boothType);
  const eventType = useSettings((st) => st.eventType);
  const eventPhoto = useSettings((st) => st.eventPhoto);
  const eventTitle = useSettings((st) => st.eventTitle);
  const eventSubtitle = useSettings((st) => st.eventSubtitle);
  const eventName = useSettings((st) => st.eventName);
  const addCustomFrames = useSettings((st) => st.addCustomFrames);
  const removeCustomFrame = useSettings((st) => st.removeCustomFrame);
  const set = useSettings((st) => st.set);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const full = customFrames.length >= MAX_CUSTOM_FRAMES;

  const onFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const room = MAX_CUSTOM_FRAMES - customFrames.length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const file of picked) {
        try {
          urls.push(await fileToPngDataUrl(file, FRAME_MAX_DIM));
        } catch {
          // Skip anything the browser can't decode.
        }
      }
      if (urls.length) {
        addCustomFrames(urls);
        onToast(`Added ${urls.length} frame${urls.length > 1 ? "s" : ""}`);
      } else {
        onToast("Couldn't read those images");
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  // Scoped to the declared booth type: Classic frames for a normal booth, the
  // event's frames + photo templates for an event, plus the host's uploads.
  const cat: OverlayCategory = boothType === "event" ? eventType : "Classic";
  const opts = {
    photo: eventPhoto,
    title: eventTitle.trim() || eventName.trim(),
    subtitle: eventSubtitle.trim(),
    accent: ACCENT_BY_CATEGORY[cat],
  };
  const options: { id: string; name: string; thumb: string | null }[] = [
    { id: "none", name: "None", thumb: null },
    ...overlaysInCategory(cat).map((o) => ({
      id: o.id,
      name: o.name,
      thumb: o.svg!(1, opts),
    })),
    ...(boothType === "event"
      ? PHOTO_TEMPLATES.map((t) => ({
          id: t.id,
          name: t.name,
          thumb: t.svg(1, opts),
        }))
      : []),
    ...customFrames.map((cf, i) => ({
      id: cf.id,
      name: `Custom ${i + 1}`,
      thumb: cf.url,
    })),
  ];

  return (
    <Section
      emoji="🖼️"
      title="Frame overlay"
      note="Upload your own PNG frame (design it for a tall receipt — it's stretched to fit). Pick one to apply to every guest, and hide the picker so they can't change it."
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/webp,image/*"
        multiple
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />

      {customFrames.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {customFrames.map((cf) => (
            <div
              key={cf.id}
              className="relative h-16 w-12 overflow-hidden rounded-lg border border-cocoa/10 bg-[repeating-conic-gradient(#00000008_0_25%,transparent_0_50%)] bg-[length:12px_12px]"
            >
              <img src={cf.url} alt="" className="h-full w-full object-contain" />
              <button
                type="button"
                aria-label="Remove frame"
                onClick={() => removeCustomFrame(cf.id)}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[11px] font-bold text-white shadow"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <Row
        label={`${customFrames.length} / ${MAX_CUSTOM_FRAMES} uploaded`}
        hint={full ? "Remove one to add more." : "PNG, WebP or JPG. Transparent PNG works best."}
      >
        <SmallButton
          tone={full ? "ghost" : "brand"}
          onClick={() => {
            if (full) {
              onToast("Frame tray is full");
              return;
            }
            inputRef.current?.click();
          }}
        >
          {busy ? "Adding…" : "Upload"}
        </SmallButton>
      </Row>

      <Row label="Applied to every guest" hint="The overlay each session starts on." stacked>
        <div className="no-bar flex gap-2 overflow-x-auto pb-1">
          {options.map((o) => {
            const active = defaultOverlayId === o.id;
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={active}
                onClick={() => set("defaultOverlayId", o.id)}
                className={cn(
                  "flex shrink-0 flex-col items-center gap-1 rounded-xl border p-1.5 transition-colors",
                  active
                    ? "border-[rgb(var(--brand-a))] bg-white shadow"
                    : "border-cocoa/15 bg-white/60",
                )}
              >
                <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md bg-paper-shade">
                  {o.thumb ? (
                    <img src={o.thumb} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-base text-cocoa/40">∅</span>
                  )}
                </span>
                <span
                  className={cn(
                    "text-[10px] font-semibold",
                    active ? "text-cocoa" : "text-cocoa/50",
                  )}
                >
                  {o.name}
                </span>
              </button>
            );
          })}
        </div>
      </Row>

      <Row
        label="Guests can change the overlay"
        hint="Turn off to lock the applied overlay and hide the picker on the Frames screen."
      >
        <Toggle
          label="Guests can change the overlay"
          checked={guestCanChangeOverlay}
          onChange={(v) => set("guestCanChangeOverlay", v)}
        />
      </Row>
    </Section>
  );
}

// ── Kiosk ───────────────────────────────────────────────────────────────────

function KioskSection({ onToast }: { onToast: (msg: string) => void }) {
  const kioskMode = useSettings((st) => st.kioskMode);
  const keepAwake = useSettings((st) => st.keepAwake);
  const set = useSettings((st) => st.set);

  return (
    <Section
      emoji="🔒"
      title="Kiosk lockdown"
      note="Locks the booth to this app: fullscreen, no right-click, no pinch-zoom, no browser shortcuts, no back button, and a confirm before the page can close."
    >
      <Row label="Kiosk mode" hint="Turn this on once the booth is set up.">
        <Toggle
          label="Kiosk mode"
          checked={kioskMode}
          onChange={(v) => {
            set("kioskMode", v);
            onToast(v ? "Kiosk mode on" : "Kiosk mode off");
          }}
        />
      </Row>
      <Row
        label="Keep the screen awake"
        hint={
          wakeLockSupported()
            ? "Holds a wake lock so the tablet never sleeps."
            : "This browser has no Wake Lock API — use the OS display settings."
        }
      >
        <Toggle
          label="Keep the screen awake"
          checked={keepAwake}
          onChange={(v) => set("keepAwake", v)}
        />
      </Row>
      <Row label="Fullscreen" hint="Re-enters automatically on the next tap in kiosk mode.">
        <SmallButton
          onClick={() => {
            enterFullscreen().then((ok) =>
              onToast(ok ? "Fullscreen on" : "Fullscreen unavailable here"),
            );
          }}
        >
          {isFullscreen() ? "Re-enter" : "Enter now"}
        </SmallButton>
      </Row>
    </Section>
  );
}

// ── PIN ─────────────────────────────────────────────────────────────────────

function PinChanger({ onSaved }: { onSaved: () => void }) {
  const pin = useSettings((st) => st.pin);
  const set = useSettings((st) => st.set);
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 8);
  const valid = next.length >= 4 && next === confirm;
  const mismatch = confirm.length > 0 && next !== confirm;

  return (
    <>
      <Row label="New PIN" hint="4–8 digits." stacked>
        <TextField
          value={next}
          onChange={(v) => setNext(digits(v))}
          placeholder="••••"
          maxLength={8}
          mono
        />
      </Row>
      <Row label="Confirm" stacked>
        <TextField
          value={confirm}
          onChange={(v) => setConfirm(digits(v))}
          placeholder="••••"
          maxLength={8}
          mono
        />
      </Row>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-cocoa/50">
          {mismatch
            ? "PINs don't match."
            : next.length > 0 && next.length < 4
              ? "At least 4 digits."
              : `Current PIN is ${pin.length} digits.`}
        </span>
        <SmallButton
          tone={valid ? "brand" : "ghost"}
          onClick={() => {
            if (!valid) return;
            set("pin", next);
            setNext("");
            setConfirm("");
            onSaved();
          }}
        >
          Save PIN
        </SmallButton>
      </div>
    </>
  );
}

function StatusRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-cocoa/60">{label}</span>
      <span
        className={cn(
          "font-semibold",
          ok ? "text-emerald-600" : "text-amber-600",
        )}
      >
        {value}
      </span>
    </div>
  );
}
