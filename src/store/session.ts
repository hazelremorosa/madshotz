import { create } from "zustand";
import type {
  CapturedPhoto,
  LayoutDef,
  PhotoShape,
  PlacedItem,
  ScreenId,
  Theme,
} from "@/types";
import { DEFAULT_THEME } from "@/data/themes";
import { DEFAULT_LAYOUT } from "@/data/layouts";
import { DEFAULT_FRAME_STYLE } from "@/data/frames";

function applyBrand(theme: Theme) {
  const root = document.documentElement;
  root.style.setProperty("--brand-a", theme.brand[0]);
  root.style.setProperty("--brand-b", theme.brand[1]);
  root.style.setProperty("--brand-c", theme.brand[2]);
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
  frameStyleId: string;
  photoShape: PhotoShape;

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
  setFrameStyle: (id: string) => void;
  setPhotoShape: (shape: PhotoShape) => void;

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

export const useSession = create<SessionState>((set, get) => ({
  screen: "boot",
  direction: 1,

  theme: DEFAULT_THEME,
  layout: DEFAULT_LAYOUT,
  filterId: DEFAULT_THEME.defaultFilter,
  frameStyleId: DEFAULT_FRAME_STYLE.id,
  photoShape: "rounded",

  photos: [],
  retakeIndex: null,

  items: [],
  selectedItemId: null,

  composite: null,

  soundOn: false,
  sessionCode: makeCode(),

  go: (screen, direction = 1) => set({ screen, direction }),

  setTheme: (theme) => {
    applyBrand(theme);
    set({ theme, filterId: theme.defaultFilter });
  },

  setLayout: (layout) => {
    // Changing the layout invalidates any captured frames.
    set({ layout, photos: [], retakeIndex: null });
  },

  setFilter: (id) => set({ filterId: id }),
  setFrameStyle: (id) => set({ frameStyleId: id }),
  setPhotoShape: (shape) => set({ photoShape: shape }),

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
      layout: DEFAULT_LAYOUT,
      filterId: DEFAULT_THEME.defaultFilter,
      frameStyleId: DEFAULT_FRAME_STYLE.id,
      photoShape: "rounded",
      photos: [],
      retakeIndex: null,
      items: [],
      selectedItemId: null,
      composite: null,
      sessionCode: makeCode(),
    });
  },
}));

/** Ordered steps shown in the progress rail. */
export const FLOW_STEPS: { id: ScreenId; label: string }[] = [
  { id: "layout", label: "Layout" },
  { id: "capture", label: "Capture" },
  { id: "review", label: "Review" },
  { id: "frames", label: "Frames" },
  { id: "filter", label: "Filter" },
  { id: "editor", label: "Decorate" },
  { id: "preview", label: "Print" },
];
