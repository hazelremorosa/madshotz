import type { LabelStock } from "@/lib/tspl";
import { isAndroidApp } from "@/lib/native";
import { printImage } from "@/lib/native/output";

/**
 * Printing through the operating system's own print dialog.
 *
 * The other routes (see `lib/print`) talk to the printer directly. This one
 * hands an **image** to whatever driver or print service the OS has and lets it
 * do the rest — the catch-all for a printer nothing else can reach, and the only
 * printing a browser tab (the PWA) can do at all.
 *
 * It's never silent: Android and Chrome both always show the dialog.
 *
 * Rendered in an isolated iframe rather than the live page. Printing the document
 * itself would drag in the whole booth UI — the KioskFrame transform, glass
 * blurs, fixed overlays — and a print stylesheet that has to suppress all of it
 * is far more fragile than a blank document containing one image.
 *
 * The Android app's WebView ignores `window.print()` outright, so there the
 * image goes to Android's PrintManager instead, with the page size preset.
 */
export function systemPrintImage(
  dataUrl: string,
  stock: LabelStock,
  marginMm = 0,
  copies = 1,
): Promise<void> {
  if (activePrint) return activePrint;

  if (isAndroidApp()) {
    activePrint = printImage(dataUrl, {
      widthMm: stock.widthMm,
      heightMm: stock.heightMm,
      marginMm,
      copies: Math.max(1, Math.min(5, Math.round(copies))),
    }).finally(() => {
      activePrint = null;
    });
    return activePrint;
  }

  const printPromise = new Promise<void>((resolve, reject) => {
    if (!dataUrl) {
      reject(new Error("Nothing to print"));
      return;
    }

    document
      .querySelectorAll<HTMLIFrameElement>(
        'iframe[data-mad-shots-print="true"]',
      )
      .forEach((existing) => existing.remove());

    const frame = document.createElement("iframe");
    // Off-screen rather than display:none — a hidden iframe doesn't always lay
    // out, and an image with no layout can print blank.
    frame.setAttribute("aria-hidden", "true");
    frame.dataset.madShotsPrint = "true";
    frame.style.cssText =
      "position:fixed;left:-10000px;top:0;width:400px;height:600px;border:0;";
    document.body.appendChild(frame);

    let printed = false;
    const fire = async () => {
      if (printed) return;
      try {
        const printDocument = frame.contentDocument;
        const printWindow = frame.contentWindow;
        if (!printDocument || !printWindow) {
          throw new Error("The system print frame is unavailable");
        }

        await Promise.all(
          Array.from(printDocument.images).map(
            (image) =>
              new Promise<void>((resolve, reject) => {
                if (image.complete && image.naturalWidth > 0) {
                  resolve();
                  return;
                }
                image.addEventListener("load", () => resolve(), { once: true });
                image.addEventListener(
                  "error",
                  () => reject(new Error("The print image failed to load")),
                  { once: true },
                );
              }).then(async () => {
                if (image.decode) await image.decode();
              }),
          ),
        );

        printed = true;
        printWindow.focus();
        printWindow.print();
        cleanup();
        resolve();
      } catch (e) {
        frame.remove();
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };

    // Wait for the isolated document, including its image, to finish loading.
    frame.onload = fire;
    frame.onerror = () => {
      frame.remove();
      reject(new Error("The composite failed to load for printing"));
    };

    const cleanup = () => {
      // Deferred: removing the frame while the print dialog still references its
      // document cancels the job on some builds.
      window.setTimeout(() => frame.remove(), 60_000);
    };

    const doc = frame.contentDocument;
    if (!doc) {
      frame.remove();
      reject(new Error("Could not open a print document"));
      return;
    }

    const safeCopies = Math.max(1, Math.min(5, Math.round(copies)));

    // @page carries the real label size, so the driver picks the right media
    // instead of defaulting to A4 and scaling the label into a corner.
    doc.open();
    doc.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Mad Shots label</title>
<style>
  @page { size: ${stock.widthMm}mm ${stock.heightMm}mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  #printable-receipt { display: block; width: ${stock.widthMm}mm; height: ${stock.heightMm}mm; visibility: visible; }
  @media print {
    @page { size: ${stock.widthMm}mm ${stock.heightMm}mm; margin: 0; }
    html, body {
      width: ${stock.widthMm}mm;
      height: ${stock.heightMm}mm;
      visibility: visible !important;
    }
    #printable-receipt, #printable-receipt * { visibility: visible !important; }
    #printable-receipt { position: fixed !important; left: 0 !important; top: 0 !important; display: block !important; }
  }
  /* Contain rather than stretch: the composite's aspect is deliberate. */
  img {
    display: block;
    width: calc(${stock.widthMm}mm - ${marginMm * 2}mm);
    height: calc(${stock.heightMm}mm - ${marginMm * 2}mm);
    margin: ${marginMm}mm;
    visibility: visible !important;
    object-fit: contain;
    image-rendering: auto;
  }
</style>
</head>
<body><div id="printable-receipt">${Array.from({ length: safeCopies }, () => `<img src="${dataUrl}" alt="">`).join("")}</div></body>
</html>`);
    doc.close();
  }).catch((error) => {
    console.error("MAD SHOTS system print failed", error);
    throw error;
  }).finally(() => {
    activePrint = null;
  });

  activePrint = printPromise;
  return printPromise;
}

let activePrint: Promise<void> | null = null;

