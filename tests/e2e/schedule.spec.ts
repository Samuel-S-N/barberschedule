import { expect, test } from "@playwright/test";

const shopId = "11111111-1111-4111-8111-111111111111";
const barberId = "22222222-2222-4222-8222-222222222222";
const ownerId = "33333333-3333-4333-8333-333333333333";

test("an authenticated owner can add and remove schedule records", async ({ page }) => {
  const workingPeriods: Array<Record<string, unknown>> = [];
  const overrides: Array<Record<string, unknown>> = [];

  await page.addInitScript(({ nextOwnerId }) => {
    const now = Math.floor(Date.now() / 1000);
    const token = `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({ exp: now + 3600, sub: nextOwnerId }))}.`;

    localStorage.setItem("sb-example-auth-token", JSON.stringify({
      access_token: token,
      expires_at: now + 3600,
      expires_in: 3600,
      refresh_token: "e2e-refresh-token",
      token_type: "bearer",
      user: { id: nextOwnerId },
    }));
    localStorage.setItem("sb-127-auth-token", localStorage.getItem("sb-example-auth-token") ?? "");
  }, { nextOwnerId: ownerId });

  await page.route("**/rest/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body: unknown) => route.fulfill({
      body: JSON.stringify(body),
      contentType: "application/json",
      status: 200,
    });

    if (path.endsWith("/rpc/get_current_profile")) {
      await json([{ role: "owner", user_id: ownerId }]);
      return;
    }

    if (path.endsWith("/rpc/list_owner_barbers")) {
      await json([{
        active: true,
        archived_at: null,
        id: barberId,
        name: "Browser Barber",
        shop_id: shopId,
        user_id: null,
      }]);
      return;
    }

    if (path.endsWith("/shops")) {
      await json([{ id: shopId }]);
      return;
    }

    if (path.endsWith("/working_periods")) {
      if (request.method() === "GET") {
        await json(workingPeriods);
        return;
      }

      if (request.method() === "POST") {
        const input = request.postDataJSON() as Record<string, unknown>;
        const period = { id: "period-1", ...input };
        workingPeriods.push(period);
        await json(period);
        return;
      }

      if (request.method() === "DELETE") {
        workingPeriods.splice(0, workingPeriods.length);
        await json([]);
        return;
      }
    }

    if (path.endsWith("/schedule_overrides")) {
      if (request.method() === "GET") {
        await json(overrides);
        return;
      }

      if (request.method() === "POST") {
        const input = request.postDataJSON() as Record<string, unknown>;
        const override = { id: "override-1", ...input };
        overrides.push(override);
        await json(override);
        return;
      }

      if (request.method() === "DELETE") {
        overrides.splice(0, overrides.length);
        await json([]);
        return;
      }
    }

    await route.abort();
  });

  await page.goto("/schedule");

  await expect(page.getByRole("heading", { name: "Owner schedule" })).toBeVisible();
  await expect(page.getByText("Selected barber: Browser Barber")).toBeVisible();
  await expect(page.getByRole("button", { name: "Browser Barber (selected)" })).toBeVisible();

  await page.getByPlaceholder("Weekday 1-7 (Monday-Sunday)").fill("1");
  await page.getByPlaceholder("Start time (HH:mm)").first().fill("09:00");
  await page.getByPlaceholder("End time (HH:mm)").first().fill("18:00");
  await page.getByRole("button", { name: "Add working period" }).click();
  await expect(page.getByText("Monday · 09:00–18:00")).toBeVisible();
  await page.getByRole("button", { name: "Remove" }).first().click();
  await expect(page.getByText("Monday · 09:00–18:00")).not.toBeVisible();

  await page.getByRole("button", { name: "Extra opening" }).click();
  await expect(page.getByRole("button", { name: "Extra opening (selected)" })).toBeVisible();
  await page.getByPlaceholder("Local date (YYYY-MM-DD)").fill("2026-08-24");
  await page.getByPlaceholder("Start time (HH:mm)").last().fill("16:00");
  await page.getByPlaceholder("End time (HH:mm)").last().fill("18:00");
  await page.getByRole("button", { name: "Add override" }).click();
  await expect(page.getByText("2026-08-24 · opening · 16:00–18:00")).toBeVisible();
  await page.getByRole("button", { name: "Remove" }).last().click();
  await expect(page.getByText("2026-08-24 · opening · 16:00–18:00")).not.toBeVisible();
});
