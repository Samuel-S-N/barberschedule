import { selectTab } from "../../src/lib/navigation/select-tab";

const routes = [{ key: "home-abc", name: "home" }, { key: "book-def", name: "book" }, { key: "profile-ghi", name: "profile" }];

function bar(index = 0, prevented = false) {
  const emit = jest.fn().mockReturnValue({ defaultPrevented: prevented });
  const navigateToTab = jest.fn();

  return { emit, navigateToTab, tabBar: { emitter: { emit }, navigateToTab, state: { index, routes } } };
}

describe("selectTab", () => {
  it("emits tabPress for the tab with that name, so a nested stack can pop to its root", () => {
    const { emit, tabBar } = bar();

    selectTab(tabBar, "book");

    expect(emit).toHaveBeenCalledWith({ canPreventDefault: true, target: "book-def", type: "tabPress" });
  });

  it("then navigates by the route key when the event was not prevented", () => {
    const { navigateToTab, tabBar } = bar();

    selectTab(tabBar, "book");

    expect(navigateToTab).toHaveBeenCalledWith("book-def");
  });

  it("does not navigate when the event was prevented", () => {
    const { emit, navigateToTab, tabBar } = bar(0, true);

    selectTab(tabBar, "book");

    expect(emit).toHaveBeenCalledTimes(1);
    expect(navigateToTab).not.toHaveBeenCalled();
  });

  it("tapping the focused tab emits tabPress but does not navigate again (the nested stack pops itself)", () => {
    const { emit, navigateToTab, tabBar } = bar(1);

    selectTab(tabBar, "book");

    expect(emit).toHaveBeenCalledWith({ canPreventDefault: true, target: "book-def", type: "tabPress" });
    expect(navigateToTab).not.toHaveBeenCalled();
  });

  it("a tab that keeps its nested state emits no tabPress, so a half-made flow is not popped, but it still opens from another tab", () => {
    const { emit, navigateToTab, tabBar } = bar(0);

    selectTab(tabBar, "book", ["book"]);

    expect(emit).not.toHaveBeenCalled();
    expect(navigateToTab).toHaveBeenCalledWith("book-def");
  });

  it("pressing a keep-nested tab that is already focused does nothing at all", () => {
    const { emit, navigateToTab, tabBar } = bar(1);

    selectTab(tabBar, "book", ["book"]);

    expect(emit).not.toHaveBeenCalled();
    expect(navigateToTab).not.toHaveBeenCalled();
  });

  it("the keep list does not affect the other tabs", () => {
    const { emit, tabBar } = bar(2);

    selectTab(tabBar, "profile", ["book"]);

    expect(emit).toHaveBeenCalledWith({ canPreventDefault: true, target: "profile-ghi", type: "tabPress" });
  });

  it("does nothing for a name that is not a tab", () => {
    const { emit, navigateToTab, tabBar } = bar();

    selectTab(tabBar, "missing");

    expect(emit).not.toHaveBeenCalled();
    expect(navigateToTab).not.toHaveBeenCalled();
  });
});
