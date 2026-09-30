// Drag distance (dp) before the pan takes the gesture, and how far vertical movement may drift before it gives up.
export const SWIPE_CLAIM_PX = 12;
export const SWIPE_FAIL_Y_PX = 25;

const COMMIT_FRACTION = 0.3; // of one page
const FLICK_VELOCITY = 600; // px/s
const RUBBER = 0.25; // how much of the drag past the first/last page is followed

// `pages` sit side by side; `position` is the strip's translateX, 0 on the first page and -(n - 1) * width on the last.
// These run on the UI thread from the pan callbacks, hence the "worklet" directive.

export function rubberBand(position: number, width: number, pages: number) {
  "worklet";
  const last = -(pages - 1) * width;

  if (position > 0) return position * RUBBER;
  if (position < last) return last + (position - last) * RUBBER;

  return position;
}

export function settleIndex(from: number, position: number, velocityX: number, width: number, pages: number) {
  "worklet";
  const moved = -position / width - from; // pages travelled: > 0 towards the next page
  let target = from;

  if (velocityX <= -FLICK_VELOCITY) target = from + 1;
  else if (velocityX >= FLICK_VELOCITY) target = from - 1;
  else if (moved > COMMIT_FRACTION) target = from + 1;
  else if (moved < -COMMIT_FRACTION) target = from - 1;

  return Math.max(0, Math.min(pages - 1, target));
}
