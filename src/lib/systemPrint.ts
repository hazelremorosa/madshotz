import type { LabelStock } from "@/lib/tspl";

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
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!dataUrl) {
      reject(new Error("Nothing to print"));
      return;
    }

    const frame = document.createElement("iframe");
    // Off-screen rather than display:none — a hidden iframe doesn't always lay
    // out, and an image with no layout can print blank.
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText =
      "position:fixed;left:-10000px;top:0;width:400px;height:600px;border:0;";
    document.body.appendChild(frame);

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
  /* Contain rather than stretch: the composite's aspect is deliberate. */
  img {
    display: block;
    width: ${stock.widthMm}mm;
    height: ${stock.heightMm}mm;
    object-fit: contain;
    image-rendering: auto;
  }
</style>
</head>
<body><img src="${dataUrl}" alt=""></body>
</html>`);
    doc.close();

    const img = doc.images[0];
    const fire = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        cleanup();
        resolve();
      } catch (e) {
        frame.remove();
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };

    // Printing before the image has decoded produces a blank label.
    if (img && !img.complete) {
      img.onload = fire;
      img.onerror = () => {
        frame.remove();
        reject(new Error("The composite failed to load for printing"));
      };
      // Don't hang for ever if neither event arrives.
      window.setTimeout(() => {
        if (frame.parentNode) fire();
      }, 4000);
    } else {
      fire();
    }
  });
}

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
