# Profile photo fix, phone mask and nickname — plan

> Follow-up to `2026-09-30-customer-profile.md` (PR #7). Bounded changes, executed inline with TDD.

**Goal:** (1) make the uploaded avatar actually display, (2) show phones as `(11)91234-5678`, (3) let the customer set "how they want to be called".

## Global constraints

- Phone display format is exactly `(DD)NNNNN-NNNN` (11 digits) or `(DD)NNNN-NNNN` (10 digits), no space after `)`. Input may be raw digits, formatted, or `+55 …`; the formatted value is what is saved (still matches the DB rule `^[0-9+()\s-]{8,20}$`).
- All copy in pt, en, es. No `#hex` in JSX. Commit trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- New migration `0028` (0027 is already pushed in the open PR); apply with `supabase migration up`, never `db reset` (it wipes the local test user).

## Diagnosis (photo)

The stored object is 14 bytes (`image/jpeg`). `fetch(uri).arrayBuffer()` does not return the real bytes on React Native (it works on web, so e2e missed it). Fix: take the bytes from `ImageManipulator` itself (`base64: true`), decode with `atob`, refuse anything under 1 KB, and make `Avatar` fall back to the initial when the image fails to load.

## Task A — phone mask

- Create `src/features/account/phone.ts` with `formatPhone(input: string): string` (digits only, drop a leading `55` when more than 11 digits, cap at 11, progressive mask: `(1`, `(11`, `(11)9123`, `(11)9123-4`, `(11)1234-5678`, `(11)91234-5678`).
- Test `tests/unit/phone.test.ts` first (empty, raw digits 10 and 11, already formatted, `+55 11 90000-0000`, progressive typing, extra digits ignored).
- Use it as the `onChangeText` transform and on load in `app/(customer)/me/account.tsx` and in the phone field of the signup screen.

## Task B — photo

- `avatar.ts`: add `base64ToArrayBuffer(b64: string): ArrayBuffer` and `AVATAR_MIN_BYTES = 1024`; test in `tests/unit/avatar.test.ts` (`"AQID"` → bytes 1,2,3).
- `account.tsx`: `manipulateAsync(..., { base64: true })`, bytes from `small.base64`, reject below `AVATAR_MIN_BYTES` with the existing photo error.
- `Avatar.tsx`: `useState` failed flag (reset when `uri` changes) and `onError` on `Image`; show the initial when failed. Test in `tests/unit/profile-components.test.ts`.

## Task C — nickname

- `supabase/migrations/0028_profile_nickname.sql`: `profiles.nickname text` (check: null or 1–30 chars after trim); drop `update_my_profile(text, text)` and recreate `update_my_profile(p_full_name text, p_phone text, p_nickname text default null)` that also sets `profiles.nickname = nullif(btrim(p_nickname), '')` and raises `P0017` when longer than 30. Test `supabase/tests/015_profile_nickname.sql` (saved, blank clears, 31 chars rejected, 2-argument call still works).
- `auth/types.ts` + `auth/api.ts`: `Profile.nickname`. `account/api.ts`: `updateMyProfile` input `nickname` → `p_nickname`; update `tests/integration/account.test.ts` and the e2e payload assertion.
- `account.tsx`: optional input "how you want to be called", saved with the rest. Home greets `nickname ?? first word of full name`; hub header shows `nickname ?? full name`.
- i18n keys `profile.account.nickname` (pt/en/es). e2e: a profile with nickname greets by it.

## Task D — verify

typecheck, lint, Jest, `npm run test:db`, e2e (with `.env.local` aside), then push to PR #7 and check on the phone that the new upload is larger than 1 KB in `storage.objects`.
