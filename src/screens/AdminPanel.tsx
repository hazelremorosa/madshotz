import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  BRAND_PRESETS,
  COUNTDOWN_OPTIONS,
  EVENT_CATEGORIES,
  IDLE_OPTIONS,
  MAX_CUSTOM_FRAMES,
  MAX_CUSTOM_STICKERS,
  QR_RESET_OPTIONS,
  applyBrandVars,
  effectiveBrand,
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
import { TemplateSlotEditor } from "@/components/admin/TemplateSlotEditor";
import { DateField } from "@/components/admin/DateField";
import { PrinterSection } from "@/components/admin/PrinterSection";
import { PREVIEW_PHOTO } from "@/lib/previewComposite";
import type { EventTemplate } from "@/types";
import {
  ACCENT_BY_CATEGORY,
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
          <SmallButton tone="brand" onClick={() => setConfirmClose(true)}>
            Done ✓
          </SmallButton>
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
            </>
          )}

          {tab === "system" && (
            <>
              <PaletteSection />

              <KioskSection onToast={toast} />

              <PrinterSection onToast={toast} />

          <Section
            emoji="🔐"
            title="Security"
            note="The PIN guards this panel. Five wrong tries locks it for 30 seconds."
          >
            <PinChanger onSaved={() => toast("PIN updated")} />
          </Section>

          <StatusSection onToast={toast} />

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
                  className="flex-1 rounded-full border border-cocoa/15 bg-white/70 py-3 text-sm font-bold text-cocoa"
                >
                  No, stay
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmClose(false);
                    onClose();
                  }}
                  className="flex-1 rounded-full brand-fill py-3 text-sm font-bold text-white shadow-bloom"
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
  const set = useSettings((st) => st.set);
  const theme = useSession((st) => st.theme);

  return (
    <Section emoji="🎨" title="Palette" note="Brand colours for the whole booth UI.">
      <div className="flex flex-wrap gap-2">
        {BRAND_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={brandPresetId === p.id}
            onClick={() => {
              set("brandPresetId", p.id);
              applyBrandVars(p.id === "default" ? theme.brand : p.brand);
            }}
            className={cn(
              "flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-semibold transition-colors",
              brandPresetId === p.id
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

  const repaint = () => applyBrandVars(effectiveBrand(theme));

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
  const cat: OverlayCategory = designMode === "overlay" ? eventType : "Classic";
  const opts = { accent: ACCENT_BY_CATEGORY[cat] };
  const options: { id: string; name: string; thumb: string | null }[] = [
    { id: "none", name: "None", thumb: null },
    ...overlaysInCategory(cat).map((o) => ({
      id: o.id,
      name: o.name,
      thumb: o.svg!(1, opts),
    })),
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

  return (
    <Section
      emoji="🩺"
      title="Status"
      note="Photos that can't upload (dropped wifi) are queued and retried automatically."
    >
      <StatusRow label="Network" value={online ? "Online" : "Offline"} ok={online} />
      <StatusRow
        label="Cloud delivery"
        value={DeliveryService.isConfigured ? "Connected" : "Not configured"}
        ok={DeliveryService.isConfigured}
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
