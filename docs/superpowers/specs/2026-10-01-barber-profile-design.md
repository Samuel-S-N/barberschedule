# Barber profile hub and service selection — design

Date: 2026-10-01. Second of three barber-side specs (1: booking from the agenda, PR #20; 3: reports with charts). Stacked on `feat-barber-booking` (migration numbering continues at 0035).

## Goal

The barber's Profile tab becomes a hub in the same shape as the customer's (avatar, name, email, menu blocks, sign out) with barber additions: **my services** (choose which optional services I perform), **compensation** (read-only) and **my details** (photo, bio, email). The shop owner defines services, prices and durations, and marks which services are **standard** (every barber performs them) or **optional**.

## Decisions (agreed with the user)

- The owner creates services. A service is **standard** (`services.is_standard`, set by the owner) or optional. Standard services are active for every barber automatically and the barber cannot turn them off. Optional services are turned on/off by the barber.
- Duration **and price** are the shop's: the barber never edits them (the owner's existing per-barber overrides keep working and are only displayed).
- Out of scope: working hours / time off (the agenda already blocks time), Privacy (export/delete is a customer flow; owners archive barbers), editing the display name (owner-defined), refactoring the owner services screen beyond one toggle.

## Backend (migration `0035_standard_services.sql`)

1. `alter table services add column is_standard boolean not null default false`. No data changes until the owner marks one.
2. Fan-out triggers (`security definer`, `search_path = pg_catalog, public, pg_temp`):
   - `services` after insert / update of `is_standard, active`: when `is_standard and active`, upsert an **active** `barber_services` row (`archived_at = null`) for every active barber of the shop (`on conflict (shop_id, barber_id, service_id) do update`).
   - `barbers` after insert / update of `active`: when the barber is active, upsert active rows for every active standard service of the shop.
3. `list_my_service_options() returns table (service_id uuid, service_name text, description text, duration_minutes int, price_cents int, is_standard boolean, enabled boolean)`: every active service of my shop; `duration_minutes`/`price_cents` use the owner's override when present; `enabled = is_standard or (barber_services.active)`. Errors: `P0019` not a linked barber.
4. `set_my_service_enabled(target_service_id uuid, new_enabled boolean) returns table (service_id uuid, enabled boolean)`: only the caller's own barber row; the service must be active in the caller's shop (`P0004 SERVICE_UNAVAILABLE`); a standard service raises `P0026 SERVICE_STANDARD_LOCKED`; otherwise upsert `barber_services` with `active = new_enabled` and `archived_at` set/cleared to satisfy `barber_services_archive_matches_active`. Existing appointments are untouched (they snapshot the service).
5. Grants: `authenticated` only, revoked from `public, anon`.

## Front

Routes under `app/(barber)/my-profile/` (the tab keeps the name `my-profile` and owns a Stack; `/me/*` belongs to the customer group and the route-collision test forbids duplicates):

| Route | Content |
| --- | --- |
| `index.tsx` | Hub: `Avatar`, name, email, `MenuBlock`s, sign out. Blocks: [My details, Security] [My services, Compensation] [Settings, About]. |
| `account.tsx` | Photo upload (reuses `set_my_avatar`, then syncs `barbers.avatar_url` with the public URL so public cards show it), bio, email change; the display name is read-only. |
| `services.tsx` | All shop services: standard ones locked with a "Standard" badge, optional ones with a switch; duration and price read-only. |
| `compensation.tsx` | Commission % or chair rental (amount and frequency), read-only. |
| `security.tsx`, `settings.tsx` | Own small screens (they navigate by absolute path); settings has only Language. |
| `security/password.tsx`, `language.tsx`, `about.tsx` | Re-export the customer screens (no hard-coded paths). |

The old `app/(barber)/my-profile.tsx` form is removed; the bio moves to `account.tsx`.

- `src/features/barbers/api.ts`: `listMyServiceOptions`, `setMyServiceEnabled` (the photo sync reuses `updateMyBarberProfile`).
- Owner side: `Service.isStandard`, `setServiceStandard`, and one toggle button per service in `app/(owner)/services.tsx`.
- New error code `SERVICE_STANDARD_LOCKED` (`P0026`), strings in en/es/pt (the locale-parity test applies).

## Testing

- pgTAP `020_standard_services.sql`: marking a service standard activates it for all active barbers (including previously disabled ones); a new barber inherits standard services; a barber turns an optional service off/on; standard cannot be turned off (`P0026`); a barber cannot touch another shop/barber's rows; customers cannot call the RPCs; inactive services are not listed; unmarking standard leaves rows active.
- Jest: API mappers, error mapping, owner `setServiceStandard`, route-collision test stays green, compensation formatting.
- Playwright (REST mocked): hub renders and navigates, bio save, optional toggle, standard locked, compensation read-only.
- Browser check with screenshots and computed CSS against the local barber (`barber@teste.com`).
