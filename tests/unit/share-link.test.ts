import { copyLink, downloadQrPng, drawQr, shareLink } from "../../src/features/shops/share-link";

const url = "https://shop-a.zencpro.app/";

describe("shareLink", () => {
  it("native: opens the share sheet with the link", async () => {
    const nativeShare = jest.fn().mockResolvedValue({ action: "sharedAction" });

    expect(await shareLink(url, "Shop", { nativeShare })).toBe("shared");
    expect(nativeShare).toHaveBeenCalledWith({ message: url });
  });

  it("web: uses navigator.share when it exists", async () => {
    const webShare = jest.fn().mockResolvedValue(undefined);

    expect(await shareLink(url, "Shop", { webShare })).toBe("shared");
    expect(webShare).toHaveBeenCalledWith({ title: "Shop", url });
  });

  it("web without navigator.share: copies the link", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);

    expect(await shareLink(url, "Shop", { clipboard: { writeText } })).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(url);
  });

  it("a dismissed share sheet is not an error", async () => {
    const webShare = jest.fn().mockRejectedValue(Object.assign(new Error("dismissed"), { name: "AbortError" }));

    expect(await shareLink(url, "Shop", { clipboard: { writeText: jest.fn() }, webShare })).toBe("cancelled");
  });

  it("a failing share falls back to copying", async () => {
    const webShare = jest.fn().mockRejectedValue(new Error("not allowed"));
    const writeText = jest.fn().mockResolvedValue(undefined);

    expect(await shareLink(url, "Shop", { clipboard: { writeText }, webShare })).toBe("copied");
  });

  it("reports failed when nothing works", async () => {
    expect(await shareLink(url, "Shop", {})).toBe("failed");
  });
});

describe("copyLink", () => {
  it("returns true when the clipboard accepted the link", async () => {
    expect(await copyLink(url, { writeText: jest.fn().mockResolvedValue(undefined) })).toBe(true);
  });

  it("returns false without a clipboard or when it rejects", async () => {
    expect(await copyLink(url, undefined)).toBe(false);
    expect(await copyLink(url, { writeText: jest.fn().mockRejectedValue(new Error("denied")) })).toBe(false);
  });
});

describe("drawQr", () => {
  it("paints the white background and one square per dark module, offset by the quiet zone", () => {
    const calls: Array<[number, number, number, number, string]> = [];
    const ctx = {
      fillRect: (x: number, y: number, w: number, h: number) => calls.push([x, y, w, h, String(ctx.fillStyle)]),
      fillStyle: "",
    };

    drawQr(ctx as never, [[true, false], [false, true]], 10);

    expect(calls[0]).toEqual([0, 0, 100, 100, "#FFFFFF"]);
    expect(calls.slice(1)).toEqual([[40, 40, 10, 10, "#000000"], [50, 50, 10, 10, "#000000"]]);
  });
});

describe("downloadQrPng", () => {
  it("draws on a canvas and hands the PNG data URL to the download", async () => {
    const fills: number[][] = [];
    const ctx = { fillRect: (...args: number[]) => fills.push(args), fillStyle: "" };
    const canvas = { getContext: () => ctx, height: 0, toDataURL: () => "data:image/png;base64,AAA", width: 0 };
    const download = jest.fn();

    await downloadQrPng([[true, false], [false, true]], "qr-shop-a.png", { createCanvas: () => canvas as never, download });

    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(100);
    expect(fills).toHaveLength(3);
    expect(download).toHaveBeenCalledWith("data:image/png;base64,AAA", "qr-shop-a.png");
  });

  it("fails clearly when the canvas has no 2d context", async () => {
    await expect(downloadQrPng([[true]], "x.png", { createCanvas: () => ({ getContext: () => null }) as never })).rejects.toThrow("Canvas is not available");
  });
});
