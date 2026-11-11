# Decision 015: Brand Zenc, app identifiers and domains

Date: 2026-11-11
Status: accepted

## Context

The app started as Barberschedule, a barbershop scheduler. It now serves any beauty business that fits the
booking model (barbershops, salons, nail and lash designers, braiders and similar). Nothing is deployed, so
identifiers that are expensive to change later can still be set freely.

## Decision

- **Brand:** Zenc. `zencpro` is only the cheaper domain variant, not the brand.
- **App identifiers:** bundle id (iOS) and package (Android) are `com.zencpro.app`, chosen for coherence with
  the owned domains. They cannot change after the first store release. Reserve the App ID in the Apple developer
  portal and the app in Play Console early: the stores do not verify domain ownership, the first to register wins.
  Checked on 2026-11-11: `com.zencpro.app` was not in use on Google Play.
- **Expo:** `name` Zenc, `slug` zenc, `scheme` zenc (deep links `zenc://`).
- **Domains (bought):**
  - `zencpro.com.br` — landing and marketing.
  - `zencpro.com` — redirects to the landing.
  - `zencpro.app` — the product; each business lives at `<slug>.zencpro.app`. Tenant content sits on a domain
    separate from marketing and the company login (same reasoning as `github.io` vs `github.com`). `.app` is
    HTTPS-only by default and the shortest link for an Instagram bio.
- **Calendar files (.ics):** `PRODID -//Zenc//EN`, event UID `<appointment id>@zencpro.app`.
- **Local Supabase:** `project_id = "zenc"` (containers are named `supabase_*_zenc`).

## Consequences

- Per-business subdomains need a `shops.slug`, a reserved-name list (`www`, `app`, `api`, `admin`...), wildcard DNS
  and TLS for `*.zencpro.app`, and universal links (`associatedDomains` / Android intent filters). That is the
  shop-resolution sub-project; it is not part of the brand rename.
- The domain lives in one configuration constant when introduced, so changing it later is a one-line change.
- Logo, icon, splash and the Zenc colour palette are pending design work; `DESIGN_SYSTEM.md` keeps the old visual
  identity until then.
- Stored keys changed with the name (`zenc.language`, `zenc-my-data-*.json`); harmless because nothing is deployed.
