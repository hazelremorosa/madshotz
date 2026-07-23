import { useEffect } from "react";
import { motion } from "framer-motion";
import { LogoMark } from "@/components/Logo";
import { useSession } from "@/store/session";

export function BootScreen() {
  const go = useSession((s) => s.go);

  useEffect(() => {
    const t = window.setTimeout(() => go("welcome", 1), 1900);
    return () => window.clearTimeout(t);
  }, [go]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6">
      <LogoMark size={128} draw />
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1 }}
        className="relative overflow-hidden"
      >
        <div className="text-3xl font-extrabold tracking-[0.2em] brand-text">
          MAD SHOT'Z
        </div>
        <motion.div
          className="absolute inset-y-0 w-1/3 bg-white/40 blur-md"
          initial={{ x: "-120%" }}
          animate={{ x: "320%" }}
          transition={{ delay: 1.15, duration: 0.9, ease: "easeInOut" }}
        />
      </motion.div>
    </div>
  );
}
