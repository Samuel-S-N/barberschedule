import { render } from "@testing-library/react-native";
import { createElement } from "react";

import { QrCode, qrPath } from "../../src/features/shops/QrCode";

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
