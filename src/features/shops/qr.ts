import QRCode from "qrcode";

// `create` builds the module matrix without a canvas or a DOM, so it works the same in Jest, Metro (native) and the web bundle.
export function qrMatrix(text: string): boolean[][] {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });

  return Array.from({ length: modules.size }, (_, row) => Array.from({ length: modules.size }, (_, col) => Boolean(modules.get(row, col))));
}
