import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useAnimationControls,
} from "framer-motion";
import { useCamera } from "@/lib/camera";
import { useSession } from "@/store/session";
import { FILTER_BY_ID } from "@/data/filters";
import { sfx } from "@/lib/sound";
import { cn } from "@/lib/cn";

export function CaptureScreen() {
  const { videoRef, status, capture } = useCamera();
  const layout = useSession((s) => s.layout);
  const photos = useSession((s) => s.photos);
  const retakeIndex = useSession((s) => s.retakeIndex);
  const filterId = useSession((s) => s.filterId);
  const soundOn = useSession((s) => s.soundOn);
  const addPhoto = useSession((s) => s.addPhoto);
  const go = useSession((s) => s.go);

  const [count, setCount] = useState<number | null>(null);
  const [shooting, setShooting] = useState(false);
  const [flash, setFlash] = useState(false);
  const [burst, setBurst] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const shake = useAnimationControls();
  const filterCss = FILTER_BY_ID(filterId).css;

  const isRetake = retakeIndex !== null;

  // Fresh-start guard: re-entering a completed capture means "reshoot".
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    const st = useSession.getState();
    if (st.retakeIndex === null && st.photos.length >= st.layout.shots) {
      st.setLayout(st.layout); // clears photos
    }
  }, []);

  const doneCount = photos.length;
  const finished = !isRetake && doneCount >= layout.shots;

  const startShot = () => {
    if (shooting || finished || status !== "ready") return;
    setShooting(true);
    let n = 3;
    setCount(n);
    if (soundOn) sfx.tick();
    const iv = window.setInterval(() => {
      n -= 1;
      if (n > 0) {
        setCount(n);
        if (soundOn) sfx.tick();
      } else {
        window.clearInterval(iv);
        setCount(null);
        fire();
      }
    }, 800);
  };

  const fire = () => {
    const url = capture();
    setFlash(true);
    window.setTimeout(() => setFlash(false), 130);
    shake.start({
      x: [0, -6, 5, -3, 0],
      transition: { duration: 0.4 },
    });
    setBurst((b) => b + 1);
    if (soundOn) sfx.shutter();

    const wasRetake = useSession.getState().retakeIndex !== null;
    if (url) addPhoto(url);
    const st = useSession.getState();
    setShooting(false);

    if (wasRetake) {
      setToast("Got it!");
      window.setTimeout(() => go("review", -1), 700);
    } else if (st.photos.length >= st.layout.shots) {
      setToast("Beautiful!");
      window.setTimeout(() => go("review", 1), 750);
    } else {
      setToast("Nice! Next pose…");
      window.setTimeout(() => setToast(null), 1400);
    }
  };

  const label = isRetake
    ? `Retaking frame ${(retakeIndex ?? 0) + 1}`
    : `Frame ${Math.min(doneCount + 1, layout.shots)} of ${layout.shots}`;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-6 pb-8 pt-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))]">
      {/* Progress chip */}
      <div className="glass rounded-full px-5 py-2 font-mono text-xs uppercase tracking-[0.25em] text-white/90">
        {label}
      </div>

      {/* Viewport */}
      <motion.div
        animate={shake}
        className="relative aspect-[4/5] w-full max-w-sm overflow-hidden rounded-xl3 bg-black shadow-float"
      >
        {status === "denied" || status === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <span className="text-5xl">👀</span>
            <p className="text-lg font-semibold text-white">We can't see you</p>
            <p className="text-sm text-white/60">
              Please allow camera access, then tap below.
            </p>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full scale-x-[-1] object-cover"
            style={{ filter: filterCss === "none" ? undefined : filterCss }}
          />
        )}

        {/* corner guides */}
        <div className="pointer-events-none absolute inset-4">
          {["left-0 top-0", "right-0 top-0", "left-0 bottom-0", "right-0 bottom-0"].map(
            (pos, i) => (
              <span
                key={i}
                className={cn(
                  "absolute h-6 w-6 border-white/40",
                  pos.includes("top") ? "border-t-2" : "border-b-2",
                  pos.includes("left") ? "border-l-2 " : "border-r-2 ",
                  pos,
                )}
              />
            ),
          )}
        </div>

        {/* Countdown */}
        <AnimatePresence>
          {count !== null && (
            <motion.div
              key={count}
              initial={{ scale: 0.4, opacity: 0, filter: "blur(12px)" }}
              animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
              exit={{ scale: 1.8, opacity: 0, filter: "blur(12px)" }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <span className="text-9xl font-black text-white drop-shadow-2xl">
                {count}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sparkle burst */}
        <AnimatePresence>
          {burst > 0 && (
            <SparkleBurst key={burst} />
          )}
        </AnimatePresence>

        {/* Flash */}
        <motion.div
          className="pointer-events-none absolute inset-0 bg-white"
          animate={{ opacity: flash ? 1 : 0 }}
          transition={{ duration: flash ? 0.05 : 0.6 }}
        />
      </motion.div>

      {/* Shot tray */}
      <div className="flex items-center gap-2">
        {Array.from({ length: layout.shots }).map((_, i) => (
          <motion.div
            key={i}
            layout
            className={cn(
              "h-11 w-11 overflow-hidden rounded-lg border",
              retakeIndex === i
                ? "border-[rgb(var(--brand-a))]"
                : "border-white/20",
            )}
          >
            {photos[i] ? (
              <img
                src={photos[i].dataUrl}
                alt=""
                className="h-full w-full object-cover"
                style={{ filter: filterCss === "none" ? undefined : filterCss }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-white/5 font-mono text-xs text-white/30">
                {i + 1}
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Toast */}
      <div className="h-5">
        <AnimatePresence>
          {toast && (
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-sm font-semibold text-white/80"
            >
              {toast}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Shutter */}
      <motion.button
        type="button"
        onClick={startShot}
        disabled={shooting || finished || status !== "ready"}
        whileTap={{ scale: 0.9 }}
        className="relative flex h-20 w-20 items-center justify-center rounded-full disabled:opacity-40"
      >
        <span className="absolute inset-0 rounded-full border-4 border-white/80" />
        <span className="h-14 w-14 rounded-full brand-fill shadow-bloom" />
      </motion.button>

      <button
        type="button"
        onClick={() => go(isRetake ? "review" : "layout", -1)}
        className="text-xs font-medium uppercase tracking-[0.2em] text-white/40"
      >
        {isRetake ? "Cancel retake" : "Back"}
      </button>
    </div>
  );
}

function SparkleBurst() {
  const bits = Array.from({ length: 10 });
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {bits.map((_, i) => {
        const a = (i / bits.length) * Math.PI * 2;
        return (
          <motion.span
            key={i}
            className="absolute text-2xl"
            initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
            animate={{
              x: Math.cos(a) * 120,
              y: Math.sin(a) * 120,
              scale: [0, 1.2, 0],
              opacity: [1, 1, 0],
            }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          >
            ✨
          </motion.span>
        );
      })}
    </div>
  );
}
