import React from "react";
import { Text } from "react-native";
import { render } from "@testing-library/react-native";

import { Card } from "../../src/components/ui/Card";
import { shadows } from "../../src/lib/design/shadows";

describe("Card", () => {
  it("renders its children", async () => {
    const view = await render(
      React.createElement(Card, { testID: "card" }, React.createElement(Text, null, "Card content")),
    );

    expect(view.getByText("Card content")).toBeTruthy();
  });

  it("applies the level-1 shadow style for the elevated variant", async () => {
    const view = await render(
      React.createElement(Card, { variant: "elevated", testID: "card" }),
    );

    const style = view.getByTestId("card").props.style;
    const flattened = Array.isArray(style) ? Object.assign({}, ...style) : style;

    expect(flattened).toEqual(expect.objectContaining(shadows.level1));
  });

  it("does not apply a shadow for the outlined variant", async () => {
    const view = await render(
      React.createElement(Card, { variant: "outlined", testID: "card" }),
    );

    const style = view.getByTestId("card").props.style;
    const flattened = Array.isArray(style) ? Object.assign({}, ...style) : (style ?? {});

    expect(flattened.shadowOpacity).toBeUndefined();
    expect(flattened.elevation).toBeUndefined();
  });

  it("does not apply a shadow for the flat variant", async () => {
    const view = await render(
      React.createElement(Card, { variant: "flat", testID: "card" }),
    );

    const style = view.getByTestId("card").props.style;
    const flattened = Array.isArray(style) ? Object.assign({}, ...style) : (style ?? {});

    expect(flattened.shadowOpacity).toBeUndefined();
    expect(flattened.elevation).toBeUndefined();
  });
});
