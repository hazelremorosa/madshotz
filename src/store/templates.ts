import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { EventTemplate, LayoutDef, TemplateSlot } from "@/types";
import { useSettings } from "@/store/settings";
import { cloudList, cloudPut, cloudRemove } from "@/lib/cloudStore";

/**
 * Host-uploaded designed event templates (wedding cards, etc.). They carry large
 * images, so they live in their OWN localStorage key — never the main settings
 * blob — and writes are quota-guarded (a full tray just stops persisting rather
 * than throwing and corrupting the live config).
 */

export const TEMPLATES_KEY = "madshots.templates.v1";
export const MAX_TEMPLATES = 8;

/** Default positions for the branding + QR (fractions of the design). */
export const DEFAULT_BRAND_SLOT: TemplateSlot = { x: 0.03, y: 0.03, w: 0.24, h: 0.09 };
export const DEFAULT_QR_SLOT: TemplateSlot = { x: 0.85, y: 0.82, w: 0.12, h: 0.16 };

let seq = 0;
function templateId(): string {
  seq += 1;
  return `tpl_${Date.now().toString(36)}_${seq}`;
}

// Templates change on every slot drag, so debounce the (large) cloud writes.
const syncTimers = new Map<string, ReturnType<typeof setTimeout>>();
function scheduleCloudSync(id: string) {
  const prev = syncTimers.get(id);
  if (prev) clearTimeout(prev);
  syncTimers.set(
    id,
    setTimeout(() => {
      syncTimers.delete(id);
      const t = useTemplates.getState().templates.find((x) => x.id === id);
      if (t) void cloudPut("templates", id, t);
    }, 800),
  );
}

// Swallows QuotaExceededError so a too-big tray degrades gracefully.
const guardedStorage = {
  getItem: (name: string) => localStorage.getItem(name),
  setItem: (name: string, value: string) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      /* out of space — keep the in-memory state, just don't persist */
    }
  },
  removeItem: (name: string) => localStorage.removeItem(name),
};

interface TemplatesState {
  templates: EventTemplate[];
  /** Adds a template (newest first, capped) and returns its new id. */
  addTemplate: (t: Omit<EventTemplate, "id">) => string;
  updateTemplate: (id: string, patch: Partial<Omit<EventTemplate, "id">>) => void;
  setSlots: (id: string, slots: TemplateSlot[]) => void;
  removeTemplate: (id: string) => void;
  /** Drops every template belonging to an event (used when the event is deleted). */
  removeTemplatesForEvent: (eventId: string) => void;
}

export const useTemplates = create<TemplatesState>()(
  persist(
    (set) => ({
      templates: [],
      addTemplate: (t) => {
        const id = templateId();
        const rec = { ...t, id };
        set((s) => ({ templates: [rec, ...s.templates].slice(0, MAX_TEMPLATES) }));
        void cloudPut("templates", id, rec);
        return id;
      },
      updateTemplate: (id, patch) => {
        set((s) => ({
          templates: s.templates.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        }));
        scheduleCloudSync(id);
      },
      setSlots: (id, slots) => {
        set((s) => ({
          templates: s.templates.map((x) => (x.id === id ? { ...x, slots } : x)),
        }));
        scheduleCloudSync(id);
      },
      removeTemplate: (id) => {
        set((s) => ({ templates: s.templates.filter((x) => x.id !== id) }));
        void cloudRemove("templates", id);
      },
      removeTemplatesForEvent: (eventId) =>
        set((s) => {
          const doomed = s.templates.filter((x) => x.eventId === eventId);
          doomed.forEach((t) => void cloudRemove("templates", t.id));
          return { templates: s.templates.filter((x) => x.eventId !== eventId) };
        }),
    }),
    { name: TEMPLATES_KEY, storage: createJSONStorage(() => guardedStorage) },
  ),
);

/** Pulls all templates from the cloud into the store (cloud wins). */
export async function hydrateTemplates(): Promise<void> {
  const cloud = await cloudList<EventTemplate>("templates");
  if (cloud) useTemplates.setState({ templates: cloud });
}

/** Look up a template by id (safe outside React). */
export function templateById(
  id: string | null | undefined,
): EventTemplate | undefined {
  if (!id) return undefined;
  return useTemplates.getState().templates.find((t) => t.id === id);
}

/** Templates belonging to a given event. */
export function templatesForEvent(eventId: string): EventTemplate[] {
  return useTemplates.getState().templates.filter((t) => t.eventId === eventId);
}

/**
 * The designed template driving the current session, or undefined. Only an
 * event booth with an active template that actually has photo slots counts —
 * that's what flips the guest flow from "receipt" to "designed template".
 */
export function activeTemplate(): EventTemplate | undefined {
  const s = useSettings.getState();
  if (s.designMode !== "template") return undefined;
  const t = templateById(s.eventTemplateId);
  return t && t.slots.length > 0 ? t : undefined;
}

/** True when the session should use the designed-template flow. */
export function isTemplateMode(): boolean {
  return activeTemplate() !== undefined;
}

/**
 * A stand-in layout so the rest of the session (shot count, capture tray) works
 * unchanged in template mode. Only `shots` matters here; the receipt geometry is
 * never rendered because the template composite replaces it.
 */
export function templateLayout(t: EventTemplate): LayoutDef {
  return {
    id: "template",
    name: t.name,
    shots: t.slots.length,
    kind: "row",
    frameAspect: 1,
    paperAspect: t.aspect,
  };
}
