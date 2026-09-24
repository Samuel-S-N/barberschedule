import { expect, test } from "@playwright/test";

import {
  appointmentRow, customerRow, isHistoryQuery, json, mockCustomerRest, signInAsCustomer,
} from "./customer-helpers";

test("the home tab greets the customer and shows the next appointment", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/appointments")) {
      await json(route, isHistoryQuery(url) ? [] : [appointmentRow()]);
      return true;
    }
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hi, Browser" })).toBeVisible();
  await expect(page.getByTestId("home-next-appointment")).toBeVisible();

  await page.getByTestId("tab-appointments").click();
  await expect(page).toHaveURL(/\/appointments$/);
  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
});

test("the agenda marks the appointment day and lets a customer cancel with confirmation", async ({ page }) => {
  let cancelPayload: Record<string, unknown> | null = null;
  let cancelled = false;

  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/appointments")) {
      await json(route, cancelled || isHistoryQuery(url) ? [] : [appointmentRow()]);
      return true;
    }
    if (url.pathname.endsWith("/rpc/cancel_appointment")) {
      cancelPayload = route.request().postDataJSON() as Record<string, unknown>;
      cancelled = true;
      await json(route, [appointmentRow({ status: "cancelled" })]);
      return true;
    }
  });

  await page.goto("/appointments");
  await expect(page.locator(`[data-testid^="calendar-strip-day-"][data-testid$="-dot"]`).first()).toBeVisible();
  await expect(page.getByTestId("appointment-card-appointment-upcoming")).toBeVisible();

  await page.getByTestId("appointment-card-appointment-upcoming").click();
  await page.getByTestId("appointment-cancel-appointment-upcoming").click();
  await expect(page.getByTestId("appointment-cancel-confirm-appointment-upcoming")).toBeVisible();
  expect(cancelPayload).toBeNull();

  await page.getByTestId("appointment-cancel-confirm-appointment-upcoming").click();
  await expect(page.getByText("Appointment cancelled.")).toBeVisible();
  expect(cancelPayload).toEqual({ appointment_id: "appointment-upcoming" });
});

test("changes are disabled with an explanation inside the 90-minute cutoff", async ({ page }) => {
  const soon = new Date(Date.now() + 30 * 60 * 1000);
  const soonRow = appointmentRow({ ends_at: soon.toISOString(), occupied_until: soon.toISOString(), starts_at: soon.toISOString() });

  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/appointments")) {
      await json(route, isHistoryQuery(url) ? [] : [soonRow]);
      return true;
    }
  });

  await page.goto("/appointments");
  await page.getByTestId("appointment-card-appointment-upcoming").click();

  await expect(page.getByText("Changes are only allowed until 90 minutes before the start.")).toBeVisible();
  await expect(page.getByTestId("appointment-reschedule-appointment-upcoming")).toBeDisabled();
  await expect(page.getByTestId("appointment-cancel-appointment-upcoming")).toBeDisabled();
});

test("the history segment lists past appointments", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/appointments")) {
      await json(route, isHistoryQuery(url) ? [appointmentRow({ id: "appointment-history", status: "completed" })] : []);
      return true;
    }
  });

  await page.goto("/appointments");
  await page.getByTestId("agenda-segment-history").click();

  await expect(page.getByTestId("appointment-card-appointment-history")).toBeVisible();
  await expect(page.getByText("Completed")).toBeVisible();
});

test("a customer can reschedule by picking a new date and time", async ({ page }) => {
  let reschedulePayload: Record<string, unknown> | null = null;
  const newStart = new Date(Date.now() + 6 * 24 * 3600 * 1000);
  newStart.setUTCMinutes(0, 0, 0);

  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/appointments")) {
      await json(route, isHistoryQuery(url) ? [] : [appointmentRow()]);
      return true;
    }
    if (url.pathname.endsWith("/rpc/get_available_slots")) {
      const end = new Date(newStart.getTime() + 30 * 60 * 1000);
      await json(route, [{ ends_at: end.toISOString(), local_date: "2099-01-01", local_time: "10:00:00", starts_at: newStart.toISOString() }]);
      return true;
    }
    if (url.pathname.endsWith("/rpc/reschedule_appointment")) {
      reschedulePayload = route.request().postDataJSON() as Record<string, unknown>;
      await json(route, [appointmentRow({ starts_at: newStart.toISOString() })]);
      return true;
    }
  });

  await page.goto("/appointments");
  await page.getByTestId("appointment-card-appointment-upcoming").click();
  await page.getByTestId("appointment-reschedule-appointment-upcoming").click();

  await expect(page.getByRole("heading", { name: "Reschedule" })).toBeVisible();
  await page.getByRole("button", { name: "10:00" }).click();
  await page.getByTestId("reschedule-confirm").click();

  await expect(page).toHaveURL(/\/appointments$/);
  expect(reschedulePayload).toMatchObject({ appointment_id: "appointment-upcoming", new_starts_at: newStart.toISOString() });
});

test("a customer can edit their name and phone", async ({ page }) => {
  let updatePayload: Record<string, unknown> | null = null;

  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/update_my_profile")) {
      updatePayload = route.request().postDataJSON() as Record<string, unknown>;
      await json(route, customerRow({ full_name: "Browser Renamed", phone: "+55 11 90000-0000" }));
      return true;
    }
  });

  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveValue("Browser Customer");

  await page.getByLabel("Full name").fill("Browser Renamed");
  await page.getByLabel("Phone (optional)").fill("+55 11 90000-0000");
  await page.getByTestId("profile-save").click();

  await expect(page.getByText("Profile saved.")).toBeVisible();
  expect(updatePayload).toEqual({ p_full_name: "Browser Renamed", p_phone: "+55 11 90000-0000" });
});

test("a customer can download their data as a JSON file", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/export_my_data")) {
      await json(route, { appointments: [], customers: [customerRow()] });
      return true;
    }
  });

  await page.goto("/profile");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("profile-export").click()]);

  expect(download.suggestedFilename()).toMatch(/^barberschedule-my-data-\d{4}-\d{2}-\d{2}\.json$/);
});

test("deleting the account is blocked while appointments are upcoming", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page);
  await page.route("**/functions/v1/delete-account", (route) =>
    json(route, { code: "ACCOUNT_DELETION_BLOCKED" }, 409));

  await page.goto("/profile");
  await page.getByTestId("profile-delete").click();
  await page.getByTestId("profile-delete-confirm").click();

  await expect(page.getByText(/Cancel your upcoming appointments/)).toBeVisible();
});
