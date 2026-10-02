import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

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

const report = {
  barbers: [
    { barber_id: "b1", barber_share_cents: 4400, compensation_type: "commission", completed: 3, gross_cents: 11000, name: "Ana Barber", rent_estimate_cents: 0 },
    { barber_id: "b2", barber_share_cents: 5000, compensation_type: "chair_rental", completed: 1, gross_cents: 5000, name: "Bruno Chair", rent_estimate_cents: 7000 },
  ],
  days: [{ cancelled: 1, completed: 4, date: new Date().toISOString().slice(0, 10), gross_cents: 16000, no_show: 0, upcoming: 0 }],
  services: [{ completed: 3, gross_cents: 11000, name: "Browser Cut", service_id: "s1" }, { completed: 1, gross_cents: 5000, name: "Pro Cut", service_id: "s2" }],
};

async function mockOwnerRest(page: Page, requests: Array<Record<string, unknown>> = []) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status: 200 });

    if (path.endsWith("/rpc/get_current_profile")) return json([{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/rpc/get_shop_report")) {
      requests.push(route.request().postDataJSON() as Record<string, unknown>);
      return json(report);
    }
    if (path.endsWith("/rpc/list_rent_payments")) return json([]);
    await route.abort();
  });
}

test("the owner reaches Revenue from the tab bar and sees totals, charts and the barber table", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page);

  await page.goto("/");
  await page.getByTestId("tab-revenue").click();
  await expect(page).toHaveURL(/\/revenue/);

  await expect(page.getByTestId("stat-revenue")).toContainText("R$ 160,00");
  // 16000 - (4400 + 5000) + 7000 = 13600
  await expect(page.getByTestId("stat-shop-income")).toContainText("R$ 136,00");
  await expect(page.getByTestId("stat-completed")).toContainText("4");
  await expect(page.getByTestId("chart-revenue")).toBeVisible();
  await expect(page.getByTestId("donut-barbers")).toContainText("Ana Barber");
  await expect(page.getByTestId("donut-services")).toContainText("Browser Cut");
  await expect(page.getByTestId("donut-outcome")).toContainText("Cancelled");
  await expect(page.getByTestId("barber-row-b2")).toContainText("Bruno Chair");
  await expect(page.getByTestId("barber-row-b2")).toContainText("R$ 70,00");
  await expect(page.getByText(/estimated/i).first()).toBeVisible();
});

test("switching the period requests a new range", async ({ page }) => {
  const requests: Array<Record<string, unknown>> = [];

  await signInAsOwner(page);
  await mockOwnerRest(page, requests);

  await page.goto("/revenue");
  await expect(page.getByTestId("stat-revenue")).toBeVisible();
  const before = requests.length;
  await page.getByTestId("revenue-period-quarter").click();
  await expect.poll(() => requests.length > before).toBe(true);
});

test("the owner records and removes a chair rent payment", async ({ page }) => {
  const payments: Array<Record<string, unknown>> = [];
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status: 200 });
    const paid = payments.reduce((sum, p) => sum + (p.amount_cents as number), 0);

    if (path.endsWith("/rpc/get_current_profile")) return json([{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/rpc/get_shop_report")) {
      return json({ ...report, barbers: report.barbers.map((b) => (b.barber_id === "b2" ? { ...b, rent_paid_cents: paid } : { ...b, rent_paid_cents: 0 })) });
    }
    if (path.endsWith("/rpc/list_rent_payments")) return json(payments);
    if (path.endsWith("/rpc/record_rent_payment")) {
      calls.record = route.request().postDataJSON();
      const body = calls.record as { payment_amount_cents: number; payment_paid_on: string };
      payments.push({ amount_cents: body.payment_amount_cents, barber_id: "b2", barber_name: "Bruno Chair", id: "pay-1", note: null, paid_on: body.payment_paid_on });

      return json({ amount_cents: body.payment_amount_cents, barber_id: "b2", id: "pay-1", note: null, paid_on: body.payment_paid_on });
    }
    if (path.endsWith("/rpc/delete_rent_payment")) {
      calls.remove = route.request().postDataJSON();
      payments.length = 0;

      return json(null);
    }
    await route.abort();
  });

  await page.goto("/revenue");
  await page.getByTestId("rent-pay-b2").click();
  // Prefilled with what is still owed: the 70,00 estimate minus nothing paid yet.
  await expect(page.getByTestId("rent-amount")).toHaveValue("70,00");
  await page.getByTestId("rent-amount").fill("50,00");
  await page.getByTestId("rent-pay-save").click();

  await expect(page.getByTestId("rent-payment-pay-1")).toContainText("R$ 50,00");
  await expect(page.getByTestId("barber-row-b2")).toContainText("R$ 50,00");
  expect(calls.record).toEqual({ payment_amount_cents: 5000, payment_note: null, payment_paid_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), target_barber_id: "b2" });

  await page.getByTestId("rent-remove-pay-1").click();
  expect(calls.remove).toBeUndefined();
  await page.getByTestId("rent-remove-pay-1").click();
  await expect(page.getByTestId("rent-payment-pay-1")).toHaveCount(0);
  expect(calls.remove).toEqual({ payment_id: "pay-1" });
});

test("an invalid amount is rejected before calling the database", async ({ page }) => {
  const calls: string[] = [];

  await signInAsOwner(page);
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status: 200 });

    if (path.endsWith("/rpc/get_current_profile")) return json([{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/rpc/get_shop_report")) return json(report);
    if (path.endsWith("/rpc/list_rent_payments")) return json([]);
    if (path.endsWith("/rpc/record_rent_payment")) calls.push("record");
    await route.abort();
  });

  await page.goto("/revenue");
  await page.getByTestId("rent-pay-b2").click();
  await page.getByTestId("rent-amount").fill("abc");
  await page.getByTestId("rent-pay-save").click();

  await expect(page.getByText("Enter a valid amount.")).toBeVisible();
  expect(calls).toEqual([]);
});

test("the owner exports the revenue report as a CSV file", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page);

  await page.goto("/revenue");
  await expect(page.getByTestId("stat-revenue")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByTestId("report-export").click();
  const file = await download;
  const content = (await readFile((await file.path())!, "utf8")).replace("\uFEFF", "");

  expect(file.suggestedFilename()).toMatch(/^revenue-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);
  expect(content).toContain("Barber;Completed;Revenue;Barber share;Rent (estimate);Rent paid");
  expect(content).toContain("Bruno Chair;1;50,00;50,00;70,00;0,00");
  expect(content).toContain("Browser Cut;3;110,00");
});

test("each barber and service shows the change versus the previous period", async ({ page }) => {
  // Same clock the app uses for "today" (shop time), so the mock can tell the current period from the previous one.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  await signInAsOwner(page);
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status: 200 });

    if (path.endsWith("/rpc/get_current_profile")) return json([{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/rpc/get_shop_report")) {
      const { period_end: end } = route.request().postDataJSON() as { period_end: string };
      if (end === today) return json(report);
      // Previous period: Ana earned half as much; the service was not sold at all; Bruno did not exist yet.
      return json({
        barbers: [{ ...report.barbers[0], gross_cents: 5500 }],
        days: report.days,
        services: [{ completed: 1, gross_cents: 5500, name: "Browser Cut", service_id: "s1" }],
      });
    }
    if (path.endsWith("/rpc/list_rent_payments")) return json([]);
    await route.abort();
  });

  await page.goto("/revenue");
  // 11000 vs 5500 = +100%; Bruno has no previous row, so there is nothing to compare.
  await expect(page.getByTestId("barber-delta-b1")).toContainText("+100%");
  await expect(page.getByTestId("barber-delta-b2")).toContainText("No previous data");

  await page.getByTestId("section-services-toggle").click();
  await expect(page.getByTestId("section-services")).toContainText("+100%");
});
