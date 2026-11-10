import { create } from "zustand";
import type {
  CapturedPhoto,
  LayoutDef,
  PhotoShape,
  PlacedItem,
  ScreenId,
  Theme,
} from "@/types";
import { builtInCover } from "@/assets/covers";
import { DEFAULT_THEME } from "@/data/themes";
import { DEFAULT_FRAME_STYLE, DEFAULT_PHOTO_SHAPE } from "@/data/frames";
import {
  applyPalette,
  copyLimits,
  startingLayout,
  startingOverlay,
  useSettings,
} from "@/store/settings";

/** Paints the brand hues — the host's Admin palette wins over the theme's. */
function applyBrand(theme: Theme) {
  applyPalette(theme);
}

function makeCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++)
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export interface SessionState {
  screen: ScreenId;
  /** +1 forward, -1 back — drives directional transitions. */
  direction: number;

  theme: Theme;
  layout: LayoutDef;
  filterId: string;
  /** Filter strength, 0..1 (1 = filter as authored). */
  filterIntensity: number;
  /** Subtle skin-smoothing layered on top of the chosen filter. */
  beautyOn: boolean;
  frameStyleId: string;
  photoShape: PhotoShape;
  /** Decorative frame overlay laid over the whole receipt ("none" = off). */
  overlayId: string;
  /** Copies this guest picked; 0 = not chosen yet (use the host default). */
  copies: number;

  photos: CapturedPhoto[];
  /** When retaking one frame, the index being replaced. */
  retakeIndex: number | null;

  items: PlacedItem[];
  selectedItemId: string | null;

  /** Rendered composite PNG data URL (produced on the Printing screen). */
  composite: string | null;

  soundOn: boolean;
  sessionCode: string;

  go: (screen: ScreenId, direction?: number) => void;
  setTheme: (theme: Theme) => void;
  setLayout: (layout: LayoutDef) => void;
  setFilter: (id: string) => void;
  setFilterIntensity: (intensity: number) => void;
  toggleBeauty: () => void;
  setFrameStyle: (id: string) => void;
  setPhotoShape: (shape: PhotoShape) => void;
  setOverlay: (id: string) => void;
  /** Copies the guest asked for (clamped to the host's limits). */
  setCopies: (n: number) => void;

  addPhoto: (dataUrl: string) => void;
  beginRetake: (index: number) => void;

  addItem: (item: Omit<PlacedItem, "id" | "z">) => void;
  updateItem: (id: string, patch: Partial<PlacedItem>) => void;
  removeItem: (id: string) => void;
  selectItem: (id: string | null) => void;
  clearItems: () => void;

  setComposite: (dataUrl: string | null) => void;

  toggleSound: () => void;
  reset: () => void;
}

/**
 * With a cover selected, open straight onto it. The logo splash looks like the
 * classic home page, so showing it first made the classic screen peek out on
 * every refresh. Classic itself keeps the splash.
 */
function startScreen(): ScreenId {
  const { welcomeCustom, welcomeCover } = useSettings.getState();
  return welcomeCustom || builtInCover(welcomeCover) ? "welcome" : "boot";
}

export const useSession = create<SessionState>((set, get) => ({
  screen: startScreen(),
  direction: 1,

  theme: DEFAULT_THEME,
  layout: startingLayout(),
  filterId: DEFAULT_THEME.defaultFilter,
  filterIntensity: 1,
  beautyOn: false,
  frameStyleId: DEFAULT_FRAME_STYLE.id,
  photoShape: DEFAULT_PHOTO_SHAPE,
  overlayId: startingOverlay(),
  copies: 0,

  photos: [],
  retakeIndex: null,

  items: [],
  selectedItemId: null,

  composite: null,

  // Sound starts wherever the host set it in Admin; guests can still toggle it.
  soundOn: useSettings.getState().soundOn,
  sessionCode: makeCode(),

  go: (screen, direction = 1) => set({ screen, direction }),

  setTheme: (theme) => {
    applyBrand(theme);
    set({ theme, filterId: theme.defaultFilter });
  },

  setLayout: (layout) => {
    // Changing the layout invalidates any captured frames.
    set({ layout, photos: [], retakeIndex: null, copies: 0 });
  },

  setFilter: (id) => set({ filterId: id }),
  setFilterIntensity: (intensity) =>
    set({ filterIntensity: Math.max(0, Math.min(1, intensity)) }),
  toggleBeauty: () => set((s) => ({ beautyOn: !s.beautyOn })),
  setFrameStyle: (id) => set({ frameStyleId: id }),
  setPhotoShape: (shape) => set({ photoShape: shape }),
  setOverlay: (id) => set({ overlayId: id }),
  setCopies: (n) => {
    const { min, step, max } = copyLimits(get().layout.id);
    const snapped = Math.round(n / step) * step;
    set({ copies: Math.min(max, Math.max(min, snapped || min)) });
  },

  addPhoto: (dataUrl) => {
    const { photos, retakeIndex, layout } = get();
    if (retakeIndex !== null) {
      const next = photos.slice();
      next[retakeIndex] = { id: uid(), dataUrl };
      set({ photos: next, retakeIndex: null });
      return;
    }
    if (photos.length >= layout.shots) return;
    set({ photos: [...photos, { id: uid(), dataUrl }] });
  },

  beginRetake: (index) => set({ retakeIndex: index }),

  addItem: (item) => {
    const { items } = get();
    const z = items.reduce((m, i) => Math.max(m, i.z), 0) + 1;
    const id = uid();
    set({ items: [...items, { ...item, id, z }], selectedItemId: id });
  },

  updateItem: (id, patch) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    })),

  removeItem: (id) =>
    set((s) => ({
      items: s.items.filter((i) => i.id !== id),
      selectedItemId: s.selectedItemId === id ? null : s.selectedItemId,
    })),

  selectItem: (id) => set({ selectedItemId: id }),
  clearItems: () => set({ items: [], selectedItemId: null }),

  setComposite: (dataUrl) => set({ composite: dataUrl }),

  toggleSound: () => set((s) => ({ soundOn: !s.soundOn })),

  reset: () => {
    applyBrand(DEFAULT_THEME);
    set({
      screen: "welcome",
      direction: -1,
      theme: DEFAULT_THEME,
      layout: startingLayout(),
      filterId: DEFAULT_THEME.defaultFilter,
      filterIntensity: 1,
      beautyOn: false,
      frameStyleId: DEFAULT_FRAME_STYLE.id,
      photoShape: DEFAULT_PHOTO_SHAPE,
      overlayId: startingOverlay(),
      copies: 0,
      // Host settings (countdown, sound default, timings) live in the settings
      // store and are untouched by a session reset.
      soundOn: useSettings.getState().soundOn,
      photos: [],
      retakeIndex: null,
      items: [],
      selectedItemId: null,
      composite: null,
      sessionCode: makeCode(),
    });
  },
}));
