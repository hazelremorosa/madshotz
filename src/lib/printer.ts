import { create } from "zustand";
import {
  imageSize,
  imageToBitmap1,
  type Bitmap1,
  type DitherOpts,
  type PrintRotation,
} from "@/lib/dither";
import {
  LABEL_PRESETS,
  probeBytes,
  probeReadsBack,
  rasterHeightForStock,
  rasterWidthForStock,
  tsplImageJob,
  tsplTestJob,
  type JobOpts,
  type LabelStock,
  type ProbeId,
} from "@/lib/tspl";
import { zplImageJob, zplProbeBytes, zplTestJob } from "@/lib/zpl";
import {
  useSettings,
  type PrintRotationSetting,
  type PrintTransport,
} from "@/store/settings";

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
 * Service UUIDs to ask permission for.
 *
 * Web Bluetooth will not reveal a service that wasn't declared *before*
 * connecting, and a printer's UUID is not discoverable any other way — so
 * guessing a handful meant a coin toss on whether `getPrimaryServices()` would
 * return anything at all.
 *
 * Instead of guessing, ask for the whole space these devices live in: the two
 * 16-bit vendor ranges (`0xFExx` and `0xFFxx`) plus the specific 128-bit UUIDs
 * used by the common serial-bridge chips. It's a long list, but `optionalServices`
 * costs nothing beyond one permission prompt, and it turns "did I guess right?"
 * into "show me everything you have".
 */
function uuid16(n: number): string {
  return `0000${n.toString(16).padStart(4, "0")}-0000-1000-8000-00805f9b34fb`;
}

const BLE_SERVICE_CANDIDATES: string[] = [
  // Where thermal print heads are actually found, in likelihood order.
  uuid16(0x18f0), // by far the most common on these printers
  uuid16(0xff00),
  uuid16(0xffe0), // HM-10 style serial bridge
  uuid16(0xfee7),
  // Known 128-bit serial bridges.
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // Microchip/ISSC transparent UART
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  // Then sweep the 16-bit families these printers actually use, so an unlisted
  // UUID can't hide the service from us.
  ...Array.from({ length: 256 }, (_, i) => uuid16(0xff00 + i)),
  ...Array.from({ length: 256 }, (_, i) => uuid16(0xfe00 + i)),
  ...Array.from({ length: 256 }, (_, i) => uuid16(0xae00 + i)),
  // The RW403B also advertises abf0 and af30, so cover those families too.
  ...Array.from({ length: 256 }, (_, i) => uuid16(0xab00 + i)),
  ...Array.from({ length: 256 }, (_, i) => uuid16(0xaf00 + i)),
  ...Array.from({ length: 256 }, (_, i) => uuid16(0x1800 + i)),
].filter((u, i, all) => all.indexOf(u) === i);

/**
 * Accepts a UUID the way a person is likely to have copied it.
 *
 * A BLE scanner shows short services as `FF20` or `0xFF20`, but Web Bluetooth
 * only takes a full 128-bit string — so pasting exactly what's on screen would
 * silently fail, which is a poor reward for going and looking it up.
 */
function normaliseUuid(input: string): string {
  const v = input.trim().toLowerCase().replace(/^0x/, "");
  if (!v) return "";
  if (/^[0-9a-f]{4}$/.test(v)) return uuid16(parseInt(v, 16));
  if (/^[0-9a-f]{8}$/.test(v)) return `${v}-0000-1000-8000-00805f9b34fb`;
  return v;
}

/** USB printer class — the right filter if the RW403B reports itself honestly. */
const USB_PRINTER_CLASS = 7;

/**
 * How long a single USB transfer may take before it's called dead.
 *
 * Generous, because a genuinely busy printer can take a moment to free buffer
 * space mid-job; the point is to fail *eventually* rather than hang for ever.
 */
const USB_WRITE_TIMEOUT_MS = 15000;

/** Same idea for a single BLE characteristic write, which is far smaller. */
const BLE_WRITE_TIMEOUT_MS = 10000;

/** An open connection to the print head, whichever way the bytes get there. */
export interface PrinterLink {
  kind: PrintTransport;
  /** Human-readable device name for the Admin readout. */
  name: string;
  /** What the transport actually bound to — endpoint number, or GATT UUIDs. */
  detail: string;
  /**
   * Set when the binding looks suspect but isn't fatal — most importantly a
   * non-printer-class USB interface, which accepts writes and prints nothing.
   */
  warning?: string;
  write(bytes: Uint8Array, onProgress?: (frac: number) => void): Promise<void>;
  /**
   * Reads a reply, where the transport has one. Any bytes coming back prove the
   * print engine is actually listening rather than buffering into a void — the
   * most useful signal available when a job is accepted and nothing prints.
   */
  read?(length: number): Promise<Uint8Array | null>;
  /**
   * Writes the same payload to every plausible data channel in turn, pausing on
   * each so a human can watch the printer.
   *
   * This exists because a channel that silently swallows data is indistinguishable
   * from the right one: `transferOut` succeeds either way, and a printer that
   * ignores a `FEED` looks exactly like a printer that never received it. Rather
   * than guess which interface/endpoint (or GATT characteristic) is the print
   * path, try them all and let the paper decide.
   */
  sweep?(
    payload: Uint8Array,
    onStep: (label: string, index: number, total: number) => void,
  ): Promise<string[]>;
  /** USB printer-class control requests — answers even when the data path is deaf. */
  classRequest?(
    kind: "portStatus" | "deviceId" | "softReset",
  ): Promise<string>;
  close(): Promise<void>;
  connected(): boolean;
}

/** How long each sweep step dwells, so a person can see which one acted. */
const SWEEP_DWELL_MS = 2200;

const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/**
 * Throws the connection away after a timeout.
 *
 * `withTimeout` stops waiting but cannot cancel the underlying USB transfer, so
 * the pipe may still have a half-finished operation on it and anything sent
 * afterwards is undefined — failing in exactly the silent way that has made this
 * hard to diagnose. Force a clean reconnect on the next job instead.
 */
async function dropLinkIfWedged(e: unknown): Promise<void> {
  if (!/timed out/i.test(errText(e))) return;
  try {
    await link?.close();
  } catch {
    // Discarding it either way.
  }
  link = null;
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

interface UsbTarget {
  interfaceNumber: number;
  /** Which alternate setting the endpoint lives on — must be selected to use it. */
  alternateSetting: number;
  endpoint: number;
  /** Bulk IN on the same interface, if any — used to read a status reply back. */
  inEndpoint: number | null;
  interfaceClass: number;
  packetSize: number;
}

/**
 * Finds an interface with a bulk OUT endpoint, preferring a printer-class one.
 *
 * Printers in this price bracket are inconsistent about whether they declare
 * class 7 or a vendor-specific class, so class is a preference and "has a bulk
 * OUT endpoint" is the actual requirement. The catch is that plenty of
 * *non*-printers also expose a bulk OUT: they accept small writes into a buffer
 * nobody drains, so the job looks sent and nothing ever prints. Hence the class
 * is reported back for `usbClassWarning` to flag.
 *
 * The active alternate is tried before the others, because using an inactive one
 * requires `selectAlternateInterface` and quietly writing to an endpoint from an
 * unselected alternate goes nowhere.
 */
function pickBulkOut(device: USBDevice): UsbTarget | null {
  const cfg = device.configuration;
  if (!cfg) return null;

  const override = useSettings.getState().usbInterface;

  const ordered = [...cfg.interfaces]
    .filter((i) => override < 0 || i.interfaceNumber === override)
    .sort(
      (a, b) =>
        Number(b.alternate.interfaceClass === USB_PRINTER_CLASS) -
        Number(a.alternate.interfaceClass === USB_PRINTER_CLASS),
    );

  const wantEp = useSettings.getState().usbEndpoint;

  for (const iface of ordered) {
    // Active alternate first; only fall back to the others if it has no bulk OUT.
    const alts = [
      iface.alternate,
      ...iface.alternates.filter(
        (a) => a.alternateSetting !== iface.alternate.alternateSetting,
      ),
    ];
    for (const alt of alts) {
      const ep = alt.endpoints.find(
        (e) =>
          e.direction === "out" &&
          e.type === "bulk" &&
          (wantEp < 0 || e.endpointNumber === wantEp),
      );
      if (ep)
        return {
          interfaceNumber: iface.interfaceNumber,
          alternateSetting: alt.alternateSetting,
          endpoint: ep.endpointNumber,
          inEndpoint:
            alt.endpoints.find((e) => e.direction === "in" && e.type === "bulk")
              ?.endpointNumber ?? null,
          interfaceClass: alt.interfaceClass,
          packetSize: ep.packetSize || 64,
        };
    }
  }
  return null;
}

/**
 * Every interface and bulk-OUT endpoint the device exposes, for the Admin
 * readout — the only way to tell from the tablet whether the auto-pick chose
 * sensibly, or which number to force if it didn't.
 */
function describeUsb(device: USBDevice): string {
  const cfg = device.configuration;
  if (!cfg) return "no active configuration";
  return cfg.interfaces
    .map((i) => {
      const a = i.alternate;
      const outs = a.endpoints
        .filter((e) => e.direction === "out")
        .map((e) => `ep${e.endpointNumber}/${e.type}/${e.packetSize}B`)
        .join(" ");
      const cls =
        a.interfaceClass === USB_PRINTER_CLASS
          ? "printer"
          : a.interfaceClass === 0xff
            ? "vendor"
            : `class ${a.interfaceClass}`;
      return `if${i.interfaceNumber}[${cls}] ${outs || "no OUT"}`;
    })
    .join(" · ");
}

/**
 * Rejects if a transfer doesn't complete in time.
 *
 * `transferOut` never rejects on its own when the device stops draining its
 * buffer — it just never settles, which surfaced as a print stuck on
 * "Printing 0%" with no way to tell whether it was slow or dead. A bounded wait
 * turns that into an error the host can act on.
 */
function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () =>
        reject(
          new Error(
            `${what} timed out after ${Math.round(ms / 1000)}s — the printer ` +
              "stopped accepting data. Check it's powered, has labels loaded and " +
              "the cover is shut; if the device you paired isn't printer-class, " +
              "re-pair with “Show all USB devices” off.",
          ),
        ),
      ms,
    );
    work.then(
      (v) => {
        window.clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(timer);
        reject(e);
      },
    );
  });
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

  // An endpoint on a non-active alternate is unusable until it's selected —
  // writes to it are accepted and go nowhere.
  const activeAlt = device.configuration?.interfaces.find(
    (i) => i.interfaceNumber === target.interfaceNumber,
  )?.alternate.alternateSetting;
  // Only when it genuinely differs. A needless SET_INTERFACE can stall on a
  // single-alternate device and leave every endpoint on that interface unusable.
  if (activeAlt !== undefined && activeAlt !== target.alternateSetting) {
    try {
      await device.selectAlternateInterface(
        target.interfaceNumber,
        target.alternateSetting,
      );
    } catch (e) {
      throw new Error(
        `Could not select alternate setting ${target.alternateSetting} on ` +
          `interface ${target.interfaceNumber} (${errText(e)})`,
      );
    }
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
    detail:
      `if${target.interfaceNumber}.${target.alternateSetting} ep${target.endpoint} ` +
      `${target.interfaceClass === USB_PRINTER_CLASS ? "printer-class" : `CLASS ${target.interfaceClass}`} ` +
      `${hex4(device.vendorId)}:${hex4(device.productId)}` +
      `${target.inEndpoint === null ? " (no IN ep)" : ` in-ep${target.inEndpoint}`}` +
      `\n${describeUsb(device)}`,
    read:
      target.inEndpoint === null
        ? undefined
        : async (length) => {
            const res = await withTimeout(
              device.transferIn(target.inEndpoint!, length),
              3000,
              "Reading a reply",
            );
            if (res.status !== "ok" || !res.data) return null;
            return new Uint8Array(res.data.buffer.slice(0));
          },
    warning:
      target.interfaceClass === USB_PRINTER_CLASS
        ? undefined
        : `Bound to a class-${target.interfaceClass} interface, not a printer ` +
          `(${hex4(device.vendorId)}:${hex4(device.productId)}). Plenty of ` +
          "non-printers expose a bulk OUT endpoint: writes succeed and nothing " +
          "ever prints. If this isn't the RW403B, turn “Show all USB devices” " +
          "off and pair again.",
    connected: () => open && device.opened,
    async write(bytes, onProgress) {
      // Chunk size is a setting because an oversized first write is the classic
      // way to wedge one of these printers: it stalls before a single byte is
      // acknowledged, so progress never leaves 0% and there's nothing to see.
      const chunk = Math.max(
        64,
        Math.min(16384, useSettings.getState().usbChunkSize),
      );
      for (let i = 0; i < bytes.length; i += chunk) {
        const slice = bytes.slice(i, i + chunk);
        const res = await withTimeout(
          device.transferOut(target.endpoint, slice),
          USB_WRITE_TIMEOUT_MS,
          `Sending ${slice.length} bytes`,
        );
        if (res.status !== "ok")
          throw new Error(`Printer rejected the data (${res.status})`);
        // A bulk transfer whose length is an exact multiple of the endpoint's
        // packet size carries no short packet, so the device has no way to know
        // the transfer ended — plenty of printer firmware simply waits for more.
        // This endpoint is 64 bytes, and a 4096-byte chunk is exactly 64 of them,
        // so without a zero-length packet a job can sit in the buffer for ever.
        if (slice.length % target.packetSize === 0)
          await withTimeout(
            device.transferOut(target.endpoint, new Uint8Array(0)),
            USB_WRITE_TIMEOUT_MS,
            "Sending end-of-transfer packet",
          );
        onProgress?.(Math.min(1, (i + slice.length) / bytes.length));
      }
    },
    /**
     * The three requests every USB printer-class interface must answer.
     *
     * These go over the control pipe rather than the data endpoint, which makes
     * them the only way to ask the printer a question it *has* to reply to. If
     * the data path is silently discarding jobs, these still work — and
     * GET_DEVICE_ID returns the IEEE-1284 identity string, whose `CMD:` field
     * names the command sets the firmware actually supports. That settles
     * TSPL-vs-ZPL from the printer's own mouth instead of by experiment.
     */
    async classRequest(kind) {
      const iface = target.interfaceNumber;
      if (kind === "softReset") {
        // SOFT_RESET (2) — flushes the interface's buffers.
        const res = await withTimeout(
          device.controlTransferOut({
            requestType: "class",
            recipient: "interface",
            request: 2,
            value: 0,
            index: iface,
          }),
          4000,
          "Soft reset",
        );
        return `soft reset: ${res.status}`;
      }

      if (kind === "portStatus") {
        // GET_PORT_STATUS (1) — one byte of live printer state.
        const res = await withTimeout(
          device.controlTransferIn(
            {
              requestType: "class",
              recipient: "interface",
              request: 1,
              value: 0,
              index: iface,
            },
            1,
          ),
          4000,
          "Port status",
        );
        const v = res.data?.getUint8(0);
        if (v === undefined) return `port status: no data (${res.status})`;
        return (
          `port status: 0x${v.toString(16).padStart(2, "0")} — ` +
          `${v & 0x20 ? "PAPER EMPTY" : "paper ok"}, ` +
          `${v & 0x10 ? "selected" : "NOT SELECTED"}, ` +
          `${v & 0x08 ? "no error" : "ERROR"}`
        );
      }

      // GET_DEVICE_ID (0) — IEEE-1284 identity, length-prefixed big-endian.
      const res = await withTimeout(
        device.controlTransferIn(
          {
            requestType: "class",
            recipient: "interface",
            request: 0,
            value: 0,
            index: iface,
          },
          1024,
        ),
        4000,
        "Device ID",
      );
      if (!res.data || res.data.byteLength < 3)
        return `device id: no data (${res.status})`;
      const bytes = new Uint8Array(res.data.buffer.slice(0));
      const text = new TextDecoder("latin1").decode(bytes.subarray(2));
      return `device id: ${text.replace(/[^\x20-\x7e]/g, " ").trim()}`;
    },
    async sweep(payload, onStep) {
      const cfg = device.configuration;
      if (!cfg) return [];
      const candidates: {
        label: string;
        iface: number;
        alt: number;
        ep: number;
      }[] = [];
      for (const i of cfg.interfaces) {
        for (const e of i.alternate.endpoints) {
          if (e.direction === "out" && e.type === "bulk")
            candidates.push({
              label: `interface ${i.interfaceNumber}, endpoint ${e.endpointNumber}`,
              iface: i.interfaceNumber,
              alt: i.alternate.alternateSetting,
              ep: e.endpointNumber,
            });
        }
      }

      const tried: string[] = [];
      for (let n = 0; n < candidates.length; n++) {
        const c = candidates[n];
        onStep(c.label, n + 1, candidates.length);
        try {
          // Claim, but only touch the alternate setting if it genuinely needs
          // changing.
          //
          // Calling selectAlternateInterface unconditionally broke this: on a
          // device with a single alternate, SET_INTERFACE can stall, and a failed
          // SET_INTERFACE leaves the interface with *no* alternate selected — so
          // every endpoint on it becomes unusable for the rest of the session.
          // Interface 0 swept fine before that call was added and failed after.
          await device.claimInterface(c.iface).catch(() => undefined);
          const active = device.configuration?.interfaces.find(
            (i) => i.interfaceNumber === c.iface,
          )?.alternate.alternateSetting;
          if (active !== undefined && active !== c.alt)
            await device
              .selectAlternateInterface(c.iface, c.alt)
              .catch(() => undefined);
          await withTimeout(
            device.transferOut(c.ep, payload),
            5000,
            `Sweep write to ${c.label}`,
          );
          tried.push(`${n + 1}. ${c.label}`);
        } catch (e) {
          tried.push(`${n + 1}. ${c.label} — failed (${errText(e)})`);
        }
        await wait(SWEEP_DWELL_MS);
      }
      return tried;
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
  const override = normaliseUuid(useSettings.getState().btServiceUuid);
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
async function findWriteChar(gatt: BluetoothRemoteGATTServer): Promise<{
  char: BluetoothRemoteGATTCharacteristic;
  detail: string;
  /** Every writable characteristic found, so the sweep can try each in turn. */
  all: { char: BluetoothRemoteGATTCharacteristic; service: string }[];
}> {
  const wantChar = normaliseUuid(useSettings.getState().btCharUuid);

  let services: BluetoothRemoteGATTService[] = [];
  try {
    services = await gatt.getPrimaryServices();
  } catch (e) {
    // Chrome reports "No Services found in device" both when the device really
    // has no GATT services (the Bluetooth Classic name) and when it has one we
    // never declared — it cannot show us a service we didn't ask for. Spell out
    // both, because the fixes are completely different.
    throw new Error(
      `No GATT services (${errText(e)}). Either you picked the printer's ` +
        "Bluetooth Classic name — the entry ending -SPP or -COM, which no " +
        "browser can reach — so try the -BLE one; or its service UUID sits " +
        "outside the range asked for. To find the real one: open " +
        "chrome://bluetooth-internals in a new tab, Start Scan, tap the " +
        "printer, Inspect, and copy a service UUID into the Service UUID field " +
        "below (FF20 or the long form both work).",
    );
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

  if (!writable.length) {
    const seen = services.map((x) => short(x.uuid)).join(", ") || "none";
    throw new Error(
      "Connected, but found no writable characteristic. " +
        `Services visible: ${seen}. ` +
        (services.length
          ? "None of them accepts writes — try the other Bluetooth name, or paste the printer's service UUID into the Service UUID field."
          : "The printer exposed no services at all, which usually means you picked its Bluetooth Classic (-SPP/-COM) name; pick the -BLE one."),
    );
  }

  // An explicit override always wins; otherwise take the best-known channel,
  // breaking ties towards the faster write mode.
  const ranked = [...writable].sort(
    (a, z) =>
      channelRank(a.service, a.char.uuid) - channelRank(z.service, z.char.uuid) ||
      Number(z.char.properties.writeWithoutResponse) -
        Number(a.char.properties.writeWithoutResponse),
  );
  const chosen =
    (wantChar && writable.find((w) => w.char.uuid.toLowerCase() === wantChar)) ||
    ranked[0];

  const all = writable
    .map((w) => `${short(w.service)}/${short(w.char.uuid)}`)
    .join(", ");
  return {
    char: chosen.char,
    detail: `using ${short(chosen.service)}/${short(chosen.char.uuid)} — found: ${all}`,
    all: writable,
  };
}

/**
 * Known print channels, best first.
 *
 * The RW403B exposes six GATT services (ae3a, abf0, ae30, ae00, 1801, 1800) and
 * several may hold a writable characteristic — so "first writable one wins" is a
 * guess with a one-in-several chance. `AE30`/`AE01` is the documented print
 * service on this family of thermal heads; the rest are the pairings used by the
 * common serial-bridge chips.
 */
const PREFERRED_CHANNELS: { service: string; char: string }[] = [
  { service: "ae30", char: "ae01" },
  { service: "18f0", char: "2af1" },
  { service: "ff00", char: "ff02" },
  { service: "ffe0", char: "ffe1" },
  { service: "fee7", char: "fec7" },
  {
    service: "49535343-fe7d-4ae5-8fa9-9fafd205e455",
    char: "49535343-8841-43f4-a8d4-ecbe34729bb3",
  },
  {
    service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
    char: "6e400002-b5a3-f393-e0a9-e50e24dcca9e",
  },
];

/**
 * Lower is better: an exact known service+characteristic pair, then the right
 * service with some other writable characteristic, then anything at all.
 */
function channelRank(service: string, char: string): number {
  const s = short(service);
  const c = short(char);
  const idx = PREFERRED_CHANNELS.findIndex((p) => p.service === s);
  if (idx >= 0) return PREFERRED_CHANNELS[idx].char === c ? idx : 50 + idx;
  return 100;
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
  const { char, detail, all: writable } = await findWriteChar(gatt);

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
        await withTimeout(
          writeOne(bytes.slice(i, i + chunk)),
          BLE_WRITE_TIMEOUT_MS,
          `Sending ${chunk} bytes`,
        );
        const done = Math.min(1, (i + chunk) / bytes.length);
        onProgress?.(done);
        // Yield periodically so the progress bar actually paints and the BLE
        // stack gets a chance to drain its queue.
        if ((i / chunk) % 16 === 0)
          await new Promise((r) => window.setTimeout(r, 0));
      }
    },
    async sweep(payload, onStep) {
      const tried: string[] = [];
      // Best-known channels first, so the likely answer is step 1 rather than 5.
      const order = [...writable].sort(
        (a, z) =>
          channelRank(a.service, a.char.uuid) -
          channelRank(z.service, z.char.uuid),
      );
      for (let n = 0; n < order.length; n++) {
        const w = order[n];
        const label = `${short(w.service)}/${short(w.char.uuid)}`;
        onStep(label, n + 1, order.length);
        try {
          const c = w.char;
          const put = c.properties.writeWithoutResponse && c.writeValueWithoutResponse
            ? c.writeValueWithoutResponse.bind(c)
            : c.writeValueWithResponse
              ? c.writeValueWithResponse.bind(c)
              : c.writeValue.bind(c);
          // Probes are tiny, but BLE still caps a single write at the MTU.
          const chunk = Math.max(20, Math.min(512, useSettings.getState().btChunkSize));
          for (let i = 0; i < payload.length; i += chunk)
            await withTimeout(put(payload.slice(i, i + chunk)), 5000, `Sweep write to ${label}`);
          tried.push(`${n + 1}. ${label}`);
        } catch (e) {
          tried.push(`${n + 1}. ${label} — failed (${errText(e)})`);
        }
        await wait(SWEEP_DWELL_MS);
      }
      return tried;
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
  const maxH = rasterHeightForStock(stock, s.printMarginMm);
  const { width: sw, height: sh } = await imageSize(dataUrl);
  const rotate = resolveRotation(s.printRotate, sw, sh, maxW, maxH, s.printFit);
  // Everything downstream reasons about the design as it will be printed.
  const turned = rotate === 90 || rotate === 270;
  const ew = turned ? sh : sw;
  const eh = turned ? sw : sh;

  if (s.printFit === "width") {
    // Fill the width and let a long strip run past the label edge — correct for
    // continuous roll, where "one label" is a length the host chooses.
    return imageToBitmap1(dataUrl, { ...base, rotate, widthDots: maxW });
  }

  // Contain the whole design on one label without distorting it.
  const scale = Math.min(maxW / ew, maxH / eh);
  return imageToBitmap1(dataUrl, {
    ...base,
    rotate,
    // Whole bytes, because TSPL places bitmaps on byte boundaries.
    widthDots: Math.max(8, Math.floor((ew * scale) / 8) * 8),
    heightDots: Math.max(8, Math.round(eh * scale)),
  });
}

/**
 * Picks the rotation for a design, honouring an explicit choice or working it
 * out.
 *
 * "auto" exists because the common case is unambiguous and the host shouldn't
 * have to think about it: the designed event templates are 3:2 landscape, the
 * stock is 4×6 portrait, and turning the image a quarter-turn takes it from
 * filling ~44% of the label to nearly all of it. Since aspect is preserved, the
 * larger fit scale is simply the better use of paper.
 *
 * The 3% margin is hysteresis. Without it a near-square design would flip
 * orientation on a rounding difference, and the same session could print two
 * copies facing different ways.
 */
function resolveRotation(
  setting: PrintRotationSetting,
  sw: number,
  sh: number,
  maxW: number,
  maxH: number,
  fit: "width" | "label",
): PrintRotation {
  if (setting !== "auto") return setting;
  // With no height constraint there's nothing to optimise against, so leave a
  // "fill the width" job alone unless the host asked for a turn explicitly.
  if (fit === "width") return 0;

  const upright = Math.min(maxW / sw, maxH / sh);
  const turned = Math.min(maxW / sh, maxH / sw);
  return turned > upright * 1.03 ? 90 : 0;
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
  /** Dot dimensions of the last raster — confirms what rotation/fit resolved to. */
  lastRaster: string;
  /** Non-fatal problem with the current binding (e.g. not a printer-class interface). */
  warning: string;
  /** Pairs with a printer. Must be called from a user gesture. */
  connect: () => Promise<boolean>;
  /** Silent reconnect to an already-granted device. Safe to call on boot. */
  autoConnect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  /** Prints a composite. Resolves false (never throws) so the flow can't stall. */
  printImage: (dataUrl: string) => Promise<boolean>;
  /** Tiny text label — proves the link and the stock geometry in ~1 second. */
  printTest: () => Promise<boolean>;
  /**
   * Sends one protocol probe and reports what came back.
   *
   * Exists because a printer that accepts a job and prints nothing is opaque
   * from the browser: `transferOut` succeeds either way. Each probe isolates one
   * layer (motor, parser, language, print engine) so the fault can be located by
   * watching the hardware.
   */
  runProbe: (id: ProbeId) => Promise<string>;
  /** Human-readable outcome of the last probe, for the Admin readout. */
  probeResult: string;
  /**
   * Writes a wake-the-motor payload to every channel in turn so the host can see
   * which one the printer actually listens on, then reports the numbered list.
   *
   * The last resort when a job reports sent and the printer does nothing: it
   * removes the need for me to know the right interface/endpoint at all.
   */
  sweepChannels: () => Promise<string>;
  /** Live commentary while a sweep runs. */
  sweepStep: string;
  /**
   * Asks the printer a question over the USB control pipe, which it is obliged to
   * answer regardless of what the data endpoint is doing.
   */
  askPrinter: (kind: "portStatus" | "deviceId" | "softReset") => Promise<string>;
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
  lastRaster: "",
  warning: "",
  probeResult: "",
  sweepStep: "",

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
        warning: link.warning ?? "",
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
        warning: link.warning ?? "",
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
    set({
      status: "offline",
      deviceName: "",
      detail: "",
      warning: "",
      progress: 0,
    });
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
        const job = currentJob();
        // ZPL's ^GF treats a set bit as black, matching Bitmap1, so it needs no
        // inversion — the polarity knob is TSPL's problem alone.
        const bytes =
          useSettings.getState().printerLanguage === "zpl"
            ? zplImageJob(bitmap, job)
            : tsplImageJob(bitmap, job);
        set({
          lastJobBytes: bytes.length,
          lastRaster: `${bitmap.width}×${bitmap.height}`,
        });
        await link!.write(bytes, (frac) => set({ progress: frac }));
        set({ status: "ready", progress: 1, lastPrintedSource: dataUrl });
        return true;
      } catch (e) {
        await dropLinkIfWedged(e);
        set({ status: "error", lastError: errText(e), progress: 0 });
        return false;
      }
    }),

  askPrinter: (kind) =>
    queue(async () => {
      if (!link?.connected() && !(await get().autoConnect())) {
        const msg = "No printer connected.";
        set({ probeResult: msg });
        return msg;
      }
      if (!link!.classRequest) {
        const msg = "Control requests need the USB transport.";
        set({ probeResult: msg });
        return msg;
      }
      try {
        const msg = await link!.classRequest(kind);
        set({ probeResult: msg, lastError: "" });
        return msg;
      } catch (e) {
        const msg = `${kind} failed — ${errText(e)}`;
        await dropLinkIfWedged(e);
        set({ probeResult: msg, lastError: errText(e) });
        return msg;
      }
    }),

  sweepChannels: () =>
    queue(async () => {
      if (!link?.connected() && !(await get().autoConnect())) {
        const msg = "No printer connected.";
        set({ probeResult: msg });
        return msg;
      }
      if (!link!.sweep) {
        const msg = "This transport can't be swept.";
        set({ probeResult: msg });
        return msg;
      }

      // Both languages in one payload: a TSPL feed and a ZPL config request. If
      // the channel is right, one of them must produce movement, whichever
      // language the printer is in.
      const payload = new Uint8Array([
        ...probeBytes("feed"),
        ...zplProbeBytes("config"),
      ]);

      set({ status: "printing", progress: 0, lastError: "", sweepStep: "" });
      try {
        const tried = await link!.sweep(payload, (label, i, total) => {
          set({
            sweepStep: `Step ${i} of ${total}: ${label} — watch the printer`,
            progress: i / total,
          });
        });
        set({
          status: "ready",
          progress: 1,
          sweepStep: "",
          probeResult:
            `Swept ${tried.length} channel(s). Which step made the paper move?\n` +
            tried.join("\n"),
        });
        return `Tried ${tried.length} channel(s)`;
      } catch (e) {
        const msg = errText(e);
        set({ status: "error", lastError: msg, sweepStep: "", progress: 0 });
        return msg;
      }
    }),

  runProbe: (id) =>
    queue(async () => {
      if (!link?.connected() && !(await get().autoConnect())) {
        const msg = "No printer connected.";
        set({ probeResult: msg });
        return msg;
      }
      const bytes =
        id === "zplConfig"
          ? zplProbeBytes("config")
          : id === "zplLabel"
            ? zplProbeBytes("label")
            : probeBytes(id);
      try {
        await link!.write(bytes);
        let reply = "";
        if (probeReadsBack(id)) {
          if (!link!.read) {
            reply = " — no IN endpoint on this interface, cannot read a reply";
          } else {
            const data = await link!.read(64).catch(() => null);
            reply = data?.length
              ? ` — replied ${data.length}B: ${[...data]
                  .map((b) => b.toString(16).padStart(2, "0"))
                  .join(" ")}`
              : " — no reply (the print engine may not be listening)";
          }
        }
        const msg = `Sent ${bytes.length}B${reply}`;
        set({ probeResult: `${id}: ${msg}`, lastError: "" });
        return msg;
      } catch (e) {
        const msg = errText(e);
        await dropLinkIfWedged(e);
        set({ probeResult: `${id}: failed — ${msg}`, lastError: msg });
        return msg;
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
        const bytes = (
          useSettings.getState().printerLanguage === "zpl"
            ? zplTestJob
            : tsplTestJob
        )(currentJob(), [
          "MAD SHOTS",
          `Stock ${round1(s.labelWidthMm)} x ${round1(s.labelHeightMm)} mm`,
          `Gap ${round1(s.labelGapMm)} mm  Margin ${round1(s.printMarginMm)} mm`,
          `Density ${s.printDensity}  Speed ${s.printSpeed}`,
          `Link ${s.printTransport.toUpperCase()} ${s.printerLanguage.toUpperCase()}`,
          new Date().toLocaleString(),
        ]);
        // Text-only job — clear any raster size left over from a photo print,
        // which otherwise reads as though the test label were 68 KB of bitmap.
        set({ lastJobBytes: bytes.length, lastRaster: "" });
        await link!.write(bytes, (frac) => set({ progress: frac }));
        set({ status: "ready", progress: 1 });
        return true;
      } catch (e) {
        await dropLinkIfWedged(e);
        set({ status: "error", lastError: errText(e), progress: 0 });
        return false;
      }
    }),
}));

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
