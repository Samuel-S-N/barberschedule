# 0.5 app readiness: design

Date: 2026-11-25
Status: approved by the user (decisions below); plans A to D written, nothing implemented yet.

## Why

Before the 0.5 deploy a real business must be able to (1) read and accept the legal documents, (2) get its link and QR code to
hand to customers, (3) be guided through the minimum setup so customers never land on an empty or broken agenda, and (4) receive
and send the e-mails the product depends on. Today none of this exists: `app/legal.tsx` is a five-paragraph placeholder, the
owner has no link or QR screen, a new owner lands in an empty panel, and the only e-mails are Supabase's default English templates.

## Principle (user decision)

A **customer account is a Zenc account**: one login for every business. Only the owner and the professional are tied to ONE
business. The database keeps its shape (one `customers` row per business linked to the user; `update_my_profile` updates all of
them, migration 0078). No restructuring now. Consequences used below: consents and the e-mail-reminder preference live on the
account (`consents`, `profiles`), never per business.

## Wording rule

Say **estabelecimento / negócio** (en: business / shop), never "barbearia", in all copy, templates and documents. Portuguese only
for the legal texts and e-mails for now.

## The four parts (each its own PR from `main`, merged in this order, no stacked PRs)

| Part | Plan | Migration | pgTAP | Error codes |
| --- | --- | --- | --- | --- |
| A Legal texts | `plans/2026-11-25-v05-a-legal.md` | `0080_legal_consents.sql` | `061_legal_consents.sql` | `P0046` |
| B Shop link and QR | `plans/2026-11-25-v05-b-shop-link.md` | none | none | none |
| C Owner setup form | `plans/2026-11-25-v05-c-setup-form.md` | `0081_shop_setup.sql` | `062_shop_setup.sql` | `P0044`, `P0045` |
| D E-mails | `plans/2026-11-25-v05-d-emails.md` | `0082_email_reminders.sql` | `063_email_reminders.sql` | none |

Reserved numbers were checked on `main` (f139dda): last migration `0079`, last pgTAP file `060_claim_shop_name.sql`, last error
code `P0043` (`UNAVAILABLE_DATES_RANGE_TOO_LARGE`). The implementer re-checks them before writing (a PR merged in between could
take one) and renumbers if so. Error codes also need a case in `src/lib/errors/domain-errors.ts`.

Dependencies: C needs A (business agreement) and B (the link screen is the checklist's last step). D is independent but ships
last because it touches `invite-professional` and `scripts/create-shop.mjs`, which C does not.

## A. Legal texts

Three documents, Portuguese only. en/es show the Portuguese text under a short translated note ("This document is in Portuguese").

1. **Política de Privacidade** (LGPD). Must cover, per the user's list and the goul4rt/lgpd-skills checklist:
   - Roles per data category. Zenc is **controller** of the account/profile (name, e-mail, phone, consents), access/security
     logs and error data (Sentry). When a customer books, name/phone/e-mail are shared with that business, which becomes
     **controller** of its own service records (appointments, notes) with Zenc as **operator** (art. 39).
   - Purposes and legal bases (art. 7: V contract execution is the main one, II legal obligation, IX legitimate interest).
   - Retention: account until deletion; history anonymised as the existing delete-account flow does; access logs 6 months
     (Marco Civil art. 15).
   - Sub-processors and international transfer (art. 33): Supabase, Cloudflare, Resend, Sentry, Expo / Google / Apple / Mozilla push.
   - Security (art. 46-47). Cookies: only the session cookie on `.zencpro.app`, no analytics cookies, so no banner.
   - Rights (art. 18-19) and how to use them in the app (export, delete, edit already exist). Minors: accounts 18+; minors are
     booked by a guardian (art. 14). Data protection officer contact `privacidade@zencpro.com.br` (art. 41). Incidents
     (art. 48). Versions and changes (art. 8 par. 6).
2. **Termos de Uso** (customers and professionals): definitions, accounts and eligibility (18+), permitted and prohibited use,
   Zenc is NOT a party to the service (cancellation, no-show, payment are between customer and business), business
   obligations, liability (CDC), suspension / termination / export, law and forum.
3. **Contrato do Estabelecimento** (B2B terms plus operator clauses): service; first month free, then the price "conforme
   proposta comercial"; the business's own notice to its customers; operator clauses (process only on instructions,
   confidentiality, sub-processor list, security, **incident notice to the business within 48 hours of Zenc confirming it**, so
   the business can meet ANPD Res. 15/2024's 3 business days; help with data-subject requests; return or deletion at
   termination); liability; termination; forum.

Company data lives in ONE file, `src/features/legal/company.ts`: `[RAZÃO SOCIAL]`, `[CNPJ]`, `[ENDEREÇO]`, `[FORO]`. An empty
value renders as its placeholder, **highlighted**. There is no "draft" banner. `docs/legal/revisao-juridica.md` lists what the
lawyer must decide: minimum age 18 vs 16, health data such as allergies typed in the notes field (art. 11), retention
periods, the 48 h window, the forum, and the ANPD resolution numbers 15/2024 and 2/2022 (to verify).

Public routes, no login: `/privacidade`, `/termos`, `/contrato`. `app/legal.tsx` redirects to `/privacidade`. Links from signup,
the Privacy area of the three hubs, and the "Em breve" page footer (part C).

Versions are per document (`LEGAL_VERSIONS`, ISO dates). The `consents` table (0023) already has `kind` and `version`; its
check constraint grows to `terms`, `privacy`, `business`. **Re-accept gate:** when the current version of a required document
is newer than the user's last consent for it, an "Atualizamos nossos termos" screen (`/accept-terms`) blocks the app until
accepted. All roles see it for terms + privacy; the business agreement is required of owners only.

## B. Link and QR

- Owner: Manage > shop group, item "Link e QR code" next to "Dados e horários" (`/shop-link`). Professional: hub item "Link do
  estabelecimento" (`/my-profile/shop-link`) showing the SAME general shop link (no personal link). One shared component,
  also the last step of the setup form (part C).
- The screen shows the shop URL `<slug>.zencpro.app` (reusing `shopUrl` / `shopBaseDomain`; local dev is `slug.localhost`), a
  large QR drawn with `react-native-svg` from the matrix of the small pure-JS `qrcode` package, **Compartilhar** (native share
  sheet; on web `navigator.share` when available, else copy + "Link copiado"), **Copiar link** (web only) and **Baixar QR
  (PNG)** (web only, canvas). No new native capture dependencies.
- Registered in `MANAGE_SCREENS` (owner layout), `ROUTE_PARENTS`, the professional navigation, and covered by the existing guard
  tests.

## C. Owner setup form (guided checklist, not an embedded-form wizard)

- `shops.setup_completed_at` (null = the business is not open). While null the owner is routed to `/setup` and does not see
  the panel. One-time: once set, the checklist never returns (later deletions are handled by the existing warnings).
- Steps, each with done / pending, each opening the EXISTING screen and coming back:
  1. Accept the business agreement (consent `business`, current version). Required.
  2. Details: name, WhatsApp or phone, address with CEP. Required.
  3. Shop hours. Required.
  4. At least one active service. Required.
  5. Team: at least one active professional with working periods AND services. Required. Options: "Eu atendo" (the
     owner-as-professional toggle, copying the shop hours once like PR #112) or add a professional (the owner may set that
     professional's hours and services before the invite is accepted). Shows what each professional lacks (reuses the guide
     logic). Invites are optional.
  6. Colours. Optional.
  7. "Abrir minha agenda", enabled only when the required steps are done, then goes to the link screen (part B).
- Server side: owner-only RPC `complete_shop_setup(p_shop_id)` re-validates everything above and then sets `setup_completed_at`.
  The checklist reads the same rules through `shop_setup_status(p_shop_id)`, so the screen and the RPC cannot drift.
- Closed page: the shop lookup exposes readiness. When not ready, the shop link shows "Em breve: <nome> está preparando a
  agenda" with no login or signup. `book_appointment` rejects a not-ready shop (`P0044 SHOP_NOT_READY`). Professionals invited
  before opening log in normally with an empty agenda.
- Dev and e2e shops are not blocked (see decision 1). The user's local owner account can go through the form: the plan gives the
  SQL.

## D. E-mails

- Supabase templates in `supabase/templates/`, wired in `config.toml`: **confirmation**, **recovery**, **email change** are
  ZENC-branded with no business name; **invite** (owner or professional) reads "Você foi convidado para <business> na Zenc"
  (`invite-professional` and `scripts/create-shop.mjs` pass `business_name` in the invite `data`). Email-safe HTML (tables,
  inline styles), wordmark "ZENC." as text, one main button plus a fallback link. Visible locally in the Supabase mailbox
  (port 55424). `docs/hosted-deploy.md` documents `supabase config push` and the Resend SMTP setup.
- **Reminder e-mail:** customers with an account, 24 h before, ALWAYS in addition to push, using the existing reminder enqueue
  (0022, window 23-25 h). Content: "Lembrete: amanhã às HH:MM, <serviço> com <profissional> em <estabelecimento>", address,
  button "Ver meus agendamentos" to the business link, footer "Para não receber, desative em Configurações > Notificações".
  The setting "Lembretes por e-mail" is a profile column (default true) on the Zenc account, applying to every business, in the
  customer notification settings.
- Sending: the Resend HTTP API from the `dispatch-notifications` Edge Function (`RESEND_API_KEY`, `EMAIL_FROM`); without a key it
  logs and skips. Each e-mail is its own outbox row (event type `appointment.reminder_email`), so a retry never resends push and
  push never resends an e-mail.
- Out of scope: customers without an account, a booking-confirmation e-mail, a 2 h reminder.

## Decisions I took that were not in the brief (flagged for the user)

1. **`setup_completed_at` defaults to `now()`; `create_shop` sets it to null explicitly.** The migration also backfills nothing
   (the default covers existing rows). Reason: 59 test and seed files insert shops directly; with a null default every one of
   them would need editing and a missed one would fail on `P0044`. This is the same outcome as "seed shops are marked ready"
   with far less churn. Only shops created through `create_shop` (script, future self-serve) go through the form. The local owner
   test account goes through it with `update public.shops set setup_completed_at = null where slug = '<slug>'`.
2. **Business agreement versus the gate:** the re-accept gate asks owners for `business` only once `setup_completed_at` is set.
   Before that, checklist step 1 is the place that accepts it, so a new owner does not see the same text twice.
3. **Readiness is public:** `grant select (setup_completed_at)` to anon and authenticated, so the shop lookup returns it with
   the name and slug (`PublicShop.ready = setup_completed_at !== null`). A timestamp saying "this business is open" is not
   sensitive; owners get no UPDATE grant on it, only `complete_shop_setup` writes it.
4. **Consent versions are ISO dates** and the gate compares `>=` as strings. A user with no consent row of a required kind (an
   invited owner or professional, who never saw the signup checkbox) also hits the gate on first login.
5. **`accept_legal_documents` RPC** records consents (the table is read-only to clients). Signup keeps using user metadata (no
   session exists yet when confirmations are on), now with a separate `accepted_privacy_version`.
6. **Owner routing while the setup is pending** redirects only from the four tab roots and `/`, so the existing screens the steps
   open (`/shop`, `/schedule`, `/services`, `/professionals`...) stay reachable; the tab bar is hidden meanwhile.
7. **Customer-facing "closed" page** shows for anyone who is not staff of that same shop; the legal routes stay reachable from it.
8. **QR library:** `qrcode` first, with a one-step spike to prove `QRCode.create` works under Metro and Jest. If it does not,
   fall back to `qrcode-generator` (also pure JS, single file). The plan says which file changes in each case.
9. **Reminder e-mail payload is a snapshot** built in SQL at enqueue time (professional name, shop name, formatted address, slug),
   so the dispatcher needs no extra query. `Idempotency-Key: <outbox id>` is sent to Resend so a crash after sending does not
   double-send on retry.
10. **Empty company data is not a test failure** (dev would be red forever). It is a deploy-checklist item in
    `docs/hosted-deploy.md`, and the highlight makes it impossible to miss.
11. **E-mail reminder count:** `enqueue_notification_reminders()` keeps returning the number of PUSH rows (the e-mail rows are extra), so its
    existing contract and test `009_notifications.sql` keep their meaning.
12. **e2e fixtures answer the consents lookup** with the current versions of all three documents by default (many specs answer
    unknown REST calls with `[]`, which the new gate would read as "nothing accepted"). Only `legal-gate` overrides it.
13. **The closed page links the legal documents with a full page load** on the web (`window.location.assign`): it renders before the
    navigator exists, so `router.push` has nothing to push into.
14. **`service_role` gets `select (name)` on `shops`** (migration 0082) so `invite-professional` can put the business name in the invite.

## Testing approach (all parts)

Strict TDD per task, commit per task. pgTAP for every database rule (including who may call each RPC), Jest for pure logic and
screens, Playwright e2e for the user flows, run per the repo's rules (`.env.local` aside, default base URL, chromium + firefox +
webkit). The standing gates apply to every PR: typecheck, root `npm run lint`, full Jest with no "did not exit" line, Playwright
whole suite, static export.
