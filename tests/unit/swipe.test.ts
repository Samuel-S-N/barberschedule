import { isHorizontalDrag, swipeDirection } from "../../src/lib/gestures/swipe";

describe("isHorizontalDrag", () => {
  it.each([
    [30, 0, true],
    [-30, 5, true],
    [20, 0, false],
    [30, 20, false],
    [0, 60, false],
  ])("dx %p dy %p -> %p", (dx, dy, expected) => {
    expect(isHorizontalDrag(dx, dy)).toBe(expected);
  });
});

describe("swipeDirection", () => {
  it.each([
    [-40, 0, "next"],
    [-120, 30, "next"],
    [40, 0, "previous"],
    [90, -20, "previous"],
    [-39, 0, null],
    [39, 0, null],
    [-80, 60, null],
    [0, 0, null],
  ])("dx %p dy %p -> %p", (dx, dy, expected) => {
    expect(swipeDirection(dx, dy)).toBe(expected);
  });
});
