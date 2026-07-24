import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Rgb, Theme } from "@/types";
import { LAYOUTS, DEFAULT_LAYOUT } from "@/data/layouts";
import { FILTERS } from "@/data/filters";
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

/** Optional brand palettes the host can pick — "default" keeps the cute theme. */
export interface BrandPreset {
  id: string;
  name: string;
  brand: [Rgb, Rgb, Rgb];
}

export const BRAND_PRESETS: BrandPreset[] = [
  { id: "default", name: "Cute", brand: ["255 122 173", "178 148 255", "122 224 196"] },
  { id: "wedding", name: "Wedding", brand: ["244 194 194", "212 175 140", "247 231 206"] },
  { id: "birthday", name: "Birthday", brand: ["255 99 132", "255 159 64", "255 205 86"] },
  { id: "corporate", name: "Corporate", brand: ["59 130 246", "14 165 233", "148 163 184"] },
  { id: "retro", name: "Retro", brand: ["255 0 170", "0 234 255", "170 0 255"] },
  { id: "mono", name: "Minimal", brand: ["148 163 184", "100 116 139", "203 213 225"] },
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
 * The event/"look" slice of settings — everything that makes one event feel
 * different from another. Snapshotted into saved presets and applied by booth
 * modes. Deliberately excludes booth *hardware/security* (PIN, camera, mirror,
 * kiosk) so loading someone else's event config never breaks this kiosk's rig.
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
  boothType: "normal" | "event";
  eventType: OverlayCategory;
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
  /** "normal" = plain receipt booth (Classic overlays only); "event" = themed. */
  boothType: "normal" | "event";
  /** Which event the booth is set up for (used when boothType === "event"). */
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

  boothType: "normal" as "normal" | "event",
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
          "boothType",
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
  return s.boothType === "event" ? s.eventType : "Classic";
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
    boothType: s.boothType,
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
