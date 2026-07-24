import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { useCamera } from "@/lib/camera";
import { useSession } from "@/store/session";
import { activeFilterCss } from "@/data/filters";
import { sfx } from "@/lib/sound";
import { cn } from "@/lib/cn";

const COUNTDOWN_OPTIONS = [3, 5, 10];

export function CaptureScreen() {
  const { videoRef, status, capture } = useCamera();
  const layout = useSession((s) => s.layout);
  const photos = useSession((s) => s.photos);
  const retakeIndex = useSession((s) => s.retakeIndex);
  const filterId = useSession((s) => s.filterId);
  const filterIntensity = useSession((s) => s.filterIntensity);
  const beautyOn = useSession((s) => s.beautyOn);
  const countdownLength = useSession((s) => s.countdownLength);
  const setCountdownLength = useSession((s) => s.setCountdownLength);
  const soundOn = useSession((s) => s.soundOn);
  const addPhoto = useSession((s) => s.addPhoto);
  const go = useSession((s) => s.go);

  const [count, setCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [burst, setBurst] = useState(0);
  const [phase, setPhase] = useState("Get ready…");
  const [hasStarted, setHasStarted] = useState(false);
  const shake = useAnimationControls();
  const filterCss = activeFilterCss(filterId, filterIntensity, beautyOn);

  const isRetake = retakeIndex !== null;
  const cancelled = useRef(false);
  const started = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const wait = (ms: number) =>
    new Promise<void>((res) => {
      timer.current = window.setTimeout(res, ms);
    });

  // Fresh-start guard: re-entering a completed capture means "reshoot".
  useEffect(() => {
    cancelled.current = false;
    started.current = false;
    const st = useSession.getState();
    if (st.retakeIndex === null && st.photos.length >= st.layout.shots) {
      st.setLayout(st.layout); // clears photos
    }
    return () => {
      cancelled.current = true;
      window.clearTimeout(timer.current);
    };
  }, []);

  // Capture sequence — starts when the guest taps "Start shooting", then
  // shoots every frame the layout needs automatically.
  const startCapture = () => {
    if (started.current || status !== "ready") return;
    started.current = true;
    setHasStarted(true);

    const fire = () => {
      const url = capture();
      setFlash(true);
      window.setTimeout(() => setFlash(false), 130);
      shake.start({ x: [0, -6, 5, -3, 0], transition: { duration: 0.4 } });
      setBurst((b) => b + 1);
      if (soundOn) sfx.shutter();
      if (url) addPhoto(url);
    };

    const run = async () => {
      const st0 = useSession.getState();
      const total = st0.layout.shots;
      const retake = st0.retakeIndex !== null;
      const todo = retake ? 1 : total - st0.photos.length;
      const seconds = st0.countdownLength;

      setPhase(retake ? "Let's redo that one!" : "Get ready…");
      await wait(1000);

      for (let s = 0; s < todo; s++) {
        if (cancelled.current) return;
        const frameNo = retake
          ? (st0.retakeIndex ?? 0) + 1
          : useSession.getState().photos.length + 1;
        setPhase(`Frame ${frameNo} of ${total}`);
        for (let n = seconds; n > 0; n--) {
          if (cancelled.current) return;
          setCount(n);
          if (soundOn) sfx.tick();
          await wait(1000);
        }
        if (cancelled.current) return;
        setCount(null);
        fire();
        setPhase(["Cute! ✨", "Adorable!", "Love it! 💖", "Perfect!"][s % 4]);
        await wait(900);
      }
      if (cancelled.current) return;
      setPhase("All done!");
      await wait(500);
      if (!cancelled.current) go("review", retake ? -1 : 1);
    };

    run();
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-6 pb-10 pt-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))]">
      <div className="glass rounded-full px-5 py-2 font-mono text-xs uppercase tracking-[0.25em] text-cocoa shadow-glass">
        {isRetake ? "Retaking" : phase}
      </div>

      <motion.div
        animate={shake}
        className="relative aspect-[4/5] w-full max-w-sm overflow-hidden rounded-xl3 bg-black shadow-float"
      >
        {status === "denied" || status === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <span className="text-5xl">👀</span>
            <p className="text-lg font-semibold text-white">We can't see you</p>
            <p className="text-sm text-white/60">
              Please allow camera access to start.
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

        <div className="pointer-events-none absolute inset-4">
          {["left-0 top-0", "right-0 top-0", "left-0 bottom-0", "right-0 bottom-0"].map(
            (pos, i) => (
              <span
                key={i}
                className={cn(
                  "absolute h-6 w-6 border-white/50",
                  pos.includes("top") ? "border-t-2" : "border-b-2",
                  pos.includes("left") ? "border-l-2" : "border-r-2",
                  pos,
                )}
              />
            ),
          )}
        </div>

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

        <AnimatePresence>{burst > 0 && <SparkleBurst key={burst} />}</AnimatePresence>

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
              "h-11 w-11 overflow-hidden rounded-xl border-2",
              retakeIndex === i ? "border-[rgb(var(--brand-a))]" : "border-white/70",
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
              <div className="flex h-full w-full items-center justify-center bg-white/60 font-mono text-xs text-cocoa/40">
                {i + 1}
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {!hasStarted ? (
        <div className="flex flex-col items-center gap-3">
          {/* Countdown length — host setting, persists across sessions. */}
          <div className="glass flex items-center gap-1 rounded-full p-1 shadow-glass">
            <span className="px-2 text-sm" aria-hidden>
              ⏱️
            </span>
            {COUNTDOWN_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setCountdownLength(s)}
                aria-pressed={countdownLength === s}
                className={cn(
                  "min-w-[3rem] rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
                  countdownLength === s
                    ? "brand-fill text-white shadow-bloom"
                    : "text-cocoa/60",
                )}
              >
                {s}s
              </button>
            ))}
          </div>
          <motion.button
            type="button"
            onClick={startCapture}
            disabled={status !== "ready"}
            whileTap={{ scale: 0.94 }}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-2 rounded-full brand-fill px-9 py-4 text-lg font-bold text-white shadow-bloom disabled:opacity-40"
          >
            📸 {isRetake ? "Shoot again" : "Start shooting"}
          </motion.button>
          <span className="text-xs font-medium text-cocoa/50">
            {status === "ready"
              ? "Strike a pose, then tap when you're ready"
              : "Warming up the camera…"}
          </span>
        </div>
      ) : (
        <p className="text-sm font-medium text-cocoa/60">
          {isRetake
            ? "Hold still — one quick shot!"
            : "Just relax and pose — we'll do the rest 💫"}
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          cancelled.current = true;
          go(isRetake ? "review" : "layout", -1);
        }}
        className="text-xs font-medium uppercase tracking-[0.2em] text-cocoa/40"
      >
        {isRetake ? "Cancel" : "Back"}
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
