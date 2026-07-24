import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { FILTERS, activeFilterCss } from "@/data/filters";
import { FRAME_STYLE_BY_ID } from "@/data/frames";
import { overlaySrc } from "@/data/overlays";
import { useSession } from "@/store/session";
import { useSettings } from "@/store/settings";
import { ActionBar } from "@/components/shell/ActionBar";
import { Receipt } from "@/components/Receipt";
import { CheckBadge } from "@/components/ui/CheckBadge";
import { formatDate } from "@/lib/date";
import { sfx } from "@/lib/sound";
import { cn } from "@/lib/cn";

export function FilterScreen() {
  const layout = useSession((s) => s.layout);
  const photos = useSession((s) => s.photos);
  const theme = useSession((s) => s.theme);
  const code = useSession((s) => s.sessionCode);
  const filterId = useSession((s) => s.filterId);
  const filterIntensity = useSession((s) => s.filterIntensity);
  const beautyOn = useSession((s) => s.beautyOn);
  const frameStyleId = useSession((s) => s.frameStyleId);
  const photoShape = useSession((s) => s.photoShape);
  const overlayId = useSession((s) => s.overlayId);
  const setFilter = useSession((s) => s.setFilter);
  const setFilterIntensity = useSession((s) => s.setFilterIntensity);
  const toggleBeauty = useSession((s) => s.toggleBeauty);
  const soundOn = useSession((s) => s.soundOn);
  const go = useSession((s) => s.go);
  const enabledIds = useSettings((s) => s.enabledFilterIds);
  const filterCss = activeFilterCss(filterId, filterIntensity, beautyOn);
  const isNatural = filterId === "natural";

  // Only the looks the host enabled in Admin → Filters (never an empty reel).
  const shown = useMemo(() => {
    const options = FILTERS.filter((f) => enabledIds.includes(f.id));
    return options.length ? options : FILTERS;
  }, [enabledIds]);

  useEffect(() => {
    if (!shown.some((f) => f.id === filterId)) setFilter(shown[0].id);
  }, [shown, filterId, setFilter]);

  const frameBg = FRAME_STYLE_BY_ID(frameStyleId).bg;
  const frameOverlay = overlaySrc(overlayId, layout.paperAspect);
  const fit =
    layout.paperAspect < 1 ? "!w-auto h-full max-w-full" : "w-full max-h-full";

  return (
    <div className="flex h-full w-full flex-col pt-[max(5rem,calc(env(safe-area-inset-top)+4rem))]">
      <div className="px-8 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-cocoa">
          Set the <span className="brand-text">mood</span>
        </h2>
      </div>

      {/* Live preview */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-10 py-1">
        <motion.div
          key={filterId}
          initial={{ filter: "blur(10px)", opacity: 0.6 }}
          animate={{ filter: "blur(0px)", opacity: 1 }}
          transition={{ duration: 0.35 }}
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

      {/* Filter reel */}
      <div className="no-bar flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 py-3">
        {shown.map((f) => {
          const active = f.id === filterId;
          const thumb = photos[0]?.dataUrl;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setFilter(f.id);
                if (soundOn) sfx.whoosh();
              }}
              className={cn(
                "flex shrink-0 snap-center flex-col items-center gap-1.5 transition-opacity",
                active ? "opacity-100" : "opacity-70",
              )}
            >
              <span className="relative block">
                <span
                  className={cn(
                    "block h-16 w-16 overflow-hidden rounded-xl transition-all",
                    active
                      ? "scale-105 border-[3px] border-[rgb(var(--brand-a))] shadow-bloom"
                      : "border-2 border-white/70",
                  )}
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      className="h-full w-full object-cover"
                      style={{ filter: f.css === "none" ? undefined : f.css }}
                    />
                  ) : (
                    <span className="block h-full w-full bg-white/40" />
                  )}
                </span>
                {active && <CheckBadge small className="-right-1.5 -top-1.5" />}
              </span>
              <span
                className={cn(
                  "text-[11px] font-medium",
                  active ? "font-semibold text-cocoa" : "text-cocoa/50",
                )}
              >
                {f.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Intensity + beauty controls */}
      <div className="mb-28 flex flex-col gap-3 px-6 pt-1">
        <div className="glass-strong flex items-center gap-3 rounded-full px-4 py-2.5 shadow-glass">
          <span className="text-sm" aria-hidden>
            🎚️
          </span>
          <span className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-cocoa/60">
            Intensity
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(filterIntensity * 100)}
            disabled={isNatural}
            onChange={(e) => setFilterIntensity(Number(e.target.value) / 100)}
            aria-label="Filter intensity"
            className="brand-range h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-cocoa/15 disabled:opacity-40"
          />
          <span className="w-10 shrink-0 text-right font-mono text-xs text-cocoa/50">
            {isNatural ? "—" : `${Math.round(filterIntensity * 100)}%`}
          </span>
        </div>

        <button
          type="button"
          onClick={toggleBeauty}
          aria-pressed={beautyOn}
          className={cn(
            "flex items-center justify-between rounded-full px-5 py-2.5 text-sm font-semibold shadow-glass transition-colors",
            beautyOn ? "brand-fill text-white" : "glass-strong text-cocoa/70",
          )}
        >
          <span className="flex items-center gap-2">
            ✨ Smooth skin
          </span>
          <span
            className={cn(
              "relative h-6 w-11 rounded-full transition-colors",
              beautyOn ? "bg-white/40" : "bg-cocoa/15",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                beautyOn ? "left-[1.375rem]" : "left-0.5",
              )}
            />
          </span>
        </button>
      </div>

      <ActionBar
        onBack={() => go("frames", -1)}
        primaryLabel="Add stickers"
        onPrimary={() => go("editor", 1)}
      />
    </div>
  );
}
