import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { formatPriceBRL, ServiceCard } from "../../src/components/domain/ServiceCard";

describe("formatPriceBRL", () => {
  it("formats whole reais", () => {
    expect(formatPriceBRL(6500)).toBe("R$ 65,00");
  });

  it("formats reais with cents", () => {
    expect(formatPriceBRL(6599)).toBe("R$ 65,99");
  });

  it("pads a single cent digit", () => {
    expect(formatPriceBRL(100)).toBe("R$ 1,00");
    expect(formatPriceBRL(105)).toBe("R$ 1,05");
  });
});

describe("ServiceCard", () => {
  it("renders name, duration, and formatted price", async () => {
    const view = await render(
      React.createElement(ServiceCard, { name: "Cut + Beard", durationMinutes: 45, priceCents: 6500 }),
    );

    expect(view.getByText("Cut + Beard")).toBeTruthy();
    expect(view.getByText("45 min")).toBeTruthy();
    expect(view.getByText("R$ 65,00")).toBeTruthy();
  });

  it("fires onPress and sets accessibilityState.selected", async () => {
    const onPress = jest.fn();
    const view = await render(
      React.createElement(ServiceCard, {
        name: "Cut + Beard", durationMinutes: 45, priceCents: 6500,
        selected: true, onPress, testID: "service-card",
      }),
    );

    await fireEvent.press(view.getByTestId("service-card"));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("service-card").props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
  });
});
