import { create } from "zustand";

/**
 * Durable upload queue (IndexedDB). Every finished composite is stashed here
 * before upload and removed once the Worker confirms it — so a dropped wifi
 * connection never loses a guest's photo. Failed items stay queued and are
 * retried when the network returns (see `startUploadRetry` in lib/delivery).
 *
 * Photos expire after 24h server-side, so queued items older than that are
 * dropped rather than retried forever.
 */

const DB_NAME = "madshots-uploads";
const STORE = "queue";
export const QUEUE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface QueuedUpload {
  code: string;
  blob: Blob;
  ts: number;
  attempts: number;
}

/** Reactive pending count for the Admin UI. */
export const useUploadQueue = create<{ pending: number }>(() => ({ pending: 0 }));

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("no indexeddb"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "code" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const store = db.transaction(STORE, mode).objectStore(STORE);
        const r = run(store);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
  );
}

/** Adds/updates a queued upload. */
export async function queuePut(item: QueuedUpload): Promise<void> {
  try {
    await tx("readwrite", (s) => s.put(item));
    await refreshPending();
  } catch {
    /* IndexedDB unavailable (private mode) — degrade to no queue */
  }
}

/** Removes a queued upload (on success or expiry). */
export async function queueDelete(code: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(code));
    await refreshPending();
  } catch {
    /* ignore */
  }
}

/** All queued uploads (oldest first). */
export async function queueAll(): Promise<QueuedUpload[]> {
  try {
    const items = await tx<QueuedUpload[]>("readonly", (s) => s.getAll());
    return items.sort((a, b) => a.ts - b.ts);
  } catch {
    return [];
  }
}

/** Current pending count. */
export async function queueCount(): Promise<number> {
  try {
    return await tx<number>("readonly", (s) => s.count());
  } catch {
    return 0;
  }
}

/** Refreshes the reactive pending count. */
export async function refreshPending(): Promise<void> {
  const pending = await queueCount();
  useUploadQueue.setState({ pending });
}
