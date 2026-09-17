import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { AppointmentCard } from "../../src/components/domain/AppointmentCard";

const baseProps = {
  serviceName: "Cut + Beard",
  barberName: "João Silva",
  dateLabel: "Thu, Aug 18",
  timeLabel: "14:30",
  shopName: "Barbearia Alfa",
  shopAddress: "R. das Flores, 123",
};

describe("AppointmentCard", () => {
  it("renders the service, barber, date/time, shop, and status", async () => {
    const view = await render(
      React.createElement(AppointmentCard, { ...baseProps, status: "confirmed", testID: "card" }),
    );

    expect(view.getByText("Cut + Beard · João Silva")).toBeTruthy();
    expect(view.getByText("Thu, Aug 18 · 14:30")).toBeTruthy();
    expect(view.getByText("Barbearia Alfa · R. das Flores, 123")).toBeTruthy();
    expect(view.getByText("Confirmed")).toBeTruthy();
  });

  it("fires onPress when tapped", async () => {
    const onPress = jest.fn();
    const view = await render(
      React.createElement(AppointmentCard, { ...baseProps, status: "confirmed", onPress, testID: "card" }),
    );

    await fireEvent.press(view.getByTestId("card"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("dims the content to 60% opacity when cancelled", async () => {
    const view = await render(
      React.createElement(AppointmentCard, { ...baseProps, status: "cancelled", testID: "card" }),
    );

    const style = view.getByTestId("card").props.style;
    const flattened = Array.isArray(style) ? Object.assign({}, ...style) : (style ?? {});

    expect(flattened.opacity).toBe(0.6);
  });

  it("does not dim the content for a non-cancelled status", async () => {
    const view = await render(
      React.createElement(AppointmentCard, { ...baseProps, status: "confirmed", testID: "card" }),
    );

    const style = view.getByTestId("card").props.style;
    const flattened = Array.isArray(style) ? Object.assign({}, ...style) : (style ?? {});

    expect(flattened.opacity).toBeUndefined();
  });
});
