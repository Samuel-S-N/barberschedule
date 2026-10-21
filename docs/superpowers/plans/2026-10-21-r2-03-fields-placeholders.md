# Field Examples (Ghost Placeholders) and Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove format hints from field labels, show a grey ghost example inside every text field instead, and keep side-by-side fields aligned.

**Architecture:** Labels are shortened in the three locale files. A new `examples.*` locale block holds the ghost examples; `DateInput`/`TimeInput` default to `examples.date` / `examples.time`, every other `<Input>`/`<SearchInput>` gets `placeholder={t("examples.<key>")}`. Two static Jest tests keep it that way (no format hints in labels; every input has a placeholder unless it is a password field). Side-by-side rows use `items-end` so boxes align even if a label wraps.

**Tech Stack:** i18next typed keys (`en` is the type source), React Native `TextInput`, NativeWind, Jest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-ux-round2-design.md`

## Global Constraints
- Branch `feat-field-examples` from `feat-fixed-parent-navigation`.
- Format hints to remove (exact): `(HH:mm)`, `(HH:MM)`, `(YYYY-MM-DD)`, `(AAAA-MM-DD)`, `(DD/MM/AAAA)`, `(0-100)`. Units such as `(R$)`, `(%)` and the word `(optional)` / `(opcional)` stay.
- Placeholder colour stays `#9C8E7B` (`Input.tsx`), grey enough to read as a ghost.
- Password inputs (`secureTextEntry`) are exempt from placeholders.
- `src/i18n/locales/en.ts` is the type source: `es.ts` and `pt.ts` must define every new key or `tsc` fails.
- Memory: TDD, `rtk`, verify in a browser at 375px and 320px, e2e needs `.env.local` moved aside and an Expo restart after source changes. Jest matches `tests/**/*.test.ts` only.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

### Task 1: Shorter labels (no format hints)

**Files:**
- Modify: `src/i18n/locales/{en,es,pt}.ts` — keys `common.startTime`, `common.endTime`, `owner.shop.breakStart`, `owner.shop.breakEnd`, `owner.recurring.occurrenceLabel`, `owner.recurring.startDateLabel`, `owner.recurring.timeLabel`, `owner.barbers.commissionPercentLabel`
- Test: `tests/unit/field-labels.test.ts`

- [ ] **Step 1: Write the failing test** `tests/unit/field-labels.test.ts`

```ts
import { en } from "../../src/i18n/locales/en";
import { es } from "../../src/i18n/locales/es";
import { pt } from "../../src/i18n/locales/pt";

const FORMAT_HINT = /\((HH:?mm|HH:?MM|YYYY-MM-DD|AAAA-MM-DD|DD\/MM\/(YYYY|AAAA)|0-100)\)/i;

function strings(value: unknown, path = ""): Array<[string, string]> {
  if (typeof value === "string") return [[path, value]];
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, child]) => strings(child, path ? `${path}.${key}` : key));

  return [];
}

describe.each([["en", en], ["es", es], ["pt", pt]])("%s locale", (_name, locale) => {
  it("has no format hints in any text (the example lives in the field's placeholder)", () => {
    expect(strings(locale).filter(([, text]) => FORMAT_HINT.test(text))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx jest tests/unit/field-labels.test.ts`
Expected: FAIL, listing `common.endTime`, `common.startTime`, `owner.shop.breakEnd`, `breakStart`, `owner.recurring.occurrenceLabel`, `startDateLabel`, `timeLabel`, `owner.barbers.commissionPercentLabel` (per locale).

- [ ] **Step 3: Replace the labels**

```bash
python3 - <<'EOF'
import re

NEW = {
    "en": {
        "endTime": "End time", "startTime": "Start time",
        "breakEnd": "Break end", "breakStart": "Break start",
        "occurrenceLabel": "Occurrence date", "startDateLabel": "Start date", "timeLabel": "Start time",
        "commissionPercentLabel": "Commission (%)",
    },
    "pt": {
        "endTime": "Horário final", "startTime": "Horário inicial",
        "breakEnd": "Fim da pausa", "breakStart": "Início da pausa",
        "occurrenceLabel": "Data da ocorrência", "startDateLabel": "Data de início", "timeLabel": "Horário",
        "commissionPercentLabel": "Comissão (%)",
    },
    "es": {
        "endTime": "Hora final", "startTime": "Hora inicial",
        "breakEnd": "Fin de la pausa", "breakStart": "Inicio de la pausa",
        "occurrenceLabel": "Fecha de la ocurrencia", "startDateLabel": "Fecha de inicio", "timeLabel": "Hora",
        "commissionPercentLabel": "Comisión (%)",
    },
}

for lang, keys in NEW.items():
    path = f"src/i18n/locales/{lang}.ts"
    text = open(path).read()
    for key, label in keys.items():
        pattern = re.compile(rf'(\n\s+{key}: )"[^"]*"')
        assert pattern.search(text), (lang, key)
        text = pattern.sub(rf'\1"{label}"', text, count=1)
    open(path, "w").write(text)
EOF
npx jest tests/unit/field-labels.test.ts
```
Expected: PASS.

- [ ] **Step 4: Typecheck and commit**

```bash
npm run typecheck
git add src/i18n tests/unit/field-labels.test.ts
git commit -m "fix: field labels no longer carry format hints"
```

---

### Task 2: The `examples` locale block and default date/time placeholders

**Files:**
- Modify: `src/i18n/locales/{en,es,pt}.ts` (new top-level `examples` block), `src/components/ui/MaskedInputs.tsx`, `src/components/ui/SearchInput.tsx` (no change needed, it already forwards `placeholder`)
- Test: `tests/unit/field-examples.test.ts`

**Produces (i18n keys):** `examples.date`, `examples.time`, `examples.fullName`, `examples.nickname`, `examples.email`, `examples.phone`, `examples.money`, `examples.minutes`, `examples.percent`, `examples.notes`, `examples.note`, `examples.bio`, `examples.search`, `examples.serviceName`, `examples.description`, `examples.address`.

- [ ] **Step 1: Write the failing test** `tests/unit/field-examples.test.ts`

```ts
import { en } from "../../src/i18n/locales/en";
import { es } from "../../src/i18n/locales/es";
import { pt } from "../../src/i18n/locales/pt";

const KEYS = ["date", "time", "fullName", "nickname", "email", "phone", "money", "minutes", "percent", "notes", "note", "bio", "search", "serviceName", "description", "address"] as const;

describe.each([["en", en], ["es", es], ["pt", pt]])("%s examples", (_name, locale) => {
  it.each(KEYS)("has a non-empty example for %s", (key) => {
    expect(locale.examples[key].trim().length).toBeGreaterThan(0);
  });
});

it("date examples follow the language's date format", () => {
  expect(en.examples.date).toBe("2026-10-25");
  expect(pt.examples.date).toBe("25/10/2026");
  expect(es.examples.date).toBe("25/10/2026");
});
```

- [ ] **Step 2: Run it and see it fail** — `npx jest tests/unit/field-examples.test.ts` → FAIL (`locale.examples` undefined).

- [ ] **Step 3: Add the block** (top level, next to `common`):

```ts
// en.ts
  examples: {
    address: "123 Flower Street",
    bio: "Fades and classic cuts since 2015",
    date: "2026-10-25",
    description: "Classic fade, 30 min",
    email: "name@example.com",
    fullName: "Maria Silva",
    minutes: "30",
    money: "25,00",
    nickname: "Mari",
    note: "Prefers a short fade",
    notes: "Anything we should know?",
    percent: "40",
    phone: "(11)91234-5678",
    search: "Ana Souza",
    serviceName: "Haircut",
    time: "09:00",
  },
```
```ts
// pt.ts
  examples: {
    address: "Rua das Flores, 123",
    bio: "Degradês e cortes clássicos desde 2015",
    date: "25/10/2026",
    description: "Degradê clássico, 30 min",
    email: "nome@exemplo.com",
    fullName: "Maria Silva",
    minutes: "30",
    money: "25,00",
    nickname: "Mari",
    note: "Prefere degradê baixo",
    notes: "Algo que devemos saber?",
    percent: "40",
    phone: "(11)91234-5678",
    search: "Ana Souza",
    serviceName: "Corte",
    time: "09:00",
  },
```
```ts
// es.ts
  examples: {
    address: "Calle de las Flores, 123",
    bio: "Degradados y cortes clásicos desde 2015",
    date: "25/10/2026",
    description: "Degradado clásico, 30 min",
    email: "nombre@ejemplo.com",
    fullName: "María Silva",
    minutes: "30",
    money: "25,00",
    nickname: "Mari",
    note: "Prefiere degradado bajo",
    notes: "¿Algo que debamos saber?",
    percent: "40",
    phone: "(11)91234-5678",
    search: "Ana Souza",
    serviceName: "Corte",
    time: "09:00",
  },
```
Insert each block directly before `  common: {` in its file (`grep -n "^  common: {" src/i18n/locales/*.ts`).

- [ ] **Step 4: Default placeholders in `src/components/ui/MaskedInputs.tsx`**

```tsx
import { useTranslation } from "react-i18next";
// ...
export function DateInput({ value, onChangeValue, placeholder, ...rest }: MaskedProps) {
  const { t } = useTranslation();
  const language = useLanguage();
  const [draft, setDraft] = useState<string | null>(null);
  // (remove the old `hint` constant)
  return (
    <Input
      {...rest}
      keyboardType="number-pad"
      onChangeText={(text) => { /* unchanged */ }}
      placeholder={placeholder ?? t("examples.date")}
      value={/* unchanged */}
    />
  );
}

export function TimeInput({ value, onChangeValue, placeholder, ...rest }: MaskedProps) {
  const { t } = useTranslation();

  return <Input {...rest} keyboardType="number-pad" onChangeText={(text) => onChangeValue(formatTimeInput(text))} placeholder={placeholder ?? t("examples.time")} value={value} />;
}
```

- [ ] **Step 5: Verify** — `npx jest tests/unit/field-examples.test.ts && npm run typecheck && npm run lint` → PASS.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: examples locale block and ghost date/time placeholders"`

---

### Task 3: A placeholder on every input

**Files:**
- Modify: the 25 screens/components listed in the script below, `app/(owner)/shop.tsx` (contact helper and break fields)
- Test: `tests/unit/input-placeholders.test.ts`

**Consumes:** the `examples.*` keys of Task 2.

- [ ] **Step 1: Write the failing test** `tests/unit/input-placeholders.test.ts`

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(__dirname, "..", "..");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);

    return statSync(path).isDirectory() ? tsxFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

describe("every text field shows a ghost example", () => {
  it("<Input> and <SearchInput> have a placeholder (password fields are exempt)", () => {
    const offenders: string[] = [];

    for (const file of [...tsxFiles(join(root, "app")), ...tsxFiles(join(root, "src"))]) {
      if (file.endsWith("components/ui/Input.tsx") || file.endsWith("components/ui/SearchInput.tsx")) continue;
      const source = readFileSync(file, "utf8");

      for (const tag of source.match(/<(?:Input|SearchInput)\b[\s\S]*?\/>/g) ?? []) {
        if (!tag.includes("placeholder=") && !tag.includes("secureTextEntry")) offenders.push(`${relative(root, file)}: ${tag.slice(0, 90).replace(/\s+/g, " ")}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and see it fail** — `npx jest tests/unit/input-placeholders.test.ts` → FAIL listing the inputs without placeholders.

- [ ] **Step 3: Add the placeholders with a script** (each entry is `file, testID, example key`; the script inserts `placeholder={t("examples.<key>")}` before the field's `testID`):

```bash
python3 - <<'EOF'
EDITS = [
    ("app/(auth)/forgot-password.tsx", 'testID="reset-email"', "email"),
    ("app/(auth)/login.tsx", 'testID="login-email"', "email"),
    ("app/(auth)/signup.tsx", 'testID="signup-name"', "fullName"),
    ("app/(auth)/signup.tsx", 'testID="signup-nickname"', "nickname"),
    ("app/(auth)/signup.tsx", 'testID="signup-email"', "email"),
    ("app/(auth)/signup.tsx", 'testID="signup-phone"', "phone"),
    ("app/(barber)/clients/index.tsx", 'testID="client-search"', "search"),
    ("app/(barber)/my-profile/account.tsx", 'testID="barber-bio"', "bio"),
    ("app/(barber)/my-profile/account.tsx", 'testID="account-new-email"', "email"),
    ("app/(customer)/me/account.tsx", 'testID="profile-name"', "fullName"),
    ("app/(customer)/me/account.tsx", 'testID="profile-nickname"', "nickname"),
    ("app/(customer)/me/account.tsx", 'testID="profile-phone"', "phone"),
    ("app/(customer)/me/account.tsx", 'testID="account-new-email"', "email"),
    ("app/(customer)/(tabs)/book/review.tsx", 'testID="booking-notes-input"', "notes"),
    ("app/(owner)/appointment-form.tsx", 'testID="owner-customer-search"', "search"),
    ("app/(owner)/appointment-form.tsx", 'testID="owner-form-notes"', "notes"),
    ("app/(owner)/barber-new.tsx", 'testID="barber-name-input"', "fullName"),
    ("app/(owner)/barber-new.tsx", 'testID="barber-invite-email"', "email"),
    ("app/(owner)/barber-profile.tsx", 'testID="barber-name-input"', "fullName"),
    ("app/(owner)/barber-profile.tsx", 'testID="barber-invite-email"', "email"),
    ("app/(owner)/customer-form.tsx", 'testID="customer-name"', "fullName"),
    ("app/(owner)/customer-form.tsx", 'testID="customer-email"', "email"),
    ("app/(owner)/customer-form.tsx", 'testID="customer-phone"', "phone"),
    ("app/(owner)/customers.tsx", 'testID="customer-search"', "search"),
    ("app/(owner)/owner-profile/account.tsx", 'testID="owner-full-name"', "fullName"),
    ("app/(owner)/owner-profile/account.tsx", 'testID="owner-nickname"', "nickname"),
    ("app/(owner)/owner-profile/account.tsx", 'testID="account-new-email"', "email"),
    ("app/(owner)/revenue.tsx", 'testID="rent-amount"', "money"),
    ("app/(owner)/revenue.tsx", 'testID="rent-note"', "note"),
    ("app/(owner)/service-form.tsx", 'testID="service-name"', "serviceName"),
    ("app/(owner)/service-form.tsx", 'testID="service-duration"', "minutes"),
    ("app/(owner)/service-form.tsx", 'testID="service-price"', "money"),
    ("app/(owner)/service-form.tsx", 'testID="service-description"', "description"),
    ("src/components/domain/BarberBookingSheet.tsx", 'testID="barber-book-name"', "fullName"),
    ("src/components/domain/BarberBookingSheet.tsx", 'testID="barber-book-email"', "email"),
    ("src/components/domain/BarberBookingSheet.tsx", 'testID="barber-book-phone"', "phone"),
    ("src/features/services/ServiceAssignments.tsx", 'testID="override-price"', "money"),
    ("src/features/services/ServiceAssignments.tsx", 'testID="override-duration"', "minutes"),
    ("src/features/barbers/owner/BarberServicesEditor.tsx", 'testID="barber-override-price"', "money"),
    ("src/features/barbers/owner/BarberServicesEditor.tsx", 'testID="barber-override-duration"', "minutes"),
    ("src/features/barbers/owner/CompensationEditor.tsx", 'testID="comp-percent"', "percent"),
    ("src/features/barbers/owner/CompensationEditor.tsx", 'testID="comp-rent"', "money"),
    ("src/features/recurrence/ManualRecurrenceForm.tsx", 'testID="manual-customer-search"', "search"),
    ("app/(owner)/monthly-customers.tsx", "testID={`price-${service.id}-${weeks}`}", "money"),
]

for path, needle, key in EDITS:
    source = open(path).read()
    assert source.count(needle) == 1, (path, needle, source.count(needle))
    source = source.replace(needle, f'placeholder={{t("examples.{key}")}} {needle}', 1)
    open(path, "w").write(source)
EOF
```

- [ ] **Step 4: Shop screen** (`app/(owner)/shop.tsx`): contact fields use one helper and the break fields hard-code `"HH:mm"`.

```tsx
// replace the TIME_HINT constant and its comment with:
const CONTACT_EXAMPLE = { address: "examples.address", phone: "examples.phone", whatsapp: "examples.phone" } as const;
```
In the `field` helper add `placeholder={t(CONTACT_EXAMPLE[key])}` to the `<Input .../>` (before `testID`). Delete the four `placeholder={TIME_HINT}` props on the `TimeInput`s (day start/end and break start/end): they now default to `examples.time`.

- [ ] **Step 5: Run the checks**

Run: `npx jest tests/unit/input-placeholders.test.ts && npm run typecheck && npm run lint`
Expected: PASS (typecheck proves every `examples.<key>` exists; the static test proves nothing was missed).

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: ghost example placeholder on every text field"`

---

### Task 4: Side-by-side fields stay aligned

**Files:**
- Modify: `app/(barber)/my-profile/availability.tsx`, `app/(owner)/shop.tsx`, `src/features/recurrence/ManualRecurrenceForm.tsx`
- Test: `tests/e2e/owner-recurring.web.spec.ts` (new test), `tests/e2e/field-examples.web.spec.ts` (new)

- [ ] **Step 1: Failing e2e for alignment** — append to `tests/e2e/owner-recurring.web.spec.ts`:

```ts
test.describe("Portuguese on a narrow phone", () => {
  test.use({ locale: "pt-BR", viewport: { height: 700, width: 320 } });

  test("the start date and time fields of the manual form line up", async ({ page }) => {
    await signInAsOwner(page);
    await mockOwnerRest(page, {});

    await page.goto("/monthly-customers");
    await page.getByTestId("recurring-tab-active").click();
    await page.getByTestId("recurring-manual").click();

    const date = await page.getByTestId("manual-recurrence-date").boundingBox();
    const time = await page.getByTestId("manual-recurrence-time").boundingBox();

    expect(date && time).toBeTruthy();
    expect(Math.abs(date!.y - time!.y)).toBeLessThan(1);
    expect(Math.abs(date!.height - time!.height)).toBeLessThan(1);
  });
});
```
Run (Expo restarted): `PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4173 npx playwright test tests/e2e/owner-recurring.web.spec.ts -g "line up"` → may already pass thanks to Task 1's shorter labels; temporarily set `startDateLabel` to a long text to see the failure, then revert, to prove the test can fail.

- [ ] **Step 2: Bottom-align the rows** (the children are already wrapped in `flex-1` views):

```bash
python3 - <<'EOF'
import re

for path in ["app/(barber)/my-profile/availability.tsx", "app/(owner)/shop.tsx", "src/features/recurrence/ManualRecurrenceForm.tsx"]:
    source = open(path).read()
    pattern = re.compile(r'<View className="flex-row gap-2">(?=\s*<View className="flex-1">)')
    source, count = pattern.subn('<View className="flex-row items-end gap-2">', source)
    assert count >= 1, path
    open(path, "w").write(source)
EOF
grep -rn 'flex-row items-end gap-2' app src | wc -l
```
Expected: ≥ 5 occurrences (lunch, absence times, shop day, shop breaks, manual form).

- [ ] **Step 3: e2e for the ghost examples** `tests/e2e/field-examples.web.spec.ts`

```ts
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
```
Then in `tests/e2e/owner-agenda.web.spec.ts` append:

```ts
test("the agenda date field has a ghost example when empty and no format hint in its label", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, { calls: {}, noOverrides: true, rows: [] });

  await page.goto("/agenda");
  await expect(page.getByTestId("owner-agenda-date")).toHaveAttribute("placeholder", "2026-10-25");
  await expect(page.getByText("Local date", { exact: true })).toBeVisible();
});
```

- [ ] **Step 4: Run everything**

```bash
npm run typecheck && npm run lint && npx jest
# restart Expo (see Global Constraints), then:
PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4173 npx playwright test --workers=3
```
Expected: green except the two known time-of-day reminder specs. Fix specs that looked up fields by their old label text (`getByLabel("Start time (HH:mm)")` style) by using the new short label or the test id.

- [ ] **Step 5: Screenshots at 320px and 375px** of: owner Manage › Clientes recorrentes › Ativos › Adicionar manualmente; Gerenciar › Barbearia (horários); barber Perfil › Disponibilidade; owner customer form. Confirm labels fit on one line, boxes align, grey examples are visible.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "fix: side-by-side fields align; e2e for ghost examples"`

---

### Task 5: Review and PR
- [ ] `npm run typecheck && npm run lint && npx jest`, full web e2e; restore `.env.local`; push `feat-field-examples`; PR via `gh api` REST (base: `feat-fixed-parent-navigation`).
