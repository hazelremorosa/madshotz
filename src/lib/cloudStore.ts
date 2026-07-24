/**
 * Durable cloud storage for admin data (events + their templates) via the
 * delivery Worker's KV-backed collections API. Unlike session photos (which
 * expire after 24h), these are permanent, so the events list is available on
 * any kiosk that points at the same Worker.
 *
 * Uses the same `VITE_DELIVERY_BASE` as photo delivery. With no base configured
 * it no-ops gracefully and the app falls back to local-only (localStorage).
 */

const BASE = (import.meta.env.VITE_DELIVERY_BASE || "").replace(/\/+$/, "");

/** Whether cloud sync is available (a Worker base URL is configured). */
export const cloudEnabled = Boolean(BASE);

/** Fetches every item in a collection, or null if unavailable/offline. */
export async function cloudList<T>(collection: string): Promise<T[] | null> {
  if (!BASE) return null;
  try {
    const res = await fetch(`${BASE}/kv/${collection}`);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? (data as T[]) : null;
  } catch {
    return null;
  }
}

/** Upserts one item. Returns true on success. */
export async function cloudPut(
  collection: string,
  id: string,
  obj: unknown,
): Promise<boolean> {
  if (!BASE) return false;
  try {
    const res = await fetch(`${BASE}/kv/${collection}/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(obj),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Deletes one item. Returns true on success. */
export async function cloudRemove(collection: string, id: string): Promise<boolean> {
  if (!BASE) return false;
  try {
    const res = await fetch(`${BASE}/kv/${collection}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return res.ok;
  } catch {
    return false;
  }
}
