# Figma sync (staff plan cards, WhatsApp wrap, paid-rent shop income) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the barber and owner screens in line with the Figma file: the plan-card standard (`PlanSummary`) on every staff plan card, a WhatsApp link that wraps instead of being clipped, and "Receita da barbearia" counting only the chair rent already paid.

**Architecture:** `PlanSummary` gets optional parts and one shared helper (`staffPlanPrice`) so the staff cards render the same block as the customer card. `RequestCard` and `CancellationCard` (shared by owner and barber) and three screens switch to it. The shop-income rule is a pure change in `owner-reports/build.ts` (the paid rent already comes from `get_shop_report`), plus copy. No migration.

**Tech Stack:** Expo / React Native + NativeWind, react-i18next (pt/en/es), Jest + @testing-library/react-native, Playwright (web e2e).

**Spec:** `docs/superpowers/specs/2026-10-23-figma-sync-design.md`

## Global Constraints

- Strict TDD: red, then green, per task; run typecheck/lint/tests incrementally (project rule).
- `className` only on plain RN elements (`View`, `Text`, `Pressable`), never on Reanimated components (project rule: they drop it on web).
- Every user-visible string goes through i18n, with the same keys in `pt.ts`, `en.ts` and `es.ts` (`locale-parity` and `no-hardcoded-text` tests).
- No fixed heights on cards; card text follows the Figma "Detail" style: `text-sm font-sans text-neutral-700`.
- Lint: `npx eslint app src tests` (the root `npm run lint` is broken by `.claude/worktrees`). Typecheck: `npm run typecheck`.
- Before committing, `git checkout -- tsconfig.json` if Expo rewrote it.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

### Task 1: `PlanSummary` optional parts, `staffPlanPrice`, new i18n keys

**Files:**
- Modify: `src/features/recurrence/PlanSummary.tsx`
- Modify: `src/features/recurrence/price-text.ts`
- Modify: `src/i18n/locales/pt.ts`, `en.ts`, `es.ts` (key `recurrence.normalPriceLabel`; `owner.recurring.*` rewrite; `owner.revenue.shopIncomeHint` is Task 5)
- Test: `tests/unit/plan-summary.test.ts` (create), `tests/unit/recurrence-pricing.test.ts` (extend)

**Interfaces:**
- Produces: `PlanSummary({ amountText?, caption?, normalText?, periodicity?, title })`; `staffPlanPrice(t, priceCents, weeks): { amountText: string; caption: string }`; i18n keys `recurrence.normalPriceLabel`, `owner.recurring.priceState` (`{{price}} · {{state}}`), `owner.recurring.when` (`{{date}} · {{time}}`), and capitalised `owner.recurring.catalogPrice|active|inactive`. The key `owner.recurring.detail` is removed.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/plan-summary.test.ts`:

```ts
import React from "react";
import { render } from "@testing-library/react-native";

import { PlanSummary } from "../../src/features/recurrence/PlanSummary";

describe("PlanSummary", () => {
  it("renders every part when given", async () => {
    const view = await render(React.createElement(PlanSummary, { amountText: "R$ 160,00", caption: "4 sessions per month", normalText: "Regular price R$ 180,00", periodicity: "Weekly", title: "Cut" }));

    expect(view.getByText(/Cut/)).toBeTruthy();
    expect(view.getByText("Weekly")).toBeTruthy();
    expect(view.getByTestId("plan-amount")).toBeTruthy();
    expect(view.getByText("4 sessions per month")).toBeTruthy();
    expect(view.getByText("Regular price R$ 180,00")).toBeTruthy();
  });

  it("renders nothing for the parts that are missing", async () => {
    const view = await render(React.createElement(PlanSummary, { title: "Cut" }));

    expect(view.getByText("Cut")).toBeTruthy();
    expect(view.queryByTestId("plan-amount")).toBeNull();
  });
});
```

Append to `tests/unit/recurrence-pricing.test.ts` (extend the existing import to `import { planValue, recurrencePriceText, staffPlanPrice } from ...`):

```ts
describe("staffPlanPrice", () => {
  it("puts the 4-week total beside the title and the per-session caption under it", () => {
    expect(staffPlanPrice(t, 2500, 1)).toEqual({
      amountText: "R$ 100,00",
      caption: recurrencePriceText(t, 2500, 1),
    });
  });

  it("falls back to the per-session price when 4 weeks is not a whole number of sessions", () => {
    const price = staffPlanPrice(t, 2500, 3);

    expect(price.amountText).toBe("R$ 25,00");
    expect(price.caption).not.toContain("recurrence.fourWeeks");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/unit/plan-summary.test.ts tests/unit/recurrence-pricing.test.ts`
Expected: FAIL (`staffPlanPrice` is not exported; the title-only render crashes on a missing `amountText`).

- [ ] **Step 3: Implement**

Replace `src/features/recurrence/PlanSummary.tsx`:

```tsx
import { Text, View } from "react-native";

// The plan as people read it: title (and periodicity) on the left, the plan's value highlighted on the right, then what the
// value covers and the regular price. Every part but the title is optional, so the staff cards can drop what they do not know.
// Used by the customer plan card and checkout, and by the barber and owner plan, request and series cards.
export function PlanSummary({ amountText, caption, normalText, periodicity, title }: { amountText?: string; caption?: string; normalText?: string; periodicity?: string; title: string }) {
  return (
    <View className="gap-1">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className="flex-1 text-base font-sans-semibold text-ink">{title}{periodicity ? " " : null}{periodicity ? <Text className="font-sans text-neutral-600">{periodicity}</Text> : null}</Text>
        {amountText ? <Text className="text-xl font-display-bold text-ink" style={{ fontVariant: ["tabular-nums"] }} testID="plan-amount">{amountText}</Text> : null}
      </View>
      {caption ? <Text className="text-sm font-sans text-neutral-700">{caption}</Text> : null}
      {normalText ? <Text className="text-xs font-sans text-neutral-600">{normalText}</Text> : null}
    </View>
  );
}
```

Append to `src/features/recurrence/price-text.ts`:

```ts
// What the staff cards show beside a plan's title: the 4-week total (the per-session price when there is none) and the
// "per session · N sessions in 4 weeks" caption under it.
export function staffPlanPrice(t: TFunction, priceCents: number, weeks: number) {
  return { amountText: formatPriceBRL(planValue(t, priceCents, weeks).amountCents), caption: recurrencePriceText(t, priceCents, weeks) };
}
```

i18n — in each locale, next to `normalPrice` inside `recurrence`: pt `normalPriceLabel: "Preço normal"`, en `normalPriceLabel: "Regular price"`, es `normalPriceLabel: "Precio normal"`. In each locale's `owner.recurring`: delete `detail`; add `priceState: "{{price}} · {{state}}"` and `when: "{{date}} · {{time}}"`; change `catalogPrice`/`active`/`inactive` to pt `"Preço do catálogo"`/`"Ativa"`/`"Inativa"`, en `"Catalog price"`/`"Active"`/`"Inactive"`, es `"Precio de catálogo"`/`"Activa"`/`"Inactiva"`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/unit/plan-summary.test.ts tests/unit/recurrence-pricing.test.ts tests/unit/locale-parity.test.ts && npm run typecheck`
Expected: PASS. (`typecheck` may flag `app/(owner)/monthly-customers.tsx` for the removed `detail` key only if the key type is checked; Task 3 rewrites that call.)

- [ ] **Step 5: Commit**

```bash
git add src/features/recurrence src/i18n tests/unit/plan-summary.test.ts tests/unit/recurrence-pricing.test.ts
git commit -m "feat: PlanSummary takes optional parts; staffPlanPrice shared by the staff plan cards"
```

---

### Task 2: Request and cancellation cards use `PlanSummary`; WhatsApp link wraps

**Files:**
- Modify: `src/components/domain/ContactLink.tsx`
- Modify: `src/features/recurrence/RequestCard.tsx`
- Modify: `src/features/recurrence/CancellationCard.tsx`
- Test: `tests/unit/recurrence-staff-cards.test.ts` (create)

**Interfaces:**
- Consumes: `PlanSummary`, `staffPlanPrice`, `recurrence.normalPriceLabel` (Task 1).
- Produces: `ContactLink` prop `fill?: boolean` (default `true`: unchanged equal-width behaviour; `false`: hugs its content and never shrinks, so a `flex-wrap` row wraps it).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/recurrence-staff-cards.test.ts`:

```ts
import React from "react";
import { render } from "@testing-library/react-native";

import { CancellationCard } from "../../src/features/recurrence/CancellationCard";
import { RequestCard } from "../../src/features/recurrence/RequestCard";

const request = { barberId: "b1", barberName: "Rafael Souza", customerName: "Carlos Mendes", customerPhone: null, id: "rq1", normalCents: 4500, recurrenceCents: 4000, serviceName: "Corte masculino", startDate: "2026-10-22", startTime: "14:00", weeks: 1 };

describe("RequestCard", () => {
  it("follows the plan card standard when the request has a special price", async () => {
    const view = await render(React.createElement(RequestCard, { busy: false, onDecide: jest.fn(), request }));

    expect(view.getByText(/Corte masculino/)).toBeTruthy();
    expect(view.getByText("R$ 160,00")).toBeTruthy();
    expect(view.getByText("R$ 40,00 per session · 4 sessions in 4 weeks = R$ 160,00")).toBeTruthy();
    expect(view.getByText("Regular price R$ 45,00")).toBeTruthy();
    expect(view.getByText("Carlos Mendes")).toBeTruthy();
    expect(view.getByText("Rafael Souza")).toBeTruthy();
    expect(view.getByText(/14:00/)).toBeTruthy();
  });

  it("shows the regular price as the value, with its label, when there is no special price", async () => {
    const view = await render(React.createElement(RequestCard, { busy: false, onDecide: jest.fn(), request: { ...request, recurrenceCents: null } }));

    expect(view.getByText("R$ 45,00")).toBeTruthy();
    expect(view.getByText("Regular price")).toBeTruthy();
    expect(view.queryByText(/per session/)).toBeNull();
  });
});

describe("CancellationCard", () => {
  it("shows service and periodicity without a value, then customer and barber", async () => {
    const view = await render(React.createElement(CancellationCard, { busy: false, onDecide: jest.fn(), request: { barberName: "Rafael Souza", customerName: "Ana Souza", customerPhone: null, requestedAt: "2026-10-20T10:00:00Z", seriesId: "s1", serviceName: "Corte masculino", weeks: 1 } }));

    expect(view.getByText(/Corte masculino/)).toBeTruthy();
    expect(view.getByText("Ana Souza")).toBeTruthy();
    expect(view.getByText("Rafael Souza")).toBeTruthy();
    expect(view.queryByTestId("plan-amount")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/unit/recurrence-staff-cards.test.ts`
Expected: FAIL (`R$ 160,00` and the caption are not rendered by the current cards).

- [ ] **Step 3: Implement**

`src/components/domain/ContactLink.tsx` — add the prop and use it (the rest of the file stays):

```tsx
// `fill` (default) shares the row equally with its siblings; `fill={false}` keeps the link's own width so a wrapping row drops it to the next line.
export function ContactLink({ children, fill = true, icon: Icon, testID, url }: { children: string; fill?: boolean; icon: LucideIcon; testID: string; url: string | null }) {
  const grow = fill ? "flex-1" : "shrink-0";
  const body = (
    <View className={`min-h-[44px] ${fill ? "flex-1 " : ""}flex-row items-center justify-center gap-2 rounded-full border border-neutral-200 bg-surface px-4 ${url ? "" : "opacity-50"}`}>
      <Icon color={colors.primary[600]} size={18} />
      <Text className="text-sm font-sans-semibold text-ink">{children}</Text>
    </View>
  );

  if (!url) return <View className={grow} testID={testID}>{body}</View>;

  // On the web a real anchor keeps the link openable in a new tab; on native Linking hands it to WhatsApp or the dialer.
  const linkProps = Platform.OS === "web"
    ? ({ href: url, hrefAttrs: { rel: "noopener noreferrer", target: "_blank" } } as object)
    : { onPress: () => void Linking.openURL(url) };

  return (
    <Pressable accessibilityRole="link" className={grow} testID={testID} {...linkProps}>
      {body}
    </Pressable>
  );
}
```

`src/features/recurrence/RequestCard.tsx` — new imports (`PlanSummary`, `staffPlanPrice`) and body:

```tsx
import { PlanSummary } from "./PlanSummary";
import { staffPlanPrice } from "./price-text";
// (drop the now unused `recurrencePriceText` import)

export function RequestCard({ busy, onDecide, request }: { busy: boolean; onDecide: (accept: boolean) => void; request: StaffRecurrenceRequest }) {
  const { t } = useTranslation();
  const language = useLanguage();
  const special = request.recurrenceCents;
  // A special price shows the plan's value for 4 weeks; without one the regular price stands in, labelled as such.
  const price = special !== null
    ? { ...staffPlanPrice(t, special, request.weeks), normalText: t("recurrence.normalPrice", { price: formatPriceBRL(request.normalCents) }) }
    : { amountText: formatPriceBRL(request.normalCents), caption: undefined, normalText: t("recurrence.normalPriceLabel") };

  return (
    <Card testID={`request-${request.id}`} variant="outlined">
      <View className="gap-2">
        <PlanSummary {...price} periodicity={recurrenceLabel(t, request.weeks)} title={request.serviceName} />
        <Text className="text-sm font-sans text-neutral-700">{request.customerName}</Text>
        <Text className="text-sm font-sans text-neutral-700">{request.barberName}</Text>
        <Text className="text-sm font-sans text-neutral-700" style={{ fontVariant: ["tabular-nums"] }}>{formatDateNumeric(request.startDate, language)} {request.startTime}</Text>
        <View className="flex-row flex-wrap items-center gap-2">
          <Button disabled={busy} label={t("recurrence.accept")} onPress={() => onDecide(true)} size="sm" testID={`request-accept-${request.id}`} />
          <Button disabled={busy} label={t("recurrence.reject")} onPress={() => onDecide(false)} size="sm" testID={`request-reject-${request.id}`} variant="danger" />
          {request.customerPhone ? (
            <ContactLink fill={false} icon={MessageCircle} testID={`request-whatsapp-${request.id}`} url={whatsappUrl(request.customerPhone)}>{t("barber.clients.whatsapp")}</ContactLink>
          ) : null}
        </View>
      </View>
    </Card>
  );
}
```

`src/features/recurrence/CancellationCard.tsx` — same pattern:

```tsx
import { PlanSummary } from "./PlanSummary";

export function CancellationCard({ busy, onDecide, request }: { busy: boolean; onDecide: (accept: boolean) => void; request: CancellationRequest }) {
  const { t } = useTranslation();

  return (
    <Card testID={`cancellation-${request.seriesId}`} variant="outlined">
      <View className="gap-2">
        <PlanSummary periodicity={recurrenceLabel(t, request.weeks)} title={request.serviceName} />
        <Text className="text-sm font-sans text-neutral-700">{request.customerName}</Text>
        <Text className="text-sm font-sans text-neutral-700">{request.barberName}</Text>
        <View className="flex-row flex-wrap items-center gap-2">
          <Button disabled={busy} label={t("recurrence.acceptCancellation")} onPress={() => onDecide(true)} size="sm" testID={`cancellation-accept-${request.seriesId}`} variant="danger" />
          <Button disabled={busy} label={t("recurrence.keepPlan")} onPress={() => onDecide(false)} size="sm" testID={`cancellation-decline-${request.seriesId}`} variant="outline" />
          {request.customerPhone ? (
            <ContactLink fill={false} icon={MessageCircle} testID={`cancellation-whatsapp-${request.seriesId}`} url={whatsappUrl(request.customerPhone)}>{t("barber.clients.whatsapp")}</ContactLink>
          ) : null}
        </View>
      </View>
    </Card>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/unit/recurrence-staff-cards.test.ts tests/unit/plan-summary.test.ts && npm run typecheck && npx eslint src tests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/domain/ContactLink.tsx src/features/recurrence tests/unit/recurrence-staff-cards.test.ts
git commit -m "feat: request and cancellation cards follow the plan card standard; WhatsApp link wraps"
```

---

### Task 3: Owner screens — Planos de recorrência and Clientes recorrentes (Ativos/Encerrados)

**Files:**
- Modify: `app/(owner)/recurrence-plans.tsx:44-55`
- Modify: `app/(owner)/monthly-customers.tsx` (labels map `:82-91`, series card `:173-209`, imports)
- Test: covered by the e2e specs updated in Task 6 (screens are not unit-rendered in this project)

**Interfaces:**
- Consumes: `PlanSummary`, `staffPlanPrice`, `owner.recurring.priceState|when|catalogPrice|active|inactive|endedBadge` (Task 1).

- [ ] **Step 1: Update the e2e expectations first (red)**

In `tests/e2e/owner-recurring.web.spec.ts` replace lines 132-134 with:

```ts
  await expect(page.getByTestId(`series-${R1}`)).toContainText("Cut");
  await expect(page.getByTestId(`series-${R1}`)).toContainText("Bruno Barber");
  await expect(page.getByTestId(`series-${R1}`)).toContainText("R$ 30,00");
  await expect(page.getByTestId(`series-${R2}`)).toContainText("Catalog price");
```

In `tests/e2e/owner-recurrence-plans.web.spec.ts` add after line 62: `await expect(page.getByTestId(`plan-${P1}`)).toContainText("Regular price");`.

Run (steps in Task 6 give the server recipe): `PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4173 npx playwright test tests/e2e/owner-recurring.web.spec.ts tests/e2e/owner-recurrence-plans.web.spec.ts`
Expected: FAIL (`Catalog price`, `Regular price` not on screen yet).

- [ ] **Step 2: Implement `recurrence-plans.tsx`**

Imports: add `import { PlanSummary } from "../../src/features/recurrence/PlanSummary";` and `staffPlanPrice` next to `recurrencePriceText` in the `price-text` import (remove `recurrencePriceText`). Replace the card body (lines 44-55):

```tsx
            {(plans.data ?? []).map((plan) => {
              const price = staffPlanPrice(t, plan.priceCents, plan.weeks);

              return (
                <Card key={plan.id} testID={`plan-${plan.id}`} variant="outlined">
                  <View className="gap-2">
                    <PlanSummary amountText={price.amountText} caption={price.caption} normalText={t("recurrence.normalPrice", { price: formatPriceBRL(plan.normalCents) })} title={`${planTitle(plan)}${plan.active ? "" : ` ${t("owner.plans.inactive")}`}`} />
                    <Text className="text-sm font-sans text-neutral-700">{plan.serviceName} · {recurrenceLabel(t, plan.weeks)}</Text>
                    <View className="flex-row">
                      <Button label={t("common.edit")} onPress={() => router.push({ params: { id: plan.id }, pathname: "/recurrence-plan-form" })} size="sm" testID={`plan-edit-${plan.id}`} variant="outline" />
                    </View>
                  </View>
                </Card>
              );
            })}
```

- [ ] **Step 3: Implement `monthly-customers.tsx`**

Imports: add `import { PlanSummary } from "../../src/features/recurrence/PlanSummary";`. Replace the `labels` memo (lines 81-91) with a map of separate names:

```tsx
  // The service and barber names behind each series' barber service; the card shows them on separate lines.
  const labels = useMemo(() => {
    const map = new Map<string, { barberName: string; serviceName: string }>();
    for (const item of data.data?.barberServices ?? []) {
      const barber = data.data?.barbers.find((candidate: OwnerBarber) => candidate.id === item.barberId);
      const service = data.data?.services.find((candidate) => candidate.id === item.serviceId);
      if (barber && service) map.set(item.id, { barberName: barber.name, serviceName: service.name });
    }

    return map;
  }, [data.data]);
```

Replace the series `Card` header (lines 175-185, from `<Text ...>{item.customerName ...` through the closing `</Text>` of the detail) with:

```tsx
                          <PlanSummary periodicity={recurrenceLabel(t, item.intervalWeeks)} title={labels.get(item.barberServiceId)?.serviceName ?? "—"} />
                          <Text className="text-sm font-sans text-neutral-700">
                            {t("owner.recurring.priceState", {
                              price: item.specialPriceCents === null ? t("owner.recurring.catalogPrice") : formatPriceBRL(item.specialPriceCents),
                              state: item.endedAt !== null ? t("owner.recurring.endedBadge") : item.active ? t("owner.recurring.active") : t("owner.recurring.inactive"),
                            })}
                          </Text>
                          <Text className="text-sm font-sans text-neutral-700">{item.customerName || item.customerId}</Text>
                          {labels.get(item.barberServiceId) ? <Text className="text-sm font-sans text-neutral-700">{labels.get(item.barberServiceId)?.barberName}</Text> : null}
                          <Text className="text-sm font-sans text-neutral-700" style={{ fontVariant: ["tabular-nums"] }}>
                            {t("owner.recurring.when", { date: formatDateNumeric(item.localStartDate, language), time: item.localStartTime })}
                          </Text>
```

(the buttons row below stays as is).

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npx eslint app src tests && npx jest tests/unit/locale-parity.test.ts tests/unit/no-hardcoded-text.test.ts`, then the two Playwright specs from Step 1.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(owner)/recurrence-plans.tsx" "app/(owner)/monthly-customers.tsx" tests/e2e/owner-recurring.web.spec.ts tests/e2e/owner-recurrence-plans.web.spec.ts
git commit -m "feat: owner plan list and recurring customers follow the plan card standard"
```

---

### Task 4: Barber Planos — active plans use `PlanSummary`

**Files:**
- Modify: `app/(barber)/my-profile/recurrence.tsx:120-129`
- Test: `tests/e2e/barber-plans-end.web.spec.ts` (assertions already hold; add one for the new structure)

- [ ] **Step 1: Add the failing assertion**

In `tests/e2e/barber-plans-end.web.spec.ts` after line 61 add:

```ts
  await expect(page.getByTestId("my-series-s1")).toContainText("Starts on");
```

Run: `PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4173 npx playwright test tests/e2e/barber-plans-end.web.spec.ts`
Expected: this assertion already passes today, so the real red check for this task is the browser comparison in Task 6; keep the assertion as a regression guard. (If it fails because of locale wording, use the exact English string from `recurrence.startsOn`.)

- [ ] **Step 2: Implement**

Add `import { PlanSummary } from "../../../src/features/recurrence/PlanSummary";`. Replace the card body (lines 121-128):

```tsx
                    <View className="gap-2">
                      <PlanSummary periodicity={recurrenceLabel(t, plan.intervalWeeks)} title={plan.serviceName} />
                      <Text className="text-sm font-sans text-neutral-700">{plan.customerName}</Text>
                      <Text className="text-sm font-sans text-neutral-700" style={{ fontVariant: ["tabular-nums"] }}>{t("recurrence.startsOn", { date: formatDateNumeric(plan.localStartDate, language) })} · {plan.localStartTime}</Text>
                      <View className="flex-row">
                        <Button disabled={endPlan.isPending} label={t("recurrence.endPlan")} onPress={() => setEnding(plan)} size="sm" testID={`my-series-end-${plan.id}`} variant="outline" />
                      </View>
                    </View>
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npx eslint app src tests`, then `PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4173 npx playwright test tests/e2e/barber-plans-end.web.spec.ts tests/e2e/barber-recurrence.web.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/(barber)/my-profile/recurrence.tsx" tests/e2e/barber-plans-end.web.spec.ts
git commit -m "feat: barber active plans follow the plan card standard"
```

---

### Task 5: "Receita da barbearia" counts only the rent already paid

**Files:**
- Modify: `src/features/owner-reports/build.ts:31,36`
- Modify: `src/i18n/locales/pt.ts:425`, `en.ts:426`, `es.ts:425` (`owner.revenue.shopIncomeHint`)
- Test: `tests/unit/owner-report-build.test.ts`, `tests/e2e/owner-revenue.web.spec.ts:51-53`

- [ ] **Step 1: Update the tests first (red)**

In `tests/unit/owner-report-build.test.ts` change the expected `shopIncomeCents` from `20600` to `11600` (16000 − 9400 + 5000 paid) and the `barberRows` test to:

```ts
describe("barberRows", () => {
  it("adds each barber's shop share: revenue minus their share plus the rent already paid", () => {
    expect(barberRows(report).map((r) => [r.name, r.shopShareCents])).toEqual([["Ana", 6600], ["Bruno", 5000], ["Davi", 0]]);
  });
});
```

(rename the first test's title to `adds up revenue, shares, rent and shop income (paid rent only)`.)

In `tests/e2e/owner-revenue.web.spec.ts` change lines 52-53 to:

```ts
  // 16000 - (4400 + 5000) + 0 paid = 6600 (the fixture has no rent payments)
  await expect(page.getByTestId("stat-shop-income")).toContainText("R$ 66,00");
```

Run: `npx jest tests/unit/owner-report-build.test.ts`
Expected: FAIL (still adds the estimate).

- [ ] **Step 2: Implement**

`src/features/owner-reports/build.ts`: line 31 `shopIncomeCents: days.grossCents - barberShareCents + rentPaidCents,` and line 36:

```ts
  return report.barbers.map((b) => ({ ...b, shopShareCents: b.grossCents - b.barberShareCents + b.rentPaidCents }));
```

Hints: pt `shopIncomeHint: "Após repasse a colaboradores"`, en `"After payouts to collaborators"`, es `"Tras el pago a colaboradores"`.

- [ ] **Step 3: Verify**

Run: `npx jest tests/unit/owner-report-build.test.ts tests/unit/locale-parity.test.ts tests/integration/owner-report.test.ts && npm run typecheck`, then `PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4173 npx playwright test tests/e2e/owner-revenue.web.spec.ts`
Expected: PASS. If the third e2e test (records a rent payment) asserts a shop-income figure that now differs, update it to the paid-rent value.

- [ ] **Step 4: Commit**

```bash
git add src/features/owner-reports/build.ts src/i18n/locales tests/unit/owner-report-build.test.ts tests/e2e/owner-revenue.web.spec.ts
git commit -m "fix: shop income counts only the chair rent already paid"
```

---

### Task 6: Verify in the browser, review, PR

**Files:** none new.

- [ ] **Step 1: Full local gate**

Run: `npm run typecheck && npx eslint app src tests && npm test -- --runInBand`
Expected: all green (a few pre-existing failures are recorded in the project memory; compare with `main` before blaming this change).

- [ ] **Step 2: e2e fast loop**

Move `.env.local` aside (`mv .env.local .env.local.bak`), start `CI=1 EXPO_NO_DOTENV=1 EXPO_PUBLIC_SUPABASE_URL=https://example.supabase.co EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test-publishable-key NODE_OPTIONS=--max-old-space-size=6144 npx expo start --web --clear --port 4173` in the background, then run the five specs touched here with `PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4173 npx playwright test <files>`, then the whole suite once. Restore `.env.local` afterwards.
Expected: PASS.

- [ ] **Step 3: Browser check against Figma (project rule)**

With the dev server on the local Supabase (`owner@teste.com`, `barber@teste.com`), at 375 px compare with the Figma screenshots: owner Planos de recorrência (`30:1575`), Clientes recorrentes Pedidos (`31:2016`) and Ativos (`56:2741`), Receita (`29:664`), barber Planos (`31:4470`). Check: value on the right, caption and regular price under the title, customer / barber / date lines, WhatsApp on its own row with its icon, no clipped text, Receita hint text.

- [ ] **Step 4: Code review, then PR**

Invoke `requesting-code-review` on the branch diff; fix what it finds. Then `git push -u origin feat-figma-sync-staff-plans` and open the PR with `gh api` REST (see memory: `gh pr create` fails on a Projects-classic GraphQL error), base `main`. Do not merge.
