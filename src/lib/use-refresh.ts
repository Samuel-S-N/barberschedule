import { useState } from "react";

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
