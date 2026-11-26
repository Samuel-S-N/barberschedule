import { fireEvent, render } from "@testing-library/react-native";
import { createElement } from "react";

import i18n from "../../src/i18n";
import { SetupTeamStep } from "../../src/features/setup/SetupTeamStep";

const mockPush = jest.fn();
const mockToggle = jest.fn();

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../../src/features/professionals/owner/use-owner-as-professional", () => ({
  useOwnerAsProfessional: () => ({ active: false, isLoading: false, professionalId: null, toggle: { isPending: false, mutate: mockToggle } }),
}));

const professionals = [
  { hasHours: false, hasServices: true, id: "p1", name: "Ana" },
  { hasHours: true, hasServices: true, id: "p2", name: "Bia" },
];

describe("SetupTeamStep", () => {
  beforeAll(async () => i18n.changeLanguage("en"));
  beforeEach(() => jest.clearAllMocks());

  it("says what each professional lacks", async () => {
    const view = await render(createElement(SetupTeamStep, { done: false, onChanged: jest.fn(), professionals }));

    expect(view.getByTestId("setup-professional-p1")).toBeTruthy();
    expect(view.getByText("Hours are missing.")).toBeTruthy();
    expect(view.queryByText("Services are missing.")).toBeNull();
    expect(view.getByTestId("setup-professional-p2")).toBeTruthy();
    expect(view.getAllByText("Hours are missing.")).toHaveLength(1);
  });

  it("opens the schedule with the professional selected, and the add-professional form", async () => {
    const view = await render(createElement(SetupTeamStep, { done: false, onChanged: jest.fn(), professionals }));

    await fireEvent.press(view.getByText("Add hours"));
    expect(mockPush).toHaveBeenCalledWith({ params: { from: "setup", professional: "p1" }, pathname: "/schedule" });

    await fireEvent.press(view.getByTestId("setup-team-add"));
    expect(mockPush).toHaveBeenCalledWith({ params: { from: "setup" }, pathname: "/professional-new" });
  });

  it("the serve-myself switch turns the owner's professional on and refreshes the checklist", async () => {
    const onChanged = jest.fn();
    const view = await render(createElement(SetupTeamStep, { done: false, onChanged, professionals: [] }));

    await fireEvent(view.getByTestId("setup-team-serve"), "valueChange", true);

    expect(mockToggle).toHaveBeenCalledWith(true, expect.objectContaining({ onSettled: onChanged }));
  });
});
