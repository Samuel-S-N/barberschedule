import { selectTab } from "../../src/lib/navigation/select-tab";

const state = { routes: [{ key: "home-abc", name: "home" }, { key: "book-def", name: "book" }] };

describe("selectTab", () => {
  it("navigates by the route key of the tab with that name", () => {
    const navigateToTab = jest.fn();

    selectTab(state, navigateToTab, "book");

    expect(navigateToTab).toHaveBeenCalledWith("book-def");
  });

  it("does nothing for a name that is not a tab", () => {
    const navigateToTab = jest.fn();

    selectTab(state, navigateToTab, "missing");

    expect(navigateToTab).not.toHaveBeenCalled();
  });
});
