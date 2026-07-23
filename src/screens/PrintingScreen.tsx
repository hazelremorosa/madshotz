import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useSession } from "@/store/session";
import { FILTER_BY_ID } from "@/data/filters";
import { FRAME_STYLE_BY_ID } from "@/data/frames";
import { Receipt } from "@/components/Receipt";
import { staticItems } from "@/components/StaticItems";
import { composeReceipt } from "@/lib/compose";
import { formatDate } from "@/lib/date";
import { sfx } from "@/lib/sound";

const CAPTIONS = [
  "Warming up the paper…",
  "Developing your shots…",
  "Adding the magic…",
  "Almost yours…",
];

const DURATION = 3000;

export function PrintingScreen() {
  const layout = useSession((s) => s.layout);
  const photos = useSession((s) => s.photos);
  const theme = useSession((s) => s.theme);
  const code = useSession((s) => s.sessionCode);
  const filterId = useSession((s) => s.filterId);
  const frameStyleId = useSession((s) => s.frameStyleId);
  const photoShape = useSession((s) => s.photoShape);
  const items = useSession((s) => s.items);
  const setComposite = useSession((s) => s.setComposite);
  const soundOn = useSession((s) => s.soundOn);
  const go = useSession((s) => s.go);
  const filterCss = FILTER_BY_ID(filterId).css;
  const frameStyle = FRAME_STYLE_BY_ID(frameStyleId);

  const [caption, setCaption] = useState(0);

  useEffect(() => {
    let alive = true;
    if (soundOn) sfx.print();

    composeReceipt({
      photos,
      layout,
      filterCss,
      frameStyle,
      shape: photoShape,
      items,
      theme,
      code,
      dateLabel: formatDate(),
    })
      .then((url) => alive && setComposite(url))
      .catch(() => undefined);

    const capIv = window.setInterval(
      () => setCaption((c) => (c + 1) % CAPTIONS.length),
      DURATION / CAPTIONS.length,
    );
    const done = window.setTimeout(() => alive && go("qr", 1), DURATION + 200);
    return () => {
      alive = false;
      window.clearInterval(capIv);
      window.clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-8 px-10">
      {/* Printer slot */}
      <div className="relative w-full max-w-[300px]">
        <div className="mx-auto h-4 w-[92%] rounded-full bg-cocoa/20 shadow-[inset_0_2px_6px_rgba(90,69,82,0.3)]" />
        <div className="mx-auto -mt-1 h-1 w-[80%] rounded-full bg-cocoa/30" />

        {/* Feeding receipt */}
        <div className="relative mx-auto mt-3 w-[86%] overflow-hidden">
          <motion.div
            initial={{ clipPath: "inset(100% 0 0 0)" }}
            animate={{ clipPath: "inset(0% 0 0 0)" }}
            transition={{ duration: DURATION / 1000, ease: "easeInOut" }}
          >
            <Receipt
              layout={layout}
              photos={photos}
              filterCss={filterCss}
              frameBg={frameStyle.bg}
              shape={photoShape}
              theme={theme}
              code={code}
              dateLabel={formatDate()}
              overlay={staticItems(items)}
            />
          </motion.div>
          {/* print-head glow sweeping down */}
          <motion.div
            className="pointer-events-none absolute inset-x-0 h-10 bg-gradient-to-b from-transparent via-white/40 to-transparent blur-md"
            initial={{ top: "-10%" }}
            animate={{ top: "100%" }}
            transition={{ duration: DURATION / 1000, ease: "easeInOut" }}
          />
        </div>
      </div>

      {/* Progress + caption */}
      <div className="w-full max-w-[260px]">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-cocoa/10">
          <motion.div
            className="h-full brand-fill"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: DURATION / 1000, ease: "easeInOut" }}
          />
        </div>
        <motion.p
          key={caption}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 text-center text-sm font-medium text-cocoa/80"
        >
          {CAPTIONS[caption]}
        </motion.p>
      </div>
    </div>
  );
}
