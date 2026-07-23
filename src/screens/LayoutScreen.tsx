import { motion } from "framer-motion";
import { LAYOUTS } from "@/data/layouts";
import { useSession } from "@/store/session";
import { FrameStack } from "@/components/FrameStack";
import { ActionBar } from "@/components/shell/ActionBar";
import { sfx } from "@/lib/sound";
import { cn } from "@/lib/cn";

export function LayoutScreen() {
  const layout = useSession((s) => s.layout);
  const setLayout = useSession((s) => s.setLayout);
  const go = useSession((s) => s.go);
  const soundOn = useSession((s) => s.soundOn);

  return (
    <div className="flex h-full w-full flex-col pt-[max(5rem,calc(env(safe-area-inset-top)+4rem))]">
      <div className="px-8 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-white">
          Choose your <span className="brand-text">layout</span>
        </h2>
        <p className="mt-1 text-sm text-white/50">This sets how many shots</p>
      </div>

      <div className="no-bar mt-4 grid flex-1 grid-cols-2 content-start gap-4 overflow-y-auto px-6 pb-40 pt-2">
        {LAYOUTS.map((l, i) => {
          const selected = layout.id === l.id;
          return (
            <motion.button
              key={l.id}
              type="button"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, type: "spring", stiffness: 260, damping: 22 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                setLayout(l);
                if (soundOn) sfx.pop();
              }}
              className={cn(
                "relative flex flex-col items-center gap-3 rounded-xl2 p-4 transition-all",
                selected ? "glass-strong shadow-bloom" : "glass",
              )}
            >
              <span className="absolute right-3 top-3 z-10 rounded-full brand-fill px-2 py-0.5 text-[10px] font-bold text-white">
                ×{l.shots}
              </span>
              <div className="flex h-28 w-full items-center justify-center">
                <div
                  className="paper h-full rounded-[4px] p-1.5 shadow-md"
                  style={{ aspectRatio: String(l.paperAspect) }}
                >
                  <FrameStack layout={l} photos={[]} filterCss="none" />
                </div>
              </div>
              <span className="text-sm font-semibold text-white">{l.name}</span>
            </motion.button>
          );
        })}
      </div>

      <ActionBar
        onBack={() => go("theme", -1)}
        primaryLabel="Start shooting"
        onPrimary={() => go("capture", 1)}
      />
    </div>
  );
}
