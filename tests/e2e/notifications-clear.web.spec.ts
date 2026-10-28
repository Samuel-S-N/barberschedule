import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { json, mockCustomerRest, signInAsCustomer } from "./customer-helpers";

const notification = (id: string, overrides: Record<string, unknown> = {}) => ({
  appointment_id: "a1",
  created_at: "2026-10-20T10:00:00Z",
  id,
  kind: "appointment_confirmed",
  params: { barber_name: "Browser Barber", customer_name: "Ana", service_name: "Browser Cut", starts_at: "2026-10-21T13:00:00Z" },
  read_at: "2026-10-20T11:00:00Z",
  ...overrides,
});

async function openInbox(page: Page, start: unknown[]) {
  const deletes: unknown[] = [];
  let rows = start;

  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/count_unread_notifications")) return json(route, 0), true;
    if (url.pathname.endsWith("/rpc/delete_notifications")) {
      const body = route.request().postDataJSON() as { target_ids: string[] | null };

      deletes.push(body);
      rows = body.target_ids ? rows.filter((row) => !body.target_ids?.includes((row as { id: string }).id)) : [];

      return json(route, 1), true;
    }
    if (url.pathname.endsWith("/notifications")) return json(route, rows), true;
    if (url.pathname.endsWith("/appointments")) return json(route, []), true;
  });
  await page.goto("/notifications");

  return deletes;
}

test("the X at the top right asks for confirmation and clears every notification", async ({ page }) => {
  await page.setViewportSize({ height: 760, width: 375 });
  const deletes = await openInbox(page, [notification("n1"), notification("n2")]);

  await expect(page.getByTestId("notification-n1")).toBeVisible();
  const box = (await page.getByTestId("notifications-clear").boundingBox())!;
  const viewport = page.viewportSize()!;

  expect(viewport.width - (box.x + box.width)).toBeLessThan(40);
  expect(box.y).toBeLessThan(120);

  await page.getByTestId("notifications-clear").click();
  await expect(page.getByTestId("confirm-dialog")).toBeVisible();
  await page.getByTestId("confirm-dialog-cancel").click();
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  expect(deletes).toEqual([]);

  await page.getByTestId("notifications-clear").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect.poll(() => deletes).toEqual([{ target_ids: null }]);
  await expect(page.getByText("No notifications yet")).toBeVisible();
  await expect(page.getByTestId("notifications-clear")).toHaveCount(0);
});

test("holding a notification opens a pop-up to delete just that one", async ({ page }) => {
  const deletes = await openInbox(page, [notification("n1"), notification("n2")]);
  const card = page.getByTestId("notification-n1");

  await card.waitFor();
  const box = (await card.boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();

  await expect(page.getByTestId("notification-sheet")).toBeVisible();
  await expect(page).toHaveURL(/\/notifications/);
  await page.getByTestId("notification-sheet-delete").click();
  await expect.poll(() => deletes).toEqual([{ target_ids: ["n1"] }]);
  await expect(page.getByTestId("notification-n1")).toHaveCount(0);
  await expect(page.getByTestId("notification-n2")).toBeVisible();
});

test("tapping outside the notification pop-up closes it and deletes nothing", async ({ page }) => {
  const deletes = await openInbox(page, [notification("n1")]);
  const card = page.getByTestId("notification-n1");

  await card.waitFor();
  const box = (await card.boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await expect(page.getByTestId("notification-sheet")).toBeVisible();
  await page.mouse.click(5, 5);

  await expect(page.getByTestId("notification-sheet")).toHaveCount(0);
  expect(deletes).toEqual([]);
});
