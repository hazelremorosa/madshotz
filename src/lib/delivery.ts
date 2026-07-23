/**
 * Delivery is stubbed for this frontend-only build. The QR encodes a SESSION
 * CODE (never a file path). Swap this implementation for a real uploader/CDN
 * later without touching any screen — the interface stays the same.
 */

export interface PublishResult {
  code: string;
  url: string;
}

const BASE = "https://madshotz.link";

export const DeliveryService = {
  /** Pretend to upload; return the shareable link for a session code. */
  async publish(code: string, _composite: string): Promise<PublishResult> {
    // Simulate a short network round-trip so the QR "draw-in" has room to breathe.
    await new Promise((r) => setTimeout(r, 650));
    return { code, url: `${BASE}/s/${code}` };
  },

  linkFor(code: string): string {
    return `${BASE}/s/${code}`;
  },
};
