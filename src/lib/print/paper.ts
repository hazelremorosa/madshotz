import type { IppCaps, PrinterLanguage, SavedPrinter } from "./types";

/** A sheet or roll the printer is loaded with. */
export interface Paper {
  /** For IPP printers, the PWG media keyword itself. */
  id: string;
  label: string;
  widthMm: number;
  /** 0 for a continuous receipt roll — the print is as long as the photo. */
  heightMm: number;
  /** Printable width of a roll, which is narrower than the paper. */
  printableMm?: number;
  /** PWG keyword to request from an IPP printer. */
  ippKeyword?: string;
}

/** Thermal stock: receipt rolls (ESC/POS) and die-cut labels (TSPL/ZPL). */
export const THERMAL_PAPERS: Paper[] = [
  {
    id: "receipt-58",
    label: "58 mm receipt roll",
    widthMm: 58,
    heightMm: 0,
    printableMm: 48,
  },
  {
    id: "receipt-80",
    label: "80 mm receipt roll",
    widthMm: 80,
    heightMm: 0,
    printableMm: 72,
  },
  { id: "label-4x6", label: '4 × 6" label', widthMm: 101.6, heightMm: 152.4 },
  {
    id: "label-2x6",
    label: '2 × 6" strip label',
    widthMm: 50.8,
    heightMm: 152.4,
  },
  {
    id: "label-80x150",
    label: "80 × 150 mm label",
    widthMm: 80,
    heightMm: 150,
  },
  { id: "label-3x2", label: '3 × 2" label', widthMm: 76.2, heightMm: 50.8 },
];

/** Friendly names for the PWG keywords a photo booth actually meets. */
const KNOWN_MEDIA: Record<string, string> = {
  "na_index-4x6_4x6in": '4 × 6" (4R photo)',
  "custom_2x6_2x6in": '2 × 6" (photo strip)',
  na_5x7_5x7in: '5 × 7" (5R photo)',
  "oe_photo-l_3.5x5in": '3.5 × 5" (L photo)',
  "na_govt-letter_8x10in": '8 × 10" (8R)',
  "oe_photo-s8r_8x12in": '8 × 12" (S8R)',
  "na_letter_8.5x11in": "Letter",
  iso_a6_105x148mm: "A6",
  iso_a5_148x210mm: "A5",
  iso_a4_210x297mm: "A4",
  iso_a3_297x420mm: "A3",
  jpn_hagaki_100x148mm: "Hagaki postcard (100 × 148 mm)",
  iso_b5_176x250mm: "B5",
  jis_b5_182x257mm: "B5 (JIS)",
};

/**
 * For printers reached through the print dialog — no capabilities to read, so
 * a sensible list of sizes the host can match to what's in the tray.
 */
export const SHEET_PAPERS: Paper[] = [
  "na_index-4x6_4x6in",
  "custom_2x6_2x6in",
  "na_5x7_5x7in",
  "oe_photo-l_3.5x5in",
  "iso_a6_105x148mm",
  "iso_a5_148x210mm",
  "iso_a4_210x297mm",
  "na_letter_8.5x11in",
  "iso_a3_297x420mm",
].map((k) => {
  const size = sizeFromKeyword(k)!;
  return { id: k, label: KNOWN_MEDIA[k] ?? k, ippKeyword: k, ...size };
});

/** `na_index-4x6_4x6in` → 101.6 × 152.4 mm. */
function sizeFromKeyword(
  k: string,
): { widthMm: number; heightMm: number } | null {
  const m = /_(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(mm|in)$/.exec(k);
  if (!m) return null;
  const f = m[3] === "in" ? 25.4 : 1;
  return {
    widthMm: Math.round(Number(m[1]) * f * 10) / 10,
    heightMm: Math.round(Number(m[2]) * f * 10) / 10,
  };
}

function mediaLabel(keyword: string, w: number, h: number): string {
  // A 2×6" sheet goes by many keywords; name it by size.
  if (Math.abs(w - 50.8) < 1 && Math.abs(h - 152.4) < 1)
    return KNOWN_MEDIA["custom_2x6_2x6in"];
  return KNOWN_MEDIA[keyword] ?? `${Math.round(w)} × ${Math.round(h)} mm`;
}

/** The printer's own paper list, smallest first, one entry per size. */
export function ippPapers(caps: IppCaps): Paper[] {
  const seen = new Set<string>();
  return caps.media
    .filter((m) => m.widthMm > 0 && m.heightMm > 0)
    .sort((a, b) => a.widthMm * a.heightMm - b.widthMm * b.heightMm)
    .filter((m) => {
      // `_borderless`/`.fb` variants are the same sheet for our purposes.
      const key = `${m.widthMm}x${m.heightMm}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((m) => ({
      id: m.keyword,
      label: mediaLabel(m.keyword, m.widthMm, m.heightMm),
      widthMm: m.widthMm,
      heightMm: m.heightMm,
      ippKeyword: m.keyword,
    }));
}

/** Paper choices for a printer. */
export function papersFor(printer: SavedPrinter | null): Paper[] {
  if (!printer) return SHEET_PAPERS;
  if (printer.language !== "image") return THERMAL_PAPERS;
  if (printer.caps?.media.length) {
    const list = ippPapers(printer.caps);
    if (list.length) return list;
  }
  return SHEET_PAPERS;
}

/** What to preselect when a printer is first chosen. */
export function defaultPaperId(printer: SavedPrinter): string {
  if (printer.language === "escpos") return "receipt-80";
  if (printer.language === "tspl" || printer.language === "zpl")
    return "label-4x6";
  const papers = papersFor(printer);
  // 4R is the photo booth standard; then whatever is in the tray; then the
  // printer's own default.
  const want = [
    "na_index-4x6_4x6in",
    ...(printer.caps?.mediaReady ?? []),
    printer.caps?.mediaDefault ?? "",
  ];
  for (const k of want) {
    const hit = papers.find(
      (p) => p.id === k || (p.ippKeyword && p.ippKeyword === k),
    );
    if (hit) return hit.id;
  }
  return papers[0]?.id ?? "na_index-4x6_4x6in";
}

/** 3 Strip and 4 Strip print on 2×6" stock; everything else on the chosen sheet. */
export function isStripLayout(layoutId: string): boolean {
  return layoutId === "strip" || layoutId === "quad";
}

/** The 2×6" entry in a printer's paper list, if it has one. */
export function stripPaper(printer: SavedPrinter | null): Paper | undefined {
  return papersFor(printer).find(
    (p) =>
      p.id === "label-2x6" ||
      (Math.abs(p.widthMm - 50.8) < 1 && Math.abs(p.heightMm - 152.4) < 1),
  );
}

export function resolvePaper(printer: SavedPrinter | null, id: string): Paper {
  const papers = papersFor(printer);
  return papers.find((p) => p.id === id) ?? papers[0];
}

/** "photographic-glossy" → "Photographic glossy". */
export function prettyKeyword(k: string): string {
  const s = k.replace(/[-_]/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const LANGUAGES: {
  value: PrinterLanguage;
  label: string;
  hint: string;
}[] = [
  {
    value: "escpos",
    label: "ESC/POS",
    hint: "Receipt printers (58/80 mm rolls).",
  },
  {
    value: "tspl",
    label: "TSPL",
    hint: "Label printers — Munbyn, TSC, Xprinter labels.",
  },
  {
    value: "zpl",
    label: "ZPL",
    hint: "Zebra and Zebra-compatible label printers.",
  },
];
