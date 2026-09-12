import { useMemo } from "react";
import type { ScreenId } from "@/types";
import { useSettings, type SettingsState } from "@/store/settings";
import { isTemplateMode } from "@/store/templates";

/**
 * The guest flow — which steps a session actually visits, in order.
 *
 * Two things shorten it:
 *  - a designed event template, which predetermines the layout, frame and
 *    decoration, so those steps have nothing left to ask;
 *  - the host's per-step toggles in Admin → Capture → Guest steps.
 *
 * Every screen navigates with `nextScreen`/`prevScreen` rather than naming its
 * neighbour, so a step that's switched off is skipped in both directions and
 * can never be reached by a Back button. This module is the only place that
 * knows the order.
 */

export interface FlowStep {
  id: ScreenId;
  label: string;
}

/** The full flow, before anything is switched off. */
const ALL_STEPS: FlowStep[] = [
  { id: "layout", label: "Layout" },
  { id: "capture", label: "Capture" },
  { id: "review", label: "Review" },
  { id: "frames", label: "Frames" },
  { id: "filter", label: "Filter" },
  { id: "editor", label: "Decorate" },
  { id: "preview", label: "Print" },
];

/** Which rows the Frames screen has left to show. */
export function framesRows(s: SettingsState) {
  return {
    // The overlay picker is a normal-booth thing: in event mode the overlay is
    // the host's event frame, so the guest doesn't choose one.
    overlay: s.guestCanChangeOverlay && s.designMode === "standard",
    shape: s.photoShapeEnabled,
    frame: s.frameStyleEnabled,
  };
}

/** True while the Frames screen still has at least one row worth showing. */
function framesHasRows(s: SettingsState): boolean {
  const rows = framesRows(s);
  return rows.overlay || rows.shape || rows.frame;
}

function isEnabled(step: ScreenId, s: SettingsState, template: boolean): boolean {
  switch (step) {
    // A template fixes the layout (and shot count) — see WelcomeScreen.
    case "layout":
      return !template;
    case "frames":
      return !template && framesHasRows(s);
    case "filter":
      return s.filtersEnabled;
    case "editor":
      return !template && s.stickersEnabled;
    default:
      return true;
  }
}

/** The steps this session visits, in order. Never empty. */
export function flowSteps(): FlowStep[] {
  const s = useSettings.getState();
  const template = isTemplateMode();
  return ALL_STEPS.filter((step) => isEnabled(step.id, s, template));
}

/**
 * Same list, as a hook — re-renders when the host flips a toggle in Admin.
 *
 * The selector returns a string so zustand's default equality check is enough;
 * returning the filtered array directly would make a new array every render.
 */
export function useFlowSteps(): FlowStep[] {
  const key = useSettings((s) =>
    [
      s.filtersEnabled,
      s.photoShapeEnabled,
      s.frameStyleEnabled,
      s.stickersEnabled,
      s.guestCanChangeOverlay,
      s.designMode,
      s.eventTemplateId,
    ].join("|"),
  );
  return useMemo(() => flowSteps(), [key]);
}

/**
 * The step after `from`, skipping everything switched off.
 *
 * Falls back to "preview" — the last step of every flow — so a screen that has
 * somehow been dropped from the list still leads somewhere sensible rather than
 * stranding the guest.
 */
export function nextScreen(from: ScreenId): ScreenId {
  const steps = flowSteps();
  const i = steps.findIndex((s) => s.id === from);
  if (i >= 0 && i < steps.length - 1) return steps[i + 1].id;
  return "preview";
}

/** The step before `from`, skipping everything switched off. */
export function prevScreen(from: ScreenId): ScreenId {
  const steps = flowSteps();
  const i = steps.findIndex((s) => s.id === from);
  if (i > 0) return steps[i - 1].id;
  return "welcome";
}

/** Human label for a step, for Back buttons that name their destination. */
export function stepLabel(id: ScreenId): string {
  return ALL_STEPS.find((s) => s.id === id)?.label ?? "Back";
}
