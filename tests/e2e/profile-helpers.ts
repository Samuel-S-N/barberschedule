import type { Page } from "@playwright/test";

export const HUB_ORDER = ["install-card", "profile-avatar", "menu-account", "menu-security", "menu-settings", "menu-privacy", "menu-about"];

// The shared hub elements, in the order they appear on the page (role-specific blocks are not listed, so they cannot break the comparison).
export async function hubOrder(page: Page): Promise<string[]> {
  return page.evaluate((keys) => {
    const found = keys.map((key) => ({ element: document.querySelector(`[data-testid="${key}"]`), key })).filter((item) => item.element);

    return found
      .sort((a, b) => (a.element!.compareDocumentPosition(b.element!) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      .map((item) => item.key);
  }, HUB_ORDER);
}
