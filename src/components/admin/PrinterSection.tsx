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
import { useSettings, type PrintTransport } from "@/store/settings";
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

          {/* ── Exposure ─────────────────────────────────────────────────── */}
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

          <Row label="Exposure" hint="Lower = more black. Start here if prints look muddy." stacked>
            <Slider
              label="Dither threshold"
              value={s.ditherThreshold}
              onChange={(v) => set("ditherThreshold", v)}
              min={40}
              max={215}
              display={String(s.ditherThreshold)}
            />
          </Row>

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

          <Row label="Contrast" hint="Photos need a push to survive halftoning." stacked>
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
                onToast(ok ? "Test label sent" : "Test print failed");
              }}
            >
              Print test
            </SmallButton>
          </Row>

          <Row
            label="Print the preview"
            hint="Sends the composite above — the real raster path, end to end."
          >
            <SmallButton
              disabled={printer.status === "printing"}
              onClick={async () => {
                const url = await buildPreviewComposite();
                const ok = await printer.printImage(url);
                onToast(ok ? "Preview sent" : "Print failed");
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
              hint="Turn on if the printer doesn't appear — some report a vendor class, not the printer class."
            >
              <Toggle
                checked={s.usbAnyDevice}
                onChange={(v) => set("usbAnyDevice", v)}
                label="Show all USB devices"
              />
            </Row>
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

          {/* ── Diagnostics ──────────────────────────────────────────────── */}
          <div className="rounded-xl bg-cocoa/5 px-3 py-2 font-mono text-[11px] leading-relaxed text-cocoa/60">
            <div>
              head {headDots} dots · raster {rasterDots} dots (
              {Math.round(dotsToMm(rasterDots))} mm)
            </div>
            <div>
              {printer.detail || "no device bound yet"}
            </div>
            {printer.lastJobBytes > 0 && (
              <div>last job {(printer.lastJobBytes / 1024).toFixed(1)} KB</div>
            )}
          </div>
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
