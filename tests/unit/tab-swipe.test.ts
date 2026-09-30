import { isTabSwipeEnabled } from "../../src/lib/navigation/tab-swipe";

describe("isTabSwipeEnabled", () => {
  it("locks the pager on the booking date step only", () => {
    expect(isTabSwipeEnabled("/book/date")).toBe(false);
    expect(isTabSwipeEnabled("/book")).toBe(true);
    expect(isTabSwipeEnabled("/book/review")).toBe(true);
    expect(isTabSwipeEnabled("/home")).toBe(true);
    expect(isTabSwipeEnabled("/appointments")).toBe(true);
  });
});
