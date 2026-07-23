/**
 * Photo delivery — Cloudflare (R2 + Worker).
 *
 * `VITE_DELIVERY_BASE` is the deployed Worker's base URL (see cloudflare/ and
 * README → "Photo delivery"). The app uploads the finished composite to
 * `<base>/upload/<code>`, and both the on-screen QR and the receipt's baked QR
 * point to `<base>/s/<code>` — a branded page that shows the photo. The Worker
 * refuses to serve anything older than 24h, so links expire after a day.
 *
 * With no base configured, it falls back to a placeholder link so dev still runs.
 */

export interface PublishResult {
  code: string;
  url: string;
}

const BASE = (import.meta.env.VITE_DELIVERY_BASE || "").replace(/\/+$/, "");
const configured = Boolean(BASE);

export const DeliveryService = {
  isConfigured: configured,

  /** Public viewer URL for a session (works until the 24h expiry). */
  linkFor(code: string): string {
    if (configured) return `${BASE}/s/${code}`;
    return `https://madshotz.link/s/${code}`; // placeholder until cloud is configured
  },

  /** Uploads the composite to the Worker and returns its public link. */
  async publish(code: string, composite: string): Promise<PublishResult> {
    const url = this.linkFor(code);

    if (!configured || !composite) {
      await new Promise((r) => setTimeout(r, 650)); // keep the QR draw-in breathing
      if (!configured) {
        console.info(
          "[MAD SHOT'Z] Cloud delivery not configured — the QR is a placeholder. See README → Photo delivery.",
        );
      }
      return { code, url };
    }

    try {
      const blob = await (await fetch(composite)).blob();
      const res = await fetch(`${BASE}/upload/${code}`, {
        method: "POST",
        headers: { "content-type": "image/jpeg" },
        body: blob,
      });
      if (!res.ok) {
        console.warn(
          "[MAD SHOT'Z] Upload failed:",
          res.status,
          await res.text().catch(() => ""),
        );
      }
    } catch (e) {
      console.warn("[MAD SHOT'Z] Upload error:", e);
    }

    return { code, url };
  },
};
