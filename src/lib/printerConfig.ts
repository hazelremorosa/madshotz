export const PRINTER_CONFIG_KEY = "booth_printer_config";

export type PrinterPaperPreset = "80x150" | "4x6" | "2x6" | "a4" | "a3" | "custom";
export type PrinterOrientation = "portrait" | "landscape";

export interface PrinterConfig {
  targetPrinterName: string;
  autoPrint: boolean;
  paperPreset: PrinterPaperPreset;
  customWidthMm: number;
  customHeightMm: number;
  orientation: PrinterOrientation;
  copies: number;
}

export const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
  targetPrinterName: "",
  autoPrint: true,
  paperPreset: "80x150",
  customWidthMm: 80,
  customHeightMm: 150,
  orientation: "portrait",
  copies: 1,
};

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export function loadPrinterConfig(): PrinterConfig {
  if (typeof localStorage === "undefined") return { ...DEFAULT_PRINTER_CONFIG };
  try {
    const saved = JSON.parse(localStorage.getItem(PRINTER_CONFIG_KEY) ?? "null") as Partial<PrinterConfig> | null;
    return {
      ...DEFAULT_PRINTER_CONFIG,
      ...saved,
      targetPrinterName: typeof saved?.targetPrinterName === "string" ? saved.targetPrinterName : "",
      autoPrint: typeof saved?.autoPrint === "boolean" ? saved.autoPrint : DEFAULT_PRINTER_CONFIG.autoPrint,
      paperPreset: ["80x150", "4x6", "2x6", "a4", "a3", "custom"].includes(saved?.paperPreset ?? "")
        ? (saved?.paperPreset as PrinterPaperPreset)
        : DEFAULT_PRINTER_CONFIG.paperPreset,
      customWidthMm: clampNumber(saved?.customWidthMm, 10, 500, DEFAULT_PRINTER_CONFIG.customWidthMm),
      customHeightMm: clampNumber(saved?.customHeightMm, 10, 500, DEFAULT_PRINTER_CONFIG.customHeightMm),
      orientation: saved?.orientation === "landscape" ? "landscape" : "portrait",
      copies: clampNumber(saved?.copies, 1, 5, DEFAULT_PRINTER_CONFIG.copies),
    };
  } catch {
    return { ...DEFAULT_PRINTER_CONFIG };
  }
}

export function savePrinterConfig(config: PrinterConfig): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(PRINTER_CONFIG_KEY, JSON.stringify(config));
}

export function printerDimensions(config: PrinterConfig): { widthMm: number; heightMm: number } {
  const dimensions = {
    "80x150": { widthMm: 80, heightMm: 150 },
    "4x6": { widthMm: 101.6, heightMm: 152.4 },
    "2x6": { widthMm: 50.8, heightMm: 152.4 },
    a4: { widthMm: 210, heightMm: 297 },
    a3: { widthMm: 297, heightMm: 420 },
    custom: { widthMm: config.customWidthMm, heightMm: config.customHeightMm },
  }[config.paperPreset];
  return config.orientation === "portrait"
    ? dimensions
    : { widthMm: dimensions.heightMm, heightMm: dimensions.widthMm };
}

