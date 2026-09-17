import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { EmptyState } from "../../src/components/domain/EmptyState";

describe("EmptyState", () => {
  it("renders the title and subtitle", async () => {
    const view = await render(
      React.createElement(EmptyState, {
        title: "No appointments yet",
        subtitle: "Choose a barber and book your time",
      }),
    );

    expect(view.getByText("No appointments yet")).toBeTruthy();
    expect(view.getByText("Choose a barber and book your time")).toBeTruthy();
  });

  it("does not render an action button when actionLabel/onAction are omitted", async () => {
    const view = await render(React.createElement(EmptyState, { title: "No appointments yet" }));

    expect(view.queryByRole("button")).toBeNull();
  });

  it("renders the action button and fires onAction when tapped", async () => {
    const onAction = jest.fn();
    const view = await render(
      React.createElement(EmptyState, {
        title: "No appointments yet", actionLabel: "Book now", onAction,
      }),
    );

    await fireEvent.press(view.getByText("Book now"));

    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
