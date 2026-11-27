import { begin, end, HOLD_OFFSET, idle, MAX_OFFSET, move, offset, progress, PULL_THRESHOLD, shouldPreventDefault } from "../../src/lib/pull-to-refresh";

const at = (x: number, y: number) => ({ x, y });
const start = (opts: Partial<Parameters<typeof begin>[1]> = {}) => begin(at(100, 200), { atTop: true, refreshing: false, touches: 1, ...opts });
const drag = (state: ReturnType<typeof start>, dy: number, dx = 0, atTop = true) => move(state, at(100 + dx, 200 + dy), atTop);

describe("begin", () => {
  it("tracks a one-finger touch at the top", () => expect(start().phase).toBe("tracking"));
  it("does nothing when the content is scrolled", () => expect(start({ atTop: false })).toEqual(idle));
  it("does nothing while already refreshing", () => expect(start({ refreshing: true })).toEqual(idle));
  it("does nothing with two fingers (pinch)", () => expect(start({ touches: 2 })).toEqual(idle));
});

describe("move", () => {
  it("waits inside the start slop", () => expect(drag(start(), 4).phase).toBe("tracking"));
  it("becomes a pull once the finger went down a few pixels, mostly vertically", () => {
    const state = drag(start(), 10, 3);

    expect(state.phase).toBe("pulling");
    expect(shouldPreventDefault(state)).toBe(true);
  });
  it("is cancelled by an upward move (a normal scroll)", () => {
    const state = drag(start(), -5);

    expect(state.phase).toBe("cancelled");
    expect(shouldPreventDefault(state)).toBe(false);
    expect(drag(state, 200).phase).toBe("cancelled");
  });
  it("is cancelled by a horizontal move (calendar swipes)", () => {
    expect(drag(start(), 3, 20).phase).toBe("cancelled");
  });
  it("is cancelled when the content is no longer at the top (mid-scroll)", () => {
    expect(drag(start(), 10, 0, false).phase).toBe("cancelled");
    expect(drag(drag(start(), 20), 40, 0, false).phase).toBe("cancelled");
  });
  it("keeps the pull when the finger comes back above the start, without a distance", () => {
    const state = drag(drag(start(), 30), -10);

    expect(state.phase).toBe("pulling");
    expect(offset(state, false)).toBe(0);
  });
  it("ignores moves when idle", () => expect(move(idle, at(0, 100), true)).toEqual(idle));
});

describe("end", () => {
  it("fires past the threshold", () => expect(end(drag(start(), PULL_THRESHOLD)).fire).toBe(true));
  it("does not fire on a short pull", () => expect(end(drag(start(), PULL_THRESHOLD - 1)).fire).toBe(false));
  it("does not fire for a cancelled or idle touch", () => {
    expect(end(drag(start(), -20)).fire).toBe(false);
    expect(end(idle).fire).toBe(false);
  });
});

describe("offset and progress", () => {
  it("follows the finger with resistance and stops at the maximum", () => {
    expect(offset(drag(start(), 40), false)).toBe(20);
    expect(offset(drag(start(), 1000), false)).toBe(MAX_OFFSET);
  });
  it("holds the spinner in place while refreshing, and rests at 0 otherwise", () => {
    expect(offset(idle, true)).toBe(HOLD_OFFSET);
    expect(offset(idle, false)).toBe(0);
  });
  it("progress reaches 1 at the threshold, and the spinner is fully visible while refreshing", () => {
    expect(progress(drag(start(), PULL_THRESHOLD / 2), false)).toBeCloseTo(0.5);
    expect(progress(drag(start(), 500), false)).toBe(1);
    expect(progress(idle, false)).toBe(0);
    expect(progress(idle, true)).toBe(1);
  });
});
