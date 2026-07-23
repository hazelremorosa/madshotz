import { motion } from "framer-motion";
import { LogoMark } from "@/components/Logo";
import { useSession } from "@/store/session";
import { ensureCameraStream } from "@/lib/camera";

export function WelcomeScreen() {
  const go = useSession((s) => s.go);

  const begin = () => {
    // Warm the camera on the first user gesture so Capture is instant.
    ensureCameraStream().catch(() => undefined);
    go("layout", 1);
  };

  return (
    <button
      type="button"
      onClick={begin}
      className="flex h-full w-full flex-col items-center justify-center px-8 text-center"
    >
      <motion.div
        className="animate-floaty"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 18 }}
      >
        <LogoMark size={140} />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mt-8 text-5xl font-extrabold tracking-tight text-cocoa"
      >
        MAD <span className="brand-text">SHOT'Z</span>
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-3 font-mono text-xs uppercase tracking-[0.5em] text-cocoa/50"
      >
        Studio Creative
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-20 flex flex-col items-center gap-3"
      >
        <span className="glass rounded-full px-7 py-3 text-sm font-semibold tracking-widest text-cocoa shadow-glass animate-breathe">
          TOUCH ANYWHERE TO BEGIN
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-cocoa/40">
          Your memories, printed in seconds
        </span>
      </motion.div>
    </button>
  );
}
