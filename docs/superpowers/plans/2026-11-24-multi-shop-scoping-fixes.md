# Multi-shop scoping fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) `update_my_profile` stops returning an arbitrary one of a person's customer rows; (2) recurrence notifications are created with the shop they belong to, so they no longer show in every shop's inbox or land in a guessed shop.

**Architecture:** Two new migrations, no rewriting of old ones (that would need `db reset`, which is not allowed locally). `0077` drops `add_inbox_event` and creates it again with a required shop parameter, then recreates its five callers with their **latest** bodies copied verbatim from the source migrations by a script, changing only the call. `0078` drops and recreates `update_my_profile` as `returns void`. The app change is one function in `src/features/account/api.ts`.

**Tech Stack:** Supabase (Postgres + pgTAP), TypeScript (`src/features/account/api.ts`), Jest, Playwright (one mock).

**Spec:** `docs/superpowers/specs/2026-11-24-multi-shop-scoping-fixes-design.md`

**Branch for the work:** `fix-multi-shop-scoping`, cut from `main` when the user says to start (this plan lives on `docs-multi-shop-scoping-fixes`; the spec and plan ride along in the PR). One PR against `main`.

**Wording:** prose and comments say "business" or "shop", never "barbershop".

## Findings (read from the code first)

1. **Latest `update_my_profile` is `0028_profile_nickname.sql`** (`returns public.customers`, three parameters). `0051` adds the separate `update_my_staff_profile` and does not touch it. The return value is read by **two pgTAP assertions** (`011_customer_self_service.sql:66`, `015_profile_nickname.sql:26`) and by nothing else; `046_security_hardening.sql` calls it with `select * from` and only checks it does not throw (still fine with `void`).
1a. **`update_my_profile` is not only "arbitrary", it FAILS today for a person who is a customer in two shops:** `update public.customers … returning * into result` makes PL/pgSQL raise `P0003 query returned more than one row` (an `UPDATE … RETURNING INTO` errors on more than one row even without `STRICT`). Verified by running the edited `011` against the current database: the `lives_ok` of Task 2 fails with exactly that error, and passes with `0078`. So Task 2 fixes a real, user-visible bug (the account screen's save errors out), not just a tidy-up; worth saying in the PR.
2. **`add_inbox_event`'s callers, all of them** (grep over migrations, tests, Edge Functions and app): `request_recurrence`, `decide_recurrence_request`, `create_recurrence_for_customer`, `request_series_cancellation`, `decide_series_cancellation`. Latest definitions: `0058` for four, `0053` for `create_recurrence_for_customer`. All five keep their signatures, so `create or replace` keeps their `authenticated` grant.
2a. **A professional can work in ONE shop only** (`professionals_user_id_key`, found by running the fixture): the brief's "wrong for a professional in two shops" cannot happen today, so the staff-recipient guess is right today. Only the customer-recipient rows (null shop, shown in every shop) are really broken. The staff assertions in `059` therefore pass before the fix too; they stay as guards for the day a person may staff several shops, and because the shop is now passed explicitly instead of guessed. The design is unchanged (the shop parameter is required for every recipient) but the user should know the staff half is preventive.
3. **ACL today:** `add_inbox_event` is executable by its owner only (`{postgres=X/postgres}`); the new one must end up the same (`revoke all … from public`, checked by pgTAP).
4. **The inbox is a table query, not a function:** `listNotifications` selects from `notifications` with `shop_id.eq.<shop>,shop_id.is.null` (RLS keeps it to the person's rows); `count_unread_notifications(p_shop_id)` counts the shop's rows **plus the unscoped ones** (`0069`). So a customer row with a null shop counts and lists in every shop. pgTAP asserts both ways.
5. **One owner per shop is enforced** (`shops_owner_user_id_key`), so the test uses two owners; the "owner of several shops" guess problem is therefore only reachable for professionals today.
6. **Same class of bug, outside the approved scope:** `0062_payout_notifications.sql` inserts into `notifications` directly with no shop in `enqueue_payout_due_notifications` and `record_professional_payout`. Reported in the spec; **not** in this plan.
7. **Numbering:** latest migration `0076`, latest pgTAP `058`. This plan uses migrations **0077** (recurrence, as the brief names it) and **0078** (`update_my_profile`), pgTAP **059**; the brief only named 0077 and 059, the second migration is unavoidable (a return type cannot change in place).

## Open questions

1. The payout notifications and the push payload (spec, "Found while reading"): include them in this PR (a third small migration) or leave them for later? **Plan does:** leave them out.
2. Task order: recurrence first (so it keeps the name `0077` from the brief) and `update_my_profile` second. Say if the numbers should be the other way round.

## Global Constraints

- Apply migrations with `npx supabase migration up`; **never** `npx supabase db reset`.
- Gates per task: `npm run typecheck`, `npm run lint` (ROOT lint: read the real output and exit code, never `| tail`), the Jest tests that touch `updateMyProfile`, the affected pgTAP files. Read the `Test Suites:` line of Jest, not only `Tests:`.
- Known local pgTAP failures from seed counts (`010`, `012`, `016`, `055`) are **not** regressions; CI's clean database is the check.
- Strict TDD: failing test first, then the fix. One commit per task.
- Do not push and do not open the PR unless told to.

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0077_recurrence_notification_shop.sql` (new) | new `add_inbox_event` + the five callers recreated |
| `supabase/tests/059_recurrence_notification_shop.sql` (new) | pgTAP for the shop on every recurrence notification |
| `supabase/migrations/0078_update_my_profile_void.sql` (new) | `update_my_profile` returns `void` |
| `supabase/tests/011_customer_self_service.sql`, `015_profile_nickname.sql` (modify) | stop reading the return value; `void`; two shops renamed |
| `src/features/account/api.ts` (modify) | `updateMyProfile` returns nothing |
| `tests/integration/account.test.ts` (modify) | `updateMyProfile` resolves with nothing |
| `tests/e2e/customer-lifecycle.web.spec.ts` (modify) | the mock answers `204` |

---

### Task 1: Recurrence notifications carry their shop (migration 0077, pgTAP 059)

**Files:** `supabase/tests/059_recurrence_notification_shop.sql`, `supabase/migrations/0077_recurrence_notification_shop.sql`

**Interfaces:**
- Produces: `public.add_inbox_event(target_user uuid, target_shop uuid, target_kind text, target_params jsonb, target_key text, push_event text default null) returns void`, `security definer`, `set search_path = pg_catalog, public, pg_temp`, `revoke all … from public`. The old five-argument signature is gone.
- The five callers keep their signatures and behaviour; each now passes the shop it already holds: `request_recurrence` → `bs.shop_id`; `decide_recurrence_request` → `req.shop_id`; `create_recurrence_for_customer` → `bs.shop_id`; `request_series_cancellation` and `decide_series_cancellation` → `series_row.shop_id`.

- [ ] **Step 1: Write the failing pgTAP** `supabase/tests/059_recurrence_notification_shop.sql`:

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

-- Two shops, each with its own owner (one owner per shop). A user can be a professional in ONE shop only (professionals_user_id_key),
-- so the professional works in shop A; one person IS a customer in BOTH shops (that is the case that is broken today).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't59-owner-a@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't59-owner-b@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't59-professional@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't59-customer@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id in ('f9000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000002');
update public.profiles set role = 'professional' where user_id = 'f9000000-0000-0000-0000-000000000003';

insert into public.shops (id, name, owner_user_id) values
  ('f9100000-0000-0000-0000-000000000001', 'T59 Shop A', 'f9000000-0000-0000-0000-000000000001'),
  ('f9100000-0000-0000-0000-000000000002', 'T59 Shop B', 'f9000000-0000-0000-0000-000000000002');
insert into public.professionals (id, shop_id, name, user_id) values
  ('f9300000-0000-0000-0000-000000000001', 'f9100000-0000-0000-0000-000000000001', 'T59 Professional', 'f9000000-0000-0000-0000-000000000003');
insert into public.customers (id, shop_id, user_id, full_name, email) values
  ('f9200000-0000-0000-0000-000000000001', 'f9100000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000004', 'T59 Customer', 't59-customer@a.example'),
  ('f9200000-0000-0000-0000-000000000002', 'f9100000-0000-0000-0000-000000000002', 'f9000000-0000-0000-0000-000000000004', 'T59 Customer', 't59-customer@b.example');
insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('f9400000-0000-0000-0000-000000000001', 'f9100000-0000-0000-0000-000000000001', 'T59 Cut', 30, 3500);
insert into public.professional_services (id, shop_id, professional_id, service_id)
values ('f9500000-0000-0000-0000-000000000001', 'f9100000-0000-0000-0000-000000000001', 'f9300000-0000-0000-0000-000000000001', 'f9400000-0000-0000-0000-000000000001');
insert into public.working_periods (shop_id, professional_id, weekday, start_time, end_time)
select 'f9100000-0000-0000-0000-000000000001', 'f9300000-0000-0000-0000-000000000001', day, '09:00', '18:00' from generate_series(1, 7) as day;

create temporary table t59_dates as select date_trunc('week', current_date + 14)::date as monday;
create temporary table t59_ids (name text primary key, id uuid);
grant select on t59_dates, t59_ids to authenticated;

-- owner A publishes the plans
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000001', true);
select public.save_recurrence_plan(null, 'f9400000-0000-0000-0000-000000000001', 1, 2500, 'T59 weekly', true);
select public.save_recurrence_plan(null, 'f9400000-0000-0000-0000-000000000001', 2, 3000, 'T59 biweekly', true);

-- the customer asks for a recurrence in shop A
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000004', true);
select count(*) from public.request_recurrence('f9500000-0000-0000-0000-000000000001', 1, (select monday from t59_dates), '10:00');
reset role;

select is((select shop_id from public.notifications where user_id = 'f9000000-0000-0000-0000-000000000003' and kind = 'recurrence_requested'), 'f9100000-0000-0000-0000-000000000001'::uuid,
  'the professional gets the request notice in the shop of the request (a guard: the guess is right today because a professional has one shop)');
select is((select shop_id from public.notifications where user_id = 'f9000000-0000-0000-0000-000000000001' and kind = 'recurrence_requested'), 'f9100000-0000-0000-0000-000000000001'::uuid,
  'the owner gets the request notice in the shop of the request');

-- the professional accepts
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000003', true);
select count(*) from public.decide_recurrence_request((select id from public.list_recurrence_requests('f9100000-0000-0000-0000-000000000001') limit 1), true);
reset role;
insert into t59_ids select 'series', id from public.recurrence_series where customer_id = 'f9200000-0000-0000-0000-000000000001';

select is((select shop_id from public.notifications where user_id = 'f9000000-0000-0000-0000-000000000004' and kind = 'recurrence_accepted'), 'f9100000-0000-0000-0000-000000000001'::uuid,
  'the customer''s "accepted" notice carries the shop of the request');

-- as the customer: shop A's inbox shows it, shop B's does not (the app lists shop_id = X or null)
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000004', true);
select is(public.count_unread_notifications('f9100000-0000-0000-0000-000000000001'), 1, 'shop A counts the notice');
select is(public.count_unread_notifications('f9100000-0000-0000-0000-000000000002'), 0, 'shop B does not');
select is((select array_agg(kind order by kind) from public.notifications where shop_id = 'f9100000-0000-0000-0000-000000000001' or shop_id is null), array['recurrence_accepted'], 'shop A lists it');
select is((select count(*)::int from public.notifications where shop_id = 'f9100000-0000-0000-0000-000000000002' or shop_id is null), 0, 'shop B lists nothing');

-- the customer asks to cancel the series; the professional declines
select public.request_series_cancellation((select id from t59_ids where name = 'series'));
reset role;
select is((select shop_id from public.notifications where user_id = 'f9000000-0000-0000-0000-000000000003' and kind = 'recurrence_cancel_requested'), 'f9100000-0000-0000-0000-000000000001'::uuid,
  'the professional gets the cancellation request in the right shop');
select is((select shop_id from public.notifications where user_id = 'f9000000-0000-0000-0000-000000000001' and kind = 'recurrence_cancel_requested'), 'f9100000-0000-0000-0000-000000000001'::uuid,
  'the owner gets the cancellation request in the right shop');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000003', true);
select public.decide_series_cancellation((select id from t59_ids where name = 'series'), false);
reset role;
select is((select shop_id from public.notifications where user_id = 'f9000000-0000-0000-0000-000000000004' and kind = 'recurrence_cancel_declined'), 'f9100000-0000-0000-0000-000000000001'::uuid,
  'the customer''s "declined" notice carries the shop');

-- cancel again and accept (the series ends), then the owner creates a new series by hand for the customer
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000004', true);
select public.request_series_cancellation((select id from t59_ids where name = 'series'));
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000003', true);
select public.decide_series_cancellation((select id from t59_ids where name = 'series'), true);
reset role;
select is((select shop_id from public.notifications where user_id = 'f9000000-0000-0000-0000-000000000004' and kind = 'recurrence_cancel_accepted'), 'f9100000-0000-0000-0000-000000000001'::uuid,
  'the customer''s "cancellation accepted" notice carries the shop');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000001', true);
select count(*) from public.create_recurrence_for_customer('f9200000-0000-0000-0000-000000000001', 'f9500000-0000-0000-0000-000000000001', 2, (select monday from t59_dates) + 1, '11:00');
reset role;
select is((select shop_id from public.notifications where user_id = 'f9000000-0000-0000-0000-000000000004' and event_key like 'recman:%'), 'f9100000-0000-0000-0000-000000000001'::uuid,
  'a series created by hand notifies the customer in the right shop');

-- nothing recurrence-related is left without a shop, anywhere
select is((select count(*)::int from public.notifications where kind like 'recurrence\_%' and shop_id is null), 0, 'no recurrence notification is unscoped');

-- the function itself: only the new signature, and not callable by clients
select has_function('public', 'add_inbox_event', array['uuid', 'uuid', 'text', 'jsonb', 'text', 'text'], 'add_inbox_event has the shop parameter');
select hasnt_function('public', 'add_inbox_event', array['uuid', 'text', 'jsonb', 'text', 'text'], 'the old add_inbox_event signature is gone');
select is(has_function_privilege('authenticated', 'public.add_inbox_event(uuid, uuid, text, jsonb, text, text)', 'execute'), false, 'clients cannot call add_inbox_event');

select * from finish();
rollback;
```

(`plan(16)` matches the assertions above: 2 requested + 1 accepted + 4 inbox + 2 cancellation requested + 1 declined + 1 cancel accepted + 1 manual + 1 unscoped + 3 function = 16. Run it before the migration: `npx supabase test db supabase/tests/059_recurrence_notification_shop.sql` → FAIL on the shop assertions (the customer's rows have a null shop) and on the three signature assertions. If the fixture itself errors (a name of a helper differs), fix the fixture until only the assertions fail, copying the pattern of `040_plan_change_cancel.sql`.)

- [ ] **Step 2: Create the migration with a script** (the function bodies are copied, not retyped). Run once from the repo root; do not commit the script:

```bash
python3 - <<'EOF'
import re

SOURCES = [
    ("0058_plan_change_and_cancellation", "request_series_cancellation", "series_row.shop_id"),
    ("0058_plan_change_and_cancellation", "decide_series_cancellation", "series_row.shop_id"),
    ("0058_plan_change_and_cancellation", "request_recurrence", "bs.shop_id"),
    ("0058_plan_change_and_cancellation", "decide_recurrence_request", "req.shop_id"),
    ("0053_recurrence_plans", "create_recurrence_for_customer", "bs.shop_id"),
]

out = ["""-- Recurrence notifications carry their shop. add_inbox_event (0050) inserted them with no shop, so the trigger guessed one from the
-- recipient (wrong for a professional in two shops) or left it null (a customer's row then showed in EVERY shop's inbox, see 0069).
-- add_inbox_event now takes the shop and every caller passes the one it already holds. The callers below are the latest definitions
-- (0058 for four, 0053 for create_recurrence_for_customer) copied verbatim; only the call to add_inbox_event changed.
drop function public.add_inbox_event(uuid, text, jsonb, text, text);

create function public.add_inbox_event(target_user uuid, target_shop uuid, target_kind text, target_params jsonb, target_key text, push_event text default null)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if target_user is null or target_user is not distinct from auth.uid() then return; end if;
  insert into public.notifications (user_id, shop_id, kind, params, event_key) values (target_user, target_shop, target_kind, target_params, target_key)
  on conflict (event_key) do nothing;
  if found and push_event is not null then
    insert into public.notification_outbox (event_key, event_type, recipient_user_id, payload)
    values ('push:' || target_key, push_event, target_user, target_params)
    on conflict (event_key) do nothing;
  end if;
end;
$$;
revoke all on function public.add_inbox_event(uuid, uuid, text, jsonb, text, text) from public;
"""]

for migration, name, shop in SOURCES:
    lines = open(f"supabase/migrations/{migration}.sql").read().split("\n")
    start = next(i for i, line in enumerate(lines) if re.match(rf"create (or replace )?function public\.{name}\(", line))
    end = next(i for i in range(start, len(lines)) if lines[i] == "$$;")
    body = "\n".join(lines[start : end + 1])
    body = re.sub(r"^create (or replace )?function", "create or replace function", body, count=1)
    body, calls = re.subn(r"public\.add_inbox_event\((\w+),", rf"public.add_inbox_event(\1, {shop},", body)
    assert calls >= 1, name
    out.append(f"-- {name}: from {migration}.sql, {calls} call(s) now pass {shop}\n{body}\n")

open("supabase/migrations/0077_recurrence_notification_shop.sql", "w").write("\n".join(out))
EOF
```

Sanity checks (must hold before applying): `rtk grep -c "add_inbox_event(" supabase/migrations/0077_recurrence_notification_shop.sql` is **10** (the `drop`, the `create`, the `revoke`, and 7 calls: `request_series_cancellation` 2, `decide_series_cancellation` 1, `request_recurrence` 2, `decide_recurrence_request` 1, `create_recurrence_for_customer` 1), and the numbers in the `-- <name>: … N call(s)` comments add up to 7. To prove nothing but the call changed, for each function run `diff <(sed -n '<start>,<end>p' supabase/migrations/<source>.sql) <(sed -n '/^-- <name>:/,/^\$\$;/p' supabase/migrations/0077_recurrence_notification_shop.sql | tail -n +2)` (source ranges: `0058:42-70`, `0058:72-109`, `0058:133-190`, `0058:195-246`, `0053:154-197`) and read the output: only the `add_inbox_event(` lines, and for the `create function` ones the first line (`create function` → `create or replace function`), may differ. A cheap syntax check that changes nothing: `docker exec -i supabase_db_zenc psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<< "begin; $(cat supabase/migrations/0077_recurrence_notification_shop.sql); rollback;"`.

- [ ] **Step 3: Apply and run**

```bash
npx supabase migration up
npx supabase test db supabase/tests/059_recurrence_notification_shop.sql supabase/tests/031_recurrence_requests.sql supabase/tests/034_recurrence_plans.sql supabase/tests/038_conflict_resolution.sql supabase/tests/039_reactivate_series.sql supabase/tests/040_plan_change_cancel.sql supabase/tests/041_plans_without_end.sql supabase/tests/029_notifications_inbox.sql supabase/tests/051_customer_shop_scoping.sql
```

Expected: all PASS (059 now green; the recurrence files prove the five callers still behave). Check the ACL: `docker exec supabase_db_zenc psql -U postgres -d postgres -At -c "select proacl from pg_proc where proname = 'add_inbox_event'"` shows only `{postgres=X/postgres}`.

- [ ] **Step 4: Commit**

```bash
git add supabase
git commit -m "fix(db): recurrence notifications carry their shop" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `update_my_profile` returns nothing (migration 0078)

**Files:** `supabase/migrations/0078_update_my_profile_void.sql`, `supabase/tests/011_customer_self_service.sql`, `supabase/tests/015_profile_nickname.sql`, `src/features/account/api.ts`, `tests/integration/account.test.ts`, `tests/e2e/customer-lifecycle.web.spec.ts`

**Interfaces:**
- SQL: `public.update_my_profile(p_full_name text, p_phone text, p_nickname text default null) returns void`; same validation (`42501` anonymous, `P0017` invalid, `P0007` no customer row); updates `profiles` and **every** `customers` row of the user; grants `revoke … from public, anon`, `grant execute … to authenticated`.
- TS: `updateMyProfile(supabase, input): Promise<void>`.

- [ ] **Step 1: Write the failing tests.**

`supabase/tests/011_customer_self_service.sql`: `select plan(21);` → `select plan(23);`. After the shop insert at the top, add a second shop and a second owner so the person can be a customer in two shops:

```sql
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't11-owner-b@example.com', 'password-hash', now(), '{"full_name":"T11 Owner B"}');
update public.profiles set role = 'owner' where user_id = '70000000-0000-0000-0000-000000000004';
insert into public.shops (id, name, owner_user_id)
values ('71000000-0000-0000-0000-000000000002', 'T11 Shop B', '70000000-0000-0000-0000-000000000004');
```

(place it **after** the `select set_config('t11.shop', …)` line so `t11.shop` stays the first shop), and just before the `-- profile update` section (the owner section above leaves the role `authenticated`, so the block starts with `reset role;`):

```sql
-- the same person is also a customer of shop B (superuser: a direct insert by `authenticated` is refused by guard_account_link)
reset role;
insert into public.customers (id, shop_id, user_id, full_name, email)
values ('77000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', 'T11 Customer', 't11-customer@b.example');
```

Replace line 66 (`select is((select full_name from public.update_my_profile(…)), 'T11 Renamed', …)`) with:

```sql
select lives_ok($$ select public.update_my_profile('T11 Renamed', '+55 11 91111-2222') $$, 'update_my_profile runs');
select is(
  (select pg_get_function_result('public.update_my_profile(text, text, text)'::regprocedure)),
  'void', 'update_my_profile returns nothing (nobody used the arbitrary row it returned)'
);
select is((select count(*)::int from public.customers where user_id = '70000000-0000-0000-0000-000000000002' and full_name = 'T11 Renamed' and phone = '+55 11 91111-2222'), 2,
  'a person who is a customer in two shops gets BOTH rows updated');
```

(+1 assertion over the original line, +1 for `void`, +1 for the two rows, minus the replaced one = plan 21 + 2 = 23.) The two appointment fixtures further down (`insert … select … from public.customers where user_id = '70000000-0000-0000-0000-000000000002';`, lines ≈ 82 and ≈ 101) would now pick both customer rows and fail with "Appointment professional service identity is invalid" for the shop-B one: add `and shop_id = current_setting('t11.shop')::uuid` to the `where` of both.

`supabase/tests/015_profile_nickname.sql` (plan stays 8): replace line 26 by

```sql
select public.update_my_profile('T15 Renamed', '(11)91234-5678', 'Bibi');
select is((select full_name from public.customers where user_id = '90000000-0000-0000-0000-000000000002'), 'T15 Renamed', 'update_my_profile renames the customer row');
```

and make the assertion on the next line (the nickname) expect `'Bibi'` (the nickname the call now sets; the original line passed `'Bibi'`, keep whatever the file's next assertion expects: it must match the argument of the call you wrote).

`tests/integration/account.test.ts`:

```ts
  it("updateMyProfile sends p_-prefixed parameters and returns nothing", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });

    await expect(updateMyProfile({ rpc } as never, { fullName: "Ana B", nickname: " Bia ", phone: "+55 11 90000-0000" })).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("update_my_profile", { p_full_name: "Ana B", p_nickname: "Bia", p_phone: "+55 11 90000-0000" });
  });

  it("updateMyProfile sends a null nickname when it is blank", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });

    await updateMyProfile({ rpc } as never, { fullName: "Ana", nickname: "   ", phone: null });

    expect(rpc).toHaveBeenCalledWith("update_my_profile", { p_full_name: "Ana", p_nickname: null, p_phone: null });
  });
```

(replacing the two tests at lines 27–41; the `P0017` and `ACCOUNT_REQUEST_FAILED` tests stay.)

Run: `npx jest tests/integration/account.test.ts` → FAIL (`toCustomer(null)` throws), and `npx supabase test db supabase/tests/011_customer_self_service.sql supabase/tests/015_profile_nickname.sql` → FAIL on the `void` assertion (still `customers`).

- [ ] **Step 2: Migration** `supabase/migrations/0078_update_my_profile_void.sql`:

```sql
-- update_my_profile used to return ONE of the person's customer rows (they have one per shop), an arbitrary one nobody reads. It now
-- returns nothing. It still updates the profile and EVERY customer row (it is the same person in every shop), and still fails with
-- P0007 when the person has no customer row. A return type cannot change in place: drop and create again, same grants.
drop function public.update_my_profile(text, text, text);

create function public.update_my_profile(p_full_name text, p_phone text, p_nickname text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if btrim(coalesce(p_full_name, '')) = ''
    or (nullif(btrim(p_phone), '') is not null and btrim(p_phone) !~ '^[0-9+()\s-]{8,20}$')
    or char_length(btrim(coalesce(p_nickname, ''))) > 30
  then
    raise exception using errcode = 'P0017', message = 'PROFILE_INVALID';
  end if;

  update public.profiles
  set full_name = btrim(p_full_name), nickname = nullif(btrim(p_nickname), ''), updated_at = clock_timestamp()
  where user_id = actor;

  update public.customers
  set full_name = btrim(p_full_name), phone = nullif(btrim(p_phone), ''), updated_at = clock_timestamp()
  where user_id = actor;

  if not found then
    raise exception using errcode = 'P0007', message = 'CUSTOMER_UNAVAILABLE';
  end if;
end;
$$;

revoke all on function public.update_my_profile(text, text, text) from public, anon;
grant execute on function public.update_my_profile(text, text, text) to authenticated;
```

(Before applying, diff against `0028_profile_nickname.sql` lines 27–62: the validation text must be identical; only `returns`, the `result` variable, `returning * into result` and the final `return result;` are gone. The `46_security_hardening` check that a 101-character name is refused with `23514` comes from a constraint (`0046`/`0064`), untouched.)

- [ ] **Step 3: App code** `src/features/account/api.ts`:

```ts
export async function updateMyProfile(
  supabase: RpcClient,
  input: { fullName: string; nickname: string | null; phone: string | null },
): Promise<void> {
  await callRpc(supabase, "update_my_profile", {
    p_full_name: input.fullName,
    p_nickname: input.nickname?.trim() || null,
    p_phone: input.phone,
  });
}
```

(`toCustomer` and `CustomerRow` stay imported: `ensureMyCustomer` uses them.) `app/(customer)/me/account.tsx` already ignores the result; check with `npx tsc --noEmit`. In `tests/e2e/customer-lifecycle.web.spec.ts` (≈ line 166) the mock answers `204` with no body, as PostgREST does for a `void` function: replace `await json(route, customerRow({ full_name: "Browser Renamed", phone: "+55 11 90000-0000" }));` by `await route.fulfill({ status: 204 });` (keep the `return true;`; drop the `json`/`customerRow` imports only if lint says they became unused).

- [ ] **Step 4: Apply and run**

```bash
npx supabase migration up
npx supabase test db supabase/tests/011_customer_self_service.sql supabase/tests/015_profile_nickname.sql supabase/tests/046_security_hardening.sql supabase/tests/059_recurrence_notification_shop.sql
npx jest tests/integration/account.test.ts tests/unit/account-avatar.test.ts
npm run typecheck
npm run lint
```

(`rtk grep -ln "updateMyProfile\|update_my_profile" tests src app` shows the rest to run: at least `tests/integration/account.test.ts`; add any other Jest file it lists.) Expected: all PASS. Then the browser spec that edits the profile: `npm run e2e:export` and `npx playwright test tests/e2e/customer-lifecycle.web.spec.ts --config playwright.chrome.config.ts` (move `.env.local` aside as usual; it is not part of CI).

- [ ] **Step 5: Commit**

```bash
git add supabase src tests
git commit -m "fix(db): update_my_profile returns nothing instead of an arbitrary customer row" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Final gate and handoff

- [ ] **Step 1:** `npm run typecheck; echo typecheck_exit=$?`, `npm run lint; echo lint_exit=$?` (read the output), `npx jest --runInBand` (read `Test Suites:`), all pgTAP files named in Tasks 1 and 2 plus the whole `npx supabase test db` run (the failures of `010`, `012`, `016`, `055` are the known seed-count ones; anything else is ours), **re-run after the last commit**. Playwright: `customer-lifecycle` and the whole suite if time allows.
- [ ] **Step 2:** Report: commits, gate results, anything unexpected. Push and the single PR against `main` only when told to (stacking is not needed: both tasks are independent of other open branches).
