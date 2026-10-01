import { barPath, centerFontSize, donutArcs, labelPlacement, niceMax, yTicks } from "../../src/components/charts/geometry";

describe("scale", () => {
  it("rounds the axis maximum up to a clean number", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(130)).toBe(200);
    expect(niceMax(4800)).toBe(5000);
    expect(niceMax(1000)).toBe(1000);
  });

  it("uses three ticks from zero to the maximum", () => {
    expect(yTicks(200)).toEqual([0, 100, 200]);
  });
});

describe("barPath", () => {
  it("is empty for a zero-height bar and rounds only the top corners", () => {
    expect(barPath(0, 10, 10, 0, 4)).toBe("");
    const d = barPath(0, 0, 10, 50, 4);

    expect(d.startsWith("M 0 50")).toBe(true);
    expect(d.match(/Q/g)).toHaveLength(2);
  });
});

describe("donutArcs", () => {
  const opts = { cx: 50, cy: 50, gapPx: 2, inner: 30, outer: 50 };

  it("returns one arc per non-zero value, keeping the original index", () => {
    expect(donutArcs([1, 1], opts).map((a) => a.index)).toEqual([0, 1]);
    expect(donutArcs([0, 5], opts).map((a) => a.index)).toEqual([1]);
  });

  it("returns nothing when there is no data", () => {
    expect(donutArcs([], opts)).toEqual([]);
    expect(donutArcs([0, 0], opts)).toEqual([]);
  });

  it("draws a single slice as a nearly full ring, not a degenerate arc", () => {
    const [arc] = donutArcs([4], opts);

    expect(arc.d).toContain("A 50 50 0 1 1");
  });
});

describe("labelPlacement", () => {
  it("centres a label that fits", () => {
    expect(labelPlacement(150, 320, 34, 4, 50)).toEqual({ anchor: "middle", x: 150 });
  });

  it("anchors a label that would overflow the right edge to the plot's right end", () => {
    expect(labelPlacement(310, 320, 34, 4, 50)).toEqual({ anchor: "end", x: 316 });
  });

  it("anchors a label that would overflow the left edge to the plot's left start", () => {
    expect(labelPlacement(40, 320, 34, 4, 50)).toEqual({ anchor: "start", x: 34 });
  });
});

describe("centerFontSize", () => {
  it("uses the largest size for short values", () => {
    expect(centerFontSize("55", 110)).toBe(36);
  });

  it("shrinks long values so they fit inside the hole", () => {
    const size = centerFontSize("R$ 3965,00", 110);

    expect(size).toBeLessThan(24);
    expect(size * 0.55 * "R$ 3965,00".length).toBeLessThanOrEqual(110);
  });

  it("never goes below a readable minimum", () => {
    expect(centerFontSize("R$ 123456789,00", 60)).toBe(14);
  });
});
