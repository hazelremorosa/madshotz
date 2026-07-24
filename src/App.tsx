import { useEffect } from "react";
import { motion, type Variants } from "framer-motion";
import { useSession } from "@/store/session";
import { applyBrandVars, effectiveBrand } from "@/store/settings";
import { useIdleReset } from "@/hooks/useIdleReset";
import { useKioskLockdown } from "@/hooks/useKioskLockdown";
import { AdminRoot } from "@/components/admin/AdminRoot";
import type { ScreenId } from "@/types";

import { AmbientBackground } from "@/components/shell/AmbientBackground";
import { ParticleField } from "@/components/shell/ParticleField";
import { RippleLayer } from "@/components/shell/RippleLayer";
import { ProgressRail } from "@/components/shell/ProgressRail";
import { ShapeDefs } from "@/components/ShapeDefs";

import { BootScreen } from "@/screens/BootScreen";
import { WelcomeScreen } from "@/screens/WelcomeScreen";
import { LayoutScreen } from "@/screens/LayoutScreen";
import { CaptureScreen } from "@/screens/CaptureScreen";
import { ReviewScreen } from "@/screens/ReviewScreen";
import { FramesScreen } from "@/screens/FramesScreen";
import { FilterScreen } from "@/screens/FilterScreen";
import { EditorScreen } from "@/screens/EditorScreen";
import { PreviewScreen } from "@/screens/PreviewScreen";
import { PrintingScreen } from "@/screens/PrintingScreen";
import { QRScreen } from "@/screens/QRScreen";

const SCREENS: Record<ScreenId, () => JSX.Element> = {
  boot: BootScreen,
  welcome: WelcomeScreen,
  layout: LayoutScreen,
  capture: CaptureScreen,
  review: ReviewScreen,
  frames: FramesScreen,
  filter: FilterScreen,
  editor: EditorScreen,
  preview: PreviewScreen,
  printing: PrintingScreen,
  qr: QRScreen,
};

// Enter-only transition. The outgoing screen unmounts instantly via React
// keying (no AnimatePresence), so there is no exit-completion to stall on and
// screens can never pile up. The new screen slides + fades into place.
const variants: Variants = {
  enter: (dir: number) => ({
    opacity: 0,
    x: dir > 0 ? 56 : -56,
    scale: 0.98,
  }),
  center: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 260, damping: 30 },
  },
};

export default function App() {
  const screen = useSession((s) => s.screen);
  const direction = useSession((s) => s.direction);
  const soundOn = useSession((s) => s.soundOn);
  const toggleSound = useSession((s) => s.toggleSound);
  const theme = useSession((s) => s.theme);
  useIdleReset();
  useKioskLockdown();

  // Paint the host's Admin palette (if any) on first paint, not just on reset.
  useEffect(() => {
    applyBrandVars(effectiveBrand(theme));
  }, [theme]);

  const Screen = SCREENS[screen];

  return (
    <div className="relative h-[100dvh] w-full max-w-[540px] overflow-hidden bg-cream text-cocoa">
      <ShapeDefs />
      <AmbientBackground />
      <ParticleField />

      <motion.div
        key={screen}
        custom={direction}
        variants={variants}
        initial="enter"
        animate="center"
        className="absolute inset-0 z-10"
      >
        <Screen />
      </motion.div>

      <ProgressRail />

      <button
        type="button"
        onClick={toggleSound}
        aria-label="Toggle sound"
        className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-50 flex h-9 w-9 items-center justify-center rounded-full glass text-sm text-cocoa/70 shadow-glass"
      >
        {soundOn ? "🔊" : "🔇"}
      </button>

      <RippleLayer />

      {/* Hidden admin entry + the panel itself (renders above everything). */}
      <AdminRoot />
    </div>
  );
}
