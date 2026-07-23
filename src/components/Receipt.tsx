import { forwardRef, type ReactNode } from "react";
import type { CapturedPhoto, LayoutDef, Theme } from "@/types";
import { FrameStack } from "@/components/FrameStack";
import { cn } from "@/lib/cn";

interface Props {
  layout: LayoutDef;
  photos: CapturedPhoto[];
  filterCss: string;
  theme: Theme;
  code: string;
  dateLabel: string;
  activeIndex?: number;
  /** Interactive overlay (editor) or static items (preview). */
  overlay?: ReactNode;
  className?: string;
}

function TearStrip({ side }: { side: "top" | "bottom" }) {
  return (
    <div
      className="absolute inset-x-0 h-2"
      style={{
        [side]: "-7px",
        background:
          "linear-gradient(135deg, transparent 50%, #f8f4ea 50%), linear-gradient(225deg, transparent 50%, #f8f4ea 50%)",
        backgroundSize: "12px 12px",
        backgroundRepeat: "repeat-x",
        backgroundPosition: side === "top" ? "bottom" : "top",
      }}
    />
  );
}

/** The hero receipt — paper, header, frames, footer, and decoration overlay. */
export const Receipt = forwardRef<HTMLDivElement, Props>(function Receipt(
  {
    layout,
    photos,
    filterCss,
    theme,
    code,
    dateLabel,
    activeIndex,
    overlay,
    className,
  },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "paper relative mx-auto flex w-full flex-col rounded-[6px] shadow-paper [container-type:inline-size]",
        className,
      )}
      style={{ aspectRatio: String(layout.paperAspect) }}
    >
      <TearStrip side="top" />
      <TearStrip side="bottom" />

      {/* Header */}
      <div className="px-[6cqw] pt-[5cqw] text-center">
        <div className="text-[7cqw] font-extrabold leading-none tracking-tight text-paper-ink">
          MAD SHOT'Z
        </div>
        <div className="mt-[1.5cqw] font-mono text-[3cqw] uppercase tracking-[0.3em] text-paper-ink/50">
          {theme.header}
        </div>
        <div className="mt-[3cqw] border-t border-dashed border-paper-ink/30" />
      </div>

      {/* Frames */}
      <div className="min-h-0 flex-1 px-[6cqw] py-[4cqw]">
        <FrameStack
          layout={layout}
          photos={photos}
          filterCss={filterCss}
          activeIndex={activeIndex}
        />
      </div>

      {/* Footer */}
      <div className="px-[6cqw] pb-[6cqw] text-center">
        <div className="mb-[3cqw] border-t border-dashed border-paper-ink/30" />
        <div
          className="mx-auto h-[9cqw] w-[70%]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, #211d17 0 2px, transparent 2px 4px, #211d17 4px 5px, transparent 5px 9px)",
          }}
        />
        <div className="mt-[3cqw] font-mono text-[3cqw] tracking-widest text-paper-ink/60">
          NO. {code} · {dateLabel}
        </div>
        <div className="mt-[1cqw] font-mono text-[3cqw] tracking-widest text-paper-ink/40">
          ★ THANK YOU FOR VISITING ★
        </div>
      </div>

      {/* Decoration overlay — normalized to full paper (matches compose). */}
      <div className="absolute inset-0 overflow-hidden rounded-[6px]">
        {overlay}
      </div>
    </div>
  );
});
