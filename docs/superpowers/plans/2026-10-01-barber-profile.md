# Barber Profile Hub and Service Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The barber's Profile tab becomes a hub like the customer's, with My details (photo, bio, email), My services (turn optional services on/off; standard ones locked), and read-only Compensation; the owner can mark a service as standard for all barbers.

**Architecture:** One migration adds `services.is_standard`, fan-out triggers, and two barber RPCs. The barber profile becomes a Stack under `app/(barber)/my-profile/`, re-exporting customer screens that have no hard-coded paths.

**Tech Stack:** Supabase/Postgres + pgTAP, Expo Router, NativeWind, TanStack Query, i18next (en/es/pt), Jest + Testing Library, Playwright (REST mocked).

**Spec:** `docs/superpowers/specs/2026-10-01-barber-profile-design.md`

## Global Constraints

- Work in worktree `/home/samuel/projects/barberschedule/.claude/worktrees/barber-profile` (branch `feat-barber-profile`, stacked on `feat-barber-booking`, PR #20). `node_modules` is symlinked from the main checkout. Local Supabase only.
- Migration number `0035`; pgTAP file `020`; new error code `P0026` = `SERVICE_STANDARD_LOCKED` (`P0004` is reused for an unavailable service, `P0019` for a non-linked barber).
- Duration and price are never editable by the barber. Standard services cannot be turned off by the barber.
- Every user string exists in `en`, `es` and `pt` (locale-parity test). `className` only on plain RN elements; verify UI in a real browser (screenshots + computed CSS).
- Routes: barber profile lives under `app/(barber)/my-profile/*`; `/me/*` is the customer's (route-collision test).
- Use `rtk` for raw-read commands. Strict TDD. Local test barber: `barber@teste.com` / `barber1234`.
- Test UUID prefix for new pgTAP data: `ab` (e.g. `ab000000-0000-0000-0000-000000000001`).

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/0035_standard_services.sql` | `is_standard`, triggers, `list_my_service_options`, `set_my_service_enabled` |
| `supabase/tests/020_standard_services.sql` | pgTAP |
| `src/lib/errors/domain-errors.ts`, `src/i18n/locales/*.ts` | `SERVICE_STANDARD_LOCKED`, all new strings |
| `src/features/barbers/{types,api}.ts` | `MyServiceOption`, `listMyServiceOptions`, `setMyServiceEnabled` |
| `src/features/services/{types,api}.ts` | `Service.isStandard`, `setServiceStandard` |
| `app/(owner)/services.tsx` | standard toggle per service |
| `app/(barber)/my-profile/*` | hub + sub-screens (replaces `app/(barber)/my-profile.tsx`) |
| `tests/integration/barber-services.test.ts`, `tests/e2e/barber-profile.web.spec.ts` | Jest / Playwright |

---

### Task 1: Standard services in the database

**Files:**
- Create: `supabase/migrations/0035_standard_services.sql`
- Create: `supabase/tests/020_standard_services.sql`

**Interfaces:**
- Produces: `services.is_standard boolean not null default false`; `public.list_my_service_options() returns table (service_id uuid, service_name text, description text, duration_minutes integer, price_cents integer, is_standard boolean, enabled boolean)`; `public.set_my_service_enabled(target_service_id uuid, new_enabled boolean) returns table (service_id uuid, enabled boolean)`; errors `P0019`, `P0004`, `P0026`.

- [ ] **Step 1: Write the failing pgTAP test** — `supabase/tests/020_standard_services.sql`

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'ab000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't20-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'ab000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't20-barber-a@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'ab000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't20-barber-b@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'ab000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't20-customer@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id = 'ab000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id in ('ab000000-0000-0000-0000-000000000002', 'ab000000-0000-0000-0000-000000000003');

insert into public.shops (id, name, owner_user_id)
values ('ab100000-0000-0000-0000-000000000001', 'T20 Shop', 'ab000000-0000-0000-0000-000000000001');

insert into public.barbers (id, shop_id, user_id, name)
values
  ('ab200000-0000-0000-0000-000000000001', 'ab100000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000002', 'Barber A'),
  ('ab200000-0000-0000-0000-000000000002', 'ab100000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000003', 'Barber B');

insert into public.services (id, shop_id, name, duration_minutes, price_cents, active, archived_at)
values
  ('ab300000-0000-0000-0000-000000000001', 'ab100000-0000-0000-0000-000000000001', 'Cut', 30, 4000, true, null),
  ('ab300000-0000-0000-0000-000000000002', 'ab100000-0000-0000-0000-000000000001', 'Beard', 20, 2500, true, null),
  ('ab300000-0000-0000-0000-000000000003', 'ab100000-0000-0000-0000-000000000001', 'Retired', 15, 1000, false, now());

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*)::int from public.list_my_service_options()), 2, 'a barber lists the active services of the shop, not archived ones');
select is((select count(*)::int from public.list_my_service_options() where enabled), 0, 'nothing is enabled before the owner marks a standard service');

-- the owner marks Cut as standard
select set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-000000000001', true);
update public.services set is_standard = true where id = 'ab300000-0000-0000-0000-000000000001';

reset role;
select is(
  (select count(*)::int from public.barber_services where service_id = 'ab300000-0000-0000-0000-000000000001' and active),
  2, 'marking a service standard activates it for every active barber'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-000000000002', true);
select is(
  (select enabled and is_standard from public.list_my_service_options() where service_name = 'Cut'),
  true, 'the standard service shows as enabled and standard'
);

select is((select enabled from public.set_my_service_enabled('ab300000-0000-0000-0000-000000000002', true)), true, 'a barber turns an optional service on');
select throws_ok(
  $$ select * from public.set_my_service_enabled('ab300000-0000-0000-0000-000000000001', false) $$,
  'P0026', null, 'a barber cannot turn a standard service off'
);
select is((select enabled from public.set_my_service_enabled('ab300000-0000-0000-0000-000000000002', false)), false, 'a barber turns an optional service off');
select throws_ok(
  $$ select * from public.set_my_service_enabled('ab300000-0000-0000-0000-000000000003', true) $$,
  'P0004', null, 'an archived service cannot be enabled'
);

reset role;
select is(
  (select count(*)::int from public.barber_services where service_id = 'ab300000-0000-0000-0000-000000000002' and barber_id = 'ab200000-0000-0000-0000-000000000002'),
  0, 'a barber''s choice never touches another barber''s rows'
);

-- a new barber inherits the standard services
insert into public.barbers (id, shop_id, name)
values ('ab200000-0000-0000-0000-000000000003', 'ab100000-0000-0000-0000-000000000001', 'Barber C');
select is(
  (select count(*)::int from public.barber_services where barber_id = 'ab200000-0000-0000-0000-000000000003' and service_id = 'ab300000-0000-0000-0000-000000000001' and active),
  1, 'a new barber inherits the standard services'
);

-- re-marking reactivates a row the owner had archived
update public.barber_services set active = false, archived_at = now()
where barber_id = 'ab200000-0000-0000-0000-000000000002' and service_id = 'ab300000-0000-0000-0000-000000000001';
update public.services set is_standard = false where id = 'ab300000-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from public.barber_services where service_id = 'ab300000-0000-0000-0000-000000000001' and active),
  2, 'unmarking standard leaves existing rows as they are'
);
update public.services set is_standard = true where id = 'ab300000-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from public.barber_services where service_id = 'ab300000-0000-0000-0000-000000000001' and active),
  3, 'marking standard again reactivates archived rows'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-000000000004', true);
select throws_ok($$ select * from public.list_my_service_options() $$, 'P0019', null, 'a customer cannot list barber service options');

select * from finish();
rollback;
```

- [ ] **Step 2: Run to fail** — `rtk npx supabase test db supabase/tests/020_standard_services.sql` → FAIL (column / functions missing).

- [ ] **Step 3: Write the migration** — `supabase/migrations/0035_standard_services.sql`

```sql
alter table public.services add column is_standard boolean not null default false;

create function public.fan_out_standard_service()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.is_standard and new.active then
    insert into public.barber_services (shop_id, barber_id, service_id, active, archived_at)
    select new.shop_id, b.id, new.id, true, null
    from public.barbers b
    where b.shop_id = new.shop_id and b.active
    on conflict (shop_id, barber_id, service_id)
    do update set active = true, archived_at = null, updated_at = clock_timestamp();
  end if;

  return null;
end;
$$;

create trigger services_fan_out_standard
after insert or update of is_standard, active on public.services
for each row execute function public.fan_out_standard_service();

create function public.inherit_standard_services()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.active then
    insert into public.barber_services (shop_id, barber_id, service_id, active, archived_at)
    select new.shop_id, new.id, s.id, true, null
    from public.services s
    where s.shop_id = new.shop_id and s.active and s.is_standard
    on conflict (shop_id, barber_id, service_id)
    do update set active = true, archived_at = null, updated_at = clock_timestamp();
  end if;

  return null;
end;
$$;

create trigger barbers_inherit_standard
after insert or update of active on public.barbers
for each row execute function public.inherit_standard_services();

create function public.list_my_service_options()
returns table (
  service_id uuid,
  service_name text,
  description text,
  duration_minutes integer,
  price_cents integer,
  is_standard boolean,
  enabled boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  me public.barbers%rowtype;
begin
  select * into me from public.barbers where user_id = auth.uid() and active;
  if not found then
    raise exception using errcode = 'P0019', message = 'BARBER_NOT_LINKED';
  end if;

  return query
  select
    s.id,
    s.name,
    s.description,
    coalesce(bs.duration_override_minutes, s.duration_minutes),
    coalesce(bs.price_override_cents, s.price_cents),
    s.is_standard,
    (s.is_standard or coalesce(bs.active, false))
  from public.services s
  left join public.barber_services bs
    on bs.service_id = s.id and bs.shop_id = s.shop_id and bs.barber_id = me.id
  where s.shop_id = me.shop_id and s.active
  order by s.is_standard desc, s.name;
end;
$$;

create function public.set_my_service_enabled(target_service_id uuid, new_enabled boolean)
returns table (service_id uuid, enabled boolean)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  me public.barbers%rowtype;
  target public.services%rowtype;
begin
  select * into me from public.barbers where user_id = auth.uid() and active;
  if not found then
    raise exception using errcode = 'P0019', message = 'BARBER_NOT_LINKED';
  end if;

  select * into target from public.services where id = target_service_id and shop_id = me.shop_id and active;
  if not found then
    raise exception using errcode = 'P0004', message = 'SERVICE_UNAVAILABLE';
  end if;
  if target.is_standard then
    raise exception using errcode = 'P0026', message = 'SERVICE_STANDARD_LOCKED';
  end if;

  insert into public.barber_services (shop_id, barber_id, service_id, active, archived_at)
  values (me.shop_id, me.id, target.id, new_enabled, case when new_enabled then null else now() end)
  on conflict on constraint barber_services_unique
  do update set
    active = new_enabled,
    archived_at = case when new_enabled then null else coalesce(public.barber_services.archived_at, now()) end,
    updated_at = clock_timestamp();

  return query select target.id, new_enabled;
end;
$$;

revoke all on function public.list_my_service_options() from public, anon;
revoke all on function public.set_my_service_enabled(uuid, boolean) from public, anon;
grant execute on function public.list_my_service_options() to authenticated;
grant execute on function public.set_my_service_enabled(uuid, boolean) to authenticated;
```
Note: inside plpgsql functions with `returns table (service_id …)`, qualify `bs.service_id` / `public.barber_services.archived_at` as shown to avoid output-parameter ambiguity.

- [ ] **Step 4: Apply and run**

```bash
rtk npx supabase migration up && rtk npx supabase test db supabase/tests/020_standard_services.sql
```
Expected: 13 tests pass. Then regression: `rtk npx supabase test db supabase/tests/002_catalog_and_customers.sql supabase/tests/013_barber_role.sql supabase/tests/017_barber_booking.sql supabase/tests/018_barber_customer_rpcs.sql` → pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0035_standard_services.sql supabase/tests/020_standard_services.sql
git commit -m "feat(db): standard services and barber service selection

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Front data layer

**Files:**
- Modify: `src/lib/errors/domain-errors.ts`, `src/i18n/locales/{en,es,pt}.ts` (errors.codes)
- Modify: `src/features/barbers/types.ts`, `src/features/barbers/api.ts`
- Modify: `src/features/services/types.ts`, `src/features/services/api.ts`
- Test: `tests/integration/barber-services.test.ts` (+ fixture fixes where `Service`/`ServiceRow` literals now need `isStandard` / `is_standard`)

**Interfaces:**
- Produces:
```ts
export type MyServiceOption = { description: string | null; durationMinutes: number; enabled: boolean; isStandard: boolean; priceCents: number; serviceId: string; serviceName: string };
export function listMyServiceOptions(supabase: Pick<SupabaseClient, "rpc">): Promise<MyServiceOption[]>;
export function setMyServiceEnabled(supabase: Pick<SupabaseClient, "rpc">, serviceId: string, enabled: boolean): Promise<void>;
export function setServiceStandard(supabase, serviceId: string, isStandard: boolean): Promise<Service>;
```
`DomainErrorCode` gains `"SERVICE_STANDARD_LOCKED"`; `Service` gains `isStandard: boolean`.

- [ ] **Step 1: Write the failing test** — `tests/integration/barber-services.test.ts`

```ts
import { listMyServiceOptions, setMyServiceEnabled } from "../../src/features/barbers/api";
import { setServiceStandard } from "../../src/features/services/api";
import { toDomainError } from "../../src/lib/errors/domain-errors";

const optionRow = {
  description: null, duration_minutes: 30, enabled: true, is_standard: true,
  price_cents: 4000, service_id: "s1", service_name: "Cut",
};

describe("barber service options", () => {
  it("maps the options returned by the database", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [optionRow], error: null });

    await expect(listMyServiceOptions({ rpc } as never)).resolves.toEqual([
      { description: null, durationMinutes: 30, enabled: true, isStandard: true, priceCents: 4000, serviceId: "s1", serviceName: "Cut" },
    ]);
    expect(rpc).toHaveBeenCalledWith("list_my_service_options");
  });

  it("toggles an optional service through the barber RPC", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ enabled: true, service_id: "s2" }], error: null });

    await setMyServiceEnabled({ rpc } as never, "s2", true);
    expect(rpc).toHaveBeenCalledWith("set_my_service_enabled", { new_enabled: true, target_service_id: "s2" });
  });

  it("maps a locked standard service to SERVICE_STANDARD_LOCKED", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0026" } });

    await expect(setMyServiceEnabled({ rpc } as never, "s1", false)).rejects.toMatchObject({ code: "SERVICE_STANDARD_LOCKED" });
    expect(toDomainError({ code: "P0026" }).code).toBe("SERVICE_STANDARD_LOCKED");
  });
});

describe("owner standard flag", () => {
  it("updates only is_standard and returns the service", async () => {
    const row = {
      active: true, archived_at: null, description: null, duration_minutes: 30, id: "s1",
      is_standard: true, name: "Cut", price_cents: 4000, shop_id: "shop-1",
    };
    const maybeSingle = jest.fn().mockResolvedValue({ data: row, error: null });
    const eq = jest.fn().mockReturnValue({ select: () => ({ maybeSingle }) });
    const update = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ update });

    await expect(setServiceStandard({ from, rpc: jest.fn() } as never, "s1", true)).resolves.toMatchObject({ id: "s1", isStandard: true });
    expect(update).toHaveBeenCalledWith({ is_standard: true });
    expect(eq).toHaveBeenCalledWith("id", "s1");
  });
});
```

- [ ] **Step 2: Run to fail** — `rtk npx jest tests/integration/barber-services.test.ts` → FAIL (exports missing).

- [ ] **Step 3: Implement**

`domain-errors.ts`: add `| "SERVICE_STANDARD_LOCKED"` to the union and, before `default:` in `toDomainError`:
```ts
    case "P0026":
      return new DomainError("SERVICE_STANDARD_LOCKED", "This service is standard and cannot be turned off.");
```
`barbers/types.ts`: add the `MyServiceOption` type above.
`barbers/api.ts` (read `throwBarberError` first and reuse it so a generic failure keeps `BARBER_REQUEST_FAILED` while `P0026`/`P0004` map through `toDomainError`; if it does not delegate to `toDomainError`, call `throw toDomainError(error)` for these two functions):
```ts
export async function listMyServiceOptions(supabase: Pick<SupabaseClient, "rpc">): Promise<MyServiceOption[]> {
  const { data, error } = await supabase.rpc("list_my_service_options");
  if (error) throwBarberError(error);

  return (data ?? []).map((row: unknown) => {
    const r = row as {
      description: string | null; duration_minutes: number; enabled: boolean; is_standard: boolean;
      price_cents: number; service_id: string; service_name: string;
    };

    return {
      description: r.description, durationMinutes: r.duration_minutes, enabled: r.enabled, isStandard: r.is_standard,
      priceCents: r.price_cents, serviceId: r.service_id, serviceName: r.service_name,
    };
  });
}

export async function setMyServiceEnabled(supabase: Pick<SupabaseClient, "rpc">, serviceId: string, enabled: boolean) {
  const { error } = await supabase.rpc("set_my_service_enabled", { new_enabled: enabled, target_service_id: serviceId });
  if (error) throwBarberError(error);
}
```
`services/types.ts`: `Service` gets `isStandard: boolean;` and `ServiceRow` gets `is_standard: boolean;`.
`services/api.ts`: in `toService` add `isStandard: row.is_standard ?? false,`; append `is_standard` to `serviceColumns`; add
```ts
export async function setServiceStandard(supabase: ServiceSupabaseClient, serviceId: string, isStandard: boolean) {
  const { data, error } = await supabase
    .from("services")
    .update({ is_standard: isStandard })
    .eq("id", serviceId)
    .select(serviceColumns)
    .maybeSingle();
  throwIfError(error);

  if (!data) {
    throw new Error("Service standard update returned no row.");
  }

  return toService(data as ServiceRow);
}
```
i18n `errors.codes`: add `SERVICE_STANDARD_LOCKED` — en "This service is standard and cannot be turned off.", pt "Este serviço é padrão e não pode ser desligado.", es "Este servicio es estándar y no se puede desactivar."

- [ ] **Step 4: Run** — `rtk npx jest tests/integration/barber-services.test.ts tests/unit/locale-parity.test.ts && rtk npm run typecheck && npx eslint src tests`. Fix any typecheck failures from existing `Service`/`ServiceRow` literals by adding `isStandard: false` / `is_standard: false` to those fixtures.

- [ ] **Step 5: Commit** — `git add -A src tests && git commit -m "feat(barber): service option API, standard flag and error code ..."` (with the Co-Authored-By trailer).

---

### Task 3: Owner marks a service as standard

**Files:**
- Modify: `app/(owner)/services.tsx`, `src/i18n/locales/{en,es,pt}.ts` (`owner.services`)

**Interfaces:**
- Consumes: `setServiceStandard`, `Service.isStandard` (Task 2).

- [ ] **Step 1: Add strings** under `owner.services` in all 3 locales: `standardBadge` ("Standard" / "Padrão" / "Estándar"), `makeStandard` ("Make standard for all barbers" / "Tornar padrão para todos os barbeiros" / "Hacer estándar para todos los barberos"), `removeStandard` ("Remove standard" / "Remover padrão" / "Quitar estándar"). Run `rtk npx jest tests/unit/locale-parity.test.ts` → PASS.

- [ ] **Step 2: Implement** in `app/(owner)/services.tsx`: import `setServiceStandard`; add
```tsx
  const handleStandard = async (service: Service) => {
    setFeedback(null);
    setIsSaving(true);

    try {
      await setServiceStandard(supabase, service.id, !service.isStandard);
      await refresh();
    } catch (error) {
      setFeedback(errorMessage(error, t, t("owner.services.updateError")));
    } finally {
      setIsSaving(false);
    }
  };
```
In the card, append the badge to the summary line (`{service.isStandard ? ` · ${t("owner.services.standardBadge")}` : ""}`) and a third button after activate/deactivate:
```tsx
              <Button
                onPress={() => {
                  void handleStandard(service);
                }}
                title={service.isStandard ? t("owner.services.removeStandard") : t("owner.services.makeStandard")}
              />
```
(The screen keeps its existing style; this task does not retrofit it.)

- [ ] **Step 3: Verify** — `rtk npm run typecheck && npx eslint app src && rtk npx jest tests/unit`. Browser check is done in Task 8 together with the other screens.

- [ ] **Step 4: Commit** — `feat(owner): toggle a service as standard for all barbers`.

---

### Task 4: Profile hub shell

**Files:**
- Delete: `app/(barber)/my-profile.tsx`
- Create: `app/(barber)/my-profile/_layout.tsx`, `index.tsx`, `security.tsx`, `settings.tsx`, `security/password.tsx`, `language.tsx`, `about.tsx`
- Modify: `src/i18n/locales/{en,es,pt}.ts` (`barber.hub`), `tests/e2e/barber-side.web.spec.ts` (profile test)
- Test: `tests/e2e/barber-profile.web.spec.ts`

**Interfaces:**
- Produces hub paths used by later tasks: `/my-profile/account`, `/my-profile/services`, `/my-profile/compensation`, `/my-profile/security`, `/my-profile/settings`, `/my-profile/language`, `/my-profile/about`, `/my-profile/security/password`.
- Strings: `barber.hub.menu.{account,services,compensation}`, `barber.hub.role`.

- [ ] **Step 1: Write the failing e2e** — `tests/e2e/barber-profile.web.spec.ts`. Copy the `signIn`, `barberProfile` and `mockBarberRest` helpers from `tests/e2e/barber-booking.web.spec.ts` (same mocks: `get_current_profile`, `get_my_barber_profile`, `list_my_barber_services`, `list_my_barber_agenda`). Test:
```ts
test("the barber profile is a hub with barber and account sections", async ({ page }) => {
  await signIn(page, barberUserId);
  await mockBarberRest(page);

  await page.goto("/my-profile");
  await expect(page.getByRole("heading", { name: "Browser Barber" })).toBeVisible();
  for (const key of ["account", "security", "services", "compensation", "settings", "about"]) {
    await expect(page.getByTestId(`menu-${key}`)).toBeVisible();
  }
  await expect(page.getByTestId("menu-privacy")).toHaveCount(0);

  await page.getByTestId("menu-settings").click();
  await expect(page).toHaveURL(/\/my-profile\/settings/);
  await page.getByTestId("menu-language").click();
  await expect(page).toHaveURL(/\/my-profile\/language/);
});
```
Run: `rtk node scripts/run-e2e-web.mjs` (runs everything; expect the new test to FAIL, plus the 4 known date failures).

- [ ] **Step 2: Add `barber.hub` strings** (en/es/pt): `menu.account` ("My details"/"Meus dados"/"Mis datos"), `menu.services` ("My services"/"Meus serviços"/"Mis servicios"), `menu.compensation` ("Compensation"/"Remuneração"/"Remuneración"), `role` ("Barber"/"Barbeiro"/"Barbero"). Security/Settings/About reuse `profile.menu.*`.

- [ ] **Step 3: Implement the routes**

`my-profile/_layout.tsx`:
```tsx
import { Stack } from "expo-router";

export default function BarberProfileLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```
`my-profile/index.tsx` (hub; mirrors `app/(customer)/(tabs)/profile.tsx`):
```tsx
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Coins, Info, LogOut, Scissors, Settings, ShieldCheck, User } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Avatar } from "../../../src/components/domain/Avatar";
import { MenuBlock } from "../../../src/components/domain/MenuBlock";
import { Toast } from "../../../src/components/domain/Toast";
import { Screen } from "../../../src/components/ui/Screen";
import { useMyProfile } from "../../../src/features/account/use-my-profile";
import { signOut } from "../../../src/features/auth/api";
import { getMyBarberProfile } from "../../../src/features/barbers/api";
import { errorMessage } from "../../../src/i18n/errors";
import { colors } from "../../../src/lib/design/colors";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

export default function BarberProfileHub() {
  const router = useRouter();
  const { t } = useTranslation();
  const { profile: sessionProfile, session, supabase } = useSupabaseSession();
  const profile = useMyProfile();
  const barber = useQuery({ queryFn: () => getMyBarberProfile(supabase), queryKey: ["my-barber-profile", sessionProfile?.userId] });
  const name = profile.data?.nickname || barber.data?.name || profile.data?.fullName || "";
  const [error, setError] = useState<string | null>(null);

  return (
    <Screen edges={["top", "left", "right"]} className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-6">
            <View className="items-center gap-1 pt-4">
              <Avatar
                accessibilityLabel={t("barber.hub.menu.account")}
                name={name}
                onPress={() => router.push("/my-profile/account")}
                testID="profile-avatar"
                uri={profile.data?.avatarUrl ?? barber.data?.avatarUrl}
              />
              <Text accessibilityRole="header" className="pt-3 text-2xl font-display-bold text-ink">{name}</Text>
              <Text className="text-sm font-sans text-neutral-600">{session?.user.email}</Text>
              <Text className="text-xs font-sans-medium uppercase text-primary-600">{t("barber.hub.role")}</Text>
            </View>

            <MenuBlock
              items={[
                { icon: User, key: "account", label: t("barber.hub.menu.account"), onPress: () => router.push("/my-profile/account") },
                { icon: ShieldCheck, key: "security", label: t("profile.menu.security"), onPress: () => router.push("/my-profile/security") },
              ]}
            />
            <MenuBlock
              items={[
                { icon: Scissors, key: "services", label: t("barber.hub.menu.services"), onPress: () => router.push("/my-profile/services") },
                { icon: Coins, key: "compensation", label: t("barber.hub.menu.compensation"), onPress: () => router.push("/my-profile/compensation") },
              ]}
            />
            <MenuBlock
              items={[
                { icon: Settings, key: "settings", label: t("profile.menu.settings"), onPress: () => router.push("/my-profile/settings") },
                { icon: Info, key: "about", label: t("profile.menu.about"), onPress: () => router.push("/my-profile/about") },
              ]}
            />

            <Pressable
              accessibilityRole="button"
              className="min-h-[56px] flex-row items-center justify-center gap-2 rounded-[20px] border border-neutral-200 bg-surface"
              onPress={async () => {
                try {
                  await signOut(supabase);
                } catch (caught) {
                  setError(errorMessage(caught, t, t("profile.signOutError")));
                }
              }}
              testID="profile-signout"
            >
              <LogOut color={colors.danger[500]} size={20} />
              <Text className="text-base font-sans-semibold text-danger-500">{t("profile.signOut")}</Text>
            </Pressable>

            <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
```
`my-profile/security.tsx` — copy `app/(customer)/me/security.tsx`, change the push to `"/my-profile/security/password"` and the import depth (`../../../src/...` stays the same depth: `app/(barber)/my-profile/security.tsx` → `../../../src`).
`my-profile/settings.tsx` — copy `app/(customer)/me/settings.tsx` **without** the export mutation/button/`Toast`/`useMutation`/`useSupabaseSession`/`buildExportFile` imports; keep only the `ScreenHeader` and the language `MenuBlock`, pushing `"/my-profile/language"`.
Re-exports (each file is exactly one line; note the extra `../` for `security/password.tsx`):
```tsx
// my-profile/language.tsx
export { default } from "../../(customer)/me/language";
// my-profile/about.tsx
export { default } from "../../(customer)/me/about";
// my-profile/security/password.tsx
export { default } from "../../../(customer)/me/security/password";
```
Delete `app/(barber)/my-profile.tsx`. In `tests/e2e/barber-side.web.spec.ts`, replace the old test "a barber edits their profile and reads how they are paid" (lines ~179-200) with `test.skip`-free removal: delete it (its bio/compensation assertions move to Tasks 5 and 7, which add their own specs).

- [ ] **Step 4: Verify** — `rtk npm run typecheck && npx eslint app src tests && rtk npx jest tests/unit/route-collisions.test.ts tests/unit/locale-parity.test.ts` then the e2e runner: the new hub test passes; the only failures are the 4 known date-dependent ones.

- [ ] **Step 5: Commit** — `feat(barber): profile hub with security, settings, language and about`.

---

### Task 5: My details (photo, bio, email)

**Files:**
- Create: `app/(barber)/my-profile/account.tsx`
- Modify: `src/i18n/locales/{en,es,pt}.ts` (`barber.account`)
- Test: `tests/e2e/barber-profile.web.spec.ts` (add)

**Interfaces:**
- Consumes: `getMyBarberProfile`, `updateMyBarberProfile` (`src/features/barbers/api.ts`), `uploadMyAvatar`, `changeEmail` (`src/features/account/api.ts`), `useMyProfile`.

- [ ] **Step 1: Strings** `barber.account.nameHint` ("Your public name is set by the shop owner." / "Seu nome público é definido pelo dono da barbearia." / "Tu nombre público lo define el dueño de la barbería.") and `barber.account.bioHint` ("Shown to customers on your card." / "Mostrada aos clientes no seu cartão." / "Se muestra a los clientes en tu tarjeta.").

- [ ] **Step 2: Failing e2e** (append to `barber-profile.web.spec.ts`):
```ts
test("a barber edits their bio from My details and the name is read-only", async ({ page }) => {
  let profilePayload: Record<string, unknown> | null = null;

  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/update_my_barber_profile")) {
      profilePayload = route.request().postDataJSON() as Record<string, unknown>;
      return json(route, [{ avatar_url: null, bio: "New bio", id: barberId }]).then(() => true);
    }
  });

  await page.goto("/my-profile/account");
  await expect(page.getByTestId("barber-name")).toHaveText("Browser Barber");
  await page.getByTestId("barber-bio").fill("New bio");
  await page.getByTestId("barber-save").click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  expect(profilePayload).toEqual({ new_avatar_url: null, new_bio: "New bio" });
});
```
Run the e2e runner → the new test FAILS (route missing).

- [ ] **Step 3: Implement `account.tsx`.** Structure follows `app/(customer)/me/account.tsx` (read it for the `Avatar`/`ScreenHeader`/`Toast`/`Input`/`KeyboardAwareScrollView` markup):
  - Queries: `useMyProfile()`, `getMyBarberProfile` (key `["my-barber-profile", profile?.userId]`, same as the layout).
  - State: `bio` (synced from `barber.data.bio` in an effect), `newEmail`, `changingEmail`, `feedback`.
  - `save` mutation: `updateMyBarberProfile(supabase, { avatarUrl: barber.data.avatarUrl, bio })`; success → `profile saved` toast + invalidate `["my-barber-profile"]`.
  - `photo` mutation: copy the customer screen's picker + manipulator + `validateAvatar` block verbatim (it calls `uploadMyAvatar(supabase, session!.user.id, data, "image/jpeg", profile.data?.avatarPath ?? null)`), then **sync the public card photo**: build the URL with `supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl` (`uploadMyAvatar` returns the stored `path`) and call `updateMyBarberProfile(supabase, { avatarUrl: publicUrl, bio })`; invalidate `["my-profile"]` and `["my-barber-profile"]`.
  - `email` mutation: copy the customer screen's change-email block (`changeEmail`, `isValidEmail`, strings `profile.account.*`).
  - Name shown read-only: `<Text testID="barber-name">{barber.data?.name}</Text>` with `barber.account.nameHint` under it.
  - Bio: `<Input multiline label={t("barber.profile.bio")} testID="barber-bio" … />` + hint, Save `<Button testID="barber-save" label={t("barber.profile.save")} />`; success string `barber.profile.saved`, error `barber.profile.saveError`.

- [ ] **Step 4: Verify** — typecheck, eslint, jest, e2e runner (new test passes). The photo upload cannot run in the web e2e (native picker); it is verified manually in Task 8.

- [ ] **Step 5: Commit** — `feat(barber): my details screen with photo, bio and email`.

---

### Task 6: My services

**Files:**
- Create: `app/(barber)/my-profile/services.tsx`
- Modify: `src/i18n/locales/{en,es,pt}.ts` (`barber.myServices`)
- Test: `tests/e2e/barber-profile.web.spec.ts` (add)

**Interfaces:**
- Consumes: `listMyServiceOptions`, `setMyServiceEnabled`, `MyServiceOption` (Task 2).

- [ ] **Step 1: Strings** under `barber.myServices`: `title` ("My services"/"Meus serviços"/"Mis servicios"), `standard` ("Standard"/"Padrão"/"Estándar"), `standardHint` ("Every barber offers this service."/"Todos os barbeiros fazem este serviço."/"Todos los barberos hacen este servicio."), `optionalHint` ("Turn on if you perform this service."/"Ative se você realiza este serviço."/"Actívalo si realizas este servicio."), `empty` ("The shop has no services yet."/"A barbearia ainda não tem serviços."/"La barbería aún no tiene servicios."), `loadError` ("Unable to load the services."/"Não foi possível carregar os serviços."/"No se pudieron cargar los servicios."), `toggleError` ("Unable to update this service."/"Não foi possível atualizar este serviço."/"No se pudo actualizar este servicio.").

- [ ] **Step 2: Failing e2e** (append):
```ts
test("a barber turns an optional service on; the standard one is locked", async ({ page }) => {
  let togglePayload: Record<string, unknown> | null = null;
  const options = [
    { description: null, duration_minutes: 30, enabled: true, is_standard: true, price_cents: 4000, service_id: "s1", service_name: "Cut" },
    { description: null, duration_minutes: 20, enabled: false, is_standard: false, price_cents: 2500, service_id: "s2", service_name: "Beard" },
  ];

  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/list_my_service_options")) return json(route, options).then(() => true);
    if (url.pathname.endsWith("/rpc/set_my_service_enabled")) {
      togglePayload = route.request().postDataJSON() as Record<string, unknown>;
      return json(route, [{ enabled: true, service_id: "s2" }]).then(() => true);
    }
  });

  await page.goto("/my-profile/services");
  await expect(page.getByTestId("service-standard-s1")).toBeVisible();
  await expect(page.getByTestId("service-switch-s1")).toHaveCount(0);
  await expect(page.getByText("R$ 25,00")).toBeVisible();

  await page.getByTestId("service-switch-s2").click();
  expect(togglePayload).toEqual({ new_enabled: true, target_service_id: "s2" });
});
```
Run the e2e runner → FAIL.

- [ ] **Step 3: Implement `services.tsx`.** Screen with `ScreenHeader` (`barber.hub.menu.services`, back via `useBack`), a query `["my-service-options"]` → `listMyServiceOptions`, skeleton while loading, `EmptyState` (`barber.myServices.empty`) when empty, error text (`barber.myServices.loadError`). Each option renders a `Card variant="outlined"`: name, `barber.profile.serviceLine` (`{ duration, price: formatPriceBRL(priceCents) }`), and either
  - standard: `<Text testID={`service-standard-${id}`}>` with `barber.myServices.standard` + the standard hint; or
  - optional: the optional hint and `<Switch testID={`service-switch-${id}`} accessibilityLabel={serviceName} value={enabled} onValueChange={(next) => toggle.mutate({ enabled: next, id })} trackColor={{ false: colors.neutral[200], true: colors.primary[400] }} />` (`Switch` from `react-native`, `colors` from `src/lib/design/colors`).
  `toggle` = `useMutation(setMyServiceEnabled)` with optimistic-free behaviour: on success invalidate `["my-service-options"]` and `["my-barber-services"]`/`["my-barber-profile"]` queries, and `["barber-slots"]` (the agenda's free times depend on enabled services); on error show a `Toast` with `errorMessage(error, t, t("barber.myServices.toggleError"))` and refetch.

- [ ] **Step 4: Verify** — typecheck, eslint, jest, e2e runner (new test passes).

- [ ] **Step 5: Commit** — `feat(barber): my services screen with optional service switches`.

---

### Task 7: Compensation

**Files:**
- Create: `app/(barber)/my-profile/compensation.tsx`
- Modify: `src/i18n/locales/{en,es,pt}.ts` (`barber.compensation`)
- Test: `tests/e2e/barber-profile.web.spec.ts` (add)

- [ ] **Step 1: String** `barber.compensation.ownerHint` ("Set by the shop owner."/"Definida pelo dono da barbearia."/"La define el dueño de la barbería.").

- [ ] **Step 2: Failing e2e** (append): visit `/my-profile/compensation` with the default mock (`commission_percent: "40.00"`) and assert `page.getByTestId("barber-compensation")` has text "Commission: 40% of each completed service." and that the owner hint is visible. Run → FAIL.

- [ ] **Step 3: Implement `compensation.tsx`:** `ScreenHeader` (`barber.hub.menu.compensation`), query `getMyBarberProfile` (same key), and the display copied from the old profile screen:
```tsx
<Text className="text-base font-sans text-neutral-700" testID="barber-compensation">
  {compensation.type === "commission"
    ? t("barber.profile.commission", { percent: compensation.commissionPercent })
    : t("barber.profile.chairRental", {
        amount: formatPriceBRL(compensation.amountCents),
        frequency: t(`barber.frequency.${compensation.frequency}`),
      })}
</Text>
<Text className="text-sm font-sans text-neutral-600">{t("barber.compensation.ownerHint")}</Text>
```
inside a `Card variant="outlined"`; skeleton while loading, error text `barber.profile.loadError`.

- [ ] **Step 4: Verify** — typecheck, eslint, jest, e2e runner.

- [ ] **Step 5: Commit** — `feat(barber): read-only compensation screen`.

---

### Task 8: Verification, review and PR

- [ ] **Step 1: Full checks** — `rtk npm run typecheck`, `npx eslint app src tests`, `npx jest --runInBand` (the process may not exit by itself because of open handles; read the summary then kill it by PID, never `pkill -f`), `rtk npm run test:db` (known local-only failures: `010_full_rls` tests 3, 5, 7, 21, 22 because the local DB holds `samuel@teste.com` and `Barber Teste`), e2e runner (known: 4 date-dependent failures in `swipe` and `customer-lifecycle`).
- [ ] **Step 2: Real browser** — copy `.env.local` from the main checkout, start Metro from this worktree (`CI=1 npx expo start --web --port 8083`), log in as `barber@teste.com`, check with screenshots and `getComputedStyle`: hub layout, My services (mark a service standard from the owner screen with a throwaway owner session or SQL, confirm it appears locked and a new optional toggles), compensation, settings → language, password screen. Remove `.env.local` afterwards. Verify the photo upload manually if a file chooser is available, otherwise state it was not exercised.
- [ ] **Step 3: Self-review the diff** (security: RPCs only touch the caller's barber row; triggers `security definer` with fixed `search_path`; no new direct table grants).
- [ ] **Step 4: Push and open a PR stacked on #20** (REST, base `feat-barber-booking`): `git push -u origin feat-barber-profile`, then `gh api repos/Samuel-S-N/barberschedule/pulls -f title=… -f head=feat-barber-profile -f base=feat-barber-booking -F body=@<file>`; body in Portuguese with the summary, migration 0035 note (apply to hosted after 0031-0034) and the verification results, ending with the 🤖 Generated with [Claude Code](https://claude.com/claude-code) line.
- [ ] **Step 5: Update the project memory** (`project_barber_booking.md`) with the PR number and status.

---

## Self-Review

**Spec coverage:** `is_standard` + triggers + two RPCs → T1; API/types/errors → T2; owner toggle → T3; hub, security, settings, re-exports, removal of old form → T4; my details → T5; my services → T6; compensation → T7; testing and PR → T8. Out-of-scope items (hours, privacy, name edit) are not implemented.

**Placeholder scan:** T4 `security.tsx`/`settings.tsx` and T5 `account.tsx` are specified as copies of named existing files with exact edits (paths, removed imports), because those files are 100-200 lines of unchanged markup; all new logic is shown.

**Type consistency:** `MyServiceOption` fields (`serviceId`, `serviceName`, `durationMinutes`, `priceCents`, `isStandard`, `enabled`, `description`) match the mapper, the screen and the test; RPC argument names `target_service_id` / `new_enabled` match SQL, API and e2e; test IDs `service-switch-*`, `service-standard-*`, `menu-*`, `barber-bio`, `barber-save`, `barber-name`, `barber-compensation` are consistent.
