import { useRouter } from "expo-router";

// A cold start or web refresh on an inner screen has no history to go back to, so fall back to the screen's own hub
// (default: the customer profile tab).
export function useBack(fallback = "/profile") {
  const router = useRouter();

  return () => (router.canGoBack() ? router.back() : router.replace(fallback as never));
}
