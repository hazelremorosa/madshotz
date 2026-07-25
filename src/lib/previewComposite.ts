import type { CapturedPhoto } from "@/types";
import { composeReceipt } from "@/lib/compose";
import { composeTemplate } from "@/lib/composeTemplate";
import { formatDate } from "@/lib/date";
import { DEFAULT_FRAME_STYLE } from "@/data/frames";
import { resolveOverlaySrc } from "@/data/overlays";
import {
  overlayOpts,
  startingLayout,
  startingOverlay,
  useSettings,
} from "@/store/settings";
import { useSession } from "@/store/session";
import { useTemplates } from "@/store/templates";

/**
 * Building a representative composite without a guest present.
 *
 * Admin needs a real rendered composite — not a DOM approximation — to show what
 * the printer will actually burn, and the print settings have to be tunable
 * before anyone walks up to the booth.
 */

/** Neutral stand-in portrait: a warm gradient with a head-and-shoulders shape. */
export const PREVIEW_PHOTO =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='250'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#ffe3c2'/><stop offset='1' stop-color='#e6b89c'/></linearGradient></defs><rect width='200' height='250' fill='url(#g)'/><circle cx='100' cy='96' r='40' fill='#ffffffbb'/><ellipse cx='100' cy='215' rx='72' ry='58' fill='#ffffffbb'/></svg>`,
  );

/** `n` placeholder captures, matching whatever the layout or template needs. */
export function previewPhotos(n: number): CapturedPhoto[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `pv${i}`,
    dataUrl: PREVIEW_PHOTO,
  }));
}

/**
 * Renders the composite the current setup would produce, with placeholder
 * photos — the designed template if an event has one, else the receipt.
 *
 * Deliberately built from the same `composeReceipt`/`composeTemplate` the guest
 * flow uses, so the print preview can't drift from the real output.
 */
export async function buildPreviewComposite(): Promise<string> {
  const s = useSettings.getState();
  const theme = useSession.getState().theme;

  const template =
    s.designMode === "template"
      ? useTemplates.getState().templates.find((t) => t.id === s.eventTemplateId)
      : undefined;

  if (template && template.slots.length) {
    return composeTemplate({
      template,
      photos: previewPhotos(template.slots.length),
      filterCss: "none",
      code: "PREVIEW",
    });
  }

  const layout = startingLayout();
  return composeReceipt({
    photos: previewPhotos(layout.shots),
    layout,
    filterCss: "none",
    frameStyle: DEFAULT_FRAME_STYLE,
    shape: "rounded",
    items: [],
    theme,
    code: "PREVIEW",
    dateLabel: formatDate(),
    overlaySvg: resolveOverlaySrc(
      startingOverlay(),
      layout.paperAspect,
      s.customFrames,
      overlayOpts(),
    ),
    hideHeader: s.designMode !== "standard",
  });
}
