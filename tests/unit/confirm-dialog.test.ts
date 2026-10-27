import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { ConfirmDialog } from "../../src/components/domain/ConfirmDialog";

const base = { body: "Body", cancelLabel: "No", confirmLabel: "Yes", onCancel: jest.fn(), onConfirm: jest.fn(), title: "Title", visible: true };

describe("ConfirmDialog alternate action", () => {
  it("has no alternate button unless asked for", async () => {
    const view = await render(React.createElement(ConfirmDialog, base));

    expect(view.queryByTestId("confirm-dialog-alternate")).toBeNull();
  });

  it("renders the alternate button and fires it once", async () => {
    const onAlternate = jest.fn();
    const view = await render(React.createElement(ConfirmDialog, { ...base, alternateLabel: "Both", onAlternate }));

    await fireEvent.press(view.getByTestId("confirm-dialog-alternate"));

    expect(onAlternate).toHaveBeenCalledTimes(1);
    expect(view.getByText("Both")).toBeTruthy();
  });

  it("still confirms and cancels", async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const view = await render(React.createElement(ConfirmDialog, { ...base, confirmVariant: "dark", onCancel, onConfirm }));

    await fireEvent.press(view.getByTestId("confirm-dialog-confirm"));
    await fireEvent.press(view.getByTestId("confirm-dialog-cancel"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
