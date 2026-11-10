import { motion } from "framer-motion";
import { useSession } from "@/store/session";
import { copyLimits, overlayOpts, sheetsFor, twoUpFor, useSettings } from "@/store/settings";
import { prevScreen, stepLabel } from "@/lib/flow";
import { activeTemplate } from "@/store/templates";
import { activeFilterCss } from "@/data/filters";
import { FRAME_STYLE_BY_ID } from "@/data/frames";
import { resolveOverlaySrc } from "@/data/overlays";
import { Receipt } from "@/components/Receipt";
import { TemplateComposite } from "@/components/TemplateComposite";
import { staticItems } from "@/components/StaticItems";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/date";

export function PreviewScreen() {
  const layout = useSession((s) => s.layout);
  const photos = useSession((s) => s.photos);
  const theme = useSession((s) => s.theme);
  const code = useSession((s) => s.sessionCode);
  const filterId = useSession((s) => s.filterId);
  const filterIntensity = useSession((s) => s.filterIntensity);
  const beautyOn = useSession((s) => s.beautyOn);
  const frameStyleId = useSession((s) => s.frameStyleId);
  const photoShape = useSession((s) => s.photoShape);
  const overlayId = useSession((s) => s.overlayId);
  const customFrames = useSettings((s) => s.customFrames);
  const items = useSession((s) => s.items);
  const go = useSession((s) => s.go);
  const copies = useSession((s) => s.copies);
  const setCopies = useSession((s) => s.setCopies);
  const printEnabled = useSettings((s) => s.printEnabled && !!s.printer);
  const guestCanChoose = useSettings((s) => s.printCopiesGuestEnabled);
  // Re-read when the host changes the limits.
  useSettings((s) => s.printCopiesMax + s.printCopies);
  const { min, step, def, max } = copyLimits(layout.id);
  const showCopies = printEnabled && guestCanChoose && max > min;
  const qty = Math.min(max, Math.max(min, Math.round((copies > 0 ? copies : def) / step) * step));
  const filterCss = activeFilterCss(filterId, filterIntensity, beautyOn);
  const frameBg = FRAME_STYLE_BY_ID(frameStyleId).bg;
  const frameOverlay = resolveOverlaySrc(overlayId, layout.paperAspect, customFrames, overlayOpts());
  const template = activeTemplate();
  // Back leads to whichever step actually preceded this one — the flow drops
  // any the host switched off, so it's never a screen the guest didn't see.
  const back = prevScreen("preview");
  const fit =
    layout.paperAspect < 1 ? "!w-auto h-full max-w-full" : "w-full max-h-full";

  return (
    <div className="flex h-full w-full flex-col items-center gap-4 px-8 py-8 pt-[max(2rem,calc(env(safe-area-inset-top)+1rem))]">
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="font-mono text-xs uppercase tracking-[0.4em] text-cocoa/50"
      >
        {template ? "Your photo" : "Your receipt"}
      </motion.p>

      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <motion.div
          initial={{ y: "-130%", rotate: -2, opacity: 0 }}
          animate={{ y: 0, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 120, damping: 12, mass: 1.1 }}
          className="flex h-full w-full items-center justify-center"
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.12}
        >
          {template ? (
            <TemplateComposite
              template={template}
              photos={photos}
              filterCss={filterCss}
              code={code}
              className="max-h-full w-full shadow-float"
            />
          ) : (
            <Receipt
              layout={layout}
              photos={photos}
              filterCss={filterCss}
              frameBg={frameBg}
              shape={photoShape}
              frameOverlay={frameOverlay}
              theme={theme}
              code={code}
              dateLabel={formatDate()}
              className={fit}
              overlay={staticItems(items)}
            />
          )}
        </motion.div>
      </div>

      {showCopies && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass-strong flex w-full max-w-sm flex-col items-center gap-2 rounded-xl2 px-5 py-3 shadow-glass"
        >
          <p className="text-sm font-semibold text-cocoa">
            How many copies would you like?
          </p>
          <div className="flex items-center gap-5">
            <button
              type="button"
              aria-label={`${step} fewer`}
              disabled={qty <= min}
              onClick={() => setCopies(qty - step)}
              className="glass flex h-12 w-12 items-center justify-center rounded-full text-2xl font-bold text-cocoa shadow-glass transition-transform active:scale-90 disabled:pointer-events-none disabled:opacity-35"
            >
              −
            </button>
            <span
              aria-live="polite"
              className="brand-text w-14 text-center font-mono text-4xl font-extrabold tabular-nums"
            >
              {qty}
            </span>
            <button
              type="button"
              aria-label={`${step} more`}
              disabled={qty >= max}
              onClick={() => setCopies(qty + step)}
              className="glass flex h-12 w-12 items-center justify-center rounded-full text-2xl font-bold text-cocoa shadow-glass transition-transform active:scale-90 disabled:pointer-events-none disabled:opacity-35"
            >
              +
            </button>
          </div>
          {twoUpFor(layout.id) && (
            <p className="text-[11px] text-cocoa/60">
              2 strips per sheet · {sheetsFor(layout.id, qty)}{" "}
              {sheetsFor(layout.id, qty) === 1 ? "sheet" : "sheets"}
            </p>
          )}
          {qty >= max && (
            <p className="text-[11px] text-cocoa/50">Maximum {max} per order</p>
          )}
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="flex items-center gap-3"
      >
        <Button variant="ghost" onClick={() => go(back, -1)}>
          ← {stepLabel(back)}
        </Button>
        <Button variant="primary" onClick={() => go("printing", 1)} className="px-10">
          {showCopies ? `Print ${qty} ${qty === 1 ? "Copy" : "Copies"} →` : "Print it →"}
        </Button>
      </motion.div>
    </div>
  );
}
