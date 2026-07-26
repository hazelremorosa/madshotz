import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useSession } from "@/store/session";
import { useSettings } from "@/store/settings";
import { AnimatedQR } from "@/components/AnimatedQR";
import { Confetti } from "@/components/Confetti";
import { Button } from "@/components/ui/Button";
import { PrintStatus } from "@/components/PrintStatus";
import { DeliveryService } from "@/lib/delivery";
import { qrMatrix } from "@/lib/qr";
import { sfx } from "@/lib/sound";

export function QRScreen() {
  const code = useSession((s) => s.sessionCode);
  const composite = useSession((s) => s.composite);
  const soundOn = useSession((s) => s.soundOn);
  const reset = useSession((s) => s.reset);
  /** Host setting (Admin → Sound & timing). Read once so it can't shift mid-countdown. */
  const [resetSeconds] = useState(() => useSettings.getState().qrResetSec);
  const uploadsOn = useSettings((st) => st.cloudUploadEnabled);

  const [matrix, setMatrix] = useState<boolean[][] | null>(null);
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [seconds, setSeconds] = useState(resetSeconds);
  const [toast, setToast] = useState<string | null>(null);
  const celebrated = useRef(false);

  useEffect(() => {
    let alive = true;
    DeliveryService.publish(code, composite ?? "").then(async (res) => {
      if (!alive) return;
      setUrl(res.url);
      setPending(res.pending);
      setMatrix(await qrMatrix(res.url));
      if (!celebrated.current) {
        celebrated.current = true;
        if (soundOn) sfx.success();
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    const iv = window.setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          window.clearInterval(iv);
          reset();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(iv);
  }, [reset]);

  const download = () => {
    if (!composite) return;
    const a = document.createElement("a");
    a.href = composite;
    a.download = `mad-shots-${code}.jpg`;
    a.click();
    setToast("Saved to your device");
    window.setTimeout(() => setToast(null), 1800);
  };

  const share = async () => {
    try {
      const nav = navigator as Navigator & {
        canShare?: (d: ShareData) => boolean;
      };
      if (composite && nav.share) {
        const blob = await (await fetch(composite)).blob();
        const file = new File([blob], `mad-shots-${code}.jpg`, {
          type: "image/jpeg",
        });
        if (nav.canShare?.({ files: [file] })) {
          await nav.share({ files: [file], title: "Mad Shots" });
          return;
        }
        await nav.share({ title: "Mad Shots", text: "My photos!", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setToast("Link copied");
      window.setTimeout(() => setToast(null), 1800);
    } catch {
      /* user dismissed share sheet */
    }
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-8">
      <Confetti />

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 16 }}
        className="text-center"
      >
        <h2 className="text-3xl font-extrabold tracking-tight text-cocoa">
          Your memories are <span className="brand-text">ready!</span>
        </h2>
        <p className="mt-1 text-sm text-cocoa/50">
          {pending ? "Saved ✓ — download it here now" : "Scan to save your photos"}
        </p>
      </motion.div>

      {/* Uploads switched off for development. Deliberately loud and deliberately
          guest-visible: a booth silently handing out dead QR codes is far worse
          than an ugly banner, and this is the only reminder that it's off. */}
      {!uploadsOn && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-full bg-amber-100/90 px-4 py-1.5 text-center text-xs font-semibold text-amber-800"
        >
          🧪 Cloud upload is OFF — this QR won't work
        </motion.div>
      )}

      {/* Offline: the photo is safe on the device; the QR link syncs later. */}
      {pending && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-full bg-amber-100/80 px-4 py-1.5 text-center text-xs font-semibold text-amber-700"
        >
          📴 Offline — the QR link will work once this booth reconnects
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="relative"
      >
        <div className="absolute -inset-6 rounded-full bg-[radial-gradient(circle,rgb(var(--brand-a)/0.4),transparent_70%)] blur-2xl" />
        <div className="relative">
          <AnimatedQR matrix={matrix} size={230} />
        </div>
      </motion.div>

      <div className="font-mono text-xs uppercase tracking-[0.3em] text-cocoa/40">
        Code · {code}
      </div>

      <div className="flex items-center gap-3">
        <Button variant="paper" onClick={download}>
          ↓ Download
        </Button>
        <Button variant="primary" onClick={share}>
          ↗ Share
        </Button>
      </div>

      <div className="h-5 text-sm text-cocoa/70">{toast}</div>

      {/* Printing runs past this screen's arrival, so the outcome (and a retry)
          surfaces here rather than on the Printing screen alone. */}
      <PrintStatus />

      <button
        type="button"
        onClick={reset}
        className="flex items-center gap-3 text-xs uppercase tracking-[0.25em] text-cocoa/40"
      >
        <span className="relative flex h-6 w-6 items-center justify-center">
          <svg viewBox="0 0 36 36" className="absolute h-6 w-6 -rotate-90">
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke="rgba(90,69,82,0.15)"
              strokeWidth="3"
            />
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke="rgb(var(--brand-a))"
              strokeWidth="3"
              strokeDasharray={100}
              strokeDashoffset={100 - (seconds / resetSeconds) * 100}
              pathLength={100}
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
        </span>
        New session in {seconds}s · tap to start over
      </button>
    </div>
  );
}
