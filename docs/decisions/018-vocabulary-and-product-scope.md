# Decision 018: Neutral vocabulary, the professional rename and product scope

Date: 2026-11-17 (decisions taken between 2026-11-11 and 2026-11-17)
Status: accepted

## Context

The app started as a barbershop scheduler and now serves any beauty business that fits the booking model (barbershops,
salons, nail and lash designers, braiders and similar). The word "barber" and the barbershop framing were everywhere:
database, edge functions, routes, texts and docs. Nothing is deployed and there is no real data.

## Decision

- **Neutral wording for every segment:** "profissional" (database: `professionals`) and "estabelecimento" (database:
  `shop`, unchanged). No `shops.segment` and no per-segment dictionary until there are real customers of each type to
  say what sounds right.
- **Rename `barber` to `professional`** in the database, edge functions (`invite-professional`), routes
  (`app/(professional)`), types, tests, i18n and docs (PR #90; design in
  `docs/superpowers/specs/2026-11-11-professional-rename-design.md`). `shop` and `chair_rent*` keep their names.
- **Migration policy:** migrations 0001-0065 were rewritten in place because nothing was deployed. **This is allowed
  only until the first hosted deploy.** From then on migrations are append-only (new numbered files): rewriting one that
  was already applied would break every database that has it.
- **Out of scope for now:**
  - A deposit (sinal) for long services such as braids or lash work of 4 to 8 hours is not modelled. Decide after
    talking to customers.
  - Dark mode, per shop or global (decision 016), and a per-segment vocabulary.

## Consequences

- Texts in pt, es and en say profissional and estabelecimento; gender and number agreement was reviewed by hand.
- `chair_rent_payments` stays as the data concept (it exists in salons too: salão parceiro); a label per segment can
  come later.
- Existing local databases need `supabase db reset` after the rename, then `supabase/dev-owner.sql` and
  `supabase/dev-professional.sql`.
