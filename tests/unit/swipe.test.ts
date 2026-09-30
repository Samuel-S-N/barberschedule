import { rubberBand, settleIndex } from "../../src/lib/gestures/swipe";

const W = 300;

describe("rubberBand", () => {
  it("leaves positions inside the pages untouched", () => {
    expect(rubberBand(0, W, 2)).toBe(0);
    expect(rubberBand(-120, W, 2)).toBe(-120);
    expect(rubberBand(-300, W, 2)).toBe(-300);
  });

  it("damps a drag past the first page", () => {
    expect(rubberBand(100, W, 2)).toBe(25);
  });

  it("damps a drag past the last page", () => {
    // last page rests at -300; 80 px further left becomes 20 px
    expect(rubberBand(-380, W, 2)).toBe(-320);
  });
});

describe("settleIndex", () => {
  it("snaps back from a short drag", () => {
    expect(settleIndex(0, -60, 0, W, 2)).toBe(0);
    expect(settleIndex(1, -240, 0, W, 2)).toBe(1);
  });

  it("commits once the drag passes 30% of a page", () => {
    expect(settleIndex(0, -100, 0, W, 2)).toBe(1);
    expect(settleIndex(1, -200, 0, W, 2)).toBe(0);
  });

  it("commits a flick even when the drag is short", () => {
    expect(settleIndex(0, -20, -800, W, 2)).toBe(1);
    expect(settleIndex(1, -280, 800, W, 2)).toBe(0);
  });

  it("lets the last flick win over the distance dragged", () => {
    // dragged 40% towards the next page, then flicked back
    expect(settleIndex(1, -420, 800, W, 3)).toBe(0);
  });

  it("never leaves the available pages", () => {
    expect(settleIndex(0, 50, 800, W, 2)).toBe(0);
    expect(settleIndex(1, -330, -800, W, 2)).toBe(1);
  });

  it("works with three pages", () => {
    expect(settleIndex(1, -450, 0, W, 3)).toBe(2);
    expect(settleIndex(1, -150, 0, W, 3)).toBe(0);
  });
});
