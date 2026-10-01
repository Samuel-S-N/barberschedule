import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { BarberBookingSheet } from "../../src/components/domain/BarberBookingSheet";

const services = [
  { active: true, barberServiceId: "bs-long", durationMinutes: 60, priceCents: 8000, serviceId: "s2", serviceName: "Cut and beard" },
  { active: true, barberServiceId: "bs-cut", durationMinutes: 30, priceCents: 4000, serviceId: "s1", serviceName: "Cut" },
];
const recent = [{ email: "ana@example.com", fullName: "Ana Souza", hasAccount: true, id: "c1", phone: "11999990000" }];

function setup(overrides: Record<string, unknown> = {}) {
  const props = {
    fitsService: (service: { durationMinutes: number }) => service.durationMinutes <= 30,
    onClose: jest.fn(), onSearch: jest.fn(), onSubmit: jest.fn(), recent, services, slotLabel: "09:30", visible: true, ...overrides,
  };

  return { props, view: render(React.createElement(BarberBookingSheet, props as never)) };
}

describe("BarberBookingSheet", () => {
  it("disables confirm until a name is typed, then submits only the typed fields", async () => {
    const { props, view } = setup();
    const v = await view;

    expect(v.getByTestId("barber-book-confirm").props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(v.getByTestId("barber-book-name"), "Walk In");
    await fireEvent.press(v.getByTestId("barber-book-confirm"));

    expect(props.onSubmit).toHaveBeenCalledWith({ barberServiceId: "bs-cut", customer: { email: "", name: "Walk In", phone: "" } });
  });

  it("pre-selects the first service that fits and disables the ones that do not", async () => {
    const v = await setup().view;

    expect(v.getByTestId("barber-book-service-bs-cut").props.accessibilityState?.selected).toBe(true);
    expect(v.getByTestId("barber-book-service-bs-long").props.accessibilityState?.disabled).toBe(true);
  });

  it("fills the form from a recent customer and submits their id", async () => {
    const { props, view } = setup();
    const v = await view;

    await fireEvent.press(v.getByTestId("barber-book-recent-c1"));
    expect(v.getByTestId("barber-book-name").props.value).toBe("Ana Souza");
    await fireEvent.press(v.getByTestId("barber-book-confirm"));

    expect(props.onSubmit).toHaveBeenCalledWith({ barberServiceId: "bs-cut", customer: { id: "c1" } });
  });

  it("falls back to typed fields once a suggestion is edited", async () => {
    const { props, view } = setup();
    const v = await view;

    await fireEvent.press(v.getByTestId("barber-book-recent-c1"));
    await fireEvent.changeText(v.getByTestId("barber-book-name"), "Ana S");
    await fireEvent.press(v.getByTestId("barber-book-confirm"));

    expect(props.onSubmit).toHaveBeenCalledWith({
      barberServiceId: "bs-cut",
      customer: { email: "ana@example.com", name: "Ana S", phone: "11999990000" },
    });
  });

  it("shows the no-email hint only while a name is typed without an email", async () => {
    const v = await setup().view;

    expect(v.queryByTestId("barber-book-no-email")).toBeNull();
    await fireEvent.changeText(v.getByTestId("barber-book-name"), "Walk In");
    expect(v.getByTestId("barber-book-no-email")).toBeTruthy();
    await fireEvent.changeText(v.getByTestId("barber-book-email"), "w@example.com");
    expect(v.queryByTestId("barber-book-no-email")).toBeNull();
  });

  it("asks the parent to search as the name changes", async () => {
    const { props, view } = setup();
    const v = await view;

    await fireEvent.changeText(v.getByTestId("barber-book-name"), "An");
    expect(props.onSearch).toHaveBeenCalledWith("An");
  });

  it("opens pre-filled with the initial customer and submits their id", async () => {
    const { props, view } = setup({ initialCustomer: recent[0] });
    const v = await view;

    expect(v.getByTestId("barber-book-name").props.value).toBe("Ana Souza");
    expect(v.getByTestId("barber-book-email").props.value).toBe("ana@example.com");
    await fireEvent.press(v.getByTestId("barber-book-confirm"));

    expect(props.onSubmit).toHaveBeenCalledWith({ barberServiceId: "bs-cut", customer: { id: "c1" } });
  });

  it("suggests the preferred service when it fits", async () => {
    const v = await setup({ fitsService: () => true, preferredServiceName: "Cut" }).view;

    expect(v.getByTestId("barber-book-service-bs-cut").props.accessibilityState?.selected).toBe(true);
    expect(v.getByTestId("barber-book-service-bs-long").props.accessibilityState?.selected).toBe(false);
  });

  it("falls back to the first fitting service when the preferred one does not fit", async () => {
    const v = await setup({ preferredServiceName: "Cut and beard" }).view;

    expect(v.getByTestId("barber-book-service-bs-cut").props.accessibilityState?.selected).toBe(true);
  });
});
