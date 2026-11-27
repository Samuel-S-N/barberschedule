import type { Page } from "@playwright/test";

import { appointmentRow, isHistoryQuery, json, mockCustomerRest, signInAsCustomer } from "./customer-helpers";
import { expect, test } from "./fixtures";

// Synthetic touch events: Playwright's `touchscreen` can only tap. The page's own non-passive touchmove listener decides whether the browser's
// scrolling is stopped, and that is observable: dispatchEvent returns false when preventDefault was called.
test.use({ hasTouch: true, viewport: { height: 360, width: 390 } });

type Pt = { x: number; y: number };

async function touchDrag(page: Page, from: Pt, to: Pt, steps = 10) {
  return page.evaluate(({ from: a, steps: n, to: b }) => {
    if (typeof Touch === "undefined" || typeof TouchEvent === "undefined") return null;
    const target = document.elementFromPoint(a.x, a.y);
    if (!target) return null;
    const fire = (type: string, p: { x: number; y: number }) => {
      const touch = new Touch({ clientX: p.x, clientY: p.y, identifier: 7, target });
      const live = type === "touchend" ? [] : [touch];

      return !target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, changedTouches: [touch], targetTouches: live, touches: live }));
    };
    const prevented: boolean[] = [];

    fire("touchstart", a);
    for (let i = 1; i <= n; i += 1) prevented.push(fire("touchmove", { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
    fire("touchend", b);

    return prevented;
  }, { from, steps, to });
}

async function openHome(page: Page, { onUpcoming }: { onUpcoming?: (count: number) => Promise<void> } = {}) {
  const counter = { upcoming: 0 };

  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/appointments")) {
      if (!isHistoryQuery(url)) {
        counter.upcoming += 1;
        await onUpcoming?.(counter.upcoming);
      }
      await json(route, isHistoryQuery(url) ? [] : [appointmentRow()]);
      return true;
    }
  });
  await page.goto("/");
  await expect(page.getByTestId("home-next-appointment")).toBeVisible();

  return counter;
}

// The customer tabs keep every tab mounted side by side: the indicator of Home is the one inside Home's own pull root.
const indicator = (page: Page) => page.getByTestId("pull-root").filter({ has: page.getByTestId("home-next-appointment") }).getByTestId("pull-indicator");

test.beforeEach(async ({ page }) => {
  // Skip where the engine cannot construct touch events (reported, not silently passed).
  await page.goto("/login");
  const constructible = await page.evaluate(() => {
    try {
      const touch = new Touch({ clientX: 0, clientY: 0, identifier: 1, target: document.body });

      return new TouchEvent("touchstart", { touches: [touch] }) instanceof Event;
    } catch {
      return false; // WebKit exposes Touch but "Illegal constructor"
    }
  });

  test.skip(!constructible, "this engine cannot construct Touch / TouchEvent, so the gesture cannot be dispatched here (verified on Chromium and Firefox)");
});

test("pulling down at the top of Home refetches and shows the spinner while it loads", async ({ page }) => {
  let armed = false;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const counter = await openHome(page, { onUpcoming: async () => { if (armed) await gate; } });

  await page.waitForTimeout(300); // let any initial refetch settle (WebKit loads twice)
  const before = counter.upcoming;

  armed = true;

  await expect(indicator(page)).toHaveCSS("opacity", "0");

  const prevented = await touchDrag(page, { x: 195, y: 120 }, { x: 195, y: 300 });

  expect(prevented?.some(Boolean)).toBe(true);
  await expect.poll(() => counter.upcoming).toBe(before + 1);
  await expect(indicator(page)).toHaveCSS("opacity", "1");
  release();
  await expect(indicator(page)).toHaveCSS("opacity", "0");
});

test("a short pull does nothing", async ({ page }) => {
  const counter = await openHome(page);

  await page.waitForTimeout(300);
  const before = counter.upcoming;

  await touchDrag(page, { x: 195, y: 120 }, { x: 195, y: 150 });
  await page.waitForTimeout(400);
  expect(counter.upcoming).toBe(before);
  await expect(indicator(page)).toHaveCSS("opacity", "0");
});

test("no pull while the screen is scrolled down, and a drag up or sideways is left to the browser", async ({ page }) => {
  const counter = await openHome(page);

  await page.waitForTimeout(300);
  const before = counter.upcoming;

  await page.mouse.move(195, 200);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll("*")].some((node) => node.scrollTop > 0))).toBe(true);

  const scrolledPull = await touchDrag(page, { x: 195, y: 120 }, { x: 195, y: 300 });

  expect(scrolledPull?.some(Boolean)).toBe(false);
  await page.evaluate(() => [...document.querySelectorAll("*")].forEach((node) => { node.scrollTop = 0; }));
  expect((await touchDrag(page, { x: 195, y: 300 }, { x: 195, y: 120 }))?.some(Boolean)).toBe(false);
  expect((await touchDrag(page, { x: 100, y: 200 }, { x: 300, y: 210 }))?.some(Boolean)).toBe(false);
  await page.waitForTimeout(300);
  expect(counter.upcoming).toBe(before);
});

test("normal scrolling still works", async ({ page }) => {
  await openHome(page);

  await page.mouse.move(195, 200);
  await page.mouse.wheel(0, 150);
  await expect.poll(() => page.evaluate(() => Math.max(...[...document.querySelectorAll("*")].map((node) => node.scrollTop)))).toBeGreaterThan(50);
});
