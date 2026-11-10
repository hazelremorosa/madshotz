import { create } from "zustand";
import { bitmap1ToDataUrl, imageToBitmap1 } from "@/lib/dither";
import { isAndroidApp } from "@/lib/native";
import { systemPrintImage } from "@/lib/systemPrint";
import { tsplImageJob, type JobOpts } from "@/lib/tspl";
import { zplImageJob } from "@/lib/zpl";
import { useSettings } from "@/store/settings";
import { escposImageJob } from "./escpos";
import { renderPage, testPage } from "./layout";
import * as nativePrint from "./native";
import { useSession } from "@/store/session";
import {
  defaultPaperId,
  isStripLayout,
  resolvePaper,
  stripPaper,
  type Paper,
} from "./paper";
import type {
  FoundPrinter,
  PrinterHealth,
  PrinterLanguage,
  SavedPrinter,
} from "./types";

/**
 * The booth's printer layer.
 *
 * One pipeline for every printer: the composite is laid out on the chosen
 * paper (`renderPage`), then either sent as a picture (IPP, the print dialog)
 * or halftoned and wrapped in the printer's command language (ESC/POS, TSPL,
 * ZPL) and delivered as bytes over USB, Bluetooth or the network.
 *
 * Network printers are the main event: over IPP the tablet prints straight to
 * any modern Wi-Fi printer with no dialog, then follows the job until paper
 * comes out — so the booth can tell a guest "Printed ♥" and mean it.
 */

/** Photo printers: 300 dpi is what their drivers rasterise at anyway. */
const IMAGE_DPI = 300;
/** Thermal heads are almost all 203 dpi (8 dots/mm). */
const THERMAL_DPI = 203;
/** Long enough for an inkjet to finish a borderless 4×6 at high quality. */
const JOB_TIMEOUT_MS = 6 * 60_000;

export type JobStatus =
  "idle" | "preparing" | "sending" | "printing" | "done" | "error";

interface PrinterState {
  status: JobStatus;
  /** Human description of what's happening, or of the last failure. */
  message: string;
  /** 0…1 while bytes stream to a raw printer. */
  progress: number;
  /**
   * The composite this store last attempted, and the one it last printed
   * successfully — so the guest-facing line only ever talks about *this*
   * guest's photo, never the previous one's.
   */
  lastJobSource: string;
  lastPrintedSource: string;
  health: PrinterHealth | null;

  // Search
  searching: boolean;
  found: FoundPrinter[];
  /** False when Bluetooth permission was refused, so only Wi-Fi/USB were searched. */
  searchedBluetooth: boolean;

  search: () => Promise<void>;
  addByAddress: (host: string) => Promise<FoundPrinter | null>;
  choose: (p: FoundPrinter, language?: PrinterLanguage) => Promise<boolean>;
  forget: () => Promise<void>;
  setLanguage: (language: PrinterLanguage) => void;
  refreshHealth: () => Promise<void>;
  /** Prints a composite. Resolves false (never throws) so the flow can't stall. */
  print: (dataUrl: string) => Promise<boolean>;
  printTest: () => Promise<boolean>;
}

/** Jobs are serialised: two prints must never interleave on one printer. */
let chain: Promise<unknown> = Promise.resolve();
function queue<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** The print dialog — the only printer a browser tab (the PWA) can reach. */
export const SYSTEM_PRINTER: SavedPrinter = {
  id: "system",
  name: isAndroidApp() ? "Android print dialog" : "Browser print dialog",
  connection: "system",
  language: "image",
  detail: isAndroidApp()
    ? "Any printer with an Android print plugin — shows a dialog each time"
    : "Shows the browser's print dialog each time",
};

// ── Rendering ────────────────────────────────────────────────────────────────

function settings() {
  return useSettings.getState();
}

export function currentPaper(): Paper {
  const s = settings();
  // Strip layouts switch to the 2×6" paper on their own, when the printer has it.
  if (s.printAutoPaper && isStripLayout(useSession.getState().layout.id)) {
    const strip = stripPaper(s.printer);
    if (strip) return strip;
  }
  return resolvePaper(s.printer, s.printPaperId);
}

/** The composite laid out on the page at the printer's resolution. */
async function layoutFor(dataUrl: string, printer: SavedPrinter, paper: Paper) {
  const s = settings();
  const thermal = printer.language !== "image";
  const dpi = thermal ? THERMAL_DPI : IMAGE_DPI;
  const px = (mm: number) => Math.round((mm / 25.4) * dpi);
  // Rolls print across their printable width; ESC/POS wants whole bytes.
  const widthMm = paper.printableMm ?? paper.widthMm;
  const widthPx = thermal ? Math.floor(px(widthMm) / 8) * 8 : px(widthMm);
  const borderless =
    !thermal && s.printBorderless && !!printer.caps?.borderless;
  return renderPage(dataUrl, {
    widthPx,
    heightPx: paper.heightMm > 0 ? px(paper.heightMm) : 0,
    marginPx: borderless ? 0 : px(s.printMarginMm),
    fit: s.printFit,
    rotate: s.printRotate,
    twoUp: s.printTwoUp,
  });
}

async function halftone(page: HTMLCanvasElement) {
  const s = settings();
  return imageToBitmap1(page.toDataURL("image/png"), {
    widthDots: page.width,
    heightDots: page.height,
    mode: s.ditherMode,
    threshold: s.ditherThreshold,
    brightness: s.printBrightness,
    contrast: s.printContrast,
  });
}

/** What will come out of the printer, for the Admin preview. */
export async function renderPreview(dataUrl: string): Promise<string> {
  const printer = settings().printer ?? SYSTEM_PRINTER;
  const page = await layoutFor(dataUrl, printer, currentPaper());
  if (printer.language === "image") return page.toDataURL("image/jpeg", 0.85);
  return bitmap1ToDataUrl(await halftone(page));
}

function rawJob(
  printer: SavedPrinter,
  paper: Paper,
  bitmap: Awaited<ReturnType<typeof halftone>>,
) {
  const s = settings();
  if (printer.language === "escpos")
    return escposImageJob(bitmap, { copies: s.printCopies, cut: s.printCut });
  const opts: JobOpts = {
    // A roll on a label printer: one label exactly as tall as the photo.
    stock: {
      widthMm: paper.widthMm,
      heightMm:
        paper.heightMm > 0
          ? paper.heightMm
          : (bitmap.height / THERMAL_DPI) * 25.4,
      gapMm: paper.heightMm > 0 ? s.labelGapMm : 0,
    },
    density: s.printDensity,
    speed: s.printSpeed,
    copies: s.printCopies,
    invertRaster: s.printInvertRaster,
  };
  return printer.language === "zpl"
    ? zplImageJob(bitmap, opts)
    : tsplImageJob(bitmap, opts);
}

// ── Human-readable printer problems ─────────────────────────────────────────

const REASONS: Record<string, string> = {
  "media-empty": "Out of paper",
  "media-needed": "Load paper",
  "media-jam": "Paper jam",
  "media-low": "Paper running low",
  "marker-supply-empty": "Out of ink",
  "marker-supply-low": "Ink running low",
  "toner-empty": "Out of toner",
  "toner-low": "Toner running low",
  "marker-waste-full": "Ink waste box full",
  "cover-open": "Cover open",
  "door-open": "Cover open",
  "input-tray-missing": "Paper tray missing",
  "output-tray-missing": "Output tray missing",
  "output-area-full": "Output tray full",
  paused: "Printer paused",
  offline: "Printer offline",
  shutdown: "Printer switched off",
  "spool-area-full": "Printer busy — memory full",
  "connecting-to-device": "Connecting to the printer",
};

/** `media-empty-error` → "Out of paper". Unknown reasons are prettified. */
export function describeReason(r: string): string {
  const base = r.replace(/-(error|warning|report)$/, "");
  return (
    REASONS[base] ??
    base.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

/** Reasons a host must act on (errors), not merely be told about. */
export function blockingReasons(reasons: string[]): string[] {
  return reasons.filter(
    (r) => !r.endsWith("-report") && !r.endsWith("-warning"),
  );
}

// ── Store ────────────────────────────────────────────────────────────────────

export const usePrinter = create<PrinterState>()((set, get) => {
  async function run(source: string, dataUrl: string): Promise<boolean> {
    const s = settings();
    const printer = s.printer;
    set({
      lastJobSource: source,
      status: "preparing",
      progress: 0,
      message: "Preparing the print…",
    });
    if (!printer) {
      set({
        status: "error",
        message: "No printer chosen. Pick one in Admin → System → Printer.",
      });
      return false;
    }
    const paper = currentPaper();
    try {
      const page = await layoutFor(dataUrl, printer, paper);

      if (printer.connection === "system") {
        set({ status: "sending", message: "Opening the print dialog…" });
        const w = (page.width / IMAGE_DPI) * 25.4;
        const h = (page.height / IMAGE_DPI) * 25.4;
        await systemPrintImage(
          page.toDataURL("image/jpeg", 0.92),
          { widthMm: w, heightMm: h, gapMm: 0 },
          0,
          s.printCopies,
        );
        set({
          status: "done",
          progress: 1,
          lastPrintedSource: source,
          message: "Sent to the print dialog",
        });
        return true;
      }

      if (printer.language === "image") {
        set({ status: "sending", message: "Sending to the printer…" });
        const jpeg = page.toDataURL("image/jpeg", 0.92).split(",")[1];
        const { jobId } = await nativePrint.printIpp(printer, jpeg, {
          widthMm: paper.widthMm,
          heightMm: paper.heightMm,
          mediaKeyword: paper.ippKeyword,
          mediaType: s.printMediaType || undefined,
          mediaSource: s.printMediaSource || undefined,
          borderless: s.printBorderless,
          fill: s.printFit === "fill",
          quality: s.printQuality,
          color: s.printColor,
          copies: s.printCopies,
        });
        set({ status: "printing", progress: 0.5, message: "Printing…" });
        return await follow(printer, jobId, source);
      }

      set({ status: "sending", message: "Sending to the printer…" });
      const bytes = rawJob(printer, paper, await halftone(page));
      const listener = await nativePrint
        .onProgress((f) => set({ progress: f }))
        .catch(() => null);
      try {
        await nativePrint.printRaw(printer, bytes);
      } finally {
        void listener?.unregister();
      }
      set({
        status: "done",
        progress: 1,
        lastPrintedSource: source,
        message: "Printed",
      });
      return true;
    } catch (e) {
      set({ status: "error", progress: 0, message: errText(e) });
      void get().refreshHealth();
      return false;
    }
  }

  /** Polls an IPP job until paper comes out, it fails, or we give up waiting. */
  async function follow(
    printer: SavedPrinter,
    jobId: number,
    source: string,
  ): Promise<boolean> {
    // A printer that doesn't hand back a job id has still accepted the job.
    if (jobId < 0) {
      set({
        status: "done",
        progress: 1,
        lastPrintedSource: source,
        message: "Sent to the printer",
      });
      return true;
    }
    const until = Date.now() + JOB_TIMEOUT_MS;
    while (Date.now() < until) {
      await sleep(2000);
      let job;
      try {
        job = await nativePrint.jobState(printer, jobId);
      } catch {
        continue; // Wi-Fi hiccup — keep following.
      }
      const problems = blockingReasons(job.reasons).filter(
        (r) => !/^job-(printing|queued|incoming|completed)/.test(r),
      );
      if (job.state === "completed") {
        set({
          status: "done",
          progress: 1,
          lastPrintedSource: source,
          message: "Printed",
        });
        void get().refreshHealth();
        return true;
      }
      if (job.state === "aborted" || job.state === "canceled") {
        set({
          status: "error",
          message: problems.length
            ? problems.map(describeReason).join(", ")
            : `The printer ${job.state} the job`,
        });
        void get().refreshHealth();
        return false;
      }
      // Still going. If it's stuck on something the host can fix (out of paper,
      // jam), say so — the job resumes by itself once it's fixed.
      if (job.state === "stopped" || job.state === "held" || problems.length) {
        await get().refreshHealth();
        const why = blockingReasons(get().health?.reasons ?? []);
        set({
          message: why.length
            ? `Waiting: ${why.map(describeReason).join(", ")}`
            : "Waiting for the printer…",
        });
      } else {
        set({
          message:
            job.state === "pending" ? "Queued at the printer…" : "Printing…",
        });
      }
    }
    // Accepted but never confirmed: most likely printed and the printer simply
    // stopped reporting. Don't call it a failure in front of the guest.
    set({
      status: "done",
      progress: 1,
      lastPrintedSource: source,
      message: "Sent to the printer",
    });
    return true;
  }

  return {
    status: "idle",
    message: "",
    progress: 0,
    lastJobSource: "",
    lastPrintedSource: "",
    health: null,
    searching: false,
    found: [],
    searchedBluetooth: true,

    search: async () => {
      if (!isAndroidApp()) {
        set({ found: [SYSTEM_PRINTER] });
        return;
      }
      set({ searching: true });
      try {
        const r = await nativePrint.discover(6, true);
        set({
          found: [...r.printers, SYSTEM_PRINTER],
          searchedBluetooth: r.bluetooth,
        });
      } catch (e) {
        set({ found: [SYSTEM_PRINTER], message: errText(e) });
      } finally {
        set({ searching: false });
      }
    },

    addByAddress: async (host) => {
      try {
        const p = await nativePrint.probe(host);
        set((st) => ({ found: [p, ...st.found.filter((f) => f.id !== p.id)] }));
        return p;
      } catch (e) {
        set({ message: errText(e) });
        return null;
      }
    },

    choose: async (found, language) => {
      let p: SavedPrinter;
      try {
        if (found.connection === "ipp") {
          const caps = found.caps ?? (await nativePrint.capabilities(found));
          p = {
            ...found,
            language: "image",
            caps,
            name: caps.makeModel || found.name,
          };
        } else if (found.connection === "system") {
          p = { ...found, language: "image" };
        } else if (found.connection === "usb") {
          // The printer says which languages it speaks — use that if it can.
          const id = await nativePrint.identifyUsb(found).catch(() => null);
          if (id?.language === "unsupported") {
            set({
              message:
                "That's a driver-based printer (inkjet/laser) over USB, which Android can't drive directly. " +
                "Connect it to Wi-Fi and pick it from the Wi-Fi list instead.",
            });
            return false;
          }
          p = {
            ...found,
            language: language ?? (id?.language || found.language || "escpos"),
          };
        } else {
          p = { ...found, language: language ?? found.language ?? "escpos" };
        }
      } catch (e) {
        set({ message: errText(e) });
        return false;
      }
      const s = settings();
      const previous = s.printer;
      if (previous && previous.id !== p.id && isAndroidApp())
        void nativePrint.forget(previous.id).catch(() => undefined);
      s.set("printer", p);
      s.set("printPaperId", defaultPaperId(p));
      set({ message: "", health: null, status: "idle" });
      void get().refreshHealth();
      return true;
    },

    forget: async () => {
      const prev = settings().printer;
      if (prev && isAndroidApp())
        await nativePrint.forget(prev.id).catch(() => undefined);
      settings().set("printer", null);
      set({ health: null, status: "idle", message: "" });
    },

    setLanguage: (language) => {
      const p = settings().printer;
      if (!p || p.language === "image") return;
      settings().set("printer", { ...p, language });
      settings().set("printPaperId", defaultPaperId({ ...p, language }));
    },

    refreshHealth: async () => {
      const p = settings().printer;
      if (!p || p.connection === "system" || !isAndroidApp()) {
        set({ health: null });
        return;
      }
      try {
        set({ health: await nativePrint.status(p) });
      } catch (e) {
        set({
          health: {
            state: "offline",
            reasons: [],
            message: errText(e),
            markers: [],
          },
        });
      }
    },

    print: (dataUrl) =>
      queue(async () => {
        // Nothing chosen yet is "printing off", not an error in front of a guest.
        if (!settings().printEnabled || !settings().printer || !dataUrl)
          return false;
        return run(dataUrl, dataUrl);
      }),

    printTest: () =>
      queue(async () => {
        const s = settings();
        const paper = currentPaper();
        const aspect =
          paper.heightMm > 0
            ? (paper.printableMm ?? paper.widthMm) / paper.heightMm
            : 2 / 3;
        const page = testPage(
          "MAD SHOTS",
          [
            s.printer?.name ?? "No printer",
            `${paper.label}`,
            new Date().toLocaleString(),
          ],
          aspect,
        );
        return run("test", page);
      }),
  };
});
