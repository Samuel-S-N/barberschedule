import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { appointmentRow, barberId, json, shopId } from "./customer-helpers";
import type { RestHandler } from "./customer-helpers";

const barberUserId = "66666666-6666-4666-8666-666666666666";
const ownerUserId = "77777777-7777-4777-8777-777777777777";

async function signIn(page: Page, userId: string) {
  await page.addInitScript(({ id }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: id }))}.`;
    const session = JSON.stringify({
      access_token: token, expires_at: now + 3600, expires_in: 3600,
      refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id },
    });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { id: userId });
}

const commissionProfile = {
  avatar_url: null, bio: "Fade specialist", chair_rental_amount_cents: null, chair_rental_frequency: null,
  commission_percent: "40.00", compensation_type: "commission", id: barberId, name: "Browser Barber", shop_id: shopId,
};

// Appointment starts "now", so its shop-local date is always today's (the agenda's default day).
function agendaRow(overrides: Record<string, unknown> = {}) {
  const start = new Date();
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  return {
    ...appointmentRow({ ends_at: end.toISOString(), id: "appt-1", occupied_until: end.toISOString(), starts_at: start.toISOString() }),
    barber_name: "Browser Barber", customer_name: "Ana Customer", ...overrides,
  };
}

async function mockBarberRest(page: Page, handler?: RestHandler) {
  await page.route("**/rest/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (handler && (await handler(route, url)) === true) return;
    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Browser Barber", role: "barber", user_id: barberUserId }]);
    if (path.endsWith("/rpc/get_my_barber_profile")) return json(route, [commissionProfile]);
    if (path.endsWith("/rpc/list_my_barber_services")) {
      return json(route, [{ active: true, barber_service_id: "bs1", duration_minutes: 30, price_cents: 4000, service_id: "s1", service_name: "Browser Cut" }]);
    }
    if (path.endsWith("/rpc/list_my_barber_agenda")) return json(route, [agendaRow()]);
    if (path.endsWith("/schedule_overrides") && route.request().method() === "GET") return json(route, []);
    await route.abort();
  });
}

test("a barber lands on their own agenda and marks an appointment completed", async ({ page }) => {
  let agendaPayload: Record<string, unknown> | null = null;
  let statusPayload: Record<string, unknown> | null = null;

  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/list_my_barber_agenda")) {
      agendaPayload = route.request().postDataJSON() as Record<string, unknown>;
      return json(route, [agendaRow()]).then(() => true);
    }
    if (url.pathname.endsWith("/rpc/set_my_appointment_status")) {
      statusPayload = route.request().postDataJSON() as Record<string, unknown>;
      return json(route, [agendaRow({ status: "completed" })]).then(() => true);
    }
  });

  await page.goto("/");
  await expect(page).toHaveURL(/\/my-agenda/);
  await expect(page.getByRole("heading", { name: "My agenda" })).toBeVisible();
  await expect(page.getByText("Ana Customer · Browser Cut")).toBeVisible();
  expect(Object.keys(agendaPayload ?? {}).sort()).toEqual(["page_limit", "page_offset", "range_end", "range_start"]);

  await page.getByTestId("barber-complete-appt-1").click();
  await expect(page.getByText("Appointment updated.")).toBeVisible();
  expect(statusPayload).toEqual({ appointment_id: "appt-1", new_status: "completed" });
});

test("a barber blocks a whole day and it is sent as a block for their own barber row", async ({ page }) => {
  let insertPayload: Record<string, unknown> | null = null;

  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route) => {
    if (route.request().method() === "POST" && new URL(route.request().url()).pathname.endsWith("/schedule_overrides")) {
      insertPayload = route.request().postDataJSON() as Record<string, unknown>;
      return json(route, { barber_id: barberId, end_time: null, id: "o1", kind: "block", local_date: "2026-10-01", shop_id: shopId, start_time: null }, 201).then(() => true);
    }
  });

  await page.goto("/my-agenda");
  await page.getByTestId("barber-block-add").click();
  await expect(page.getByText("Time off added.")).toBeVisible();
  expect(insertPayload).toMatchObject({ barber_id: barberId, kind: "block", shop_id: shopId, start_time: null, end_time: null });
});

test("a barber sees commission earnings computed from completed services", async ({ page }) => {
  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/get_my_barber_earnings")) {
      return json(route, [
        { completed_count: 2, gross_cents: 10000, service_id: "s1", service_name_snapshot: "Browser Cut" },
        { completed_count: 1, gross_cents: 3000, service_id: "s2", service_name_snapshot: "Beard" },
      ]).then(() => true);
    }
  });

  await page.goto("/earnings");
  await expect(page.getByRole("heading", { name: "Earnings" })).toBeVisible();
  await expect(page.getByTestId("stat-completed")).toContainText("3");
  await expect(page.getByTestId("stat-gross")).toContainText("R$ 130,00");
  await expect(page.getByTestId("stat-earned")).toContainText("R$ 52,00");
  await expect(page.getByTestId("stat-rent")).toHaveCount(0);
  await expect(page.getByText("2 × Browser Cut")).toBeVisible();
});

test("a chair-rental barber keeps the full gross and sees the rent separately", async ({ page }) => {
  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/get_my_barber_profile")) {
      return json(route, [{ ...commissionProfile, chair_rental_amount_cents: 30000, chair_rental_frequency: "monthly", commission_percent: "0.00", compensation_type: "chair_rental" }]).then(() => true);
    }
    if (url.pathname.endsWith("/rpc/get_my_barber_earnings")) {
      return json(route, [{ completed_count: 2, gross_cents: 10000, service_id: "s1", service_name_snapshot: "Browser Cut" }]).then(() => true);
    }
  });

  await page.goto("/earnings");
  await expect(page.getByTestId("stat-earned")).toContainText("R$ 100,00");
  await expect(page.getByTestId("stat-rent")).toContainText("R$ 300,00");
});

test("a barber edits their profile and reads how they are paid", async ({ page }) => {
  let profilePayload: Record<string, unknown> | null = null;

  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/update_my_barber_profile")) {
      profilePayload = route.request().postDataJSON() as Record<string, unknown>;
      return json(route, [{ avatar_url: null, bio: "New bio", id: barberId }]).then(() => true);
    }
  });

  await page.goto("/my-profile");
  await expect(page.getByTestId("barber-compensation")).toContainText("Commission: 40%");
  await expect(page.getByText("Browser Cut")).toBeVisible();
  await page.getByTestId("barber-bio").fill("New bio");
  await page.getByTestId("barber-save").click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  expect(profilePayload).toEqual({ new_avatar_url: null, new_bio: "New bio" });
});

test("a barber cannot open the owner or customer areas", async ({ page }) => {
  await signIn(page, barberUserId);
  await mockBarberRest(page);

  await page.goto("/agenda");
  await expect(page).toHaveURL(/\/my-agenda/);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/my-agenda/);
});

test("an owner invites a barber and sets a chair-rental compensation", async ({ page }) => {
  let invitePayload: Record<string, unknown> | null = null;
  let compensationPayload: Record<string, unknown> | null = null;

  await signIn(page, ownerUserId);
  await page.route("**/functions/v1/invite-barber", async (route) => {
    invitePayload = route.request().postDataJSON() as Record<string, unknown>;
    await json(route, { userId: "new-user" });
  });
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ role: "owner", user_id: ownerUserId }]);
    if (path.endsWith("/shops")) return json(route, [{ id: shopId }]);
    if (path.endsWith("/rpc/list_owner_barbers")) {
      return json(route, [{ active: true, archived_at: null, commission_percent: "0.00", compensation_type: "commission", id: barberId, name: "Browser Barber", shop_id: shopId, user_id: null }]);
    }
    if (path.endsWith("/rpc/set_barber_compensation")) {
      compensationPayload = route.request().postDataJSON() as Record<string, unknown>;
      return json(route, [{ chair_rental_amount_cents: 30000, chair_rental_frequency: "weekly", commission_percent: 0, compensation_type: "chair_rental", id: barberId }]);
    }
    await route.abort();
  });

  await page.goto("/barbers");
  await expect(page.getByText("Account: not invited")).toBeVisible();
  await page.getByRole("button", { name: "Invite to sign in" }).click();
  await page.getByPlaceholder("Barber email").fill("new.barber@example.com");
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText("Invite sent.")).toBeVisible();
  expect(invitePayload).toEqual({ barberId, email: "new.barber@example.com" });

  await page.getByRole("button", { name: "Compensation" }).click();
  await page.getByRole("button", { name: "Chair rental", exact: true }).click();
  await page.getByPlaceholder("Chair rent in cents").fill("30000");
  await page.getByRole("button", { name: "per week" }).click();
  await page.getByRole("button", { name: "Save compensation" }).click();
  await expect(page.getByText("Compensation saved.")).toBeVisible();
  expect(compensationPayload).toEqual({
    new_commission_percent: null, new_rental_amount_cents: 30000, new_rental_frequency: "weekly",
    new_type: "chair_rental", target_barber_id: barberId,
  });
});
