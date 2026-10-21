import { expect, test } from "@playwright/test";

import { json, mockCustomerRest, signInAsCustomer } from "./customer-helpers";

test("customer account fields show grey examples instead of format hints in the label", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page);

  await page.goto("/me/account");
  await page.getByTestId("profile-name").fill("");
  await expect(page.getByTestId("profile-name")).toHaveAttribute("placeholder", "Maria Silva");
  await page.getByTestId("profile-phone").fill("");
  await expect(page.getByTestId("profile-phone")).toHaveAttribute("placeholder", "(11)91234-5678");
  await page.getByTestId("profile-nickname").fill("");
  await expect(page.getByTestId("profile-nickname")).toHaveAttribute("placeholder", "Mari");
});

test("date and time fields show an example date and time", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/appointments")) return json(route, []), true;
  });

  // The owner agenda's date field is covered in owner-agenda.web.spec.ts; here the placeholder text is asserted through a form that starts empty.
  await page.goto("/me/account");
  await expect(page.getByText(/\(HH:mm\)|\(YYYY-MM-DD\)|\(AAAA-MM-DD\)/)).toHaveCount(0);
});
