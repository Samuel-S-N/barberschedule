import { isTabSwipeEnabled, nestedRouteName } from "../../src/lib/navigation/tab-swipe";

describe("nestedRouteName", () => {
  it("returns the focused screen of a nested navigator", () => {
    expect(nestedRouteName({ name: "book", state: { index: 1, routes: [{ name: "index" }, { name: "date" }] } })).toBe("date");
  });

  it("defaults to the first route when the index is missing", () => {
    expect(nestedRouteName({ name: "book", state: { routes: [{ name: "index" }] } })).toBe("index");
  });

  it("returns undefined before the nested navigator has state", () => {
    expect(nestedRouteName({ name: "book" })).toBeUndefined();
  });
});

describe("isTabSwipeEnabled", () => {
  it("locks the pager on the booking date step only", () => {
    expect(isTabSwipeEnabled("book", "date")).toBe(false);
    expect(isTabSwipeEnabled("book", "index")).toBe(true);
    expect(isTabSwipeEnabled("book", "review")).toBe(true);
    expect(isTabSwipeEnabled("book")).toBe(true);
    expect(isTabSwipeEnabled("home", "date")).toBe(true);
  });
});
