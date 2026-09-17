import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { BarberCard } from "../../src/components/domain/BarberCard";

describe("BarberCard", () => {
  it("renders the name, specialty, rating, and distance", async () => {
    const view = await render(
      React.createElement(BarberCard, {
        name: "João Silva", specialty: "Beard specialist", rating: 4.9, distanceKm: 2.3,
      }),
    );

    expect(view.getByText("João Silva")).toBeTruthy();
    expect(view.getByText("Beard specialist")).toBeTruthy();
    expect(view.getByText("4.9")).toBeTruthy();
    expect(view.getByText("2.3 km")).toBeTruthy();
  });

  it("omits the specialty and distance rows when not provided", async () => {
    const view = await render(React.createElement(BarberCard, { name: "João Silva", rating: 4.9 }));

    expect(view.queryByText("Beard specialist")).toBeNull();
    expect(view.queryByText("2.3 km")).toBeNull();
  });

  it("fires onPress and sets accessibilityState.selected", async () => {
    const onPress = jest.fn();
    const view = await render(
      React.createElement(BarberCard, {
        name: "João Silva", rating: 4.9, selected: true, onPress, testID: "barber-card",
      }),
    );

    await fireEvent.press(view.getByTestId("barber-card"));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("barber-card").props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
  });
});
