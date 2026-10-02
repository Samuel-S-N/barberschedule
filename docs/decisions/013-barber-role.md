# Decision 013: Barber role, compensation and earnings report

Date: 2026-09-29
Status: accepted

## Decision

- `profile_role` gains `barber`. A barber account exists only through the owner-only `invite-barber` Edge Function (service role). It creates the auth user through the Admin invite endpoint, links `barbers.user_id` (guarded by `user_id is null`; on a lost race the invited user is deleted) and only then promotes `profiles.role`. `handle_new_auth_user` is unchanged and never reads a client-supplied role, so public signup cannot claim a barber row.
- Every barber-scoped RPC (`list_my_barber_agenda`, `set_my_appointment_status`, `get_my_barber_profile`, `list_my_barber_services`, `update_my_barber_profile`, `get_my_barber_earnings`) derives the barber from `auth.uid()` against the caller's own **active** `barbers` row; none accepts a barber or shop id. No linked active row raises `P0019`, so a deactivated barber is locked out at the database.
- Barbers read and write their own profile only through RPCs; there are no barber `select/update` policies on `barbers` (its column grants stay owner/public only). The only direct-table access is `schedule_overrides`: a barber may select their own rows and insert/delete their own `block` rows, never `opening` rows.
- Compensation lives on `barbers`: `commission` (one flat percent) or `chair_rental` (amount + weekly/monthly), enforced by a check constraint. Owners change it through `set_barber_compensation` (owner-only, `P0021` on an inconsistent payload). Per-service commission is deferred.
- Earnings are a report only. `get_my_barber_earnings` returns per-service counts and gross (sum of `service_price_cents_snapshot`, so special recurrence prices count) for `completed` appointments in a shop-local range of at most 92 days (`P0022`). `calculateBarberEarnings` derives the display value client-side: commission is a percent of gross; chair rental keeps the full gross and shows the rent separately, never netted against an arbitrary range. No payment is processed.
- Availability stays shop-level; a barber only blocks time inside it.
- Routing: `(barber)` group with `/my-agenda`, `/earnings`, `/my-profile` (`/agenda` and `/profile` are owned by the owner and customer groups; `route-collisions.test.ts` guards this). `resolveAuthRedirect` sends a barber who lands in another group straight to `/my-agenda`, because `/` is also an owner route and would leave the barber stuck in the owner group.

## Consequences and limits

- The invite Edge Function has no automated test (no Deno runner). It could not be run end to end here: the local stack has no SMTP (GoTrue answered `Error sending invite email`, after proving the `/invite` route exists) and the Edge runtime image could not be pulled. Its database-side effects (link, promotion, uniqueness, lockout) are covered by pgTAP; the HTTP orchestration needs one manual run on a stack with SMTP.
- New pgTAP `013_barber_role.sql` (37 assertions) covers isolation between barbers, owner/anonymous/unlinked denial, transitions, own blocks (no openings, no other barber), profile validation, earnings bounds and grouping, compensation constraints and owner-only RPCs.
- Web E2E mocks Supabase REST, as in earlier cycles; it proves navigation, payloads and calculations, not live Auth/RLS.
- A deactivated barber signing in sees the "not linked to an active barber" message on the barber layout; there is no dedicated offboarding screen.
- Owner screens are still unstyled raw React Native; the new invite/compensation controls follow that screen's existing style, and the rent amount is entered in cents like service prices.
- Avatar is a URL field; no image upload exists in the app.

## Update: earnings RPC removed (migration 0045)

`get_my_barber_earnings` and the client-side `calculateBarberEarnings` were replaced by `get_my_barber_report` (reports tab). The old RPC had no remaining caller and was dropped.
