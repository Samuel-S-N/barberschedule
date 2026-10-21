# UX Round 2 — Design

Source: user feedback of 2026-10-21 after trying PRs #52–#57 on a phone. Approved in chat on 2026-10-21 (with one change: **Confirm stays on the agenda card**).

## Findings
- **"Atender como barbeiro" never switches on.** Root cause found: zod v4 `.uuid()` rejects ids whose version nibble is 0, such as the local seed ids (`a1000000-0000-0000-0000-000000000001`). `createBarber` fails validation and the hub shows the generic "não foi possível atualizar o barbeiro". The backend path (RLS insert + `list_owner_barbers`) was verified through PostgREST with a real owner JWT. Production ids come from `gen_random_uuid()` and pass; 14 `.uuid(` calls share the risk.
- "Voltar" follows the navigation **history**, so after a notification, or after hopping between hidden tab screens, it loops or leaves the user stuck (client profile → list, recurrence requests → profile).
- Labels carry format hints ("(AAAA-MM-DD)", "(HH:mm)", "(0-100)") and wrap to two lines, which misaligns side-by-side fields (screenshot: start date + local time in the manual recurrence form).

## Decisions
| Topic | Decision |
|---|---|
| Back | Every screen declares a **fixed parent**; back always goes there, never through history. Tab roots have no parent. Android hardware back uses the same map. Exceptions that keep history: `/legal`, `/reset-password`. A unit test scans `app/` so a new screen without a parent fails CI. |
| Header | New `ScreenTopBar`: a top strip (left slot reserved, centre reserved for a future app name, **bell on the right**) with the title below. Used on customer Home, barber Agenda, owner Agenda. |
| Field examples | Labels lose format hints. Each field shows a **grey ghost example** as `placeholder` (`25/10/2026`, `09:00`, `(11)91234-5678`, `25,00`, `name@example.com`...). Side-by-side fields sit in a `FieldRow` aligned at the bottom. A unit test fails when a label contains a format hint or an `<Input>` has no placeholder (allow-list for passwords). |
| Agenda card (owner + barber) | Card = time, customer, status badge, and quick buttons **Confirmar** (barber, scheduled), **Concluir**, **Faltou**. Tapping the card opens a floating pop-up with service/price/barber/notes, WhatsApp, Ligar, Lembrar (barber), Remarcar (barber), Cancelar (two taps). Tapping the customer name opens the customer: barber → `/clients/[id]`; owner → `/customer-form?id` (the owner has no separate client profile; building one is out of scope). |
| Client history | Fixed-height card with inner scroll (recommended over pagination: the RPC already returns the latest 20, scrolling keeps context). |
| Recurrence plans | New `recurrence_plans` table: service, price **per session**, periodicity **every N weeks** (1–12; shortcuts Semanal/Quinzenal), optional name, active flag; at most one active plan per (service, weeks). Several plans may share a service with different periodicities. The 0050 price table becomes a compatibility view over active plans so the existing request/accept functions keep working. |
| Owner recurrence UI | Manage › **Planos de recorrência**: list + circular `+` + plan form (like Barbers/Services). "Clientes recorrentes" keeps Requests / Active / manual create (the Prices tab is removed). |
| Customer recurrence UI | Same step style as booking: Barbeiro › Plano › Dia da semana › Horário › Revisão › Enviar. The periodicity comes from the chosen plan; the weekday repeats at that periodicity; the first date is the next occurrence of that weekday. |

## Order (one branch + PR each, stacked on `feat-recurrence-requests` until the stack is merged)
1. `r2-01-uuid-guid` — bug fix. 2. `r2-02-navigation-and-header`. 3. `r2-03-fields-placeholders`. 4. `r2-04-agenda-cards-and-client-history`. 5. `r2-05-recurrence-plans`.

## Out of scope
Owner client profile screen; push for plan changes; pagination RPC for client history; deleting plans (deactivate only).
