import type { StateStorage } from "zustand/middleware";

/**
 * Durable storage for the settings blob.
 *
 * localStorage was losing the host's config on the Tauri desktop/Android
 * builds: the blob (custom stickers, frames, logos as data URLs) can exceed the
 * ~5 MB origin quota, and a failed `setItem` silently dropped the whole write;
 * on Android the WebView also flushes localStorage lazily, so a swipe-away
 * could lose recent changes. IndexedDB has a far larger quota and commits
 * transactionally, so it is the primary store. localStorage is read once as a
 * migration source (and kept as a best-effort mirror when it fits).
 */

const DB = "madshots-settings";
const STORE = "kv";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbp: Promise<IDBDatabase> | null = null;
const db = () => (dbp ??= open());

async function idbGet(key: string): Promise<string | null> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction(STORE).objectStore(STORE).get(key);
    r.onsuccess = () => resolve((r.result as string | undefined) ?? null);
    r.onerror = () => reject(r.error);
  });
}

async function idbSet(key: string, value: string): Promise<void> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, "readwrite");
    t.objectStore(STORE).put(value, key);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

async function idbDel(key: string): Promise<void> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, "readwrite");
    t.objectStore(STORE).delete(key);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export const settingsStorage: StateStorage = {
  getItem: async (name) => {
    try {
      const v = await idbGet(name);
      if (v != null) return v;
    } catch {
      /* IndexedDB unavailable — fall through to localStorage */
    }
    try {
      return localStorage.getItem(name); // legacy data / fallback
    } catch {
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      await idbSet(name, value);
    } catch (e) {
      console.error("settings: IndexedDB write failed", e);
    }
    try {
      localStorage.setItem(name, value);
    } catch {
      /* over quota — IndexedDB already has it */
    }
  },
  removeItem: async (name) => {
    try {
      await idbDel(name);
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

// Ask the WebView not to evict our data under storage pressure.
try {
  void navigator.storage?.persist?.();
} catch {
  /* unsupported */
}
