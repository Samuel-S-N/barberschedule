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
