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
