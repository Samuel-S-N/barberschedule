import React from "react";
import { render } from "@testing-library/react-native";

import { StatusBadge } from "../../src/components/domain/StatusBadge";
import i18n from "../../src/i18n";

describe("component translations", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("StatusBadge follows the language", async () => {
    await i18n.changeLanguage("pt");
    const view = await render(React.createElement(StatusBadge, { status: "no_show" }));

    expect(view.getByText("Não compareceu")).toBeTruthy();
  });

  it("StatusBadge keeps an explicit label", async () => {
    await i18n.changeLanguage("es");
    const view = await render(React.createElement(StatusBadge, { label: "Custom", status: "confirmed" }));

    expect(view.getByText("Custom")).toBeTruthy();
  });
});
