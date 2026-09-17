import React from "react";
import { render } from "@testing-library/react-native";

import { SkeletonBlock, SkeletonCircle, SkeletonText } from "../../src/components/domain/SkeletonLoader";

function flattenStyle(style: unknown) {
  return Array.isArray(style) ? Object.assign({}, ...style) : (style ?? {});
}

describe("SkeletonBlock", () => {
  it("renders with the given width and height and hides from screen readers", async () => {
    const view = await render(React.createElement(SkeletonBlock, { width: 120, height: 40, testID: "block" }));
    // includeHiddenElements: needed because the element under test marks
    // itself importantForAccessibility="no-hide-descendants", which RTL's
    // default queries treat as hidden (and thus excluded) — that's exactly
    // the decorative-skeleton behavior this test verifies.
    const node = view.getByTestId("block", { includeHiddenElements: true });

    expect(flattenStyle(node.props.style)).toEqual(expect.objectContaining({ width: 120, height: 40 }));
    expect(node.props.importantForAccessibility).toBe("no-hide-descendants");
  });
});

describe("SkeletonCircle", () => {
  it("renders a square sized to a full circle", async () => {
    const view = await render(React.createElement(SkeletonCircle, { size: 56, testID: "circle" }));
    const node = view.getByTestId("circle", { includeHiddenElements: true });

    expect(flattenStyle(node.props.style)).toEqual(
      expect.objectContaining({ width: 56, height: 56, borderRadius: 28 }),
    );
  });
});

describe("SkeletonText", () => {
  it("renders one line by default", async () => {
    const view = await render(React.createElement(SkeletonText, { testID: "text" }));

    expect(view.getAllByTestId(/^text-line-/, { includeHiddenElements: true })).toHaveLength(1);
  });

  it("renders the requested number of lines", async () => {
    const view = await render(React.createElement(SkeletonText, { lines: 3, testID: "text" }));

    expect(view.getAllByTestId(/^text-line-/, { includeHiddenElements: true })).toHaveLength(3);
  });
});
