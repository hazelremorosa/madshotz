import { useEffect, useRef } from "react";
import { useSession } from "@/store/session";

/** Returns the booth to Welcome after prolonged inactivity (privacy + attract). */
export function useIdleReset(timeoutMs = 90_000) {
  const screen = useSession((s) => s.screen);
  const reset = useSession((s) => s.reset);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const exempt = screen === "boot" || screen === "welcome";
    const arm = () => {
      window.clearTimeout(timer.current);
      if (exempt) return;
      timer.current = window.setTimeout(() => reset(), timeoutMs);
    };
    arm();
    window.addEventListener("pointerdown", arm);
    window.addEventListener("keydown", arm);
    return () => {
      window.clearTimeout(timer.current);
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, [screen, reset, timeoutMs]);
}
