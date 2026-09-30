import { expect, test } from "@playwright/test";

import { appointmentRow, isHistoryQuery, json, mockCustomerRest, signInAsCustomer } from "./customer-helpers";

async function drag(page: import("@playwright/test").Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, { steps: 4 });
  await page.mouse.move(...to, { steps: 4 });
  await page.mouse.up();
}

// A drag that starts and ends on the same button is a click in the DOM, which would fake a tab switch.
async function expectEmptyArea(page: import("@playwright/test").Page, points: [number, number][]) {
  for (const [x, y] of points) {
    const interactive = await page.evaluate(
      ([px, py]) => document.elementFromPoint(px, py)?.closest('[role="button"],[role="tab"],a,input') != null,
      [x, y],
    );

    expect(interactive, `(${x}, ${y}) must not be on an interactive element`).toBe(false);
  }
}

test.use({ viewport: { height: 700, width: 390 } });

test("dragging sideways moves between the tabs", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/appointments")) {
      await json(route, isHistoryQuery(url) ? [] : [appointmentRow()]);
      return true;
    }
  });
  await page.goto("/home");
  await expect(page.getByTestId("tab-home")).toBeVisible();
  await expect(page.getByTestId("tab-home")).toHaveAttribute("aria-selected", "true");
  await expectEmptyArea(page, [[330, 590], [60, 590]]);

  await drag(page, [330, 590], [60, 590]);
  await expect(page.getByTestId("tab-book")).toHaveAttribute("aria-selected", "true");

  await drag(page, [60, 590], [330, 590]);
  await expect(page.getByTestId("tab-home")).toHaveAttribute("aria-selected", "true");

  await drag(page, [60, 590], [330, 590]);
  await expect(page.getByTestId("tab-home")).toHaveAttribute("aria-selected", "true");
});

test("on the booking date step a drag changes the month, not the tab", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/barber_services")) {
      await json(route, [{ duration_override_minutes: null, id: "33333333-3333-4333-8333-333333333333", price_override_cents: null, service_id: "s", services: { duration_minutes: 30, name: "Corte", price_cents: 4000 } }]);
      return true;
    }
  });
  await page.goto("/book");
  await page.getByRole("button", { name: "Browser Barber" }).click();
  await page.getByRole("button", { name: "Corte" }).click();
  await expect(page.getByTestId("month-calendar-title")).toBeVisible();
  // gesture-handler defaults to `touch-action: none` on web, which would stop a touch browser from scrolling the page.
  await expect(page.getByTestId("month-calendar")).toHaveCSS("touch-action", "pan-y");
  const before = await page.getByTestId("month-calendar-title").innerText();

  await drag(page, [330, 300], [60, 300]);

  await expect(page.getByTestId("month-calendar-title")).not.toHaveText(before);
  await expect(page.getByTestId("tab-book")).toHaveAttribute("aria-selected", "true");
});

// The calendar's day cells that are drawn as selected (the ink background).
const selectedDays = (page: import("@playwright/test").Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="month-calendar-day-"]'))
      .filter((el) => getComputedStyle(el).backgroundColor === "rgb(23, 20, 18)")
      .map((el) => el.getAttribute("data-testid")),
  );

async function openDateStep(page: import("@playwright/test").Page) {
  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/barber_services")) {
      await json(route, [{ duration_override_minutes: null, id: "33333333-3333-4333-8333-333333333333", price_override_cents: null, service_id: "s", services: { duration_minutes: 30, name: "Corte", price_cents: 4000 } }]);
      return true;
    }
  });
  await page.goto("/book");
  await page.getByRole("button", { name: "Browser Barber" }).click();
  await page.getByRole("button", { name: "Corte" }).click();
  await expect(page.getByTestId("month-calendar-title")).toBeVisible();
}

test("the month that is off screen is hidden from assistive technology and the keyboard", async ({ page }) => {
  await openDateStep(page);

  const pages = page.getByTestId("month-pages").locator("> div");

  await expect(pages.nth(0)).not.toHaveAttribute("aria-hidden", "true");
  await expect(pages.nth(1)).toHaveAttribute("aria-hidden", "true");

  const focusable = await pages.nth(1).evaluate((el) =>
    Array.from(el.querySelectorAll<HTMLElement>('[data-testid^="month-calendar-day-"]')).filter((day) => day.tabIndex >= 0).length,
  );

  // Tabbing into an off-screen day would scroll the overflow-hidden viewport and misalign the strip.
  expect(focusable).toBe(0);
});

test("a swipe that starts on a day does not select that day", async ({ page }) => {
  await openDateStep(page);
  await page.getByTestId("month-calendar-next").click();
  await expect(page.getByTestId("month-calendar-title")).not.toHaveText("");

  const before = await selectedDays(page);
  const cell = page.locator('[data-testid^="month-calendar-day-"]:not([aria-disabled="true"])').last();
  const cellId = (await cell.getAttribute("data-testid"))!;

  // Control: a plain click on this very cell does select it, so the drag below really starts on a selectable day.
  await cell.click();
  expect(await selectedDays(page)).toEqual([cellId]);
  await page.getByTestId("month-calendar-prev").click();
  await page.getByTestId(before[0]!).click();
  await page.getByTestId("month-calendar-next").click();
  expect(await selectedDays(page)).toEqual(before);

  const box = (await cell.boundingBox())!;
  const start: [number, number] = [box.x + box.width / 2, box.y + box.height / 2];

  await drag(page, start, [start[0] + 120, start[1]]);
  await page.waitForTimeout(400);

  expect(await selectedDays(page)).toEqual(before);
});
