import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { openBarberCard } from "./agenda-helpers";
import { appointmentRow, barberId, isHistoryQuery, json, mockCustomerRest, shopId, signInAsCustomer } from "./customer-helpers";
import type { RestHandler } from "./customer-helpers";

const barberUserId = "66666666-6666-4666-8666-666666666666";
const newStart = new Date(Date.now() + 3 * 60 * 60 * 1000);
const slotRow = { ends_at: new Date(newStart.getTime() + 30 * 60 * 1000).toISOString(), local_date: "2026-10-01", local_time: "10:30:00", starts_at: newStart.toISOString() };

type Role = "barber" | "customer";
type Calls = { moves: Array<Record<string, unknown>> };

function barberRow() {
  const start = new Date();
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  return {
    ...appointmentRow({ ends_at: end.toISOString(), id: "appt-1", occupied_until: end.toISOString(), starts_at: start.toISOString() }),
    barber_name: "Browser Barber", customer_name: "Ana Customer",
  };
}

async function signInBarber(page: Page) {
  await page.addInitScript(({ id }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: id }))}.`;
    const session = JSON.stringify({ access_token: token, expires_at: now + 3600, expires_in: 3600, refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id } });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { id: barberUserId });
}

// Opens the reschedule (customer) / move (barber) flow of one appointment. `failMove` makes the database refuse the new time.
async function openFlow(page: Page, role: Role, failMove = false): Promise<Calls> {
  const calls: Calls = { moves: [] };
  const rpc: RestHandler = async (route, url) => {
    const name = url.pathname.split("/rpc/")[1];

    if (name === "get_available_slots") return json(route, [slotRow]).then(() => true);
    if (name === "reschedule_appointment") {
      calls.moves.push(route.request().postDataJSON() as Record<string, unknown>);
      if (failMove) return json(route, { code: "P0001", message: "SLOT_UNAVAILABLE" }, 400).then(() => true);

      return json(route, [appointmentRow()]).then(() => true);
    }
  };

  if (role === "customer") {
    await signInAsCustomer(page);
    await mockCustomerRest(page, async (route, url) => {
      if (url.pathname.endsWith("/appointments")) return json(route, isHistoryQuery(url) ? [] : [appointmentRow()]).then(() => true);

      return rpc(route, url);
    });
    await page.goto("/appointments");
    await page.getByTestId("appointment-card-appointment-upcoming").click();
    await page.getByTestId("appointment-reschedule-appointment-upcoming").click();
  } else {
    await signInBarber(page);
    await page.route("**/rest/v1/**", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;

      if ((await rpc(route, url)) === true) return;
      if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Browser Barber", role: "barber", user_id: barberUserId }]);
      if (path.endsWith("/rpc/get_my_barber_profile")) {
        return json(route, [{ avatar_url: null, bio: null, chair_rental_amount_cents: null, chair_rental_frequency: null, commission_percent: "40.00", compensation_type: "commission", id: barberId, name: "Browser Barber", shop_id: shopId }]);
      }
      if (path.endsWith("/rpc/list_my_barber_services")) return json(route, [{ active: true, barber_service_id: "bs1", duration_minutes: 30, price_cents: 4000, service_id: "s1", service_name: "Browser Cut" }]);
      if (path.endsWith("/rpc/list_my_barber_agenda")) return json(route, [barberRow()]);
      if (path.endsWith("/schedule_overrides") && route.request().method() === "GET") return json(route, []);
      await route.abort();
    });
    await page.goto("/my-agenda");
    await openBarberCard(page);
    await page.getByTestId("barber-move-appt-1").click();
  }

  return calls;
}

for (const role of ["customer", "barber"] as const) {
  const prefix = role === "customer" ? "reschedule" : "move";
  const parent = role === "customer" ? /\/appointments/ : /\/my-agenda/;

  test.describe(`${role} reschedule steps`, () => {
    test("Date › Time › Review with the step bar on top, then confirm", async ({ page }) => {
      const calls = await openFlow(page, role);

      await expect(page.getByTestId("step-label")).toHaveText("Step 1 of 4 · Date");
      await expect(page.getByTestId("month-calendar")).toBeVisible();
      await expect(page.getByTestId(`${prefix}-current`)).toBeVisible();
      await page.getByTestId(`${prefix}-continue`).click();

      await expect(page.getByTestId("step-label")).toHaveText("Step 2 of 4 · Time");
      await expect(page.getByTestId(`${prefix}-continue`)).toBeDisabled();
      await page.getByRole("button", { name: "10:30" }).click();
      await page.getByTestId(`${prefix}-continue`).click();

      await expect(page.getByTestId("step-label")).toHaveText("Step 3 of 4 · Review");
      const summary = page.getByTestId(`${prefix}-summary`);

      await expect(summary).toContainText("Browser Cut");
      await expect(summary).toContainText(role === "customer" ? "Browser Barber" : "Ana Customer");
      await expect(summary).toContainText("Current time");
      await expect(summary).toContainText("New time");
      await page.getByTestId(`${prefix}-confirm`).click();

      await expect.poll(() => calls.moves.length).toBe(1);
      expect(new Date(String(calls.moves[0].new_starts_at)).getTime()).toBe(newStart.getTime());
      await expect(page).toHaveURL(parent);
    });

    test("back goes one step back; on the first step it leaves; a finished step is tappable", async ({ page }) => {
      await openFlow(page, role);
      const back = () => page.locator('[data-testid="back"]:not([aria-hidden="true"] *)').click();

      await page.getByTestId(`${prefix}-continue`).click();
      await page.getByRole("button", { name: "10:30" }).click();
      await page.getByTestId(`${prefix}-continue`).click();
      await expect(page.getByTestId("step-label")).toHaveText("Step 3 of 4 · Review");

      await back();
      await expect(page.getByTestId("step-label")).toHaveText("Step 2 of 4 · Time");
      await page.getByRole("button", { name: "10:30" }).click();
      await page.getByTestId(`${prefix}-continue`).click();
      await page.getByTestId("step-date").click();
      await expect(page.getByTestId("step-label")).toHaveText("Step 1 of 4 · Date");

      await back();
      await expect(page).toHaveURL(parent);
    });

    test("a time taken meanwhile returns to the Time step with the error", async ({ page }) => {
      await openFlow(page, role, true);

      await page.getByTestId(`${prefix}-continue`).click();
      await page.getByRole("button", { name: "10:30" }).click();
      await page.getByTestId(`${prefix}-continue`).click();
      await page.getByTestId(`${prefix}-confirm`).click();

      await expect(page.getByText("That time is no longer available.")).toBeVisible();
      await expect(page.getByTestId("step-label")).toHaveText("Step 2 of 4 · Time");
      await expect(page.getByTestId(`${prefix}-continue`)).toBeDisabled();
    });

    test("keeping the current time leaves without calling the database", async ({ page }) => {
      const calls = await openFlow(page, role);

      await page.getByTestId(`${prefix}-continue`).click();
      await page.getByRole("button", { name: "10:30" }).click();
      await page.getByTestId(`${prefix}-continue`).click();
      await page.getByTestId(`${prefix}-keep`).click();

      await expect(page).toHaveURL(parent);
      expect(calls.moves).toEqual([]);
    });
  });
}
