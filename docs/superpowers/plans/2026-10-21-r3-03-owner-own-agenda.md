# Owner's Own Barber Agenda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An owner whose "Atender como barbeiro" is on gets a **Loja | Minha agenda** switch on the Agenda tab; "Minha agenda" is the barber agenda with Confirmar / Concluir / Faltou and the details pop-up (WhatsApp, Ligar, Lembrar, Cancelar).

**Architecture:** The barber agenda screen body moves unchanged into `src/features/appointments/BarberAgenda.tsx` with a `mode: "barber" | "owner"` prop; the barber route and a new hidden owner tab render it. The backend already serves it (`list_my_barber_agenda`, `set_my_appointment_status` key on the linked barber row, not on the role); a pgTAP test pins that. In owner mode the free-slot booking sheet, the "book again for this client" banner, the customer-profile link and Remarcar are off (the owner has the existing owner flows for those).

**Tech Stack:** Expo Router, React Query, NativeWind, pgTAP, Jest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-ux-round3-design.md`

## Global Constraints
- Branch `feat-owner-own-agenda` from `feat-plan-titles`. pgTAP `037_owner_barber_agenda.sql` (no migration unless the test shows a backend gap; if so add `0057_owner_barber_agenda_fix.sql`).
- Switch test ids: `agenda-scope-store`, `agenda-scope-mine` (on both screens); the switch is rendered only when `useOwnerAsBarber().active` is true.
- New hidden owner tab `my-barber-agenda` (add to `AGENDA_SCREENS` in `app/(owner)/_layout.tsx` so the Agenda tab stays highlighted) and `ROUTE_PARENTS["/my-barber-agenda"] = "/agenda"`.
- Test ids inside the embedded agenda stay the barber ones (`barber-appointment-<id>`, `barber-confirm-<id>`, `barber-appt-whatsapp-<id>`, …).
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Use `rtk`; verify at 375px; Expo restart before e2e (`/tmp/claude-1000/restart.sh`).

---

### Task 1: Backend works for an owner with a barber row (pgTAP)

**Files:** Create `supabase/tests/037_owner_barber_agenda.sql`.

- [ ] **Step 1: Write the test** (plan(4)), seed in the style of `034`: owner user `fc…01` (profile role `owner`), shop owned by them, a **barber row linked to the owner's user id**, a service, barber_service, working period for Monday, a customer, and one future `scheduled` appointment inserted as the table owner for that barber. As the owner (`set local role authenticated`, `request.jwt.claim.sub`): (1) `list_my_barber_agenda(current_date, current_date + 30)` returns 1 row; (2) `set_my_appointment_status(<id>, 'confirmed')` lives; (3) the appointment's status is `confirmed` afterwards; (4) a second owner **without** a barber row gets `P0019` from `list_my_barber_agenda`.
- [ ] **Step 2: Run** — `npm run test:db 2>&1 | grep -v NOTICE | grep -A6 "037_owner"`. Expected `ok` straight away (the functions do not check the role). If a test fails, fix the function in a new migration `0057_owner_barber_agenda_fix.sql` (apply as in earlier plans) until green.
- [ ] **Step 3: Commit** — `git add -A && git commit -m "test(db): an owner with a barber row uses the barber agenda functions"`

---

### Task 2: Extract the barber agenda (behaviour-preserving)

**Files:** Create `src/features/appointments/BarberAgenda.tsx`; modify `app/(barber)/my-agenda.tsx`, `src/components/domain/AppointmentSheet.tsx`.

**Interfaces — Produces:**
```tsx
export type BarberAgendaMode = "barber" | "owner";
export function BarberAgenda(props: { header?: ReactNode; mode?: BarberAgendaMode }): JSX.Element   // header renders under ScreenTopBar
// AppointmentSheet: onOpenCustomer becomes optional; without it the customer row is a plain, non-pressable row (no chevron)
```

- [ ] **Step 1: Move.** `git mv "app/(barber)/my-agenda.tsx" src/features/appointments/BarberAgenda.tsx`, rename the default export to `export function BarberAgenda({ header, mode = "barber" }: …)`, fix the relative import paths (`../../src/…` → `../../…`), and create `app/(barber)/my-agenda.tsx`:

```tsx
import { BarberAgenda } from "../../src/features/appointments/BarberAgenda";

export default function BarberAgendaScreen() {
  return <BarberAgenda />;
}
```
- [ ] **Step 2: `AppointmentSheet`.** Make `onOpenCustomer?: () => void`; when it is missing render the same row without `Pressable`/chevron. Unit-test nothing new here (covered by e2e in Task 3).
- [ ] **Step 3: Verify nothing changed** — `npm run typecheck && npm run lint && npx jest`; restart Expo; `npx playwright test tests/e2e/barber-side.web.spec.ts tests/e2e/barber-booking.web.spec.ts tests/e2e/barber-clients.web.spec.ts tests/e2e/back-navigation.web.spec.ts` → PASS.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "refactor: barber agenda moves to a shared component"`

---

### Task 3: Owner mode and the switch

**Files:**
- Create: `src/components/domain/AgendaScopeSwitch.tsx`, `app/(owner)/my-barber-agenda.tsx`, `tests/e2e/owner-own-agenda.web.spec.ts`
- Modify: `src/features/appointments/BarberAgenda.tsx`, `app/(owner)/agenda.tsx`, `app/(owner)/_layout.tsx`, `src/lib/navigation/parents.ts`, `src/components/domain/index.ts`, `src/i18n/locales/{en,pt,es}.ts`

**Interfaces — Produces:**
```tsx
export function AgendaScopeSwitch(props: { scope: "store" | "mine" }): JSX.Element | null   // null unless the owner serves as a barber
```
Strings: `owner.agenda.scopeStore` ("Shop" / "Loja" / "Tienda"), `owner.agenda.scopeMine` ("My agenda" / "Minha agenda" / "Mi agenda").

- [ ] **Step 1: Failing e2e** `owner-own-agenda.web.spec.ts` (owner session as in `owner-recurring.web.spec.ts`; mocks: profile, shops, `list_owner_barbers` returning a barber with `user_id = ownerId` and `active: true`, `list_owner_agenda`, `list_my_barber_agenda` with one `scheduled` row for today whose `customer_phone` is `11988887777`, `get_my_barber_profile`-style call used by `getMyBarberProfile` (read `src/features/barbers/api.ts`), `list_my_barber_services`, available slots, `set_my_appointment_status` recording its body, owner agenda overrides). Tests: (a) with the barber row active, `/agenda` shows `agenda-scope-store` selected and `agenda-scope-mine`; without a barber row (or `active:false`) neither is rendered; (b) clicking `agenda-scope-mine` goes to `/my-barber-agenda`, shows `barber-appointment-<id>`; `barber-confirm-<id>` sends `{ target_status: "confirmed" }` (match the real argument names from `barber-agenda.ts`); tapping the card opens `barber-sheet` with `barber-appt-whatsapp-<id>` and `barber-appt-call-<id>`, **no** `barber-move-<id>` and the customer row is not a link; free slots are not pressable (`barber-free-slot` has no button role / click does nothing); (c) `agenda-scope-store` on that screen returns to `/agenda`; back from `/my-barber-agenda` goes to `/agenda`. Run (Expo restarted) → FAIL.
- [ ] **Step 2: Implement.**
  - `AgendaScopeSwitch`: `useOwnerAsBarber()`; returns null unless `active`; two `Pressable` pills (selected one `bg-ink`, other outline) with the test ids above; pressing the other one calls `router.navigate(scope === "store" ? "/my-barber-agenda" : "/agenda")`.
  - `app/(owner)/my-barber-agenda.tsx`: `<BarberAgenda header={<AgendaScopeSwitch scope="mine" />} mode="owner" />`.
  - `app/(owner)/agenda.tsx`: render `<AgendaScopeSwitch scope="store" />` right under `ScreenTopBar`.
  - `BarberAgenda`: render `header` under `ScreenTopBar`; when `mode === "owner"`: free-slot rows are non-pressable `View`s, `BarberBookingSheet` and the `bookFor` banner are not rendered, `onMove` and `onOpenCustomer` are not passed to `AppointmentSheet`, and the "pending closure" cards behave as in barber mode.
  - `_layout.tsx`: `AGENDA_SCREENS = ["owner-notifications", "my-barber-agenda"]` and register the hidden tab the same way `owner-notifications` is registered (look at how it is listed in the file). `parents.ts`: `"/my-barber-agenda": "/agenda"`.
  - Locales: the two new keys.
- [ ] **Step 3: Verify** — `npm run typecheck && npm run lint && npx jest` (route-parents coverage must pass); restart Expo; `npx playwright test tests/e2e/owner-own-agenda.web.spec.ts tests/e2e/owner-agenda.web.spec.ts tests/e2e/owner-shell.web.spec.ts tests/e2e/barber-side.web.spec.ts` → PASS. Screenshot `/agenda` and `/my-barber-agenda` at 375px with the switch.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: owner who serves as a barber gets a Minha agenda switch"`

---

### Task 4: Review and PR
- [ ] `npm run typecheck && npm run lint && npx jest`, `npm run test:db`, full web e2e (`--workers=3`); push `feat-owner-own-agenda`; PR via `gh api` REST (base: `feat-plan-titles`).
