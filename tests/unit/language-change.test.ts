import React from "react";
import { act, render } from "@testing-library/react-native";

import { StatusBadge } from "../../src/components/domain/StatusBadge";
import i18n from "../../src/i18n";

describe("language change at runtime", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("re-renders an already mounted component in the new language", async () => {
    const view = await render(React.createElement(StatusBadge, { status: "scheduled" }));
    expect(view.getByText("Scheduled")).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage("es");
    });

    expect(view.getByText("Programada")).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage("pt");
    });

    expect(view.getByText("Agendado")).toBeTruthy();
  });
});
