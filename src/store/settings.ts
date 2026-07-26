import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Rgb, Theme } from "@/types";
import { LAYOUTS, DEFAULT_LAYOUT } from "@/data/layouts";
import { FILTERS } from "@/data/filters";
import {
  DITHER_DEFAULTS,
  type DitherMode,
  type PrintRotation,
} from "@/lib/dither";
import type { RawBtFormat } from "@/lib/rawbt";
import {
  ACCENT_BY_CATEGORY,
  isKnownOverlay,
  type OverlayCategory,
  type OverlayOpts,
} from "@/data/overlays";

/**
 * Booth settings — everything the host can change from the Admin panel without
 * touching code. Persisted to localStorage so a kiosk keeps its config across
 * reloads and power cycles.
 *
 * This is deliberately separate from `useSession` (which is per-guest state and
 * is wiped by `reset()`). Anything here survives a session; anything there does
 * not.
 */

export const SETTINGS_KEY = "madshots.settings.v1";

/**
 * Optional brand palettes the host can pick — "default" keeps the cute theme.
 *
 * Each carries a **stage** pair as well as the three accents. Accents alone
 * weren't enough: the background is `bg-cream`, so switching to, say, Ocean used
 * to leave the whole booth sitting on a pink wash. `stage[0]` is the page tone
 * and `stage[1]` a slightly deeper version used behind overlays like Admin.
 *
 * Every stage is kept very light on purpose — the `cocoa` body text and the
 * white-translucent `.glass` surfaces are shared by all palettes, so a dark
 * stage would need its own text and surface colours throughout.
 */
export interface BrandPreset {
  id: string;
  name: string;
  brand: [Rgb, Rgb, Rgb];
  /** [page, deeper] background tones. */
  stage: [Rgb, Rgb];
}

/** Stage tones for "default" — the original cute cream. */
export const DEFAULT_STAGE: [Rgb, Rgb] = ["255 246 251", "255 238 246"];

export const BRAND_PRESETS: BrandPreset[] = [
  {
    id: "default",
    name: "Cute",
    brand: ["255 122 173", "178 148 255", "122 224 196"],
    stage: DEFAULT_STAGE,
  },
  {
    id: "wedding",
    name: "Wedding",
    brand: ["244 194 194", "212 175 140", "247 231 206"],
    stage: ["255 248 244", "253 238 230"],
  },
  {
    id: "birthday",
    name: "Birthday",
    brand: ["255 99 132", "255 159 64", "255 205 86"],
    stage: ["255 250 242", "255 241 222"],
  },
  {
    id: "corporate",
    name: "Corporate",
    brand: ["59 130 246", "14 165 233", "148 163 184"],
    stage: ["245 249 255", "232 241 253"],
  },
  {
    id: "retro",
    name: "Retro",
    brand: ["255 0 170", "0 234 255", "170 0 255"],
    stage: ["253 244 255", "246 230 255"],
  },
  {
    id: "mono",
    name: "Minimal",
    brand: ["148 163 184", "100 116 139", "203 213 225"],
    stage: ["248 250 252", "238 242 247"],
  },
  {
    id: "tropical",
    name: "Tropical",
    brand: ["255 111 97", "0 191 165", "255 209 102"],
    stage: ["244 253 250", "227 247 240"],
  },
  {
    id: "lavender",
    name: "Lavender",
    brand: ["167 139 250", "129 140 248", "244 114 182"],
    stage: ["248 245 255", "236 228 255"],
  },
  {
    id: "sunset",
    name: "Sunset",
    brand: ["251 146 60", "244 63 94", "168 85 247"],
    stage: ["255 246 242", "255 231 221"],
  },
  {
    id: "ocean",
    name: "Ocean",
    brand: ["56 189 248", "45 212 191", "99 102 241"],
    stage: ["242 251 255", "221 241 251"],
  },
  {
    id: "botanical",
    name: "Botanical",
    brand: ["52 211 153", "132 204 22", "20 184 166"],
    stage: ["244 253 246", "227 248 233"],
  },
  {
    id: "gold",
    name: "Gold",
    brand: ["212 175 55", "196 164 132", "148 137 121"],
    stage: ["250 248 245", "240 235 228"],
  },
];

export const BRAND_PRESET_BY_ID = (id: string): BrandPreset =>
  BRAND_PRESETS.find((p) => p.id === id) ?? BRAND_PRESETS[0];

/** A host-uploaded sticker/prop — a small transparent PNG data URL. */
export interface CustomSticker {
  id: string;
  url: string;
}

/** How many custom stickers the host can keep (localStorage-friendly cap). */
export const MAX_CUSTOM_STICKERS = 16;

/** A host-uploaded frame overlay — a transparent PNG laid over the whole receipt. */
export interface CustomFrame {
  id: string;
  url: string;
}

/** Frame overlays are large, so keep the tray small for localStorage's sake. */
export const MAX_CUSTOM_FRAMES = 6;

/**
 * How the receipt/print is designed:
 * - "standard" — the plain Standard Booth receipt (no active event).
 * - "template" — the active event uses an uploaded designed template.
 * - "overlay"  — the active event uses the frame-overlay system.
 */
export type DesignMode = "standard" | "template" | "overlay";

/** Event categories the admin can pick, mapped to an overlay design family. */
export const EVENT_CATEGORIES: { id: string; overlay: OverlayCategory }[] = [
  { id: "Wedding", overlay: "Wedding" },
  { id: "Birthday", overlay: "Birthday" },
  { id: "Christening", overlay: "Christening" },
  { id: "Baby Shower", overlay: "Baby" },
  { id: "Anniversary", overlay: "Wedding" },
  { id: "School Event", overlay: "Classic" },
  { id: "Corporate Event", overlay: "Classic" },
  { id: "Other", overlay: "Classic" },
];

/** The overlay design family for an event category (Classic if unknown). */
export function overlayCategoryFor(category: string): OverlayCategory {
  return EVENT_CATEGORIES.find((c) => c.id === category)?.overlay ?? "Classic";
}

/**
 * The event/"look" slice of settings — everything that makes one event feel
 * different from another. Snapshotted into an event and re-applied when it's
 * loaded. Deliberately excludes booth *hardware/security* (PIN, camera, kiosk)
 * so loading an event never breaks this kiosk's rig.
 */
export interface BoothConfig {
  eventName: string;
  footerNote: string;
  brandPresetId: string;
  countdownLength: number;
  guestCanSetCountdown: boolean;
  flashFill: boolean;
  enabledLayoutIds: string[];
  defaultLayoutId: string;
  enabledFilterIds: string[];
  defaultOverlayId: string;
  guestCanChangeOverlay: boolean;
  customFrames: CustomFrame[];
  customStickers: CustomSticker[];
  soundOn: boolean;
  idleTimeoutSec: number;
  qrResetSec: number;
  designMode: DesignMode;
  eventType: OverlayCategory;
  eventCategory: string;
  eventDate: string;
  eventPhoto: string | null;
  eventTitle: string;
  eventSubtitle: string;
  eventTemplateId: string | null;
}

/** A host-saved, named event configuration ("Wedding of A&B"). */
export interface EventPreset {
  id: string;
  name: string;
  config: BoothConfig;
}

/** Cap on saved presets (they can carry uploaded assets, so keep it sane). */
export const MAX_PRESETS = 8;

/**
 * Which browser API talks to the printer.
 *
 * Declared here rather than in `lib/printer.ts` so the settings store stays a
 * leaf — the printer module reads settings, not the other way round.
 */
export type PrintTransport = "usb" | "bluetooth" | "rawbt" | "system";

export const PRINT_TRANSPORTS: { value: PrintTransport; label: string }[] = [
  { value: "usb", label: "USB" },
  { value: "bluetooth", label: "BLE" },
  { value: "rawbt", label: "RawBT" },
  { value: "system", label: "System" },
];

/**
 * Which command language the printer is listening in.
 *
 * The RW403B's self-test reports `PCL: ZPL or TSPL`, so both are viable and only
 * the hardware can say which actually produces paper — hence a setting rather
 * than a constant.
 */
export type PrinterLanguage = "tspl" | "zpl";

/**
 * How BLE writes are issued.
 *
 * "Without response" is far faster but only works if the peripheral genuinely
 * honours it — when it doesn't, the write is queued and never completes, which
 * surfaces as a timeout rather than an error. Only the hardware can say which it
 * wants, so this is a setting.
 */
export type BtWriteMode = "auto" | "response" | "noResponse";

export const BT_WRITE_MODES: { value: BtWriteMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "response", label: "With reply" },
  { value: "noResponse", label: "No reply" },
];

/**
 * Quarter-turn applied to the design before printing, or "auto" to let the
 * printer layer pick whichever orientation uses more of the label.
 */
export type PrintRotationSetting = PrintRotation | "auto";

export const PRINT_ROTATIONS: { value: PrintRotationSetting; label: string }[] =
  [
    { value: "auto", label: "Auto" },
    { value: 0, label: "0°" },
    { value: 90, label: "90°" },
    { value: 270, label: "270°" },
  ];

export const COUNTDOWN_OPTIONS = [3, 5, 10];
export const IDLE_OPTIONS = [45, 90, 180, 300];
export const QR_RESET_OPTIONS = [15, 25, 45, 90];

export interface SettingsState {
  /** Admin PIN — 4-8 digits. Checked by the PIN pad, never shown in plain view. */
  pin: string;

  // ── Camera ────────────────────────────────────────────────────────────────
  /** MediaDevices deviceId, or null for "system default (front camera)". */
  cameraDeviceId: string | null;
  /** Selfie mirror. Off for kiosks pointed at a mirror/external rig. */
  mirrorPreview: boolean;

  // ── Capture ───────────────────────────────────────────────────────────────
  countdownLength: number;
  /** Show the 3/5/10s picker to guests on the Capture screen. */
  guestCanSetCountdown: boolean;
  /** Flash the whole screen white just before the shot (fill light). */
  flashFill: boolean;

  // ── Flow ──────────────────────────────────────────────────────────────────
  enabledLayoutIds: string[];
  enabledFilterIds: string[];
  defaultLayoutId: string;

  // ── Frame overlay ─────────────────────────────────────────────────────────
  /** Host-uploaded PNG frame overlays, offered alongside the built-in ones. */
  customFrames: CustomFrame[];
  /** Overlay every session starts on — a built-in id, a custom frame id, or "none". */
  defaultOverlayId: string;
  /** Show the overlay picker to guests on the Frames screen. */
  guestCanChangeOverlay: boolean;

  // ── Event ─────────────────────────────────────────────────────────────────
  /** Current design: "standard" receipt, or a loaded event's "template"/"overlay". */
  designMode: DesignMode;
  /** The loaded event's id (in the events store), or null for the Standard Booth. */
  activeEventId: string | null;
  /** The loaded event's category label (Wedding, Birthday, …). */
  eventCategory: string;
  /** The loaded event's date (yyyy-mm-dd, free text ok). */
  eventDate: string;
  /** Overlay design family in force (derived from the category). */
  eventType: OverlayCategory;
  /** Feature photo (couple/celebrant) embedded by photo-template overlays. */
  eventPhoto: string | null;
  /** Title line on photo templates (e.g. "John & Jane"). Falls back to eventName. */
  eventTitle: string;
  /** Subtitle line on photo templates (e.g. a date or short message). */
  eventSubtitle: string;
  /** Active designed template (id in the templates store), or null for none. */
  eventTemplateId: string | null;

  // ── Branding ──────────────────────────────────────────────────────────────
  /** Receipt header wordmark. Empty → "MAD SHOTS". */
  eventName: string;
  /** Receipt footer line. Empty → "SCAN FOR YOUR PHOTOS ♥". */
  footerNote: string;
  brandPresetId: string;
  /** Host-uploaded PNG stickers/props, offered as a "Yours" pack in the editor. */
  customStickers: CustomSticker[];

  // ── Ops ───────────────────────────────────────────────────────────────────
  /** Sound state each new session starts with. */
  soundOn: boolean;
  idleTimeoutSec: number;
  qrResetSec: number;

  // ── Printer ───────────────────────────────────────────────────────────────
  /**
   * Printer config lives here, alongside camera and PIN, and is deliberately
   * absent from `BoothConfig`: loading somebody else's saved event must never
   * repoint this kiosk at hardware or a label size it hasn't got.
   */
  printEnabled: boolean;
  printTransport: PrintTransport;
  /** TSPL or ZPL — this printer accepts either. See `PrinterLanguage`. */
  printerLanguage: PrinterLanguage;
  /** Print without anyone tapping anything, as soon as the composite exists. */
  autoPrint: boolean;
  printCopies: number;
  /** Which `LABEL_PRESETS` entry is selected, or "custom". */
  labelPresetId: string;
  labelWidthMm: number;
  labelHeightMm: number;
  /** 0 for continuous stock — see `LabelStock.gapMm`. */
  labelGapMm: number;
  /** Unprinted border in mm, kept off the edges where feed drift shows. */
  printMarginMm: number;
  /** Burn intensity 0–15. */
  printDensity: number;
  /** Feed speed in ips, 1–6. */
  printSpeed: number;
  /**
   * "width" fills the stock width and lets a tall strip run past the label
   * (right for continuous roll); "label" fits the whole design on one label.
   */
  printFit: "width" | "label";
  /**
   * Turns the design before printing. Label stock can't be rotated — the width
   * is fixed across the head — so this is how a landscape event template gets to
   * use a whole portrait label instead of a band across the top.
   */
  printRotate: PrintRotationSetting;
  ditherMode: DitherMode;
  ditherThreshold: number;
  printBrightness: number;
  printContrast: number;
  /** TSPL's bit polarity. Flip if the first test print comes out as a negative. */
  printInvertRaster: boolean;

  // ── Printer pairing (remembered so the kiosk reconnects unattended) ───────
  usbVendorId: number | null;
  usbProductId: number | null;
  /**
   * Widen the USB chooser past class 7 — some printers report a vendor class.
   *
   * Leave OFF unless the printer genuinely doesn't appear: with the filter gone
   * the chooser also lists devices that are not printers at all, and those accept
   * a small write without complaint and never print anything.
   */
  usbAnyDevice: boolean;
  /**
   * Bytes per USB transfer. An oversized first write is the classic way to wedge
   * one of these printers — it stalls before anything is acknowledged.
   */
  usbChunkSize: number;
  /** Force a USB interface number, or -1 to auto-pick a printer-class one. */
  usbInterface: number;
  /** Force a bulk OUT endpoint number, or -1 to auto-pick. */
  usbEndpoint: number;
  btDeviceId: string | null;
  /** BLE write size. 20 is the safe floor; raise once the real MTU is known. */
  btChunkSize: number;
  /** Optional UUID overrides, for when the real hardware reveals its service. */
  btServiceUuid: string;
  btCharUuid: string;
  /** Which BLE write call to use — see `BtWriteMode`. */
  btWriteMode: BtWriteMode;

  // ── RawBT bridge ──────────────────────────────────────────────────────────
  /** Which `rawbt:` payload encoding to use — see `RawBtFormat`. */
  rawbtFormat: RawBtFormat;

  // ── Development ───────────────────────────────────────────────────────────
  /**
   * Uploads the finished composite to Cloudflare. Off is a **development**
   * switch: nothing reaches R2, nothing is queued for later, and the QR points
   * at a link that won't resolve until it's turned back on.
   *
   * Deliberately not in `BoothConfig` — loading an event must never be able to
   * silently stop a live booth delivering photos.
   */
  cloudUploadEnabled: boolean;

  // ── Kiosk ─────────────────────────────────────────────────────────────────
  kioskMode: boolean;
  keepAwake: boolean;

  /** NOT persisted — true while the admin panel overlay is open. */
  adminOpen: boolean;

  set: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  toggleLayout: (id: string) => void;
  toggleFilter: (id: string) => void;
  /** Appends uploaded stickers (newest first), clamped to MAX_CUSTOM_STICKERS. */
  addCustomStickers: (urls: string[]) => void;
  removeCustomSticker: (id: string) => void;
  /** Appends uploaded frame overlays (newest first), clamped to MAX_CUSTOM_FRAMES. */
  addCustomFrames: (urls: string[]) => void;
  removeCustomFrame: (id: string) => void;
  /** Applies an event config or booth-mode slice (sanitised against real ids). */
  applyConfig: (config: Partial<BoothConfig>) => void;
  setAdminOpen: (open: boolean) => void;
  resetAll: () => void;
}

const DEFAULTS = {
  pin: "1234",

  cameraDeviceId: null as string | null,
  mirrorPreview: true,

  countdownLength: 3,
  guestCanSetCountdown: true,
  flashFill: false,

  enabledLayoutIds: LAYOUTS.map((l) => l.id),
  enabledFilterIds: FILTERS.map((f) => f.id),
  defaultLayoutId: DEFAULT_LAYOUT.id,

  customFrames: [] as CustomFrame[],
  defaultOverlayId: "none",
  guestCanChangeOverlay: true,

  designMode: "standard" as DesignMode,
  activeEventId: null as string | null,
  eventCategory: "Wedding",
  eventDate: "",
  eventType: "Wedding" as OverlayCategory,
  eventPhoto: null as string | null,
  eventTitle: "",
  eventSubtitle: "",
  eventTemplateId: null as string | null,

  eventName: "",
  footerNote: "",
  brandPresetId: "default",
  customStickers: [] as CustomSticker[],

  soundOn: false,
  idleTimeoutSec: 90,
  qrResetSec: 25,

  // Printing starts OFF: a booth with no printer plugged in must behave exactly
  // as it did before this feature existed.
  printEnabled: false,
  printTransport: "usb" as PrintTransport,
  printerLanguage: "tspl" as PrinterLanguage,
  autoPrint: true,
  printCopies: 1,
  labelPresetId: "4x6",
  labelWidthMm: 101.6,
  labelHeightMm: 152.4,
  // 1 mm — what the RW403B's own self-test label reports for Munbyn 4x6 stock.
  labelGapMm: 1,
  printMarginMm: 2,
  printFit: "label" as "width" | "label",
  // Auto by default: the landscape event templates want a quarter-turn on
  // portrait stock and nothing else does, so this needs no host attention.
  printRotate: "auto" as PrintRotationSetting,
  printInvertRaster: true,

  // ── Fixed image calibration ───────────────────────────────────────────────
  // These five drive every print but have NO Admin controls right now
  // (`SHOW_CALIBRATION = false` in PrinterSection — owner's call, 2026-07-25).
  // They are the sensible baseline, not placeholders:
  //   density 8 / speed 4 — the conventional TSPL defaults this class of 203 dpi
  //     head ships with; safe on any stock and a sane starting point for tuning.
  //   Floyd–Steinberg — smoothest halftone for faces, which is what a photobooth
  //     prints; measured ~3.9% ink on the standard receipt, a healthy figure for
  //     mostly-bare paper.
  //   exposure 128 — the neutral cut point.
  //   brightness 0 — deliberately not positive; see DitherOpts.brightness, a
  //     positive bias here prints blank labels.
  // Restoring the controls needs only the flag flip; nothing here changes.
  printDensity: 8,
  printSpeed: 4,
  ditherMode: DITHER_DEFAULTS.mode,
  ditherThreshold: DITHER_DEFAULTS.threshold,
  printBrightness: DITHER_DEFAULTS.brightness,
  printContrast: DITHER_DEFAULTS.contrast,

  usbVendorId: null as number | null,
  usbProductId: null as number | null,
  usbAnyDevice: false,
  usbChunkSize: 4096,
  usbInterface: -1,
  usbEndpoint: -1,
  btDeviceId: null as string | null,
  btChunkSize: 20,
  btServiceUuid: "",
  btCharUuid: "",
  btWriteMode: "auto" as BtWriteMode,
  rawbtFormat: "base64Prefix" as RawBtFormat,

  // On by default: a booth that quietly stops delivering photos is the worst
  // possible failure, so this only ever goes off by an explicit decision.
  cloudUploadEnabled: true,

  kioskMode: false,
  keepAwake: true,
};

let uploadSeq = 0;
function uploadId(prefix: string): string {
  uploadSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${uploadSeq}`;
}

/** Flips a member of a "must keep at least one" list. */
function toggleIn(list: string[], id: string, all: string[]): string[] {
  const next = list.includes(id)
    ? list.filter((x) => x !== id)
    : [...list, id];
  if (!next.length) return list; // never let the host disable everything
  // Keep the canonical data order so the UI stays stable.
  return all.filter((x) => next.includes(x));
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,
      adminOpen: false,

      set: (key, value) => set({ [key]: value } as Partial<SettingsState>),

      toggleLayout: (id) =>
        set({
          enabledLayoutIds: toggleIn(
            get().enabledLayoutIds,
            id,
            LAYOUTS.map((l) => l.id),
          ),
        }),

      toggleFilter: (id) =>
        set({
          enabledFilterIds: toggleIn(
            get().enabledFilterIds,
            id,
            FILTERS.map((f) => f.id),
          ),
        }),

      addCustomStickers: (urls) =>
        set((state) => {
          const added = urls.map((url) => ({ id: uploadId("cs"), url }));
          // Newest first, and never past the cap (drops the oldest overflow).
          return {
            customStickers: [...added, ...state.customStickers].slice(
              0,
              MAX_CUSTOM_STICKERS,
            ),
          };
        }),

      removeCustomSticker: (id) =>
        set((state) => ({
          customStickers: state.customStickers.filter((s) => s.id !== id),
        })),

      addCustomFrames: (urls) =>
        set((state) => {
          const added = urls.map((url) => ({ id: uploadId("cf"), url }));
          return {
            customFrames: [...added, ...state.customFrames].slice(
              0,
              MAX_CUSTOM_FRAMES,
            ),
          };
        }),

      removeCustomFrame: (id) =>
        set((state) => ({
          customFrames: state.customFrames.filter((f) => f.id !== id),
          // Don't leave the "applied to every guest" default pointing at a
          // frame that no longer exists.
          defaultOverlayId:
            state.defaultOverlayId === id ? "none" : state.defaultOverlayId,
        })),

      applyConfig: (config) => {
        const state = get();
        const c = config;
        const patch: Record<string, unknown> = {};

        // Straightforward fields — copy only what the config actually specifies.
        const direct: (keyof BoothConfig)[] = [
          "eventName",
          "footerNote",
          "brandPresetId",
          "countdownLength",
          "guestCanSetCountdown",
          "flashFill",
          "guestCanChangeOverlay",
          "soundOn",
          "idleTimeoutSec",
          "qrResetSec",
          "customFrames",
          "customStickers",
          "designMode",
          "eventCategory",
          "eventDate",
          "eventType",
          "eventPhoto",
          "eventTitle",
          "eventSubtitle",
          "eventTemplateId",
        ];
        for (const k of direct) if (c[k] !== undefined) patch[k] = c[k];

        // Enabled layouts — drop unknown ids, never leave the list empty.
        let layouts = state.enabledLayoutIds;
        if (c.enabledLayoutIds !== undefined) {
          const valid = c.enabledLayoutIds.filter((id) =>
            LAYOUTS.some((l) => l.id === id),
          );
          layouts = valid.length
            ? LAYOUTS.filter((l) => valid.includes(l.id)).map((l) => l.id)
            : state.enabledLayoutIds;
          patch.enabledLayoutIds = layouts;
        }
        if (c.defaultLayoutId !== undefined) {
          patch.defaultLayoutId = layouts.includes(c.defaultLayoutId)
            ? c.defaultLayoutId
            : layouts[0];
        }

        // Enabled filters — same treatment.
        if (c.enabledFilterIds !== undefined) {
          const valid = c.enabledFilterIds.filter((id) =>
            FILTERS.some((f) => f.id === id),
          );
          patch.enabledFilterIds = valid.length
            ? FILTERS.filter((f) => valid.includes(f.id)).map((f) => f.id)
            : state.enabledFilterIds;
        }

        // Forced overlay — must resolve to a built-in or an uploaded frame that
        // this same config carries; otherwise fall back to "none".
        if (c.defaultOverlayId !== undefined) {
          const frames = c.customFrames ?? state.customFrames;
          patch.defaultOverlayId = isKnownOverlay(c.defaultOverlayId, frames)
            ? c.defaultOverlayId
            : "none";
        }

        set(patch as Partial<SettingsState>);
      },

      setAdminOpen: (adminOpen) => set({ adminOpen }),

      resetAll: () => set({ ...DEFAULTS }),
    }),
    {
      name: SETTINGS_KEY,
      storage: createJSONStorage(() => localStorage),
      // `adminOpen` is live UI state, never written to disk.
      partialize: ({ adminOpen: _adminOpen, ...rest }) => rest,
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<SettingsState>;
        // Drop ids that no longer exist in the data files (e.g. after an update).
        const layouts = (saved.enabledLayoutIds ?? DEFAULTS.enabledLayoutIds).filter(
          (id) => LAYOUTS.some((l) => l.id === id),
        );
        const filters = (saved.enabledFilterIds ?? DEFAULTS.enabledFilterIds).filter(
          (id) => FILTERS.some((f) => f.id === id),
        );
        // The forced overlay must still resolve to a real built-in or upload.
        const frames = saved.customFrames ?? DEFAULTS.customFrames;
        const savedDefaultOverlay = saved.defaultOverlayId ?? DEFAULTS.defaultOverlayId;
        const defaultOverlayId = isKnownOverlay(savedDefaultOverlay, frames)
          ? savedDefaultOverlay
          : "none";
        return {
          ...current,
          ...saved,
          enabledLayoutIds: layouts.length ? layouts : DEFAULTS.enabledLayoutIds,
          enabledFilterIds: filters.length ? filters : DEFAULTS.enabledFilterIds,
          defaultOverlayId,
          adminOpen: false,
        };
      },
    },
  ),
);

// ── Derived helpers (safe to call outside React) ─────────────────────────────

/** Layouts the host has enabled, in data order (never empty). */
export function enabledLayouts() {
  const ids = useSettings.getState().enabledLayoutIds;
  const list = LAYOUTS.filter((l) => ids.includes(l.id));
  return list.length ? list : LAYOUTS;
}

/** Filters the host has enabled, in data order (never empty). */
export function enabledFilters() {
  const ids = useSettings.getState().enabledFilterIds;
  const list = FILTERS.filter((f) => ids.includes(f.id));
  return list.length ? list : FILTERS;
}

/** The layout a new session starts on — the host's default, if still enabled. */
export function startingLayout() {
  const list = enabledLayouts();
  return (
    list.find((l) => l.id === useSettings.getState().defaultLayoutId) ?? list[0]
  );
}

/**
 * The frame overlay a new session starts on — the host's "applied to every
 * guest" default. Falls back to "none" if it points at a deleted upload.
 */
export function startingOverlay(): string {
  const st = useSettings.getState();
  const id = st.defaultOverlayId;
  return isKnownOverlay(id, st.customFrames) ? id : "none";
}

/** The overlay category the customer's picker is scoped to. */
export function activeOverlayCategory(): OverlayCategory {
  const s = useSettings.getState();
  return s.designMode === "overlay" ? s.eventType : "Classic";
}

/** Customization fed into photo-template overlays (photo + text + accent). */
export function overlayOpts(): OverlayOpts {
  const s = useSettings.getState();
  return {
    photo: s.eventPhoto,
    title: s.eventTitle.trim() || s.eventName.trim(),
    subtitle: s.eventSubtitle.trim(),
    accent: ACCENT_BY_CATEGORY[activeOverlayCategory()],
  };
}

/** Captures the current event/"look" config for saving as a preset. */
export function snapshotConfig(): BoothConfig {
  const s = useSettings.getState();
  return {
    eventName: s.eventName,
    footerNote: s.footerNote,
    brandPresetId: s.brandPresetId,
    countdownLength: s.countdownLength,
    guestCanSetCountdown: s.guestCanSetCountdown,
    flashFill: s.flashFill,
    enabledLayoutIds: [...s.enabledLayoutIds],
    defaultLayoutId: s.defaultLayoutId,
    enabledFilterIds: [...s.enabledFilterIds],
    defaultOverlayId: s.defaultOverlayId,
    guestCanChangeOverlay: s.guestCanChangeOverlay,
    customFrames: s.customFrames.map((f) => ({ ...f })),
    customStickers: s.customStickers.map((f) => ({ ...f })),
    soundOn: s.soundOn,
    idleTimeoutSec: s.idleTimeoutSec,
    qrResetSec: s.qrResetSec,
    designMode: s.designMode,
    eventCategory: s.eventCategory,
    eventDate: s.eventDate,
    eventType: s.eventType,
    eventPhoto: s.eventPhoto,
    eventTitle: s.eventTitle,
    eventSubtitle: s.eventSubtitle,
    eventTemplateId: s.eventTemplateId,
  };
}

/** The brand triplet in force: host palette override, else the theme's own. */
export function effectiveBrand(theme: Theme): [Rgb, Rgb, Rgb] {
  const id = useSettings.getState().brandPresetId;
  return id && id !== "default" ? BRAND_PRESET_BY_ID(id).brand : theme.brand;
}

/** Paints a brand triplet onto the CSS variables the whole UI reads. */
export function applyBrandVars(brand: [Rgb, Rgb, Rgb]) {
  const root = document.documentElement;
  root.style.setProperty("--brand-a", brand[0]);
  root.style.setProperty("--brand-b", brand[1]);
  root.style.setProperty("--brand-c", brand[2]);
}

/** Paints the stage (background) tones — `bg-cream` / `bg-cream-deep` / `body`. */
export function applyStageVars(stage: [Rgb, Rgb]) {
  const root = document.documentElement;
  root.style.setProperty("--stage", stage[0]);
  root.style.setProperty("--stage-deep", stage[1]);
}

/**
 * Paints a whole palette — accents *and* background.
 *
 * The single entry point for repainting, so no caller can update the accents and
 * leave the stage behind (which is exactly how the background ended up stuck on
 * pink). Pass `presetId` to preview a palette the host is only hovering over;
 * omit it to paint whatever is saved.
 *
 * "default" means "use the theme's own accents", and keeps the original cream
 * stage — themes carry brand colours but no background of their own.
 */
export function applyPalette(
  theme: Theme,
  presetId = useSettings.getState().brandPresetId,
) {
  const preset =
    presetId && presetId !== "default" ? BRAND_PRESET_BY_ID(presetId) : null;
  applyBrandVars(preset ? preset.brand : theme.brand);
  applyStageVars(preset ? preset.stage : DEFAULT_STAGE);
}

/**
 * Receipt header wordmark (host event name, else the house brand). Pass the
 * value from a `useSettings` selector inside React so it re-renders on change;
 * call it bare from plain code (e.g. the canvas compositor).
 */
export function receiptHeader(
  eventName = useSettings.getState().eventName,
): string {
  return eventName.trim().toUpperCase() || "MAD SHOTS";
}

/** Receipt footer line — same calling convention as `receiptHeader`. */
export function receiptFooter(
  footerNote = useSettings.getState().footerNote,
): string {
  return footerNote.trim().toUpperCase() || "SCAN FOR YOUR PHOTOS ♥";
}
