# Web pull-to-refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pulling down at the top of a screen refetches it on the web (browser and installed PWA), on Home, Appointments, Book > professional, the owner Agenda and the professional My agenda, without changing native behaviour.

**Architecture:** A pure gesture state machine (`src/lib/pull-to-refresh.ts`) plus one component `RefreshableScrollView` with a native file (ScrollView + `RefreshControl`, as today) and a `.web.tsx` file (wrapper with native touch listeners, an indicator and a translated scroll container). Screens swap `ScrollView refreshControl={...}` for `RefreshableScrollView onRefresh refreshing`.

**Tech Stack:** React Native / react-native-web 0.21, Expo Router, Jest (jest-expo), Playwright (touch emulation).

**Spec:** `docs/superpowers/specs/2026-11-27-web-pull-to-refresh-design.md`

## Global Constraints

- Native behaviour must not change: the native component renders exactly the `ScrollView` + `RefreshControl` the screens render today.
- No DOM code in the native bundle (platform extension `.web.tsx`); no new dependency.
- A fake password in a test goes in a named constant without "password" in its name (see `docs/testing.md`); never real credentials.
- Say estabelecimento/negócio, never barbearia/barbershop. No user-facing text is added.
- Strict TDD, one commit per task, trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; commit trailers only, no push.
- Gates: `npx tsc --noEmit`, root `npm run lint` after the last commit, full `npx jest` (no "did not exit"), Playwright whole suite on chromium + firefox + webkit with `.env.local` moved aside and the static export (`npm run e2e:export`) served on 4173.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/pull-to-refresh.ts` | pure gesture state machine, thresholds, offsets |
| `src/components/ui/RefreshableScrollView.tsx` | native: ScrollView + RefreshControl; exports the props type |
| `src/components/ui/RefreshableScrollView.web.tsx` | web: listeners, indicator, translated container |
| `src/components/ui/index.ts` | export |
| `app/(customer)/(tabs)/home.tsx`, `appointments.tsx`, `book/professional.tsx`, `app/(owner)/agenda.tsx`, `src/features/appointments/ProfessionalAgenda.tsx` | use the component |
| `tests/unit/pull-to-refresh.test.ts`, `tests/unit/refreshable-scroll-view.test.ts` | unit tests |
| `tests/e2e/pull-to-refresh.web.spec.ts` | web e2e |

---

### Task 1: The gesture state machine

**Files:** Create `src/lib/pull-to-refresh.ts`, `tests/unit/pull-to-refresh.test.ts`.

**Interfaces (produced):** `Point`, `PullState`, `PULL_THRESHOLD = 70`, `PULL_START_SLOP = 6`, `MAX_OFFSET = 90`, `HOLD_OFFSET = 56`, `idle`, `begin(point, { atTop, refreshing, touches })`, `move(state, point, atTop)`, `end(state) => { fire: boolean }`, `shouldPreventDefault(state)`, `offset(state, refreshing)`, `progress(state, refreshing)`.

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run, expect FAIL** (`npx jest tests/unit/pull-to-refresh.test.ts`: module missing).
- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run, expect PASS; `npx tsc --noEmit`.**
- [ ] **Step 5: Commit** `feat(pull-to-refresh): pure gesture logic for the web pull`

---

### Task 2: `RefreshableScrollView` (native file, web file)

**Files:** Create `src/components/ui/RefreshableScrollView.tsx`, `src/components/ui/RefreshableScrollView.web.tsx`, `tests/unit/refreshable-scroll-view.test.ts`; modify `src/components/ui/index.ts`.

**Interfaces (produced):** `RefreshableScrollViewProps = ScrollViewProps & { as?: ComponentType<any>; onRefresh: () => void | Promise<void>; refreshing: boolean; [key: string]: unknown }` exported from the native file; `RefreshableScrollView(props)` on both platforms.

- [ ] **Step 1: Failing test (native branch)**

```ts
import React from "react";
import { RefreshControl, ScrollView, Text } from "react-native";
import { render, screen } from "@testing-library/react-native";

import { RefreshableScrollView } from "../../src/components/ui/RefreshableScrollView";

describe("RefreshableScrollView (native)", () => {
  it("renders a ScrollView with the same RefreshControl the screens used to pass, and keeps its other props", async () => {
    const onRefresh = jest.fn();

    await render(React.createElement(RefreshableScrollView, { className: "flex-1", onRefresh, refreshing: true, testID: "scroller" }, React.createElement(Text, null, "content")));

    const scroller = screen.getByTestId("scroller");
    const control = scroller.props.refreshControl as React.ReactElement<{ onRefresh: () => void; refreshing: boolean }>;

    expect(control.type).toBe(RefreshControl);
    expect(control.props).toMatchObject({ onRefresh, refreshing: true });
    expect(scroller.props.className).toBe("flex-1");
    expect(screen.getByText("content")).toBeTruthy();
  });

  it("can wrap another scroll component (the agendas use KeyboardAwareScrollView)", async () => {
    const Custom = jest.fn(({ children }: { children?: React.ReactNode }) => React.createElement(ScrollView, { testID: "custom" }, children));

    await render(React.createElement(RefreshableScrollView, { as: Custom, bottomOffset: 24, onRefresh: jest.fn(), refreshing: false }, React.createElement(Text, null, "x")));

    expect(Custom.mock.calls[0][0]).toMatchObject({ bottomOffset: 24 });
    expect(screen.getByTestId("custom")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run (FAIL); implement the native file**

```tsx
import type { ComponentType } from "react";
import { RefreshControl, ScrollView } from "react-native";
import type { ScrollViewProps } from "react-native";

// `as` wraps another scroll component (KeyboardAwareScrollView on the agendas); extra props reach it untouched.
export type RefreshableScrollViewProps = ScrollViewProps & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  as?: ComponentType<any>;
  onRefresh: () => void | Promise<void>;
  refreshing: boolean;
  [key: string]: unknown;
};

// Native: the platform's own pull-to-refresh, exactly as the screens had it. The web version (RefreshableScrollView.web.tsx) draws its own.
export function RefreshableScrollView({ as: Scroll = ScrollView, onRefresh, refreshing, ...props }: RefreshableScrollViewProps) {
  return <Scroll refreshControl={<RefreshControl onRefresh={onRefresh} refreshing={refreshing} />} {...props} />;
}
```

(The test file is `.ts`: JSX is not allowed there, hence `React.createElement`; the component files are `.tsx`.)

- [ ] **Step 3: Web file** `RefreshableScrollView.web.tsx`

```tsx
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";

import { begin, end, HOLD_OFFSET, idle, move, offset, progress, shouldPreventDefault } from "../../lib/pull-to-refresh";
import type { PullState } from "../../lib/pull-to-refresh";
import type { RefreshableScrollViewProps } from "./RefreshableScrollView";

// Every scrollable ancestor of the touch target, up to the wrapper, must be at its top: a pull never starts or continues mid-scroll,
// also inside a nested scroller. A target with no scrollable ancestor (short content) counts as at the top.
function atTop(target: EventTarget | null, root: HTMLElement): boolean {
  for (let node = target as HTMLElement | null; node && node !== root.parentElement; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);

    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight && node.scrollTop > 0) return false;
    if (node === root) break;
  }

  return true;
}

// Web: react-native-web ignores `refreshControl`, so the pull is drawn here. The listeners are native (React's touch listeners are passive and
// cannot preventDefault, which stops the browser's own overscroll while our pull is active). The decisions live in lib/pull-to-refresh.
export function RefreshableScrollView({ as: Scroll = ScrollView, children, onRefresh, refreshing, style, ...props }: RefreshableScrollViewProps) {
  const root = useRef<View>(null);
  const live = useRef({ onRefresh, refreshing });
  const [pull, setPull] = useState<PullState>(idle);

  live.current = { onRefresh, refreshing };

  useEffect(() => {
    const element = root.current as unknown as HTMLElement | null;

    if (!element) return;
    let state: PullState = idle;
    const set = (next: PullState) => {
      state = next;
      setPull(next);
    };
    const point = (touch: Touch) => ({ x: touch.clientX, y: touch.clientY });
    const onStart = (event: TouchEvent) => set(begin(point(event.touches[0]), { atTop: atTop(event.target, element), refreshing: live.current.refreshing, touches: event.touches.length }));
    const onMove = (event: TouchEvent) => {
      if (state.phase === "idle" || state.phase === "cancelled") return;
      set(move(state, point(event.touches[0]), atTop(event.target, element)));
      if (shouldPreventDefault(state) && event.cancelable) event.preventDefault();
    };
    const onEnd = () => {
      if (end(state).fire) void live.current.onRefresh();
      set(idle);
    };

    element.addEventListener("touchstart", onStart, { passive: true });
    element.addEventListener("touchmove", onMove, { passive: false });
    element.addEventListener("touchend", onEnd, { passive: true });
    element.addEventListener("touchcancel", onEnd, { passive: true });

    return () => {
      element.removeEventListener("touchstart", onStart);
      element.removeEventListener("touchmove", onMove);
      element.removeEventListener("touchend", onEnd);
      element.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const dragging = pull.phase === "pulling";
  const shift = offset(pull, refreshing);
  const ease = dragging ? undefined : { transitionDuration: "200ms", transitionProperty: "transform" };

  return (
    <View ref={root} style={{ flex: 1, overflow: "hidden" }} testID="pull-root">
      <View pointerEvents="none" style={{ alignItems: "center", height: HOLD_OFFSET, justifyContent: "center", left: 0, opacity: progress(pull, refreshing), position: "absolute", right: 0, top: 0 }} testID="pull-indicator">
        <ActivityIndicator />
      </View>
      <View style={[{ flex: 1, transform: [{ translateY: shift }] }, ease as object]}>
        <Scroll {...props} style={[style, { overscrollBehaviorY: "contain" } as object]}>
          {children}
        </Scroll>
      </View>
    </View>
  );
}
```

- [ ] **Step 4:** `npx jest tests/unit/refreshable-scroll-view.test.ts` PASS; `npx tsc --noEmit` (the web file is type-checked with the rest; fix types, never `any` in the library); `npm run lint`. Export from `src/components/ui/index.ts`.
- [ ] **Step 5: Commit** `feat(pull-to-refresh): RefreshableScrollView for native and web`

---

### Task 3: Use it on the five screens

**Files:** the five screens in the File Structure table.

- [ ] **Step 1:** In each customer screen replace
  `<ScrollView className="flex-1" refreshControl={<RefreshControl onRefresh={refresh.onRefresh} refreshing={refresh.refreshing} />}>` ... `</ScrollView>`
  by `<RefreshableScrollView className="flex-1" onRefresh={refresh.onRefresh} refreshing={refresh.refreshing}>` ... `</RefreshableScrollView>`, remove the unused `RefreshControl`/`ScrollView` imports.
- [ ] **Step 2:** In the owner Agenda and `ProfessionalAgenda` replace `<KeyboardAwareScrollView refreshControl={pullToRefresh(pull)} bottomOffset={24} ...>` by `<RefreshableScrollView as={KeyboardAwareScrollView} bottomOffset={24} onRefresh={pull.onRefresh} refreshing={pull.refreshing} ...>` (and the closing tag), dropping the `pullToRefresh` import where it is no longer used.
- [ ] **Step 3:** `npx tsc --noEmit`, `npm run lint`, `npx jest` (the screen tests must still pass: they render these screens on the native path).
- [ ] **Step 4: Commit** `feat(pull-to-refresh): Home, Appointments, Book and the two agendas use RefreshableScrollView`

---

### Task 4: E2E on the web and the screenshot

**Files:** Create `tests/e2e/pull-to-refresh.web.spec.ts`.

- [ ] **Step 1: Spec** (Chromium touch emulation: `test.use({ hasTouch: true, viewport: { height: 844, width: 390 } })`; a helper dispatches `TouchEvent`s on the element under the point with `page.evaluate`, because Playwright's `touchscreen` only taps). Cases: (a) a pull of 140 px at the top of Home triggers a second request of the upcoming-appointments endpoint and shows the spinner (`pull-indicator` opacity 1) while it is pending; (b) a pull of 30 px does not; (c) after scrolling the page down, a pull does not refetch; (d) a plain vertical drag up scrolls the content (scrollTop changes) and is not prevented; (e) a horizontal drag does nothing. Mocks follow `customer-lifecycle.web.spec.ts` (`signInAsCustomer`, `mockCustomerRest`). If Firefox or WebKit cannot construct `TouchEvent`, skip there with `test.skip(browserName !== "chromium", reason)` and say so in the report.
- [ ] **Step 2:** `npm run e2e:export`, then the spec on chromium (system Chrome); then the screenshot at 390 px with the indicator mid-pull into `/tmp` (not committed).
- [ ] **Step 3: Commit** `test(e2e): pull-to-refresh on the web`

---

## Self-review

- Spec coverage: gesture rules (Task 1), native unchanged and web component (Task 2), the five screens (Task 3), e2e and screenshot (Task 4). The rest of the screens that pass `refreshControl={pullToRefresh(pull)}` are a follow-up (non-goal in the spec).
- Types: `PullState`, `begin/move/end/offset/progress` match between Task 1 and the web component; `RefreshableScrollViewProps` is defined once (native file) and imported by the web file.
