import { create } from "zustand";
import {
  imageSize,
  imageToBitmap1,
  type Bitmap1,
  type DitherOpts,
} from "@/lib/dither";
import {
  LABEL_PRESETS,
  rasterHeightForStock,
  rasterWidthForStock,
  tsplImageJob,
  tsplTestJob,
  type JobOpts,
  type LabelStock,
} from "@/lib/tspl";
import { useSettings, type PrintTransport } from "@/store/settings";

/**
 * Talking to the Munbyn RW403B from the browser.
 *
 * There is no server in this path and there cannot be: a Vercel-hosted page can
 * never reach a printer sitting in the room. The bytes have to leave the tablet
 * directly, which leaves exactly two options, both implemented here:
 *
 * - **WebUSB** over a USB-OTG cable. Preferred. Android has no vendor driver
 *   competing for the device (unlike Windows, where WinUSB/Zadig would be
 *   needed), and bulk transfer moves a ~120 KB raster in well under a second.
 * - **Web Bluetooth**. Slower — expect 5–20 s for a full 4×6 photo, because BLE
 *   throughput is measured in tens of KB/s — but it leaves the USB-C port free
 *   for charging, which matters for a booth that runs all day.
 *
 * Both need a secure context (Vercel's HTTPS is fine) and a user gesture for the
 * *first* pairing. After that `getDevices()` returns the granted device and the
 * kiosk reconnects unattended, which is what makes "tap print → it prints"
 * possible at all.
 *
 * ## Written before the hardware arrived
 *
 * Two things genuinely cannot be known without the printer in hand, so neither
 * is hardcoded:
 *
 * 1. **The BLE service/characteristic UUIDs.** Rather than guess, this connects
 *    and *walks* the GATT tree for any writable characteristic, reporting what it
 *    found so Admin can display it. The catch is that Web Bluetooth only exposes
 *    services named up-front in `optionalServices`, hence the candidate list
 *    below plus a host-editable override.
 * 2. **TSPL's raster bit polarity.** Handled by `printInvertRaster` — see
 *    `JobOpts.invertRaster`.
 */

/**
 * Service UUIDs to ask permission for, since Web Bluetooth will not reveal a
 * service that wasn't declared before connecting.
 *
 * These are the ones that show up across cheap thermal print heads. It is a
 * guess-list, not a specification: if the RW403B turns out to use something
 * else, the real UUID goes in Admin's override field and everything else works
 * unchanged.
 */
const BLE_SERVICE_CANDIDATES = [
  "000018f0-0000-1000-8000-00805f9b34fb", // by far the most common on thermal heads
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb", // HM-10 style serial bridge
  "0000fee7-0000-1000-8000-00805f9b34fb",
  "0000ff12-0000-1000-8000-00805f9b34fb",
  "0000ae30-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // Microchip/ISSC transparent UART
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
];

/** USB printer class — the right filter if the RW403B reports itself honestly. */
const USB_PRINTER_CLASS = 7;

/** An open connection to the print head, whichever way the bytes get there. */
export interface PrinterLink {
  kind: PrintTransport;
  /** Human-readable device name for the Admin readout. */
  name: string;
  /** What the transport actually bound to — endpoint number, or GATT UUIDs. */
  detail: string;
  write(bytes: Uint8Array, onProgress?: (frac: number) => void): Promise<void>;
  close(): Promise<void>;
  connected(): boolean;
}

function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export function usbSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.usb;
}

export function bluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

export function transportSupported(kind: PrintTransport): boolean {
  return kind === "usb" ? usbSupported() : bluetoothSupported();
}

// ── WebUSB ───────────────────────────────────────────────────────────────────

/**
 * Finds an interface with a bulk OUT endpoint, preferring a printer-class one.
 *
 * Printers in this price bracket are inconsistent about whether they declare
 * class 7 or a vendor-specific class, so class is a preference and "has a bulk
 * OUT endpoint" is the actual requirement.
 */
function pickBulkOut(
  device: USBDevice,
): { interfaceNumber: number; endpoint: number } | null {
  const cfg = device.configuration;
  if (!cfg) return null;

  const ordered = [...cfg.interfaces].sort(
    (a, b) =>
      Number(b.alternate.interfaceClass === USB_PRINTER_CLASS) -
      Number(a.alternate.interfaceClass === USB_PRINTER_CLASS),
  );

  for (const iface of ordered) {
    const alts = [iface.alternate, ...iface.alternates];
    for (const alt of alts) {
      const ep = alt.endpoints.find(
        (e) => e.direction === "out" && e.type === "bulk",
      );
      if (ep)
        return {
          interfaceNumber: iface.interfaceNumber,
          endpoint: ep.endpointNumber,
        };
    }
  }
  return null;
}

async function openUsbLink(device: USBDevice): Promise<PrinterLink> {
  if (!device.opened) await device.open();
  if (!device.configuration) await device.selectConfiguration(1);

  const target = pickBulkOut(device);
  if (!target)
    throw new Error(
      "That device has no bulk OUT endpoint, so it isn't a printer. Pick again.",
    );

  try {
    await device.claimInterface(target.interfaceNumber);
  } catch (e) {
    throw new Error(
      `Could not claim the printer interface (${errText(e)}). ` +
        "On Windows the vendor driver holds it exclusively; on Android, unplug " +
        "and replug the OTG cable.",
    );
  }

  const name =
    [device.manufacturerName, device.productName].filter(Boolean).join(" ") ||
    `USB ${hex4(device.vendorId)}:${hex4(device.productId)}`;

  // Remember the identity so `autoConnect` can find this exact printer again
  // without showing a chooser.
  useSettings.getState().set("usbVendorId", device.vendorId);
  useSettings.getState().set("usbProductId", device.productId);

  let open = true;
  return {
    kind: "usb",
    name,
    detail: `iface ${target.interfaceNumber}, bulk OUT ep ${target.endpoint}, ${hex4(
      device.vendorId,
    )}:${hex4(device.productId)}`,
    connected: () => open && device.opened,
    async write(bytes, onProgress) {
      // Chunked purely so progress is reportable; WebUSB is happy with the lot.
      const CHUNK = 8192;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        const slice = bytes.slice(i, i + CHUNK);
        const res = await device.transferOut(target.endpoint, slice);
        if (res.status !== "ok")
          throw new Error(`Printer rejected the data (${res.status})`);
        onProgress?.(Math.min(1, (i + slice.length) / bytes.length));
      }
    },
    async close() {
      open = false;
      try {
        await device.releaseInterface(target.interfaceNumber);
      } catch {
        // Already gone — nothing to release.
      }
      try {
        await device.close();
      } catch {
        // Ditto.
      }
    },
  };
}

function hex4(n: number): string {
  return `0x${n.toString(16).padStart(4, "0")}`;
}

// ── Web Bluetooth ────────────────────────────────────────────────────────────

function bleServiceList(): string[] {
  const override = useSettings.getState().btServiceUuid.trim().toLowerCase();
  return override
    ? [override, ...BLE_SERVICE_CANDIDATES.filter((u) => u !== override)]
    : BLE_SERVICE_CANDIDATES;
}

/**
 * Walks every exposed service for a characteristic we can write to.
 *
 * This is the "no hardware yet" strategy: instead of hardcoding a UUID that may
 * well be wrong, take whatever the printer offers and report it. Writable
 * characteristics are effectively always the command pipe on these devices.
 */
async function findWriteChar(
  gatt: BluetoothRemoteGATTServer,
): Promise<{ char: BluetoothRemoteGATTCharacteristic; detail: string }> {
  const wantChar = useSettings.getState().btCharUuid.trim().toLowerCase();

  let services: BluetoothRemoteGATTService[] = [];
  try {
    services = await gatt.getPrimaryServices();
  } catch (e) {
    throw new Error(`No readable GATT services (${errText(e)})`);
  }

  const writable: {
    char: BluetoothRemoteGATTCharacteristic;
    service: string;
  }[] = [];
  for (const service of services) {
    let chars: BluetoothRemoteGATTCharacteristic[] = [];
    try {
      chars = await service.getCharacteristics();
    } catch {
      continue; // Some services refuse enumeration; that's fine, try the next.
    }
    for (const char of chars) {
      if (char.properties.write || char.properties.writeWithoutResponse)
        writable.push({ char, service: service.uuid });
    }
  }

  if (!writable.length)
    throw new Error(
      "Connected, but the printer exposed no writable characteristic. " +
        "Its service UUID is probably outside the candidate list — find the " +
        "real one and paste it into the Service UUID field.",
    );

  // Honour an explicit override, then prefer the faster write mode.
  const chosen =
    (wantChar && writable.find((w) => w.char.uuid.toLowerCase() === wantChar)) ||
    writable.find((w) => w.char.properties.writeWithoutResponse) ||
    writable[0];

  const all = writable
    .map((w) => `${short(w.service)}/${short(w.char.uuid)}`)
    .join(", ");
  return {
    char: chosen.char,
    detail: `using ${short(chosen.service)}/${short(chosen.char.uuid)} — found: ${all}`,
  };
}

/** Trims a full 128-bit UUID to its recognisable short form for display. */
function short(uuid: string): string {
  const m = /^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/i.exec(uuid);
  return m ? m[1] : uuid;
}

async function openBleLink(device: BluetoothDevice): Promise<PrinterLink> {
  const gatt = device.gatt;
  if (!gatt) throw new Error("That Bluetooth device exposes no GATT server");

  await gatt.connect();
  const { char, detail } = await findWriteChar(gatt);

  let open = true;
  device.addEventListener("gattserverdisconnected", () => {
    open = false;
  });

  useSettings.getState().set("btDeviceId", device.id);

  const writeOne = async (slice: Uint8Array) => {
    if (char.properties.writeWithoutResponse && char.writeValueWithoutResponse)
      return char.writeValueWithoutResponse(slice);
    if (char.writeValueWithResponse) return char.writeValueWithResponse(slice);
    return char.writeValue(slice);
  };

  return {
    kind: "bluetooth",
    name: device.name || "Bluetooth printer",
    detail,
    connected: () => open && !!device.gatt?.connected,
    async write(bytes, onProgress) {
      // BLE's default MTU allows only 20 payload bytes, so a full-page raster is
      // thousands of writes. The chunk size is a setting because raising it once
      // the negotiated MTU is known is the single biggest speed win available.
      const chunk = Math.max(
        20,
        Math.min(512, useSettings.getState().btChunkSize),
      );
      for (let i = 0; i < bytes.length; i += chunk) {
        if (!open) throw new Error("Bluetooth dropped mid-print");
        await writeOne(bytes.slice(i, i + chunk));
        const done = Math.min(1, (i + chunk) / bytes.length);
        onProgress?.(done);
        // Yield periodically so the progress bar actually paints and the BLE
        // stack gets a chance to drain its queue.
        if ((i / chunk) % 16 === 0)
          await new Promise((r) => window.setTimeout(r, 0));
      }
    },
    async close() {
      open = false;
      try {
        gatt.disconnect();
      } catch {
        // Already disconnected.
      }
    },
  };
}

// ── Config assembled from settings ───────────────────────────────────────────

/** The stock currently loaded, in the shape the TSPL layer wants. */
export function currentStock(): LabelStock {
  const s = useSettings.getState();
  return {
    widthMm: s.labelWidthMm,
    heightMm: s.labelHeightMm,
    gapMm: s.labelGapMm,
  };
}

export function currentJob(): JobOpts {
  const s = useSettings.getState();
  return {
    stock: currentStock(),
    density: s.printDensity,
    speed: s.printSpeed,
    copies: s.printCopies,
    invertRaster: s.printInvertRaster,
  };
}

function currentDither(): Omit<DitherOpts, "widthDots" | "heightDots"> {
  const s = useSettings.getState();
  return {
    mode: s.ditherMode,
    threshold: s.ditherThreshold,
    brightness: s.printBrightness,
    contrast: s.printContrast,
  };
}

/**
 * Rasterises a composite exactly as it will be printed.
 *
 * Admin's preview calls this too, on purpose: there is one code path from
 * composite to dots, so what the host sees on screen is what the head burns.
 */
export async function rasterFor(dataUrl: string): Promise<Bitmap1> {
  const s = useSettings.getState();
  const stock = currentStock();
  const base = currentDither();
  const maxW = rasterWidthForStock(stock, s.printMarginMm);

  if (s.printFit === "width") {
    // Fill the width and let a long strip run past the label edge — correct for
    // continuous roll, where "one label" is a length the host chooses.
    return imageToBitmap1(dataUrl, { ...base, widthDots: maxW });
  }

  // Contain the whole design on one label without distorting it.
  const { width: sw, height: sh } = await imageSize(dataUrl);
  const maxH = rasterHeightForStock(stock, s.printMarginMm);
  const scale = Math.min(maxW / sw, maxH / sh);
  return imageToBitmap1(dataUrl, {
    ...base,
    // Whole bytes, because TSPL places bitmaps on byte boundaries.
    widthDots: Math.max(8, Math.floor((sw * scale) / 8) * 8),
    heightDots: Math.max(8, Math.round(sh * scale)),
  });
}

/** Applies a stock preset, or leaves the custom values alone. */
export function applyLabelPreset(id: string) {
  const preset = LABEL_PRESETS.find((p) => p.id === id);
  const set = useSettings.getState().set;
  set("labelPresetId", id);
  if (!preset) return;
  set("labelWidthMm", preset.stock.widthMm);
  set("labelHeightMm", preset.stock.heightMm);
  set("labelGapMm", preset.stock.gapMm);
}

// ── Store ────────────────────────────────────────────────────────────────────

export type PrintStatus =
  | "offline"
  | "connecting"
  | "ready"
  | "printing"
  | "error";

interface PrinterState {
  status: PrintStatus;
  deviceName: string;
  /** Transport binding details, shown in Admin so commissioning needs no rebuild. */
  detail: string;
  lastError: string;
  /** 0…1 while streaming. Mostly meaningful over Bluetooth. */
  progress: number;
  lastJobBytes: number;
  /**
   * The composite this store last *attempted*, and the one it last printed
   * successfully.
   *
   * These exist so the guest-facing indicator can tell "your photo printed" from
   * "some earlier photo printed". Status alone can't: it sits at "ready" both
   * after a successful job and immediately after connecting, so a freshly-paired
   * booth would tell its first guest "Printed ♥" before anything had been sent,
   * and a stale error would follow the next guest around.
   */
  lastJobSource: string;
  lastPrintedSource: string;
  /** Pairs with a printer. Must be called from a user gesture. */
  connect: () => Promise<boolean>;
  /** Silent reconnect to an already-granted device. Safe to call on boot. */
  autoConnect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  /** Prints a composite. Resolves false (never throws) so the flow can't stall. */
  printImage: (dataUrl: string) => Promise<boolean>;
  /** Tiny text label — proves the link and the stock geometry in ~1 second. */
  printTest: () => Promise<boolean>;
}

let link: PrinterLink | null = null;

/**
 * Jobs are serialised. Two overlapping writes to a label printer interleave into
 * garbage, and the guest flow can easily fire a second print while a slow
 * Bluetooth job is still streaming.
 */
let chain: Promise<unknown> = Promise.resolve();
function queue<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

export const usePrinter = create<PrinterState>()((set, get) => ({
  status: "offline",
  deviceName: "",
  detail: "",
  lastError: "",
  progress: 0,
  lastJobBytes: 0,
  lastJobSource: "",
  lastPrintedSource: "",

  connect: async () => {
    const kind = useSettings.getState().printTransport;
    if (!transportSupported(kind)) {
      set({
        status: "error",
        lastError:
          kind === "usb"
            ? "WebUSB isn't available in this browser. Use Chrome on Android or desktop — Safari and iOS can't do this."
            : "Web Bluetooth isn't available in this browser. Use Chrome on Android or desktop.",
      });
      return false;
    }

    set({ status: "connecting", lastError: "" });
    try {
      if (link) await link.close();
      link = null;

      if (kind === "usb") {
        const filters = useSettings.getState().usbAnyDevice
          ? []
          : [{ classCode: USB_PRINTER_CLASS }];
        const device = await navigator.usb!.requestDevice({ filters });
        link = await openUsbLink(device);
      } else {
        const device = await navigator.bluetooth!.requestDevice({
          // The printer's own service UUID is unknown until it's in hand, so the
          // chooser can't be filtered by it — show everything and let the host
          // pick. Munbyn devices advertise two names; the "-BLE" entry is the
          // one a browser can talk to ("-SPP"/"-COM" is Bluetooth Classic and
          // unreachable from any web page).
          acceptAllDevices: true,
          optionalServices: bleServiceList(),
        });
        link = await openBleLink(device);
      }

      set({
        status: "ready",
        deviceName: link.name,
        detail: link.detail,
        lastError: "",
      });
      return true;
    } catch (e) {
      link = null;
      const msg = errText(e);
      set({
        status: "offline",
        // A cancelled chooser isn't a failure worth shouting about.
        lastError: /cancel|no device selected|user gesture/i.test(msg)
          ? ""
          : msg,
      });
      return false;
    }
  },

  autoConnect: async () => {
    if (link?.connected()) return true;
    const s = useSettings.getState();
    if (!s.printEnabled) return false;
    const kind = s.printTransport;
    if (!transportSupported(kind)) return false;

    try {
      if (kind === "usb") {
        const devices = await navigator.usb!.getDevices();
        // Prefer the exact printer paired last time; otherwise anything granted.
        const match =
          devices.find(
            (d) =>
              d.vendorId === s.usbVendorId && d.productId === s.usbProductId,
          ) ?? devices[0];
        if (!match) return false;
        link = await openUsbLink(match);
      } else {
        // `getDevices` is gated behind a flag in some Chrome builds — without it
        // there is no way to reconnect silently and the host must pair by hand.
        const bt = navigator.bluetooth;
        if (!bt?.getDevices) return false;
        const devices = await bt.getDevices();
        const match =
          devices.find((d) => d.id === s.btDeviceId) ?? devices[0];
        if (!match) return false;
        link = await openBleLink(match);
      }
      set({
        status: "ready",
        deviceName: link.name,
        detail: link.detail,
        lastError: "",
      });
      return true;
    } catch (e) {
      link = null;
      set({ status: "offline", lastError: errText(e) });
      return false;
    }
  },

  disconnect: async () => {
    try {
      await link?.close();
    } catch {
      // Nothing useful to do if teardown fails.
    }
    link = null;
    set({ status: "offline", deviceName: "", detail: "", progress: 0 });
  },

  printImage: (dataUrl) =>
    queue(async () => {
      if (!useSettings.getState().printEnabled) return false;
      if (!dataUrl) return false;

      // Claim this composite as the current attempt before anything can fail, so
      // the indicator is talking about *this* guest either way.
      set({ lastJobSource: dataUrl });

      if (!link?.connected() && !(await get().autoConnect())) {
        set({
          status: "error",
          lastError:
            "No printer connected. Pair it in Admin → System → Printing.",
        });
        return false;
      }

      set({ status: "printing", progress: 0, lastError: "" });
      try {
        const bitmap = await rasterFor(dataUrl);
        const bytes = tsplImageJob(bitmap, currentJob());
        set({ lastJobBytes: bytes.length });
        await link!.write(bytes, (frac) => set({ progress: frac }));
        set({ status: "ready", progress: 1, lastPrintedSource: dataUrl });
        return true;
      } catch (e) {
        set({ status: "error", lastError: errText(e), progress: 0 });
        return false;
      }
    }),

  printTest: () =>
    queue(async () => {
      if (!link?.connected() && !(await get().autoConnect())) {
        set({
          status: "error",
          lastError: "No printer connected — pair one first.",
        });
        return false;
      }

      const s = useSettings.getState();
      set({ status: "printing", progress: 0, lastError: "" });
      try {
        const bytes = tsplTestJob(currentJob(), [
          "MAD SHOTS",
          `Stock ${round1(s.labelWidthMm)} x ${round1(s.labelHeightMm)} mm`,
          `Gap ${round1(s.labelGapMm)} mm  Margin ${round1(s.printMarginMm)} mm`,
          `Density ${s.printDensity}  Speed ${s.printSpeed}`,
          `Link ${s.printTransport.toUpperCase()}`,
          new Date().toLocaleString(),
        ]);
        set({ lastJobBytes: bytes.length });
        await link!.write(bytes, (frac) => set({ progress: frac }));
        set({ status: "ready", progress: 1 });
        return true;
      } catch (e) {
        set({ status: "error", lastError: errText(e), progress: 0 });
        return false;
      }
    }),
}));

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
