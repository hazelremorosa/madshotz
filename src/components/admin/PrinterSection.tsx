import { useEffect, useRef, useState } from "react";
import {
  Chip,
  NumberField,
  Row,
  Section,
  Segmented,
  Slider,
  SmallButton,
  TextField,
  Toggle,
} from "@/components/admin/controls";
import {
  DITHER_MODES,
  bitmap1ToDataUrl,
  inkCoverage,
  type DitherMode,
} from "@/lib/dither";
import {
  LABEL_PRESETS,
  PROBES,
  dotsToMm,
  mmToDots,
  rasterWidthForStock,
} from "@/lib/tspl";
import {
  applyLabelPreset,
  bluetoothSupported,
  currentStock,
  rasterFor,
  transportSupported,
  usbSupported,
  usePrinter,
  type PrintStatus,
} from "@/lib/printer";
import { buildPreviewComposite } from "@/lib/previewComposite";
import {
  PRINT_ROTATIONS,
  useSettings,
  type PrinterLanguage,
  type PrintRotationSetting,
  type PrintTransport,
} from "@/store/settings";
import { cn } from "@/lib/cn";

/**
 * Admin → System → Printing.
 *
 * This panel is doing more work than a settings form normally would, because the
 * printer is a *direct thermal* head and nothing about its output can be
 * predicted from the screen. The two things that earn their place:
 *
 * - **The 1-bit preview** renders through the exact same `rasterFor()` the print
 *   job uses, so the host tunes exposure against the real halftone instead of
 *   burning a roll of labels to find out.
 * - **The diagnostics readout** exposes the discovered USB endpoint / BLE UUIDs
 *   and the payload size. Those are the facts nobody can know until the printer
 *   is physically in hand, and surfacing them means commissioning it is a
 *   settings change rather than a code change and a redeploy.
 */

/**
 * Hides the image-calibration controls (halftone, exposure, brightness,
 * contrast, density, speed) and the 1-bit preview.
 *
 * Owner's call (2026-07-25): run on fixed sensible values for now and decide
 * later whether these come back. Flip to `true` to restore the whole group —
 * the controls and the settings behind them are untouched, so nothing needs
 * rebuilding, and the values keep driving every print either way.
 *
 * The fixed values live in `DEFAULTS` in `store/settings.ts` (Floyd–Steinberg,
 * exposure 128, brightness 0, contrast 25) and `JOB_DEFAULTS` in `lib/tspl.ts`
 * (density 8, speed 4 — the conventional TSPL baseline this class of head ships
 * with). Same pattern as `ALLOW_FRAME_UPLOAD` in `AdminPanel`.
 */
const SHOW_CALIBRATION = false;

/**
 * Everything worth knowing about the current printer setup, as plain text.
 *
 * Exists because diagnosing a printer remotely means asking someone to scroll to
 * the bottom of a long panel and photograph a small grey box, and to read out
 * numbers that matter to the byte. One tap and a paste is far less lossy — and it
 * captures the settings around the binding, which a photo of the binding alone
 * leaves out.
 */
/** `0x0483`-style, or "-" when nothing has been paired yet. */
function hex4o(n: number | null): string {
  return n === null ? "-" : `0x${n.toString(16).padStart(4, "0")}`;
}

function diagnosticsReport(
  s: ReturnType<typeof useSettings.getState>,
  printer: ReturnType<typeof usePrinter.getState>,
): string {
  const stock = currentStock();
  const bound = printer.status !== "offline" && !!printer.detail;
  const lines = [
    "MAD SHOTS — printer diagnostics",
    new Date().toISOString(),
    // A report taken while disconnected has no binding in it, and that is not
    // obvious from a wall of settings — it cost a full round trip to discover.
    ...(bound
      ? []
      : [
          "",
          "*** NOT CONNECTED — there is no binding in this report. ***",
          '*** Plug in the OTG cable, tap "Choose printer", then copy again. ***',
        ]),
    `UA: ${navigator.userAgent}`,
    `WebUSB: ${usbSupported() ? "yes" : "no"}   Web Bluetooth: ${bluetoothSupported() ? "yes" : "no"}`,
    "",
    `status:    ${printer.status}`,
    `device:    ${printer.deviceName || "(none)"}`,
    `binding:   ${printer.detail || "(not bound)"}`,
  ];
  if (printer.warning) lines.push(`warning:   ${printer.warning}`);
  if (printer.lastError) lines.push(`lastError: ${printer.lastError}`);

  lines.push(
    "",
    `transport: ${s.printTransport}   language: ${s.printerLanguage}`,
    `enabled:   ${s.printEnabled}   autoPrint: ${s.autoPrint}   copies: ${s.printCopies}`,
    `stock:     ${stock.widthMm} x ${stock.heightMm} mm, gap ${stock.gapMm} mm, margin ${s.printMarginMm} mm (${s.labelPresetId})`,
    `fit:       ${s.printFit}   rotation: ${s.printRotate}`,
    `geometry:  head ${mmToDots(stock.widthMm)} dots, raster ${rasterWidthForStock(stock, s.printMarginMm)} dots`,
    `burn:      density ${s.printDensity}   speed ${s.printSpeed}`,
    `halftone:  ${s.ditherMode} exposure ${s.ditherThreshold} brightness ${s.printBrightness} contrast ${s.printContrast} invertRaster ${s.printInvertRaster}`,
    `usb:       interface ${s.usbInterface}, endpoint ${s.usbEndpoint}, chunk ${s.usbChunkSize}B, showAllDevices ${s.usbAnyDevice}`,
    // Hex, to match the binding line above — comparing 0x0483 against 1155 is
    // needless friction when the whole point is spotting a wrong device.
    `usb ids:   ${hex4o(s.usbVendorId)}:${hex4o(s.usbProductId)}`,
    `bluetooth: chunk ${s.btChunkSize}B, service "${s.btServiceUuid}", char "${s.btCharUuid}", device ${s.btDeviceId ?? "-"}`,
    `last job:  ${printer.lastJobBytes ? `${(printer.lastJobBytes / 1024).toFixed(1)} KB` : "-"}   raster ${printer.lastRaster || "-"}`,
  );
  if (printer.probeResult) lines.push("", "probe / sweep:", printer.probeResult);
  return lines.join("\n");
}

const STATUS_LABEL: Record<PrintStatus, string> = {
  offline: "Not connected",
  connecting: "Connecting…",
  ready: "Ready",
  printing: "Printing…",
  error: "Problem",
};

const STATUS_TONE: Record<PrintStatus, string> = {
  offline: "bg-cocoa/10 text-cocoa/50",
  connecting: "bg-amber-100 text-amber-700",
  ready: "bg-emerald-100 text-emerald-700",
  printing: "bg-sky-100 text-sky-700",
  error: "bg-red-100 text-red-600",
};

export function PrinterSection({
  onToast,
}: {
  onToast: (message: string) => void;
}) {
  const s = useSettings();
  const set = useSettings((st) => st.set);
  const printer = usePrinter();
  /**
   * Holds the report when the clipboard is unavailable. Android restricts
   * clipboard writes in some contexts, and a diagnostics button that silently
   * does nothing would be worse than no button — so fall back to showing the
   * text for a long-press copy.
   */
  const [reportText, setReportText] = useState("");

  const supported = transportSupported(s.printTransport);
  const stock = currentStock();
  const headDots = mmToDots(stock.widthMm);
  const rasterDots = rasterWidthForStock(stock, s.printMarginMm);

  return (
    <Section
      emoji="🖨️"
      title="Printing"
      note="Munbyn RealWriter 403B — direct thermal, 203 dpi. Prints are black-and-white halftone; the colour copy goes out by QR."
    >
      <Row
        label="Print physical copies"
        hint="Off = the booth behaves exactly as it did before, animation only."
      >
        <Toggle
          checked={s.printEnabled}
          onChange={(v) => set("printEnabled", v)}
          label="Enable printing"
        />
      </Row>

      {s.printEnabled && (
        <>
          {/* ── Connection ───────────────────────────────────────────────── */}
          <Row
            label="Connection"
            hint="USB needs an OTG cable but is far faster. Bluetooth keeps the charging port free."
            stacked
          >
            <Segmented<PrintTransport>
              options={[
                { value: "usb", label: "USB (OTG)" },
                { value: "bluetooth", label: "Bluetooth" },
              ]}
              value={s.printTransport}
              onChange={(v) => set("printTransport", v)}
            />
          </Row>

          {!supported && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-700">
              {s.printTransport === "usb" ? "WebUSB" : "Web Bluetooth"} isn't
              available in this browser. Use Chrome on Android or desktop —
              Safari and iOS support neither, so an iPad can't print.
              {!usbSupported() && !bluetoothSupported() && " Neither API is present here."}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider",
                STATUS_TONE[printer.status],
              )}
            >
              {STATUS_LABEL[printer.status]}
            </span>
            {printer.deviceName && (
              <span className="min-w-0 truncate text-xs text-cocoa/60">
                {printer.deviceName}
              </span>
            )}
            <span className="grow" />
            {printer.status === "ready" || printer.status === "printing" ? (
              <SmallButton onClick={() => void printer.disconnect()}>
                Disconnect
              </SmallButton>
            ) : (
              <SmallButton
                tone="brand"
                disabled={!supported || printer.status === "connecting"}
                onClick={async () => {
                  const ok = await printer.connect();
                  onToast(ok ? "Printer connected" : "Not connected");
                }}
              >
                {s.printTransport === "usb" ? "Choose printer" : "Pair printer"}
              </SmallButton>
            )}
          </div>

          {printer.status === "printing" && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-cocoa/10">
              <div
                className="h-full brand-fill transition-[width]"
                style={{ width: `${Math.round(printer.progress * 100)}%` }}
              />
            </div>
          )}

          {printer.lastError && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-xs leading-snug text-red-600">
              {printer.lastError}
            </p>
          )}

          {/* A non-printer-class binding is the difference between "sent" and
              "printed", so it needs to be impossible to miss. */}
          {printer.warning && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-800">
              ⚠️ {printer.warning}
            </p>
          )}

          {s.printTransport === "bluetooth" && (
            <p className="text-xs leading-snug text-cocoa/50">
              Munbyn devices advertise two Bluetooth names. Pick the one ending
              <span className="font-semibold"> -BLE</span> — a
              <span className="font-semibold"> -SPP</span> or
              <span className="font-semibold"> -COM</span> entry is Bluetooth
              Classic, which no web page can reach.
            </p>
          )}

          <Row
            label="Command language"
            hint="This printer's self-test reports “ZPL or TSPL”. Only the hardware can say which one actually produces paper — if TSPL prints nothing, try ZPL."
            stacked
          >
            <Segmented<PrinterLanguage>
              options={[
                { value: "tspl", label: "TSPL" },
                { value: "zpl", label: "ZPL" },
              ]}
              value={s.printerLanguage}
              onChange={(v) => set("printerLanguage", v)}
            />
          </Row>

          <Row
            label="Print automatically"
            hint="Print as soon as the composite is ready, with nothing to tap."
          >
            <Toggle
              checked={s.autoPrint}
              onChange={(v) => set("autoPrint", v)}
              label="Auto print"
            />
          </Row>

          <Row label="Copies" hint="Identical labels per session.">
            <NumberField
              label="Copies"
              value={s.printCopies}
              onChange={(v) => set("printCopies", v)}
              min={1}
              max={9}
            />
          </Row>

          {/* ── Stock ────────────────────────────────────────────────────── */}
          <Row label="Label stock" hint="What's loaded in the printer." stacked>
            <div className="flex flex-wrap gap-1.5">
              {LABEL_PRESETS.map((p) => (
                <Chip
                  key={p.id}
                  active={s.labelPresetId === p.id}
                  onClick={() => applyLabelPreset(p.id)}
                >
                  {p.label}
                </Chip>
              ))}
              <Chip
                active={s.labelPresetId === "custom"}
                onClick={() => set("labelPresetId", "custom")}
              >
                Custom
              </Chip>
            </div>
          </Row>

          <p className="-mt-1 text-xs leading-snug text-cocoa/50">
            {LABEL_PRESETS.find((p) => p.id === s.labelPresetId)?.hint ??
              "Measure the stock yourself — width is across the head, height is the feed direction."}
          </p>

          <Row label="Width" hint="Across the head. This model covers 40–108 mm.">
            <NumberField
              label="Label width"
              value={s.labelWidthMm}
              onChange={(v) => {
                set("labelWidthMm", v);
                set("labelPresetId", "custom");
              }}
              min={20}
              max={110}
              step={0.1}
              suffix="mm"
            />
          </Row>

          <Row label="Height" hint="Feed direction.">
            <NumberField
              label="Label height"
              value={s.labelHeightMm}
              onChange={(v) => {
                set("labelHeightMm", v);
                set("labelPresetId", "custom");
              }}
              min={20}
              max={300}
              step={0.1}
              suffix="mm"
            />
          </Row>

          <Row
            label="Gap"
            hint="Space between die-cut labels. Set 0 for continuous roll — a wrong gap makes it feed blanks."
          >
            <NumberField
              label="Label gap"
              value={s.labelGapMm}
              onChange={(v) => {
                set("labelGapMm", v);
                set("labelPresetId", "custom");
              }}
              min={0}
              max={10}
              step={0.5}
              suffix="mm"
            />
          </Row>

          <Row label="Margin" hint="Unprinted border — feed drift shows at the edges.">
            <NumberField
              label="Print margin"
              value={s.printMarginMm}
              onChange={(v) => set("printMarginMm", v)}
              min={0}
              max={10}
              step={0.5}
              suffix="mm"
            />
          </Row>

          <Row
            label="Fit"
            hint="Whole design on one label, or fill the width and let a long strip run on (continuous roll)."
            stacked
          >
            <Segmented<"label" | "width">
              options={[
                { value: "label", label: "Fit the label" },
                { value: "width", label: "Fill the width" },
              ]}
              value={s.printFit}
              onChange={(v) => set("printFit", v)}
            />
          </Row>

          <Row
            label="Rotation"
            hint="Auto turns a landscape design a quarter-turn so it fills portrait stock instead of a band across the top."
            stacked
          >
            <Segmented<PrintRotationSetting>
              options={PRINT_ROTATIONS}
              value={s.printRotate}
              onChange={(v) => set("printRotate", v)}
            />
          </Row>

          {/* ── Calibration (hidden — see SHOW_CALIBRATION) ───────────────── */}
          {SHOW_CALIBRATION && (
            <>
              <Row
                label="Halftone"
                hint="How grey is faked with black-or-nothing dots."
                stacked
              >
                <div className="flex flex-wrap gap-1.5">
                  {DITHER_MODES.map((m) => (
                    <Chip
                      key={m.id}
                      active={s.ditherMode === m.id}
                      onClick={() => set("ditherMode", m.id as DitherMode)}
                    >
                      {m.label}
                    </Chip>
                  ))}
                </div>
              </Row>

              <p className="-mt-1 text-xs leading-snug text-cocoa/50">
                {DITHER_MODES.find((m) => m.id === s.ditherMode)?.hint}
              </p>

              <Row
                label="Exposure"
                hint="Lower = more black. Start here if prints look muddy."
                stacked
              >
                <Slider
                  label="Dither threshold"
                  value={s.ditherThreshold}
                  onChange={(v) => set("ditherThreshold", v)}
                  min={40}
                  max={215}
                  display={String(s.ditherThreshold)}
                />
              </Row>

              {/* Redundant with Exposure — the two are algebraically the same
                  knob with opposite signs. Kept only so the control matches the
                  setting; pick one if this section ever comes back. */}
              <Row label="Brightness" stacked>
                <Slider
                  label="Print brightness"
                  value={s.printBrightness}
                  onChange={(v) => set("printBrightness", v)}
                  min={-60}
                  max={60}
                  display={`${s.printBrightness > 0 ? "+" : ""}${s.printBrightness}`}
                />
              </Row>

              <Row
                label="Contrast"
                hint="Photos need a push to survive halftoning."
                stacked
              >
                <Slider
                  label="Print contrast"
                  value={s.printContrast}
                  onChange={(v) => set("printContrast", v)}
                  min={-40}
                  max={80}
                  display={`${s.printContrast > 0 ? "+" : ""}${s.printContrast}`}
                />
              </Row>

              <Row
                label="Density"
                hint="Burn intensity. Higher is darker but slower and wears the head."
                stacked
              >
                <Slider
                  label="Print density"
                  value={s.printDensity}
                  onChange={(v) => set("printDensity", v)}
                  min={0}
                  max={15}
                  display={String(s.printDensity)}
                />
              </Row>

              <Row label="Speed" hint="Inches per second. Slower prints darker." stacked>
                <Slider
                  label="Print speed"
                  value={s.printSpeed}
                  onChange={(v) => set("printSpeed", v)}
                  min={1}
                  max={6}
                  display={`${s.printSpeed} ips`}
                />
              </Row>

              <PrintPreview />
            </>
          )}

          {/* ── Commissioning ────────────────────────────────────────────── */}
          <Row
            label="Test print"
            hint="Text, a border and a density ladder — a few hundred bytes, so it's quick even over Bluetooth."
          >
            <SmallButton
              tone="brand"
              disabled={printer.status === "printing"}
              onClick={async () => {
                const ok = await printer.printTest();
                onToast(
                  ok
                    ? "Sent — if no label comes out, check the readout below"
                    : "Test print failed",
                );
              }}
            >
              Print test
            </SmallButton>
          </Row>

          <Row
            label="Print a sample photo"
            hint="A full receipt with placeholder photos — the real raster path, end to end."
          >
            <SmallButton
              disabled={printer.status === "printing"}
              onClick={async () => {
                const url = await buildPreviewComposite();
                const ok = await printer.printImage(url);
                onToast(
                  ok
                    ? "Sent — if no label comes out, check the readout below"
                    : "Print failed",
                );
              }}
            >
              Print preview
            </SmallButton>
          </Row>

          <Row
            label="Negative image"
            hint="If the first test print comes out inverted, flip this and nothing else."
          >
            <Toggle
              checked={s.printInvertRaster}
              onChange={(v) => set("printInvertRaster", v)}
              label="Invert raster bits"
            />
          </Row>

          {s.printTransport === "usb" && (
            <Row
              label="Show all USB devices"
              hint="Only if the printer doesn't appear. Without the filter the chooser also lists non-printers, which accept a job and print nothing."
            >
              <Toggle
                checked={s.usbAnyDevice}
                onChange={(v) => set("usbAnyDevice", v)}
                label="Show all USB devices"
              />
            </Row>
          )}

          {s.printTransport === "usb" && (
            <>
              <Row
                label="Chunk size"
                hint="Bytes per USB transfer. Lower it to 1024 or 512 if a job stalls before any progress."
              >
                <NumberField
                  label="USB chunk size"
                  value={s.usbChunkSize}
                  onChange={(v) => set("usbChunkSize", v)}
                  min={64}
                  max={16384}
                  step={512}
                  suffix="B"
                />
              </Row>
              <Row
                label="Force interface"
                hint="-1 auto-picks a printer-class interface. Set a number from the readout below only if that picks wrong."
              >
                <NumberField
                  label="USB interface number"
                  value={s.usbInterface}
                  onChange={(v) => set("usbInterface", v)}
                  min={-1}
                  max={16}
                />
              </Row>
              <Row label="Force endpoint" hint="-1 auto-picks the first bulk OUT.">
                <NumberField
                  label="USB endpoint number"
                  value={s.usbEndpoint}
                  onChange={(v) => set("usbEndpoint", v)}
                  min={-1}
                  max={16}
                />
              </Row>
            </>
          )}

          {s.printTransport === "bluetooth" && (
            <>
              <Row
                label="Chunk size"
                hint="Bytes per BLE write. 20 is the safe floor; raise it to speed prints up if it holds."
              >
                <NumberField
                  label="Bluetooth chunk size"
                  value={s.btChunkSize}
                  onChange={(v) => set("btChunkSize", v)}
                  min={20}
                  max={512}
                  step={20}
                  suffix="B"
                />
              </Row>
              <Row
                label="Service UUID"
                hint="Only needed if pairing reports no writable characteristic. Leave blank to auto-discover."
                stacked
              >
                <TextField
                  value={s.btServiceUuid}
                  onChange={(v) => set("btServiceUuid", v.trim())}
                  placeholder="0000ff00-0000-1000-8000-00805f9b34fb"
                  maxLength={40}
                  mono
                />
              </Row>
              <Row
                label="Characteristic UUID"
                hint="Optional — pins the write channel if several are exposed."
                stacked
              >
                <TextField
                  value={s.btCharUuid}
                  onChange={(v) => set("btCharUuid", v.trim())}
                  placeholder="auto"
                  maxLength={40}
                  mono
                />
              </Row>
            </>
          )}

          {/* ── Protocol probe ───────────────────────────────────────────── */}
          <div className="flex flex-col gap-2 rounded-xl border border-cocoa/10 bg-white/40 p-3">
            <div className="text-sm font-semibold text-cocoa">Protocol probe</div>
            <p className="text-xs leading-snug text-cocoa/55">
              If a job reports “sent” but nothing comes out, the printer is
              accepting bytes and discarding them — from here that looks identical
              to success. Tap these in order and watch the hardware; each one
              isolates a different layer.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PROBES.map((probe) => (
                <SmallButton
                  key={probe.id}
                  disabled={printer.status === "printing"}
                  onClick={async () => {
                    const msg = await printer.runProbe(probe.id);
                    onToast(`${probe.label}: ${msg}`);
                  }}
                >
                  {probe.label}
                </SmallButton>
              ))}
            </div>
            <ul className="flex flex-col gap-0.5 text-[11px] leading-snug text-cocoa/45">
              {PROBES.map((probe) => (
                <li key={probe.id}>
                  <span className="font-semibold">{probe.label}</span> — {probe.expect}
                </li>
              ))}
            </ul>
            <div className="rounded-lg border border-cocoa/15 bg-white/60 p-2.5">
              <div className="text-xs font-bold text-cocoa">
                Nothing moved at all?
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-cocoa/55">
                Then the bytes aren't reaching the print engine, and the channel is
                wrong rather than the language. This writes a feed command to every
                interface and endpoint the device exposes, pausing about 2 seconds
                on each. Watch the printer and note which step moves the paper.
              </p>
              <div className="mt-2">
                <SmallButton
                  tone="brand"
                  disabled={printer.status === "printing"}
                  onClick={async () => {
                    const msg = await printer.sweepChannels();
                    onToast(msg);
                  }}
                >
                  Find the print channel
                </SmallButton>
              </div>
              {printer.sweepStep && (
                <div className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800">
                  {printer.sweepStep}
                </div>
              )}
            </div>

            {printer.probeResult && (
              <div className="whitespace-pre-line rounded-lg bg-cocoa/5 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-cocoa/70">
                {printer.probeResult}
              </div>
            )}
            <p className="text-[11px] leading-snug text-cocoa/45">
              <span className="font-semibold">ZPL config printing</span> is the
              answer to look for — it means ZPL arrives and is understood, so set
              Command language to ZPL above and printing works.{" "}
              <span className="font-semibold">Feed or Self test working</span> means
              TSPL is understood too, and the fault is in the job we build.{" "}
              <span className="font-semibold">Nothing at all</span> means commands
              aren't reaching the print engine — try the Bluetooth transport, since
              the vendor app uses it.
            </p>
          </div>

          {/* ── Diagnostics ──────────────────────────────────────────────── */}
          <div className="rounded-xl bg-cocoa/5 px-3 py-2 font-mono text-[11px] leading-relaxed text-cocoa/60">
            <div>
              head {headDots} dots · raster {rasterDots} dots (
              {Math.round(dotsToMm(rasterDots))} mm)
            </div>
            <div className="whitespace-pre-line break-words">
              {printer.detail || "no device bound yet"}
            </div>
            {printer.lastJobBytes > 0 && (
              <div>
                last job {(printer.lastJobBytes / 1024).toFixed(1)} KB
                {printer.lastRaster && ` · raster ${printer.lastRaster}`}
              </div>
            )}
          </div>

          <Row
            label="Copy diagnostics"
            hint="Puts this whole readout — binding, settings, last job, probe results — on the clipboard."
          >
            <SmallButton
              onClick={async () => {
                const text = diagnosticsReport(
                  useSettings.getState(),
                  usePrinter.getState(),
                );
                try {
                  await navigator.clipboard.writeText(text);
                  setReportText("");
                  onToast("Diagnostics copied");
                } catch {
                  // No clipboard permission — show it instead so it can still
                  // be selected and copied by hand.
                  setReportText(text);
                  onToast("Clipboard blocked — select the text below");
                }
              }}
            >
              Copy
            </SmallButton>
          </Row>

          {reportText && (
            <div className="flex flex-col gap-1.5">
              <textarea
                readOnly
                value={reportText}
                rows={10}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-xl border border-cocoa/15 bg-white/80 p-2 font-mono text-[10px] leading-relaxed text-cocoa"
              />
              <SmallButton onClick={() => setReportText("")}>Hide</SmallButton>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

/**
 * Live 1-bit preview.
 *
 * Debounced, because every slider nudge re-composites and re-dithers a
 * multi-megapixel canvas and dragging a slider would otherwise queue dozens of
 * those. Renders through `rasterFor()` — the print path itself — so this can't
 * quietly disagree with what comes out of the printer.
 */
function PrintPreview() {
  const [src, setSrc] = useState("");
  const [coverage, setCoverage] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const seq = useRef(0);

  // Every setting that changes the dots on paper, flattened to one string so the
  // effect has a stable primitive dependency. A selector returning an array would
  // fail Object.is on every render and loop.
  const st = useSettings();
  const deps = [
    st.labelWidthMm,
    st.labelHeightMm,
    st.printMarginMm,
    st.printFit,
    st.ditherMode,
    st.ditherThreshold,
    st.printBrightness,
    st.printContrast,
    st.defaultLayoutId,
    st.defaultOverlayId,
    st.designMode,
    st.eventTemplateId,
    st.eventName,
    st.footerNote,
  ].join("|");

  useEffect(() => {
    const mine = ++seq.current;
    setBusy(true);
    const t = window.setTimeout(async () => {
      try {
        const composite = await buildPreviewComposite();
        const bitmap = await rasterFor(composite);
        // A newer run started while this one was rendering — drop this result.
        if (mine !== seq.current) return;
        setSrc(bitmap1ToDataUrl(bitmap));
        setCoverage(inkCoverage(bitmap));
        setError("");
      } catch (e) {
        if (mine !== seq.current) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    }, 220);
    return () => window.clearTimeout(t);
  }, [deps]);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-semibold text-cocoa">
        What the printer will burn
      </div>
      <div className="text-xs leading-snug text-cocoa/50">
        Actual 1-bit output at 203 dpi. Zoom in to judge the halftone — on screen
        it's shown small, so the dots blur together the way they will on paper.
      </div>
      <div className="mx-auto w-full max-w-[220px] overflow-hidden rounded-xl border border-cocoa/15 bg-white">
        {error ? (
          <p className="p-3 text-xs text-red-600">{error}</p>
        ) : src ? (
          <img
            src={src}
            alt="Monochrome print preview"
            className={cn(
              "block w-full transition-opacity",
              busy && "opacity-50",
            )}
          />
        ) : (
          <div className="p-6 text-center text-xs text-cocoa/40">Rendering…</div>
        )}
      </div>
      {!error && src && (
        <div className="text-center font-mono text-[11px] text-cocoa/50">
          {/* A receipt is mostly bare paper, so healthy coverage is only a few
              percent — one decimal, or the useful range all reads as "0%". */}
          {(coverage * 100).toFixed(1)}% ink coverage
          {coverage > 0.55 && " — very dark, try raising Exposure"}
          {coverage < 0.01 && " — almost nothing will print, lower Exposure"}
        </div>
      )}
    </div>
  );
}
