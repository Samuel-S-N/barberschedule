import { expect, test } from "./fixtures";

import { mockCustomerRest, signInAsCustomer } from "./customer-helpers";

const FIREFOX_ANDROID = "Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0";
const FIREFOX_DESKTOP = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";
const SAFARI_MAC_17 = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const SAFARI_MAC_16 = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15";
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

// The install card per browser (customer profile hub, 390 px wide). Where a browser cannot install the app, nothing is shown.
async function openProfile(page: import("@playwright/test").Page) {
  await signInAsCustomer(page);
  await mockCustomerRest(page);
  await page.goto("/profile");
  await expect(page.getByTestId("profile-avatar")).toBeVisible();
}

async function cardStyle(page: import("@playwright/test").Page) {
  return page.getByTestId("install-card").evaluate((element) => {
    const style = getComputedStyle(element);

    return { borderRadius: style.borderTopLeftRadius, borderWidth: style.borderTopWidth, minHeight: style.minHeight, padding: style.paddingTop };
  });
}

const CARD = { borderRadius: "20px", borderWidth: "1px", minHeight: "56px", padding: "16px" };

test.describe("Firefox on Android", () => {
  test.use({ userAgent: FIREFOX_ANDROID, viewport: { height: 844, width: 390 } });

  test("offers the install card and a two-step guide", async ({ page }, testInfo) => {
    await openProfile(page);

    await expect(page.getByTestId("install-card")).toBeVisible();
    expect(await cardStyle(page)).toEqual(CARD);
    await page.getByTestId("install-card").screenshot({ path: testInfo.outputPath("firefox-android-card.png") });

    await page.getByTestId("install-card").click();
    await expect(page.getByTestId("install-guide")).toBeVisible();
    await expect(page.getByText("Tap the browser menu (⋮)")).toBeVisible();
    await expect(page.getByText("Tap “Install” (or “Add to Home screen”)")).toBeVisible();
    await page.waitForTimeout(500); // the modal fades in
    await page.screenshot({ path: testInfo.outputPath("firefox-android-guide.png") });
  });
});

test.describe("Firefox on a computer", () => {
  test.use({ userAgent: FIREFOX_DESKTOP, viewport: { height: 844, width: 390 } });

  test("shows nothing: Firefox desktop cannot install web apps", async ({ page }) => {
    await openProfile(page);

    await expect(page.getByTestId("install-card")).toHaveCount(0);
  });
});

test.describe("Safari on a Mac", () => {
  test.describe("17 and newer", () => {
    test.use({ userAgent: SAFARI_MAC_17, viewport: { height: 844, width: 390 } });

    test("offers Add to Dock", async ({ page }, testInfo) => {
      await openProfile(page);

      await expect(page.getByTestId("install-card")).toBeVisible();
      expect(await cardStyle(page)).toEqual(CARD);
      await page.getByTestId("install-card").screenshot({ path: testInfo.outputPath("safari-mac-17-card.png") });
    });
  });

  test.describe("16 and older", () => {
    test.use({ userAgent: SAFARI_MAC_16, viewport: { height: 844, width: 390 } });

    test("shows nothing: there is no Add to Dock yet", async ({ page }) => {
      await openProfile(page);

      await expect(page.getByTestId("install-card")).toHaveCount(0);
    });
  });
});

test.describe("Safari on iPhone", () => {
  test.use({ userAgent: SAFARI_IPHONE, viewport: { height: 844, width: 390 } });

  test("still offers Add to Home Screen", async ({ page }, testInfo) => {
    await openProfile(page);

    await expect(page.getByTestId("install-card")).toBeVisible();
    expect(await cardStyle(page)).toEqual(CARD);
    await page.getByTestId("install-card").screenshot({ path: testInfo.outputPath("safari-iphone-card.png") });
  });
});
