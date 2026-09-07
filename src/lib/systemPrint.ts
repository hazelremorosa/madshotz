import type { LabelStock } from "@/lib/tspl";

export function injectPrintStyles(widthMm: number, heightMm: number): void {
  let style = document.getElementById("dynamic-booth-print-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "dynamic-booth-print-style";
    document.head.appendChild(style);
  }
  style.textContent = `
    @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
    @media print {
      body * { visibility: hidden !important; }
      #printable-receipt, #printable-receipt * { visibility: visible !important; }
      #printable-receipt { position: fixed !important; left: 0 !important; top: 0 !important; width: ${widthMm}mm !important; height: ${heightMm}mm !important; margin: 0 !important; padding: 0 !important; display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; box-shadow: none !important; }
    }
  `;
}

/**
 * Printing through the operating system's own print path.
 *
 * The other transports speak the printer's language directly. This one doesn't
 * speak any: it hands an **image** to whatever driver or print service the OS has,
 * and lets that do the halftoning, media handling and language. That's the point —
 * it's the only route that works without knowing anything about TSPL.
 *
 * Two things make it worth having:
 *
 * - **RawBT registers as an Android print service**, so this reaches the printer
 *   over Bluetooth Classic via the system print sheet.
 * - **On a Windows kiosk** with Munbyn's driver installed, Chrome's
 *   `--kiosk-printing` flag makes the same call completely silent.
 *
 * The trade-off is that it's the only transport we can't make silent on Android:
 * the system print sheet always appears. It also can't report success — once the
 * sheet is up, the page has no idea what happened.
 */

/**
 * Prints a composite image via the OS.
 *
 * Rendered in an isolated iframe rather than the live page. Printing the document
 * itself would drag in the whole booth UI — the KioskFrame transform, glass
 * blurs, fixed overlays — and a print stylesheet that has to suppress all of it
 * is far more fragile than a blank document containing one image.
 */
export function systemPrintImage(
  dataUrl: string,
  stock: LabelStock,
  marginMm = 0,
  copies = 1,
): Promise<void> {
  if (activePrint) return activePrint;

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

/**
 * A small test image for the OS print path.
 *
 * The other transports test themselves with a few hundred bytes of TSPL, which
 * this route can't use — it only ever sends pictures. So it gets a picture:
 * generated at the label's aspect with a border, so a wrong media size or a
 * scaled-to-A4 mistake is obvious at a glance.
 */
export function systemTestImage(stock: LabelStock): string {
  const W = 800;
  const H = Math.max(80, Math.round((W * stock.heightMm) / stock.widthMm));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, W - 24, H - 24);

  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.font = "bold 64px system-ui, sans-serif";
  ctx.fillText("MAD SHOTS", W / 2, 120);
  ctx.font = "32px system-ui, sans-serif";
  ctx.fillText(`${stock.widthMm} x ${stock.heightMm} mm`, W / 2, 180);
  ctx.fillText("system print test", W / 2, 230);

  // Corner ticks: if the driver scales or crops, these stop touching the border.
  ctx.lineWidth = 4;
  for (const [x, y] of [
    [12, 12],
    [W - 12, 12],
    [12, H - 12],
    [W - 12, H - 12],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (x < W / 2 ? 60 : -60), y);
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + (y < H / 2 ? 60 : -60));
    ctx.stroke();
  }
  return canvas.toDataURL("image/png");
}
