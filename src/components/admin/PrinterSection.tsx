import { useEffect, useMemo, useState } from "react";
import {
  NumberField,
  Row,
  Section,
  Segmented,
  Slider,
  SmallButton,
  TextField,
  Toggle,
} from "@/components/admin/controls";
import { cn } from "@/lib/cn";
import { DITHER_MODES, type DitherMode } from "@/lib/dither";
import { isAndroidApp } from "@/lib/native";
import {
  blockingReasons,
  describeReason,
  renderPreview,
  SYSTEM_PRINTER,
  usePrinter,
} from "@/lib/print/engine";
import { LANGUAGES, papersFor, prettyKeyword } from "@/lib/print/paper";
import type {
  Connection,
  FoundPrinter,
  PrinterHealth,
  PrinterLanguage,
  PrintFit,
  PrintQuality,
  PrintRotate,
} from "@/lib/print/types";
import { buildPreviewComposite } from "@/lib/previewComposite";
import { useSession } from "@/store/session";
import { useSettings } from "@/store/settings";

const CONNECTION_LABEL: Record<Connection, { icon: string; label: string }> = {
  ipp: { icon: "📶", label: "Wi-Fi" },
  socket: { icon: "📶", label: "Wi-Fi (raw)" },
  usb: { icon: "🔌", label: "USB" },
  bluetooth: { icon: "🔵", label: "Bluetooth" },
  ble: { icon: "🔵", label: "Bluetooth LE" },
  system: { icon: "🗂️", label: "Print dialog" },
};

const selectClass =
  "w-full rounded-xl border border-cocoa/15 bg-white/80 px-3 py-2 text-sm text-cocoa outline-none focus:border-brand/50";

/**
 * Admin → System → Printer. Find a printer, pick it, set the paper, test.
 *
 * Everything here is a setting in `store/settings.ts`; the engine in
 * `lib/print/engine.ts` reads them at print time.
 */
export function PrinterSection({
  onToast,
}: {
  onToast: (msg: string) => void;
}) {
  const s = useSettings();
  const set = s.set;
  const printer = s.printer;
  const engine = usePrinter();
  const [finding, setFinding] = useState(!printer);

  // Keep the health readout live while Admin is open.
  useEffect(() => {
    if (!printer) return;
    void usePrinter.getState().refreshHealth();
    const iv = window.setInterval(
      () => void usePrinter.getState().refreshHealth(),
      10_000,
    );
    return () => window.clearInterval(iv);
  }, [printer?.id]);

  const pick = async (p: FoundPrinter) => {
    if (await engine.choose(p)) {
      setFinding(false);
      onToast(`Printer set: ${p.name}`);
    }
  };

  const test = async () => {
    onToast("Test print sent");
    const ok = await engine.printTest();
    onToast(
      ok ? "Test print done" : "Test print failed — see the message below",
    );
  };

  return (
    <Section
      emoji="🖨️"
      title="Printer"
      note={
        isAndroidApp()
          ? "Wi-Fi photo printers print silently — no dialog. Thermal printers work over USB, Bluetooth or the network."
          : "In the browser, printing opens the print dialog. Install the Android app for silent Wi-Fi, USB and Bluetooth printing."
      }
    >
      <Row
        label="Print each guest's photo"
        hint={
          printer
            ? "Sent when the guest taps “Print it”."
            : "Choose a printer below first. Off: the booth is digital-only (QR)."
        }
      >
        <Toggle
          label="Print each guest's photo"
          checked={s.printEnabled}
          onChange={(v) => set("printEnabled", v)}
        />
      </Row>

      {printer && !finding && (
        <PrinterCard
          name={printer.name}
          connection={printer.connection}
          detail={printer.detail}
          health={engine.health}
          onTest={() => void test()}
          onChange={() => setFinding(true)}
          busy={
            engine.status === "preparing" ||
            engine.status === "sending" ||
            engine.status === "printing"
          }
        />
      )}

      {(finding || !printer) && (
        <Finder
          onPick={(p) => void pick(p)}
          onCancel={printer ? () => setFinding(false) : undefined}
        />
      )}

      {engine.message && engine.status !== "idle" && (
        <p
          className={cn(
            "rounded-xl px-3 py-2 text-xs leading-snug",
            engine.status === "error"
              ? "bg-amber-50 text-amber-800"
              : "bg-white/60 text-cocoa/70",
          )}
        >
          {engine.status === "error" ? "⚠️ " : "🖨️ "}
          {engine.message}
          {engine.status === "sending" &&
          engine.progress > 0 &&
          engine.progress < 1
            ? ` ${Math.round(engine.progress * 100)}%`
            : ""}
        </p>
      )}

      {printer && !finding && (
        <>
          <PaperSettings />
          {printer.language !== "image" && <ThermalSettings />}
          <PrintPreview />
          <div className="flex justify-end">
            <SmallButton
              tone="danger"
              onClick={() => void engine.forget().then(() => setFinding(true))}
            >
              Remove printer
            </SmallButton>
          </div>
        </>
      )}
    </Section>
  );
}

// ── Current printer ──────────────────────────────────────────────────────────

function healthLine(h: PrinterHealth | null): { text: string; ok: boolean } {
  if (!h) return { text: "Status unknown", ok: true };
  if (h.state === "offline")
    return { text: h.message || "Can't reach the printer", ok: false };
  const problems = blockingReasons(h.reasons);
  if (problems.length)
    return { text: problems.map(describeReason).join(", "), ok: false };
  if (h.state === "stopped")
    return { text: h.message || "Printer stopped", ok: false };
  const warnings = h.reasons.filter((r) => r.endsWith("-warning"));
  const base = h.state === "processing" ? "Printing" : "Ready";
  return {
    text: warnings.length
      ? `${base} · ${warnings.map(describeReason).join(", ")}`
      : base,
    ok: true,
  };
}

function PrinterCard({
  name,
  connection,
  detail,
  health,
  onTest,
  onChange,
  busy,
}: {
  name: string;
  connection: Connection;
  detail?: string;
  health: PrinterHealth | null;
  onTest: () => void;
  onChange: () => void;
  busy: boolean;
}) {
  const conn = CONNECTION_LABEL[connection];
  const line = healthLine(connection === "system" ? null : health);
  const markers = (health?.markers ?? []).filter((m) => m.level >= 0);

  return (
    <div className="rounded-xl border border-cocoa/10 bg-white/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-cocoa">{name}</div>
          <div className="text-xs text-cocoa/50">
            {conn.icon} {detail ?? conn.label}
          </div>
          {connection !== "system" && (
            <div
              className={cn(
                "mt-1 text-xs font-semibold",
                line.ok ? "text-emerald-600" : "text-amber-600",
              )}
            >
              ● {line.text}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <SmallButton tone="brand" onClick={onTest} disabled={busy}>
            Test print
          </SmallButton>
          <SmallButton onClick={onChange}>Change</SmallButton>
        </div>
      </div>

      {markers.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {markers.map((m) => (
            <div
              key={m.name}
              className="flex items-center gap-2 text-[11px] text-cocoa/60"
            >
              <span className="w-24 truncate">{m.name}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-cocoa/10">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, m.level)}%`,
                    background: m.color.split("#").filter(Boolean)[0]
                      ? `#${m.color.split("#").filter(Boolean)[0]}`
                      : "#5a4552",
                  }}
                />
              </div>
              <span className="w-8 text-right tabular-nums">{m.level}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Finding a printer ────────────────────────────────────────────────────────

function Finder({
  onPick,
  onCancel,
}: {
  onPick: (p: FoundPrinter) => void;
  onCancel?: () => void;
}) {
  const engine = usePrinter();
  const [ip, setIp] = useState("");
  const [adding, setAdding] = useState(false);

  // Search as soon as the finder opens — the host came here to find one.
  useEffect(() => {
    if (!engine.found.length && !engine.searching) void engine.search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async () => {
    if (!ip.trim()) return;
    setAdding(true);
    const p = await engine.addByAddress(ip.trim());
    setAdding(false);
    if (p) onPick(p);
  };

  const groups = useMemo(() => {
    const order: Connection[] = [
      "ipp",
      "usb",
      "bluetooth",
      "ble",
      "socket",
      "system",
    ];
    return order
      .map((c) => ({ c, list: engine.found.filter((p) => p.connection === c) }))
      .filter((g) => g.list.length);
  }, [engine.found]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-cocoa/20 bg-white/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-bold text-cocoa">
          {engine.searching ? "Searching for printers…" : "Choose a printer"}
        </div>
        <div className="flex gap-2">
          {onCancel && <SmallButton onClick={onCancel}>Cancel</SmallButton>}
          {isAndroidApp() && (
            <SmallButton
              onClick={() => void engine.search()}
              disabled={engine.searching}
            >
              {engine.searching ? "…" : "Search again"}
            </SmallButton>
          )}
        </div>
      </div>

      {groups.map(({ c, list }) => (
        <div key={c} className="flex flex-col gap-1.5">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cocoa/40">
            {CONNECTION_LABEL[c].icon} {CONNECTION_LABEL[c].label}
          </div>
          {list.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p)}
              className="flex flex-col items-start rounded-xl border border-cocoa/10 bg-white/80 px-3 py-2 text-left active:scale-[0.99]"
            >
              <span className="text-sm font-semibold text-cocoa">{p.name}</span>
              {p.detail && (
                <span className="text-[11px] text-cocoa/50">{p.detail}</span>
              )}
            </button>
          ))}
        </div>
      ))}

      {isAndroidApp() && (
        <>
          <Row
            label="Add by IP address"
            hint="When it doesn't show up — the IP is on the printer's network status sheet."
            stacked
          >
            <div className="flex gap-2">
              <div className="flex-1">
                <TextField
                  value={ip}
                  onChange={setIp}
                  placeholder="192.168.1.50"
                  mono
                  maxLength={64}
                />
              </div>
              <SmallButton
                tone="brand"
                onClick={() => void add()}
                disabled={adding || !ip.trim()}
              >
                {adding ? "…" : "Add"}
              </SmallButton>
            </div>
          </Row>
          <ul className="list-disc pl-4 text-[11px] leading-snug text-cocoa/50">
            <li>Wi-Fi printers must be on the same network as this tablet.</li>
            <li>
              No venue Wi-Fi? Turn on the printer's Wi-Fi Direct, connect the
              tablet to its “DIRECT-…” network, then add{" "}
              <span className="font-mono">192.168.223.1</span> (Epson) above.
              Photos queue for upload until the tablet is back online.
            </li>
            <li>
              Bluetooth printers: pair them in Android Settings → Bluetooth
              first (PIN is usually 0000 or 1234).
            </li>
            {!engine.searchedBluetooth && (
              <li className="text-amber-700">
                Bluetooth wasn't searched — allow “Nearby devices” for Mad Shots
                in Android settings.
              </li>
            )}
          </ul>
        </>
      )}

      {!isAndroidApp() && (
        <SmallButton tone="brand" onClick={() => onPick(SYSTEM_PRINTER)}>
          Use the browser print dialog
        </SmallButton>
      )}
    </div>
  );
}

// ── Paper and layout ─────────────────────────────────────────────────────────

function PaperSettings() {
  const s = useSettings();
  const set = s.set;
  const printer = s.printer!;
  const caps = printer.caps;
  const papers = papersFor(printer);
  const photo = printer.language === "image";
  const borderlessOn = photo && s.printBorderless && !!caps?.borderless;

  return (
    <div className="flex flex-col gap-3 border-t border-cocoa/10 pt-3">
      <Row label="Paper" stacked>
        <select
          className={selectClass}
          value={s.printPaperId}
          onChange={(e) => set("printPaperId", e.target.value)}
        >
          {papers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
              {caps?.mediaReady.includes(p.id) ? " — loaded" : ""}
            </option>
          ))}
        </select>
      </Row>

      {photo && caps && caps.mediaTypes.length > 1 && (
        <Row
          label="Paper type"
          hint="Glossy photo paper prints best on a photo setting."
          stacked
        >
          <select
            className={selectClass}
            value={s.printMediaType}
            onChange={(e) => set("printMediaType", e.target.value)}
          >
            <option value="">Printer default</option>
            {caps.mediaTypes.map((t) => (
              <option key={t} value={t}>
                {prettyKeyword(t)}
              </option>
            ))}
          </select>
        </Row>
      )}

      {photo && caps && caps.mediaSources.length > 1 && (
        <Row label="Paper tray" stacked>
          <select
            className={selectClass}
            value={s.printMediaSource}
            onChange={(e) => set("printMediaSource", e.target.value)}
          >
            <option value="">Printer default</option>
            {caps.mediaSources.map((t) => (
              <option key={t} value={t}>
                {prettyKeyword(t)}
              </option>
            ))}
          </select>
        </Row>
      )}

      {photo && caps?.borderless && (
        <Row
          label="Borderless"
          hint="No white border from the printer — edge to edge, like a lab print. Use with Fill for a full-bleed photo."
        >
          <Toggle
            label="Borderless"
            checked={s.printBorderless}
            onChange={(v) => set("printBorderless", v)}
          />
        </Row>
      )}

      {photo && printer.connection === "ipp" && (
        <Row label="Quality" stacked>
          <Segmented<PrintQuality>
            value={s.printQuality}
            onChange={(v) => set("printQuality", v)}
            options={[
              { value: "draft", label: "Fast" },
              { value: "normal", label: "Normal" },
              { value: "high", label: "Best" },
            ]}
          />
        </Row>
      )}

      {photo && caps?.color && (
        <Row label="Colour">
          <Toggle
            label="Colour"
            checked={s.printColor}
            onChange={(v) => set("printColor", v)}
          />
        </Row>
      )}

      <Row
        label="Fit"
        hint="Fit keeps the whole design on white; Fill covers the paper and trims the edges."
        stacked
      >
        <Segmented<PrintFit>
          value={s.printFit}
          onChange={(v) => set("printFit", v)}
          options={[
            { value: "fit", label: "Fit" },
            { value: "fill", label: "Fill" },
          ]}
        />
      </Row>

      <Row
        label="Turn"
        hint="Auto turns a design sideways when that uses more of the paper."
        stacked
      >
        <Segmented<PrintRotate>
          value={s.printRotate}
          onChange={(v) => set("printRotate", v)}
          options={[
            { value: "auto", label: "Auto" },
            { value: 0, label: "Upright" },
            { value: 90, label: "Sideways" },
          ]}
        />
      </Row>

      <Row
        label="Two per sheet"
        hint="Prints the design twice side by side — e.g. two 2×6 strips on one 4×6, cut down the middle."
      >
        <Toggle
          label="Two per sheet"
          checked={s.printTwoUp}
          onChange={(v) => set("printTwoUp", v)}
        />
      </Row>

      <Row label="Copies" hint="Prints per guest.">
        <NumberField
          label="Copies"
          value={s.printCopies}
          onChange={(v) => set("printCopies", v)}
          min={1}
          max={5}
        />
      </Row>
      {!borderlessOn && (
        <Row label="Margin" hint="White border kept clear of the paper edge.">
          <NumberField
            label="Margin"
            value={s.printMarginMm}
            onChange={(v) => set("printMarginMm", v)}
            min={0}
            max={15}
            step={0.5}
            suffix="mm"
          />
        </Row>
      )}
    </div>
  );
}

// ── Thermal ──────────────────────────────────────────────────────────────────

function ThermalSettings() {
  const s = useSettings();
  const set = s.set;
  const engine = usePrinter();
  const lang = s.printer!.language;
  const label = lang === "tspl" || lang === "zpl";

  return (
    <div className="flex flex-col gap-3 border-t border-cocoa/10 pt-3">
      <Row
        label="Printer language"
        hint={
          LANGUAGES.find((l) => l.value === lang)?.hint ??
          "If nothing prints, try the other languages."
        }
        stacked
      >
        <Segmented<PrinterLanguage>
          value={lang}
          onChange={(v) => engine.setLanguage(v)}
          options={LANGUAGES.map((l) => ({ value: l.value, label: l.label }))}
        />
      </Row>

      <Row
        label="Halftone"
        hint="Thermal paper is black or white — this is how photos become dots."
        stacked
      >
        <Segmented<DitherMode>
          value={s.ditherMode}
          onChange={(v) => set("ditherMode", v)}
          options={DITHER_MODES.map((m) => ({ value: m.id, label: m.label }))}
        />
      </Row>

      <Row label="Contrast" hint="Raise if faces print flat and grey." stacked>
        <Slider
          label="Contrast"
          value={s.printContrast}
          onChange={(v) => set("printContrast", v)}
          min={-50}
          max={80}
        />
      </Row>
      {label && (
        <Row label="Darkness" hint="How hard the head burns." stacked>
          <Slider
            label="Darkness"
            value={s.printDensity}
            onChange={(v) => set("printDensity", v)}
            min={0}
            max={15}
          />
        </Row>
      )}

      {label && (
        <>
          <Row label="Label gap" hint="0 for continuous rolls.">
            <NumberField
              label="Label gap"
              value={s.labelGapMm}
              onChange={(v) => set("labelGapMm", v)}
              min={0}
              max={10}
              step={0.5}
              suffix="mm"
            />
          </Row>
          <Row label="Speed" hint="Slower prints darker.">
            <NumberField
              label="Speed"
              value={s.printSpeed}
              onChange={(v) => set("printSpeed", v)}
              min={1}
              max={6}
            />
          </Row>
        </>
      )}
      {lang === "escpos" && (
        <Row
          label="Cut after each print"
          hint="For printers with an auto-cutter."
        >
          <Toggle
            label="Cut after each print"
            checked={s.printCut}
            onChange={(v) => set("printCut", v)}
          />
        </Row>
      )}
      {lang === "tspl" && (
        <Row
          label="Negative image"
          hint="Flip only if the test print comes out inverted."
        >
          <Toggle
            label="Negative image"
            checked={!s.printInvertRaster}
            onChange={(v) => set("printInvertRaster", !v)}
          />
        </Row>
      )}
    </div>
  );
}

// ── Preview ──────────────────────────────────────────────────────────────────

/** The page exactly as it will print, re-rendered whenever a setting changes. */
function PrintPreview() {
  const s = useSettings();
  const composite = useSession((st) => st.composite);
  const [src, setSrc] = useState<string>("");
  const deps = [
    s.printer?.id,
    s.printer?.language,
    s.printPaperId,
    s.printFit,
    s.printRotate,
    s.printTwoUp,
    s.printMarginMm,
    s.printBorderless,
    s.ditherMode,
    s.printContrast,
    s.designMode,
    s.eventTemplateId,
  ];

  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(async () => {
      try {
        const base = composite || (await buildPreviewComposite());
        const out = await renderPreview(base);
        if (alive) setSrc(out);
      } catch {
        if (alive) setSrc("");
      }
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composite, ...deps]);

  return (
    <div className="flex flex-col items-center gap-2 border-t border-cocoa/10 pt-3">
      <div className="self-start text-sm font-semibold text-cocoa">
        What will print
      </div>
      <div className="flex min-h-[120px] w-full items-center justify-center rounded-xl bg-cocoa/5 p-3">
        {src ? (
          <img
            src={src}
            alt="Print preview"
            className="max-h-[300px] max-w-full bg-white shadow-md"
          />
        ) : (
          <span className="text-xs text-cocoa/40">Rendering…</span>
        )}
      </div>
    </div>
  );
}
