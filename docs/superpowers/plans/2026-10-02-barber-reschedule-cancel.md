# Barber Reschedule / Cancel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline).

**Goal:** A barber can cancel or move an existing appointment of their own, with no 90-minute lock (same as the owner). The customer is notified by the existing appointment trigger (`appointment.cancelled` / `appointment.rescheduled`).

**Architecture:** Migration 0041 replaces `cancel_appointment` and `reschedule_appointment` so the actor may also be the active barber that owns the appointment. UI reuses `cancelAppointment` / `rescheduleAppointment` from `lifecycle.ts`: agenda cards get Cancel (two-tap confirm) and Move (pick a free slot).

**Tech Stack:** Postgres/pgTAP, Expo Router, Jest, Playwright (mocked REST).

**Spec:** Decisions taken in chat 2026-10-02: barber branch behaves like owner (no lock, no daily limit); notification via existing trigger; no new RPC.

## Global Constraints

- Strict TDD; commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; `npx eslint app src tests`; Jest `--forceExit`.
- i18n keys added to `en.ts`, `es.ts`, `pt.ts` (types.ts follows en).

### Task 1: Barber branch in the RPCs
**Files:** Create `supabase/migrations/0041_barber_lifecycle.sql`, `supabase/tests/025_barber_lifecycle.sql`
- [ ] Write pgTAP 025: own barber cancels an appointment starting in 30 min (no lock); own barber reschedules it; another barber gets `P0010`; customer still locked (`P0011`) inside 90 min; a cancelled row is `cancelled`.
- [ ] Run → fails (barber gets P0010).
- [ ] Migration: copy both functions from 0014, add `barber_actor boolean := exists (select 1 from public.barbers b where b.id = target.barber_id and b.user_id = actor_id and b.active)` after the lookup, and use `staff_actor := owner_actor or barber_actor` wherever `owner_actor` gated forbidden / lock / daily limit.
- [ ] Run → passes. Commit.

### Task 2: Agenda UI
**Files:** Modify `app/(barber)/my-agenda.tsx`, `src/i18n/locales/{en,es,pt}.ts`; Test `tests/e2e/barber-side.web.spec.ts`
- [ ] Add keys `barber.agenda.{cancelAppointment,cancelConfirm,move,moving,moveCancel,cancelled,moved}`.
- [ ] E2E tests (mocked REST): cancel needs two taps and calls `cancel_appointment` with `appointment_id`; Move then tapping a free slot calls `reschedule_appointment` with `appointment_id` and `new_starts_at`; a slot error shows the message.
- [ ] Implement: state `confirmCancelId`, `moveId`; mutations `cancel` and `move` (invalidate `barber-agenda`, `barber-slots`, `barber-report`); free slot `onPress` → `moveId ? move.mutate(slot.startsAt) : setBookingSlot(slot)`; a card shown while moving.
- [ ] Run e2e via `npm run test:e2e:web` (only the 4 known date failures allowed). Commit.

### Task 3: Ship
- [ ] typecheck, eslint, jest, test:db; review; push; PR (base = previous branch).
