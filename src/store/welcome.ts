import { create } from "zustand";

/**
 * The host's welcome-screen artwork — one image or GIF, shown full-bleed
 * instead of the Mad Shots attract screen.
 *
 * Lives in **IndexedDB**, not the settings blob, and that's the whole point of
 * this module. localStorage is a ~5 MB budget for the entire origin and holds
 * strings only, so a data URL costs its file size +33% base64 — a 20 MB GIF
 * simply can't be written. IndexedDB stores the Blob as-is against a quota
 * measured in hundreds of MB, so the host uploads whatever they have and it
 * works. The page renders it through `URL.createObjectURL`, which keeps a GIF
 * animating (a canvas re-encode would flatten it to frame one).
 *
 * Device-scoped on purpose, and so deliberately absent from `BoothConfig`: the
 * blob can't travel inside a saved event, so an event that switched artwork on
 * would land on another kiosk pointing at a picture that isn't there.
 *
 * Reads are async, so `hydrateWelcome()` runs at boot — `BootScreen` holds for
 * 1.9 s before Welcome, which is far longer than this takes, and the artwork is
 * in place before any guest sees the screen.
 */

const DB_NAME = "madshots-welcome";
const STORE = "media";
/** Cropped copies of the bundled covers, one row per cover id. */
const COVERS = "covers";
/** Single-row store: there's only ever one piece of artwork. */
const KEY = "current";

/** How the artwork was stored — a GIF is kept raw so it keeps moving. */
export type WelcomeKind = "image" | "gif";

interface StoredMedia {
  key: string;
  blob: Blob;
  kind: WelcomeKind;
  /** Original filename, so Admin can show the host what's loaded. */
  name: string;
  ts: number;
}

export interface WelcomeMedia {
  /** Object URL for the blob — safe to drop straight into an `<img src>`. */
  url: string;
  kind: WelcomeKind;
  name: string;
  bytes: number;
}

/** A bundled cover the host re-cut — drawn instead of the original. */
export interface CoverOverride {
  url: string;
  bytes: number;
}

interface WelcomeState {
  media: WelcomeMedia | null;
  /** Cropped replacements for bundled covers, by cover id. */
  covers: Record<string, CoverOverride>;
  /** False until the first read finishes, so Welcome can avoid a flash. */
  ready: boolean;
}

export const useWelcome = create<WelcomeState>(() => ({
  media: null,
  covers: {},
  ready: false,
}));

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("no indexeddb"));
      return;
    }
    // v2 added the cropped-covers store; v1 databases keep their artwork.
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of [STORE, COVERS]) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "key" });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
  name: string = STORE,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const store = db.transaction(name, mode).objectStore(name);
        const r = run(store);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
  );
}

/** Swaps in new artwork, revoking the object URL the old one was using. */
function publish(next: WelcomeMedia | null) {
  const prev = useWelcome.getState().media;
  if (prev && prev.url !== next?.url) URL.revokeObjectURL(prev.url);
  useWelcome.setState({ media: next, ready: true });
}

function toMedia(row: StoredMedia): WelcomeMedia {
  return {
    url: URL.createObjectURL(row.blob),
    kind: row.kind,
    name: row.name,
    bytes: row.blob.size,
  };
}

/** Loads the saved artwork. Called once at boot; safe to call again. */
export async function hydrateWelcome(): Promise<void> {
  try {
    const row = await tx<StoredMedia | undefined>("readonly", (s) => s.get(KEY));
    // Cropped covers load with the artwork, so `ready` means both are in place.
    const rows = await tx<{ key: string; blob: Blob }[]>("readonly", (s) => s.getAll(), COVERS);
    const covers: Record<string, CoverOverride> = {};
    for (const r of rows) {
      covers[r.key] = { url: URL.createObjectURL(r.blob), bytes: r.blob.size };
    }
    useWelcome.setState({ covers });
    publish(row ? toMedia(row) : null);
  } catch {
    // No IndexedDB (private mode, locked-down kiosk) — the booth just shows its
    // own attract screen, which is a working booth, so this stays silent.
    useWelcome.setState({ ready: true });
  }
}

/**
 * Saves an uploaded file as the welcome artwork.
 *
 * Throws on failure rather than degrading quietly: a host who uploads artwork
 * and is told nothing would find out at the event that it never persisted.
 */
export async function saveWelcomeMedia(file: File): Promise<WelcomeMedia> {
  if (!file.type.startsWith("image/")) {
    throw new Error("That file isn't an image or GIF");
  }
  const row: StoredMedia = {
    key: KEY,
    blob: file,
    kind: file.type === "image/gif" ? "gif" : "image",
    name: file.name,
    ts: Date.now(),
  };
  try {
    await tx("readwrite", (s) => s.put(row));
  } catch {
    throw new Error("Couldn't save — this device is out of space");
  }
  const media = toMedia(row);
  publish(media);
  return media;
}

/** Deletes the saved artwork and frees its object URL. */
export async function clearWelcomeMedia(): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(KEY));
  } catch {
    /* nothing stored / no IndexedDB — the publish below still clears the UI */
  }
  publish(null);
}

/** Swaps one cover's cropped copy, revoking the URL it replaces. */
function publishCover(id: string, next: CoverOverride | null) {
  const { covers } = useWelcome.getState();
  const prev = covers[id];
  if (prev) URL.revokeObjectURL(prev.url);
  const { [id]: _gone, ...rest } = covers;
  useWelcome.setState({ covers: next ? { ...rest, [id]: next } : rest });
}

/** Stores a cropped GIF to show in place of bundled cover `id`. */
export async function saveCoverOverride(id: string, blob: Blob): Promise<void> {
  try {
    await tx("readwrite", (s) => s.put({ key: id, blob, ts: Date.now() }), COVERS);
  } catch {
    throw new Error("Couldn't save — this device is out of space");
  }
  publishCover(id, { url: URL.createObjectURL(blob), bytes: blob.size });
}

/** Drops the cropped copy, so the original cover shows again. */
export async function clearCoverOverride(id: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(id), COVERS);
  } catch {
    /* nothing stored — clearing the in-memory copy below is enough */
  }
  publishCover(id, null);
}
