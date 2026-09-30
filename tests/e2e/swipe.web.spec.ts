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
