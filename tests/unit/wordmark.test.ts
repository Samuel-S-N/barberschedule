import { render } from "@testing-library/react-native";
import React from "react";
import { StyleSheet } from "react-native";

import { Wordmark } from "../../src/components/domain/Wordmark";
import { WORDMARK_COLOR } from "../../src/lib/design/brand";
import i18n from "../../src/i18n";

describe("Wordmark", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it("spells ZENC with a round wine-coloured period", async () => {
    const view = await render(React.createElement(Wordmark, { scheme: "light" }));

    expect(view.getByText("ZENC")).toBeTruthy();
    expect(view.getByLabelText("Zenc")).toBeTruthy();
    const dot = StyleSheet.flatten(view.getByTestId("wordmark-dot").props.style);

    expect(dot.backgroundColor).toBe(WORDMARK_COLOR.light);
    expect(dot.borderRadius).toBeGreaterThanOrEqual(dot.width / 2);
  });

  it("uses the light wine on dark backgrounds", async () => {
    const view = await render(React.createElement(Wordmark, { scheme: "dark" }));

    expect(StyleSheet.flatten(view.getByTestId("wordmark-dot").props.style).backgroundColor).toBe(WORDMARK_COLOR.dark);
  });
});
