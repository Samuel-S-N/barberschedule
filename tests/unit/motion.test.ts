import { Motion } from "../../src/lib/design/motion";

describe("design motion tokens", () => {
  it("defines the duration scale", () => {
    expect(Motion.duration).toEqual({ fast: 120, base: 200, slow: 300, slower: 500 });
  });

  it("defines the easing curves", () => {
    expect(Motion.easing.standard).toEqual([0.4, 0, 0.2, 1]);
    expect(Motion.easing.accelerate).toEqual([0.4, 0, 1, 1]);
    expect(Motion.easing.decelerate).toEqual([0, 0, 0.2, 1]);
  });
});
