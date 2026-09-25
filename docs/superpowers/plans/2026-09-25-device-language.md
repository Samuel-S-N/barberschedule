# Device Language (i18n) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The whole app (customer, auth, legal, owner screens, error messages, push notifications) follows the device language: Portuguese (Brazil), English or Spanish, falling back to English.

**Architecture:** `i18next` + `react-i18next` initialised synchronously from `expo-localization`, with typed per-language resource files and a compile-time key-parity guarantee. Screens call `useTranslation`; formatting and error mapping are small pure modules. Push notification text is built server-side from a pure TypeScript module chosen by a per-token `locale` column.

**Tech Stack:** Expo Router 57 / React Native 0.86 (web too), i18next, react-i18next, expo-localization, Jest (jest-expo, RNTL 14 — `render`/`fireEvent` are awaited), pgTAP, Playwright, Supabase Edge Function (Deno).

**Spec:** `docs/superpowers/specs/2026-09-25-device-language-design.md`

## Global Constraints

- Languages: `pt` (reference), `en`, `es`; any other device language falls back to `en`. No in-app language picker.
- Times are always 24h `HH:mm`; only dates (weekday/month) follow the language.
- Prices stay `formatPriceBRL` (`R$ 65,00`); shop timezone stays `America/Sao_Paulo` (docs/decisions/002).
- Shop, barber and service names and appointment notes are content, never translated.
- Interpolation uses `{{name}}`; keys are typed from the `en` resource; `pt` and `es` must have exactly the same keys and `{{placeholders}}` as `en`, and no empty strings.
- Relative imports only (no `@/` alias). NativeWind `className` only on plain RN elements (see `docs`/memory: animated components drop classes on web).
- Jest `testMatch` is `**/*.test.ts` only — tests use `React.createElement`, not JSX.
- `DomainError.message` stays English (last-resort fallback); UI shows the translated `errors.codes.<CODE>`.
- Baseline before this plan (on `feat-i18n`, stacked on PR #1's branch): typecheck clean, `npm test -- --runInBand` = 51 suites / 209 tests, `npm run test:e2e:web` = 26 tests, pgTAP = 285 assertions. Known: e2e fails if a `.env.local` exists in the worktree (it switches the Supabase host, and the fake session key is derived from it) — this worktree has none.
- Every task ends with `npm run typecheck`, `npm run lint` and its focused tests green before commit. Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. The shell in this worktree session rejects compound/heredoc commands and `HOME=` overrides: use single commands and the Edit/Write tools.

## File Structure

```
package.json                                             MOD  + i18next, react-i18next, expo-localization
jest.setup.ts                                            MOD  mock expo-localization (en) + init i18n
src/i18n/language.ts                                     NEW  Language type, resolveLanguage
src/i18n/index.ts                                        NEW  i18next init, getCurrentLanguage, syncLanguage
src/i18n/use-language.ts                                 NEW  useLanguage hook
src/i18n/errors.ts                                       NEW  errorMessage(error, t, fallback)
src/i18n/i18next.d.ts                                    NEW  typed resources
src/i18n/locales/types.ts                                NEW  DeepStringRecord helper type
src/i18n/locales/en.ts | pt.ts | es.ts                   NEW  resources
src/lib/i18n/format.ts                                   NEW  formatWeekdayShort, formatDateLabel
src/lib/dates/calendar-strip-days.ts                     MOD  language param
src/features/appointments/agenda-view.ts                 MOD  language param
src/features/appointments/use-appointment-cards.ts       MOD  translated fallbacks + language
src/features/account/legal.ts                            MOD  section keys only
src/features/auth/validation.ts                          MOD  error keys instead of English text
src/features/notifications/{api,register-token}.ts       MOD  locale argument
src/providers/AppProviders.tsx                           MOD  I18nextProvider + AppState sync
src/components/domain/StatusBadge.tsx                    MOD  translated labels
src/components/domain/ServiceCard.tsx                    MOD  translated "min"
app/**/*.tsx                                             MOD  all routes use t()
supabase/migrations/0024_notification_locale.sql         NEW
supabase/tests/012_notification_locale.sql               NEW
supabase/functions/dispatch-notifications/messages.ts    NEW  pure buildMessage
supabase/functions/dispatch-notifications/index.ts       MOD  use buildMessage + locale
playwright.config.ts                                     MOD  locale en-US default
tests/…                                                  see each task
```

---

### Task 1: Dependencies and i18n core

**Files:**
- Modify: `package.json`, `package-lock.json`, `jest.setup.ts`, `src/providers/AppProviders.tsx`
- Create: `src/i18n/language.ts`, `src/i18n/index.ts`, `src/i18n/use-language.ts`, `src/i18n/i18next.d.ts`, `src/i18n/locales/types.ts`, `src/i18n/locales/en.ts` (minimal), `src/i18n/locales/pt.ts` (minimal), `src/i18n/locales/es.ts` (minimal)
- Test: `tests/unit/language.test.ts`, `tests/unit/i18n-init.test.ts`

**Interfaces:**
- Produces:
  - `type Language = "pt" | "en" | "es"`; `resolveLanguage(code: string | null | undefined): Language`
  - default export `i18n` (i18next instance); `getCurrentLanguage(): Language`; `syncLanguage(): Promise<void>`
  - `useLanguage(): Language`
  - `type DeepStringRecord<T>` in `src/i18n/locales/types.ts`
  - `en`, `pt: DeepStringRecord<typeof en>`, `es: DeepStringRecord<typeof en>`

- [ ] **Step 0: Install dependencies**

Run (plain commands, one at a time):
`npm install`
`npx expo install expo-localization i18next react-i18next`
Expected: `package.json` gains the three dependencies (expo-localization at the SDK-57 version). Run `npm ls i18next` and note the major version: if it is `>= 25` synchronous init uses `initAsync: false`; if older, `initImmediate: false`. The init test in Step 1 proves which is right.

- [ ] **Step 1: Write the failing tests**

`tests/unit/language.test.ts`:

```ts
import { resolveLanguage } from "../../src/i18n/language";

describe("resolveLanguage", () => {
  it.each([
    ["pt", "pt"],
    ["pt-BR", "pt"],
    ["PT", "pt"],
    ["pt_PT", "pt"],
    ["es", "es"],
    ["es-419", "es"],
    ["en", "en"],
    ["en-US", "en"],
    ["fr", "en"],
    ["", "en"],
    [null, "en"],
    [undefined, "en"],
  ])("resolves %p to %p", (code, expected) => {
    expect(resolveLanguage(code)).toBe(expected);
  });
});
```

`tests/unit/i18n-init.test.ts`:

```ts
import { getLocales } from "expo-localization";

jest.mock("expo-localization", () => ({ getLocales: jest.fn(() => [{ languageCode: "pt", languageTag: "pt-BR" }]) }));

import i18n, { getCurrentLanguage, syncLanguage } from "../../src/i18n";

const mockedGetLocales = jest.mocked(getLocales);

describe("i18n init", () => {
  it("starts synchronously in the device language", () => {
    expect(getCurrentLanguage()).toBe("pt");
    expect(i18n.t("common.appName")).toBe("Barberschedule");
  });

  it("re-reads the device language on syncLanguage", async () => {
    mockedGetLocales.mockReturnValue([{ languageCode: "es", languageTag: "es-ES" }] as never);
    await syncLanguage();
    expect(getCurrentLanguage()).toBe("es");

    mockedGetLocales.mockReturnValue([{ languageCode: "fr", languageTag: "fr-FR" }] as never);
    await syncLanguage();
    expect(getCurrentLanguage()).toBe("en");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --runInBand tests/unit/language.test.ts tests/unit/i18n-init.test.ts`
Expected: FAIL (`Cannot find module '../../src/i18n/language'`).

- [ ] **Step 3: Implement**

`src/i18n/language.ts`:

```ts
export type Language = "pt" | "en" | "es";

export function resolveLanguage(code: string | null | undefined): Language {
  const base = (code ?? "").toLowerCase().split(/[-_]/)[0];

  return base === "pt" || base === "es" ? base : "en";
}
```

`src/i18n/locales/types.ts`:

```ts
export type DeepStringRecord<T> = { [K in keyof T]: T[K] extends string ? string : DeepStringRecord<T[K]> };
```

`src/i18n/locales/en.ts` (minimal for now; Task 2 fills it):

```ts
export const en = {
  common: { appName: "Barberschedule" },
  tabs: { home: "Home" },
};
```

`src/i18n/locales/pt.ts`:

```ts
import type { en } from "./en";
import type { DeepStringRecord } from "./types";

export const pt: DeepStringRecord<typeof en> = {
  common: { appName: "Barberschedule" },
  tabs: { home: "Início" },
};
```

`src/i18n/locales/es.ts`:

```ts
import type { en } from "./en";
import type { DeepStringRecord } from "./types";

export const es: DeepStringRecord<typeof en> = {
  common: { appName: "Barberschedule" },
  tabs: { home: "Inicio" },
};
```

`src/i18n/index.ts`:

```ts
import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { resolveLanguage } from "./language";
import type { Language } from "./language";
import { en } from "./locales/en";
import { es } from "./locales/es";
import { pt } from "./locales/pt";

function deviceLanguage(): Language {
  return resolveLanguage(getLocales()[0]?.languageCode);
}

void i18n.use(initReactI18next).init({
  fallbackLng: "en",
  initAsync: false,
  interpolation: { escapeValue: false },
  lng: deviceLanguage(),
  resources: { en: { translation: en }, es: { translation: es }, pt: { translation: pt } },
});

export function getCurrentLanguage(): Language {
  return resolveLanguage(i18n.language);
}

export async function syncLanguage() {
  const next = deviceLanguage();

  if (next !== i18n.language) {
    await i18n.changeLanguage(next);
  }
}

export default i18n;
```
(If `npm ls i18next` showed a major older than 25, replace `initAsync: false` with `initImmediate: false`.)

`src/i18n/use-language.ts`:

```ts
import { useTranslation } from "react-i18next";

import { resolveLanguage } from "./language";
import type { Language } from "./language";

export function useLanguage(): Language {
  const { i18n } = useTranslation();

  return resolveLanguage(i18n.language);
}
```

`src/i18n/i18next.d.ts`:

```ts
import type { en } from "./locales/en";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof en };
  }
}
```

`jest.setup.ts`: add at the top (before any component import)

```ts
jest.mock("expo-localization", () => ({
  getLocales: () => [{ languageCode: "en", languageTag: "en-US" }],
}));

import "./src/i18n";
```
(Keep the file's existing content after it. Tests that need another language mock `expo-localization` themselves, as `i18n-init.test.ts` does.)

`src/providers/AppProviders.tsx`: add imports `import { AppState } from "react-native";`, `import { I18nextProvider } from "react-i18next";`, `import i18n, { syncLanguage } from "../i18n";`; inside `AppProviders`, before the `return`:

```tsx
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncLanguage();
    });

    return () => subscription.remove();
  }, []);
```
and wrap the returned tree: `<I18nextProvider i18n={i18n}>` around `<QueryClientProvider …>` (closing accordingly).

- [ ] **Step 4: Run to verify pass**

Run: `npm run typecheck`, `npm run lint`, `npm test -- --runInBand`
Expected: PASS (209 + new tests; nothing else changes because `en` is the default language in tests).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json jest.setup.ts src/i18n src/providers/AppProviders.tsx tests/unit/language.test.ts tests/unit/i18n-init.test.ts
git commit -m "feat(i18n): add i18next core with device language resolution"
```

---

### Task 2: Locale resources and key parity

**Files:**
- Modify: `src/i18n/locales/en.ts`, `pt.ts`, `es.ts`, `src/features/account/legal.ts`
- Test: `tests/unit/locale-parity.test.ts`

**Interfaces:**
- Consumes: `DeepStringRecord` (Task 1).
- Produces: resources under these top-level keys — `common`, `tabs`, `status`, `auth`, `home`, `appointments`, `reschedule`, `book`, `profile`, `layout`, `legal`, `errors`. (`owner` is added in Task 8.) `legal.sectionKeys` is not a resource; `legal.ts` exports `LEGAL_SECTION_KEYS = ["collect","why","who","rights","contact"] as const`.

- [ ] **Step 1: Write the failing test**

`tests/unit/locale-parity.test.ts`:

```ts
import { en } from "../../src/i18n/locales/en";
import { es } from "../../src/i18n/locales/es";
import { pt } from "../../src/i18n/locales/pt";

function flatten(value: unknown, prefix = ""): Record<string, string> {
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === "string" ? { ...acc, [path]: child } : { ...acc, ...flatten(child, path) };
  }, {});
}

const placeholders = (text: string) => (text.match(/\{\{\s*\w+\s*\}\}/g) ?? []).map((p) => p.replace(/\s/g, "")).sort();

describe.each([
  ["pt", pt],
  ["es", es],
])("%s resources", (_name, resource) => {
  const base = flatten(en);
  const other = flatten(resource);

  it("has exactly the same keys as en", () => {
    expect(Object.keys(other).sort()).toEqual(Object.keys(base).sort());
  });

  it("has no empty strings", () => {
    expect(Object.entries(other).filter(([, text]) => text.trim() === "")).toEqual([]);
  });

  it("keeps the same {{placeholders}} as en for every key", () => {
    const mismatched = Object.keys(base).filter((key) => JSON.stringify(placeholders(base[key])) !== JSON.stringify(placeholders(other[key] ?? "")));

    expect(mismatched).toEqual([]);
  });
});

describe("en resources", () => {
  it("has no empty strings", () => {
    expect(Object.entries(flatten(en)).filter(([, text]) => text.trim() === "")).toEqual([]);
  });

  it("defines a message for every legal section key", () => {
    for (const key of ["collect", "why", "who", "rights", "contact"]) {
      expect(flatten(en)).toHaveProperty(`legal.sections.${key}.title`);
      expect(flatten(en)).toHaveProperty(`legal.sections.${key}.body`);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --runInBand tests/unit/locale-parity.test.ts`
Expected: FAIL (`legal.sections.collect.title` missing).

- [ ] **Step 3: Write the resources**

Before writing, run `grep -rn "RECURRENCE_REQUEST_FAILED\|OWNER_AGENDA_REQUEST_FAILED\|OWNER_STATUS_REQUEST_FAILED" src` and copy the existing English messages into the four matching `en.errors.codes` entries below if they differ from the ones given here.

`src/i18n/locales/en.ts`:

```ts
export const en = {
  common: {
    appName: "Barberschedule",
    back: "Back",
    email: "Email",
    fullName: "Full name",
    minutesShort: "{{count}} min",
    password: "Password",
    phoneOptional: "Phone (optional)",
    tryAgain: "Try again",
  },
  tabs: { agenda: "Agenda", book: "Book", home: "Home", profile: "Profile" },
  status: { cancelled: "Cancelled", completed: "Completed", confirmed: "Confirmed", no_show: "No-show", scheduled: "Scheduled" },
  auth: {
    login: {
      createAccount: "Create account",
      error: "Unable to sign in.",
      forgot: "Forgot password?",
      submit: "Sign in",
      subtitle: "Use the same Barberschedule account on Web, iOS, or Android.",
      title: "Sign in",
    },
    reset: {
      backToSignIn: "Back to sign in",
      error: "Unable to send reset email.",
      sent: "Password reset email sent.",
      submit: "Send reset email",
      subtitle: "We will send a reset link if the account exists.",
      title: "Reset password",
    },
    signup: {
      acceptTerms: "I accept the terms and privacy policy",
      backToSignIn: "Back to sign in",
      checkEmailBody: "We sent a confirmation link to {{email}}. Open it, then sign in.",
      checkEmailTitle: "Check your email",
      error: "Unable to create your account.",
      haveAccount: "I already have an account",
      readTerms: "Read terms and privacy policy",
      submit: "Create account",
      title: "Create account",
    },
    validation: {
      acceptTerms: "Accept the terms and privacy policy to continue.",
      email: "Enter a valid email.",
      fullName: "Enter your full name.",
      password: "Use at least 8 characters.",
      phone: "Enter a valid phone number.",
    },
  },
  home: {
    bookCta: "Book an appointment",
    bookingConfirmed: "Booking confirmed.",
    empty: "No upcoming appointments",
    greeting: "Hi, {{name}}",
    loadError: "Unable to load appointments.",
    nextAppointment: "Your next appointment",
    welcome: "Welcome",
  },
  appointments: {
    cancel: "Cancel appointment",
    cancelError: "Unable to cancel.",
    cancelled: "Appointment cancelled.",
    confirmCancel: "Confirm cancellation",
    emptyDay: "No appointments this day",
    emptyHistory: "No past appointments yet",
    fallbackBarber: "Barber",
    fallbackShop: "Barbershop",
    history: "History",
    keep: "Keep appointment",
    loadError: "Unable to load appointments.",
    locked: "Changes are only allowed until 90 minutes before the start.",
    reschedule: "Reschedule",
    title: "Agenda",
    upcoming: "Upcoming",
  },
  reschedule: {
    confirm: "Confirm new time",
    error: "Unable to reschedule.",
    keep: "Keep current time",
    loadError: "Unable to load availability.",
    noTimes: "No times available this day",
    title: "Reschedule",
  },
  book: {
    barberTitle: "Choose your barber",
    barbersError: "Unable to load barbers.",
    chooseTime: "Choose an available time before booking.",
    confirm: "Confirm booking",
    continue: "Continue to review",
    dateTitle: "Choose a date",
    error: "Unable to book this appointment.",
    noBarbers: "No barbers available",
    noServices: "No services available",
    noShops: "No shops available",
    noTimes: "No times available this day",
    notes: "Notes (optional)",
    notesTooLong: "Notes must be 500 characters or fewer.",
    reviewTitle: "Review your booking",
    serviceTitle: "Choose a service",
    servicesError: "Unable to load services.",
    shopTitle: "Book an appointment",
    shopsError: "Unable to load shops.",
    startAt: "Start booking at {{shop}}",
    timesError: "Unable to load availability.",
  },
  profile: {
    delete: "Delete my account",
    deleteConfirm: "Yes, delete my account",
    deleteError: "Unable to delete your account.",
    deleteWarning:
      "This deletes your login and anonymizes your customer record. Past appointments stay in the shop's records without your name, phone or email; notes you wrote on an appointment are kept as written, so contact the shop if you want them removed. This cannot be undone.",
    download: "Download my data",
    exportError: "Unable to export your data.",
    exportReady: "Your data export is ready.",
    keep: "Keep my account",
    save: "Save changes",
    saveError: "Unable to save your profile.",
    saved: "Profile saved.",
    signOut: "Sign out",
    signOutError: "Unable to sign out.",
    terms: "Terms and privacy policy",
    title: "Profile",
    yourData: "Your data",
  },
  layout: { bootstrapError: "Unable to set up your account." },
  legal: {
    sections: {
      collect: {
        body: "Your name, email address, optional phone number, your appointments (service, barber, date and time, notes) and, if you enable notifications, a push token for your device.",
        title: "What we collect",
      },
      contact: { body: "For any request about your data, contact the barbershop directly.", title: "Contact" },
      rights: {
        body: "In your profile you can correct your name and phone, download a copy of your data, and delete your account. Deleting your account removes your login and anonymizes your customer record; past appointments stay in the shop's records without your name, phone or email (notes you wrote on an appointment are kept as written; ask the shop to remove them). Consent records are kept anonymously as proof of acceptance.",
        title: "Your rights (LGPD)",
      },
      who: { body: "You, and the barbershop you book with. We do not sell your data.", title: "Who can see it" },
      why: {
        body: "To create your account, let you book, change and cancel appointments, remind you of them, and let the shop contact you about your schedule. Your phone number is optional.",
        title: "Why we collect it",
      },
    },
    title: "Terms and privacy",
    translationNote: "Portuguese is the reference text; this is a translation for convenience.",
    version: "Version {{version}}",
  },
  errors: {
    auth: {
      email_not_confirmed: "Confirm your email before signing in.",
      generic: "Something went wrong. Please try again.",
      invalid_credentials: "Incorrect email or password.",
      over_email_send_rate_limit: "Too many emails sent. Try again later.",
      over_request_rate_limit: "Too many attempts. Try again in a few minutes.",
      user_already_exists: "An account with this email already exists.",
      weak_password: "Choose a stronger password.",
    },
    codes: {
      ACCOUNT_DELETION_BLOCKED:
        "Cancel your upcoming appointments (or contact the shop about your recurring schedule) before deleting your account.",
      ACCOUNT_REQUEST_FAILED: "Something went wrong. Please try again.",
      AGENDA_INVALID_RANGE: "Choose a valid agenda range.",
      APPOINTMENT_FORBIDDEN: "You cannot change this appointment.",
      APPOINTMENT_LIFECYCLE_LOCKED: "Appointments can only be changed at least 90 minutes before they start.",
      APPOINTMENT_NOT_FOUND: "That appointment is no longer available to change.",
      APPOINTMENT_REQUEST_FAILED: "Unable to change the appointment.",
      APPOINTMENT_STATUS_INVALID: "That appointment cannot move to the requested status.",
      BARBER_UNAVAILABLE: "That barber is no longer available.",
      BOOKING_FORBIDDEN: "You cannot create this appointment.",
      BOOKING_REQUEST_FAILED: "Unable to create the appointment.",
      CUSTOMER_UNAVAILABLE: "That customer is no longer available.",
      DAILY_BOOKING_LIMIT: "You already have an appointment on this local shop date.",
      INVALID_BOOKING_START: "Choose a future available time.",
      OWNER_AGENDA_REQUEST_FAILED: "Unable to load the agenda.",
      OWNER_STATUS_REQUEST_FAILED: "Unable to update the appointment status.",
      PROFILE_INVALID: "Enter your name and a valid phone number.",
      RECURRENCE_INVALID: "Choose a valid recurrence rule and 90-day window.",
      RECURRENCE_REQUEST_FAILED: "Unable to update the recurring booking.",
      SCHEDULE_UNAVAILABLE: "That time is outside the schedule.",
      SERVICE_UNAVAILABLE: "That service is no longer available.",
      SLOT_UNAVAILABLE: "That time is no longer available.",
    },
    generic: "Something went wrong. Please try again.",
  },
};
```

`src/i18n/locales/pt.ts` (typed `DeepStringRecord<typeof en>`, so a missing or extra key is a compile error):

```ts
import type { en } from "./en";
import type { DeepStringRecord } from "./types";

export const pt: DeepStringRecord<typeof en> = {
  common: {
    appName: "Barberschedule",
    back: "Voltar",
    email: "E-mail",
    fullName: "Nome completo",
    minutesShort: "{{count}} min",
    password: "Senha",
    phoneOptional: "Telefone (opcional)",
    tryAgain: "Tentar de novo",
  },
  tabs: { agenda: "Agenda", book: "Agendar", home: "Início", profile: "Perfil" },
  status: { cancelled: "Cancelado", completed: "Concluído", confirmed: "Confirmado", no_show: "Não compareceu", scheduled: "Agendado" },
  auth: {
    login: {
      createAccount: "Criar conta",
      error: "Não foi possível entrar.",
      forgot: "Esqueci minha senha",
      submit: "Entrar",
      subtitle: "Use a mesma conta do Barberschedule na Web, no iOS ou no Android.",
      title: "Entrar",
    },
    reset: {
      backToSignIn: "Voltar para entrar",
      error: "Não foi possível enviar o e-mail de redefinição.",
      sent: "E-mail de redefinição de senha enviado.",
      submit: "Enviar e-mail de redefinição",
      subtitle: "Enviaremos um link de redefinição se a conta existir.",
      title: "Redefinir senha",
    },
    signup: {
      acceptTerms: "Aceito os termos e a política de privacidade",
      backToSignIn: "Voltar para entrar",
      checkEmailBody: "Enviamos um link de confirmação para {{email}}. Abra-o e depois entre.",
      checkEmailTitle: "Verifique seu e-mail",
      error: "Não foi possível criar sua conta.",
      haveAccount: "Já tenho uma conta",
      readTerms: "Ler termos e política de privacidade",
      submit: "Criar conta",
      title: "Criar conta",
    },
    validation: {
      acceptTerms: "Aceite os termos e a política de privacidade para continuar.",
      email: "Informe um e-mail válido.",
      fullName: "Informe seu nome completo.",
      password: "Use pelo menos 8 caracteres.",
      phone: "Informe um telefone válido.",
    },
  },
  home: {
    bookCta: "Agendar um horário",
    bookingConfirmed: "Agendamento confirmado.",
    empty: "Nenhum agendamento futuro",
    greeting: "Olá, {{name}}",
    loadError: "Não foi possível carregar os agendamentos.",
    nextAppointment: "Seu próximo agendamento",
    welcome: "Bem-vindo",
  },
  appointments: {
    cancel: "Cancelar agendamento",
    cancelError: "Não foi possível cancelar.",
    cancelled: "Agendamento cancelado.",
    confirmCancel: "Confirmar cancelamento",
    emptyDay: "Nenhum agendamento neste dia",
    emptyHistory: "Nenhum agendamento anterior ainda",
    fallbackBarber: "Barbeiro",
    fallbackShop: "Barbearia",
    history: "Histórico",
    keep: "Manter agendamento",
    loadError: "Não foi possível carregar os agendamentos.",
    locked: "Alterações só são permitidas até 90 minutos antes do início.",
    reschedule: "Remarcar",
    title: "Agenda",
    upcoming: "Próximos",
  },
  reschedule: {
    confirm: "Confirmar novo horário",
    error: "Não foi possível remarcar.",
    keep: "Manter horário atual",
    loadError: "Não foi possível carregar a disponibilidade.",
    noTimes: "Nenhum horário disponível neste dia",
    title: "Remarcar",
  },
  book: {
    barberTitle: "Escolha seu barbeiro",
    barbersError: "Não foi possível carregar os barbeiros.",
    chooseTime: "Escolha um horário disponível antes de agendar.",
    confirm: "Confirmar agendamento",
    continue: "Continuar para a revisão",
    dateTitle: "Escolha uma data",
    error: "Não foi possível fazer este agendamento.",
    noBarbers: "Nenhum barbeiro disponível",
    noServices: "Nenhum serviço disponível",
    noShops: "Nenhuma barbearia disponível",
    noTimes: "Nenhum horário disponível neste dia",
    notes: "Observações (opcional)",
    notesTooLong: "As observações devem ter no máximo 500 caracteres.",
    reviewTitle: "Revise seu agendamento",
    serviceTitle: "Escolha um serviço",
    servicesError: "Não foi possível carregar os serviços.",
    shopTitle: "Agendar um horário",
    shopsError: "Não foi possível carregar as barbearias.",
    startAt: "Começar a agendar em {{shop}}",
    timesError: "Não foi possível carregar a disponibilidade.",
  },
  profile: {
    delete: "Excluir minha conta",
    deleteConfirm: "Sim, excluir minha conta",
    deleteError: "Não foi possível excluir sua conta.",
    deleteWarning:
      "Isto exclui seu login e anonimiza seu cadastro de cliente. Os agendamentos passados permanecem nos registros da barbearia sem seu nome, telefone ou e-mail; as observações que você escreveu em um agendamento são mantidas como foram escritas, então fale com a barbearia se quiser removê-las. Isto não pode ser desfeito.",
    download: "Baixar meus dados",
    exportError: "Não foi possível exportar seus dados.",
    exportReady: "A exportação dos seus dados está pronta.",
    keep: "Manter minha conta",
    save: "Salvar alterações",
    saveError: "Não foi possível salvar seu perfil.",
    saved: "Perfil salvo.",
    signOut: "Sair",
    signOutError: "Não foi possível sair.",
    terms: "Termos e política de privacidade",
    title: "Perfil",
    yourData: "Seus dados",
  },
  layout: { bootstrapError: "Não foi possível configurar sua conta." },
  legal: {
    sections: {
      collect: {
        body: "Seu nome, endereço de e-mail, telefone (opcional), seus agendamentos (serviço, barbeiro, data e hora, observações) e, se você ativar as notificações, um token de push do seu aparelho.",
        title: "O que coletamos",
      },
      contact: { body: "Para qualquer pedido sobre seus dados, fale diretamente com a barbearia.", title: "Contato" },
      rights: {
        body: "No seu perfil você pode corrigir seu nome e telefone, baixar uma cópia dos seus dados e excluir sua conta. Excluir a conta remove seu login e anonimiza seu cadastro de cliente; os agendamentos passados permanecem nos registros da barbearia sem seu nome, telefone ou e-mail (as observações que você escreveu em um agendamento são mantidas como foram escritas; peça à barbearia para removê-las). Os registros de consentimento são mantidos de forma anônima como comprovante de aceite.",
        title: "Seus direitos (LGPD)",
      },
      who: { body: "Você e a barbearia em que você agenda. Não vendemos seus dados.", title: "Quem pode ver" },
      why: {
        body: "Para criar sua conta, permitir que você agende, altere e cancele horários, lembrar você deles e permitir que a barbearia entre em contato sobre sua agenda. O telefone é opcional.",
        title: "Por que coletamos",
      },
    },
    title: "Termos e privacidade",
    translationNote: "Este é o texto de referência.",
    version: "Versão {{version}}",
  },
  errors: {
    auth: {
      email_not_confirmed: "Confirme seu e-mail antes de entrar.",
      generic: "Algo deu errado. Tente novamente.",
      invalid_credentials: "E-mail ou senha incorretos.",
      over_email_send_rate_limit: "Muitos e-mails enviados. Tente novamente mais tarde.",
      over_request_rate_limit: "Muitas tentativas. Tente novamente em alguns minutos.",
      user_already_exists: "Já existe uma conta com este e-mail.",
      weak_password: "Escolha uma senha mais forte.",
    },
    codes: {
      ACCOUNT_DELETION_BLOCKED:
        "Cancele seus agendamentos futuros (ou fale com a barbearia sobre sua agenda recorrente) antes de excluir sua conta.",
      ACCOUNT_REQUEST_FAILED: "Algo deu errado. Tente novamente.",
      AGENDA_INVALID_RANGE: "Escolha um período válido para a agenda.",
      APPOINTMENT_FORBIDDEN: "Você não pode alterar este agendamento.",
      APPOINTMENT_LIFECYCLE_LOCKED: "Agendamentos só podem ser alterados com pelo menos 90 minutos de antecedência.",
      APPOINTMENT_NOT_FOUND: "Esse agendamento não pode mais ser alterado.",
      APPOINTMENT_REQUEST_FAILED: "Não foi possível alterar o agendamento.",
      APPOINTMENT_STATUS_INVALID: "Esse agendamento não pode mudar para o status solicitado.",
      BARBER_UNAVAILABLE: "Esse barbeiro não está mais disponível.",
      BOOKING_FORBIDDEN: "Você não pode criar este agendamento.",
      BOOKING_REQUEST_FAILED: "Não foi possível criar o agendamento.",
      CUSTOMER_UNAVAILABLE: "Esse cliente não está mais disponível.",
      DAILY_BOOKING_LIMIT: "Você já tem um agendamento nesta data da barbearia.",
      INVALID_BOOKING_START: "Escolha um horário futuro e disponível.",
      OWNER_AGENDA_REQUEST_FAILED: "Não foi possível carregar a agenda.",
      OWNER_STATUS_REQUEST_FAILED: "Não foi possível atualizar o status do agendamento.",
      PROFILE_INVALID: "Informe seu nome e um telefone válido.",
      RECURRENCE_INVALID: "Escolha uma regra de recorrência válida dentro de 90 dias.",
      RECURRENCE_REQUEST_FAILED: "Não foi possível atualizar o agendamento recorrente.",
      SCHEDULE_UNAVAILABLE: "Esse horário está fora da agenda de atendimento.",
      SERVICE_UNAVAILABLE: "Esse serviço não está mais disponível.",
      SLOT_UNAVAILABLE: "Esse horário não está mais disponível.",
    },
    generic: "Algo deu errado. Tente novamente.",
  },
};
```

`src/i18n/locales/es.ts`:

```ts
import type { en } from "./en";
import type { DeepStringRecord } from "./types";

export const es: DeepStringRecord<typeof en> = {
  common: {
    appName: "Barberschedule",
    back: "Volver",
    email: "Correo electrónico",
    fullName: "Nombre completo",
    minutesShort: "{{count}} min",
    password: "Contraseña",
    phoneOptional: "Teléfono (opcional)",
    tryAgain: "Reintentar",
  },
  tabs: { agenda: "Agenda", book: "Reservar", home: "Inicio", profile: "Perfil" },
  status: { cancelled: "Cancelada", completed: "Completada", confirmed: "Confirmada", no_show: "No asistió", scheduled: "Programada" },
  auth: {
    login: {
      createAccount: "Crear cuenta",
      error: "No se pudo iniciar sesión.",
      forgot: "¿Olvidaste tu contraseña?",
      submit: "Iniciar sesión",
      subtitle: "Usa la misma cuenta de Barberschedule en la Web, iOS o Android.",
      title: "Iniciar sesión",
    },
    reset: {
      backToSignIn: "Volver a iniciar sesión",
      error: "No se pudo enviar el correo de restablecimiento.",
      sent: "Correo de restablecimiento de contraseña enviado.",
      submit: "Enviar correo de restablecimiento",
      subtitle: "Enviaremos un enlace para restablecerla si la cuenta existe.",
      title: "Restablecer contraseña",
    },
    signup: {
      acceptTerms: "Acepto los términos y la política de privacidad",
      backToSignIn: "Volver a iniciar sesión",
      checkEmailBody: "Enviamos un enlace de confirmación a {{email}}. Ábrelo y luego inicia sesión.",
      checkEmailTitle: "Revisa tu correo",
      error: "No se pudo crear tu cuenta.",
      haveAccount: "Ya tengo una cuenta",
      readTerms: "Leer términos y política de privacidad",
      submit: "Crear cuenta",
      title: "Crear cuenta",
    },
    validation: {
      acceptTerms: "Acepta los términos y la política de privacidad para continuar.",
      email: "Introduce un correo válido.",
      fullName: "Introduce tu nombre completo.",
      password: "Usa al menos 8 caracteres.",
      phone: "Introduce un teléfono válido.",
    },
  },
  home: {
    bookCta: "Reservar una cita",
    bookingConfirmed: "Cita confirmada.",
    empty: "No hay citas próximas",
    greeting: "Hola, {{name}}",
    loadError: "No se pudieron cargar las citas.",
    nextAppointment: "Tu próxima cita",
    welcome: "Bienvenido",
  },
  appointments: {
    cancel: "Cancelar cita",
    cancelError: "No se pudo cancelar.",
    cancelled: "Cita cancelada.",
    confirmCancel: "Confirmar cancelación",
    emptyDay: "No hay citas este día",
    emptyHistory: "Aún no hay citas anteriores",
    fallbackBarber: "Barbero",
    fallbackShop: "Barbería",
    history: "Historial",
    keep: "Mantener cita",
    loadError: "No se pudieron cargar las citas.",
    locked: "Solo se pueden hacer cambios hasta 90 minutos antes del inicio.",
    reschedule: "Reprogramar",
    title: "Agenda",
    upcoming: "Próximas",
  },
  reschedule: {
    confirm: "Confirmar nuevo horario",
    error: "No se pudo reprogramar.",
    keep: "Mantener horario actual",
    loadError: "No se pudo cargar la disponibilidad.",
    noTimes: "No hay horarios disponibles este día",
    title: "Reprogramar",
  },
  book: {
    barberTitle: "Elige tu barbero",
    barbersError: "No se pudieron cargar los barberos.",
    chooseTime: "Elige un horario disponible antes de reservar.",
    confirm: "Confirmar reserva",
    continue: "Continuar a la revisión",
    dateTitle: "Elige una fecha",
    error: "No se pudo hacer esta reserva.",
    noBarbers: "No hay barberos disponibles",
    noServices: "No hay servicios disponibles",
    noShops: "No hay barberías disponibles",
    noTimes: "No hay horarios disponibles este día",
    notes: "Notas (opcional)",
    notesTooLong: "Las notas deben tener 500 caracteres o menos.",
    reviewTitle: "Revisa tu reserva",
    serviceTitle: "Elige un servicio",
    servicesError: "No se pudieron cargar los servicios.",
    shopTitle: "Reservar una cita",
    shopsError: "No se pudieron cargar las barberías.",
    startAt: "Empezar a reservar en {{shop}}",
    timesError: "No se pudo cargar la disponibilidad.",
  },
  profile: {
    delete: "Eliminar mi cuenta",
    deleteConfirm: "Sí, eliminar mi cuenta",
    deleteError: "No se pudo eliminar tu cuenta.",
    deleteWarning:
      "Esto elimina tu acceso y anonimiza tu registro de cliente. Las citas pasadas permanecen en los registros de la barbería sin tu nombre, teléfono ni correo; las notas que escribiste en una cita se conservan tal como las escribiste, así que contacta con la barbería si quieres que las eliminen. Esto no se puede deshacer.",
    download: "Descargar mis datos",
    exportError: "No se pudieron exportar tus datos.",
    exportReady: "La exportación de tus datos está lista.",
    keep: "Mantener mi cuenta",
    save: "Guardar cambios",
    saveError: "No se pudo guardar tu perfil.",
    saved: "Perfil guardado.",
    signOut: "Cerrar sesión",
    signOutError: "No se pudo cerrar sesión.",
    terms: "Términos y política de privacidad",
    title: "Perfil",
    yourData: "Tus datos",
  },
  layout: { bootstrapError: "No se pudo configurar tu cuenta." },
  legal: {
    sections: {
      collect: {
        body: "Tu nombre, correo electrónico, teléfono (opcional), tus citas (servicio, barbero, fecha y hora, notas) y, si activas las notificaciones, un token de notificaciones push de tu dispositivo.",
        title: "Qué recopilamos",
      },
      contact: { body: "Para cualquier solicitud sobre tus datos, contacta directamente con la barbería.", title: "Contacto" },
      rights: {
        body: "En tu perfil puedes corregir tu nombre y teléfono, descargar una copia de tus datos y eliminar tu cuenta. Eliminar la cuenta borra tu acceso y anonimiza tu registro de cliente; las citas pasadas permanecen en los registros de la barbería sin tu nombre, teléfono ni correo (las notas que escribiste en una cita se conservan tal como las escribiste; pide a la barbería que las elimine). Los registros de consentimiento se conservan de forma anónima como prueba de aceptación.",
        title: "Tus derechos (LGPD)",
      },
      who: { body: "Tú y la barbería en la que reservas. No vendemos tus datos.", title: "Quién puede verlo" },
      why: {
        body: "Para crear tu cuenta, permitirte reservar, cambiar y cancelar citas, recordártelas y permitir que la barbería se ponga en contacto contigo sobre tu agenda. El teléfono es opcional.",
        title: "Para qué lo recopilamos",
      },
    },
    title: "Términos y privacidad",
    translationNote: "El texto de referencia es el portugués; esta es una traducción de cortesía.",
    version: "Versión {{version}}",
  },
  errors: {
    auth: {
      email_not_confirmed: "Confirma tu correo antes de iniciar sesión.",
      generic: "Algo salió mal. Inténtalo de nuevo.",
      invalid_credentials: "Correo o contraseña incorrectos.",
      over_email_send_rate_limit: "Se enviaron demasiados correos. Inténtalo más tarde.",
      over_request_rate_limit: "Demasiados intentos. Inténtalo de nuevo en unos minutos.",
      user_already_exists: "Ya existe una cuenta con este correo.",
      weak_password: "Elige una contraseña más segura.",
    },
    codes: {
      ACCOUNT_DELETION_BLOCKED:
        "Cancela tus citas futuras (o habla con la barbería sobre tu agenda recurrente) antes de eliminar tu cuenta.",
      ACCOUNT_REQUEST_FAILED: "Algo salió mal. Inténtalo de nuevo.",
      AGENDA_INVALID_RANGE: "Elige un rango de agenda válido.",
      APPOINTMENT_FORBIDDEN: "No puedes cambiar esta cita.",
      APPOINTMENT_LIFECYCLE_LOCKED: "Las citas solo se pueden cambiar con al menos 90 minutos de antelación.",
      APPOINTMENT_NOT_FOUND: "Esa cita ya no se puede cambiar.",
      APPOINTMENT_REQUEST_FAILED: "No se pudo cambiar la cita.",
      APPOINTMENT_STATUS_INVALID: "Esa cita no puede pasar al estado solicitado.",
      BARBER_UNAVAILABLE: "Ese barbero ya no está disponible.",
      BOOKING_FORBIDDEN: "No puedes crear esta cita.",
      BOOKING_REQUEST_FAILED: "No se pudo crear la cita.",
      CUSTOMER_UNAVAILABLE: "Ese cliente ya no está disponible.",
      DAILY_BOOKING_LIMIT: "Ya tienes una cita en esta fecha de la barbería.",
      INVALID_BOOKING_START: "Elige un horario futuro y disponible.",
      OWNER_AGENDA_REQUEST_FAILED: "No se pudo cargar la agenda.",
      OWNER_STATUS_REQUEST_FAILED: "No se pudo actualizar el estado de la cita.",
      PROFILE_INVALID: "Introduce tu nombre y un teléfono válido.",
      RECURRENCE_INVALID: "Elige una regla de recurrencia válida dentro de 90 días.",
      RECURRENCE_REQUEST_FAILED: "No se pudo actualizar la cita recurrente.",
      SCHEDULE_UNAVAILABLE: "Ese horario está fuera de la agenda de atención.",
      SERVICE_UNAVAILABLE: "Ese servicio ya no está disponible.",
      SLOT_UNAVAILABLE: "Ese horario ya no está disponible.",
    },
    generic: "Algo salió mal. Inténtalo de nuevo.",
  },
};
```

`src/features/account/legal.ts` becomes:

```ts
export const TERMS_VERSION = "2026-09-23";

export const LEGAL_SECTION_KEYS = ["collect", "why", "who", "rights", "contact"] as const;
```
(`LEGAL_SECTIONS` is removed; `app/legal.tsx` is converted in Task 6.)

- [ ] **Step 4: Run to verify pass**

Run: `npm run typecheck && npm run lint && npm test -- --runInBand tests/unit/locale-parity.test.ts`
Expected: PASS. (`app/legal.tsx` still imports `LEGAL_SECTIONS` until Task 6 — to keep the tree compiling in this commit, change that one import in the same commit to the section keys, or leave `LEGAL_SECTIONS` exported as a deprecated alias built from `en` until Task 6 removes it. Prefer the alias: `export const LEGAL_SECTIONS = LEGAL_SECTION_KEYS.map((key) => ({ body: en.legal.sections[key].body, title: en.legal.sections[key].title }));` importing `en` from `../../i18n/locales/en`, and delete it in Task 6.)

- [ ] **Step 5: Commit**

```bash
git add src/i18n/locales src/features/account/legal.ts tests/unit/locale-parity.test.ts
git commit -m "feat(i18n): add en/pt/es resources with key and placeholder parity tests"
```

---

### Task 3: Language-aware date formatting

**Files:**
- Create: `src/lib/i18n/format.ts`
- Modify: `src/lib/dates/calendar-strip-days.ts`, `src/features/appointments/agenda-view.ts`
- Test: `tests/unit/format.test.ts`; extend `tests/unit/calendar-strip-days.test.ts`, `tests/unit/agenda-view.test.ts`

**Interfaces:**
- Consumes: `Language` (Task 1).
- Produces:
  - `formatWeekdayShort(localDate: string, language: Language): string` (`"2026-08-17"` → `"Mon"` / `"seg."` / `"lun"`)
  - `formatDateLabel(localDate: string, language: Language): string` (en → `"Mon, 17 Aug"`)
  - `buildCalendarStripDays(startInstant: Date, count: number, language: Language = "en")`
  - `formatAppointmentLabels(appointment: Appointment, language: Language = "en")`

- [ ] **Step 1: Write the failing tests**

`tests/unit/format.test.ts`:

```ts
import { formatDateLabel, formatWeekdayShort } from "../../src/lib/i18n/format";

describe("formatWeekdayShort", () => {
  it("follows the language (2026-08-17 is a Monday)", () => {
    expect(formatWeekdayShort("2026-08-17", "en")).toBe("Mon");
    expect(formatWeekdayShort("2026-08-17", "pt")).toMatch(/^seg/i);
    expect(formatWeekdayShort("2026-08-17", "es")).toMatch(/^lun/i);
  });
});

describe("formatDateLabel", () => {
  it("keeps the existing English label", () => {
    expect(formatDateLabel("2026-08-17", "en")).toBe("Mon, 17 Aug");
  });

  it("uses the language's weekday and month names", () => {
    expect(formatDateLabel("2026-08-17", "pt")).toMatch(/^seg.*17.*ago/i);
    expect(formatDateLabel("2026-08-17", "es")).toMatch(/^lun.*17.*ago/i);
  });
});
```

Append to `tests/unit/calendar-strip-days.test.ts`:

```ts
  it("labels weekdays in the requested language", () => {
    const [first] = buildCalendarStripDays(new Date("2026-09-18T12:00:00Z"), 1, "pt");

    expect(first.weekdayLabel).toMatch(/^sex/i);
  });
```

Append to `tests/unit/agenda-view.test.ts` (inside the existing `describe`):

```ts
  it("formats the date label in the requested language", () => {
    expect(formatAppointmentLabels(appointment("a", "2026-08-17T12:00:00Z"), "pt").dateLabel).toMatch(/^seg.*17.*ago/i);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --runInBand tests/unit/format.test.ts tests/unit/calendar-strip-days.test.ts tests/unit/agenda-view.test.ts`
Expected: FAIL (module missing / extra argument ignored so the `pt` cases fail).

- [ ] **Step 3: Implement**

`src/lib/i18n/format.ts`:

```ts
import type { Language } from "../../i18n/language";

const WEEKDAY_LOCALE: Record<Language, string> = { en: "en-US", es: "es-ES", pt: "pt-BR" };
const DATE_LOCALE: Record<Language, string> = { en: "en-GB", es: "es-ES", pt: "pt-BR" };

function noonUtc(localDate: string) {
  return new Date(`${localDate}T12:00:00Z`);
}

export function formatWeekdayShort(localDate: string, language: Language) {
  return new Intl.DateTimeFormat(WEEKDAY_LOCALE[language], { timeZone: "UTC", weekday: "short" }).format(noonUtc(localDate));
}

export function formatDateLabel(localDate: string, language: Language) {
  const text = new Intl.DateTimeFormat(DATE_LOCALE[language], {
    day: "numeric", month: "short", timeZone: "UTC", weekday: "short",
  }).format(noonUtc(localDate));

  return language === "en" ? text.replace(/^(\w+),? /, "$1, ") : text;
}
```

`src/lib/dates/calendar-strip-days.ts`: remove `weekdayFormatter`; import `formatWeekdayShort` and `Language`; change the signature to `buildCalendarStripDays(startInstant: Date, count: number, language: Language = "en")` and set `weekdayLabel: formatWeekdayShort(date, language)` (delete the now-unused `anchor` line).

`src/features/appointments/agenda-view.ts`: remove `labelFormatter`; import `formatDateLabel` and `Language`; `formatAppointmentLabels(appointment, language: Language = "en")` returns `{ dateLabel: formatDateLabel(localDate, language), timeLabel: localTime }`.

- [ ] **Step 4: Run to verify pass**

Run: `npm run typecheck && npm run lint && npm test -- --runInBand tests/unit`
Expected: PASS. If an `Intl` output differs from the regexes on this Node build, run `node -e "console.log(new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'short',weekday:'short',timeZone:'UTC'}).format(new Date('2026-08-17T12:00:00Z')))"` and adjust the regex, not the code.

- [ ] **Step 5: Commit**

```bash
git add src/lib src/features/appointments/agenda-view.ts tests/unit
git commit -m "feat(i18n): language-aware weekday and date labels"
```

---

### Task 4: Error message mapping

**Files:**
- Create: `src/i18n/errors.ts`
- Test: `tests/unit/error-message.test.ts`

**Interfaces:**
- Consumes: `DomainError`, `DomainErrorCode` (`src/lib/errors/domain-errors.ts`); resources `errors.codes.*`, `errors.auth.*` (Task 2).
- Produces: `errorMessage(error: unknown, t: (key: string) => string, fallback: string): string` — `DomainError` → `t("errors.codes.<code>")`; an object with a known auth `code` → `t("errors.auth.<code>")`; anything else → `fallback`.

- [ ] **Step 1: Write the failing test**

`tests/unit/error-message.test.ts`:

```ts
import i18n from "../../src/i18n";
import { errorMessage } from "../../src/i18n/errors";
import { DomainError } from "../../src/lib/errors/domain-errors";
import type { DomainErrorCode } from "../../src/lib/errors/domain-errors";
import { en } from "../../src/i18n/locales/en";

const t = (key: string) => i18n.t(key as never) as string;

describe("errorMessage", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("translates a DomainError by its code", async () => {
    await i18n.changeLanguage("pt");

    expect(errorMessage(new DomainError("SLOT_UNAVAILABLE", "English"), t, "fallback")).toBe("Esse horário não está mais disponível.");
  });

  it("has a translation for every DomainError code in every language", async () => {
    for (const language of ["en", "pt", "es"]) {
      await i18n.changeLanguage(language);
      for (const code of Object.keys(en.errors.codes) as DomainErrorCode[]) {
        expect(errorMessage(new DomainError(code, "English"), t, "fallback")).not.toBe("fallback");
        expect(t(`errors.codes.${code}`)).not.toContain("errors.codes");
      }
    }
  });

  it("maps known Supabase auth error codes", async () => {
    await i18n.changeLanguage("es");

    expect(errorMessage({ code: "invalid_credentials", message: "Invalid login credentials" }, t, "fallback")).toBe("Correo o contraseña incorrectos.");
  });

  it("uses the given fallback for unknown errors", () => {
    expect(errorMessage(new Error("boom"), t, "Unable to sign in.")).toBe("Unable to sign in.");
    expect(errorMessage({ code: "something_else" }, t, "Unable to sign in.")).toBe("Unable to sign in.");
    expect(errorMessage(null, t, "Unable to sign in.")).toBe("Unable to sign in.");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --runInBand tests/unit/error-message.test.ts`
Expected: FAIL (`Cannot find module '../../src/i18n/errors'`).

- [ ] **Step 3: Implement**

`src/i18n/errors.ts`:

```ts
import { DomainError } from "../lib/errors/domain-errors";

const AUTH_CODES = new Set([
  "email_not_confirmed",
  "invalid_credentials",
  "over_email_send_rate_limit",
  "over_request_rate_limit",
  "user_already_exists",
  "weak_password",
]);

export function errorMessage(error: unknown, t: (key: string) => string, fallback: string) {
  if (error instanceof DomainError) {
    return t(`errors.codes.${error.code}`);
  }

  const code = (error as { code?: unknown } | null)?.code;

  return typeof code === "string" && AUTH_CODES.has(code) ? t(`errors.auth.${code}`) : fallback;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run typecheck && npm run lint && npm test -- --runInBand tests/unit/error-message.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/errors.ts tests/unit/error-message.test.ts
git commit -m "feat(i18n): map domain and auth errors to translated messages"
```

---

### Task 5: Shared components and validation keys

**Files:**
- Modify: `src/components/domain/StatusBadge.tsx`, `src/components/domain/ServiceCard.tsx`, `src/features/appointments/use-appointment-cards.ts`, `src/features/auth/validation.ts`
- Test: extend `tests/unit/status-badge.test.ts`, `tests/unit/service-card.test.ts`, `tests/unit/signup-validation.test.ts`; create `tests/unit/component-translations.test.ts`

**Interfaces:**
- Consumes: `t` via `useTranslation` (Task 1); keys `status.*`, `common.minutesShort`, `appointments.fallbackBarber|fallbackShop`, `auth.validation.*` (Task 2).
- Produces: `StatusBadge` shows `t("status.<status>")` unless `label` is given; `ServiceCard` shows `t("common.minutesShort", { count })`; `parseSignupInput` returns error **keys** (`"auth.validation.email"`, …) instead of English text; `useAppointmentCards(appointments)` now returns cards using the current language and translated fallbacks.

- [ ] **Step 1: Write the failing tests**

`tests/unit/component-translations.test.ts`:

```ts
import React from "react";
import { render } from "@testing-library/react-native";

import { StatusBadge } from "../../src/components/domain/StatusBadge";
import i18n from "../../src/i18n";

describe("component translations", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("StatusBadge follows the language", async () => {
    await i18n.changeLanguage("pt");
    const view = await render(React.createElement(StatusBadge, { status: "no_show" }));

    expect(view.getByText("Não compareceu")).toBeTruthy();
  });

  it("StatusBadge keeps an explicit label", async () => {
    await i18n.changeLanguage("es");
    const view = await render(React.createElement(StatusBadge, { label: "Custom", status: "confirmed" }));

    expect(view.getByText("Custom")).toBeTruthy();
  });
});
```

In `tests/unit/signup-validation.test.ts` replace the loose `expect.any(String)` cases with exact keys:

```ts
  it.each([
    ["fullName", { fullName: "A" }, "auth.validation.fullName"],
    ["email", { email: "not-an-email" }, "auth.validation.email"],
    ["password", { password: "short" }, "auth.validation.password"],
    ["phone", { phone: "abc" }, "auth.validation.phone"],
  ])("rejects a bad %s with a translation key", (field, patch, key) => {
    const result = parseSignupInput({ ...valid, ...patch });
    expect((result as { errors: Record<string, string> }).errors[field]).toBe(key);
  });

  it("uses a key for the terms error", () => {
    const result = parseSignupInput({ ...valid, acceptedTerms: false });
    expect((result as { errors: Record<string, string> }).errors.acceptedTerms).toBe("auth.validation.acceptTerms");
  });
```
(remove the previous `it("requires accepting the terms"…)` and the old `it.each` "rejects a bad %s").

Append to `tests/unit/service-card.test.ts` a case that renders `ServiceCard` after `await i18n.changeLanguage("pt")` and asserts the duration text is `"30 min"` (same digits; adjust the props to that file's existing base props) and restore `en` in `afterEach`.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --runInBand tests/unit/component-translations.test.ts tests/unit/signup-validation.test.ts tests/unit/service-card.test.ts tests/unit/status-badge.test.ts`
Expected: FAIL (StatusBadge still English; validation still returns English).

- [ ] **Step 3: Implement**

`StatusBadge.tsx`: delete `DEFAULT_LABEL`; add `import { useTranslation } from "react-i18next";`; inside the component `const { t } = useTranslation();` and render `{label ?? t(\`status.${status}\`)}`.

`ServiceCard.tsx`: `import { useTranslation } from "react-i18next";`, `const { t } = useTranslation();`, replace `{durationMinutes} min` with `{t("common.minutesShort", { count: durationMinutes })}`.

`src/features/auth/validation.ts`: replace the message literals with keys — `z.literal(true, { error: "auth.validation.acceptTerms" })`, `z.email("auth.validation.email")`, `.min(2, "auth.validation.fullName")`, `.min(8, "auth.validation.password")`, phone refine message `"auth.validation.phone"`.

`use-appointment-cards.ts`: add `import { useTranslation } from "react-i18next";` and `import { useLanguage } from "../../i18n/use-language";`; inside the hook `const { t } = useTranslation(); const language = useLanguage();`; change the returned builder to `...formatAppointmentLabels(appointment, language)`, `barberName: … ?? t("appointments.fallbackBarber")`, `shopName: … ?? t("appointments.fallbackShop")`.

- [ ] **Step 4: Run to verify pass**

Run: `npm run typecheck && npm run lint && npm test -- --runInBand`
Expected: PASS (existing English assertions still pass because tests run in `en`).

- [ ] **Step 5: Commit**

```bash
git add src tests/unit
git commit -m "feat(i18n): translate shared components and signup validation keys"
```

---

### Task 6: Auth and legal screens

**Files:**
- Modify: `app/(auth)/login.tsx`, `app/(auth)/signup.tsx`, `app/(auth)/forgot-password.tsx`, `app/legal.tsx`, `src/features/account/legal.ts` (remove the `LEGAL_SECTIONS` alias)
- Create: `tests/e2e/i18n.web.spec.ts`

**Interfaces:**
- Consumes: keys `auth.*`, `common.*`, `legal.*` (Task 2); `errorMessage` (Task 4).

- [ ] **Step 1: Write the failing e2e test**

`tests/e2e/i18n.web.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test.describe("Portuguese device", () => {
  test.use({ locale: "pt-BR" });

  test("auth screens follow the device language", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Esqueci minha senha" })).toBeVisible();

    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();
    await page.getByTestId("signup-name").fill("Ana Silva");
    await page.getByTestId("signup-email").fill("ana@example.test");
    await page.getByTestId("signup-password").fill("correct-password");
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page.getByText("Aceite os termos e a política de privacidade para continuar.")).toBeVisible();
  });

  test("the legal page is in Portuguese", async ({ page }) => {
    await page.goto("/legal");
    await expect(page.getByRole("heading", { name: "Termos e privacidade" })).toBeVisible();
    await expect(page.getByText("Seus direitos (LGPD)")).toBeVisible();
  });
});

test.describe("Spanish device", () => {
  test.use({ locale: "es-ES" });

  test("auth screens follow the device language", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await expect(page.getByRole("button", { name: "¿Olvidaste tu contraseña?" })).toBeVisible();
  });
});

test.describe("Unsupported device language", () => {
  test.use({ locale: "fr-FR" });

  test("falls back to English", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
});
```

Also add `locale: "en-US"` to `use` in `playwright.config.ts` so every other spec keeps running in English:

```ts
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL ?? getE2EWebBaseUrl(),
    locale: "en-US",
  },
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:e2e:web`
Expected: the three non-English tests FAIL (headings still English); every other test passes.

- [ ] **Step 3: Convert the screens**

For each file: `import { useTranslation } from "react-i18next";`, `import { errorMessage } from "../../src/i18n/errors";` (path adjusted), `const { t } = useTranslation();` at the top of the component, then replace literals as follows (keep every other prop, `testID` and `className` untouched).

`app/(auth)/login.tsx`: `"Unable to sign in."` → `errorMessage(caught, t, t("auth.login.error"))` (and drop the `caught instanceof Error ? caught.message :` branch); `Sign in` heading → `t("auth.login.title")`; subtitle → `t("auth.login.subtitle")`; `label="Email"` → `t("common.email")`; `label="Password"` → `t("common.password")`; button `Sign in` → `t("auth.login.submit")`; `Forgot password?` → `t("auth.login.forgot")`; `Create account` → `t("auth.login.createAccount")`.

`app/(auth)/signup.tsx`: heading and submit → `t("auth.signup.title")` / `t("auth.signup.submit")`; `"Unable to create your account."` → `errorMessage(caught, t, t("auth.signup.error"))`; field labels → `t("common.fullName")`, `t("common.email")`, `t("common.phoneOptional")`, `t("common.password")`; checkbox `accessibilityLabel` and text → `t("auth.signup.acceptTerms")`; `Read terms and privacy policy` → `t("auth.signup.readTerms")`; `I already have an account` → `t("auth.signup.haveAccount")`; confirmation: `title="Check your email"` → `t("auth.signup.checkEmailTitle")`, body → `t("auth.signup.checkEmailBody", { email: form.email.trim().toLowerCase() })`, `Back to sign in` → `t("auth.signup.backToSignIn")`; each field `error={errors.x}` → `error={errors.x ? t(errors.x as never) : undefined}` (validation returns keys now).

`app/(auth)/forgot-password.tsx`: heading → `t("auth.reset.title")`; subtitle → `t("auth.reset.subtitle")`; `label="Email"` → `t("common.email")`; `Send reset email` → `t("auth.reset.submit")`; `Password reset email sent.` → `t("auth.reset.sent")`; `"Unable to send reset email."` → `errorMessage(caught, t, t("auth.reset.error"))`; `Back to sign in` → `t("auth.reset.backToSignIn")`.

`app/legal.tsx`: import `LEGAL_SECTION_KEYS`, `TERMS_VERSION`; heading → `t("legal.title")`; version → `t("legal.version", { version: TERMS_VERSION })`; add a line under it `<Text …>{t("legal.translationNote")}</Text>` (same classes as the version line); render sections with

```tsx
{LEGAL_SECTION_KEYS.map((key) => (
  <View className="gap-1" key={key}>
    <Text className="text-lg font-display-semibold text-ink">{t(`legal.sections.${key}.title`)}</Text>
    <Text className="text-base font-sans text-neutral-700">{t(`legal.sections.${key}.body`)}</Text>
  </View>
))}
```
and `label="Back"` → `t("common.back")`.

`src/features/account/legal.ts`: delete the temporary `LEGAL_SECTIONS` alias and its `en` import.

- [ ] **Step 4: Run to verify pass**

Run: `npm run typecheck && npm run lint && npm test -- --runInBand && npm run test:e2e:web`
Expected: PASS (all previous e2e still English-passing; the three i18n tests now pass). If typed `t(\`…${key}\`)` fails to compile, cast the key with `as never` at that call — the parity test and e2e are the safety net.

- [ ] **Step 5: Commit**

```bash
git add app src tests playwright.config.ts
git commit -m "feat(i18n): translate auth and legal screens"
```

---

### Task 7: Customer screens

**Files:**
- Modify: `app/(customer)/_layout.tsx`, `home.tsx`, `appointments.tsx`, `reschedule.tsx`, `profile.tsx`, `book/index.tsx`, `book/barber.tsx`, `book/service.tsx`, `book/date.tsx`, `book/review.tsx`
- Modify: `tests/e2e/i18n.web.spec.ts` (add customer cases first)

**Interfaces:**
- Consumes: keys `tabs.*`, `home.*`, `appointments.*`, `reschedule.*`, `book.*`, `profile.*`, `layout.*`, `errors.*`; `useLanguage` (Task 1); `buildCalendarStripDays(…, language)` (Task 3); `errorMessage` (Task 4).

- [ ] **Step 1: Write the failing e2e cases**

Append to `tests/e2e/i18n.web.spec.ts` (add `import { appointmentRow, isHistoryQuery, json, mockCustomerRest, signInAsCustomer } from "./customer-helpers";` at the top):

```ts
test.describe("Portuguese customer", () => {
  test.use({ locale: "pt-BR" });

  test("home, agenda and profile are in Portuguese", async ({ page }) => {
    await signInAsCustomer(page);
    await mockCustomerRest(page, async (route, url) => {
      if (url.pathname.endsWith("/appointments")) {
        await json(route, isHistoryQuery(url) ? [] : [appointmentRow()]);
        return true;
      }
    });

    await page.goto("/home");
    await expect(page.getByRole("heading", { name: "Olá, Browser" })).toBeVisible();
    await expect(page.getByText("Seu próximo agendamento")).toBeVisible();
    await expect(page.getByTestId("tab-appointments")).toHaveAttribute("aria-label", "Agenda");
    await expect(page.getByTestId("tab-book")).toHaveAttribute("aria-label", "Agendar");

    await page.getByTestId("tab-appointments").click();
    await expect(page.getByTestId("agenda-segment-upcoming")).toContainText("Próximos");
    await expect(page.getByTestId("agenda-segment-history")).toContainText("Histórico");
    await expect(page.getByText("Agendado")).toBeVisible();

    await page.getByTestId("tab-profile").click();
    await expect(page.getByRole("heading", { name: "Perfil" })).toBeVisible();
    await expect(page.getByTestId("profile-save")).toContainText("Salvar alterações");
  });

  test("a booking error is translated", async ({ page }) => {
    await signInAsCustomer(page);
    await mockCustomerRest(page, async (route, url) => {
      if (url.pathname.endsWith("/barber_services")) {
        await json(route, [{ duration_override_minutes: null, id: "33333333-3333-4333-8333-333333333333", price_override_cents: null, service_id: "s", services: { duration_minutes: 30, name: "Corte", price_cents: 4000 } }]);
        return true;
      }
      if (url.pathname.endsWith("/rpc/get_available_slots")) {
        await json(route, [{ ends_at: "2099-01-01T12:30:00Z", local_date: "2099-01-01", local_time: "09:00:00", starts_at: "2099-01-01T12:00:00Z" }]);
        return true;
      }
      if (url.pathname.endsWith("/rpc/book_appointment")) {
        await json(route, { code: "23P01", message: "overlap" }, 409);
        return true;
      }
    });

    await page.goto("/book");
    await page.getByRole("button", { name: "Browser Barber" }).click();
    await page.getByRole("button", { name: "Corte" }).click();
    await page.getByRole("button", { name: "Continuar para a revisão" }).click();
    await page.getByRole("button", { name: "09:00" }).click();
    await page.getByRole("button", { name: "Confirmar agendamento" }).click();

    await expect(page.getByText("Esse horário não está mais disponível.")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:e2e:web`
Expected: the two new customer tests FAIL; everything else passes.

- [ ] **Step 3: Convert the screens**

Same mechanics as Task 6 (`useTranslation`, `errorMessage`, `useLanguage`). Replacements:

`_layout.tsx`: the four `ITEMS` labels can no longer be module constants — build inside the component: `const items = [{ icon: House, key: "home", label: t("tabs.home") }, { icon: CalendarPlus, key: "book", label: t("tabs.book") }, { icon: CalendarDays, key: "appointments", label: t("tabs.agenda") }, { icon: User, key: "profile", label: t("tabs.profile") }];` and pass `items={items}`; `Unable to set up your account.` → `t("layout.bootstrapError")`; `Try again` → `t("common.tryAgain")`.

`home.tsx`: greeting → `firstName ? t("home.greeting", { name: firstName }) : t("home.welcome")`; `Your next appointment` → `t("home.nextAppointment")`; `Unable to load appointments.` → `t("home.loadError")`; `title="No upcoming appointments"` → `t("home.empty")`; `Book an appointment` → `t("home.bookCta")`; toast message → `t("home.bookingConfirmed")`.

`appointments.tsx`: `Agenda` → `t("appointments.title")`; `Upcoming`/`History` → `t("appointments.upcoming")`/`t("appointments.history")`; `Changes are only allowed…` → `t("appointments.locked")`; `Confirm cancellation`, `Keep appointment`, `Reschedule`, `Cancel appointment` → `t("appointments.confirmCancel")`, `t("appointments.keep")`, `t("appointments.reschedule")`, `t("appointments.cancel")`; `"Appointment cancelled."` → `t("appointments.cancelled")`; `"Unable to cancel."` → `errorMessage(error, t, t("appointments.cancelError"))`; `Unable to load appointments.` → `t("appointments.loadError")`; `No appointments this day` → `t("appointments.emptyDay")`; `No past appointments yet` → `t("appointments.emptyHistory")`; `buildCalendarStripDays(new Date(), DAYS_AHEAD)` → `buildCalendarStripDays(new Date(), DAYS_AHEAD, language)` with `const language = useLanguage();` and add `language` to the `useMemo` dependency list.

`reschedule.tsx`: `Reschedule` → `t("reschedule.title")`; `Unable to load availability.` → `t("reschedule.loadError")`; `No times available this day` → `t("reschedule.noTimes")`; `Confirm new time`/`Keep current time` → `t("reschedule.confirm")`/`t("reschedule.keep")`; `"Unable to reschedule."` → `errorMessage(caught, t, t("reschedule.error"))`; pass `language` to `buildCalendarStripDays` (and its `useMemo` deps).

`profile.tsx`: map each literal to `profile.*` (`title`, `save`, `saved`, `saveError`, `yourData`, `download`, `exportReady`, `exportError`, `terms`, `delete`, `deleteWarning`, `deleteConfirm`, `keep`, `deleteError`, `signOut`, `signOutError`); field labels → `common.fullName`, `common.phoneOptional`. Every `fail(caught, "Unable to …")` becomes `fail(caught, t("profile.<key>Error"))` and `fail` itself becomes `setFeedback({ message: errorMessage(caught, t, fallback), variant: "error" })`.

`book/index.tsx`: `Book an appointment` → `t("book.shopTitle")`; `Unable to load shops.` → `t("book.shopsError")`; `No shops available` → `t("book.noShops")`; `Start booking at ${shop.name}` → `t("book.startAt", { shop: shop.name })`.
`book/barber.tsx`: heading → `t("book.barberTitle")`; `Unable to load barbers.` → `t("book.barbersError")`; `No barbers available` → `t("book.noBarbers")`.
`book/service.tsx`: heading (read the file for its exact current text) → `t("book.serviceTitle")`; `Unable to load services.` → `t("book.servicesError")`; `No services available` → `t("book.noServices")`.
`book/date.tsx`: heading → `t("book.dateTitle")`; `Continue to review` → `t("book.continue")`; `buildCalendarStripDays(new Date(), DAYS_AHEAD, language)`.
`book/review.tsx`: heading → `t("book.reviewTitle")`; `Unable to load availability.` → `t("book.timesError")`; `No times available this day` → `t("book.noTimes")`; `Notes (optional)` → `t("book.notes")`; `Confirm booking` → `t("book.confirm")`; `"Choose an available time before booking."` → `t("book.chooseTime")`; `"Notes must be 500 characters or fewer."` → `t("book.notesTooLong")`; `onError` message → `errorMessage(error, t, t("book.error"))`. The mutation's thrown `Error("Choose an available time…")` should throw `new Error(t("book.chooseTime"))`.

- [ ] **Step 4: Run to verify pass**

Run: `npm run typecheck && npm run lint && npm test -- --runInBand && npm run test:e2e:web`
Expected: PASS. Also open the app in a browser once with `locale` pt-BR and es-ES (Task 14) and screenshot each tab.

- [ ] **Step 5: Commit**

```bash
git add app tests/e2e/i18n.web.spec.ts
git commit -m "feat(i18n): translate customer screens and tab labels"
```

---

### Task 8: Owner screens

**Files:**
- Modify: `app/index.tsx`, `app/(owner)/agenda.tsx`, `appointment-form.tsx`, `barbers.tsx`, `customers.tsx`, `index.tsx`, `monthly-customers.tsx`, `recurrence-conflicts.tsx`, `schedule.tsx`, `services.tsx`, `settings.tsx`; `src/i18n/locales/en.ts`, `pt.ts`, `es.ts` (new top-level `owner` group)
- Modify: `tests/e2e/i18n.web.spec.ts`

**Interfaces:**
- Produces: resource group `owner` with one sub-object per screen: `owner.hub`, `owner.agenda`, `owner.appointmentForm`, `owner.barbers`, `owner.customers`, `owner.monthlyCustomers`, `owner.conflicts`, `owner.schedule`, `owner.services`, `owner.settings`, plus `owner.common` for repeated words (Save, Cancel, Archive, Restore, Active, …). Key naming rule: camelCase of the purpose, never of the English text (`saveButton`, `emptyList`, `loadError`); dynamic text uses `{{placeholders}}`.

This task converts existing text; it has no new design. Do it screen by screen, one commit per two or three screens, in this order: `app/index.tsx` (owner hub links) and `settings.tsx`, then `barbers`, `services`, `customers`, then `agenda`, `appointment-form`, then `monthly-customers`, `recurrence-conflicts`, `schedule`.

- [ ] **Step 1: Write the failing e2e case for the first batch**

Append to `tests/e2e/i18n.web.spec.ts` an owner test on the owner hub (`app/index.tsx`), mirroring the existing owner sign-in mock in `tests/e2e/auth.web.spec.ts` with `test.use({ locale: "pt-BR" })`, and assert the Portuguese texts you are about to add (for example the hub heading and the "Gerenciar agenda" link). Add one assertion per converted screen batch (at least one Portuguese heading per screen) as you go, reusing each screen's existing e2e mock from `tests/e2e/owner-agenda.web.spec.ts`, `recurrence.web.spec.ts` and `schedule.spec.ts`.

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:e2e:web`
Expected: the new owner assertion FAILS (English text).

- [ ] **Step 3: Convert one screen (procedure, repeat per screen)**

1. Read the screen; list every visible literal: JSX text, `label`/`placeholder`/`title`/`message`/`accessibilityLabel` props, error fallbacks, and text built with template strings.
2. Add the keys under `owner.<screen>` in `en.ts` with the exact current English text, then the same keys in `pt.ts` (Brazilian Portuguese, informal "você", same terms used in the customer strings: agendamento, barbeiro, serviço, barbearia) and `es.ts` (neutral Latin-American Spanish, terms: cita, barbero, servicio, barbería).
3. In the screen: `const { t } = useTranslation();` and replace each literal with `t("owner.<screen>.<key>")`; errors go through `errorMessage(caught, t, t("owner.<screen>.<key>"))`; dates through `useLanguage()` + `formatDateLabel`.
4. `npm run typecheck && npm test -- --runInBand tests/unit/locale-parity.test.ts` (parity proves all three languages have every new key), then the e2e specs for that screen.
5. Commit: `git commit -m "feat(i18n): translate owner <screens>"`.

- [ ] **Step 4: Run to verify pass**

After the last screen: `npm run typecheck && npm run lint && npm test -- --runInBand && npm run test:e2e:web`
Expected: PASS.

- [ ] **Step 5: Commit** the last batch as in Step 3.5.

---

### Task 9: Guard against untranslated literals

**Files:**
- Create: `tests/unit/no-hardcoded-text.test.ts`

**Interfaces:**
- Produces: `findHardcodedText(source: string): string[]` (exported from the test file is not possible; keep it inline) — flags JSX text nodes and `label|placeholder|title|message|accessibilityLabel` string-literal props containing letters.

- [ ] **Step 1: Write the test**

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(__dirname, "..", "..");
const TEXT_PROPS = "label|placeholder|title|message|accessibilityLabel";

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

function findHardcodedText(source: string) {
  const found: string[] = [];
  const propLiteral = new RegExp(`\\b(?:${TEXT_PROPS})="([^"{}]*[A-Za-z][^"{}]*)"`, "g");
  const jsxText = />\s*([A-Za-z][A-Za-z0-9 ,.'’!?:()/&-]*?)\s*<\//g;

  for (const match of source.matchAll(propLiteral)) found.push(match[1]);
  for (const match of source.matchAll(jsxText)) found.push(match[1].trim());

  return found;
}

describe("hard-coded text guard", () => {
  it("flags literal text in JSX and text props", () => {
    expect(findHardcodedText('<Button label="Save" />')).toEqual(["Save"]);
    expect(findHardcodedText("<Text>Book now</Text>")).toEqual(["Book now"]);
    expect(findHardcodedText('<Text>{t("a.b")}</Text>')).toEqual([]);
    expect(findHardcodedText('<Button label={t("a.b")} />')).toEqual([]);
  });

  it("finds no untranslated text in routes or components", () => {
    const files = [...listFiles(join(root, "app")), ...listFiles(join(root, "src", "components"))].filter((file) => file.endsWith(".tsx"));
    const offenders = files.flatMap((file) =>
      findHardcodedText(readFileSync(file, "utf8")).map((text) => `${relative(root, file)}: ${text}`),
    );

    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it catches leftovers**

Run: `npm test -- --runInBand tests/unit/no-hardcoded-text.test.ts`
Expected: the synthetic test passes; the real-tree test lists any remaining literal. Translate each offender (add keys to all three languages) or, only for non-text values the regex mis-detects (for example a technical string), rewrite the source so it is not a text prop. Do not add an allowlist for real user-facing text.

- [ ] **Step 3: Make it pass**

Repeat until the offender list is empty.

- [ ] **Step 4: Run the full suite**

Run: `npm run typecheck && npm run lint && npm test -- --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/no-hardcoded-text.test.ts app src
git commit -m "test(i18n): guard against untranslated text in routes and components"
```

---

### Task 10: Backend — notification locale (migration + pgTAP)

**Files:**
- Create: `supabase/migrations/0024_notification_locale.sql`, `supabase/tests/012_notification_locale.sql`

**Interfaces:**
- Produces:
  - `notification_tokens.locale text not null default 'en'`, check `locale in ('en','pt','es')`
  - `register_notification_token(target_expo_push_token text, target_platform text default null, target_locale text default null)` (unsupported or null locale is stored as `en`; re-registering updates it)
  - `claim_notification_batch(target_limit integer default 50)` returns the previous columns **plus `locale text` as the last column**

- [ ] **Step 1: Read the current grants**

Run: `grep -n "revoke\|grant" supabase/migrations/0021_notifications.sql supabase/migrations/0022_notification_jobs.sql` and copy the exact grant/revoke pattern used for `claim_notification_batch` and `register_notification_token`.

- [ ] **Step 2: Write the failing pgTAP test**

`supabase/tests/012_notification_locale.sql`:

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't12-user@example.com', 'password-hash', now());

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select locale from public.register_notification_token('ExponentPushToken[t12a]', 'ios', 'pt')), 'pt', 'stores the device locale');
select is((select locale from public.register_notification_token('ExponentPushToken[t12a]', 'ios', 'es')), 'es', 're-registering updates the locale');
select is((select locale from public.register_notification_token('ExponentPushToken[t12b]', 'ios', 'fr')), 'en', 'unsupported locales fall back to en');
select is((select locale from public.register_notification_token('ExponentPushToken[t12c]', 'ios', null)), 'en', 'a missing locale is en');
select is((select locale from public.register_notification_token('ExponentPushToken[t12d]', 'ios')), 'en', 'the old two-argument call still works');

reset role;
delete from public.notification_tokens where user_id = 'b0000000-0000-0000-0000-000000000001' and expo_push_token <> 'ExponentPushToken[t12a]';

insert into public.notification_outbox (event_key, event_type, recipient_user_id, payload)
values ('t12:reminder', 'appointment.reminder', 'b0000000-0000-0000-0000-000000000001', '{"service_name":"Corte"}');

select is(
  (select locale from public.claim_notification_batch(10) where expo_push_token = 'ExponentPushToken[t12a]' limit 1),
  'es',
  'claim_notification_batch returns the token locale'
);

select is(
  (select count(*)::int from public.notification_tokens where locale not in ('en', 'pt', 'es')),
  0,
  'the check constraint keeps locales supported'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Run to verify failure**

Run: `npx supabase test db --local supabase/tests/012_notification_locale.sql`
Expected: FAIL (`function public.register_notification_token(unknown, unknown, unknown) does not exist`). Docker and the local stack must be running (`npx supabase status`); if they are not, start them with `npx supabase start`.

- [ ] **Step 4: Write the migration**

`supabase/migrations/0024_notification_locale.sql`:

```sql
alter table public.notification_tokens
  add column locale text not null default 'en'
  constraint notification_tokens_locale_check check (locale in ('en', 'pt', 'es'));

drop function public.register_notification_token(text, text);

create function public.register_notification_token(
  target_expo_push_token text,
  target_platform text default null,
  target_locale text default null
)
returns setof public.notification_tokens
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  normalized_locale text := case when target_locale in ('en', 'pt', 'es') then target_locale else 'en' end;
begin
  if actor_id is null then
    raise exception using errcode = 'P0016', message = 'NOTIFICATION_TOKEN_FORBIDDEN';
  end if;
  if target_expo_push_token is null or btrim(target_expo_push_token) = '' then
    raise exception using errcode = 'P0016', message = 'NOTIFICATION_TOKEN_INVALID';
  end if;

  return query
  insert into public.notification_tokens (user_id, expo_push_token, platform, locale)
  values (actor_id, btrim(target_expo_push_token), nullif(btrim(target_platform), ''), normalized_locale)
  on conflict (expo_push_token) do update
  set user_id = excluded.user_id,
      platform = excluded.platform,
      locale = excluded.locale,
      active = true,
      last_seen_at = clock_timestamp(),
      updated_at = clock_timestamp()
  returning *;
end;
$$;

revoke all on function public.register_notification_token(text, text, text) from public;
grant execute on function public.register_notification_token(text, text, text) to authenticated;

drop function public.claim_notification_batch(integer);

create function public.claim_notification_batch(target_limit integer default 50)
returns table (
  id uuid,
  event_type text,
  payload jsonb,
  expo_push_token text,
  attempts integer,
  max_attempts integer,
  locale text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  return query
  with candidates as (
    select outbox.id
    from public.notification_outbox outbox
    where outbox.status in ('pending', 'failed')
      and outbox.available_at <= clock_timestamp()
      and outbox.attempts < outbox.max_attempts
    order by outbox.created_at
    for update skip locked
    limit greatest(1, least(coalesce(target_limit, 50), 100))
  ), claimed as (
    update public.notification_outbox outbox
    set status = 'sending',
        attempts = outbox.attempts + 1,
        claimed_at = clock_timestamp(),
        updated_at = clock_timestamp()
    from candidates
    where outbox.id = candidates.id
    returning outbox.*
  )
  select claimed.id,
         claimed.event_type,
         claimed.payload,
         tokens.expo_push_token,
         claimed.attempts,
         claimed.max_attempts,
         coalesce(tokens.locale, 'en')
  from claimed
  left join public.notification_tokens tokens
    on tokens.user_id = claimed.recipient_user_id
   and tokens.active;
end;
$$;
```
Then re-apply for `claim_notification_batch(integer)` the exact `revoke`/`grant` lines you copied in Step 1 (they are dropped along with the function).

- [ ] **Step 5: Run to verify pass and regressions**

Run: `npx supabase db reset --local` then `npx supabase test db --local supabase/tests/012_notification_locale.sql` then `npm run test:db`
Expected: PASS, and all earlier pgTAP files (notably `009_notifications.sql`, which calls both functions) still pass. Commit:

```bash
git add supabase/migrations/0024_notification_locale.sql supabase/tests/012_notification_locale.sql
git commit -m "feat(db): store push token locale and return it when claiming notifications"
```

---

### Task 11: Client sends the device locale with the push token

**Files:**
- Modify: `src/features/notifications/api.ts`, `src/features/notifications/register-token.ts`, `tests/integration/notifications.test.ts`

**Interfaces:**
- Consumes: `Language` (Task 1), `getCurrentLanguage` (Task 1).
- Produces:
  - `registerNotificationToken(supabase, expoPushToken, platform = null, locale: Language | null = null)` → RPC args `{ target_expo_push_token, target_platform, target_locale }`
  - `saveExpoPushToken(supabase, expoPushToken, platform = null, locale: Language | null = getCurrentLanguage())`
- Note: nothing in the app calls these yet (push registration is not wired into any screen); this task only prepares the contract. State that in the PR description.

- [ ] **Step 1: Write the failing tests**

In `tests/integration/notifications.test.ts` change the first test's expectation and add one:

```ts
    expect(rpc).toHaveBeenCalledWith("register_notification_token", {
      target_expo_push_token: "ExponentPushToken[test]",
      target_locale: null,
      target_platform: "ios",
    });
  });

  it("sends the device locale when given", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ active: true, expo_push_token: "t", platform: "ios" }], error: null });

    await registerNotificationToken({ rpc } as never, "t", "ios", "pt");

    expect(rpc).toHaveBeenCalledWith("register_notification_token", {
      target_expo_push_token: "t",
      target_locale: "pt",
      target_platform: "ios",
    });
  });

  it("saveExpoPushToken defaults to the current app language", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ active: true, expo_push_token: "t", platform: "ios" }], error: null });

    await saveExpoPushToken({ rpc } as never, "t", "ios");

    expect(rpc).toHaveBeenCalledWith("register_notification_token", expect.objectContaining({ target_locale: "en" }));
  });
```
(Keep the surrounding `it(...)` structure; the first block replaces the existing expectation, the two new tests go after it.)

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --runInBand tests/integration/notifications.test.ts`
Expected: FAIL (`target_locale` missing).

- [ ] **Step 3: Implement**

`api.ts`: add `import type { Language } from "../../i18n/language";`; new signature `registerNotificationToken(supabase, expoPushToken, platform: string | null = null, locale: Language | null = null)` and RPC args `{ target_expo_push_token: expoPushToken, target_locale: locale, target_platform: platform }`.

`register-token.ts`: add `import { getCurrentLanguage } from "../../i18n";` and `import type { Language } from "../../i18n/language";`; signature `(supabase, expoPushToken, platform: string | null = null, locale: Language | null = getCurrentLanguage())` and pass `locale` through.

- [ ] **Step 4: Run to verify pass**

Run: `npm run typecheck && npm run lint && npm test -- --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/notifications tests/integration/notifications.test.ts
git commit -m "feat(i18n): send the device language when registering a push token"
```

---

### Task 12: Localised push notification text

**Files:**
- Create: `supabase/functions/dispatch-notifications/messages.ts`
- Modify: `supabase/functions/dispatch-notifications/index.ts`, `tsconfig.json` (only if needed for the `.ts` import extension)
- Test: `tests/unit/notification-messages.test.ts`

**Interfaces:**
- Produces:
  - `type Locale = "en" | "pt" | "es"`; `normalizeLocale(value: unknown): Locale`
  - `buildMessage(eventType: string, locale: unknown, payload: Record<string, unknown>, timeZone?: string): { title: string; body: string }` (default timezone `America/Sao_Paulo`)

- [ ] **Step 1: Write the failing test**

`tests/unit/notification-messages.test.ts`:

```ts
import { buildMessage, normalizeLocale } from "../../supabase/functions/dispatch-notifications/messages";

const appointment = { service_name: "Corte", starts_at: "2026-08-17T12:00:00Z" }; // 09:00 in America/Sao_Paulo

describe("normalizeLocale", () => {
  it.each([["pt", "pt"], ["es", "es"], ["en", "en"], ["fr", "en"], [null, "en"], [undefined, "en"], [42, "en"]])("%p -> %p", (value, expected) => {
    expect(normalizeLocale(value)).toBe(expected);
  });
});

describe("buildMessage", () => {
  it.each([
    ["appointment.booked", "en", "Appointment booked"],
    ["appointment.booked", "pt", "Agendamento confirmado"],
    ["appointment.booked", "es", "Cita reservada"],
    ["appointment.cancelled", "pt", "Agendamento cancelado"],
    ["appointment.rescheduled", "es", "Cita reprogramada"],
    ["appointment.reminder", "en", "Appointment reminder"],
    ["appointment.reminder", "pt", "Lembrete de agendamento"],
    ["recurrence.conflict", "es", "Conflicto en cita recurrente"],
  ])("%s in %s has the title %s", (eventType, locale, title) => {
    expect(buildMessage(eventType, locale, appointment).title).toBe(title);
  });

  it("puts the service and the shop-local time in the body", () => {
    const body = buildMessage("appointment.booked", "pt", appointment).body;

    expect(body).toContain("Corte");
    expect(body).toContain("09:00");
  });

  it("formats the time in the shop timezone, not UTC", () => {
    expect(buildMessage("appointment.reminder", "en", appointment).body).toContain("09:00");
    expect(buildMessage("appointment.reminder", "en", appointment, "UTC").body).toContain("12:00");
  });

  it("describes a recurrence conflict with its date", () => {
    const body = buildMessage("recurrence.conflict", "en", { occurrence_date: "2026-08-17" }).body;

    expect(body).toMatch(/17/);
    expect(body).toMatch(/conflict/i);
  });

  it("falls back to English for unknown locales", () => {
    expect(buildMessage("appointment.booked", "fr", appointment).title).toBe("Appointment booked");
  });

  it("uses a generic word when the service name is missing", () => {
    expect(buildMessage("appointment.booked", "en", { starts_at: appointment.starts_at }).body).toContain("Appointment");
  });

  it("returns a generic message for an unknown event type", () => {
    expect(buildMessage("something.else", "pt", {})).toEqual({ body: "Você tem uma nova notificação.", title: "Barberschedule" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --runInBand tests/unit/notification-messages.test.ts`
Expected: FAIL (`Cannot find module`).

- [ ] **Step 3: Implement**

`supabase/functions/dispatch-notifications/messages.ts` (pure TypeScript, no Deno globals, no imports):

```ts
export type Locale = "en" | "pt" | "es";

const LOCALE_TAG: Record<Locale, string> = { en: "en-GB", es: "es-ES", pt: "pt-BR" };
const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

type Template = { title: string; body: (service: string, when: string) => string };
type Catalog = Record<Locale, Template>;

export function normalizeLocale(value: unknown): Locale {
  return value === "pt" || value === "es" ? value : "en";
}

const GENERIC_SERVICE: Record<Locale, string> = { en: "Appointment", es: "Cita", pt: "Agendamento" };

const UNKNOWN: Record<Locale, string> = {
  en: "You have a new notification.",
  es: "Tienes una nueva notificación.",
  pt: "Você tem uma nova notificação.",
};

const APPOINTMENT_EVENTS: Record<string, Catalog> = {
  "appointment.booked": {
    en: { body: (s, w) => `${s} on ${w}.`, title: "Appointment booked" },
    es: { body: (s, w) => `${s} el ${w}.`, title: "Cita reservada" },
    pt: { body: (s, w) => `${s} em ${w}.`, title: "Agendamento confirmado" },
  },
  "appointment.cancelled": {
    en: { body: (s, w) => `${s} on ${w} was cancelled.`, title: "Appointment cancelled" },
    es: { body: (s, w) => `${s} el ${w} fue cancelada.`, title: "Cita cancelada" },
    pt: { body: (s, w) => `${s} em ${w} foi cancelado.`, title: "Agendamento cancelado" },
  },
  "appointment.rescheduled": {
    en: { body: (s, w) => `${s} moved to ${w}.`, title: "Appointment rescheduled" },
    es: { body: (s, w) => `${s} reprogramada para ${w}.`, title: "Cita reprogramada" },
    pt: { body: (s, w) => `${s} remarcado para ${w}.`, title: "Agendamento remarcado" },
  },
  "appointment.reminder": {
    en: { body: (s, w) => `Coming up: ${s} on ${w}.`, title: "Appointment reminder" },
    es: { body: (s, w) => `Próxima cita: ${s} el ${w}.`, title: "Recordatorio de cita" },
    pt: { body: (s, w) => `Em breve: ${s} em ${w}.`, title: "Lembrete de agendamento" },
  },
};

const CONFLICT: Catalog = {
  en: { body: (_s, w) => `The recurring booking on ${w} has a conflict and needs a decision.`, title: "Recurring booking conflict" },
  es: { body: (_s, w) => `La cita recurrente del ${w} tiene un conflicto y requiere una decisión.`, title: "Conflicto en cita recurrente" },
  pt: { body: (_s, w) => `O agendamento recorrente de ${w} tem um conflito e precisa de uma decisão.`, title: "Conflito em agendamento recorrente" },
};

function formatWhen(startsAt: unknown, locale: Locale, timeZone: string) {
  const date = new Date(String(startsAt));

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    day: "numeric", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "short", timeZone, weekday: "short",
  }).format(date);
}

function formatDate(occurrenceDate: unknown, locale: Locale) {
  const date = new Date(`${String(occurrenceDate)}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(LOCALE_TAG[locale], { day: "numeric", month: "short", timeZone: "UTC", weekday: "short" }).format(date);
}

export function buildMessage(
  eventType: string,
  locale: unknown,
  payload: Record<string, unknown>,
  timeZone: string = DEFAULT_TIME_ZONE,
) {
  const language = normalizeLocale(locale);

  if (eventType === "recurrence.conflict") {
    const template = CONFLICT[language];

    return { body: template.body("", formatDate(payload.occurrence_date, language)), title: template.title };
  }

  const catalog = APPOINTMENT_EVENTS[eventType];

  if (!catalog) {
    return { body: UNKNOWN[language], title: "Barberschedule" };
  }

  const template = catalog[language];
  const service = typeof payload.service_name === "string" && payload.service_name ? payload.service_name : GENERIC_SERVICE[language];

  return { body: template.body(service, formatWhen(payload.starts_at, language, timeZone)), title: template.title };
}
```

`index.ts`: add `import { buildMessage } from "./messages.ts";`; add `locale: string | null;` to `ClaimedNotification`; replace `title: notification.event_type, body: notification.event_type,` with

```ts
    body: JSON.stringify({
      to: notification.expo_push_token,
      ...buildMessage(notification.event_type, notification.locale, notification.payload),
      data: notification.payload,
    }),
```
(keep the surrounding `fetch` options). If `tsc` rejects the `.ts` extension, add `"allowImportingTsExtensions": true` under `compilerOptions` in `tsconfig.json` (it is valid because `tsc` runs with `--noEmit`); otherwise leave `tsconfig.json` alone.

- [ ] **Step 4: Run to verify pass**

Run: `npm run typecheck && npm run lint && npm test -- --runInBand tests/unit/notification-messages.test.ts`
Expected: PASS. If a body assertion fails only because ICU renders the time differently (for example `9:00` vs `09:00`), fix the code to force `hour: "2-digit"` with `hourCycle: "h23"` (already set) rather than loosening the test.

- [ ] **Step 5: Verify the function manually and commit**

Repeat the manual check from `docs/decisions/011-customer-self-service-and-lgpd.md` with `npx supabase functions serve --no-verify-jwt`: sign a user up, register a token with locale `pt` through the RPC, insert a `notification_outbox` row, invoke `dispatch-notifications` against the local runtime port and confirm from the function log/response that the Expo request body carries the Portuguese `title`/`body` (the Expo push call itself will fail without a real token; the request body is what you verify — log it once temporarily, then remove the log). Record the result in the decision doc (Task 14).

```bash
git add supabase/functions/dispatch-notifications tests/unit/notification-messages.test.ts tsconfig.json
git commit -m "feat(i18n): localised push notification text (pt/en/es)"
```

---

### Task 13: End-to-end coverage and language change at runtime

**Files:**
- Modify: `tests/e2e/i18n.web.spec.ts`
- Create: `tests/unit/language-change.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/language-change.test.ts` (a mounted component re-renders when the language changes):

```ts
import React from "react";
import { act, render } from "@testing-library/react-native";

import { StatusBadge } from "../../src/components/domain/StatusBadge";
import i18n from "../../src/i18n";

describe("language change at runtime", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("re-renders mounted components in the new language", async () => {
    const view = await render(React.createElement(StatusBadge, { status: "scheduled" }));
    expect(view.getByText("Scheduled")).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage("es");
    });

    expect(view.getByText("Programada")).toBeTruthy();
  });
});
```

Append to `tests/e2e/i18n.web.spec.ts`: a Spanish customer case mirroring the Portuguese one (heading `Hola, Browser`, tab label `Reservar`, segment `Próximas`), and a weekday check — with `locale: "pt-BR"` open `/appointments` (mocked as in the earlier customer case) and assert that the first calendar-strip day's text matches `/^(seg|ter|qua|qui|sex|sáb|dom)/i` (`page.getByTestId(/calendar-strip-day-/).first()` is not available for regex — use `page.locator('[data-testid^="calendar-strip-day-"]').first()` and `toContainText(/seg|ter|qua|qui|sex|sáb|dom/i)`).

- [ ] **Step 2: Run to verify**

Run: `npm test -- --runInBand tests/unit/language-change.test.ts` then `npm run test:e2e:web`
Expected: the runtime test passes if Task 1's provider wiring is right (it is a regression guard, so a first-run pass is acceptable here — confirm it would fail by temporarily breaking `useTranslation` reactivity is unnecessary); the new e2e cases pass after Task 7. Any failure points at a screen not converted in Task 7/8: fix the screen.

- [ ] **Step 3: Commit**

```bash
git add tests
git commit -m "test(i18n): runtime language change and Spanish/Portuguese e2e coverage"
```

---

### Task 14: Documentation, full gate, browser check and reviews

**Files:**
- Create: `docs/decisions/012-device-language.md`
- Modify: `docs/project-status.md`, `docs/superpowers/specs/2026-09-25-device-language-design.md` (status + amendments)

- [ ] **Step 1: Decision record and status**

`docs/decisions/012-device-language.md`: context (no i18n, English hard-coded, push notifications sent raw event codes), decisions (languages, i18next stack, device-only, 24h time, BRL price, shop timezone, error mapping by code, legal Portuguese as reference, notification locale per token), known limitations (push registration is not wired into the app yet; es/en need a native reviewer; `Intl` differences on Hermes vs iOS; shop content is not translated). `docs/project-status.md`: add "Task 15 — device language" with the real verification output from Step 2.

- [ ] **Step 2: Full gate**

Run, on a freshly reset local database:
`npx supabase db reset --local`
`npm run verify`
`npm run test:e2e:web`
`npm run export:web`
Expected: all PASS (record the counts). Revert Expo's auto-edit of `tsconfig.json` with `git checkout -- tsconfig.json` if it appears (unless Task 12 intentionally changed it).

- [ ] **Step 3: Visual check per language**

Start the web dev server with a clean cache (`npx expo start --web --clear --port 4199`, restart it after any code change — it does not hot-reload in this repo) and, with the browser locale set to `pt-BR`, `es-ES` and `en-US`, screenshot login, signup, home, agenda (with an appointment), reschedule, profile and one owner screen. Check for clipped or overflowing text (Portuguese and Spanish are 20–30% longer), especially tab labels, buttons and the calendar strip. Fix layout problems found.

- [ ] **Step 4: Request the code review**

Invoke the `requesting-code-review` skill with the range `042391e..HEAD` (spec commit to head) and the spec/plan paths as requirements; fix Critical and Important findings with new commits; push back on wrong ones with reasoning.

- [ ] **Step 5: Run `/code-review`**

Invoke the `code-review` skill on the branch diff against `worktree-feat-customer-frontend` (the PR #1 branch it is stacked on), fix real findings, re-run the gate, commit.

---

## Self-Review

**Spec coverage:** language resolution and provider/AppState sync → Task 1; resources en/pt/es, typed keys, parity → Task 2; dates/weekday formatting, 24h times, BRL price unchanged → Task 3; error and auth-error mapping → Task 4; shared components and validation keys → Task 5; auth + legal (Portuguese reference, translation note) → Task 6; customer screens → Task 7; owner screens → Task 8; guard test for untranslated text → Task 9; migration `0024` + pgTAP → Task 10; client sends locale → Task 11; localised push text for the 5 events × 3 languages with shop timezone → Task 12; Playwright fixed to `en-US` plus pt/es specs, runtime language change → Tasks 6, 7, 13; docs, full gate, per-language visual check, code reviews → Task 14. In-app picker, extra languages and RTL are explicitly out of scope.

**Placeholder scan:** the only deliberate non-literal content is Task 8 (owner screens), which converts existing text by a stated procedure with parity and guard tests as proof, and the unknown English of four error codes in Task 2 (resolved by the grep in its Step 3). No TBD/TODO steps.

**Type consistency:** `Language`/`resolveLanguage` (Task 1) used by `format.ts` (3), `useLanguage` (1, 5, 7), `registerNotificationToken` (11); `errorMessage(error, t, fallback)` (4) used identically in Tasks 6–8; `buildCalendarStripDays(…, language)` and `formatAppointmentLabels(…, language)` (3) used in 5 and 7; `LEGAL_SECTION_KEYS` (2) used in 6; `buildMessage(eventType, locale, payload, timeZone?)` and `normalizeLocale` (12) match the `locale` column values (10) and the client's `Language` (11); resource keys referenced in Tasks 5–8 all exist in Task 2 (`status.*`, `common.minutesShort`, `appointments.fallback*`, `auth.validation.*`, `layout.bootstrapError`, `book.*`, `profile.*`, `errors.*`).
