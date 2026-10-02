import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { appointmentRow, json } from "./customer-helpers";

const ownerId = "55555555-5555-4555-8555-555555555555";

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

// Starts "now" so the shop-local date is today's, the agenda's default day.
const agendaRow = (overrides: Record<string, unknown> = {}) => ({
  ...appointmentRow({ id: "appt-1", starts_at: new Date().toISOString(), ...overrides }),
  barber_name: "Bruno Barber", customer_name: "Ana Customer",
});

async function mockOwnerRest(page: Page, state: { rows: unknown[]; calls: Record<string, unknown>; noOverrides?: boolean }) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/shops")) return json(route, [{ id: "11111111-1111-4111-8111-111111111111" }]);
    if (path.endsWith("/rpc/list_owner_agenda")) return json(route, state.rows);
    if (path.endsWith("/rpc/list_owner_agenda_overrides")) {
      if (state.noOverrides) return json(route, []);

      return json(route, [{ barber_id: "b1", barber_name: "Bruno Barber", end_time: "13:00:00", id: "ov-1", kind: "block", local_date: "2026-10-01", start_time: "12:00:00" }]);
    }
    if (path.endsWith("/rpc/set_owner_appointment_status")) {
      state.calls.status = route.request().postDataJSON();
      return json(route, [agendaRow({ status: "completed" })]);
    }
    if (path.endsWith("/rpc/cancel_appointment")) {
      state.calls.cancel = route.request().postDataJSON();
      return json(route, [agendaRow({ status: "cancelled" })]);
    }
    await route.abort();
  });
}

test("the owner agenda lists appointments and time off with status badges", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, { calls: {}, rows: [agendaRow()] });

  await page.goto("/agenda");
  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
  const card = page.getByTestId("owner-appointment-appt-1");
  await expect(card).toContainText("Ana Customer");
  await expect(card).toContainText("Bruno Barber");
  await expect(card).toContainText("Scheduled");
  await expect(page.getByTestId("owner-override-ov-1")).toContainText("12:00–13:00");
});

test("the owner completes and cancels from the agenda", async ({ page }) => {
  const state = { calls: {} as Record<string, unknown>, rows: [agendaRow()] };

  await signInAsOwner(page);
  await mockOwnerRest(page, state);

  await page.goto("/agenda");
  await page.getByTestId("owner-complete-appt-1").click();
  await expect.poll(() => state.calls.status).toEqual({ appointment_id: "appt-1", new_status: "completed" });

  await page.getByTestId("owner-cancel-appt-1").click();
  await expect.poll(() => state.calls.cancel).toEqual({ appointment_id: "appt-1" });
});

test("an empty range shows the empty state and the new-appointment button opens the form", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, { calls: {}, noOverrides: true, rows: [] });

  await page.goto("/agenda");
  await expect(page.getByText("No appointments in this range.")).toBeVisible();
  await page.getByTestId("owner-new-appointment").click();
  await expect(page).toHaveURL(/\/appointment-form/);
});
