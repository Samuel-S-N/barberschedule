import React from "react";
import { render } from "@testing-library/react-native";

import { Button } from "../../src/components/ui/Button";

describe("Button action colour", () => {
  it("fills the primary variant with the accent token and the on-accent label", async () => {
    const view = await render(React.createElement(Button, { label: "Book", onPress: () => undefined }));
    const pressable = view.getByRole("button");

    expect(pressable.props.className).toContain("bg-accent");
    expect(pressable.props.className).not.toContain("bg-primary-400");
    expect(view.getByText("Book").props.className).toContain("text-on-accent");
  });

  it("keeps the ghost variant on the primary identity colour", async () => {
    const view = await render(React.createElement(Button, { label: "More", onPress: () => undefined, variant: "ghost" }));

    expect(view.getByText("More").props.className).toContain("text-primary-600");
  });
});
