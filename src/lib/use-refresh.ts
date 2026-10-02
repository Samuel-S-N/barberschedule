import { useQueryClient } from "@tanstack/react-query";
import { createElement, useState } from "react";
import { RefreshControl } from "react-native";

export function useRefresh(refetchers: Array<() => Promise<unknown>>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled(refetchers.map((refetch) => refetch()));
    } finally {
      setRefreshing(false);
    }
  };

  return { onRefresh, refreshing };
}

// Pull-to-refresh for a whole screen: refetches every query that is currently on screen (inactive ones stay cached).
export function useRefreshAll() {
  const queryClient = useQueryClient();

  return useRefresh([() => queryClient.invalidateQueries()]);
}

// The `refreshControl` prop of a ScrollView, from useRefresh/useRefreshAll.
export function pullToRefresh(refresh: ReturnType<typeof useRefresh>) {
  return createElement(RefreshControl, { onRefresh: refresh.onRefresh, refreshing: refresh.refreshing });
}
