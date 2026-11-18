Decision: Path B (hand-written chunked cookie storage on `createClient`, implicit flow, legacy localStorage fallback)

# Spike: Supabase session in cookies on the static web export (multi-shop part 1)

Date: 2026-11-18. Question: can `@supabase/ssr` `createBrowserClient` (0.12.7, with supabase-js 2.112.3) carry the web session in cookies shared across `*.zencpro.app`, or do we write our own storage adapter?

## Result for Path A (`@supabase/ssr`): NO-GO

Check 3 of the plan (the flow type can stay `implicit`) fails, which by the plan's own rule rules A out:

- Source, `node_modules/@supabase/ssr/dist/main/createBrowserClient.js`: the `auth` options are built as `{ ...options.auth, ..., flowType: "pkce", ... }`, so `flowType: "pkce"` is written **after** the caller's spread and always wins.
- Runtime confirmation (`node -e`): `createBrowserClient(url, key, { auth: { flowType: "implicit" } }).auth.flowType` prints `pkce`.
- Consequence: a password-reset or invite link opened in a browser other than the one that requested it (typical for phone e-mail apps) has no PKCE code verifier and fails. The orchestrator's answer to Q5/Q7 requires the implicit flow.
- Secondary: the library also ignores a custom `auth.storage` and "always manages the session via cookies" (it warns about it), so there is no way to keep reading a legacy `localStorage` session. That would force editing the 36 e2e specs that seed `localStorage["sb-example-auth-token"]`.

The other checks (cookie size, native bundle, reload persistence) were not run for A: one failed check is enough for no-go and a working version would still need the options above.

## Path B

`createClient` with a custom `auth.storage` that keeps the session in numbered cookie chunks (`<key>.0`, `<key>.1`, ...), `Domain` from `EXPO_PUBLIC_AUTH_COOKIE_DOMAIN`, `Secure` over https, `SameSite=Lax`, and that falls back to reading the legacy `localStorage` key. supabase-js keeps its default (implicit) flow. Native keeps SecureStore. Verified in Task 12 (unit tests for the adapter) and in the real browser check at the end of the part.
