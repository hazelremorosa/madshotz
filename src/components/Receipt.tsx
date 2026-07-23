import { forwardRef, type ReactNode } from "react";
import type { CapturedPhoto, LayoutDef, PhotoShape, Theme } from "@/types";
import { FrameStack } from "@/components/FrameStack";
import { MiniQR } from "@/components/MiniQR";
import { DeliveryService } from "@/lib/delivery";
import { cn } from "@/lib/cn";

interface Props {
  layout: LayoutDef;
  photos: CapturedPhoto[];
  filterCss: string;
  theme: Theme;
  code: string;
  dateLabel: string;
  activeIndex?: number;
  /** CSS background for the mat/frame behind the photos. */
  frameBg?: string;
  shape?: PhotoShape;
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
    code,
    dateLabel,
    activeIndex,
    frameBg,
    shape = "rounded",
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

      {/* Header — subtle wordmark */}
      <div className="px-[6cqw] pt-[5cqw] text-center">
        <div className="font-mono text-[3.2cqw] font-semibold uppercase tracking-[0.4em] text-paper-ink/60">
          MAD SHOTS
        </div>
        <div className="mt-[2.5cqw] border-t border-dashed border-paper-ink/30" />
      </div>

      {/* Frames (with mat) */}
      <div className="min-h-0 flex-1 px-[6cqw] py-[4cqw]">
        <div
          className="h-full w-full rounded-[3.5cqw] p-[3cqw]"
          style={frameBg ? { background: frameBg } : undefined}
        >
          <FrameStack
            layout={layout}
            photos={photos}
            filterCss={filterCss}
            shape={shape}
            activeIndex={activeIndex}
          />
        </div>
      </div>

      {/* Footer — small QR + details */}
      <div className="px-[6cqw] pb-[6cqw] text-center">
        <div className="mb-[3cqw] border-t border-dashed border-paper-ink/30" />
        <MiniQR
          text={DeliveryService.linkFor(code)}
          className="mx-auto h-[15cqw] w-[15cqw]"
        />
        <div className="mt-[2.5cqw] font-mono text-[3cqw] tracking-widest text-paper-ink/60">
          NO. {code} · {dateLabel}
        </div>
        <div className="mt-[1cqw] font-mono text-[3cqw] tracking-widest text-paper-ink/40">
          SCAN FOR YOUR PHOTOS ♥
        </div>
      </div>

      {/* Decoration overlay — normalized to full paper (matches compose). */}
      <div className="absolute inset-0 overflow-hidden rounded-[6px]">
        {overlay}
      </div>
    </div>
  );
});
