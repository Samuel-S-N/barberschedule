export const SWIPE_CLAIM_PX = 20;
export const SWIPE_FAIL_Y_PX = 25;
const COMMIT_PX = 40;

export function isHorizontalDrag(dx: number, dy: number) {
  return Math.abs(dx) > SWIPE_CLAIM_PX && Math.abs(dx) > 2 * Math.abs(dy);
}

export function swipeDirection(dx: number, dy: number): "next" | "previous" | null {
  if (!isHorizontalDrag(dx, dy) || Math.abs(dx) < COMMIT_PX) return null;

  return dx < 0 ? "next" : "previous";
}
