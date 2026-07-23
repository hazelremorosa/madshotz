import { motion } from "framer-motion";
import { FILTERS, FILTER_BY_ID } from "@/data/filters";
import { useSession } from "@/store/session";
import { ActionBar } from "@/components/shell/ActionBar";
import { Receipt } from "@/components/Receipt";
import { formatDate } from "@/lib/date";
import { sfx } from "@/lib/sound";
import { cn } from "@/lib/cn";

export function FilterScreen() {
  const layout = useSession((s) => s.layout);
  const photos = useSession((s) => s.photos);
  const theme = useSession((s) => s.theme);
  const code = useSession((s) => s.sessionCode);
  const filterId = useSession((s) => s.filterId);
  const setFilter = useSession((s) => s.setFilter);
  const soundOn = useSession((s) => s.soundOn);
  const go = useSession((s) => s.go);
  const filterCss = FILTER_BY_ID(filterId).css;

  return (
    <div className="flex h-full w-full flex-col pt-[max(5rem,calc(env(safe-area-inset-top)+4rem))]">
      <div className="px-8 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-white">
          Set the <span className="brand-text">mood</span>
        </h2>
      </div>

      {/* Live preview */}
      <div className="flex flex-1 items-center justify-center px-10 pb-2">
        <motion.div
          key={filterId}
          initial={{ filter: "blur(10px)", opacity: 0.6 }}
          animate={{ filter: "blur(0px)", opacity: 1 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-[240px]"
        >
          <Receipt
            layout={layout}
            photos={photos}
            filterCss={filterCss}
            theme={theme}
            code={code}
            dateLabel={formatDate()}
          />
        </motion.div>
      </div>

      {/* Filter reel */}
      <div className="no-bar mb-32 flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 py-3">
        {FILTERS.map((f) => {
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
              className="flex shrink-0 snap-center flex-col items-center gap-1.5"
            >
              <div
                className={cn(
                  "h-16 w-16 overflow-hidden rounded-xl border-2 transition-all",
                  active
                    ? "scale-105 border-[rgb(var(--brand-a))] shadow-bloom"
                    : "border-white/15",
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
                  <div className="h-full w-full bg-white/10" />
                )}
              </div>
              <span
                className={cn(
                  "text-[11px] font-medium",
                  active ? "text-white" : "text-white/50",
                )}
              >
                {f.name}
              </span>
            </button>
          );
        })}
      </div>

      <ActionBar
        onBack={() => go("review", -1)}
        primaryLabel="Decorate"
        onPrimary={() => go("editor", 1)}
      />
    </div>
  );
}
