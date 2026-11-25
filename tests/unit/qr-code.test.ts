import { render } from "@testing-library/react-native";
import { createElement } from "react";

import { QrCode, qrPath, qrSize } from "../../src/features/shops/QrCode";

const matrix = [
  [true, false],
  [false, true],
];

describe("qrPath", () => {
  it("has one square per dark module", () => {
    expect(qrPath(matrix)).toBe("M4,4h1v1h-1zM5,5h1v1h-1z");
  });
});

describe("QrCode", () => {
  it("draws the matrix with a quiet zone and a label", async () => {
    const screen = await render(createElement(QrCode, { accessibilityLabel: "QR code do estabelecimento", matrix, size: 200 }));
    const svg = screen.getByTestId("shop-link-qr");

    expect(svg.props.accessibilityLabel).toBe("QR code do estabelecimento");
    expect([svg.props.vbWidth, svg.props.vbHeight]).toEqual([10, 10]);
  });
});

describe("qrSize", () => {
  it("is the largest whole multiple of the module count (with the quiet zone) that fits", () => {
    expect(qrSize(29, 240)).toBe(222);
    expect(qrSize(21, 240)).toBe(232);
    expect(qrSize(25, 240)).toBe(231);
  });

  it("never exceeds the maximum and is never below one pixel per module", () => {
    for (const modules of [21, 25, 29, 33, 37, 41, 57, 177]) {
      const size = qrSize(modules, 240);

      expect(size % (modules + 8)).toBe(0);
      expect(size).toBeGreaterThanOrEqual(modules + 8);
      if (modules + 8 <= 240) expect(size).toBeLessThanOrEqual(240);
    }
  });
});
