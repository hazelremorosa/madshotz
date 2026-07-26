import {
  QUEUE_MAX_AGE_MS,
  queueAll,
  queueDelete,
  queuePut,
  refreshPending,
} from "@/lib/uploadQueue";
import { useSettings } from "@/store/settings";

/**
 * Photo delivery — Cloudflare (R2 + Worker).
 *
 * `VITE_DELIVERY_BASE` is the deployed Worker's base URL (see cloudflare/ and
 * README → "Photo delivery"). The app uploads the finished composite to
 * `<base>/upload/<code>`, and both the on-screen QR and the receipt's baked QR
 * point to `<base>/s/<code>` — a branded page that shows the photo. The Worker
 * refuses to serve anything older than 24h, so links expire after a day.
 *
 * Uploads go through a durable IndexedDB queue: the composite is stashed before
 * upload and removed once confirmed, so a dropped connection never loses a
 * photo — it retries automatically when the network returns.
 *
 * With no base configured, it falls back to a placeholder link so dev still runs.
 *
 * The host can also switch uploads off from Admin → System → Development. That
 * is stronger than being offline: offline *queues* for later, whereas switched
 * off never touches the network or the queue at all, so a development session
 * can't quietly bank a pile of test photos that all flush to R2 the moment it's
 * switched back on.
 */

export interface PublishResult {
  code: string;
  url: string;
  /** True if the upload couldn't be confirmed and is queued for retry. */
  pending: boolean;
}

const BASE = (import.meta.env.VITE_DELIVERY_BASE || "").replace(/\/+$/, "");
const configured = Boolean(BASE);

async function blobFromDataUrl(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

/** Raw upload to the Worker. Returns true only on a confirmed 2xx. */
async function uploadBlob(code: string, blob: Blob): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/upload/${code}`, {
      method: "POST",
      headers: { "content-type": blob.type || "image/jpeg" },
      body: blob,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Whether photos should actually be uploaded right now. */
export function uploadsEnabled(): boolean {
  return configured && useSettings.getState().cloudUploadEnabled;
}

export const DeliveryService = {
  isConfigured: configured,

  /** Public viewer URL for a session (works until the 24h expiry). */
  linkFor(code: string): string {
    if (configured) return `${BASE}/s/${code}`;
    return `https://madshotz.link/s/${code}`; // placeholder until cloud is configured
  },

  /**
   * Persists the composite to the retry queue, then tries to upload it now.
   * Returns `pending: true` if the upload didn't confirm (offline / error) —
   * it stays queued and syncs later.
   */
  async publish(code: string, composite: string): Promise<PublishResult> {
    const url = this.linkFor(code);

    // Development switch: behave as though the upload happened, but touch
    // nothing. Not queued — see the note at the top of this file.
    if (configured && !useSettings.getState().cloudUploadEnabled) {
      await new Promise((r) => setTimeout(r, 650)); // keep the QR draw-in breathing
      console.info(
        "[Mad Shots] Cloud upload is OFF (Admin → System → Development). " +
          `Nothing was uploaded and this QR will not resolve: ${url}`,
      );
      return { code, url, pending: false };
    }

    if (!configured || !composite) {
      await new Promise((r) => setTimeout(r, 650)); // keep the QR draw-in breathing
      if (!configured) {
        console.info(
          "[Mad Shots] Cloud delivery not configured — the QR is a placeholder. See README → Photo delivery.",
        );
      }
      return { code, url, pending: false };
    }

    let blob: Blob;
    try {
      blob = await blobFromDataUrl(composite);
    } catch {
      return { code, url, pending: false };
    }

    // Stash first so an interrupted upload is never lost.
    await queuePut({ code, blob, ts: Date.now(), attempts: 0 });

    const ok = navigator.onLine && (await uploadBlob(code, blob));
    if (ok) {
      await queueDelete(code);
      return { code, url, pending: false };
    }
    return { code, url, pending: true };
  },
};

let draining = false;

/** Uploads everything in the queue that can still be delivered. */
export async function drainUploadQueue(): Promise<void> {
  // Checked here rather than only at the call sites, so the retry timer, the
  // "online" listener and the Admin "Retry now" button all respect the switch.
  if (!uploadsEnabled() || draining || !navigator.onLine) return;
  draining = true;
  try {
    const items = await queueAll();
    for (const item of items) {
      if (Date.now() - item.ts > QUEUE_MAX_AGE_MS) {
        // Link would have expired anyway — drop it.
        await queueDelete(item.code);
        continue;
      }
      const ok = await uploadBlob(item.code, item.blob);
      if (ok) {
        await queueDelete(item.code);
      } else {
        await queuePut({ ...item, attempts: item.attempts + 1 });
        if (!navigator.onLine) break; // stop trying until back online
      }
    }
  } finally {
    draining = false;
    await refreshPending();
  }
}

/** Wires up automatic retry: on boot, whenever the network returns, and on a timer. */
export function startUploadRetry(): void {
  void refreshPending();
  if (!configured) return;
  void drainUploadQueue();
  window.addEventListener("online", () => void drainUploadQueue());
  window.setInterval(() => void drainUploadQueue(), 30_000);
}
