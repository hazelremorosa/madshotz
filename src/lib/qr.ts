import QRCode from "qrcode";

/** A boolean matrix of QR modules (true = dark). */
export function qrMatrixSync(text: string): boolean[][] {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const data = qr.modules.data;
  const grid: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) row.push(Boolean(data[r * size + c]));
    grid.push(row);
  }
  return grid;
}

/** Async wrapper (used by the animated QR screen). */
export async function qrMatrix(text: string): Promise<boolean[][]> {
  return qrMatrixSync(text);
}
