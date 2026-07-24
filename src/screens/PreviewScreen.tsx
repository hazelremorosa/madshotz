import { motion } from "framer-motion";
import { useSession } from "@/store/session";
import { activeFilterCss } from "@/data/filters";
import { FRAME_STYLE_BY_ID } from "@/data/frames";
import { Receipt } from "@/components/Receipt";
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
  const items = useSession((s) => s.items);
  const go = useSession((s) => s.go);
  const filterCss = activeFilterCss(filterId, filterIntensity, beautyOn);
  const frameBg = FRAME_STYLE_BY_ID(frameStyleId).bg;
  const fit =
    layout.paperAspect < 1 ? "!w-auto h-full max-w-full" : "w-full max-h-full";

  return (
    <div className="flex h-full w-full flex-col items-center gap-4 px-8 py-8 pt-[max(2rem,calc(env(safe-area-inset-top)+1rem))]">
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="font-mono text-xs uppercase tracking-[0.4em] text-cocoa/50"
      >
        Your receipt
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
          <Receipt
            layout={layout}
            photos={photos}
            filterCss={filterCss}
            frameBg={frameBg}
            shape={photoShape}
            theme={theme}
            code={code}
            dateLabel={formatDate()}
            className={fit}
            overlay={items
            .slice()
            .sort((a, b) => a.z - b.z)
            .map((it) => (
              <span
                key={it.id}
                className="absolute whitespace-nowrap leading-none"
                style={{
                  left: `${it.x * 100}%`,
                  top: `${it.y * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${it.rotation}deg)`,
                  fontSize:
                    it.kind === "sticker"
                      ? `${12 * it.scale}cqw`
                      : `${5 * it.scale}cqw`,
                  fontWeight: it.kind === "text" ? 800 : undefined,
                  color: it.kind === "text" ? "#211d17" : undefined,
                }}
              >
                {it.content}
              </span>
            ))}
          />
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="flex items-center gap-3"
      >
        <Button variant="ghost" onClick={() => go("editor", -1)}>
          ← Edit
        </Button>
        <Button variant="primary" onClick={() => go("printing", 1)} className="px-10">
          Print it →
        </Button>
      </motion.div>
    </div>
  );
}
