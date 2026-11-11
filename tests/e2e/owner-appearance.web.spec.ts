import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { deriveTheme } from "../../src/lib/design/theme/derive";
import { json } from "./customer-helpers";

const ownerId = "55555555-5555-4555-8555-555555555555";
const shop = "11111111-1111-4111-8111-111111111111";

type Theme = { theme_accent: string | null; theme_base: string | null; theme_primary: string | null };

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
const background = (page: Page, testId: string) => page.getByTestId(testId).evaluate((node) => getComputedStyle(node).backgroundColor);

async function signInAsOwner(page: Page) {
  await page.addInitScript(({ id }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: id }))}.`;
    const session = JSON.stringify({ access_token: token, expires_at: now + 3600, expires_in: 3600, refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id } });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { id: ownerId });
}

async function mockRest(page: Page, theme: Theme, patches: Theme[]) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/shops") && method === "GET") return json(route, [{ address: null, id: shop, name: "Shop", phone: null, whatsapp: null, ...theme }]);
    if (path.endsWith("/shops") && method === "PATCH") {
      const body = route.request().postDataJSON() as Theme;
      patches.push(body);
      Object.assign(theme, body);

      return json(route, null);
    }
    await route.abort();
  });
}

test("the owner previews, saves and resets the shop colours; the whole app, pop-ups included, follows", async ({ page }) => {
  const theme: Theme = { theme_accent: null, theme_base: "#EEF3F8", theme_primary: "#2F6FDB" };
  const patches: Theme[] = [];

  await signInAsOwner(page);
  await mockRest(page, theme, patches);
  await page.goto("/appearance");

  const saved = deriveTheme({ base: "#EEF3F8", primary: "#2F6FDB" }).colors;

  // The saved shop theme is applied on load: the action button follows the primary colour (no accent chosen).
  await expect(page.getByTestId("appearance-save")).toBeVisible();
  await expect.poll(() => background(page, "appearance-save")).toBe(rgb(saved.accent));

  // Typing a new primary changes the preview only; the Save button (outside the preview) keeps the saved colour.
  await page.getByTestId("appearance-primary-input").fill("#7A1F2B");
  const previewAction = page.getByTestId("theme-preview").getByRole("button", { name: "Book" });

  await expect.poll(() => previewAction.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(rgb("#7A1F2B"));
  await expect.poll(() => background(page, "appearance-save")).toBe(rgb(saved.accent));

  // Saving sends the three columns and repaints the real screen.
  await page.getByTestId("appearance-save").click();
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0]).toEqual({ theme_accent: null, theme_base: "#EEF3F8", theme_primary: "#7A1F2B" });
  await expect.poll(() => background(page, "appearance-save")).toBe(rgb("#7A1F2B"));

  // The confirmation pop-up is a Modal (portalled to document.body): it must carry the shop colours too.
  const next = deriveTheme({ base: "#EEF3F8", primary: "#7A1F2B" }).colors;

  await page.getByTestId("appearance-reset").click();
  await expect(page.getByTestId("confirm-dialog")).toBeVisible();
  await expect.poll(() => background(page, "confirm-dialog")).toBe(rgb(next.surface));
  expect(rgb(next.surface)).not.toBe("rgb(255, 253, 250)");
  await expect.poll(() => page.getByTestId("confirm-dialog-cancel").evaluate((node) => getComputedStyle(node.querySelector("*") ?? node).color)).toBe(rgb(next.primary[600]));

  // Resetting clears the three columns and the app goes back to the Zenc default.
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect.poll(() => patches.length).toBe(2);
  expect(patches[1]).toEqual({ theme_accent: null, theme_base: null, theme_primary: null });
  await expect.poll(() => background(page, "appearance-save")).toBe("rgb(219, 154, 52)");
});

test("an invalid colour code is explained and cannot be saved", async ({ page }) => {
  const theme: Theme = { theme_accent: null, theme_base: null, theme_primary: null };

  await signInAsOwner(page);
  await mockRest(page, theme, []);
  await page.goto("/appearance");
  await page.getByTestId("appearance-primary-input").fill("blue");

  await expect(page.getByText("Use 6 digits, like #2F6FDB.")).toBeVisible();
  await expect(page.getByTestId("appearance-save")).toHaveAttribute("aria-disabled", "true");
});
