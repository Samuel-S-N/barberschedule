import React from "react";
import { Text } from "react-native";
import { render } from "@testing-library/react-native";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 10, right: 12, top: 44 }),
}));

import { Screen } from "../../src/components/ui/Screen";

function flatten(style: unknown): Record<string, unknown> {
  return Array.isArray(style) ? Object.assign({}, ...style.flat(Infinity).filter(Boolean)) : ((style as Record<string, unknown>) ?? {});
}

async function renderScreen(props: Record<string, unknown> = {}) {
  const view = await render(React.createElement(Screen, { testID: "screen", ...props }, React.createElement(Text, null, "content")));

  return { style: flatten(view.getByTestId("screen").props.style), view };
}

describe("Screen", () => {
  it("pads all four edges by the device insets by default", async () => {
    const { style } = await renderScreen();

    expect(style).toEqual(expect.objectContaining({ paddingBottom: 34, paddingLeft: 10, paddingRight: 12, paddingTop: 44 }));
  });

  it("only pads the requested edges", async () => {
    const { style } = await renderScreen({ edges: ["top", "left", "right"] });

    expect(style).toEqual(expect.objectContaining({ paddingLeft: 10, paddingRight: 12, paddingTop: 44 }));
    expect(style).not.toHaveProperty("paddingBottom");
  });

  it("adds the inset on top of padding the caller already set", async () => {
    const { style } = await renderScreen({ style: { padding: 24 } });

    expect(style).toEqual(expect.objectContaining({ paddingBottom: 58, paddingLeft: 34, paddingRight: 36, paddingTop: 68 }));
  });

  it("prefers the more specific padding as the base", async () => {
    const { style } = await renderScreen({ edges: ["top", "left"], style: { padding: 24, paddingHorizontal: 8, paddingTop: 4 } });

    expect(style).toEqual(expect.objectContaining({ paddingLeft: 18, paddingTop: 48 }));
  });

  it("keeps the caller's other styles and renders its children", async () => {
    const { style, view } = await renderScreen({ style: { backgroundColor: "#fff", flex: 1 } });

    expect(style).toEqual(expect.objectContaining({ backgroundColor: "#fff", flex: 1 }));
    expect(view.getByText("content")).toBeTruthy();
  });
});
