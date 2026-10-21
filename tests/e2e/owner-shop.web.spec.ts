import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { json } from "./customer-helpers";

const ownerId = "55555555-5555-4555-8555-555555555555";
const shop = "11111111-1111-4111-8111-111111111111";

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

async function mockOwnerRest(page: Page, calls: Record<string, unknown>) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/shops") && method === "GET") return json(route, [{ address: "Rua A, 10", id: shop, name: "Shop", phone: "1133334444", whatsapp: null }]);
    if (path.endsWith("/shops") && method === "PATCH") {
      calls.contact = route.request().postDataJSON();

      return json(route, null);
    }
    if (path.endsWith("/shop_hours")) {
      // Monday 09:00-12:00 and 14:00-18:00 (a 12:00-14:00 break); every other day closed.
      return json(route, [
        { end_time: "12:00:00", start_time: "09:00:00", weekday: 1 },
        { end_time: "18:00:00", start_time: "14:00:00", weekday: 1 },
      ]);
    }
    if (path.endsWith("/rpc/list_owner_barbers")) {
      return json(route, [
        { active: true, archived_at: null, commission_percent: "0.00", compensation_type: "commission", id: "b1", name: "Ana", shop_id: shop, user_id: null },
        { active: true, archived_at: null, commission_percent: "0.00", compensation_type: "commission", id: "b2", name: "Bruno", shop_id: shop, user_id: null },
      ]);
    }
    if (path.endsWith("/rpc/list_owner_schedule_overrides") || (path.endsWith("/schedule_overrides") && method === "GET")) {
      return json(route, (calls.overrides as unknown[] | undefined) ?? []);
    }
    if (path.endsWith("/schedule_overrides") && method === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      (calls.inserts as unknown[] | undefined)?.push(body);

      return json(route, { ...body, id: `o-${(calls.inserts as unknown[]).length}` }, 201);
    }
    if (path.endsWith("/schedule_overrides") && method === "DELETE") {
      (calls.deletes as unknown[] | undefined)?.push(new URL(route.request().url()).search);

      return json(route, null, 204);
    }
    if (path.endsWith("/rpc/set_shop_hours")) {
      calls.hours = route.request().postDataJSON();

      return json(route, null);
    }
    await route.abort();
  });
}

test("the shop screen shows contact info and the weekly hours with breaks", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, {});

  await page.goto("/shop");
  await expect(page.getByTestId("shop-address")).toHaveValue("Rua A, 10");
  await expect(page.getByTestId("shop-day-1")).toContainText("Open");
  await expect(page.getByTestId("shop-day-2")).toContainText("Closed");
  await expect(page.getByTestId("shop-day-1").getByTestId("shop-break-start-1-0")).toHaveValue("12:00");
});

test("saving writes the contact and turns a break into two periods", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);

  await page.goto("/shop");
  await expect(page.getByTestId("shop-address")).toHaveValue("Rua A, 10");
  await expect(page.getByTestId("shop-day-1")).toBeVisible();
  await page.getByTestId("shop-phone").fill("1155556666");
  await page.getByTestId("shop-save").click();

  await expect(page.getByText("Shop details saved.")).toBeVisible();
  expect(calls.contact).toEqual({ address: "Rua A, 10", phone: "1155556666", whatsapp: null });
  expect(calls.hours).toEqual({ p_periods: [{ end: "12:00", start: "09:00", weekday: 1 }, { end: "18:00", start: "14:00", weekday: 1 }] });
});

test("an invalid time is explained and nothing is saved", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);

  await page.goto("/shop");
  await page.getByTestId("shop-start-1").fill("9am");
  await page.getByTestId("shop-save").click();

  await expect(page.getByText("Use the HH:mm format.")).toBeVisible();
  expect(calls.hours).toBeUndefined();
});

test("a day can be opened and a break added", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, {});

  await page.goto("/shop");
  await page.getByTestId("shop-open-2").click();
  await expect(page.getByTestId("shop-day-2")).toContainText("Open");
  await page.getByTestId("shop-add-break-2").click();
  await expect(page.getByTestId("shop-break-start-2-0")).toHaveValue("12:00");
});

test("a day's hours can be copied to every other day or to Monday-Friday", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, {});

  await page.goto("/shop");
  await expect(page.getByTestId("shop-day-1")).toBeVisible();
  await page.getByTestId("shop-copy-weekdays-1").click();
  for (const weekday of [2, 3, 4, 5]) {
    await expect(page.getByTestId(`shop-day-${weekday}`)).toContainText("Open");
    await expect(page.getByTestId(`shop-start-${weekday}`)).toHaveValue("09:00");
    await expect(page.getByTestId(`shop-break-start-${weekday}-0`)).toHaveValue("12:00");
  }
  await expect(page.getByTestId("shop-day-6")).toContainText("Closed");

  await page.getByTestId("shop-copy-all-1").click();
  await expect(page.getByTestId("shop-day-7")).toContainText("Open");
});

test("the owner closes the shop on a date for every active barber and reopens it", async ({ page }) => {
  const date = "2099-12-25";
  const calls: Record<string, unknown> = { deletes: [], inserts: [] };

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);

  await page.goto("/shop");
  await expect(page.getByText("No closed dates.")).toBeVisible();
  await page.getByTestId("shop-closed-date").fill("");
  await page.getByTestId("shop-closed-date").pressSequentially("20991225");
  await page.getByTestId("shop-closed-add").click();

  await expect.poll(() => calls.inserts).toMatchObject([
    { barber_id: "b1", kind: "block", local_date: date, start_time: null },
    { barber_id: "b2", kind: "block", local_date: date, start_time: null },
  ]);
});

test("a date closed for every barber is listed and can be reopened", async ({ page }) => {
  const date = "2099-12-25";
  const row = (id: string, barberId: string) => ({ barber_id: barberId, end_time: null, id, kind: "block", local_date: date, shop_id: shop, start_time: null });
  const calls: Record<string, unknown> = { deletes: [], inserts: [], overrides: [row("o1", "b1"), row("o2", "b2")] };

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);

  await page.goto("/shop");
  await expect(page.getByTestId(`shop-closed-${date}`)).toContainText("2099-12-25");
  await page.getByTestId(`shop-reopen-${date}`).click();
  await expect.poll(() => (calls.deletes as string[]).length).toBe(2);
});
