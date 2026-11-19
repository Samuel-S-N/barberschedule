import { expect, test } from "./fixtures";
import type { Page, Route } from "@playwright/test";

import { appointmentRow, json, mockCustomerRest, professionalId, professionalServiceId, shopId, signInAsCustomer } from "./customer-helpers";
import type { RestHandler } from "./customer-helpers";

// Tapping the ACTIVE tab returns its nested stack to the root (professional Profile and Clients, via the tabPress that
// selectTab emits). The customer's Book tab is the exception: a half-made booking is kept, a completed one resets itself.

const professionalUserId = "66666666-6666-4666-8666-666666666666";
const ownerId = "55555555-5555-4555-8555-555555555555";

async function signIn(page: Page, id: string) {
  await page.addInitScript(({ userId }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: userId }))}.`;
    const session = JSON.stringify({ access_token: token, expires_at: now + 3600, expires_in: 3600, refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id: userId } });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { userId: id });
}

const professionalProfile = {
  avatar_url: null, bio: null, chair_rental_amount_cents: null, chair_rental_frequency: null,
  commission_percent: "40.00", compensation_type: "commission", id: professionalId, name: "Browser Professional", shop_id: shopId,
};

async function mockProfessionalRest(page: Page, handler?: RestHandler) {
  await page.route("**/rest/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (handler && (await handler(route, url)) === true) return;
    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Browser Professional", role: "professional", user_id: professionalUserId }]);
    if (path.endsWith("/rpc/get_my_professional_profile")) return json(route, [professionalProfile]);
    if (path.endsWith("/rpc/list_my_professional_services")) {
      return json(route, [{ active: true, professional_service_id: "bs1", duration_minutes: 30, price_cents: 4000, service_id: "s1", service_name: "Browser Cut" }]);
    }
    if (path.endsWith("/rpc/list_my_professional_agenda")) return json(route, []);
    if (path.endsWith("/schedule_overrides") && route.request().method() === "GET") return json(route, []);
    await route.abort();
  });
}

const clientRows = [
  { customer_id: "c1", email: null, full_name: "Ana Souza", has_account: false, is_lapsed: false, last_visit_at: "2026-09-28T15:00:00Z", next_visit_at: null, phone: "11988887777", visits: 5 },
  { customer_id: "c2", email: "bia@x.com", full_name: "Bia Lima", has_account: true, is_lapsed: true, last_visit_at: "2026-07-01T15:00:00Z", next_visit_at: null, phone: null, visits: 2 },
];

const slot = { ends_at: "2026-08-17T12:30:00Z", local_date: "2026-08-17", local_time: "09:00:00", starts_at: "2026-08-17T12:00:00Z" };

// The professional list, the services and the free slot of the customer booking flow (as in booking.web.spec.ts).
const bookingHandler: RestHandler = async (route: Route, url: URL) => {
  if (url.pathname.endsWith("/professional_services")) {
    await json(route, [{ duration_override_minutes: null, id: professionalServiceId, price_override_cents: null, service_id: "service-1", services: { duration_minutes: 30, name: "Browser Cut", price_cents: 4000 } }]);

    return true;
  }
  if (url.pathname.endsWith("/rpc/get_available_slots")) {
    await json(route, [slot]);

    return true;
  }

  return false;
};

test("professional: tapping the active Profile tab inside Settings returns to the Profile hub", async ({ page }) => {
  await signIn(page, professionalUserId);
  await mockProfessionalRest(page);

  await page.goto("/my-profile");
  await page.getByTestId("menu-settings").click();
  await expect(page).toHaveURL(/\/my-profile\/settings/);

  await page.getByTestId("tab-my-profile").click();

  await expect(page).toHaveURL(/\/my-profile$/);
  await expect(page.getByTestId("menu-settings")).toBeVisible();
});

test("professional: tapping the active Clients tab inside a client returns to the list", async ({ page }) => {
  await signIn(page, professionalUserId);
  await mockProfessionalRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/list_my_customers")) return json(route, clientRows).then(() => true);
    if (url.pathname.endsWith("/rpc/get_my_customer")) {
      return json(route, {
        customer: { email: null, full_name: "Ana Souza", has_account: false, id: "c1", phone: "11988887777" },
        history: [], note: null,
        stats: { cancelled: 0, favorite_service: null, last_visit_at: null, next_visit_at: null, no_show: 0, visits: 0 },
      }).then(() => true);
    }
  });

  await page.goto("/clients");
  await page.getByText("Ana Souza").click();
  await expect(page).toHaveURL(/\/clients\/c1/);

  await page.getByTestId("tab-clients").click();

  await expect(page).toHaveURL(/\/clients$/);
  await expect(page.getByText("Bia Lima")).toBeVisible();
});

test("professional: the other tabs still switch (Agenda -> Clients -> Profile)", async ({ page }) => {
  await signIn(page, professionalUserId);
  await mockProfessionalRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/list_my_customers")) return json(route, clientRows).then(() => true);
  });

  await page.goto("/my-agenda");
  await page.getByTestId("tab-clients").click();
  await expect(page).toHaveURL(/\/clients$/);
  await page.getByTestId("tab-my-profile").click();
  await expect(page).toHaveURL(/\/my-profile$/);
});

test("customer: tapping the active Book tab mid-flow leaves the booking where it is", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page, bookingHandler);

  await page.goto("/book");
  await page.getByRole("button", { name: "Browser Professional" }).click();
  await expect(page).toHaveURL(/\/book\/service/);

  await page.getByTestId("tab-book").click();

  await expect(page).toHaveURL(/\/book\/service/);
  await expect(page.getByRole("button", { name: "Browser Cut" })).toBeVisible();
});

test("customer: Book -> Home -> Book resumes the half-made booking; the other tabs are unchanged", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page, bookingHandler);

  await page.goto("/book");
  await page.getByRole("button", { name: "Browser Professional" }).click();
  await page.getByRole("button", { name: "Browser Cut" }).click();
  await expect(page.getByTestId("month-calendar-title")).toBeVisible();

  await page.getByTestId("tab-home").click();
  await expect(page).toHaveURL(/\/home$/);
  await page.getByTestId("tab-book").click();

  // Resumed on the date step it was left on, with the choices still in the URL.
  await expect(page).toHaveURL(/\/book\/date/);
  await expect(page.getByTestId("month-calendar-title")).toBeVisible();

  await page.getByTestId("tab-profile").click();
  await expect(page).toHaveURL(/\/profile$/);
});

test("customer: a completed booking returns to Home and the next visit to Book starts at the first step with nothing chosen", async ({ page }) => {
  let booked = false;

  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/book_appointment")) {
      booked = true;
      await json(route, [appointmentRow()]);

      return true;
    }
    if (url.pathname.endsWith("/appointments")) {
      await json(route, booked ? [appointmentRow()] : []);

      return true;
    }

    return bookingHandler(route, url);
  });

  await page.goto("/book");
  await page.getByRole("button", { name: "Browser Professional" }).click();
  await page.getByRole("button", { name: "Browser Cut" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "09:00" }).click();
  await page.getByTestId("book-time-continue").click();
  await page.getByRole("button", { name: "Confirm booking" }).click();

  await expect(page).toHaveURL(/\/home/);
  await page.getByTestId("tab-book").click();

  // First step (the professional list), no old review/date/time screen, no choice carried over in the URL.
  await expect(page.getByRole("button", { name: "Browser Professional" })).toBeVisible();
  await expect(page).toHaveURL(/\/book\/professional/);
  await expect(page).not.toHaveURL(/professionalServiceId|startsAt|localDate/);
  await expect(page.getByRole("button", { name: "Confirm booking" })).not.toBeVisible();
});

async function mockOwnerRest(page: Page) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Olivia Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/rpc/get_shop_report")) return json(route, { professionals: [], days: [], services: [] });
    if (path.endsWith("/rpc/list_rent_payments")) return json(route, []);
    if (path.endsWith("/rpc/list_owner_agenda")) return json(route, []);
    await route.abort();
  });
}

test("owner: the Manage tab still returns from a Manage screen, and Account from Settings", async ({ page }) => {
  await signIn(page, ownerId);
  await mockOwnerRest(page);

  await page.goto("/manage");
  await page.getByTestId("menu-services").click();
  await expect(page).toHaveURL(/\/services/);
  await page.getByTestId("tab-manage").click();
  await expect(page).toHaveURL(/\/manage/);

  await page.goto("/settings");
  await page.getByTestId("menu-settings").click();
  await expect(page).toHaveURL(/\/owner-profile\/settings/);
  await page.getByTestId("tab-settings").click();
  await expect(page).toHaveURL(/\/settings$/);
});
