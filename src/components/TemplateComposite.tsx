import { useEffect, useState } from "react";
import type { CapturedPhoto, EventTemplate } from "@/types";
import { composeTemplate } from "@/lib/composeTemplate";
import { cn } from "@/lib/cn";

interface Props {
  template: EventTemplate;
  photos: CapturedPhoto[];
  filterCss?: string;
  /** Session code the embedded QR links to. */
  code?: string;
  className?: string;
}

/**
 * Renders the designed template with the guest photos composited in. The
 * composite is async (image decode + canvas), so it's debounced and shown as an
 * <img> — used on the Filter/Preview screens to show the live result.
 */
export function TemplateComposite({
  template,
  photos,
  filterCss,
  code,
  className,
}: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(() => {
      composeTemplate({ template, photos, filterCss, code })
        .then((u) => alive && setUrl(u))
        .catch(() => undefined);
    }, 120);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [template, photos, filterCss, code]);

  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-xl2 bg-white/40",
        className,
      )}
      style={{ aspectRatio: String(template.aspect) }}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-contain" />
      ) : (
        <span className="font-mono text-xs uppercase tracking-widest text-cocoa/40">
          Rendering…
        </span>
      )}
    </div>
  );
}
