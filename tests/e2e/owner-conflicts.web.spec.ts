import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { barberId, barberServiceId, json, shopId } from "./customer-helpers";

const ownerId = "55555555-5555-4555-8555-555555555555";
const OPEN = "c0c0c0c0-0000-4000-8000-000000000001";
const DONE = "c0c0c0c0-0000-4000-8000-000000000002";

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

let occurrenceDate = "2026-11-09";
const conflict = (id: string, status: "open" | "resolved") => ({
  barber_id: barberId, barber_service_id: barberServiceId, customer_name: "Ana Souza", customer_phone: "11999999999", id,
  local_start_time: "10:00:00", occurrence_date: occurrenceDate, reason: "SLOT_UNAVAILABLE", series_id: "s1", service_name: "Cut", status,
});

async function openConflicts(page: Page, options: { failResolve?: boolean; slots?: unknown[] } = {}) {
  const resolves: unknown[] = [];
  const state = { open: true };

  await signInAsOwner(page);
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/shops")) return json(route, [{ id: shopId }]);
    if (path.endsWith("/rpc/list_owner_recurrence_conflicts")) return json(route, [conflict(OPEN, state.open ? "open" : "resolved"), conflict(DONE, "resolved")]);
    if (path.endsWith("/rpc/get_available_slots")) {
      return json(route, options.slots ?? [{ ends_at: "2026-11-09T13:30:00Z", local_date: "2026-11-09", local_time: "11:00:00", starts_at: "2026-11-09T13:00:00Z" }]);
    }
    if (path.endsWith("/rpc/resolve_recurrence_conflict")) {
      resolves.push(route.request().postDataJSON());
      if (options.failResolve) return json(route, { code: "P0001", message: "SLOT_UNAVAILABLE" }, 400);
      state.open = false;

      return json(route, null);
    }
    await route.abort();
  });
  await page.goto("/recurrence-conflicts");

  return resolves;
}

test("open conflicts offer WhatsApp, Reschedule and Dismiss; resolved ones are greyed with a badge", async ({ page }) => {
  await openConflicts(page);

  await expect(page.getByTestId(`conflict-${OPEN}`)).toContainText("Ana Souza");
  await expect(page.getByTestId(`conflict-${OPEN}`)).toContainText("The time was no longer free");
  await expect(page.getByTestId(`conflict-whatsapp-${OPEN}`)).toBeVisible();
  await expect(page.getByTestId(`conflict-reschedule-${OPEN}`)).toBeVisible();
  await expect(page.getByTestId(`conflict-dismiss-${OPEN}`)).toBeVisible();
  await expect(page.getByTestId(`conflict-${DONE}`)).toContainText("Resolved");
  await expect(page.getByTestId(`conflict-reschedule-${DONE}`)).toHaveCount(0);
  await expect(page.getByTestId(`conflict-dismiss-${DONE}`)).toHaveCount(0);
});

test("Dismiss skips the date and the card turns resolved", async ({ page }) => {
  const resolves = await openConflicts(page);

  await page.getByTestId(`conflict-dismiss-${OPEN}`).click();
  await expect.poll(() => resolves).toEqual([{ new_starts_at: null, target_conflict_id: OPEN }]);
  await expect(page.getByTestId(`conflict-${OPEN}`)).toContainText("Resolved");
  await expect(page.getByTestId(`conflict-dismiss-${OPEN}`)).toHaveCount(0);
});

test("Reschedule is the booking steps: date, time, review, then it books and returns to the list", async ({ page }) => {
  const resolves = await openConflicts(page);

  await page.getByTestId(`conflict-reschedule-${OPEN}`).click();
  await expect(page).toHaveURL(/\/conflict-reschedule/);
  await expect(page.getByTestId("step-label")).toHaveText("Step 1 of 4 · Date");
  await expect(page.getByTestId("conflict-current")).toContainText("Ana Souza");
  await expect(page.getByTestId("month-calendar")).toBeVisible();
  await page.getByTestId("conflict-continue").click();

  await expect(page.getByTestId("step-label")).toHaveText("Step 2 of 4 · Time");
  await expect(page.getByTestId("conflict-continue")).toBeDisabled();
  await page.getByRole("button", { name: "11:00" }).click();
  await page.getByTestId("conflict-continue").click();

  await expect(page.getByTestId("step-label")).toHaveText("Step 3 of 4 · Review");
  await expect(page.getByTestId("conflict-summary")).toContainText("Ana Souza");
  await expect(page.getByTestId("conflict-summary")).toContainText("Conflicted date");
  await expect(page.getByTestId("conflict-summary")).toContainText("New time");
  await page.getByTestId("conflict-confirm").click();

  await expect.poll(() => resolves).toEqual([{ new_starts_at: "2026-11-09T13:00:00Z", target_conflict_id: OPEN }]);
  await expect(page).toHaveURL(/\/recurrence-conflicts/);
  await expect(page.getByText("Rescheduled.")).toBeVisible();
  await expect(page.getByTestId(`conflict-${OPEN}`)).toContainText("Resolved");
});

test("a conflict up to 90 days ahead opens the flow on its own day", async ({ page }) => {
  const far = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const asked: string[] = [];

  occurrenceDate = far;
  await openConflicts(page);
  await page.route("**/rest/v1/rpc/get_available_slots", async (route) => {
    asked.push((route.request().postDataJSON() as { local_date: string }).local_date);
    await json(route, [{ ends_at: `${far}T13:30:00Z`, local_date: far, local_time: "10:00:00", starts_at: `${far}T13:00:00Z` }]);
  });
  await page.getByTestId(`conflict-reschedule-${OPEN}`).click();
  await expect(page.getByTestId(`month-calendar-day-${far}`)).toBeVisible();
  await page.getByTestId("conflict-continue").click();
  await expect.poll(() => asked).toContain(far);
  occurrenceDate = "2026-11-09";
});

test("back steps back and, on the first step, returns to the conflicts list", async ({ page }) => {
  await openConflicts(page);
  const back = () => page.locator('[data-testid="back"]:not([aria-hidden="true"] *)').click();

  await page.getByTestId(`conflict-reschedule-${OPEN}`).click();
  await page.getByTestId("conflict-continue").click();
  await expect(page.getByTestId("step-label")).toHaveText("Step 2 of 4 · Time");
  await back();
  await expect(page.getByTestId("step-label")).toHaveText("Step 1 of 4 · Date");
  await back();
  await expect(page).toHaveURL(/\/recurrence-conflicts$/);
  await expect(page.getByTestId(`conflict-${OPEN}`)).toBeVisible();
});

test("with no free time on the date the time step says so and cannot continue", async ({ page }) => {
  await openConflicts(page, { slots: [] });

  await page.getByTestId(`conflict-reschedule-${OPEN}`).click();
  await page.getByTestId("conflict-continue").click();
  await expect(page.getByText("No times available this day")).toBeVisible();
  await expect(page.getByTestId("conflict-continue")).toBeDisabled();
});

test("a refused time returns to the time step with the error", async ({ page }) => {
  await openConflicts(page, { failResolve: true });

  await page.getByTestId(`conflict-reschedule-${OPEN}`).click();
  await page.getByTestId("conflict-continue").click();
  await page.getByRole("button", { name: "11:00" }).click();
  await page.getByTestId("conflict-continue").click();
  await page.getByTestId("conflict-confirm").click();

  await expect(page.getByText("That time is no longer available.")).toBeVisible();
  await expect(page.getByTestId("step-label")).toHaveText("Step 2 of 4 · Time");
});
