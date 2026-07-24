import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSession } from "@/store/session";
import { useSettings } from "@/store/settings";
import { activeFilterCss } from "@/data/filters";
import { STICKER_PACKS } from "@/data/stickers";
import { FRAME_STYLE_BY_ID } from "@/data/frames";
import { overlaySrc } from "@/data/overlays";
import type { StickerPack } from "@/types";
import { Receipt } from "@/components/Receipt";
import { EditorItem } from "@/components/EditorItem";
import { ActionBar } from "@/components/shell/ActionBar";
import { formatDate } from "@/lib/date";
import { sfx } from "@/lib/sound";
import { cn } from "@/lib/cn";

type Tab = "stickers" | "text";

export function EditorScreen() {
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
  const customStickers = useSettings((s) => s.customStickers);
  const items = useSession((s) => s.items);
  const selectedId = useSession((s) => s.selectedItemId);
  const addItem = useSession((s) => s.addItem);
  const removeItem = useSession((s) => s.removeItem);
  const updateItem = useSession((s) => s.updateItem);
  const selectItem = useSession((s) => s.selectItem);
  const clearItems = useSession((s) => s.clearItems);
  const soundOn = useSession((s) => s.soundOn);
  const go = useSession((s) => s.go);

  const paperRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("stickers");
  const [sheet, setSheet] = useState(false);
  const [draft, setDraft] = useState("");

  // Featured (theme) → the host's own uploads (if any) → the shared library.
  const packs = useMemo<StickerPack[]>(
    () => [
      { id: "featured", name: "Featured", tab: theme.emoji, glyphs: theme.stickers },
      ...(customStickers.length
        ? [{ id: "custom", name: "Yours", tab: "🖼️", glyphs: [] } as StickerPack]
        : []),
      ...STICKER_PACKS,
    ],
    [theme, customStickers.length],
  );
  const [packId, setPackId] = useState("featured");
  const activePack = packs.find((p) => p.id === packId) ?? packs[0];

  const filterCss = activeFilterCss(filterId, filterIntensity, beautyOn);
  const frameBg = FRAME_STYLE_BY_ID(frameStyleId).bg;
  const frameOverlay = overlaySrc(overlayId, layout.paperAspect);
  const fit =
    layout.paperAspect < 1 ? "!w-auto h-full max-w-full" : "w-full max-h-full";

  const rnd = () => (Math.random() - 0.5) * 0.14;

  const addSticker = (glyph: string) => {
    addItem({ kind: "sticker", content: glyph, x: 0.5 + rnd(), y: 0.45 + rnd(), scale: 1, rotation: 0 });
    if (soundOn) sfx.pop();
  };
  const addImageSticker = (url: string) => {
    addItem({ kind: "image", content: url, x: 0.5 + rnd(), y: 0.45 + rnd(), scale: 1, rotation: 0 });
    if (soundOn) sfx.pop();
  };
  const addText = (content: string, top = false) => {
    if (!content.trim()) return;
    addItem({ kind: "text", content: content.toUpperCase(), x: 0.5, y: top ? 0.16 : 0.86, scale: 1, rotation: 0 });
    if (soundOn) sfx.pop();
  };

  const selected = items.find((i) => i.id === selectedId) ?? null;
  const duplicate = () => {
    if (!selected) return;
    addItem({ ...selected, x: selected.x + 0.05, y: selected.y + 0.05 });
  };
  const bringForward = () => {
    if (!selected) return;
    const maxZ = items.reduce((m, i) => Math.max(m, i.z), 0);
    updateItem(selected.id, { z: maxZ + 1 });
  };

  return (
    <div className="flex h-full w-full flex-col pt-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))]">
      <div className="px-8 text-center">
        <h2 className="text-2xl font-extrabold tracking-tight text-cocoa">
          Make it <span className="brand-text">yours</span>
        </h2>
      </div>

      {/* Context toolbar */}
      <div className="flex h-10 items-center justify-center">
        <AnimatePresence>
          {selected && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="glass-strong flex items-center gap-1 rounded-full p-1"
            >
              <ToolBtn label="Duplicate" onClick={duplicate}>⧉</ToolBtn>
              <ToolBtn label="Forward" onClick={bringForward}>⬆</ToolBtn>
              <ToolBtn label="Delete" danger onClick={() => removeItem(selected.id)}>🗑</ToolBtn>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Canvas */}
      <div
        className="flex min-h-0 flex-1 items-center justify-center px-10 py-1"
        onPointerDown={() => selectItem(null)}
      >
        <div className="flex h-full w-full items-center justify-center">
          <Receipt
            ref={paperRef}
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
            overlay={
              <AnimatePresence>
                {items.map((it) => (
                  <EditorItem
                    key={it.id}
                    item={it}
                    paperRef={paperRef}
                    selected={selectedId === it.id}
                  />
                ))}
              </AnimatePresence>
            }
          />
        </div>
      </div>

      {/* Tool dock */}
      <div className="mb-28 px-4">
        <div className="glass-strong rounded-xl2 p-3">
          <div className="mb-3 flex items-center justify-center gap-2">
            {(["stickers", "text"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition-colors",
                  tab === t ? "brand-fill text-white" : "text-cocoa/60",
                )}
              >
                {t}
              </button>
            ))}
            <button
              type="button"
              onClick={clearItems}
              className="ml-auto text-xs uppercase tracking-widest text-cocoa/40"
            >
              Reset
            </button>
          </div>

          {tab === "stickers" ? (
            <div className="flex flex-col gap-2">
              {/* Pack selector */}
              <div className="no-bar flex gap-1.5 overflow-x-auto pb-0.5">
                {packs.map((p) => {
                  const on = p.id === packId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPackId(p.id)}
                      aria-pressed={on}
                      title={p.name}
                      className={cn(
                        "relative flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-lg transition-colors",
                        on ? "brand-fill" : "bg-cocoa/5",
                      )}
                    >
                      <span>{p.tab}</span>
                      <span
                        className={cn(
                          "text-[11px] font-semibold",
                          on ? "text-white" : "text-cocoa/60",
                        )}
                      >
                        {p.name}
                      </span>
                      {p.seasonal && (
                        <span className="absolute -right-0.5 -top-0.5 text-[9px]">
                          ✦
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {/* Glyphs (or the host's uploaded PNGs) for the active pack */}
              <div className="no-bar flex gap-2 overflow-x-auto pb-1">
                {activePack.id === "custom"
                  ? customStickers.map((cs) => (
                      <motion.button
                        key={cs.id}
                        type="button"
                        whileTap={{ scale: 0.85 }}
                        onClick={() => addImageSticker(cs.url)}
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-cocoa/5 p-1.5"
                      >
                        <img
                          src={cs.url}
                          alt=""
                          className="max-h-full max-w-full object-contain"
                        />
                      </motion.button>
                    ))
                  : activePack.glyphs.map((g, i) => (
                      <motion.button
                        key={`${activePack.id}-${i}`}
                        type="button"
                        whileTap={{ scale: 0.85 }}
                        onClick={() => addSticker(g)}
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-cocoa/5 text-3xl"
                      >
                        {g}
                      </motion.button>
                    ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Chip onClick={() => addText(theme.header, true)}>{theme.header}</Chip>
              <Chip onClick={() => addText(formatDate())}>Date</Chip>
              <Chip onClick={() => addText("LOVE THIS")}>Love this</Chip>
              <Chip onClick={() => setSheet(true)} accent>
                + Custom
              </Chip>
            </div>
          )}
        </div>
      </div>

      <ActionBar
        onBack={() => go("filter", -1)}
        primaryLabel="Preview"
        onPrimary={() => {
          selectItem(null);
          go("preview", 1);
        }}
      />

      {/* Custom text sheet */}
      <AnimatePresence>
        {sheet && (
          <motion.div
            className="absolute inset-0 z-50 flex items-end bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onPointerDown={() => setSheet(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onPointerDown={(e) => e.stopPropagation()}
              className="glass-strong w-full rounded-t-xl3 p-6 pb-10"
            >
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-cocoa/20" />
              <input
                autoFocus
                value={draft}
                maxLength={24}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type something…"
                className="w-full rounded-2xl bg-cocoa/5 px-5 py-4 text-lg text-cocoa outline-none placeholder:text-cocoa/40"
              />
              <button
                type="button"
                onClick={() => {
                  addText(draft);
                  setDraft("");
                  setSheet(false);
                }}
                className="mt-4 w-full rounded-full brand-fill py-4 font-semibold text-white"
              >
                Add to receipt
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ToolBtn({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full text-lg",
        danger ? "bg-red-400 text-white" : "bg-cocoa/5 text-cocoa",
      )}
    >
      {children}
    </button>
  );
}

function Chip({
  children,
  onClick,
  accent,
}: {
  children: React.ReactNode;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-4 py-2 text-sm font-semibold",
        accent ? "brand-fill text-white" : "bg-cocoa/5 text-cocoa",
      )}
    >
      {children}
    </button>
  );
}
