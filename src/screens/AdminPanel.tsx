import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  BRAND_PRESETS,
  COUNTDOWN_OPTIONS,
  IDLE_OPTIONS,
  MAX_CUSTOM_STICKERS,
  QR_RESET_OPTIONS,
  applyBrandVars,
  effectiveBrand,
  receiptFooter,
  receiptHeader,
  useSettings,
} from "@/store/settings";
import { fileToStickerUrl } from "@/lib/image";
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
          <CameraSection />

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

          <Section
            emoji="🏷️"
            title="Event branding"
            note="Printed on every receipt — on screen and in the downloaded photo."
          >
            <Row label="Header" stacked>
              <TextField
                value={s.eventName}
                onChange={(v) => set("eventName", v)}
                placeholder="MAD SHOTS"
                maxLength={22}
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
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.4em] text-paper-ink/60">
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
          urls.push(await fileToStickerUrl(file));
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
