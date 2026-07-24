import type { EventPreset } from "@/store/settings";

/**
 * Saved event presets live in their OWN localStorage key — not the main zustand
 * settings blob — because a preset can carry the host's uploaded frames and
 * stickers, and we don't want that weight rewritten on every little settings
 * change (or risk corrupting the live config if it ever overflows the quota).
 * Saving is explicit and quota-guarded here.
 */

const PRESETS_KEY = "madshots.presets.v1";

export function loadPresets(): EventPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as EventPreset[]) : [];
  } catch {
    return [];
  }
}

export interface PersistResult {
  ok: boolean;
  error?: string;
}

/** Writes the preset list, surfacing a friendly message if storage is full. */
export function persistPresets(list: EventPreset[]): PersistResult {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(list));
    return { ok: true };
  } catch (e) {
    const quota =
      e instanceof DOMException &&
      (e.name === "QuotaExceededError" ||
        e.name === "NS_ERROR_DOM_QUOTA_REACHED");
    return {
      ok: false,
      error: quota
        ? "Not enough storage — delete a preset or trim uploaded frames/stickers."
        : "Couldn't save the preset.",
    };
  }
}
