// Pure logic of the web pull-to-refresh (no DOM, no React): a touch is followed from touchstart to touchend and decides whether it is a
// pull, when to stop the browser's own scrolling and whether the release refreshes. Wired to the DOM in RefreshableScrollView.web.tsx.
export type Point = { x: number; y: number };

export type PullState =
  | { phase: "idle" }
  | { phase: "tracking"; start: Point }
  | { phase: "pulling"; distance: number; start: Point }
  | { phase: "cancelled" };

export const PULL_THRESHOLD = 70; // finger travel (px) that arms the refresh
export const PULL_START_SLOP = 6; // the browser starts its own scroll only after about 15 px, so deciding earlier still lets preventDefault work
export const MAX_OFFSET = 90; // how far the content can be dragged (px)
export const HOLD_OFFSET = 56; // where the spinner rests while refreshing (px)
const RESISTANCE = 0.5;

export const idle: PullState = { phase: "idle" };

export function begin(point: Point, { atTop, refreshing, touches }: { atTop: boolean; refreshing: boolean; touches: number }): PullState {
  return atTop && !refreshing && touches === 1 ? { phase: "tracking", start: point } : idle;
}

export function move(state: PullState, point: Point, atTop: boolean): PullState {
  if (state.phase === "idle" || state.phase === "cancelled") return state;
  // Scrolled since the touch began (a nested scroller, or the page itself): this touch is a scroll, never a pull.
  if (!atTop) return { phase: "cancelled" };

  const dy = point.y - state.start.y;
  const dx = point.x - state.start.x;

  if (state.phase === "pulling") return { distance: Math.max(0, dy), phase: "pulling", start: state.start };
  if (dy < 0 || (Math.abs(dx) > PULL_START_SLOP && Math.abs(dx) > dy)) return { phase: "cancelled" };
  if (dy >= PULL_START_SLOP && dy >= Math.abs(dx)) return { distance: dy, phase: "pulling", start: state.start };

  return state;
}

export const shouldPreventDefault = (state: PullState) => state.phase === "pulling";

export const end = (state: PullState): { fire: boolean } => ({ fire: state.phase === "pulling" && state.distance >= PULL_THRESHOLD });

export function offset(state: PullState, refreshing: boolean): number {
  if (state.phase === "pulling") return Math.min(MAX_OFFSET, state.distance * RESISTANCE);

  return refreshing ? HOLD_OFFSET : 0;
}

// 0..1: how visible the spinner is while the finger is down; fully visible while refreshing.
export function progress(state: PullState, refreshing: boolean): number {
  if (state.phase === "pulling") return Math.min(1, state.distance / PULL_THRESHOLD);

  return refreshing ? 1 : 0;
}
