import { expect, test } from "@playwright/test";

import { json, mockCustomerRest, signInAsCustomer } from "./customer-helpers";

const notification = (overrides: Record<string, unknown> = {}) => ({
  appointment_id: "a1",
  created_at: "2026-10-20T10:00:00Z",
  id: "n1",
  kind: "appointment_confirmed",
  params: { barber_name: "Browser Barber", customer_name: "Ana", service_name: "Browser Cut", starts_at: "2026-10-21T13:00:00Z" },
  read_at: null,
  ...overrides,
});

test("the bell shows the unread count, opens the list, marks as read and opens the agenda", async ({ page }) => {
  const calls: unknown[] = [];
  let unread = 2;

  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/count_unread_notifications")) return json(route, unread), true;
    if (url.pathname.endsWith("/rpc/mark_notifications_read")) {
      calls.push(route.request().postDataJSON());
      unread = 0;

      return json(route, 1), true;
    }
    if (url.pathname.endsWith("/notifications")) return json(route, [notification(), notification({ id: "n2", kind: "appointment_cancelled", read_at: "2026-10-20T11:00:00Z" })]), true;
    if (url.pathname.endsWith("/appointments")) return json(route, []), true;
  });

  await page.goto("/home");
  await expect(page.getByTestId("notification-badge")).toHaveText("2");

  await page.getByTestId("notification-bell").click();
  await expect(page).toHaveURL(/\/notifications/);
  await expect(page.getByTestId("notification-n1")).toContainText("Appointment confirmed");
  await expect(page.getByTestId("notification-n1")).toContainText("Browser Cut with Browser Barber");
  await expect(page.getByTestId("notification-unread-n1")).toBeVisible();
  await expect(page.getByTestId("notification-n2")).toContainText("Appointment cancelled");

  await page.getByTestId("notification-n1").click();
  await expect.poll(() => calls).toEqual([{ target_ids: ["n1"] }]);
  await expect(page).toHaveURL(/\/appointments/);
});

test("the owner bell opens the owner's own notifications screen and back returns to the agenda", async ({ page }) => {
  const ownerId = "55555555-5555-4555-8555-555555555555";

  await page.addInitScript(({ id }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: id }))}.`;
    const session = JSON.stringify({ access_token: token, expires_at: now + 3600, expires_in: 3600, refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id } });
    localStorage.setItem("sb-example-auth-token", session);
  }, { id: ownerId });
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/rpc/count_unread_notifications")) return json(route, 1);
    if (path.endsWith("/notifications")) return json(route, [notification({ id: "n9", kind: "appointment_awaiting_confirmation" })]);
    if (path.endsWith("/shops")) return json(route, [{ id: "11111111-1111-4111-8111-111111111111" }]);
    if (path.endsWith("/rpc/list_owner_agenda") || path.endsWith("/rpc/list_owner_agenda_overrides")) return json(route, []);
    await route.abort();
  });

  await page.goto("/agenda");
  await page.getByTestId("notification-bell").click();
  await expect(page).toHaveURL(/\/owner-notifications/);
  await expect(page.getByTestId("notification-n9")).toContainText("Awaiting confirmation");
  await expect(page.getByTestId("tab-agenda")).toHaveAttribute("aria-selected", "true");
  await page.locator('[data-testid="back"]:not([aria-hidden="true"] *)').click();
  await expect(page).toHaveURL(/\/agenda/);
});

test("the bell sits at the top-right with the title on a line below it", async ({ page }) => {
  await page.setViewportSize({ height: 700, width: 375 });
  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/count_unread_notifications")) return json(route, 0), true;
    if (url.pathname.endsWith("/appointments")) return json(route, []), true;
  });

  await page.goto("/home");
  const bell = await page.getByTestId("notification-bell").boundingBox();
  const title = await page.getByRole("heading").first().boundingBox();

  expect(bell && title).toBeTruthy();
  expect(bell!.x + bell!.width).toBeGreaterThan(375 - 40); // right edge
  expect(bell!.y + bell!.height).toBeLessThanOrEqual(title!.y + 2); // above the title, not beside it
});
