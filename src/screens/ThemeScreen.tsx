import { motion } from "framer-motion";
import { THEMES } from "@/data/themes";
import { useSession } from "@/store/session";
import { ActionBar } from "@/components/shell/ActionBar";
import { sfx } from "@/lib/sound";
import { cn } from "@/lib/cn";

export function ThemeScreen() {
  const theme = useSession((s) => s.theme);
  const setTheme = useSession((s) => s.setTheme);
  const go = useSession((s) => s.go);
  const soundOn = useSession((s) => s.soundOn);

  return (
    <div className="flex h-full w-full flex-col pt-[max(5rem,calc(env(safe-area-inset-top)+4rem))]">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-8 text-center"
      >
        <h2 className="text-3xl font-extrabold tracking-tight text-white">
          Pick your <span className="brand-text">vibe</span>
        </h2>
        <p className="mt-1 text-sm text-white/50">Sets the whole mood</p>
      </motion.div>

      <div className="no-bar mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-[18%] py-4">
        {THEMES.map((t, i) => {
          const selected = theme.id === t.id;
          return (
            <motion.button
              key={t.id}
              type="button"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, type: "spring", stiffness: 260, damping: 24 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                setTheme(t);
                if (soundOn) sfx.pop();
              }}
              className={cn(
                "relative flex aspect-[3/4] w-[64%] shrink-0 snap-center flex-col items-center justify-center gap-4 overflow-hidden rounded-xl3 p-6 text-center transition-all",
                selected ? "glass-strong shadow-bloom" : "glass",
              )}
            >
              <div
                className="absolute inset-0 opacity-40"
                style={{
                  background: `radial-gradient(circle at 50% 30%, rgb(${t.brand[0]}), transparent 60%)`,
                }}
              />
              {selected && (
                <motion.div
                  layoutId="theme-ring"
                  className="absolute inset-0 rounded-xl3 ring-2 ring-[rgb(var(--brand-a))]"
                />
              )}
              <span className="relative text-7xl drop-shadow-lg">{t.emoji}</span>
              <div className="relative">
                <div className="text-xl font-bold text-white">{t.name}</div>
                <div className="mt-1 text-xs text-white/60">{t.tagline}</div>
              </div>
              <div className="relative mt-1 flex gap-1.5">
                {t.brand.map((c, j) => (
                  <span
                    key={j}
                    className="h-2 w-6 rounded-full"
                    style={{ background: `rgb(${c})` }}
                  />
                ))}
              </div>
            </motion.button>
          );
        })}
      </div>

      <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-white/30">
        Swipe to explore · tap to choose
      </p>

      <ActionBar
        onBack={() => go("welcome", -1)}
        primaryLabel="Continue"
        onPrimary={() => go("layout", 1)}
      />
    </div>
  );
}
