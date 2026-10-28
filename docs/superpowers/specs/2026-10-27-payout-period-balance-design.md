# Repasses por período e registro de pagamento — design

Data: 2026-10-27. Evolui `2026-10-27-barber-payouts-design.md`; onde houver conflito, este documento vale. Entrega: PR #87, em cima do #86.

## Objetivo

O dono vê quanto cada barbeiro de comissão tem a receber dividido em **remanescente do período anterior** e **período atual**, respeitando a agenda (semanal, quinzenal, mensal). Registra pagamentos em um pop-up que mostra o que está em aberto. O app só controla; nenhum texto sugere que ele paga.

Fora do escopo: tela do barbeiro (mantém o saldo único), mudança no "Controlar a partir de" (continua padrão = hoje), fechamentos gravados, desfazer.

## Decisões

| Tema | Decisão |
|---|---|
| Período | Vai do vencimento (inclusive) até o dia anterior ao próximo vencimento. Repasse toda sexta: sexta a quinta. A sexta já abre o período novo. |
| Saldo total | Não muda: `ganho − pago` desde `payout_tracking_start`. |
| Remanescente anterior | `max(0, ganho antes de L − pago total)`, com `L` = último vencimento até hoje (hoje conta). Pagamento parcial abate sempre o mais antigo. |
| Período atual | `saldo total − remanescente`. Fica negativo quando o pago excede tudo que foi ganho: aparece como "Pago a mais". |
| Sem vencimento ainda (`L` nulo) ou sem agenda | Remanescente 0; tudo é período atual (sem agenda: só "A receber"). |
| Quitou o período anterior | Remanescente 0, a linha some; o período atual segue contando. |
| Situação (selo) | Só olha o remanescente: sem agenda → `no_schedule`; remanescente 0 → `ok`; `L` = hoje → `due_today`; `L` < hoje → `pending`. Substitui a regra "sem repasse com `paid_on` ≥ vencimento" do spec original. |
| Lembrete do dono | Barbeiro entra se hoje é vencimento e o remanescente de hoje é > 0. O corte "já pagou hoje" sai: quitado zera o remanescente; pago parcial ainda é lembrado. |
| Texto | "Pagar" → "Registrar pagamento"; "Registrar repasse" → "Salvar registro"; "Repasse registrado." → "Pagamento registrado."; nota "Anote um pagamento que você já fez. O app não envia dinheiro." |
| Rótulo | "Remanescente do período anterior" e "Período atual · até dd/mm" (dd/mm = véspera do próximo vencimento). |

Exemplo (semanal, sexta; R$ 280 ganhos de sexta a quinta, R$ 40 ganhos na sexta seguinte):

| Momento | Remanescente | Período atual |
|---|---|---|
| Quinta | — | R$ 280 |
| Sexta, antes de registrar | R$ 280 | R$ 40 |
| Sexta, após registrar R$ 200 | R$ 80 | R$ 40 |
| Sexta, após registrar R$ 280 | — | R$ 40 |

## Banco (`0063_payout_period_balance.sql`)

- `payout_earned_between_cents(barber, from_date, before_date, tz)`: como `payout_earned_cents`, limitado a `starts_at < before_date` (meia-noite local).
- `payout_prior_open_cents(barber, from_date, boundary, tz)`: `greatest(earned_between(from, boundary) − payout_paid_cents(from), 0)`; `0` se `boundary` nulo. Ambas sem grants (padrão de `0061`).
- `get_payout_overview()` recriada (muda o retorno) com `period_start date`, `prior_open_cents integer`, `current_open_cents integer`. `period_start` = `last_due_date`, ou `payout_tracking_start` antes do primeiro vencimento; nulo sem agenda. A situação segue a tabela acima.
- `payout_due_barbers` recriada: condição de saldo vira `payout_prior_open_cents(b.id, start, local_date, tz) > 0`; remove o corte "já pagou hoje".
- `get_my_payout_summary` e os relatórios não mudam.

## App

- `types.ts`/`api.ts`: `PayoutOverviewItem` ganha `periodStart`, `priorOpenCents`, `currentOpenCents`.
- `balance.ts`: `periodLines(item)` devolve as linhas a mostrar (total, remanescente, atual, pago a mais, fim do período). Puro e testado.
- `PeriodBreakdown` (novo, `src/features/payouts/owner/`): renderiza as linhas de `periodLines`; `showTotal` liga a linha "A receber".
- Receita (`app/(owner)/revenue.tsx`): cartão de comissão usa `PeriodBreakdown showTotal`; saem "Contando desde" e "Saldo a repassar (acumulado)". Ficam "Repasses pagos no período" e "Ver repasses". Os valores seguem o ciclo do repasse, não o filtro semana/mês/trimestre.
- Repasses (`app/(owner)/payouts.tsx`): o cartão mostra "A receber" em destaque e `PeriodBreakdown`; botão "Registrar pagamento" abre `PayoutSheet` e o formulário em linha sai.
- `PayoutSheet` (novo, `src/features/payouts/owner/`): `Modal` com fundo escurecido, como `BarberBookingSheet`; título "Registrar pagamento · {nome}", a nota, bloco "Em aberto" (`PeriodBreakdown showTotal`), campos Valor pago (preenchido com o total em aberto se > 0), Data (hoje) e Observação com `useFieldChain`, botões "Salvar registro" e "Cancelar". Reaproveita `parseReaisToCents` e a mutação existente.
- Textos em pt, es e en. `testID`s existentes (`payout-pay-<id>`, `payout-amount`, `payout-date`, `payout-note`, `payout-submit`) são mantidos.

## Testes (escritos antes do código)

- **SQL** (`045_period_balance.sql`): tabela do exemplo semanal; quinzenal; mensal (dia 31 em mês curto); parcial e integral; pago a mais; sem agenda; antes do primeiro vencimento; situação `due_today`/`pending`/`ok`; lembrete só com remanescente. Ajustes em `043` e `044` onde a regra de situação e de lembrete mudou.
- **Jest**: `periodLines`; textos do `PeriodBreakdown`.
- **E2E**: Receita (remanescente só quando existe; sem "Contando desde"); Repasses (cartão com divisão; pop-up lista o em aberto e envia o payload); ajustes em `owner-payouts` e `owner-revenue`. Depois, captura de tela e CSS computado do pop-up (fundo escurecido) e dos cartões.

## Riscos

- O valor da Receita ("Parte do barbeiro", pelo filtro) e o "A receber" (pelo ciclo) podem diferir; os rótulos distinguem os dois.
- O selo fica "Pendente" enquanto houver remanescente, mesmo após pagamento parcial; é o comportamento pedido (a linha de remanescente aparece junto).
