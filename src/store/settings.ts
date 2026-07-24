import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Rgb, Theme } from "@/types";
import { LAYOUTS, DEFAULT_LAYOUT } from "@/data/layouts";
import { FILTERS } from "@/data/filters";

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

  // ── Branding ──────────────────────────────────────────────────────────────
  /** Receipt header wordmark. Empty → "MAD SHOTS". */
  eventName: string;
  /** Receipt footer line. Empty → "SCAN FOR YOUR PHOTOS ♥". */
  footerNote: string;
  brandPresetId: string;

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

  eventName: "",
  footerNote: "",
  brandPresetId: "default",

  soundOn: false,
  idleTimeoutSec: 90,
  qrResetSec: 25,

  kioskMode: false,
  keepAwake: true,
};

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
        return {
          ...current,
          ...saved,
          enabledLayoutIds: layouts.length ? layouts : DEFAULTS.enabledLayoutIds,
          enabledFilterIds: filters.length ? filters : DEFAULTS.enabledFilterIds,
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
