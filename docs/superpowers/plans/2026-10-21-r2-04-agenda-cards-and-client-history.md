# Compact Agenda Cards, Details Pop-up and Client History Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Barber and owner agenda cards show only what is needed at a glance (time, customer, status, Confirmar/Concluir/Faltou); tapping a card opens a floating pop-up with the rest (service, price, notes, WhatsApp, Ligar, Lembrar, Remarcar, Cancelar) and a link to the customer; the client profile's history becomes a fixed-height scroll area.

**Architecture:** One presentational `AgendaCard` and one `AppointmentSheet` (a transparent `Modal`) shared by `my-agenda.tsx` (barber) and `agenda.tsx` (owner). A pure helper `quickActions` decides which quick buttons a card shows. The owner agenda RPC gains `customer_phone` (migration `0052`) so the owner pop-up can offer WhatsApp/Ligar. Test ids of the moved buttons are kept (`barber-move-<id>`, `barber-cancel-<id>`, `owner-cancel-<id>`...) so specs only need to open the pop-up first.

**Tech Stack:** React Native `Modal`, NativeWind, React Query, Postgres/pgTAP, Jest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-ux-round2-design.md`

## Global Constraints
- Branch `feat-agenda-cards` from `feat-field-examples`.
- Card content (exact): time (with date in the "awaiting closure" list), customer name, `StatusBadge`, then buttons. **Confirmar** only for the barber on a `scheduled` appointment that has not ended; **Concluir** and **Faltou** on open (`scheduled`/`confirmed`) appointments. The owner card also shows the barber's name as one grey line (the owner needs to know whose chair); the barber card does not.
- Pop-up content: date/time, service · price, barber (owner only), notes, customer name (tappable), WhatsApp, Ligar, Lembrar (barber, only with a usable phone), Remarcar (barber, open appointments), Cancelar (open appointments, **two taps**: first tap shows "Toque novamente para cancelar").
- Customer link target: barber → `/clients/<customerId>`; owner → `/customer-form?id=<customerId>` (there is no separate owner client profile; out of scope).
- Client history: the RPC already returns the latest 20; show them in a `ScrollView` with `maxHeight: 260` (no new RPC).
- Test ids: card `<prefix>-appointment-<id>` (the `Card`), tappable area `<prefix>-appointment-card-<id>`, quick buttons `<prefix>-confirm|complete|noshow-<id>`, pop-up: `<prefix>-appt-whatsapp-<id>`, `<prefix>-appt-call-<id>`, `<prefix>-remind-<id>`, `<prefix>-move-<id>`, `<prefix>-cancel-<id>`, customer link `<prefix>-appointment-customer-<id>`, close `<prefix>-sheet-close`. `<prefix>` is `barber` or `owner`.
- Back navigation is handled by the fixed-parent map (plan r2-02): no new routes are added here.
- Memory: TDD, `rtk`, verify in a browser at 375px, e2e needs `.env.local` moved aside and an Expo restart after source changes; migrations are applied locally with `docker exec -i supabase_db_barberschedule psql -U postgres -d postgres < file.sql` plus a row in `supabase_migrations.schema_migrations`.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

### Task 1: `quickActions` helper

**Files:**
- Create: `src/features/appointments/agenda-actions.ts`
- Test: `tests/unit/agenda-actions.test.ts`

**Produces:**
```ts
export type QuickActions = { complete: boolean; confirm: boolean; noShow: boolean };
export function quickActions(input: { canConfirm: boolean; endsAt: string; now: Date; status: string }): QuickActions;
```

- [ ] **Step 1: Failing test**

```ts
import { quickActions } from "../../src/features/appointments/agenda-actions";

const now = new Date("2026-10-21T15:00:00Z");
const future = "2026-10-21T16:00:00Z";
const past = "2026-10-21T14:00:00Z";

describe("quickActions", () => {
  it("a scheduled appointment can be confirmed, completed or marked as no-show", () => {
    expect(quickActions({ canConfirm: true, endsAt: future, now, status: "scheduled" })).toEqual({ complete: true, confirm: true, noShow: true });
  });

  it("a confirmed appointment has no Confirmar button", () => {
    expect(quickActions({ canConfirm: true, endsAt: future, now, status: "confirmed" })).toEqual({ complete: true, confirm: false, noShow: true });
  });

  it("an appointment that already ended cannot be confirmed any more", () => {
    expect(quickActions({ canConfirm: true, endsAt: past, now, status: "scheduled" }).confirm).toBe(false);
  });

  it("the owner never confirms (canConfirm=false)", () => {
    expect(quickActions({ canConfirm: false, endsAt: future, now, status: "scheduled" }).confirm).toBe(false);
  });

  it("closed appointments have no buttons", () => {
    for (const status of ["completed", "cancelled", "no_show"]) {
      expect(quickActions({ canConfirm: true, endsAt: future, now, status })).toEqual({ complete: false, confirm: false, noShow: false });
    }
  });
});
```

- [ ] **Step 2: Run it → FAIL** (`Cannot find module`): `npx jest tests/unit/agenda-actions.test.ts`

- [ ] **Step 3: Implement** `src/features/appointments/agenda-actions.ts`

```ts
export type QuickActions = { complete: boolean; confirm: boolean; noShow: boolean };

export const isOpenStatus = (status: string) => status === "scheduled" || status === "confirmed";

// The buttons an agenda card shows at a glance. Everything else lives in the details pop-up.
export function quickActions(input: { canConfirm: boolean; endsAt: string; now: Date; status: string }): QuickActions {
  const open = isOpenStatus(input.status);

  return {
    complete: open,
    confirm: input.canConfirm && input.status === "scheduled" && new Date(input.endsAt) >= input.now,
    noShow: open,
  };
}
```

- [ ] **Step 4: Run it → PASS.**
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: quick actions of an agenda card"`

---

### Task 2: Owner agenda returns the customer's phone (migration + client)

**Files:**
- Create: `supabase/migrations/0052_owner_agenda_phone.sql`, `supabase/tests/033_owner_agenda_phone.sql`
- Modify: `src/features/appointments/agenda-query.ts`
- Test: `tests/unit/owner-agenda-query.test.ts`

- [ ] **Step 1: Failing pgTAP** `supabase/tests/033_owner_agenda_phone.sql`

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fd000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'agp-owner@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'fd000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'agp-other@example.com', 'password-hash', now());

update public.profiles set role = 'owner' where user_id = 'fd000000-0000-0000-0000-000000000001';

insert into public.shops (id, name, owner_user_id) values ('fd100000-0000-0000-0000-000000000001', 'Agenda Phone Shop', 'fd000000-0000-0000-0000-000000000001');
insert into public.customers (id, shop_id, user_id, full_name, phone) values ('fd200000-0000-0000-0000-000000000001', 'fd100000-0000-0000-0000-000000000001', null, 'Phone Customer', '11999990001');
insert into public.barbers (id, shop_id, name) values ('fd300000-0000-0000-0000-000000000001', 'fd100000-0000-0000-0000-000000000001', 'Agenda Barber');
insert into public.services (id, shop_id, name, duration_minutes, price_cents) values ('fd400000-0000-0000-0000-000000000001', 'fd100000-0000-0000-0000-000000000001', 'Cut', 30, 4000);
insert into public.barber_services (id, shop_id, barber_id, service_id) values ('fd500000-0000-0000-0000-000000000001', 'fd100000-0000-0000-0000-000000000001', 'fd300000-0000-0000-0000-000000000001', 'fd400000-0000-0000-0000-000000000001');

insert into public.appointments (
  shop_id, barber_id, customer_id, barber_service_id, service_id, starts_at, ends_at, occupied_until, status,
  service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot
) values (
  'fd100000-0000-0000-0000-000000000001', 'fd300000-0000-0000-0000-000000000001', 'fd200000-0000-0000-0000-000000000001',
  'fd500000-0000-0000-0000-000000000001', 'fd400000-0000-0000-0000-000000000001',
  now() + interval '2 hours', now() + interval '2 hours 30 minutes', now() + interval '2 hours 30 minutes', 'scheduled', 'Cut', 30, 4000, 0
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fd000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select customer_phone from public.list_owner_agenda('fd100000-0000-0000-0000-000000000001', current_date - 1, current_date + 2)),
  '11999990001',
  'the owner agenda returns the customer phone'
);
select is(
  (select customer_name from public.list_owner_agenda('fd100000-0000-0000-0000-000000000001', current_date - 1, current_date + 2)),
  'Phone Customer',
  'the existing columns are unchanged'
);

select set_config('request.jwt.claim.sub', 'fd000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$ select * from public.list_owner_agenda('fd100000-0000-0000-0000-000000000001', current_date - 1, current_date + 2) $$,
  'P0010', null, 'only the shop owner can read the owner agenda'
);

select * from finish();

rollback;
```
Run: `npm run test:db` → the new file FAILS (`column "customer_phone" does not exist`).

- [ ] **Step 2: Generate the migration from `0015_owner_booking.sql`** (the function lives only there)

```bash
python3 - <<'EOF'
source = open("supabase/migrations/0015_owner_booking.sql").read()
start = source.index("create or replace function public.list_owner_agenda(\n")
end = source.index("\n$$;", start) + len("\n$$;")
function = source[start:end]

assert "  customer_name text\n)" in function
function = function.replace("  customer_name text\n)", "  customer_name text,\n  customer_phone text\n)", 1)
assert "    customers.full_name\n  from public.appointments" in function
function = function.replace("    customers.full_name\n  from public.appointments", "    customers.full_name,\n    customers.phone\n  from public.appointments", 1)

migration = (
    "-- The owner agenda card offers WhatsApp / phone links, so it needs the customer's phone.\n"
    "drop function public.list_owner_agenda(uuid, date, date, integer, integer);\n\n"
    + function
    + "\n\nrevoke all on function public.list_owner_agenda(uuid, date, date, integer, integer) from public;\n"
    "grant execute on function public.list_owner_agenda(uuid, date, date, integer, integer) to authenticated;\n"
)
open("supabase/migrations/0052_owner_agenda_phone.sql", "w").write(migration)
EOF
docker exec -i supabase_db_barberschedule psql -U postgres -d postgres -q < supabase/migrations/0052_owner_agenda_phone.sql
docker exec supabase_db_barberschedule psql -U postgres -d postgres -qc "insert into supabase_migrations.schema_migrations (version,name) values ('0052','owner_agenda_phone') on conflict do nothing"
npm run test:db 2>&1 | grep -A3 "033_owner"
```
Expected: `033_owner_agenda_phone.sql ... ok` (the pre-existing failures of `010` and `012` are unrelated dev-data failures).

- [ ] **Step 3: Failing client test** `tests/unit/owner-agenda-query.test.ts`

```ts
import { listOwnerAgenda } from "../../src/features/appointments/agenda-query";

it("maps the customer phone of an owner agenda row", async () => {
  const row = {
    barber_buffer_minutes_snapshot: 0, barber_id: "b1", barber_name: "Bia", barber_service_id: "bs1", created_at: "2026-10-20T10:00:00Z",
    customer_id: "c1", customer_name: "Ana", customer_phone: "11999990001", ends_at: "2026-10-21T13:30:00Z", id: "a1", notes: null,
    occupied_until: "2026-10-21T13:30:00Z", service_duration_minutes_snapshot: 30, service_id: "s1", service_name_snapshot: "Cut",
    service_price_cents_snapshot: 4000, shop_id: "sh1", source: "owner", starts_at: "2026-10-21T13:00:00Z", status: "scheduled", updated_at: "2026-10-20T10:00:00Z",
  };
  const rpc = jest.fn().mockResolvedValue({ data: [row, { ...row, customer_phone: null, id: "a2" }], error: null });

  const [first, second] = await listOwnerAgenda({ rpc } as never, { limit: 100, offset: 0, rangeEnd: "2026-10-21", rangeStart: "2026-10-21", shopId: "sh1" });

  expect(first.customerPhone).toBe("11999990001");
  expect(second.customerPhone).toBeNull();
});
```
Run → FAIL (`undefined`).

- [ ] **Step 4: Map the field** in `src/features/appointments/agenda-query.ts`:

```ts
type OwnerAgendaRow = AppointmentRow & {
  barber_name: string;
  customer_name: string;
  customer_phone?: string | null;
};
// ...
export type OwnerAgendaAppointment = Appointment & {
  barberName: string;
  customerName: string;
  customerPhone: string | null;
};
// ... inside listOwnerAgenda's map:
      customerName: agendaRow.customer_name,
      customerPhone: agendaRow.customer_phone ?? null,
```
Run: `npx jest tests/unit/owner-agenda-query.test.ts && npm run typecheck` → PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(db): owner agenda returns the customer phone"`

---

### Task 3: `AgendaCard` and `AppointmentSheet`

**Files:**
- Create: `src/components/domain/AgendaCard.tsx`, `src/components/domain/AppointmentSheet.tsx`
- Modify: `src/components/domain/index.ts`, `src/i18n/locales/{en,es,pt}.ts` (new `agendaCard` block)
- Test: e2e in Tasks 4 and 5

**Interfaces — Consumes:** `QuickActions` (Task 1); existing `StatusBadge`, `ContactLink`, `Button`, `Card`, `formatPriceBRL`, `whatsappUrl`/`telUrl` (`src/features/clients/format`). **Produces:**

```ts
export type AgendaCardProps = {
  actions: QuickActions; appointmentId: string; busy: boolean; customerName: string; onComplete: () => void;
  onConfirm: () => void; onNoShow: () => void; onOpen: () => void; status: AppointmentStatus;
  subtitle?: string; testPrefix: "barber" | "owner"; timeLabel: string;
};
export type SheetAppointment = {
  barberName?: string; customerName: string; customerPhone: string | null; dateLabel: string; id: string; notes: string | null;
  priceCents: number; serviceName: string; status: AppointmentStatus; timeLabel: string;
};
export type AppointmentSheetProps = {
  appointment: SheetAppointment | null; busy: boolean; onCancel: () => void; onClose: () => void; onMove?: () => void;
  onOpenCustomer: () => void; remindUrl?: string | null; testPrefix: "barber" | "owner";
};
```

- [ ] **Step 1: Locale block** (top level, before `common`):

```ts
// en
  agendaCard: { barber: "Barber", close: "Close", customer: "Customer", notes: "Notes" },
// pt
  agendaCard: { barber: "Barbeiro", close: "Fechar", customer: "Cliente", notes: "Observações" },
// es
  agendaCard: { barber: "Barbero", close: "Cerrar", customer: "Cliente", notes: "Notas" },
```

- [ ] **Step 2: `AgendaCard`** `src/components/domain/AgendaCard.tsx`

```tsx
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import type { QuickActions } from "../../features/appointments/agenda-actions";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { StatusBadge } from "./StatusBadge";
import type { AppointmentStatus } from "./StatusBadge";

export type AgendaCardProps = {
  actions: QuickActions;
  appointmentId: string;
  busy: boolean;
  customerName: string;
  onComplete: () => void;
  onConfirm: () => void;
  onNoShow: () => void;
  onOpen: () => void;
  status: AppointmentStatus;
  subtitle?: string;
  testPrefix: "barber" | "owner";
  timeLabel: string;
};

// Only what the day needs at a glance; tapping the top part opens the details pop-up.
export function AgendaCard({ actions, appointmentId, busy, customerName, onComplete, onConfirm, onNoShow, onOpen, status, subtitle, testPrefix, timeLabel }: AgendaCardProps) {
  const { t } = useTranslation();
  const hasActions = actions.confirm || actions.complete || actions.noShow;

  return (
    <Card testID={`${testPrefix}-appointment-${appointmentId}`}>
      <View className="gap-3">
        <Pressable accessibilityRole="button" className="gap-1" onPress={onOpen} testID={`${testPrefix}-appointment-card-${appointmentId}`}>
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-display-semibold text-ink" style={{ fontVariant: ["tabular-nums"] }}>{timeLabel}</Text>
            <StatusBadge status={status} />
          </View>
          <Text className="text-base font-sans-medium text-ink">{customerName}</Text>
          {subtitle ? <Text className="text-sm font-sans text-neutral-600">{subtitle}</Text> : null}
        </Pressable>
        {hasActions ? (
          <View className="flex-row flex-wrap gap-2">
            {actions.confirm ? <Button disabled={busy} label={t("barber.agenda.confirm")} onPress={onConfirm} size="sm" testID={`${testPrefix}-confirm-${appointmentId}`} /> : null}
            {actions.complete ? <Button disabled={busy} label={t("barber.agenda.complete")} onPress={onComplete} size="sm" testID={`${testPrefix}-complete-${appointmentId}`} /> : null}
            {actions.noShow ? <Button disabled={busy} label={t("barber.agenda.noShow")} onPress={onNoShow} size="sm" testID={`${testPrefix}-noshow-${appointmentId}`} variant="outline" /> : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
}
```

- [ ] **Step 3: `AppointmentSheet`** `src/components/domain/AppointmentSheet.tsx`

```tsx
import { ChevronRight, MessageCircle, Phone, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, Text, View } from "react-native";

import { isOpenStatus } from "../../features/appointments/agenda-actions";
import { telUrl, whatsappUrl } from "../../features/clients/format";
import { colors } from "../../lib/design/colors";
import { Button } from "../ui/Button";
import { ContactLink } from "./ContactLink";
import { formatPriceBRL } from "./ServiceCard";
import { StatusBadge } from "./StatusBadge";
import type { AppointmentStatus } from "./StatusBadge";

export type SheetAppointment = {
  barberName?: string;
  customerName: string;
  customerPhone: string | null;
  dateLabel: string;
  id: string;
  notes: string | null;
  priceCents: number;
  serviceName: string;
  status: AppointmentStatus;
  timeLabel: string;
};

export type AppointmentSheetProps = {
  appointment: SheetAppointment | null;
  busy: boolean;
  onCancel: () => void;
  onClose: () => void;
  onMove?: () => void;
  onOpenCustomer: () => void;
  remindUrl?: string | null;
  testPrefix: "barber" | "owner";
};

export function AppointmentSheet({ appointment, busy, onCancel, onClose, onMove, onOpenCustomer, remindUrl, testPrefix }: AppointmentSheetProps) {
  const { t } = useTranslation();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  // A second tap is needed to cancel; opening another appointment starts over.
  useEffect(() => setConfirmingCancel(false), [appointment?.id]);

  if (!appointment) return null;
  const id = appointment.id;
  const open = isOpenStatus(appointment.status);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <Pressable className="flex-1 items-center justify-center bg-black/40 p-5" onPress={onClose} testID={`${testPrefix}-sheet-backdrop`}>
        <Pressable className="w-full max-w-[420px] gap-3 rounded-2xl bg-surface p-5" onPress={() => undefined} testID={`${testPrefix}-sheet`}>
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1 gap-1">
              <Text className="text-xl font-display-semibold text-ink" style={{ fontVariant: ["tabular-nums"] }}>{appointment.dateLabel} · {appointment.timeLabel}</Text>
              <StatusBadge status={appointment.status} />
            </View>
            <Pressable accessibilityLabel={t("agendaCard.close")} accessibilityRole="button" className="h-11 w-11 items-center justify-center" hitSlop={8} onPress={onClose} testID={`${testPrefix}-sheet-close`}>
              <X color={colors.ink} size={22} />
            </Pressable>
          </View>

          <Pressable accessibilityRole="button" className="min-h-[44px] flex-row items-center justify-between rounded-xl border border-neutral-200 px-4" onPress={onOpenCustomer} testID={`${testPrefix}-appointment-customer-${id}`}>
            <View>
              <Text className="text-xs font-sans text-neutral-500">{t("agendaCard.customer")}</Text>
              <Text className="text-base font-sans-semibold text-ink">{appointment.customerName}</Text>
            </View>
            <ChevronRight color={colors.neutral[500]} size={20} />
          </Pressable>

          <View className="gap-1">
            <Text className="text-base font-sans-medium text-ink">{appointment.serviceName} · {formatPriceBRL(appointment.priceCents)}</Text>
            {appointment.barberName ? <Text className="text-sm font-sans text-neutral-600">{t("agendaCard.barber")}: {appointment.barberName}</Text> : null}
            {appointment.notes ? <Text className="text-sm font-sans text-neutral-600">{t("agendaCard.notes")}: {appointment.notes}</Text> : null}
          </View>

          <View className="flex-row gap-3">
            <ContactLink icon={MessageCircle} testID={`${testPrefix}-appt-whatsapp-${id}`} url={whatsappUrl(appointment.customerPhone)}>{t("barber.clients.whatsapp")}</ContactLink>
            <ContactLink icon={Phone} testID={`${testPrefix}-appt-call-${id}`} url={telUrl(appointment.customerPhone)}>{t("barber.clients.call")}</ContactLink>
          </View>
          {remindUrl ? (
            <View className="flex-row">
              <ContactLink icon={MessageCircle} testID={`${testPrefix}-remind-${id}`} url={remindUrl}>{t("barber.agenda.remind")}</ContactLink>
            </View>
          ) : null}

          {open && onMove ? <Button disabled={busy} label={t("barber.agenda.moveAppointment")} onPress={onMove} testID={`${testPrefix}-move-${id}`} variant="outline" /> : null}
          {open ? (
            <Button
              disabled={busy}
              label={confirmingCancel ? t("barber.agenda.cancelConfirm") : t("barber.agenda.cancelAppointment")}
              onPress={() => (confirmingCancel ? onCancel() : setConfirmingCancel(true))}
              testID={`${testPrefix}-cancel-${id}`}
              variant="danger"
            />
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
```
Export both from `src/components/domain/index.ts` (`export { AgendaCard } from "./AgendaCard"; export { AppointmentSheet } from "./AppointmentSheet";`).

- [ ] **Step 4:** `npm run typecheck && npm run lint` → clean. **Step 5: Commit** — `git add -A && git commit -m "feat: AgendaCard and AppointmentSheet components"`

---

### Task 4: Barber agenda uses the compact card and the pop-up

**Files:**
- Modify: `app/(barber)/my-agenda.tsx` (function `renderAppointment`, state `confirmCancelId`, the `cancel` mutation, the render tree), `tests/e2e/barber-side.web.spec.ts`, `tests/e2e/barber-booking.web.spec.ts`
- Create: `tests/e2e/agenda-helpers.ts`

- [ ] **Step 1: Failing e2e** — create `tests/e2e/agenda-helpers.ts`:

```ts
import type { Page } from "@playwright/test";

// The agenda card keeps only the essentials; the rest is in the pop-up that opens when the card is tapped.
export const openBarberCard = (page: Page, id = "appt-1") => page.getByTestId(`barber-appointment-card-${id}`).click();
export const openOwnerCard = (page: Page, id = "appt-1") => page.getByTestId(`owner-appointment-card-${id}`).click();
```
Update the specs (each edit: add the import `import { openBarberCard } from "./agenda-helpers";` and open the pop-up before touching moved controls):
- `barber-booking.web.spec.ts` lines ~160-162 (cancel, two taps) → `await openBarberCard(page);` before the first `barber-cancel-appt-1` click; lines ~188, 223, 243 (`barber-move-appt-1`) → `await openBarberCard(page);` before each; lines ~270 (`barber-remind-appt-1`) → open the card first; line ~284-285 ("no reminder button without a phone"): keep the `barber-confirm-appt-1` visibility assertion (it is on the card), then `await openBarberCard(page); await expect(page.getByTestId("barber-remind-appt-1")).toHaveCount(0);`.
- `barber-side.web.spec.ts`: complete/confirm/no-show stay on the card (no change); the test "an agenda card opens the client and offers WhatsApp and phone links" becomes: open the card, assert `barber-appt-whatsapp-appt-1` / `barber-appt-call-appt-1` hrefs inside the pop-up, click `barber-appointment-customer-appt-1`, expect URL `/clients/44444444-4444-4444-8444-444444444444`.
Add a new test to `barber-side.web.spec.ts`:

```ts
test("the agenda card shows only time, customer, status and quick buttons; details are in the pop-up", async ({ page }) => {
  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/list_my_barber_agenda")) return json(route, [agendaRow({ customer_phone: "11988887777" })]).then(() => true);
  });

  await page.goto("/my-agenda");
  const card = page.getByTestId("barber-appointment-appt-1");
  await expect(card).toContainText("Ana Customer");
  await expect(card).toContainText("Scheduled");
  await expect(page.getByTestId("barber-confirm-appt-1")).toBeVisible();
  await expect(page.getByTestId("barber-complete-appt-1")).toBeVisible();
  await expect(page.getByTestId("barber-noshow-appt-1")).toBeVisible();
  // Not on the card any more:
  for (const id of ["barber-move-appt-1", "barber-cancel-appt-1", "barber-appt-whatsapp-appt-1", "barber-remind-appt-1"]) {
    await expect(page.getByTestId(id)).toHaveCount(0);
  }
  await expect(card).not.toContainText("R$");

  await openBarberCard(page);
  await expect(page.getByTestId("barber-sheet")).toContainText("Browser Cut");
  await expect(page.getByTestId("barber-move-appt-1")).toBeVisible();
  await page.getByTestId("barber-sheet-close").click();
  await expect(page.getByTestId("barber-sheet")).toHaveCount(0);
});
```
Run (Expo restarted): `npx playwright test tests/e2e/barber-side.web.spec.ts tests/e2e/barber-booking.web.spec.ts` → FAIL (old card still renders everything).

- [ ] **Step 2: Rewrite `renderAppointment`** in `app/(barber)/my-agenda.tsx`:

```tsx
  const renderAppointment = (appointment: BarberAgendaAppointment, withDate = false) => {
    const startsAt = formatInstantInShopTime(new Date(appointment.startsAt));
    const actions = quickActions({ canConfirm: true, endsAt: appointment.endsAt, now: new Date(), status: appointment.status });

    return (
      <AgendaCard
        actions={actions}
        appointmentId={appointment.id}
        busy={busy}
        customerName={appointment.customerName}
        key={appointment.id}
        onComplete={() => setStatus.mutate({ id: appointment.id, status: "completed" })}
        onConfirm={() => setStatus.mutate({ id: appointment.id, status: "confirmed" })}
        onNoShow={() => setStatus.mutate({ id: appointment.id, status: "no_show" })}
        onOpen={() => setOpenId(appointment.id)}
        status={appointment.status}
        testPrefix="barber"
        timeLabel={`${withDate ? `${formatDateNumeric(startsAt.localDate, language)} ` : ""}${startsAt.localTime}`}
      />
    );
  };
```
Add state and the pop-up data near the other state/`useMemo`s:

```tsx
  const [openId, setOpenId] = useState<string | null>(null);
  const openAppointment = [...pending, ...dayAppointments].find((appointment) => appointment.id === openId) ?? null;
  const openStart = openAppointment ? formatInstantInShopTime(new Date(openAppointment.startsAt)) : null;
  const openRemindUrl = openAppointment && openStart && new Date(openAppointment.startsAt) > new Date()
    ? whatsappUrl(openAppointment.customerPhone, t("barber.agenda.remindMessage", { date: openStart.localDate, name: openAppointment.customerName, service: openAppointment.serviceNameSnapshot, time: openStart.localTime }))
    : null;
```
Remove `const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);`, change the `cancel` mutation to:

```tsx
  const cancel = useMutation({
    mutationFn: (id: string) => cancelAppointment(supabase, id),
    onError: (error) => fail(error, t("barber.agenda.updateError")),
    onSuccess: () => {
      setOpenId(null);
      setFeedback({ message: t("barber.agenda.appointmentCancelled"), variant: "success" });
      refreshAgenda();
    },
  });
```
Render the pop-up once, next to `<BarberBookingSheet .../>`:

```tsx
          <AppointmentSheet
            appointment={openAppointment && openStart ? {
              customerName: openAppointment.customerName,
              customerPhone: openAppointment.customerPhone,
              dateLabel: formatDateNumeric(openStart.localDate, language),
              id: openAppointment.id,
              notes: openAppointment.notes ?? null,
              priceCents: openAppointment.servicePriceCentsSnapshot,
              serviceName: openAppointment.serviceNameSnapshot,
              status: openAppointment.status,
              timeLabel: openStart.localTime,
            } : null}
            busy={busy}
            onCancel={() => cancel.mutate(openAppointment?.id ?? "")}
            onClose={() => setOpenId(null)}
            onMove={() => {
              if (!openAppointment) return;
              setOpenId(null);
              router.push({
                params: { appointmentId: openAppointment.id, barberId: openAppointment.barberId, barberServiceId: openAppointment.barberServiceId, customerName: openAppointment.customerName, serviceName: openAppointment.serviceNameSnapshot, startsAt: openAppointment.startsAt },
                pathname: "/move-appointment",
              });
            }}
            onOpenCustomer={() => {
              const customerId = openAppointment?.customerId;
              setOpenId(null);
              if (customerId) router.push(`/clients/${customerId}` as never);
            }}
            remindUrl={openRemindUrl}
            testPrefix="barber"
          />
```
Imports: `AgendaCard`, `AppointmentSheet` from `../../src/components/domain/...`, `quickActions` from `../../src/features/appointments/agenda-actions`; remove imports that become unused (`ContactLink`, `StatusBadge`, `Card`, `MessageCircle`, `Phone`, `Linking`, `Pressable`, `telUrl`, `formatPriceBRL` — let `npm run lint` list them). Keep `whatsappUrl`.

- [ ] **Step 3: Run:** `npm run typecheck && npm run lint`, restart Expo, `npx playwright test tests/e2e/barber-side.web.spec.ts tests/e2e/barber-booking.web.spec.ts tests/e2e/barber-availability.web.spec.ts` → PASS (except the known time-of-day reminder specs between 23:45–00:00).

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: compact barber agenda card with details pop-up"`

---

### Task 5: Owner agenda uses the compact card and the pop-up

**Files:**
- Modify: `app/(owner)/agenda.tsx` (the `appointments.map(...)` block), `tests/e2e/owner-agenda.web.spec.ts`

- [ ] **Step 1: Failing e2e** — in `tests/e2e/owner-agenda.web.spec.ts` import `openOwnerCard` and update:
  - "the owner agenda lists appointments...": the card keeps `Ana Customer`, `Bruno Barber` (subtitle), `Scheduled`; add `await expect(page.getByTestId("owner-appointment-appt-1")).not.toContainText("Cut")` is NOT valid (the mocked service name is `Browser Cut`): assert instead `not.toContainText("R$")`.
  - "the owner completes and cancels": complete stays on the card; for cancel: `await openOwnerCard(page); await page.getByTestId("owner-cancel-appt-1").click();` then the second tap `await page.getByTestId("owner-cancel-appt-1").click();` and `expect.poll(() => state.calls.cancel).toEqual({ appointment_id: "appt-1" })`.
  - New test:

```ts
test("the owner pop-up has the customer's WhatsApp and phone and opens the customer", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, { calls: {}, rows: [agendaRow({ customer_phone: "11988887777" })] });

  await page.goto("/agenda");
  await openOwnerCard(page);
  await expect(page.getByTestId("owner-appt-whatsapp-appt-1")).toHaveAttribute("href", "https://wa.me/5511988887777");
  await expect(page.getByTestId("owner-appt-call-appt-1")).toHaveAttribute("href", "tel:+5511988887777");
  await page.getByTestId("owner-appointment-customer-appt-1").click();
  await expect(page).toHaveURL(/\/customer-form\?id=/);
});
```
Run → FAIL.

- [ ] **Step 2: Replace the card block** in `app/(owner)/agenda.tsx`:

```tsx
            {appointments.map((appointment) => {
              const startsAt = formatInstantInShopTime(new Date(appointment.startsAt));

              return (
                <AgendaCard
                  actions={quickActions({ canConfirm: false, endsAt: appointment.endsAt, now: new Date(), status: appointment.status })}
                  appointmentId={appointment.id}
                  busy={busy}
                  customerName={appointment.customerName}
                  key={appointment.id}
                  onComplete={() => update.mutate({ id: appointment.id, status: "completed" })}
                  onConfirm={() => undefined}
                  onNoShow={() => update.mutate({ id: appointment.id, status: "no_show" })}
                  onOpen={() => setOpenId(appointment.id)}
                  status={appointment.status}
                  subtitle={appointment.barberName}
                  testPrefix="owner"
                  timeLabel={`${formatDateNumeric(startsAt.localDate, language)} ${startsAt.localTime}`}
                />
              );
            })}
```
Add state, the pop-up data and the pop-up (after the `overrides.map(...)` block, inside the same container):

```tsx
  const [openId, setOpenId] = useState<string | null>(null);
  const openAppointment = appointments.find((appointment) => appointment.id === openId) ?? null;
  const openStart = openAppointment ? formatInstantInShopTime(new Date(openAppointment.startsAt)) : null;
  // ...
            <AppointmentSheet
              appointment={openAppointment && openStart ? {
                barberName: openAppointment.barberName,
                customerName: openAppointment.customerName,
                customerPhone: openAppointment.customerPhone,
                dateLabel: formatDateNumeric(openStart.localDate, language),
                id: openAppointment.id,
                notes: openAppointment.notes ?? null,
                priceCents: openAppointment.servicePriceCentsSnapshot,
                serviceName: openAppointment.serviceNameSnapshot,
                status: openAppointment.status,
                timeLabel: openStart.localTime,
              } : null}
              busy={busy}
              onCancel={() => update.mutate({ id: openAppointment?.id ?? "", status: "cancelled" })}
              onClose={() => setOpenId(null)}
              onOpenCustomer={() => {
                const customerId = openAppointment?.customerId;
                setOpenId(null);
                if (customerId) router.push({ params: { id: customerId }, pathname: "/customer-form" });
              }}
              testPrefix="owner"
            />
```
Declare `openId`/`openAppointment` after `const appointments = ...` (the existing line `const appointments = agenda.data?.appointments ?? [];`). In the `update` mutation's `onSuccess` add `setOpenId(null);` before the invalidate. Update imports (`AgendaCard`, `AppointmentSheet`, `quickActions`; drop `Card`, `StatusBadge`, `Button` only if unused — the page still uses `Button` for the view buttons and `Card` for overrides).

- [ ] **Step 3:** `npm run typecheck && npm run lint`; restart Expo; `npx playwright test tests/e2e/owner-agenda.web.spec.ts tests/e2e/owner-shell.web.spec.ts` → PASS.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: compact owner agenda card with details pop-up"`

---

### Task 6: Client history becomes a scroll area

**Files:**
- Modify: `app/(barber)/clients/[id].tsx` (history card), `tests/e2e/barber-clients.web.spec.ts`

- [ ] **Step 1: Failing e2e** — in `barber-clients.web.spec.ts` add a test that mocks `get_my_customer` with 20 history rows and asserts the history is a bounded scroll area:

```ts
test("the recent history is a fixed-height scroll area, not a long list", async ({ page }) => {
  const history = Array.from({ length: 20 }, (_, index) => ({ id: `a${index}`, service_name: `Cut ${index}`, starts_at: `2026-09-${String(10 + (index % 18)).padStart(2, "0")}T15:00:00Z`, status: "completed" }));

  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/get_my_customer")) {
      return json(route, {
        customer: { email: null, full_name: "Ana Souza", has_account: false, id: "c1", phone: "11988887777" },
        history, note: null,
        stats: { cancelled: 0, favorite_service: "Cut 0", last_visit_at: null, next_visit_at: null, no_show: 0, visits: 20 },
      }).then(() => true);
    }
  });

  await page.goto("/clients/c1");
  const scroll = page.getByTestId("client-history-scroll");
  await expect(scroll).toBeVisible();
  const { client, content } = await scroll.evaluate((element) => ({ client: element.clientHeight, content: element.scrollHeight }));

  expect(client).toBeLessThanOrEqual(260);
  expect(content).toBeGreaterThan(client);
});
```
(`signIn`, `mockBarberRest`, `json`, `barberUserId` already exist in that spec; use the same ones.) Run → FAIL (no such test id).

- [ ] **Step 2: Implement** — in `app/(barber)/clients/[id].tsx` import `ScrollView` from `react-native` and replace the history card body:

```tsx
                <Card variant="outlined" testID="client-history">
                  <View className="gap-3">
                    <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("barber.clients.history")}</Text>
                    {data.history.length === 0 ? <Text className="text-sm font-sans text-neutral-600">{t("barber.clients.historyEmpty")}</Text> : null}
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 260 }} testID="client-history-scroll">
                      <View className="gap-3">
                        {data.history.map((item) => (
                          <View className="flex-row items-center justify-between gap-2" key={item.id}>
                            <View className="flex-1">
                              <Text className="text-sm font-sans-medium text-ink">{item.serviceName}</Text>
                              <Text className="text-xs font-sans text-neutral-500">{date(item.startsAt)}</Text>
                            </View>
                            <StatusBadge status={item.status} />
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                </Card>
```
(keep whatever the existing markup inside each row is — only the wrapper changes).

- [ ] **Step 3:** typecheck/lint, restart Expo, `npx playwright test tests/e2e/barber-clients.web.spec.ts` → PASS. Screenshot the client screen at 375px: the history card is about 260px tall and scrolls inside.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: client history scrolls inside a fixed-height card"`

---

### Task 7: Review and PR
- [ ] `npm run typecheck && npm run lint && npx jest`, `npm run test:db` (only the known `010`/`012` dev-data failures), full web e2e; restore `.env.local`; push `feat-agenda-cards`; PR via `gh api` REST (base: `feat-field-examples`). Deploy note: apply migration `0052` to hosted Supabase (user's step). On a phone: open the agenda, tap a card, use WhatsApp/Ligar/Cancelar (two taps), tap the customer name.
