import { motion } from "framer-motion";
import { FLOW_STEPS, useSession } from "@/store/session";
import type { ScreenId } from "@/types";
import { cn } from "@/lib/cn";

const ORDER: ScreenId[] = FLOW_STEPS.map((s) => s.id);

/** Top step indicator + tap-to-go-back on completed steps. */
export function ProgressRail() {
  const screen = useSession((s) => s.screen);
  const go = useSession((s) => s.go);

  const active = ORDER.indexOf(screen);
  if (active < 0) return null; // hidden on boot/welcome/printing/qr

  return (
    <div className="pointer-events-auto absolute inset-x-0 top-0 z-40 flex justify-center px-5 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="glass flex items-center gap-2 rounded-full px-4 py-2 shadow-glass">
        {FLOW_STEPS.map((step, i) => {
          const done = i < active;
          const isActive = i === active;
          return (
            <button
              key={step.id}
              type="button"
              disabled={!done}
              onClick={() => done && go(step.id, -1)}
              className="group flex items-center"
              aria-label={step.label}
            >
              <span className="relative flex items-center justify-center">
                <motion.span
                  layout
                  className={cn(
                    "h-2 rounded-full transition-colors",
                    isActive
                      ? "brand-fill w-7 shadow-bloom"
                      : done
                        ? "w-2 bg-white/80"
                        : "w-2 bg-white/25",
                  )}
                />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
