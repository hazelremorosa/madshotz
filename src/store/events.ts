import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { BoothConfig } from "@/store/settings";
import { useSettings } from "@/store/settings";

/**
 * Events are the unit administrators create, manage and launch. Each one bundles
 * a category/name/date with a full booth-config snapshot and a design choice
 * (a designed template or the frame-overlay system). Loading an event applies
 * its config to the live booth and marks it active — only one at a time.
 *
 * Events can carry uploaded assets, so they live in their OWN localStorage key
 * (never the settings blob) with a quota-guarded writer, like the templates.
 */

export const EVENTS_KEY = "madshots.events.v1";
export const MAX_EVENTS = 24;

export interface EventRecord {
  id: string;
  name: string;
  /** Display category (Wedding, Birthday, School Event, …). */
  category: string;
  /** Event date (yyyy-mm-dd or free text). */
  date: string;
  /** Design used by this event. */
  designMode: "template" | "overlay";
  /** Full booth config re-applied when the event is loaded. */
  config: BoothConfig;
}

let seq = 0;
function eventId(): string {
  seq += 1;
  return `ev_${Date.now().toString(36)}_${seq}`;
}

const guardedStorage = {
  getItem: (name: string) => localStorage.getItem(name),
  setItem: (name: string, value: string) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      /* out of space — keep in-memory state, just don't persist */
    }
  },
  removeItem: (name: string) => localStorage.removeItem(name),
};

interface EventsState {
  events: EventRecord[];
  /** Adds an event (newest first, capped) and returns its new id. */
  addEvent: (rec: Omit<EventRecord, "id">) => string;
  updateEvent: (id: string, patch: Partial<Omit<EventRecord, "id">>) => void;
  removeEvent: (id: string) => void;
}

export const useEvents = create<EventsState>()(
  persist(
    (set) => ({
      events: [],
      addEvent: (rec) => {
        const id = eventId();
        set((s) => ({ events: [{ ...rec, id }, ...s.events].slice(0, MAX_EVENTS) }));
        return id;
      },
      updateEvent: (id, patch) =>
        set((s) => ({
          events: s.events.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),
      removeEvent: (id) =>
        set((s) => ({ events: s.events.filter((e) => e.id !== id) })),
    }),
    { name: EVENTS_KEY, storage: createJSONStorage(() => guardedStorage) },
  ),
);

/** The currently loaded event, or undefined for the Standard Booth. */
export function activeEvent(): EventRecord | undefined {
  const id = useSettings.getState().activeEventId;
  if (!id) return undefined;
  return useEvents.getState().events.find((e) => e.id === id);
}

/** Loads an event: applies its config to the live booth and marks it active. */
export function loadEvent(rec: EventRecord) {
  const s = useSettings.getState();
  s.applyConfig(rec.config);
  s.set("activeEventId", rec.id);
  // applyConfig already sets designMode from the config; keep them in lockstep.
  s.set("designMode", rec.designMode);
}

/** Unloads any event — back to the plain Standard Booth. */
export function clearActiveEvent() {
  const s = useSettings.getState();
  s.set("activeEventId", null);
  s.set("designMode", "standard");
}

/**
 * Forces the live design to match the active event (Standard Booth if none).
 * Called at the start of a guest session so an abandoned Admin edit-draft can't
 * leak a non-standard design onto customers.
 */
export function reconcileDesignMode() {
  const s = useSettings.getState();
  const active = activeEvent();
  const want = active ? active.designMode : "standard";
  if (s.designMode !== want) s.set("designMode", want);
}
