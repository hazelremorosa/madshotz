import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useSession } from "@/store/session";
import { useSettings } from "@/store/settings";
import { FILTER_BY_ID } from "@/data/filters";
import {
  FRAME_STYLES,
  FRAME_STYLE_BY_ID,
  PHOTO_SHAPES,
} from "@/data/frames";
import {
  ACCENT_BY_CATEGORY,
  OVERLAY_BY_ID,
  PHOTO_TEMPLATES,
  TEMPLATE_BY_ID,
  overlaysInCategory,
  resolveOverlaySrc,
  type OverlayCategory,
} from "@/data/overlays";
import { Receipt } from "@/components/Receipt";
import { ActionBar } from "@/components/shell/ActionBar";
import { CheckBadge } from "@/components/ui/CheckBadge";
import { formatDate } from "@/lib/date";
import { sfx } from "@/lib/sound";
import { cn } from "@/lib/cn";

export function FramesScreen() {
  const layout = useSession((s) => s.layout);
  const photos = useSession((s) => s.photos);
  const theme = useSession((s) => s.theme);
  const code = useSession((s) => s.sessionCode);
  const filterId = useSession((s) => s.filterId);
  const frameStyleId = useSession((s) => s.frameStyleId);
  const photoShape = useSession((s) => s.photoShape);
  const overlayId = useSession((s) => s.overlayId);
  const setFrameStyle = useSession((s) => s.setFrameStyle);
  const setPhotoShape = useSession((s) => s.setPhotoShape);
  const setOverlay = useSession((s) => s.setOverlay);
  const soundOn = useSession((s) => s.soundOn);
  const go = useSession((s) => s.go);

  // Host-uploaded frames + whether guests may change the overlay at all.
  const customFrames = useSettings((s) => s.customFrames);
  const guestCanChangeOverlay = useSettings((s) => s.guestCanChangeOverlay);

  // Booth type declared in Admin scopes which overlays the guest can see, and
  // the event photo/name/date feed the "photo template" frames.
  const boothType = useSettings((s) => s.boothType);
  const eventType = useSettings((s) => s.eventType);
  const eventPhoto = useSettings((s) => s.eventPhoto);
  const eventTitle = useSettings((s) => s.eventTitle);
  const eventSubtitle = useSettings((s) => s.eventSubtitle);
  const eventName = useSettings((s) => s.eventName);

  const [tab, setTab] = useState<"color" | "pattern">("color");
  const filterCss = FILTER_BY_ID(filterId).css;
  const frameBg = FRAME_STYLE_BY_ID(frameStyleId).bg;

  const activeCat: OverlayCategory =
    boothType === "event" ? eventType : "Classic";
  const overlayOpts = useMemo(
    () => ({
      photo: eventPhoto,
      title: eventTitle.trim() || eventName.trim(),
      subtitle: eventSubtitle.trim(),
      accent: ACCENT_BY_CATEGORY[activeCat],
    }),
    [eventPhoto, eventTitle, eventSubtitle, eventName, activeCat],
  );

  const frameOverlay = resolveOverlaySrc(
    overlayId,
    layout.paperAspect,
    customFrames,
    overlayOpts,
  );

  // Scoped to the declared booth: Classic for a normal booth, the event's own
  // frames + photo templates for an event. "None" leads; uploads trail.
  const overlayOptions = useMemo(() => {
    const builtInIds =
      boothType === "event"
        ? [
            ...overlaysInCategory(eventType).map((o) => o.id),
            ...PHOTO_TEMPLATES.map((t) => t.id),
          ]
        : overlaysInCategory("Classic").map((o) => o.id);
    const label = (id: string) => {
      const customIdx = customFrames.findIndex((f) => f.id === id);
      if (customIdx >= 0) return `Custom ${customIdx + 1}`;
      return TEMPLATE_BY_ID(id)?.name ?? OVERLAY_BY_ID(id).name;
    };
    return [
      { id: "none", name: "None", thumb: null as string | null },
      ...[...builtInIds, ...customFrames.map((f) => f.id)].map((id) => ({
        id,
        name: label(id),
        thumb: resolveOverlaySrc(id, 1, customFrames, overlayOpts),
      })),
    ];
  }, [boothType, eventType, customFrames, overlayOpts]);
  const styles = FRAME_STYLES.filter((f) => f.kind === tab);
  // Let the receipt shrink to fit so the controls below never get pushed
  // under the fixed action bar (tall layouts like 3-strip).
  const fit =
    layout.paperAspect < 1 ? "!w-auto h-full max-w-full" : "w-full max-h-full";

  const pick = (fn: () => void) => {
    fn();
    if (soundOn) sfx.pop();
  };

  return (
    <div className="flex h-full w-full flex-col pt-[max(5rem,calc(env(safe-area-inset-top)+4rem))]">
      <div className="px-8 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-cocoa">
          Dress it <span className="brand-text">up</span>
        </h2>
        <p className="mt-1 text-sm text-cocoa/50">Frame & shape</p>
      </div>

      {/* Live preview */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-10 py-1">
        <motion.div
          key={`${frameStyleId}-${photoShape}-${overlayId}`}
          initial={{ scale: 0.96, opacity: 0.7 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 22 }}
          className="flex h-full w-full items-center justify-center"
        >
          <Receipt
            layout={layout}
            photos={photos}
            filterCss={filterCss}
            frameBg={frameBg}
            shape={photoShape}
            frameOverlay={frameOverlay}
            theme={theme}
            code={code}
            dateLabel={formatDate()}
            className={fit}
          />
        </motion.div>
      </div>

      {/* Overlay row — normal booth only. In event mode the overlay is the
          host's event frame/template, so the guest doesn't pick one. */}
      {guestCanChangeOverlay && boothType === "normal" && (
        <div className="px-5">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.2em] text-cocoa/50">
            Overlay
          </p>
          <div className="no-bar flex gap-2.5 overflow-x-auto pb-1">
            {overlayOptions.map((o) => {
              const active = overlayId === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => pick(() => setOverlay(o.id))}
                  className={cn(
                    "relative flex shrink-0 flex-col items-center gap-1 rounded-2xl px-3 py-2 transition-all",
                    active
                      ? "glass-strong scale-105 shadow-bloom ring-2 ring-[rgb(var(--brand-a))]"
                      : "glass opacity-65",
                  )}
                >
                  {active && <CheckBadge small className="-right-1.5 -top-1.5" />}
                  <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-paper-shade">
                    {o.thumb ? (
                      <img
                        src={o.thumb}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-lg leading-none text-cocoa/40">∅</span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] font-medium",
                      active ? "font-semibold text-cocoa" : "text-cocoa/60",
                    )}
                  >
                    {o.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Shape row */}
      <div className="mt-3 px-5">
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.2em] text-cocoa/50">
          Photo shape
        </p>
        <div className="no-bar flex gap-2.5 overflow-x-auto pb-1">
          {PHOTO_SHAPES.map((s) => {
            const active = photoShape === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => pick(() => setPhotoShape(s.id))}
                className={cn(
                  "relative flex shrink-0 flex-col items-center gap-1 rounded-2xl px-4 py-2 transition-all",
                  active
                    ? "glass-strong scale-105 shadow-bloom ring-2 ring-[rgb(var(--brand-a))]"
                    : "glass opacity-65",
                )}
              >
                {active && <CheckBadge small className="-right-1.5 -top-1.5" />}
                <span className="text-2xl leading-none text-cocoa">{s.emoji}</span>
                <span
                  className={cn(
                    "text-[11px] font-medium",
                    active ? "font-semibold text-cocoa" : "text-cocoa/60",
                  )}
                >
                  {s.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Frame design */}
      <div className="mb-28 mt-3 px-5">
        <div className="mb-2 flex items-center gap-2 px-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cocoa/50">
            Frame
          </p>
          <div className="ml-auto flex gap-1 rounded-full glass p-1">
            {(["color", "pattern"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors",
                  tab === t ? "brand-fill text-white" : "text-cocoa/60",
                )}
              >
                {t === "color" ? "Colors" : "Patterns"}
              </button>
            ))}
          </div>
        </div>
        <div className="no-bar flex gap-3 overflow-x-auto pb-1">
          {styles.map((f) => {
            const active = frameStyleId === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => pick(() => setFrameStyle(f.id))}
                className={cn(
                  "flex shrink-0 flex-col items-center gap-1.5 transition-opacity",
                  active ? "opacity-100" : "opacity-70",
                )}
              >
                <span className="relative block">
                  <span
                    className={cn(
                      "block h-14 w-14 rounded-2xl transition-all",
                      active
                        ? "scale-110 border-[3px] border-[rgb(var(--brand-a))] shadow-bloom"
                        : "border-2 border-white/70",
                    )}
                    style={{ background: f.bg }}
                  />
                  {active && <CheckBadge small className="-right-1.5 -top-1.5" />}
                </span>
                <span
                  className={cn(
                    "text-[11px] font-medium",
                    active ? "font-semibold text-cocoa" : "text-cocoa/60",
                  )}
                >
                  {f.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <ActionBar
        onBack={() => go("review", -1)}
        primaryLabel="Continue"
        onPrimary={() => go("filter", 1)}
      />
    </div>
  );
}
