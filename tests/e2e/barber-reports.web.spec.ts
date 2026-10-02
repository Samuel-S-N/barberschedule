import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { barberId, json, shopId } from "./customer-helpers";
import type { RestHandler } from "./customer-helpers";

const barberUserId = "66666666-6666-4666-8666-666666666666";

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

const barberProfile = {
  avatar_url: null, bio: null, chair_rental_amount_cents: null, chair_rental_frequency: null,
  commission_percent: "40.00", compensation_type: "commission", id: barberId, name: "Browser Barber", shop_id: shopId,
};

async function mockBarberRest(page: Page, handler?: RestHandler) {
  await page.route("**/rest/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (handler && (await handler(route, url)) === true) return;
    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Browser Barber", role: "barber", user_id: barberUserId }]);
    if (path.endsWith("/rpc/get_my_barber_profile")) return json(route, [barberProfile]);
    if (path.endsWith("/rpc/list_my_barber_services")) {
      return json(route, [{ active: true, barber_service_id: "bs1", duration_minutes: 30, price_cents: 4000, service_id: "s1", service_name: "Browser Cut" }]);
    }
    if (path.endsWith("/rpc/list_my_barber_agenda")) return json(route, []);
    if (path.endsWith("/schedule_overrides") && route.request().method() === "GET") return json(route, []);
    await route.abort();
  });
}

const day = (date: string, over: Record<string, number> = {}) => ({ cancelled: 0, completed: 0, date, earnings_cents: 0, no_show: 0, upcoming: 0, ...over });

test("the reports tab shows the barber's own numbers, charts and no revenue", async ({ page }) => {
  const requests: Array<Record<string, unknown>> = [];

  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/get_my_barber_report")) {
      const body = route.request().postDataJSON() as Record<string, string>;
      requests.push(body);
      const current = requests.length % 2 === 1; // current period is requested first, then the previous one
      return json(route, current
        ? { days: [day("2026-10-01", { cancelled: 1, completed: 3, earnings_cents: 6000, no_show: 1 })], services: [{ completed: 2, name: "Browser Cut", service_id: "s1" }, { completed: 1, name: "Beard", service_id: "s2" }] }
        : { days: [day("2026-09-30", { completed: 2, earnings_cents: 4000 })], services: [] }).then(() => true);
    }
  });

  await page.goto("/earnings");
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  await expect(page.getByTestId("stat-earned")).toContainText("R$ 60,00");
  await expect(page.getByTestId("stat-earned")).toContainText("+50%");
  await expect(page.getByTestId("stat-completed")).toContainText("3");
  await expect(page.getByTestId("stat-cancellation")).toContainText("40%");
  await expect(page.getByTestId("chart-earnings")).toBeVisible();
  await expect(page.getByTestId("donut-outcome")).toContainText("Cancelled");
  await expect(page.getByTestId("donut-services")).toContainText("Browser Cut");
  await expect(page.getByTestId("chart-weekdays")).toBeVisible();

  // Tapping a column reveals its value (the hit targets are RN views over the SVG so this also works on web).
  await page.getByTestId("chart-earnings-bar-0").click();
  await expect(page.getByTestId("chart-earnings").getByText(/: R\$ /)).toBeVisible();
  await expect(page.getByText(/Revenue|Faturamento/)).toHaveCount(0);

  await page.getByTestId("earnings-period-quarter").click();
  await expect.poll(() => requests.some((r) => r.period_start !== requests[0].period_start)).toBe(true);
});

test("an empty period shows the empty state instead of charts", async ({ page }) => {
  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/get_my_barber_report")) return json(route, { days: [], services: [] }).then(() => true);
  });

  await page.goto("/earnings");
  await expect(page.getByText("No appointments in this period.")).toBeVisible();
  await expect(page.getByTestId("donut-outcome")).toHaveCount(0);
});

test("a chair-rental barber also sees the rent tile", async ({ page }) => {
  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/get_my_barber_profile")) {
      return json(route, [{ ...barberProfile, chair_rental_amount_cents: 30000, chair_rental_frequency: "monthly", commission_percent: "0.00", compensation_type: "chair_rental" }]).then(() => true);
    }
    if (url.pathname.endsWith("/rpc/get_my_barber_report")) return json(route, { days: [day("2026-10-01", { completed: 1, earnings_cents: 4000 })], services: [] }).then(() => true);
  });

  await page.goto("/earnings");
  await expect(page.getByTestId("stat-rent")).toContainText("R$ 300,00");
});

test("the barber exports their report as a CSV file", async ({ page }) => {
  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/get_my_barber_report")) {
      return json(route, { days: [day("2026-10-01", { completed: 3, earnings_cents: 6000 })], services: [{ completed: 2, name: "Browser Cut", service_id: "s1" }] }).then(() => true);
    }
  });

  await page.goto("/earnings");
  await expect(page.getByTestId("stat-earned")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByTestId("report-export").click();
  const file = await download;
  const content = (await readFile((await file.path())!, "utf8")).replace("﻿", "");

  expect(file.suggestedFilename()).toMatch(/^report-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);
  expect(content).toContain("Date;Completed;Cancelled;No-show;Upcoming;Earnings");
  expect(content).toContain("2026-10-01;3;0;0;0;60,00");
  expect(content).toContain("Browser Cut;2");
});
