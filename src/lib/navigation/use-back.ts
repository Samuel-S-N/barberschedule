import { useRouter } from "expo-router";

// A cold start or web refresh on an inner screen has no history to go back to, so fall back to the profile tab.
export function useBack() {
  const router = useRouter();

  return () => (router.canGoBack() ? router.back() : router.replace("/profile"));
}
