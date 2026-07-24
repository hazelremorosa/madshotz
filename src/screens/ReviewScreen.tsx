import { motion } from "framer-motion";
import { useSession } from "@/store/session";
import { activeFilterCss } from "@/data/filters";
import { ActionBar } from "@/components/shell/ActionBar";

export function ReviewScreen() {
  const photos = useSession((s) => s.photos);
  const filterId = useSession((s) => s.filterId);
  const filterIntensity = useSession((s) => s.filterIntensity);
  const beautyOn = useSession((s) => s.beautyOn);
  const beginRetake = useSession((s) => s.beginRetake);
  const go = useSession((s) => s.go);
  const filterCss = activeFilterCss(filterId, filterIntensity, beautyOn);

  const retake = (i: number) => {
    beginRetake(i);
    go("capture", 1);
  };

  return (
    <div className="flex h-full w-full flex-col pt-[max(5rem,calc(env(safe-area-inset-top)+4rem))]">
      <div className="px-8 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-cocoa">
          Love <span className="brand-text">them?</span>
        </h2>
        <p className="mt-1 text-sm text-cocoa/50">
          Swipe through · retake any single shot
        </p>
      </div>

      <div className="no-bar mt-6 flex flex-1 snap-x snap-mandatory items-center gap-5 overflow-x-auto px-[14%] pb-40">
        {photos.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.06 }}
            className="flex w-[72%] shrink-0 snap-center flex-col items-center gap-4"
          >
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl3 shadow-float">
              <img
                src={p.dataUrl}
                alt=""
                className="h-full w-full object-cover"
                style={{ filter: filterCss === "none" ? undefined : filterCss }}
              />
              <span className="absolute left-3 top-3 rounded-full glass px-3 py-1 font-mono text-[10px] text-cocoa shadow-glass">
                {i + 1} / {photos.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => retake(i)}
              className="glass rounded-full px-6 py-2.5 text-sm font-semibold text-cocoa shadow-glass"
            >
              ↺ Retake this
            </button>
          </motion.div>
        ))}
      </div>

      <ActionBar
        onBack={() => go("capture", -1)}
        primaryLabel="Looks great"
        onPrimary={() => go("frames", 1)}
      />
    </div>
  );
}
