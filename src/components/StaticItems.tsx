import type { PlacedItem } from "@/types";

/** Non-interactive rendering of placed items — used in preview/printing/QR. */
export function staticItems(items: PlacedItem[]) {
  return items
    .slice()
    .sort((a, b) => a.z - b.z)
    .map((it) => {
      const common = {
        left: `${it.x * 100}%`,
        top: `${it.y * 100}%`,
        transform: `translate(-50%, -50%) rotate(${it.rotation}deg)`,
      } as const;

      if (it.kind === "image") {
        return (
          <img
            key={it.id}
            src={it.content}
            alt=""
            draggable={false}
            className="absolute block"
            style={{ ...common, width: `${16 * it.scale}cqw` }}
          />
        );
      }

      return (
        <span
          key={it.id}
          className="absolute whitespace-nowrap leading-none"
          style={{
            ...common,
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
      );
    });
}
