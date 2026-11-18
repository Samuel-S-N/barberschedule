# Shop resolution (multi-shop, part 1) — design

Date: 2026-11-18
Status: draft, waiting for the user's review

## Why

Goal: at least 10 businesses on Zenc by the end of 2026, launched web-first (PWA, no app stores yet).
The database is already split per business (`shop_id` on professionals, customers, services, appointments,
hours, payouts), but the app and one SQL function still assume a single shop. A second business today would be
invisible or mixed up with the first. This part makes the app know which business it is showing.

This is part 1 of 4. Part 2 creates businesses and invites owners (script, structured address with CEP),
part 3 is the installable web app, part 4 is web push. Hosting is a parallel track on the user's accounts.

## Decisions (taken with the user on 2026-11-18)

- Each business lives at `<slug>.zencpro.app`, e.g. `barbeariadojoao.zencpro.app` (decision 015 already planned it).
- Customers reach a business by its own link or QR code. A directory of all businesses (location, search) comes
  later and links to the subdomains.
- One customer account works in every business: the login session is shared across `.zencpro.app`.
- The installed app is always named "Zenc"; nothing per-shop in the manifest.

## Scope

### 1. `shops.slug`

- New column `slug text not null unique`, migration `0067_shop_slug.sql`. The existing seed/dev shops get a slug in
  the same migration.
- Format: 3 to 32 characters, lowercase letters, digits and hyphens, no hyphen at either end
  (`^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$`).
- Reserved names cannot be used: `www`, `app`, `api`, `admin`, `zenc`, `mail`, `email`, `smtp`, `static`, `assets`,
  `cdn`, `docs`, `help`, `support`, `status`, `blog`, `dev`, `staging`, `test`, `login`, `auth`. A check constraint
  holds the list; adding a name later is a migration.
- The slug is publicly readable (same column grant as `name`). Only part 2's create function sets it; the owner
  cannot change it (it is printed on QR codes).

### 2. Resolving the current shop (client)

- One pure function `resolveShopSlug(host, baseDomain)` returns the slug or `null`:
  `barbeariadojoao.zencpro.app` → `barbeariadojoao`; `zencpro.app`, `www.zencpro.app`, `app.zencpro.app`, reserved
  names and other hosts → `null`.
- `baseDomain` comes from `EXPO_PUBLIC_SHOP_BASE_DOMAIN` (`zencpro.app` in production, `localhost` in development, so
  `barbeariadojoao.localhost:8081` works in Chrome with no DNS setup).
- Native (Expo Go, development only until store launch) has no host: it uses `EXPO_PUBLIC_DEV_SHOP_SLUG`.
- A `CurrentShopProvider` near the root loads the shop by slug once (`shops` where `slug = ?`) and exposes
  `{ shop, status }` through `useCurrentShop()`. Unknown slug → a "business not found" screen.

### 3. Who sees what

| Visitor | On a shop subdomain | On the bare domain (`zencpro.app` / `app.`) |
|---|---|---|
| Not signed in | That shop's login/signup, with its colours | A simple page: "Open the link your business sent you" + staff login |
| Customer | That shop's data only (home, booking, agenda, plans) | Same simple page (the directory replaces it later) |
| Owner / professional of this shop | Their area, as today | Redirect to their shop's subdomain |
| Owner / professional of another shop | Redirect to their own shop's subdomain | Same redirect |

A customer on shop A's subdomain sees only bookings, plans and notifications of shop A. This keeps each
business's page clean and matches the branded link; the future directory can show everything in one place.

### 4. The single-shop spots to fix

Each one reads `useCurrentShop()` (customer side, pre-login theme) or the staff member's own shop (staff side)
instead of "the first shop by name":

- `app/(customer)/(tabs)/book/index.tsx`
- `app/(customer)/me/recurrence.tsx`
- `src/features/appointments/use-appointment-cards.ts`
- `src/features/shops/use-shop-info.ts`
- `src/features/shops/theme.ts` (`getShopTheme`)
- `app/(owner)/shop.tsx`
- `src/features/shops/use-owner-shop-id.ts` (`getOwnerShopId`). **Bug today:** `shops_select_public` lets anyone read
  every shop, so this picks the alphabetically first shop, not the owner's. Fix: filter by `owner_user_id`.
- Customer lists that are not already shop-scoped (my appointments, my plans, notifications) get a `shop_id` filter.

`listPublicShops` stays for the future directory but nothing in this part uses its first row.

### 5. `ensure_my_customer(p_shop_id uuid)`

- Today it takes no argument and links the account to the first shop by `created_at`. It gains a required
  `p_shop_id`; everything else (email claim, merge of a professional-created row, consents) stays as is, scoped to
  that shop.
- The app calls it when a signed-in customer opens a shop's subdomain, so a customer row exists per shop they use.
- Error if the shop does not exist: the existing `P0007 CUSTOMER_UNAVAILABLE`.

### 6. Shared login across subdomains

- On web the Supabase session moves from `localStorage` to cookies on `.zencpro.app`, so signing in once works on
  every shop subdomain. Recommended: `createBrowserClient` from `@supabase/ssr`, which already splits the session
  into cookies under the 4 KB limit and takes a cookie `domain`. Native keeps SecureStore.
- The cookie domain comes from `EXPO_PUBLIC_AUTH_COOKIE_DOMAIN`. Unset in development: cookies are then per host, so
  each `*.localhost` subdomain signs in on its own (browsers do not share cookies on `localhost`). The shared login is
  verified on the hosted environment.
- Cookies are `Secure` and `SameSite=Lax`. The existing `zenc.language` key stays in `localStorage` (per host is fine).

### 7. Auth email links land on the right subdomain

- Password reset already passes `Linking.createURL("/reset-password")`, which on web is the current origin, so the
  link returns to the shop the user came from. Signup confirmation gets the same `emailRedirectTo`.
- Hosted Supabase must allow `https://*.zencpro.app/**` as redirect URLs (hosting track). Local `config.toml` adds
  `http://*.localhost:8081/**`.

## Launch blockers this part depends on (hosting track, user's accounts)

- Hosted Supabase with **email confirmation ON** and `app_settings.email_claim_enabled = true` (the email claim in
  `ensure_my_customer` trusts confirmed emails).
- Redirect URLs `https://*.zencpro.app/**`.
- An SMTP sender for confirmation and reset emails (also needed by part 2's invites).
- Wildcard DNS and TLS for `*.zencpro.app` on the static web host (Cloudflare Pages or Vercel).

## Out of scope

Creating businesses and inviting owners (part 2), structured address (part 2), PWA install (part 3), web push
(part 4), the directory, billing, per-shop app name or icon, one account holding two roles (a professional at A
booking at B as a customer: the role stays one per account, acceptable for now).

## Testing

- pgTAP: slug format and reserved names rejected; `ensure_my_customer(p_shop_id)` with two shops creates one row per
  shop and claims only within that shop; an owner's shop functions never see the other shop.
- Jest: `resolveShopSlug` (bare domain, `www`/`app`, reserved, nested subdomain, other hosts, `localhost` with port);
  `CurrentShopProvider` states (loading, found, not found); each fixed screen reads the current shop; `getOwnerShopId`
  with two shops returns the owner's.
- e2e (Playwright, web): two seeded shops on `a.localhost` and `b.localhost`; a customer sees only shop A's services
  on A and books there; an owner of B opening A is redirected to B.
- Manual on hosting: sign in on one subdomain, open another, still signed in.

## Risks

- `@supabase/ssr` in a static Expo web export is a new combination; the plan starts with a small spike to confirm the
  browser client works with cookies on web, falling back to a hand-written chunked cookie storage adapter.
- The shared login can only be fully tested on the real domain, so hosting should be ready early.
