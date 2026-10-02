# Orphan Customers Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Steps use checkbox syntax.

**Goal:** A barber booking for a new customer creates the customer and the appointment in one transaction, and a double tap books once, so failed or repeated taps leave no orphan customers.

**Architecture:** New RPC `barber_book_new_customer` wraps the existing `barber_find_or_create_customer` and `book_appointment_internal` in one function (one transaction). `bookAsBarber` uses it for new customers and keeps `book_appointment` for existing ones. `BarberBookingSheet` gets a ref-based in-flight guard.

**Tech Stack:** Postgres/pgTAP (Supabase), TypeScript, Jest + Testing Library.

**Spec:** Design approved in chat 2026-10-02 (no spec file; bounded change).

## Global Constraints

- Strict TDD: failing test first. Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Never delete the user's existing "Vieira" orphan rows. Run Jest with `--forceExit`; lint with `npx eslint app src tests`.

---

### Task 1: Atomic RPC (migration 0040 + pgTAP 024)

**Files:**
- Create: `supabase/migrations/0040_barber_book_new_customer.sql`, `supabase/tests/024_barber_book_new_customer.sql`

**Interfaces:**
- Produces: `public.barber_book_new_customer(target_barber_service_id uuid, target_starts_at timestamptz, target_name text, target_email text default null, target_phone text default null, target_notes text default null) returns setof public.appointments`

- [ ] **Step 1:** Write pgTAP 024 (fixture mirrors 017: owner, barber, customer-less shop, service, barber_service, working_periods 00:00-23:59 all weekdays). Cases: (1) booking creates exactly one customer and one appointment; (2) a booking in an already-taken slot throws `P0001` and the customer count is unchanged (the regression); (3) same email reuses the customer; (4) non-barber gets `P0008`; (5) another barber's service is rejected (`P0008`) and leaves no customer.
- [ ] **Step 2:** `npx supabase test db` → 024 fails (function missing).
- [ ] **Step 3:** Create the migration:

```sql
create function public.barber_book_new_customer(
  target_barber_service_id uuid,
  target_starts_at timestamptz,
  target_name text,
  target_email text default null,
  target_phone text default null,
  target_notes text default null
)
returns setof public.appointments
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  customer uuid;
begin
  select f.id into customer from public.barber_find_or_create_customer(target_name, target_email, target_phone) f;

  -- Same transaction: if the booking raises, the customer insert above is rolled back with it.
  return query
  select * from public.book_appointment_internal(
    target_barber_service_id, customer, target_starts_at, 'barber', target_notes, null, null, null
  );
end;
$$;

revoke all on function public.barber_book_new_customer(uuid, timestamptz, text, text, text, text) from public, anon;
grant execute on function public.barber_book_new_customer(uuid, timestamptz, text, text, text, text) to authenticated;
```

- [ ] **Step 4:** `npx supabase migration up && npx supabase test db` → 024 passes; only the known 010 failures remain.
- [ ] **Step 5:** Commit.

### Task 2: Client uses the RPC for new customers

**Files:**
- Modify: `src/features/appointments/barber-booking.ts` (`bookAsBarber`)
- Test: `tests/integration/barber-booking.test.ts`

**Interfaces:**
- Consumes: Task 1 RPC.

- [ ] **Step 1:** Replace the test "books for a new customer: find-or-create, then book" with: calls `barber_book_new_customer` exactly once with `{ target_barber_service_id, target_starts_at, target_name, target_email, target_phone, target_notes }`, never `barber_find_or_create_customer`, returns the appointment; plus a test that a `P0001` error becomes `SLOT_UNAVAILABLE`.
- [ ] **Step 2:** Run `npx jest tests/integration/barber-booking.test.ts --forceExit` → fails.
- [ ] **Step 3:** In `bookAsBarber`, for `customer` without `id`: `const parsed = parseBarberCustomerInput(input.customer);` then `supabase.rpc("barber_book_new_customer", {...})`, throw `toDomainError(error)` on error, take `Array.isArray(data) ? data[0] : data`, throw `toDomainError({ code: "unknown" })` when empty, return `toAppointment(row as AppointmentRow)` (import both from `./api` — export them if not already). Keep the `{ id }` branch unchanged.
- [ ] **Step 4:** Test passes. Commit.

### Task 3: Double-tap guard in the sheet

**Files:**
- Modify: `src/components/domain/BarberBookingSheet.tsx` (`confirm`)
- Test: `tests/unit/barber-booking-sheet.test.ts`

- [ ] **Step 1:** Test: type a name, press confirm twice synchronously → `onSubmit` called once; after rerender with `busy` true then false, pressing confirm submits again.
- [ ] **Step 2:** Run it → fails (called twice).
- [ ] **Step 3:** Add `const inFlight = useRef(false);`, `useEffect(() => { if (!busy) inFlight.current = false; }, [busy]);`, reset it in the existing `visible` effect, and in `confirm`: `if (!canConfirm || !selected || inFlight.current) return; inFlight.current = true;`.
- [ ] **Step 4:** Test passes. Commit.

### Task 4: Verify and ship

- [ ] `npm run typecheck`, `npx eslint app src tests`, `npm test -- --runInBand --forceExit`, `npx supabase test db` (only known 010 failures).
- [ ] Run `code-review`, fix findings, push branch, open PR (Portuguese body) via `gh api`.
