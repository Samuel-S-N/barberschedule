# 011 — Customer self-service and LGPD

**Date:** 2026-09-23
**Status:** Accepted

## Context

A newly signed-up account could not book: booking requires a `customers` row bound to the account, and no policy, RPC or trigger created one (customers only had owner-insert and self-select policies). The architecture also forbids auto-associating an account with an existing customer by email or phone. The customer product also needs LGPD rights: consent, portability, erasure.

## Decisions

- **`ensure_my_customer()`** (security definer, no parameters) idempotently creates the caller's `customers` row in the single shop, reading name from the profile and phone / `accepted_terms_version` from the caller's own `auth.users.raw_user_meta_data` (set at signup). It never matches existing rows by email or phone, and rejects non-customers and anonymous callers with `42501`. A unique index on `(shop_id, user_id)` guards races.
- **Consents** live in `public.consents(user_id, kind, version, accepted_at)`, written only by `ensure_my_customer()` (no direct insert grant); users can select only their own rows. `user_id` is `on delete set null`, so acceptance records survive account deletion anonymously (LGPD art. 16 I, compliance with a legal obligation).
- **`update_my_profile`** updates `profiles` and the linked customer row together; invalid input raises `P0017`.
- **`export_my_data()`** returns one JSON document scoped to `auth.uid()`: profile, customer rows, all appointments (including history), recurrence series, consents, and notification tokens (only the last 6 characters of each token).
- **Deletion** = `prepare_account_deletion()` (anonymize the customer row: name `Cliente removido`, email/phone/user_id cleared, `anonymized_at` set, archived) followed by deleting the auth user in the `delete-account` Edge Function (service role, authenticated caller only). It is **blocked** (`P0018`) while the customer has an upcoming scheduled/confirmed appointment or an active recurrence series. Appointment rows and snapshots are retained for the shop's records.
- **Routing:** the customer agenda tab is `/appointments` (not `/agenda`, which the owner already uses). `app/legal.tsx` sits outside role groups so it is reachable signed out and signed in. `resolveAuthRedirect` maps groups to roles through one table.

## Known limitations / open items

- `appointments.notes` is free text and is retained as written after anonymization; redact on request until a policy exists.
- The legal text in `src/features/account/legal.ts` is a factual summary of current data practice, not legal advice; the shop owner / counsel must review it and bump `TERMS_VERSION` when it changes.
- The `delete-account` Edge Function has no automated test (no Deno runner in the repo). Its contract is covered by the client tests and the RPC by pgTAP.
- Whether Supabase email confirmation is enabled differs per environment; signup handles both.
- Deletion cannot be undone; there is no grace period.
