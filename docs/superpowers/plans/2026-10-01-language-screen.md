# Language screen with a Confirm button — plan

> Follow-up to `2026-10-01-language-setting.md` (PR #9, still open, so the commits go to the same branch). Bounded, executed inline with TDD (the e2e is the test: screens in this repo are covered by Playwright).

**Goal:** Settings > Language > pick (Follow device / Português / Español / English) > Confirm. Picking only marks the choice; the language changes on Confirm.

## Global constraints

- The preference layer (`setLanguagePreference`, persistence, `useLanguagePreference`) does not change.
- Picking an option must not change the app language; the Confirm button is disabled while the choice equals the saved preference; the back arrow without confirming discards the choice.
- Copy in pt, en, es; route `me/language` (no collision with `(owner)/settings.tsx`); no `git add -A`; commit trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Task 1 — e2e first (fails)

Replace the language test in `tests/e2e/profile.web.spec.ts` with the new flow and add a "leave without confirming" test:

```ts
test("the language is chosen in Settings > Language and only applied after confirming", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page);

  await page.goto("/me/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByTestId("language-options")).toHaveCount(0);

  await page.getByTestId("menu-language").click();
  await expect(page).toHaveURL(/\/me\/language$/);
  await expect(page.getByRole("heading", { name: "Language" })).toBeVisible();
  await expect(page.getByTestId("option-device")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("language-confirm")).toBeDisabled();

  await page.getByTestId("option-es").click();
  await expect(page.getByTestId("option-es")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("heading", { name: "Language" })).toBeVisible();
  await expect(page.getByTestId("language-confirm")).toBeEnabled();

  await page.getByTestId("language-confirm").click();
  await expect(page).toHaveURL(/\/me\/settings$/);
  await expect(page.getByRole("heading", { name: "Configuración" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Configuración" })).toBeVisible();
  await page.getByTestId("menu-language").click();
  await expect(page.getByTestId("option-es")).toHaveAttribute("aria-checked", "true");

  await page.getByTestId("option-device").click();
  await page.getByTestId("language-confirm").click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test("leaving the language screen without confirming keeps the language", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page);

  await page.goto("/me/language");
  await page.getByTestId("option-pt").click();
  await page.getByTestId("back").click();

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});
```

Run `node scripts/run-e2e-web.mjs`; the two tests must fail (`menu-language` does not exist).

## Task 2 — implementation

- `app/(customer)/_layout.tsx`: `<Stack.Screen name="me/language" />`.
- `app/(customer)/me/settings.tsx`: remove the inline `RadioBlock`, `LANGUAGE_OPTIONS` and `useLanguagePreference`; add a `MenuBlock` with one `Globe` row (`key: "language"`, label `profile.settings.language`) that pushes `/me/language`.
- New `app/(customer)/me/language.tsx`: `ScreenHeader` (title `profile.settings.language`), `RadioBlock` over `["device", "pt", "es", "en"]` bound to a local `draft` state initialised from `useLanguagePreference()`, and `<Button testID="language-confirm" label={t("profile.settings.languageConfirm")} disabled={draft === saved || saving} />` that calls `choose(draft)` and then `back()`.
- Copy `profile.settings.languageConfirm`: pt "Confirmar", en "Confirm", es "Confirmar".

## Task 3 — docs and verification

- ADR 012 amendment: the selector lives in Settings > Language and applies on Confirm.
- Task 21 line in `docs/project-status.md`: mention the Language screen.
- typecheck, lint, Jest, e2e (all green), then commit, push to the PR, and refresh `validate-local` for the phone.
