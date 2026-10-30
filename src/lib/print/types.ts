/**
 * The printer model shared by the engine, Admin and the native side
 * (`printing/PrintEngine.kt` reads these same field names).
 */

/** How the tablet reaches the printer. */
export type Connection =
  /** Network printer speaking IPP — every modern Wi-Fi inkjet/laser. Silent. */
  | "ipp"
  /** Network printer taking raw bytes on port 9100 (network thermal printers). */
  | "socket"
  | "usb"
  /** Bluetooth Classic (SPP) — paired in Android settings. */
  | "bluetooth"
  /** Bluetooth Low Energy. */
  | "ble"
  /** Android's (or the browser's) print dialog — any printer with a driver. */
  | "system";

/**
 * What the printer is sent. "image" printers receive a picture (IPP, the print
 * dialog); the rest receive a 1-bit raster wrapped in their command language.
 */
export type PrinterLanguage = "image" | "escpos" | "tspl" | "zpl";

export interface IppMedia {
  keyword: string;
  widthMm: number;
  heightMm: number;
}

/** What an IPP printer reports it can do (Get-Printer-Attributes). */
export interface IppCaps {
  makeModel: string;
  formats: string[];
  media: IppMedia[];
  mediaDefault: string;
  mediaReady: string[];
  mediaTypes: string[];
  mediaSources: string[];
  mediaCol: boolean;
  color: boolean;
  colorModes: string[];
  qualities: number[];
  scaling: string[];
  copiesMax: number;
  borderless: boolean;
  pwgResolutions: number[];
  pwgTypes: string[];
}

/** A printer the host picked. Stored in settings, so it survives restarts. */
export interface SavedPrinter {
  /** Stable key, e.g. `ipp:192.168.1.20` or `bt:00:11:22:33:44:55`. */
  id: string;
  name: string;
  connection: Connection;
  /** One-line "how it's connected" for the Admin card. */
  detail?: string;
  language: PrinterLanguage;
  // Network
  host?: string;
  port?: number;
  path?: string;
  tls?: boolean;
  // USB
  usbVendorId?: number;
  usbProductId?: number;
  // Bluetooth
  address?: string;
  /** IPP only: the snapshot taken when the printer was chosen. */
  caps?: IppCaps;
}

/** A search result — the same shape, with the language still to be decided. */
export type FoundPrinter = Omit<SavedPrinter, "language"> & {
  language?: PrinterLanguage;
};

export interface InkMarker {
  name: string;
  /** 0–100, or negative when the printer can't tell. */
  level: number;
  /** `#RRGGBB`, sometimes several joined by `#`. */
  color: string;
}

/** Live printer health, for Admin and the guest-facing status line. */
export interface PrinterHealth {
  state: "idle" | "processing" | "stopped" | "offline" | "unknown";
  reasons: string[];
  message: string;
  markers: InkMarker[];
}

export type PrintRotate = "auto" | 0 | 90;
export type PrintFit = "fit" | "fill";
export type PrintQuality = "draft" | "normal" | "high";
