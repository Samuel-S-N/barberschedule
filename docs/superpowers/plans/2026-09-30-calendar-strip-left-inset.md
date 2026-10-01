# Calendar strip left alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** The day carousel's first day aligns with the screen's 20px content edge (title, buttons, cards) instead of sitting 40px in.

**Architecture:** Remove the extra `px-safe-horizontal` on the strip's inner row in `CalendarStrip`. Both screens that use it (customer and barber agenda) already wrap it in a `p-5` column, so the padding was doubled.

**Tech Stack:** React Native, NativeWind, jest, playwright.

**Spec:** design approved in chat 2026-09-30 (bounded path).

## Global Constraints

- Branch `feat-agenda-all-upcoming` (PR #10). Verify in a browser: screenshot + measured `left` of the first day vs. the title.

---

### Task 1: Drop the doubled inset

**Files:** Modify `src/components/domain/CalendarStrip.tsx:20`; Test `tests/unit/calendar-strip.test.ts`

- [ ] Step 1: Add `testID={testID ? `${testID}-row` : undefined}` to the inner row `View`, and a test that renders with `testID: "strip"` and asserts `view.getByTestId("strip-row").props.style` (flattened) has no `paddingHorizontal`/`paddingLeft`.
- [ ] Step 2: `rtk npx jest tests/unit/calendar-strip.test.ts` → FAIL (padding present).
- [ ] Step 3: Remove `px-safe-horizontal` from the row's className.
- [ ] Step 4: jest → PASS; `rtk npx tsc --noEmit`; full jest.
- [ ] Step 5: Browser check: e2e screenshot, measure strip first day `left` equals title `left`. Commit, push.
