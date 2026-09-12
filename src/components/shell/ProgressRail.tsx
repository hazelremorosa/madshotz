import { motion } from "framer-motion";
import { useSession } from "@/store/session";
import { useFlowSteps } from "@/lib/flow";
import { cn } from "@/lib/cn";

/** Top step indicator + tap-to-go-back on completed steps. */
export function ProgressRail() {
  const screen = useSession((s) => s.screen);
  const go = useSession((s) => s.go);

  // Only the steps this session actually visits — a template event and the
  // host's Guest steps toggles both shorten the flow.
  const steps = useFlowSteps();
  const active = steps.findIndex((s) => s.id === screen);
  if (active < 0) return null; // hidden on boot/welcome/printing/qr

  return (
    <div className="pointer-events-auto absolute inset-x-0 top-0 z-40 flex justify-center px-5 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="glass flex items-center gap-2 rounded-full px-4 py-2 shadow-glass">
        {steps.map((step, i) => {
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
                        ? "w-2 bg-cocoa/60"
                        : "w-2 bg-cocoa/20",
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
