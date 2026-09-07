import { useState } from "react";
import {
  NumberField,
  Row,
  Section,
  Segmented,
  SmallButton,
  TextField,
  Toggle,
} from "@/components/admin/controls";
import {
  loadPrinterConfig,
  printerDimensions,
  savePrinterConfig,
  type PrinterConfig,
  type PrinterOrientation,
  type PrinterPaperPreset,
} from "@/lib/printerConfig";
import { systemPrintImage, systemTestImage } from "@/lib/systemPrint";
import { useSettings } from "@/store/settings";

const PAPER_OPTIONS: { value: PrinterPaperPreset; label: string }[] = [
  { value: "80x150", label: "80mm x 150mm (Default Booth Card)" },
  { value: "4x6", label: "4R (4x6 in)" },
  { value: "2x6", label: "2x6 inch (Photo Strip)" },
  { value: "custom", label: "Custom" },
  { value: "a4", label: "A4 (210mm x 297mm)" },
  { value: "a3", label: "A3 (297mm x 420mm)" },
];

export function PrinterSetupSection({ onToast }: { onToast: (message: string) => void }) {
  const [config, setConfig] = useState<PrinterConfig>(() => loadPrinterConfig());

  const update = <K extends keyof PrinterConfig>(key: K, value: PrinterConfig[K]) => {
    const next = { ...config, [key]: value };
    setConfig(next);
    savePrinterConfig(next);
    if (key === "targetPrinterName") {
      useSettings.getState().set("printerDeviceName", value as string);
    }
  };

  const testPrint = async () => {
    const dimensions = printerDimensions(config);
    const settings = useSettings.getState();
    settings.set("printerDeviceName", config.targetPrinterName);
    try {
      const stock = { ...dimensions, gapMm: 0 };
      const sample = systemTestImage(stock);
      await systemPrintImage(sample, stock, 0, config.copies);
      onToast(`Built-in print dialog opened (${dimensions.widthMm} x ${dimensions.heightMm} mm)`);
    } catch (error) {
      onToast("Test print failed");
      console.error("MAD SHOTS admin test print failed", error);
    }
  };

  return (
    <Section
      emoji="🖨️"
      title="Printer Settings"
      note="Native printer settings are saved locally on this device."
    >
      <Row label="Target Printer Name" stacked>
        <TextField
          value={config.targetPrinterName}
          onChange={(value) => update("targetPrinterName", value)}
          placeholder="EPSON7EFDF8 (L15150 Series)"
          maxLength={80}
        />
      </Row>

      <Row label="Auto-Print On Completion">
        <div className="flex items-center gap-2">
          <Toggle
            checked={config.autoPrint}
            onChange={(value) => update("autoPrint", value)}
            label="Auto-Print On Completion"
          />
          <span className="w-16 text-xs font-semibold text-cocoa/60">
            {config.autoPrint ? "ON" : "OFF"}
          </span>
        </div>
      </Row>

      <Row label="Paper Size Preset" stacked>
        <select
          value={config.paperPreset}
          onChange={(event) => update("paperPreset", event.target.value as PrinterPaperPreset)}
          className="w-full rounded-xl border border-cocoa/15 bg-white/80 px-3 py-2 text-sm text-cocoa outline-none focus:border-brand/50"
        >
          {PAPER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </Row>

      {config.paperPreset === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Custom width" value={config.customWidthMm} onChange={(value) => update("customWidthMm", value)} min={10} max={500} suffix="mm" />
          <NumberField label="Custom height" value={config.customHeightMm} onChange={(value) => update("customHeightMm", value)} min={10} max={500} suffix="mm" />
        </div>
      )}

      <Row label="Page Orientation" stacked>
        <Segmented<PrinterOrientation>
          value={config.orientation}
          onChange={(value) => update("orientation", value)}
          options={[{ value: "portrait", label: "Portrait" }, { value: "landscape", label: "Landscape" }]}
        />
      </Row>

      <Row label="Default Print Copies">
        <NumberField label="Print copies" value={config.copies} onChange={(value) => update("copies", value)} min={1} max={5} />
      </Row>

      <div className="flex items-center justify-between gap-3 border-t border-cocoa/10 pt-3">
        <span className="text-xs text-cocoa/50">Opens the native browser print dialog.</span>
        <SmallButton tone="brand" onClick={() => void testPrint()}>Test Print (Built-in Dialog)</SmallButton>
      </div>
    </Section>
  );
}
