import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../../src/features/professionals/owner/use-owner-professional-setup", () => ({ useOwnerProfessionalSetup: jest.fn() }));

import { OwnerProfessionalGuide } from "../../src/features/professionals/owner/OwnerProfessionalGuide";
import { useOwnerProfessionalSetup } from "../../src/features/professionals/owner/use-owner-professional-setup";
import i18n from "../../src/i18n";

const setup = (value: { hasHours: boolean; hasServices: boolean }) => jest.mocked(useOwnerProfessionalSetup).mockReturnValue({ ...value, isLoading: false });
const show = () => render(React.createElement(OwnerProfessionalGuide, { professionalId: "p1" }));

describe("OwnerProfessionalGuide", () => {
  beforeAll(async () => i18n.changeLanguage("en"));
  beforeEach(() => mockPush.mockClear());

  it("asks for working hours and opens the schedule with the professional selected", async () => {
    setup({ hasHours: false, hasServices: true });
    const view = await show();

    expect(view.getByText("Add your working hours to appear in booking.")).toBeTruthy();
    expect(view.queryByTestId("owner-guide-services")).toBeNull();
    await fireEvent.press(view.getByTestId("guide-hours-action"));

    expect(mockPush).toHaveBeenCalledWith({ params: { professional: "p1" }, pathname: "/schedule" });
  });

  it("asks for services and opens the professional's profile", async () => {
    setup({ hasHours: true, hasServices: false });
    const view = await show();

    expect(view.getByText("Choose the services you offer to appear in booking.")).toBeTruthy();
    expect(view.queryByTestId("owner-guide-hours")).toBeNull();
    await fireEvent.press(view.getByTestId("guide-services-action"));

    expect(mockPush).toHaveBeenCalledWith({ params: { id: "p1" }, pathname: "/professional-profile" });
  });

  it("shows both rows when both are missing", async () => {
    setup({ hasHours: false, hasServices: false });
    const view = await show();

    expect(view.getByTestId("owner-guide-hours")).toBeTruthy();
    expect(view.getByTestId("owner-guide-services")).toBeTruthy();
  });

  it("renders nothing when nothing is missing", async () => {
    setup({ hasHours: true, hasServices: true });
    const view = await show();

    expect(view.toJSON()).toBeNull();
  });
});
