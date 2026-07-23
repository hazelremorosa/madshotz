import type { PlacedItem } from "@/types";

/** Non-interactive rendering of placed items — used in preview/printing/QR. */
export function staticItems(items: PlacedItem[]) {
  return items
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
    ));
}
