import {
  BUILT_IN_COVERS,
  COVER_ASPECT,
  builtInCover,
  GUEST_ASPECT,
  MIN_CROP_W,
  cropHeight,
  validCrop,
  type CoverCrop,
} from "@/assets/covers";
import { CoverImage } from "@/components/CoverImage";
import { cropGif } from "@/lib/cropGif";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  BRAND_PRESETS,
  COUNTDOWN_OPTIONS,
  EVENT_CATEGORIES,
  IDLE_OPTIONS,
  MAX_CUSTOM_FRAMES,
  MAX_CUSTOM_STICKERS,
  QR_RESET_OPTIONS,
  applyPalette,
  guestOverlayCats,
  DARK_INK,
  LIGHT_INK,
  overlayCategoryFor,
  receiptFooter,
  receiptHeader,
  snapshotConfig,
  startingLayout,
  startingOverlay,
  useSettings,
  type BoothConfig,
} from "@/store/settings";
import {
  FRAME_MAX_DIM,
  fileToPngDataUrl,
  fileToTemplate,
} from "@/lib/image";
import {
  DEFAULT_BRAND_SLOT,
  DEFAULT_QR_SLOT,
  MAX_TEMPLATES,
  useTemplates,
} from "@/store/templates";
import {
  clearActiveEvent,
  loadEvent,
  newEventId,
  useEvents,
  type EventRecord,
} from "@/store/events";
import { composeTemplate } from "@/lib/composeTemplate";
import { useFlowSteps } from "@/lib/flow";
import {
  ARCHIVE_LOCATION,
  AUTO_DOWNLOAD_SETUP,
  compositeFilename,
} from "@/lib/download";
import {
  clearCoverOverride,
  clearWelcomeMedia,
  saveCoverOverride,
  saveWelcomeMedia,
  useWelcome,
} from "@/store/welcome";
import { TemplateSlotEditor } from "@/components/admin/TemplateSlotEditor";
import { DateField } from "@/components/admin/DateField";
import { PrinterSection } from "@/components/admin/PrinterSection";
import { PREVIEW_PHOTO } from "@/lib/previewComposite";
import type { EventTemplate } from "@/types";
import {
  ACCENT_BY_CATEGORY,
  OVERLAY_CATEGORIES,
  overlaysInCategory,
  resolveOverlaySrc,
  type OverlayCategory,
} from "@/data/overlays";
import { Receipt } from "@/components/Receipt";
import { DEFAULT_FRAME_STYLE } from "@/data/frames";
import { formatDate } from "@/lib/date";
import { useSession } from "@/store/session";
import { LAYOUTS } from "@/data/layouts";
import { FILTERS } from "@/data/filters";
import { listCameras, stopCameraStream, useCamera, type CameraOption } from "@/lib/camera";
import { enterFullscreen, isFullscreen, wakeLockSupported } from "@/lib/kiosk";
import { DeliveryService, drainUploadQueue } from "@/lib/delivery";
import { useUploadQueue } from "@/lib/uploadQueue";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
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
import { LogoMark } from "@/components/Logo";

const APP_VERSION = "1.0.0";

/** Admin is grouped into tabs so a long list of settings stays navigable. */
type AdminTab = "capture" | "ops" | "system" | "events";
const ADMIN_TABS: { id: AdminTab; label: string; emoji: string }[] = [
  { id: "capture", label: "Capture", emoji: "📸" },
  { id: "ops", label: "Ops", emoji: "🔔" },
  { id: "system", label: "System", emoji: "⚙️" },
  { id: "events", label: "Events", emoji: "🎬" },
];

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
  const [tab, setTab] = useState<AdminTab>("events");
  const [confirmClose, setConfirmClose] = useState(false);
  /** True while a press that began on "Yes, return" is still down. */
  const returnPressed = useRef(false);

  const toast = (msg: string) => {
    setNote(msg);
    window.setTimeout(() => setNote((n) => (n === msg ? null : n)), 2000);
  };

  // A keyboard way out, for a host with a Bluetooth keyboard or a laptop. Esc
  // steps back one level: dismiss the confirmation, or leave Admin.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (confirmClose) setConfirmClose(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmClose, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      className="fixed inset-0 z-[100] flex justify-center bg-cream-deep/95 backdrop-blur-xl"
    >
      {/* No width cap of its own — KioskFrame already keeps the design box to a
          sane column and scales it, so capping again just insets Admin from the
          guest UI on a wider tablet. */}
      <div className="flex h-full w-full flex-col">
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
          <div className="flex shrink-0 items-center gap-2">
            <SmallButton tone="brand" onClick={() => setConfirmClose(true)}>
              Done ✓
            </SmallButton>
            {/* A second, independent way out. "Done ✓" goes via a confirmation;
                this leaves at once. Two paths on purpose — if the modal ever
                fails to take a tap, the host should never be stuck in Admin with
                no option but to kill the app. */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Return to customer view now"
              title="Return to customer view now"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-cocoa/15 bg-white/70 text-base font-bold text-cocoa/70 [touch-action:manipulation]"
            >
              ✕
            </button>
          </div>
        </header>

        {/* Tabs */}
        <div className="no-bar flex shrink-0 gap-1.5 overflow-x-auto px-4 pb-2">
          {ADMIN_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors",
                tab === t.id
                  ? "brand-fill text-white shadow-bloom"
                  : "glass text-cocoa/60",
              )}
            >
              <span aria-hidden>{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div
          key={tab}
          className="no-bar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-10"
        >
          {tab === "events" && (
            <>
              <CustomerPreviewSection />
              <EventsManager onToast={toast} />
            </>
          )}

          {tab === "capture" && <CameraSection />}

          {tab === "capture" && (
            <>
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

          <GuestStepsSection />

          <Section emoji="🎨" title="Filters" note="Which looks guests can choose from.">
            {!s.filtersEnabled && (
              <p className="rounded-xl bg-cocoa/5 px-3 py-2 text-xs leading-snug text-cocoa/60">
                The filter step is switched off in Guest steps, so guests never see
                this reel — every photo prints in {FILTERS[0].name.toLowerCase()}.
              </p>
            )}
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
            </>
          )}

          {tab === "ops" && (
            <>
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

              <ReceiptBrandingSection />

              <WelcomeScreenSection onToast={toast} />
            </>
          )}

          {tab === "system" && (
            <>
              <PaletteSection />

              <KioskSection onToast={toast} />

              <PrinterSection onToast={toast} />

          <Section
            emoji="💾"
            title="Save to this device"
            note="Keeps the booth's own copy of every finished photo, separate from the guest's QR link."
          >
            <Row
              label="Auto-save each photo"
              hint={
                s.autoDownload
                  ? `On — every finished photo is written to this device's ${ARCHIVE_LOCATION}.`
                  : "Off — nothing is written to this device. Guests still get their photo by QR or Share."
              }
            >
              <Toggle
                label="Auto-save each photo"
                checked={s.autoDownload}
                onChange={(v) => {
                  set("autoDownload", v);
                  toast(v ? "Auto-save on" : "Auto-save off");
                }}
              />
            </Row>
            {s.autoDownload && AUTO_DOWNLOAD_SETUP && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-800">
                ⚠️ {AUTO_DOWNLOAD_SETUP}
              </p>
            )}
            <p className="text-xs leading-snug text-cocoa/50">
              Files are named{" "}
              <span className="font-mono text-[11px] text-cocoa/70">
                {compositeFilename("AB12CD")}
              </span>{" "}
              — newest last when sorted by name.
            </p>
          </Section>

          <Section
            emoji="🔐"
            title="Security"
            note="The PIN guards this panel. Five wrong tries locks it for 30 seconds."
          >
            <PinChanger onSaved={() => toast("PIN updated")} />
          </Section>

          <StatusSection onToast={toast} />

          <Section
            emoji="🧪"
            title="Development"
            note="For testing only. Leave these alone on a booth that's running an event."
          >
            <Row
              label="Upload photos to the cloud"
              hint={
                s.cloudUploadEnabled
                  ? "On — composites upload to Cloudflare and the QR resolves."
                  : "OFF — nothing is uploaded or queued, and QR codes will not work."
              }
            >
              <Toggle
                checked={s.cloudUploadEnabled}
                onChange={(v) => {
                  set("cloudUploadEnabled", v);
                  toast(v ? "Cloud upload on" : "Cloud upload OFF — QR codes won't work");
                }}
                label="Upload photos to the cloud"
              />
            </Row>
            {!s.cloudUploadEnabled && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-800">
                ⚠️ Guests' QR codes will not work while this is off, and nothing is
                queued to upload later. Switch it back on before an event.
              </p>
            )}
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
                  applyPalette(theme);
                  stopCameraStream();
                  toast("Settings reset");
                }}
              >
                Reset
              </SmallButton>
            </Row>
              </Section>
            </>
          )}

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

        {/* Return-to-customer confirmation */}
        {confirmClose && (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-cocoa/40 p-6 backdrop-blur-sm"
            onClick={() => setConfirmClose(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-strong w-full max-w-[20rem] rounded-xl3 p-6 text-center shadow-float"
            >
              <div className="text-3xl">👋</div>
              <h3 className="mt-2 text-lg font-extrabold text-cocoa">
                Return to Customer View?
              </h3>
              <p className="mt-1 text-sm text-cocoa/55">
                Guests will see the booth again.
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmClose(false)}
                  className="flex-1 rounded-full border border-cocoa/15 bg-white/70 py-4 text-sm font-bold text-cocoa [touch-action:manipulation]"
                >
                  No, stay
                </button>
                {/* Acts on pointer-up as well as click: on Android the synthesised
                    click is sometimes lost when something cancels the gesture,
                    which is the reported failure. Gated on the press having
                    *started* here, so a drag that merely ends over the button
                    doesn't close Admin, and `onClose` is idempotent so both
                    handlers firing is harmless. */}
                <button
                  type="button"
                  onPointerDown={() => {
                    returnPressed.current = true;
                  }}
                  onPointerUp={() => {
                    if (!returnPressed.current) return;
                    returnPressed.current = false;
                    setConfirmClose(false);
                    onClose();
                  }}
                  onPointerCancel={() => {
                    returnPressed.current = false;
                  }}
                  onClick={() => {
                    setConfirmClose(false);
                    onClose();
                  }}
                  className="flex-1 rounded-full brand-fill py-4 text-sm font-bold text-white shadow-bloom [touch-action:manipulation]"
                >
                  Yes, return
                </button>
              </div>
            </motion.div>
          </div>
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

// ── Receipt branding + palette (Standard Booth look) ─────────────────────────

function ReceiptBrandingSection() {
  const eventName = useSettings((st) => st.eventName);
  const footerNote = useSettings((st) => st.footerNote);
  const designMode = useSettings((st) => st.designMode);
  const set = useSettings((st) => st.set);
  const isEvent = designMode !== "standard";

  return (
    <Section
      emoji="🏷️"
      title="Receipt branding"
      note="Shown on the Standard Booth receipt — on screen and in the download."
    >
      <Row
        label="Header"
        hint={
          isEvent
            ? "Hidden while an event is loaded — the event design is the masthead."
            : undefined
        }
        stacked
      >
        <TextField
          value={eventName}
          onChange={(v) => set("eventName", v)}
          placeholder="MAD SHOTS"
          maxLength={22}
          disabled={isEvent}
        />
      </Row>
      <Row label="Footer line" stacked>
        <TextField
          value={footerNote}
          onChange={(v) => set("footerNote", v)}
          placeholder="SCAN FOR YOUR PHOTOS ♥"
          maxLength={30}
        />
      </Row>
      <div className="paper rounded-[6px] px-4 py-3 text-center shadow-paper">
        <div
          className={cn(
            "font-mono text-[10px] font-semibold uppercase tracking-[0.4em] text-paper-ink/60",
            isEvent && "invisible",
          )}
        >
          {receiptHeader(eventName)}
        </div>
        <div className="my-2 border-t border-dashed border-paper-ink/30" />
        <div className="font-mono text-[9px] uppercase tracking-widest text-paper-ink/40">
          {receiptFooter(footerNote)}
        </div>
      </div>
    </Section>
  );
}

function PaletteSection() {
  const brandPresetId = useSettings((st) => st.brandPresetId);
  const gradientButtons = useSettings((st) => st.gradientButtons);
  const set = useSettings((st) => st.set);
  const theme = useSession((st) => st.theme);

  return (
    <Section
      emoji="🎨"
      title="Palette"
      note="Accents and background for the whole booth UI. Each chip is filled with its own background tone. Dark palettes switch text and cards to light-on-dark."
    >
      <div className="flex flex-wrap gap-2">
        {BRAND_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={brandPresetId === p.id}
            onClick={() => {
              set("brandPresetId", p.id);
              applyPalette(theme, p.id);
            }}
            className={cn(
              "flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-semibold transition-colors",
              brandPresetId === p.id
                ? "border-[rgb(var(--brand-a))] shadow"
                : "border-cocoa/15",
            )}
            // The chip wears the palette's own stage tone, so the host can see
            // what the background becomes without having to apply it first.
            style={{
              background: `rgb(${p.stage[0]})`,
              color: `rgb(${(p.dark ? DARK_INK : LIGHT_INK).ink} / ${brandPresetId === p.id ? 1 : 0.6})`,
            }}
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

      <Row
        label="Gradient buttons"
        hint={
          gradientButtons
            ? "On — buttons and switches blend the palette's three colours."
            : "Off — buttons and switches use the palette's first colour, no gradient."
        }
      >
        <Toggle
          label="Gradient buttons"
          checked={gradientButtons}
          onChange={(v) => {
            set("gradientButtons", v);
            applyPalette(theme);
          }}
        />
      </Row>
    </Section>
  );
}

// ── Events manager (create / load / manage) ─────────────────────────────────

function EventsManager({ onToast }: { onToast: (msg: string) => void }) {
  const events = useEvents((st) => st.events);
  const upsertEvent = useEvents((st) => st.upsertEvent);
  const removeEvent = useEvents((st) => st.removeEvent);
  const removeTemplatesForEvent = useTemplates((st) => st.removeTemplatesForEvent);
  const activeEventId = useSettings((st) => st.activeEventId);
  const designMode = useSettings((st) => st.designMode);
  const set = useSettings((st) => st.set);
  const theme = useSession((st) => st.theme);

  const [editing, setEditing] = useState<{ id: string; isNew: boolean } | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Wedding");
  const [date, setDate] = useState("");
  const backup = useRef<{ config: BoothConfig; activeEventId: string | null } | null>(
    null,
  );

  const repaint = () => applyPalette(theme);

  const applyCategory = (cat: string) => {
    setCategory(cat);
    set("eventCategory", cat);
    set("eventType", overlayCategoryFor(cat));
  };

  const startCreate = () => {
    backup.current = { config: snapshotConfig(), activeEventId };
    setName("");
    setDate("");
    set("designMode", "template");
    // A brand-new event starts with NO template selected — its own set only.
    set("eventTemplateId", null);
    applyCategory("Wedding");
    setEditing({ id: newEventId(), isNew: true });
  };

  const startEdit = (e: EventRecord) => {
    backup.current = { config: snapshotConfig(), activeEventId };
    loadEvent(e);
    repaint();
    setName(e.name);
    setCategory(e.category);
    setDate(e.date);
    setEditing({ id: e.id, isNew: false });
  };

  const cancel = () => {
    // Discard a brand-new event's uploaded templates.
    if (editing?.isNew) removeTemplatesForEvent(editing.id);
    const b = backup.current;
    if (b) {
      useSettings.getState().applyConfig(b.config);
      set("activeEventId", b.activeEventId);
      repaint();
    }
    backup.current = null;
    setEditing(null);
  };

  const save = () => {
    if (!editing) return;
    const mode = useSettings.getState().designMode === "overlay" ? "overlay" : "template";
    const config = snapshotConfig();
    config.eventCategory = category;
    config.eventDate = date;
    config.eventType = overlayCategoryFor(category);
    if (!config.eventTitle.trim()) config.eventTitle = name.trim();
    if (!config.eventSubtitle.trim()) config.eventSubtitle = date;
    const nm = name.trim() || `${category} event`;
    upsertEvent({ id: editing.id, name: nm, category, date, designMode: mode, config });
    set("activeEventId", editing.id);
    set("designMode", mode);
    backup.current = null;
    const wasNew = editing.isNew;
    setEditing(null);
    onToast(wasNew ? "Event created & loaded" : "Event updated");
  };

  const load = (e: EventRecord) => {
    loadEvent(e);
    repaint();
    onToast(`Loaded "${e.name}"`);
  };
  const del = (e: EventRecord) => {
    removeEvent(e.id);
    removeTemplatesForEvent(e.id);
    if (activeEventId === e.id) clearActiveEvent();
  };
  const unload = () => {
    clearActiveEvent();
    onToast("Standard Booth");
  };

  // ── Editor ──
  if (editing) {
    const mode = designMode === "overlay" ? "overlay" : "template";
    return (
      <Section
        emoji="🎬"
        title={editing.isNew ? "Create event" : "Edit event"}
        note="Set the basics, then design the print. Saving makes it the active event."
      >
        <Row label="Category" stacked>
          <div className="flex flex-wrap gap-2">
            {EVENT_CATEGORIES.map((c) => (
              <Chip
                key={c.id}
                active={category === c.id}
                onClick={() => applyCategory(c.id)}
              >
                {c.id}
              </Chip>
            ))}
          </div>
        </Row>
        <Row label="Event name" stacked>
          <TextField
            value={name}
            onChange={setName}
            placeholder="e.g. Garvin & Christina"
            maxLength={40}
          />
        </Row>
        <Row label="Event date" stacked>
          <DateField value={date} onChange={setDate} />
        </Row>
        <Row label="Design" hint="Pick one — a template or frame overlays." stacked>
          <Segmented
            value={mode}
            onChange={(v) => set("designMode", v as "template" | "overlay")}
            options={[
              { value: "template", label: "Event Template" },
              { value: "overlay", label: "Frame Overlays" },
            ]}
          />
        </Row>

        {mode === "template" ? (
          <EventTemplateSection eventId={editing.id} onToast={onToast} />
        ) : (
          <FrameOverlaySection onToast={onToast} />
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <SmallButton onClick={cancel}>Cancel</SmallButton>
          <SmallButton tone="brand" onClick={save}>
            {editing.isNew ? "Create event" : "Save event"}
          </SmallButton>
        </div>
      </Section>
    );
  }

  // ── List ──
  return (
    <Section
      emoji="🎬"
      title="Events"
      note="Create an event, then load it to make it the active booth experience. Only one runs at a time."
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-cocoa/50">
          {events.length} event{events.length === 1 ? "" : "s"}
        </span>
        <SmallButton tone="brand" onClick={startCreate}>
          + Create event
        </SmallButton>
      </div>

      {/* Standard Booth (no event) */}
      <button
        type="button"
        onClick={unload}
        className={cn(
          "flex items-center gap-2 rounded-xl border p-2 text-left transition-colors",
          !activeEventId
            ? "border-[rgb(var(--brand-a))] bg-white"
            : "border-cocoa/10 bg-white/60",
        )}
      >
        <span className="text-xl" aria-hidden>
          🧾
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-cocoa">
            Standard Booth{!activeEventId && <span className="brand-text"> · active</span>}
          </div>
          <div className="text-xs text-cocoa/50">Plain receipt · no event</div>
        </div>
      </button>

      {events.map((e) => {
        const active = activeEventId === e.id;
        return (
          <div
            key={e.id}
            className={cn(
              "rounded-xl border p-2",
              active
                ? "border-[rgb(var(--brand-a))] bg-white"
                : "border-cocoa/10 bg-white/60",
            )}
          >
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-cocoa">
                  {e.name}
                  {active && <span className="brand-text"> · active</span>}
                </div>
                <div className="text-xs text-cocoa/50">
                  {e.category}
                  {e.date && ` · ${e.date}`} ·{" "}
                  {e.designMode === "template" ? "Template" : "Overlay"}
                </div>
              </div>
              {!active && (
                <SmallButton tone="brand" onClick={() => load(e)}>
                  Load
                </SmallButton>
              )}
              <SmallButton onClick={() => startEdit(e)}>Edit</SmallButton>
              <button
                type="button"
                aria-label={`Delete ${e.name}`}
                onClick={() => del(e)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-cocoa/50 transition-colors active:bg-red-50 active:text-red-600"
              >
                🗑
              </button>
            </div>
          </div>
        );
      })}

      {events.length === 0 && (
        <p className="text-xs text-cocoa/40">
          No events yet — create one to get started.
        </p>
      )}
    </Section>
  );
}

// ── Custom stickers ─────────────────────────────────────────────────────────

/**
 * Full-size look at a home page before it goes live, plus a crop box.
 *
 * The preview is shaped like the guest screen (the ~540×780 design box) and
 * framed the same way, so what the host sees is what guests get. "Crop" swaps
 * it for the whole picture with a movable, resizable box on top — locked to the
 * guest screen's shape, so there's nothing to stretch. The GIF is never
 * re-cut: the crop is just the region guests are shown, and it keeps animating.
 *
 * Portalled to <body>: Admin's tab panes animate with transforms, which would
 * otherwise trap a `fixed` overlay inside them.
 */
type Handle = "move" | "tl" | "tr" | "bl" | "br";

function CoverPreview({
  cover,
  crop,
  hasFile,
  inUse,
  showPrompt,
  onPrev,
  onNext,
  onClose,
  onUse,
}: {
  cover: { id: string; name: string; url: string | null };
  /** The crop saved for this cover, or null for the original. */
  crop: CoverCrop | null;
  /** The cropped GIF itself is on this device (the crop record alone isn't enough). */
  hasFile: boolean;
  inUse: boolean;
  showPrompt: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onUse: (crop: CoverCrop | null) => Promise<void>;
}) {
  // The crop being tried. Only written back on "Use / Save", so playing around
  // and cancelling leaves the guest screen untouched.
  const [draft, setDraft] = useState<CoverCrop | null>(crop);
  const [cropping, setCropping] = useState(false);
  useEffect(() => {
    setDraft(crop);
    setCropping(false);
  }, [cover.id, crop]);
  const editor = useRef<HTMLDivElement>(null);
  const drag = useRef<{ h: Handle; x: number; y: number; c: CoverCrop } | null>(null);
  const adjustable = cover.url !== null;
  // Re-cutting is real work, so only do it when the crop actually differs.
  const changed = JSON.stringify(draft) !== JSON.stringify(crop) || (!!draft && !hasFile);
  const [saving, setSaving] = useState(false);

  const rect = draft ?? { l: 0, t: 0, w: 1 };
  const rh = cropHeight(rect.w);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  const startCropping = () => {
    setDraft((d) => d ?? { l: 0, t: 0, w: 1 });
    setCropping(true);
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const h = (e.target as HTMLElement).dataset.h as Handle | undefined;
    if (!h || !editor.current) return;
    editor.current.setPointerCapture(e.pointerId);
    drag.current = { h, x: e.clientX, y: e.clientY, c: rect };
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = editor.current;
    if (!d || !el) return;
    const b = el.getBoundingClientRect();
    const c = d.c;
    const ch = cropHeight(c.w);
    if (d.h === "move") {
      setDraft({
        ...c,
        l: clamp(c.l + (e.clientX - d.x) / b.width, 0, 1 - c.w),
        t: clamp(c.t + (e.clientY - d.y) / b.height, 0, 1 - ch),
      });
      return;
    }
    // Corner resize: the opposite corner stays put, and the shape stays locked,
    // so the pointer's horizontal distance from it decides the size.
    const dirX = d.h === "tr" || d.h === "br" ? 1 : -1;
    const dirY = d.h === "bl" || d.h === "br" ? 1 : -1;
    const ax = dirX > 0 ? c.l : c.l + c.w;
    const ay = dirY > 0 ? c.t : c.t + ch;
    const px = (e.clientX - b.left) / b.width;
    const maxW = Math.min(
      dirX > 0 ? 1 - ax : ax,
      ((dirY > 0 ? 1 - ay : ay) * GUEST_ASPECT) / COVER_ASPECT,
    );
    const w = clamp(dirX * (px - ax), MIN_CROP_W, maxW);
    setDraft({
      w,
      l: dirX > 0 ? ax : ax - w,
      t: dirY > 0 ? ay : ay - cropHeight(w),
    });
  };
  const onUp = () => (drag.current = null);

  const pct = (v: number) => `${v * 100}%`;
  const corner = (h: Handle, pos: string) => (
    <span
      data-h={h}
      className={cn(
        "absolute h-7 w-7 rounded-full border-[3px] border-white bg-[rgb(var(--brand-a))] shadow",
        pos,
      )}
    />
  );

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-[22rem] flex-col items-center gap-3"
      >
        <div className="flex w-full items-center justify-between text-white">
          <div>
            <div className="text-lg font-extrabold">{cover.name}</div>
            <div className="text-xs text-white/70">
              {cropping
                ? "Crop — drag the box, resize from the corners"
                : inUse
                  ? "Currently in use"
                  : "Preview — not applied yet"}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close preview"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-lg"
          >
            ✕
          </button>
        </div>

        <div className="flex w-full items-center gap-2">
          <button
            type="button"
            aria-label="Previous cover"
            onClick={onPrev}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-xl text-white"
          >
            ‹
          </button>

          {cropping && cover.url ? (
            // Editor: the whole picture, with everything outside the box dimmed.
            <div
              ref={editor}
              className="relative mx-auto touch-none select-none overflow-hidden rounded-xl border-4 border-white/80 bg-black shadow-float"
              style={{ aspectRatio: "9 / 16", maxHeight: "56vh" }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              <img
                src={cover.url}
                alt=""
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full object-fill"
              />
              <div
                data-h="move"
                className="absolute cursor-move border-2 border-white"
                style={{
                  left: pct(rect.l),
                  top: pct(rect.t),
                  width: pct(rect.w),
                  height: pct(rh),
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
                }}
              >
                {/* Rule-of-thirds guides — pointer-transparent so the whole box drags. */}
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
                  <div className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
                  <div className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
                  <div className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
                </div>
                {corner("tl", "-left-3.5 -top-3.5 cursor-nwse-resize")}
                {corner("tr", "-right-3.5 -top-3.5 cursor-nesw-resize")}
                {corner("bl", "-bottom-3.5 -left-3.5 cursor-nesw-resize")}
                {corner("br", "-bottom-3.5 -right-3.5 cursor-nwse-resize")}
              </div>
            </div>
          ) : (
            <div
              className="relative mx-auto min-h-0 flex-1 overflow-hidden rounded-[1.75rem] border-4 border-white/80 bg-cream shadow-float"
              style={{ aspectRatio: "540 / 780", maxHeight: "56vh" }}
            >
              {cover.url ? (
                <CoverImage key={cover.id} url={cover.url} crop={draft} alt={`${cover.name} preview`} />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <LogoMark size={96} />
                  <div className="mt-4 text-3xl font-extrabold tracking-tight text-cocoa">
                    MAD <span className="brand-text">SHOTS</span>
                  </div>
                  <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.4em] text-cocoa/50">
                    Studio Creative
                  </div>
                </div>
              )}
              {showPrompt && (
                <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center">
                  <span className="rounded-full bg-white/85 px-4 py-2 text-[10px] font-semibold tracking-widest text-cocoa shadow-glass">
                    TOUCH ANYWHERE TO BEGIN
                  </span>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            aria-label="Next cover"
            onClick={onNext}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-xl text-white"
          >
            ›
          </button>
        </div>

        {adjustable && (
          <div className="flex w-full items-center gap-2">
            {cropping ? (
              <button
                type="button"
                onClick={() => setCropping(false)}
                className="flex-1 rounded-full bg-white py-2.5 text-xs font-bold text-cocoa"
              >
                ✓ Done cropping
              </button>
            ) : (
              <button
                type="button"
                onClick={startCropping}
                className="flex-1 rounded-full bg-white/15 py-2.5 text-xs font-bold text-white"
              >
                ✂ Crop
              </button>
            )}
            <button
              type="button"
              disabled={!draft}
              onClick={() => {
                setDraft(null);
                setCropping(false);
              }}
              className="rounded-full bg-white/15 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"
            >
              Reset crop
            </button>
          </div>
        )}

        {adjustable && draft && changed && (
          <div className="text-center text-[11px] text-white/60">
            Saving cuts a new, smaller GIF. “Reset crop” brings the original back.
          </div>
        )}

        <div className="flex w-full gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="flex-1 rounded-full border border-white/30 bg-white/10 py-3.5 text-sm font-bold text-white [touch-action:manipulation] disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              if (inUse && !changed) return onClose();
              setSaving(true);
              try {
                await onUse(draft);
              } finally {
                setSaving(false);
              }
            }}
            className="flex-1 rounded-full brand-fill py-3.5 text-sm font-bold text-white shadow-bloom [touch-action:manipulation] disabled:opacity-60"
          >
            {saving
              ? "Cropping…"
              : inUse
                ? changed
                  ? "Save crop"
                  : "Keep this one"
                : "Use this cover"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * The host's own artwork on the attract screen.
 *
 * "Use it" is kept separate from "upload it" on purpose: a host running two
 * events off one kiosk switches back to the Mad Shots screen without throwing
 * away artwork they'll want again next weekend.
 */
/**
 * Past this, warn but don't block. There's no storage reason to refuse a big
 * file — IndexedDB has the room — but decoding a huge GIF every loop is real
 * work for a cheap kiosk tablet, and that's the host's call to make with their
 * own hardware in front of them.
 */
const LARGE_ARTWORK_BYTES = 8_000_000;

function WelcomeScreenSection({ onToast }: { onToast: (msg: string) => void }) {
  const welcomeCustom = useSettings((st) => st.welcomeCustom);
  const welcomePrompt = useSettings((st) => st.welcomePrompt);
  const welcomeCover = useSettings((st) => st.welcomeCover);
  const welcomeCrops = useSettings((st) => st.welcomeCrops);
  const coverFiles = useWelcome((st) => st.covers);
  const set = useSettings((st) => st.set);
  const media = useWelcome((st) => st.media);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // Which cover the preview dialog is showing (null = closed).
  const [previewId, setPreviewId] = useState<string | null>(null);

  const covers = [
    { id: "classic", name: "Classic", url: null as string | null },
    ...BUILT_IN_COVERS,
  ];
  const previewIdx = covers.findIndex((c) => c.id === previewId);
  const preview = previewIdx >= 0 ? covers[previewIdx] : null;

  const onFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const saved = await saveWelcomeMedia(file);
      // Uploading is the host saying they want it — switching it on for them
      // saves the "why isn't it showing?" round trip.
      set("welcomeCustom", true);
      onToast(`${saved.kind === "gif" ? "GIF" : "Image"} set as the home page`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Couldn't save that file");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Section
      emoji="🏠"
      title="Home page"
      note="Replace the Mad Shots welcome screen with your own image or GIF. Nothing else in the booth changes."
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/gif,image/png,image/jpeg,image/webp,image/*"
        hidden
        onChange={(e) => onFile(e.target.files)}
      />

      <div>
        <div className="mb-2 text-sm font-semibold text-cocoa">Home page</div>
        <div className="flex flex-wrap gap-3">
          {covers.map((c) => {
            const active = !welcomeCustom && welcomeCover === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={active}
                onClick={() => setPreviewId(c.id)}
                className="relative w-[68px] text-center"
              >
                <div
                  className={cn(
                    "relative flex h-24 w-[68px] items-center justify-center overflow-hidden rounded-xl bg-cocoa/5 transition-all",
                    active
                      ? "scale-105 border-[3px] border-[rgb(var(--brand-a))] shadow-bloom ring-2 ring-[rgb(var(--brand-a))]/30 ring-offset-2 ring-offset-white/40"
                      : "border-2 border-cocoa/10 opacity-80",
                  )}
                >
                  {c.url ? (
                    <img
                      src={coverFiles[c.id]?.url ?? c.url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] font-extrabold leading-tight tracking-tight text-cocoa">
                      MAD
                      <br />
                      SHOTS
                    </span>
                  )}
                </div>
                {active && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full brand-fill text-[11px] font-bold text-white shadow ring-2 ring-white">
                    ✓
                  </span>
                )}
                <div
                  className={cn(
                    "mt-1.5 text-xs",
                    active ? "font-extrabold text-cocoa" : "text-cocoa/60",
                  )}
                >
                  {c.id === "classic" ? "Classic" : c.name}
                </div>
                {active && (
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--brand-a))]">
                    In use
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {preview &&
        createPortal(
          <CoverPreview
            cover={preview}
            crop={validCrop(welcomeCrops[preview.id])}
            hasFile={!!coverFiles[preview.id]}
            inUse={!welcomeCustom && welcomeCover === preview.id}
            showPrompt={welcomePrompt}
            onPrev={() =>
              setPreviewId(covers[(previewIdx - 1 + covers.length) % covers.length].id)
            }
            onNext={() => setPreviewId(covers[(previewIdx + 1) % covers.length].id)}
            onClose={() => setPreviewId(null)}
            onUse={async (crop) => {
              try {
                const original = builtInCover(preview.id);
                const saved = validCrop(welcomeCrops[preview.id]);
                const same = JSON.stringify(crop) === JSON.stringify(saved);
                if (!crop) {
                  await clearCoverOverride(preview.id);
                } else if (original && !(same && coverFiles[preview.id])) {
                  // Always cut from the original, never from an earlier crop.
                  await saveCoverOverride(preview.id, await cropGif(original.url, crop));
                }
                const { [preview.id]: _old, ...rest } = welcomeCrops;
                set("welcomeCrops", crop ? { ...rest, [preview.id]: crop } : rest);
                set("welcomeCover", preview.id);
                set("welcomeCustom", false);
                setPreviewId(null);
                onToast(`${preview.name} is now the home page`);
              } catch (err) {
                onToast(err instanceof Error ? err.message : "Couldn't crop that cover");
              }
            }}
          />,
          document.body,
        )}

      <Row
        label="Use my artwork"
        hint={
          !media
            ? "Upload an image or GIF below, then switch this on."
            : welcomeCustom
              ? "On — guests see your artwork instead of the Mad Shots screen."
              : "Off — guests see the home page chosen above. Your upload is kept."
        }
      >
        <Toggle
          label="Use my artwork"
          checked={welcomeCustom}
          onChange={(v) => {
            // Nothing to switch to: refuse rather than blank the attract screen.
            if (v && !media) {
              onToast("Upload an image or GIF first");
              return;
            }
            set("welcomeCustom", v);
          }}
        />
      </Row>

      {media ? (
        <div className="flex items-center gap-3">
          <div className="h-24 w-[68px] shrink-0 overflow-hidden rounded-xl border border-cocoa/10 bg-cocoa/5">
            <img src={media.url} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-cocoa">
              {media.name}
            </div>
            <div className="text-xs text-cocoa/50">
              {media.kind === "gif" ? "GIF" : "Image"} ·{" "}
              {(media.bytes / 1_000_000).toFixed(1)} MB
            </div>
            {media.bytes > LARGE_ARTWORK_BYTES && (
              <p className="mt-1 text-xs leading-snug text-amber-700">
                Large files can stutter on a slower tablet — worth watching it
                loop once before the event.
              </p>
            )}
            <div className="mt-2 flex gap-2">
              <SmallButton onClick={() => inputRef.current?.click()}>
                {busy ? "Saving…" : "Replace"}
              </SmallButton>
              <SmallButton
                tone="danger"
                onClick={async () => {
                  await clearWelcomeMedia();
                  set("welcomeCustom", false);
                  onToast("Artwork removed");
                }}
              >
                Remove
              </SmallButton>
            </div>
          </div>
        </div>
      ) : (
        <Row
          label="No artwork uploaded"
          hint="Portrait works best — 1080 × 1560. Anything else is centre-cropped to fill."
        >
          <SmallButton tone="brand" onClick={() => inputRef.current?.click()}>
            {busy ? "Saving…" : "Upload"}
          </SmallButton>
        </Row>
      )}

      <Row
        label="Keep the “touch to begin” prompt"
        hint="Turn off only if your artwork already tells guests to tap."
      >
        <Toggle
          label="Keep the touch to begin prompt"
          checked={welcomePrompt}
          onChange={(v) => set("welcomePrompt", v)}
        />
      </Row>
    </Section>
  );
}

/**
 * Which of the guest's own choices this booth offers.
 *
 * Every switch here hides a *choice*, never the result: with the shape picker
 * off the receipt still has a photo shape, it's just the built-in default. When
 * switching one off leaves a screen with nothing on it, the flow skips that
 * screen — which is why the summary line below is worth showing: it's the only
 * place the host can see what's actually left.
 */
function GuestStepsSection() {
  const s = useSettings();
  const set = useSettings((st) => st.set);
  const steps = useFlowSteps();
  const guestCatsSaved = useSettings((st) => st.guestOverlayCategories);
  const guestCats = guestOverlayCats();
  const toggleCat = (c: OverlayCategory) => {
    const on = guestCats.includes(c);
    if (on && guestCats.length === 1) return; // always keep one family
    set(
      "guestOverlayCategories",
      OVERLAY_CATEGORIES.filter((x) => (x === c ? !on : guestCats.includes(x))),
    );
  };
  void guestCatsSaved;

  return (
    <Section
      emoji="🎛️"
      title="Guest steps"
      note="Turn one off and guests skip it — they get the booth's default instead of a choice."
    >
      <Row
        label="Photo shape"
        hint="The rounded / circle / heart row on the Frames screen."
      >
        <Toggle
          label="Photo shape"
          checked={s.photoShapeEnabled}
          onChange={(v) => set("photoShapeEnabled", v)}
        />
      </Row>
      <Row
        label="Frame design"
        hint="The colour and pattern swatches on the Frames screen."
      >
        <Toggle
          label="Frame design"
          checked={s.frameStyleEnabled}
          onChange={(v) => set("frameStyleEnabled", v)}
        />
      </Row>
      <Row
        label="Filters"
        hint="The whole “Set the mood” screen — reel, intensity and smooth skin."
      >
        <Toggle
          label="Filters"
          checked={s.filtersEnabled}
          onChange={(v) => set("filtersEnabled", v)}
        />
      </Row>
      <Row
        label="Overlays guests can pick"
        hint="Choose which families show on the guests' Overlay row — e.g. add Christmas for the season."
        stacked
      >
        <div className="flex flex-wrap gap-2">
          {OVERLAY_CATEGORIES.map((c) => {
            const on = guestCats.includes(c);
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                onClick={() => toggleCat(c)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  on
                    ? "border-transparent brand-fill text-white"
                    : "border-cocoa/15 bg-white/60 text-cocoa/60",
                )}
              >
                {c}
              </button>
            );
          })}
        </div>
      </Row>
      <Row
        label="Filter intensity"
        hint="The intensity slider on the filter screen. Off = full strength."
      >
        <Toggle
          label="Filter intensity"
          checked={s.intensityEnabled}
          onChange={(v) => set("intensityEnabled", v)}
        />
      </Row>
      <Row
        label="Smooth skin"
        hint="The smooth-skin switch on the filter screen. Off = no smoothing."
      >
        <Toggle
          label="Smooth skin"
          checked={s.beautyEnabled}
          onChange={(v) => set("beautyEnabled", v)}
        />
      </Row>
      <Row
        label="Stickers"
        hint="The “Decorate” screen, where guests add stickers and text."
      >
        <Toggle
          label="Stickers"
          checked={s.stickersEnabled}
          onChange={(v) => set("stickersEnabled", v)}
        />
      </Row>

      <p className="rounded-xl bg-cocoa/5 px-3 py-2 text-xs leading-snug text-cocoa/60">
        Guests now see:{" "}
        <span className="font-semibold text-cocoa">
          {steps.map((st) => st.label).join(" → ")}
        </span>
      </p>
      <p className="text-xs leading-snug text-cocoa/50">
        The frame-overlay picker has its own switch in the event's design, under
        Events.
      </p>
    </Section>
  );
}

function CustomStickersSection({ onToast }: { onToast: (msg: string) => void }) {
  const stickers = useSettings((st) => st.customStickers);
  const stickersEnabled = useSettings((st) => st.stickersEnabled);
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

      {!stickersEnabled && (
        <p className="rounded-xl bg-cocoa/5 px-3 py-2 text-xs leading-snug text-cocoa/60">
          The Decorate step is switched off in Guest steps, so nobody sees these
          yet. Uploads are kept — turn stickers back on to offer them.
        </p>
      )}

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
function CustomerPreviewSection() {
  const theme = useSession((st) => st.theme);
  // Subscribe to everything that changes the look so the preview stays live.
  const designMode = useSettings((st) => st.designMode);
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

  // A designed template replaces the receipt preview entirely.
  const activeTemplate =
    designMode === "template"
      ? templates.find((t) => t.id === eventTemplateId)
      : undefined;

  const layout = startingLayout();
  const overlayId = startingOverlay();
  const activeCat: OverlayCategory =
    designMode === "overlay" ? eventType : "Classic";
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
          {designMode === "overlay" && overlayId === "none" && (
            <p className="text-center text-xs text-amber-600">
              Pick an “Applied to every guest” frame in the event's design so
              guests get the overlay.
            </p>
          )}
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

function EventTemplateSection({
  eventId,
  onToast,
}: {
  eventId: string;
  onToast: (msg: string) => void;
}) {
  const eventTemplateId = useSettings((st) => st.eventTemplateId);
  const set = useSettings((st) => st.set);
  const allTemplates = useTemplates((st) => st.templates);
  const addTemplate = useTemplates((st) => st.addTemplate);
  const updateTemplate = useTemplates((st) => st.updateTemplate);
  const removeTemplate = useTemplates((st) => st.removeTemplate);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Templates are event-specific — only this event's are shown or selectable.
  const templates = allTemplates.filter((t) => t.eventId === eventId);
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
      const id = addTemplate({
        eventId,
        name,
        image: url,
        aspect,
        slots: [],
        brandSlot: { ...DEFAULT_BRAND_SLOT },
        qrSlot: { ...DEFAULT_QR_SLOT },
      });
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
      note="Upload your finished landscape design, then drag boxes onto the photo slots. The MAD SHOTS + QR boxes are always included; drag them anywhere. Box count = number of shots."
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
                      brandSlot={t.brandSlot}
                      qrSlot={t.qrSlot}
                      onChange={(patch) => updateTemplate(t.id, patch)}
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

// Custom frame uploads are retired from the UI — designed templates cover
// events and the built-in overlays cover normal booths. Flip to re-enable.
const ALLOW_FRAME_UPLOAD = false;

function FrameOverlaySection({ onToast }: { onToast: (msg: string) => void }) {
  const customFrames = useSettings((st) => st.customFrames);
  const defaultOverlayId = useSettings((st) => st.defaultOverlayId);
  const guestCanChangeOverlay = useSettings((st) => st.guestCanChangeOverlay);
  const designMode = useSettings((st) => st.designMode);
  const eventType = useSettings((st) => st.eventType);
  const addCustomFrames = useSettings((st) => st.addCustomFrames);
  const removeCustomFrame = useSettings((st) => st.removeCustomFrame);
  const set = useSettings((st) => st.set);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const full = customFrames.length >= MAX_CUSTOM_FRAMES;
  const guestCats = guestOverlayCats();

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

  // Scoped to the event's overlay family, plus host uploads.
  const cats: OverlayCategory[] =
    designMode === "overlay" ? [eventType] : guestCats;
  const options: { id: string; name: string; thumb: string | null }[] = [
    { id: "none", name: "None", thumb: null },
    ...cats.flatMap((cat) =>
      overlaysInCategory(cat).map((o) => ({
        id: o.id,
        name: o.name,
        thumb: o.svg!(1, { accent: ACCENT_BY_CATEGORY[cat] }),
      })),
    ),
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
      note="Pick an overlay to apply to every guest, and hide the picker so guests can't change it."
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/webp,image/*"
        multiple
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />

      {/* Custom frame uploads are hidden (see ALLOW_FRAME_UPLOAD). */}
      {ALLOW_FRAME_UPLOAD && (
        <>
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
        </>
      )}

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

function StatusSection({ onToast }: { onToast: (msg: string) => void }) {
  const online = useOnlineStatus();
  const pending = useUploadQueue((s) => s.pending);
  const uploadsOn = useSettings((st) => st.cloudUploadEnabled);

  return (
    <Section
      emoji="🩺"
      title="Status"
      note="Photos that can't upload (dropped wifi) are queued and retried automatically."
    >
      <StatusRow label="Network" value={online ? "Online" : "Offline"} ok={online} />
      <StatusRow
        label="Cloud delivery"
        value={
          !DeliveryService.isConfigured
            ? "Not configured"
            : uploadsOn
              ? "Connected"
              : "Switched off (dev)"
        }
        ok={DeliveryService.isConfigured && uploadsOn}
      />
      <Row
        label="Pending uploads"
        hint={pending > 0 ? "Waiting to sync — will retry on reconnect." : "All photos delivered."}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "font-mono text-sm font-bold",
              pending > 0 ? "text-amber-600" : "text-emerald-600",
            )}
          >
            {pending}
          </span>
          {pending > 0 && (
            <SmallButton
              tone="brand"
              onClick={() => {
                drainUploadQueue();
                onToast(online ? "Retrying uploads…" : "Still offline — will retry when back");
              }}
            >
              Retry now
            </SmallButton>
          )}
        </div>
      </Row>
      <StatusRow
        label="Keep-awake support"
        value={wakeLockSupported() ? "Available" : "Not on this browser"}
        ok={wakeLockSupported()}
      />
      <StatusRow label="Version" value={APP_VERSION} ok />
    </Section>
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
