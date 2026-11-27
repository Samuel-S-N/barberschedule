import { useEffect, useRef, useState } from "react";
import type { ComponentRef } from "react";
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
  const root = useRef<ComponentRef<typeof View>>(null);
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
