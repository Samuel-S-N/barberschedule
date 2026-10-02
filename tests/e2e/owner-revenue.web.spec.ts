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
    await route.abort();
  });
}

test("the owner reaches Revenue from the hub and sees totals, charts and the barber table", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page);

  await page.goto("/");
  await page.getByRole("link", { name: "Revenue" }).click();
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
