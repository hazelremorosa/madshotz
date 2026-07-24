import { useEffect, useRef } from "react";
import { useSession } from "@/store/session";
import { useSettings } from "@/store/settings";

/**
 * Returns the booth to Welcome after prolonged inactivity (privacy + attract).
 * The timeout is a host setting (Admin → Sound & timing), and the countdown is
 * suspended while the Admin panel is open so a host mid-config isn't reset.
 */
export function useIdleReset() {
  const screen = useSession((s) => s.screen);
  const reset = useSession((s) => s.reset);
  const timeoutSec = useSettings((s) => s.idleTimeoutSec);
  const adminOpen = useSettings((s) => s.adminOpen);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const exempt = screen === "boot" || screen === "welcome" || adminOpen;
    const arm = () => {
      window.clearTimeout(timer.current);
      if (exempt) return;
      timer.current = window.setTimeout(() => reset(), timeoutSec * 1000);
    };
    arm();
    window.addEventListener("pointerdown", arm);
    window.addEventListener("keydown", arm);
    return () => {
      window.clearTimeout(timer.current);
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, [screen, reset, timeoutSec, adminOpen]);
}
