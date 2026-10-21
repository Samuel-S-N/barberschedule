import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { openBarberCard } from "./agenda-helpers";
import { appointmentRow, barberId, json, shopId } from "./customer-helpers";

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

// Starts "now" so its shop-local date is today's, the agenda's default day.
function agendaRow(overrides: Record<string, unknown> = {}) {
  const start = new Date();
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  return {
    ...appointmentRow({ ends_at: end.toISOString(), id: "appt-1", occupied_until: end.toISOString(), starts_at: start.toISOString() }),
    barber_name: "Owner Cuts", customer_name: "Ana Customer", customer_phone: "11988887777", ...overrides,
  };
}

// `serves` = the owner has an active barber row linked to their own account.
async function mockOwnerRest(page: Page, serves: boolean, calls: Record<string, unknown> = {}) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/shops")) return json(route, [{ id: shopId }]);
    if (path.endsWith("/rpc/list_owner_barbers")) {
      return json(route, serves ? [{ active: true, archived_at: null, id: barberId, name: "Owner Cuts", shop_id: shopId, user_id: ownerId }] : []);
    }
    if (path.endsWith("/rpc/list_owner_agenda")) return json(route, []);
    if (path.endsWith("/rpc/list_owner_agenda_overrides")) return json(route, []);
    if (path.endsWith("/rpc/get_my_barber_profile")) {
      return json(route, [{ avatar_url: null, bio: null, chair_rental_amount_cents: null, chair_rental_frequency: null, commission_percent: "40.00", compensation_type: "commission", id: barberId, name: "Owner Cuts", shop_id: shopId }]);
    }
    if (path.endsWith("/rpc/list_my_barber_services")) {
      return json(route, [{ active: true, barber_service_id: "bs1", duration_minutes: 30, price_cents: 4000, service_id: "s1", service_name: "Browser Cut" }]);
    }
    if (path.endsWith("/rpc/list_my_barber_agenda")) return json(route, [agendaRow()]);
    if (path.endsWith("/rpc/set_my_appointment_status")) {
      calls.status = route.request().postDataJSON();

      return json(route, [agendaRow({ status: "confirmed" })]);
    }
    if (path.endsWith("/schedule_overrides") && route.request().method() === "GET") return json(route, []);
    await route.abort();
  });
}

test("the Loja | Minha agenda switch only appears while the owner serves as a barber", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, true);
  await page.goto("/agenda");
  await expect(page.getByTestId("agenda-scope-store")).toBeVisible();
  await expect(page.getByTestId("agenda-scope-mine")).toBeVisible();

  const other = await page.context().newPage();

  await signInAsOwner(other);
  await mockOwnerRest(other, false);
  await other.goto("/agenda");
  await expect(other.getByTestId("owner-new-appointment")).toBeVisible();
  await expect(other.getByTestId("agenda-scope-mine")).toHaveCount(0);
});

test("Minha agenda is the barber agenda: Confirmar, pop-up with WhatsApp and Ligar, no booking from free slots", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, true, calls);
  await page.goto("/agenda");
  await page.getByTestId("agenda-scope-mine").click();

  await expect(page).toHaveURL(/\/my-barber-agenda/);
  await expect(page.getByTestId("barber-appointment-appt-1")).toContainText("Ana Customer");
  await page.getByTestId("barber-confirm-appt-1").click();
  await expect.poll(() => calls.status).toEqual({ appointment_id: "appt-1", new_status: "confirmed" });

  await openBarberCard(page);
  await expect(page.getByTestId("barber-sheet")).toBeVisible();
  await expect(page.getByTestId("barber-appt-whatsapp-appt-1")).toBeVisible();
  await expect(page.getByTestId("barber-appt-call-appt-1")).toBeVisible();
  await expect(page.getByTestId("barber-move-appt-1")).toHaveCount(0);
  await expect(page.getByTestId("barber-appointment-customer-appt-1")).not.toHaveAttribute("role", "button");
});

test("the switch leads back to the shop agenda", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, true);
  await page.goto("/my-barber-agenda");
  await expect(page.getByTestId("barber-appointment-appt-1")).toBeVisible();

  await page.getByTestId("agenda-scope-store").click();
  await expect(page).toHaveURL(/\/agenda$/);
  await expect(page.getByTestId("owner-new-appointment")).toBeVisible();
});
