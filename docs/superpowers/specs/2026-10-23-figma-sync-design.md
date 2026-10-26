# Figma sync (2026-10-23) — design

Date: 2026-10-23. Source: Figma file `5VgIX5jedu9gevBhkcs8Fb` (pages Telas Cliente / Barbeiro / Dono), compared with the app running on the branch `feat-plans-no-end`.

## How the comparison was made

The Figma API has no version history, so "what changed" is what differs from the code. Two passes:

1. **Text pass, all 111 screens** (36 customer, 29 barber, 46 owner): every text layer of every frame compared with `src/i18n/locales/pt.ts` and the flows in code (step counters included). Only the strings listed below differ.
2. **Visual pass**, Figma screenshot next to the app in a 375 px browser, role by role, on the screens that carry the recent Figma edits: login, home, booking step 1, owner Receita (top and per-barber blocks), Gerenciar, Agenda — loja, Planos de recorrência, Clientes recorrentes, barber Planos and Meus serviços. They match except for the items below. The local DB has no customer-side data for a fresh signup (no barbers in the booking list), so customer screens with cards were compared by structure only.

Matching, no change: Login, Início, Gerenciar, Agenda — loja, Receita layout (stat tiles already share the row height in the app, which is the card rule of the project), barber Meus serviços, step bars.

## Deltas to apply

### D1 — Plan card standard on the staff screens
The customer plan card (`PlanSummary`: title + periodicity on the left, value on the right, caption, regular price) is the reference. In Figma every plan card of the barber and owner follows it; in the app they are still free-form `Card`s.

| Screen | Figma card |
|---|---|
| Owner **Planos de recorrência** | `PlanSummary` (title = plan title, no periodicity beside it; value = 4-week total; caption `R$ 40,00 por sessão · 4 sessões em 4 semanas`; `Preço normal R$ 180,00`), then `Serviço · Periodicidade`, then Editar. Inactive plans keep the "(inativo)" suffix on the title. |
| **Pedidos** (`RequestCard`, owner *Clientes recorrentes* and barber *Planos*) | `PlanSummary` (title = service, periodicity beside it; with a special price: 4-week total + the caption + `Preço normal R$ …`; without one: the regular price as the value and the label `Preço normal`), then customer, barber, `data hora`, then Aceitar / Recusar / WhatsApp. |
| **Pedidos de cancelamento** (`CancellationCard`) | `PlanSummary` without value (service + periodicity), then customer, barber, then Aceitar cancelamento / Manter plano / WhatsApp. |
| Owner **Ativos / Encerrados** series | `PlanSummary` without value (service + periodicity), `Preço do catálogo · Ativa` (price · state), customer, barber, `data · hora`, then the existing actions. Ended series stay faded. |
| Barber **Planos ativos** | `PlanSummary` without value (service + periodicity), customer, `Começa em data · hora`, Encerrar plano. |

`PlanSummary` therefore gets optional `amountText`, `caption`, `normalText` and `periodicity` (nothing renders for a missing one). One new helper in `price-text.ts`, `staffPlanPrice`, returns the value and caption the staff cards share. One new i18n key, `recurrence.normalPriceLabel` (pt "Preço normal", en "Normal price", es "Precio normal").

### D2 — WhatsApp link wraps instead of being clipped
In the request and cancellation cards the three actions sit in one `flex-wrap` row, but `ContactLink` is `flex-1` with a zero basis, so it shrinks to a clipped pill (icon cut, text overflowing the card) instead of wrapping. Figma shows Aceitar / Recusar on the first row and the link on its own row with its icon. Fix: a minimum width on `ContactLink` so the row wraps. `ContactLink` is also used side by side (shop card, client detail), where two links still share the row.

### D3 — "Receita da barbearia" counts only rent already paid
Product rule (2026-10-23): the shop's income from a chair-rental barber is the rent **paid** in the period, not the estimate. Figma shows `Receita da barbearia` with the hint `Após repasse a colaboradores`.

- `build.ts`: `shopIncomeCents = gross − barberShare + rentPaid` (was `+ rentEstimate`); the per-barber `shopShareCents` uses `rentPaid` too, so the rows still add up to the total.
- `shopIncomeHint` (pt/en/es): `Após repasse a colaboradores` and equivalents.
- The per-barber estimate line, "Aluguel pago", the "Registrar pagamento do aluguel" button and the rent note stay: they are how the owner compares estimate and paid.
- CSV: unchanged (it already exports the estimate and the paid values as separate columns).
- No migration: `rent_paid_cents` already comes from `get_owner_report` (migration 0044).

### D4 — Equal-height card rows: verified, no change
The Receita tiles already stretch per row in the app (checked in the browser). Nothing to do; recorded so it is not re-audited.

## Not changed on purpose

- Transient states Figma does not draw (toasts, skeletons) and the iPhone status-bar offset that Figma frames include at the top.
- Mock-data inconsistencies in Figma (e.g. the per-barber *Parte da barbearia* values do not add up to R$ 2.000,00 in the mock); only layout and copy are taken from Figma.

## Testing

- Unit: `owner-report-build.test.ts` (D3), a new unit test for `staffPlanPrice`.
- Jest render tests for `RequestCard` / `CancellationCard` / `PlanSummary` optional parts.
- Playwright specs that locate these cards by `testID` keep their ids; the text they assert on is updated (`owner-recurring`, `barber-recurrence`, `barber-plans-end`, `owner-recurrence-plans`, `owner-revenue`).
- Browser check at 375 px against the Figma screenshots after the change (project rule: the earlier cycles shipped unstyled screens).
