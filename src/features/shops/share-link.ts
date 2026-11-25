export type ShareResult = "shared" | "copied" | "cancelled" | "failed";
export type Clipboard = { writeText(text: string): Promise<void> };
export type ShareDeps = {
  clipboard?: Clipboard;
  nativeShare?: (options: { message: string }) => Promise<unknown>;
  webShare?: (data: { title: string; url: string }) => Promise<void>;
};

const QUIET_ZONE = 4;

export async function copyLink(url: string, clipboard?: Clipboard): Promise<boolean> {
  if (!clipboard) return false;

  try {
    await clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

// Native: the system share sheet. Web: navigator.share when the browser has it (phones), otherwise copy the link.
export async function shareLink(url: string, title: string, deps: ShareDeps): Promise<ShareResult> {
  try {
    if (deps.nativeShare) {
      await deps.nativeShare({ message: url });
      return "shared";
    }
    if (deps.webShare) {
      await deps.webShare({ title, url });
      return "shared";
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return "cancelled";
  }

  return (await copyLink(url, deps.clipboard)) ? "copied" : "failed";
}

export function drawQr(ctx: Pick<CanvasRenderingContext2D, "fillRect" | "fillStyle">, matrix: boolean[][], scale: number) {
  const side = (matrix.length + QUIET_ZONE * 2) * scale;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, side, side);
  ctx.fillStyle = "#000000";
  matrix.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark) ctx.fillRect((c + QUIET_ZONE) * scale, (r + QUIET_ZONE) * scale, scale, scale);
    }),
  );
}

type DownloadDeps = { createCanvas?: () => HTMLCanvasElement; download?: (href: string, filename: string) => void };

const defaultCanvas = () => document.createElement("canvas");
const defaultDownload = (href: string, filename: string) => {
  const link = document.createElement("a");

  link.href = href;
  link.download = filename;
  link.click();
};

// Web only: draws the matrix on a canvas (10 px per module) and downloads it as a PNG.
export async function downloadQrPng(matrix: boolean[][], filename: string, deps: DownloadDeps = {}): Promise<void> {
  const canvas = (deps.createCanvas ?? defaultCanvas)();
  const scale = 10;
  const side = (matrix.length + QUIET_ZONE * 2) * scale;
  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("Canvas is not available");
  canvas.width = side;
  canvas.height = side;
  drawQr(ctx, matrix, scale);
  (deps.download ?? defaultDownload)(canvas.toDataURL("image/png"), filename);
}
