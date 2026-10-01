# Stale Slot After Booking Conflict Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a failed book/reschedule, clear the selected slot and refetch `available-slots`; after a successful reschedule, also refetch `available-slots`.

**Architecture:** Inline edits to the two mutation handlers. `["available-slots"]` is a prefix of the key built in `getAvailableSlotsQueryOptions`, so one `invalidateQueries` covers every barber/date/service. No new helpers.

**Tech Stack:** React Query, Expo Router, Jest (source-text assertions, as screens are not rendered in unit tests).

**Spec:** design approved in chat (bounded path, no spec file).

## Global Constraints

- Invalidate on every error, not only on "slot taken" errors.
- No new abstraction or helper.

---

### Task 1: Booking and reschedule handlers

**Files:**
- Modify: `app/(customer)/(tabs)/book/review.tsx` (`booking` mutation `onError`)
- Modify: `app/(customer)/reschedule.tsx` (`reschedule` mutation `onError` and `onSuccess`)
- Test: `tests/unit/stale-slot-recovery.test.ts`

**Interfaces:**
- Consumes: `setStartsAt`, `queryClient` already in scope in both screens.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test** in `tests/unit/stale-slot-recovery.test.ts` that reads both screen sources and asserts the `onError` block of each contains `setStartsAt(null)` and `invalidateQueries({ queryKey: ["available-slots"] })`, and that reschedule's `onSuccess` block contains the invalidation.
- [ ] **Step 2: Run** `npx jest tests/unit/stale-slot-recovery.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the edits listed above.
- [ ] **Step 4: Run the test again.** Expected: PASS.
- [ ] **Step 5: Run** `npm run typecheck && npm run lint && npx jest`.
- [ ] **Step 6: Commit.**
