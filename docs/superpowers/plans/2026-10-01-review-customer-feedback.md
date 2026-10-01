# Review Screen Customer Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Explain why "Confirmar" is disabled on the booking review screen when the customer lookup fails or finds no active customer.

**Architecture:** In `book/review.tsx`, render an inline danger message above the button for two states (`customers.error`, and `customers.isSuccess` without `customer`). The error state also shows a "Tentar de novo" button calling `customers.refetch()`. Two new `book.*` i18n keys in en/pt/es; the existing `common.tryAgain` is reused for the retry label.

**Tech Stack:** Expo Router, React Query, i18next, Jest (source-reading unit tests).

**Spec:** Design approved in chat (bounded path, no spec file).

## Global Constraints

- Inline message style matches `timesError`: `text-sm font-sans text-danger-500`.
- Keys live in `book` next to `timesError`; retry label is `common.tryAgain`.
- No change to `listMyCustomers` or to the button's `disabled` rule.

---

### Task 1: Inline customer-lookup feedback with retry

**Files:**
- Create: `tests/unit/review-customer-feedback.test.ts`
- Modify: `app/(customer)/(tabs)/book/review.tsx:146-152`
- Modify: `src/i18n/locales/en.ts`, `src/i18n/locales/pt.ts`, `src/i18n/locales/es.ts` (`book` block, after `timesError`)

**Interfaces:**
- Produces: i18n keys `book.customerError`, `book.customerMissing`.

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..", "..");
const read = (file: string) => readFileSync(join(root, file), "utf8");

describe("review screen customer feedback", () => {
  const review = read("app/(customer)/(tabs)/book/review.tsx");

  it("explains a failed customer lookup and offers a retry", () => {
    expect(review).toContain('t("book.customerError")');
    expect(review).toContain("customers.refetch()");
    expect(review).toContain('t("common.tryAgain")');
  });

  it("explains a missing active customer", () => {
    expect(review).toContain('t("book.customerMissing")');
  });

  it.each(["en", "pt", "es"])("%s locale has both keys", (locale) => {
    const source = read(`src/i18n/locales/${locale}.ts`);
    expect(source).toMatch(/customerError:/);
    expect(source).toMatch(/customerMissing:/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `rtk npx jest tests/unit/review-customer-feedback.test.ts`
Expected: FAIL (strings missing).

- [ ] **Step 3: Add locale keys (after `timesError` in each `book` block)**

pt: `customerError: "Não foi possível carregar seu cadastro de cliente.",` and `customerMissing: "Não encontramos um cadastro de cliente ativo para sua conta.",`
en: `customerError: "Unable to load your customer profile.",` and `customerMissing: "We couldn't find an active customer profile for your account.",`
es: `customerError: "No se pudo cargar tu perfil de cliente.",` and `customerMissing: "No encontramos un perfil de cliente activo para tu cuenta.",`

Keep keys alphabetical if the block is sorted (they go before `dateTitle`/`error`; place by order of the existing block).

- [ ] **Step 4: Edit review.tsx** — replace the button wrapper:

```tsx
          <View className="w-full max-w-[420px] gap-2">
            {customers.error ? (
              <>
                <Text className="text-sm font-sans text-danger-500">{t("book.customerError")}</Text>
                <Button label={t("common.tryAgain")} onPress={() => void customers.refetch()} variant="outline" />
              </>
            ) : null}
            {customers.isSuccess && !customer ? (
              <Text className="text-sm font-sans text-danger-500">{t("book.customerMissing")}</Text>
            ) : null}
            <Button
              disabled={!startsAt || !customer || booking.isPending}
              label={t("book.confirm")}
              onPress={submit}
            />
          </View>
```

- [ ] **Step 5: Verify**

Run: `rtk npx jest tests/unit/review-customer-feedback.test.ts tests/unit/stale-slot-recovery.test.ts && rtk npm run typecheck && rtk npm run lint`
Expected: all PASS. Then check the screen in the browser (computed CSS of the message).

- [ ] **Step 6: Commit**

```bash
git add tests/unit/review-customer-feedback.test.ts "app/(customer)/(tabs)/book/review.tsx" src/i18n/locales docs/superpowers/plans/2026-10-01-review-customer-feedback.md
git commit -m "fix(booking): explain disabled confirm when customer lookup fails"
```

## Self-Review

Covers both states (error, missing) plus retry; keys defined in Task 1 match usage; no placeholders.
