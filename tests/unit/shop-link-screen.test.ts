import { fireEvent, render } from "@testing-library/react-native";
import { createElement } from "react";

import i18n from "../../src/i18n";
import OwnerShopLinkScreen from "../../app/(owner)/shop-link";

const mockReplace = jest.fn();
const mockParams = jest.fn();

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) }));
jest.mock("expo-router", () => ({ useLocalSearchParams: () => mockParams(), useRouter: () => ({ replace: mockReplace }) }));
jest.mock("../../src/lib/navigation/use-back", () => ({ useBack: () => jest.fn() }));
jest.mock("../../src/features/shops/ShopLinkCard", () => ({ ShopLinkCard: () => null }));

describe("owner link screen", () => {
  beforeAll(async () => i18n.changeLanguage("en"));
  beforeEach(() => jest.clearAllMocks());

  it("has no extra button when opened from Manage", async () => {
    mockParams.mockReturnValue({});
    const view = await render(createElement(OwnerShopLinkScreen));

    expect(view.queryByTestId("shop-link-to-agenda")).toBeNull();
  });

  it("right after opening the business it offers 'Go to the agenda', which opens the panel", async () => {
    mockParams.mockReturnValue({ from: "setup" });
    const view = await render(createElement(OwnerShopLinkScreen));

    expect(view.getByText("Go to the agenda")).toBeTruthy();
    await fireEvent.press(view.getByTestId("shop-link-to-agenda"));

    expect(mockReplace).toHaveBeenCalledWith("/agenda");
  });
});
