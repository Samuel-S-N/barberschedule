import React from "react";
import { render } from "@testing-library/react-native";

import { ThemePreview } from "../../src/features/shops/ThemePreview";

describe("ThemePreview", () => {
  it("renders the sample elements with the preview texts", async () => {
    const view = await render(React.createElement(ThemePreview, { input: { accent: null, base: null, primary: "#2F6FDB" } }));

    expect(view.getByTestId("theme-preview")).toBeTruthy();
    expect(view.getByText("Book")).toBeTruthy();
    expect(view.getByText("Selected")).toBeTruthy();
    expect(view.getByText("R$ 65,00")).toBeTruthy();
  });
});
