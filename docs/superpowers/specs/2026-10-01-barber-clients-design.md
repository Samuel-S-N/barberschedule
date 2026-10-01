# Barber clients and day summary — design

Date: 2026-10-01. Fourth barber-side spec (1: booking #20, 2: profile hub #21, 3: reports #22). Stacked on `feat-barber-reports` (migration numbering continues at 0037; a parallel fix for orphan customers may also add a migration, in which case renumber).

## Goal

1. **My clients**: the barber's own clientele — who they are, how often they come, who stopped coming — with one-tap WhatsApp/call and a private note per client.
2. **Day summary**: a card at the top of the Agenda for the selected day: how many appointments, who is next, how many free times are left, and what the barber has earned so far.

## Decisions (agreed with the user)

- "My clients" is a 4th bottom tab (`clients`), a Stack: list → detail.
- A client is a customer of the barber's shop who has at least one appointment with this barber **or** was created by this barber. Nothing else is visible (same rule as the booking search).
- **Lapsed** = last completed visit more than 45 days ago and no upcoming appointment (fixed constant in the app).
- Client detail: contact (WhatsApp, call), visits, last visit, next appointment, cancelled, no-shows, favourite service, history of the last 20 appointments (date, service, status — **no money**), and a **private note** (max 500 characters) that only this barber can read or write.
- Day summary uses data the agenda already loads (appointments, free slots) plus the day's earnings from `get_my_barber_report`; no new RPC.
- Out of scope: rebooking from the client detail, automatic reminders/notifications, owner-side client reports.

## Backend (migration `0037_barber_clients.sql`)

- Table `barber_customer_notes (barber_id, customer_id, note, updated_at)`, primary key `(barber_id, customer_id)`, `note` 1-500 chars, cascades on delete. RLS enabled with **no policies** and no grants: access only through the RPCs below.
- `is_my_client(target_customer_id) returns boolean` (security definer, stable): active barber of the caller, active non-anonymized customer of the same shop, with an appointment with that barber or `created_by_barber_id` = that barber.
- `list_my_customers(search text default null, only_lapsed boolean default false, lapsed_days integer default 45, page_limit integer default 50, page_offset integer default 0)` → `customer_id, full_name, phone, email, has_account, visits, last_visit_at, next_visit_at, is_lapsed`. `visits` counts completed appointments with the caller; `next_visit_at` is the earliest future scheduled/confirmed one; search matches name, email or phone digits; ordered by last visit (newest first, never-visited last), then name. `page_limit` 1-100, offsets ≥ 0, `lapsed_days` ≥ 1 (else `P0014`).
- `get_my_customer(target_customer_id) returns jsonb`: `{ customer, stats, note, history }` (stats: visits, cancelled, no_show, last_visit_at, next_visit_at, favorite_service by completed count then name; history: last 20 with id, starts_at, service_name, status). Not a client of the caller → `P0007`.
- `set_my_customer_note(target_customer_id, new_note) returns void`: upsert; blank deletes; over 500 characters → `P0028` (`CUSTOMER_NOTE_INVALID`); not a client → `P0007`.
- Errors: `P0019` not a linked active barber. Grants: `authenticated` only.

## Front

- `src/features/clients/api.ts` (`listMyClients`, `getMyClient`, `setMyClientNote`), `src/features/clients/format.ts` (`LAPSED_DAYS`, `daysSince`, `whatsappUrl`, `telUrl`; Brazilian numbers get the `55` prefix when it is missing).
- `app/(barber)/clients/{_layout,index,[id]}.tsx` and the tab (`Users` icon) in `app/(barber)/_layout.tsx`. List: search field, filter buttons All | Lapsed, rows with `Avatar`, name, "Last visit {date}" (or "No visits yet"), visits, a "Lapsed" badge and "No account" hint. Detail: header with avatar, contact buttons, stat tiles, history card, note editor.
- `src/features/appointments/day-summary.ts` (pure `buildDaySummary`) and `src/components/domain/DaySummaryCard.tsx`, inserted under the calendar strip in `my-agenda.tsx`: Appointments (and how many done), Next (time and customer), Free times, Earned so far (only for today and past days).
- New error code `CUSTOMER_NOTE_INVALID`; strings in en/es/pt (no plural forms: counts are shown as `Label: N` so the locale-parity test stays simple).

## Testing

- pgTAP `022_barber_clients.sql`: scope (own clients only, created-only clients included, other barber's excluded), ordering, visits and next visit, lapsed rule incl. the upcoming-appointment exception, only-lapsed filter, search by name and phone, detail stats/history/favourite service, note set/clear/too long, isolation between barbers, customer role rejected.
- Jest: `format` (WhatsApp normalisation, days since), API mappers and error mapping, `buildDaySummary`, `DaySummaryCard`.
- Playwright (REST mocked): clients tab list/search/filter, detail with note save and WhatsApp link, agenda summary card.
- Browser check against the local barber with throwaway data (created and deleted afterwards).
