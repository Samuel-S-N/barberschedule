# Shop onboarding: create a business, invite its owner, structured address (multi-shop, part 2) — design

Date: 2026-11-18
Status: draft, waiting for the user's review
Depends on: part 1 (`2026-11-18-shop-resolution-design.md`, `shops.slug`, subdomains)

## Why

Owners exist today only through hand-written SQL (`supabase/dev-owner.sql`). To reach 10 businesses by the end of
2026 the user needs a repeatable way to add one. Decided with the user on 2026-11-18: for the first businesses the
user (or a script) creates the business and invites the owner; a public self-serve wizard comes after the first 10
and reuses the same creation function. The address becomes structured now so the future location-based directory
does not need to ask businesses again.

## Scope

### 1. `create_shop` (database)

- `create_shop(p_name text, p_slug text, p_owner_user_id uuid, p_timezone text default 'America/Sao_Paulo')`,
  `security definer`, executable by `service_role` only.
- In one transaction: checks the profile exists and has no shop, sets `profiles.role = 'owner'`, inserts the shop.
  Slug format and reserved names are enforced by part 1's constraints.
- Errors: slug taken or invalid → `P0041 SHOP_SLUG_INVALID`; the user already owns a shop or is a professional →
  `P0042 SHOP_OWNER_INVALID` (next free codes; payouts use P0039/P0040). Both get i18n messages.

### 2. `scripts/create-shop.mjs` (the user's tool)

```
node scripts/create-shop.mjs --name "Barbearia do João" --slug barbeariadojoao --owner joao@email.com
```

- Reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the environment (never from the repo).
- Calls the Admin invite endpoint with `redirect_to = https://<slug>.<base domain>/reset-password`, then `create_shop`.
  If `create_shop` fails, it deletes the invited user (same pattern as `invite-professional`).
- If the email already has an account, it stops with a clear message (no promotion of existing accounts for now).
- Prints the shop link and a reminder to generate the QR code from it.

### 3. Invited users set their password

- The invite link signs the user in on their shop's subdomain and lands on `/reset-password`, which already sets a
  new password for a signed-in recovery session. It learns to accept an invite session too, with a title
  "Create your password" instead of "Reset password".
- `invite-professional` gets the same `redirect_to` (the professional's shop subdomain). Today it sends no redirect,
  so the link lands on the Supabase default site URL.

### 4. Structured address

- `shops.address` (free text) is replaced by: `address_cep` (8 digits), `address_street`, `address_number`,
  `address_complement`, `address_district`, `address_city`, `address_state` (2-letter UF), `address_city_ibge`
  (7 digits). All nullable, length-checked, publicly readable and owner-updatable like today's `address`.
  The existing dev value is moved into `address_street` by the migration.
- One helper `formatShopAddress(shop)` builds the single line the customer card shows today
  ("Rua X, 123 - Sala 2 · Centro, São Paulo - SP").

### 5. CEP autofill on the owner's Shop screen

- The CEP field uses the existing input masks (`00000-000`). When 8 digits are typed, the app calls
  `https://viacep.com.br/ws/<cep>/json/` (free, no key, CORS enabled). If it fails (network or 5xx) it tries
  `https://brasilapi.com.br/api/cep/v2/<cep>`.
- Found → street, district, city, state and IBGE code fill in; the cursor moves to the number field. Every field stays
  editable. A city-wide CEP returns no street: the owner types it.
- Not found (`{"erro": true}` or 404) → message "CEP not found, fill in the address" and nothing is cleared.
- Only the CEP leaves the device, and it is the business's public address.

## Out of scope

Self-serve wizard, landing page, billing or trial dates, coordinates and the directory, promoting an existing
customer account to owner.

## Testing

- pgTAP: `create_shop` happy path (role becomes owner, shop row, slug); rejected for taken/reserved slug, existing
  owner, professional, non-service role caller; address columns' grants (public read, owner-only update).
- Jest: CEP lookup (ViaCEP found, not found, network error → BrasilAPI, both down), autofill keeps manual edits,
  `formatShopAddress` with missing parts, `/reset-password` invite title.
- The script and both invite functions need one manual run against a stack with SMTP (local has none), as decision 013
  already notes for `invite-professional`.
