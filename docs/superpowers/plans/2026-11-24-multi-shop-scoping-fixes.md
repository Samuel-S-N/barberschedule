# Multi-shop scoping fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) `update_my_profile` stops failing for (and returning an arbitrary row of) a person who is a customer in several shops; (2) recurrence notifications are created with the shop they belong to, so they no longer show in every shop's inbox; (3) every push shows the shop's name as its title, and recurrence pushes carry the shop so they reach the shop's own address.

**Architecture:** Two new migrations, no rewriting of old ones (that would need `db reset`, which is not allowed locally). `0077` drops `add_inbox_event` and creates it again with a required shop parameter, then recreates its five callers with their **latest** bodies copied verbatim from the source migrations by a script, changing only the call. `0078` drops and recreates `update_my_profile` as `returns void`. `0079` redefines `claim_notification_batch` to also return the shop's name; the dispatcher (`dispatch.ts`) then wraps every message with `withShopName` (name as title, event title at the start of the body) on both channels. The app change is one function in `src/features/account/api.ts`; the push change is in the Edge Function code and its Jest tests.

**Tech Stack:** Supabase (Postgres + pgTAP, Edge Function on Deno whose pure modules are tested with Jest), TypeScript (`src/features/account/api.ts`), Jest, Playwright (one mock).

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
6. **Payout notifications stay out (user decision):** `0062` inserts with no shop, but a payout is between one shop and one professional and a professional works in one shop only, so the guess is right.
7. **Numbering:** latest migration `0076`, latest pgTAP `058`. This plan uses migrations **0077** (recurrence), **0078** (`update_my_profile`) and **0079** (claim returns the shop name), pgTAP **059** and **060**.
8. **Push, what the code does today** (read, then dry-run): `claim_notification_batch` (latest `0073`) joins `shops` through `payload ->> 'shop_id'` and returns only the slug; appointment events carry `shop_id` in their outbox payload (`0021`, `0022`, `0046`), recurrence events do not (`add_inbox_event` copies the params unchanged), payout events do not. `pickRows` uses the slug to pick the web subscription on the shop's own address, and `attempt` builds the message once for web and once for Expo through `buildMessage(event_type, locale, payload)`; Expo's `data` is the whole outbox payload.
9. **Expo `data` already carries `shop_id`** for appointment events and, after `0077`, for recurrence events, so a future native tap target has it; the app has **no** notification-response listener today (no `addNotificationResponseReceivedListener` anywhere), so nothing needs adding to `data` now.
10. **`notification-path.ts`** (`supabase/functions/_shared/notification-path.ts`) maps event type and role to a path; it does not use the shop (the shop comes from the subscription's origin). Unchanged. The web push still opens the role's agenda root, not the appointment (the follow-up noted in PR #105).

## Open questions

1. Task order: recurrence first (so it keeps the name `0077` from the brief), then `update_my_profile`, then the push shop name (it builds on the new `add_inbox_event`). Say if the numbers should differ.
2. `withShopName` gives a message `"<event title>: <event body>"` as body. For staff events the body already has the shape `"Ana · Corte · ter, 25 nov 14:00"`, so it reads `"Novo agendamento: Ana · Corte · ter, 25 nov 14:00"`. Fine as is, say if the separator should differ.
3. The shop name is not truncated; push services cut long titles themselves.

## Global Constraints

- Apply migrations with `npx supabase migration up`; **never** `npx supabase db reset`.
- Gates per task: `npm run typecheck`, `npm run lint` (ROOT lint: read the real output and exit code, never `| tail`), the Jest tests that touch `updateMyProfile`, the affected pgTAP files. Read the `Test Suites:` line of Jest, not only `Tests:`.
- Known local pgTAP failures from seed counts (`010`, `012`, `016`, `055`) are **not** regressions; CI's clean database is the check.
- The Jest tests of the dispatcher and the messages run under the root Jest config (`tests/unit/dispatch.test.ts`, `notification-messages.test.ts`, `notification-path.test.ts`): run them by path.
- Strict TDD: failing test first, then the fix. One commit per task.
- Do not push and do not open the PR unless told to.

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0077_recurrence_notification_shop.sql` (new) | new `add_inbox_event` + the five callers recreated |
| `supabase/tests/059_recurrence_notification_shop.sql` (new) | pgTAP for the shop on every recurrence notification |
| `supabase/migrations/0078_update_my_profile_void.sql` (new) | `update_my_profile` returns `void` |
| `supabase/migrations/0079_claim_notification_shop_name.sql` (new) | `claim_notification_batch` also returns `shop_name` |
| `supabase/tests/060_claim_shop_name.sql` (new) | pgTAP for the claim's shop name and slug |
| `supabase/functions/dispatch-notifications/messages.ts` (modify) | `withShopName` |
| `supabase/functions/dispatch-notifications/dispatch.ts` (modify) | `shop_name` on `ClaimedNotification`; both channels use `withShopName` |
| `tests/unit/notification-messages.test.ts`, `tests/unit/dispatch.test.ts` (modify) | name as title, fallback, both channels |
| `supabase/tests/011_customer_self_service.sql`, `015_profile_nickname.sql` (modify) | stop reading the return value; `void`; two shops renamed |
| `src/features/account/api.ts` (modify) | `updateMyProfile` returns nothing |
| `tests/integration/account.test.ts` (modify) | `updateMyProfile` resolves with nothing |
| `tests/e2e/customer-lifecycle.web.spec.ts` (modify) | the mock answers `204` |

---

### Task 1: Recurrence notifications carry their shop (migration 0077, pgTAP 059)

**Files:** `supabase/tests/059_recurrence_notification_shop.sql`, `supabase/migrations/0077_recurrence_notification_shop.sql`

**Interfaces:**
- Produces: `public.add_inbox_event(target_user uuid, target_shop uuid, target_kind text, target_params jsonb, target_key text, push_event text default null) returns void`, `security definer`, `set search_path = pg_catalog, public, pg_temp`, `revoke all … from public`. The old five-argument signature is gone. It inserts the shop into `notifications.shop_id` and adds `shop_id` to the **outbox** payload (`target_params || jsonb_build_object('shop_id', target_shop)`); the inbox `params` stay as given.
- The five callers keep their signatures and behaviour; each now passes the shop it already holds: `request_recurrence` → `bs.shop_id`; `decide_recurrence_request` → `req.shop_id`; `create_recurrence_for_customer` → `bs.shop_id`; `request_series_cancellation` and `decide_series_cancellation` → `series_row.shop_id`.

- [ ] **Step 1: Write the failing pgTAP** `supabase/tests/059_recurrence_notification_shop.sql`:

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

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

select is((select payload ->> 'shop_id' from public.notification_outbox where recipient_user_id = 'f9000000-0000-0000-0000-000000000003' and event_type = 'recurrence.requested'), 'f9100000-0000-0000-0000-000000000001',
  'the push of a recurrence event carries the shop (so it goes to that shop''s own address)');

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

(`plan(17)` matches the assertions above: 2 requested + 1 push payload + 1 accepted + 4 inbox + 2 cancellation requested + 1 declined + 1 cancel accepted + 1 manual + 1 unscoped + 3 function = 17. Run it before the migration: `npx supabase test db supabase/tests/059_recurrence_notification_shop.sql` → FAIL on the shop assertions (the customer's rows have a null shop) on the payload assertion and on the three signature assertions. If the fixture itself errors (a name of a helper differs), fix the fixture until only the assertions fail, copying the pattern of `040_plan_change_cancel.sql`.)

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
    values ('push:' || target_key, push_event, target_user, target_params || jsonb_build_object('shop_id', target_shop))
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

### Task 3: Pushes name the shop (migration 0079, pgTAP 060, dispatcher)

**Files:** `supabase/tests/060_claim_shop_name.sql`, `supabase/migrations/0079_claim_notification_shop_name.sql`, `supabase/functions/dispatch-notifications/messages.ts`, `supabase/functions/dispatch-notifications/dispatch.ts`, `tests/unit/notification-messages.test.ts`, `tests/unit/dispatch.test.ts`

**Interfaces:**
- SQL: `claim_notification_batch(target_limit integer default 50)` returns the same columns as `0073` plus `shop_name text` (right after `shop_slug`); same body with `shops.name` selected; grants: revoked from `public, anon, authenticated`, granted to `service_role`.
- TS: `withShopName(message: { body: string; title: string }, shopName: string | null | undefined): { body: string; title: string }` exported from `messages.ts`: with a non-blank name (trimmed) the result is `{ title: name, body: "<message.title>: <message.body>" }`, except that a message whose title is the brand fallback `"Zenc"` keeps its body (`{ title: name, body: message.body }`); with no name it returns the message unchanged. `ClaimedNotification.shop_name: string | null`. `attempt` in `dispatch.ts` builds `withShopName(buildMessage(event_type, locale, payload), row.shop_name)` once and uses it for the web send and the Expo send.

- [ ] **Step 1: Write the failing tests.**

pgTAP `supabase/tests/060_claim_shop_name.sql`:

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't60-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't60-professional@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't60-customer@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id = 'fa000000-0000-0000-0000-000000000001';
update public.profiles set role = 'professional' where user_id = 'fa000000-0000-0000-0000-000000000003';

insert into public.shops (id, name, slug, owner_user_id)
values ('fa100000-0000-0000-0000-000000000001', 'T60 Studio Bella', 't60-studio-bella', 'fa000000-0000-0000-0000-000000000001');
insert into public.professionals (id, shop_id, name, user_id)
values ('fa300000-0000-0000-0000-000000000001', 'fa100000-0000-0000-0000-000000000001', 'T60 Professional', 'fa000000-0000-0000-0000-000000000003');
insert into public.customers (id, shop_id, user_id, full_name, email)
values ('fa200000-0000-0000-0000-000000000001', 'fa100000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000004', 'T60 Customer', 't60-customer@example.com');
insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('fa400000-0000-0000-0000-000000000001', 'fa100000-0000-0000-0000-000000000001', 'T60 Cut', 30, 3500);
insert into public.professional_services (id, shop_id, professional_id, service_id)
values ('fa500000-0000-0000-0000-000000000001', 'fa100000-0000-0000-0000-000000000001', 'fa300000-0000-0000-0000-000000000001', 'fa400000-0000-0000-0000-000000000001');
insert into public.working_periods (shop_id, professional_id, weekday, start_time, end_time)
select 'fa100000-0000-0000-0000-000000000001', 'fa300000-0000-0000-0000-000000000001', day, '09:00', '18:00' from generate_series(1, 7) as day;

create temporary table t60_dates as select date_trunc('week', current_date + 14)::date as monday;
grant select on t60_dates to authenticated;

-- a recurrence request (staff push) and its acceptance (customer push)
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000001', true);
select public.save_recurrence_plan(null, 'fa400000-0000-0000-0000-000000000001', 1, 2500, 'T60 weekly', true);
select set_config('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000004', true);
select count(*) from public.request_recurrence('fa500000-0000-0000-0000-000000000001', 1, (select monday from t60_dates), '10:00');
select set_config('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000003', true);
select count(*) from public.decide_recurrence_request((select id from public.list_recurrence_requests('fa100000-0000-0000-0000-000000000001') limit 1), true);
reset role;

-- an event with no shop in its payload (like a payout)
insert into public.notification_outbox (event_key, event_type, recipient_user_id, payload)
values ('t60-noshop', 'payout.paid', 'fa000000-0000-0000-0000-000000000004', '{"amount_cents": 100}'::jsonb);

create temporary table t60_claimed as select * from public.claim_notification_batch(100);

select is((select array_agg(distinct shop_name) from t60_claimed where event_type = 'recurrence.requested' and payload ->> 'shop_id' = 'fa100000-0000-0000-0000-000000000001'), array['T60 Studio Bella'],
  'the claim returns the shop name for a recurrence request (staff recipients)');
select is((select array_agg(distinct shop_slug) from t60_claimed where event_type = 'recurrence.requested' and payload ->> 'shop_id' = 'fa100000-0000-0000-0000-000000000001'), array['t60-studio-bella'],
  'and its slug (recurrence pushes now reach the shop''s own address)');
select is((select array_agg(distinct shop_name) from t60_claimed where event_type = 'recurrence.accepted' and payload ->> 'shop_id' = 'fa100000-0000-0000-0000-000000000001'), array['T60 Studio Bella'],
  'the claim returns the shop name for the customer''s "accepted" push');
select is((select count(*)::int from t60_claimed where event_type = 'payout.paid' and payload ->> 'amount_cents' = '100' and shop_name is null and shop_slug is null), 1,
  'an event with no shop has a null name and a null slug');

select is(has_function_privilege('service_role', 'public.claim_notification_batch(integer)', 'execute'), true, 'the dispatcher (service role) can claim');
select is(has_function_privilege('authenticated', 'public.claim_notification_batch(integer)', 'execute'), false, 'signed-in users cannot claim');
select is(has_function_privilege('anon', 'public.claim_notification_batch(integer)', 'execute'), false, 'anonymous users cannot claim');

select * from finish();
rollback;
```

(Before the migration the `select * from claim_notification_batch` temp table has no `shop_name` column: the first assertion errors; that is the red state. Run `npx supabase test db supabase/tests/060_claim_shop_name.sql`.)

Jest, `tests/unit/notification-messages.test.ts`: import `withShopName` and add

```ts
describe("withShopName", () => {
  const booked = (locale: string) => buildMessage("appointment.booked", locale, appointment);

  it.each([["pt", "Agendamento confirmado"], ["en", "Appointment booked"], ["es", "Cita reservada"]])("%s: the shop name is the title and the event title starts the body", (locale, eventTitle) => {
    const plain = booked(locale);

    expect(withShopName(plain, "Studio Bella")).toEqual({ body: `${eventTitle}: ${plain.body}`, title: "Studio Bella" });
  });

  it("matches the example: pt, Corte, 17 Aug 09:00", () => {
    expect(withShopName(booked("pt"), "Studio Bella").body).toMatch(/^Agendamento confirmado: Corte em .+\.$/);
  });

  it.each([[null], [undefined], [""], ["   "]])("keeps today's title and body exactly when the shop name is %p", (name) => {
    expect(withShopName(booked("pt"), name)).toEqual(booked("pt"));
  });

  it("trims the name", () => {
    expect(withShopName(booked("en"), "  Studio Bella ").title).toBe("Studio Bella");
  });

  it("the generic Zenc fallback keeps its body (no 'Zenc: ...' prefix)", () => {
    const unknown = buildMessage("nothing.known", "en", {});

    expect(unknown.title).toBe("Zenc");
    expect(withShopName(unknown, "Studio Bella")).toEqual({ body: unknown.body, title: "Studio Bella" });
  });

  it("works for staff and recurrence events too", () => {
    const staff = buildMessage("staff.awaiting_confirmation", "pt", { customer_name: "Ana", service_name: "Corte", starts_at: "2026-08-17T12:00:00Z" });

    expect(withShopName(staff, "Studio Bella")).toEqual({ body: `Aguardando confirmação: ${staff.body}`, title: "Studio Bella" });
  });
});
```

Jest, `tests/unit/dispatch.test.ts`: the `base` row gains `shop_name: null` (so every existing test keeps its behaviour), and new tests (in the web and Expo describes):

```ts
describe("dispatcher: the shop name is the title", () => {
  it("web: title is the shop name, the event title starts the body, the url is unchanged", async () => {
    const sent: Array<{ body: string; title: string; url: string }> = [];
    const { dispatch } = deps({ sendWeb: async (_subscription, message) => { sent.push(message); return { status: 201 }; } });

    await dispatch([web("a", "https://shop-a.zencpro.app", { locale: "pt", shop_name: "Studio Bella" })]);

    expect(sent[0].title).toBe("Studio Bella");
    expect(sent[0].body).toMatch(/^Agendamento confirmado: Cut em /);
    expect(sent[0].url).toBe("https://shop-a.zencpro.app/appointments");
  });

  it("Expo: the same title and body, and the data still carries the shop id", async () => {
    const sent: Array<{ data: Record<string, unknown>; message: { body: string; title: string } }> = [];
    const { dispatch } = deps({ sendExpo: async (_token, message, data) => { sent.push({ data, message }); return { ok: true }; } });

    await dispatch([expo("T1", { locale: "en", shop_name: "Studio Bella" })]);

    expect(sent[0].message.title).toBe("Studio Bella");
    expect(sent[0].message.body).toMatch(/^Appointment booked: Cut on /);
    expect(sent[0].data).toMatchObject({ shop_id: "s1" });
  });

  it("an event with no shop name keeps today's title on both channels", async () => {
    const web_: string[] = [];
    const expo_: string[] = [];
    const { dispatch } = deps({
      sendExpo: async (_token, message) => { expo_.push(message.title); return { ok: true }; },
      sendWeb: async (_subscription, message) => { web_.push(message.title); return { status: 201 }; },
    });

    await dispatch([expo("T1", { shop_name: null }), web("a", "https://shop-a.zencpro.app", { shop_name: null })]);

    expect(expo_).toEqual(["Appointment booked"]);
    expect(web_).toEqual(["Appointment booked"]);
  });
});
```

(The `expo`/`web` helpers use `base` with `id: "n1"` for both rows; give the third test's two rows different ids (`{ id: "n2", shop_name: null }`) so they are separate notifications.)

Run: `npx jest tests/unit/notification-messages.test.ts tests/unit/dispatch.test.ts` → FAIL (`withShopName` and `shop_name` do not exist; type errors surface in `npm run typecheck`).

- [ ] **Step 2: Migration** `0079_claim_notification_shop_name.sql`, generated from `0073` (the body is copied, two lines added):

```bash
python3 - <<'EOF'
import re

source = open("supabase/migrations/0073_web_push_claim.sql").read()
start = source.index("drop function public.claim_notification_batch(integer);")
end = source.index("grant execute on function public.claim_notification_batch(integer) to service_role;") + len("grant execute on function public.claim_notification_batch(integer) to service_role;")
block = source[start:end]

assert block.count("  shop_slug text,\n") == 1 and block.count("         shops.slug,\n") == 1
block = block.replace("  shop_slug text,\n", "  shop_slug text,\n  shop_name text,\n", 1)
block = block.replace("         shops.slug,\n", "         shops.slug,\n         shops.name,\n", 1)

header = """-- Every push names the shop it comes from (its name becomes the title): the dispatcher needs the shop's name next to its slug.
-- Same function as 0073 (copied), plus shop_name. The return columns change, so it is dropped and created again with the same grants.
"""
open("supabase/migrations/0079_claim_notification_shop_name.sql", "w").write(header + block + "\n")
EOF
```

Check: `diff <(sed -n '/^drop function public.claim_notification_batch/,/^grant execute on function public.claim_notification_batch/p' supabase/migrations/0073_web_push_claim.sql) <(tail -n +3 supabase/migrations/0079_claim_notification_shop_name.sql)` shows exactly two added lines. (The `export_my_data` redefinition that follows in `0073` is **not** copied.)

- [ ] **Step 3: Code** (`supabase/functions/dispatch-notifications/`):

`messages.ts`: next to `UNKNOWN`, `const BRAND_TITLE = "Zenc";` and use it in the unknown fallback (`title: BRAND_TITLE`); then export

```ts
// A push names the shop it comes from: the shop's name is the title and the event title moves to the start of the body ("Studio
// Bella" / "Agendamento confirmado: Corte em ..."). With no shop name (an event whose payload has no shop) the message is unchanged.
export function withShopName(message: { body: string; title: string }, shopName: string | null | undefined) {
  const name = typeof shopName === "string" ? shopName.trim() : "";

  if (!name) return message;

  return { body: message.title === BRAND_TITLE ? message.body : `${message.title}: ${message.body}`, title: name };
}
```

`dispatch.ts`: `import { buildMessage, withShopName } from "./messages.ts";`, add `shop_name: string | null;` to `ClaimedNotification` (after `shop_slug`), and in `attempt` build the message once:

```ts
    const message = withShopName(buildMessage(row.event_type, row.locale, row.payload), row.shop_name);
```

used by the web branch (`body: message.body, title: message.title, url`) and by the Expo branch (`deps.sendExpo(row.expo_push_token, message, row.payload)`). (Today `buildMessage` is called inside each branch: hoist it above the `if (row.web_subscription)`.)

- [ ] **Step 4: Apply and run**

```bash
npx supabase migration up
npx supabase test db supabase/tests/060_claim_shop_name.sql supabase/tests/059_recurrence_notification_shop.sql supabase/tests/055_web_push_claim.sql supabase/tests/012_notification_locale.sql supabase/tests/009_notifications.sql
npx jest tests/unit/notification-messages.test.ts tests/unit/dispatch.test.ts tests/unit/notification-path.test.ts tests/unit/dispatch-auth.test.ts
npm run typecheck
npm run lint
```

Expected: PASS (055 and 012 are among the known seed-count failures locally; judge them on the assertions about the claim, and rely on CI's clean database for the rest). `rtk grep -rn "claim_notification_batch" src supabase/functions tests` lists the other consumers: only `index.ts` (typed as `ClaimedNotification[]`, no change needed).

- [ ] **Step 5: Commit**

```bash
git add supabase src tests
git commit -m "feat(push): every push names its shop, recurrence pushes reach the shop's own address" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Final gate and handoff

- [ ] **Step 1:** `npm run typecheck; echo typecheck_exit=$?`, `npm run lint; echo lint_exit=$?` (read the output), `npx jest --runInBand` (read `Test Suites:`), all pgTAP files named in Tasks 1 to 3 plus the whole `npx supabase test db` run (the failures of `010`, `012`, `016`, `055` are the known seed-count ones; anything else is ours), **re-run after the last commit**. Playwright: `customer-lifecycle` and the whole suite if time allows.
- [ ] **Step 2:** Report: commits, gate results, anything unexpected. Push and the single PR against `main` only when told to (stacking is not needed: both tasks are independent of other open branches).
