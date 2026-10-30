import { addPluginListener } from "@tauri-apps/api/core";
import { bytesToBase64, native } from "@/lib/native/platform";
import type {
  FoundPrinter,
  IppCaps,
  PrinterHealth,
  PrinterLanguage,
  SavedPrinter,
} from "./types";

/** Typed wrappers over `printer_*` in `BoothPlugin.kt`. Android app only. */

/** The capabilities snapshot stays on the JS side; native refetches as needed. */
function wire(p: SavedPrinter | FoundPrinter) {
  const { caps: _caps, ...rest } = p;
  return rest;
}

export function discover(seconds: number, bluetooth: boolean) {
  return native<{ printers: FoundPrinter[]; bluetooth: boolean }>(
    "printer_discover",
    {
      seconds,
      bluetooth,
    },
  );
}

export async function probe(host: string): Promise<FoundPrinter> {
  return (await native<{ printer: FoundPrinter }>("printer_probe", { host }))
    .printer;
}

export async function capabilities(
  p: SavedPrinter | FoundPrinter,
): Promise<IppCaps> {
  return (
    await native<{ caps: IppCaps }>("printer_capabilities", {
      printer: wire(p),
    })
  ).caps;
}

export async function status(p: SavedPrinter): Promise<PrinterHealth> {
  const r = await native<Partial<PrinterHealth>>("printer_status", {
    printer: wire(p),
  });
  return {
    state: r.state ?? "unknown",
    reasons: r.reasons ?? [],
    message: r.message ?? "",
    markers: r.markers ?? [],
  };
}

export function identifyUsb(p: FoundPrinter) {
  return native<{
    deviceId: string;
    language: PrinterLanguage | "unsupported" | "";
  }>("printer_identify_usb", { printer: wire(p) });
}

/** The job options IPP understands; see `jobAttributes` in PrintEngine.kt. */
export interface IppJobOptions {
  widthMm: number;
  heightMm: number;
  mediaKeyword?: string;
  mediaType?: string;
  mediaSource?: string;
  borderless: boolean;
  fill: boolean;
  quality: "draft" | "normal" | "high";
  color: boolean;
  copies: number;
}

export function printIpp(
  p: SavedPrinter,
  jpegBase64: string,
  job: IppJobOptions,
) {
  return native<{ jobId: number; format: string }>("printer_print", {
    printer: wire(p),
    data: jpegBase64,
    job,
  });
}

export function printRaw(p: SavedPrinter, bytes: Uint8Array) {
  return native("printer_print", {
    printer: wire(p),
    data: bytesToBase64(bytes),
  });
}

export type JobState =
  | "pending"
  | "held"
  | "processing"
  | "stopped"
  | "canceled"
  | "aborted"
  | "completed"
  | "unknown";

export function jobState(p: SavedPrinter, jobId: number) {
  return native<{ state: JobState; reasons: string[]; message: string }>(
    "printer_job",
    {
      printer: wire(p),
      jobId,
    },
  );
}

export function forget(id: string) {
  return native("printer_forget", { id });
}

/** Raw-transport progress, 0…1, for the job currently being sent. */
export function onProgress(cb: (fraction: number) => void) {
  return addPluginListener<{ fraction: number }>(
    "booth",
    "printProgress",
    (e) => cb(e.fraction),
  );
}
