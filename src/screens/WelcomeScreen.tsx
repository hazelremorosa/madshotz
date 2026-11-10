import { useState } from "react";
import { motion } from "framer-motion";
import { LogoMark } from "@/components/Logo";
import { InstantCameraIcon, ReceiptPrinterIcon } from "@/components/BrandIcons";
import { useSession } from "@/store/session";
import { useSettings } from "@/store/settings";
import { useWelcome } from "@/store/welcome";
import { ensureCameraStream } from "@/lib/camera";
import { activeTemplate, templateLayout } from "@/store/templates";
import { reconcileDesignMode } from "@/store/events";
import { builtInCover, validCrop } from "@/assets/covers";
import { CoverImage } from "@/components/CoverImage";

export function WelcomeScreen() {
  const go = useSession((s) => s.go);
  // Host artwork replaces this screen, and only this screen. It falls back to
  // the Mad Shots attract screen whenever there's nothing to show — an upload
  // that was deleted, or a kiosk with no IndexedDB — so the booth is never
  // blank.
  const welcomeCustom = useSettings((s) => s.welcomeCustom);
  const welcomePrompt = useSettings((s) => s.welcomePrompt);
  const media = useWelcome((s) => s.media);
  const mediaReady = useWelcome((s) => s.ready);
  // Fade the artwork in once decoded, so a big GIF never pops in half-drawn.
  const [loaded, setLoaded] = useState(false);
  const welcomeCover = useSettings((s) => s.welcomeCover);
  const crop = useSettings((s) => validCrop(s.welcomeCrops[welcomeCover]));
  // The host's re-cut copy of a bundled cover, once it has loaded from IndexedDB.
  const override = useWelcome((s) => s.covers[welcomeCover]);
  const builtIn = builtInCover(welcomeCover);
  const artwork = welcomeCustom && media
    ? media
    : builtIn
      ? { url: override?.url ?? builtIn.url, fit: true }
      : null;

  const begin = () => {
    // Warm the camera on the first user gesture so Capture is instant.
    ensureCameraStream().catch(() => undefined);
    // Make sure the guest sees exactly the active event (or Standard Booth),
    // never a half-finished Admin draft.
    reconcileDesignMode();
    // A designed event template predetermines the layout (and shot count), so
    // skip the layout picker and go straight to capturing.
    const t = activeTemplate();
    if (t) {
      useSession.getState().setLayout(templateLayout(t));
      go("capture", 1);
    } else {
      go("layout", 1);
    }
  };

  // The host's upload is still being read from IndexedDB. Falling through now
  // would flash the fallback screen for a moment before the real one lands, so
  // hold a blank (still tappable) frame instead.
  if ((welcomeCustom || (crop && builtIn)) && !mediaReady) {
    return (
      <button
        type="button"
        onClick={begin}
        aria-label="Touch to begin"
        className="block h-full w-full"
      />
    );
  }

  if (artwork) {
    return (
      <button
        type="button"
        onClick={begin}
        aria-label="Touch to begin"
        className="relative block h-full w-full overflow-hidden bg-cocoa/5"
      >
        {/* Cover, not contain: the design box is portrait (~540×780) and the
            host's file may be any shape. Cropping beats letterboxing on an
            attract screen. */}
        {"fit" in artwork ? (
          // Bundled covers: top-anchored by default (their title sits near the
          // top edge), or the region the host cropped to.
          <CoverImage
            url={artwork.url}
            // The cropped file needs no further framing; the original with a saved
            // crop (its copy went missing) is shown through the crop instead.
            crop={override ? null : crop}
            onLoad={() => setLoaded(true)}
            imgClassName={`transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          />
        ) : (
          <img
            src={artwork.url}
            alt=""
            onLoad={() => setLoaded(true)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          />
        )}

        {welcomePrompt && (
          <>
            {/* Scrim only behind the prompt — enough to keep it readable over a
                bright frame without dimming the artwork itself. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/55 to-transparent" />
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="absolute inset-x-0 bottom-[max(3rem,env(safe-area-inset-bottom))] flex justify-center"
            >
              <span className="animate-breathe rounded-full bg-white/85 px-7 py-3 text-sm font-semibold tracking-widest text-cocoa shadow-glass backdrop-blur">
                TOUCH ANYWHERE TO BEGIN
              </span>
            </motion.div>
          </>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={begin}
      className="flex h-full w-full flex-col items-center justify-center px-8 text-center"
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 18 }}
        className="flex items-center justify-center gap-2"
      >
        <div
          className="animate-floaty text-[rgb(var(--brand-a))] opacity-40"
          style={{ animationDelay: "-2.2s" }}
        >
          <InstantCameraIcon size={48} />
        </div>
        <div className="animate-floaty">
          <LogoMark size={132} />
        </div>
        <div
          className="animate-floaty text-[rgb(var(--brand-c))] opacity-45"
          style={{ animationDelay: "-4.4s" }}
        >
          <ReceiptPrinterIcon size={48} />
        </div>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mt-8 text-5xl font-extrabold tracking-tight text-cocoa"
      >
        MAD <span className="brand-text">SHOTS</span>
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
