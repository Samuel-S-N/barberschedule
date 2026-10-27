# Repasses ao barbeiro — design

Data: 2026-10-27. Escopo aprovado em conversa; este documento é a fonte para o plano de implementação.

## Objetivo

O dono marca pagamentos de repasse (comissão) a barbeiros, com agenda opcional por barbeiro (semanal, quinzenal, mensal), saldo calculado, lembrete no dia do repasse e histórico de percentual de comissão (mudança retroativa ou só daqui para frente). O barbeiro vê o que tem a receber.

Fora do escopo: aluguel de cadeira (continua em `chair_rent_payments`, barbeiro paga o dono), data de início arbitrária para o percentual, feriados e fins de semana, auditoria de pagamentos apagados, aviso retroativo de dias perdidos.

## Decisões

| Tema | Decisão |
|---|---|
| Quem entra | Só barbeiros com `compensation_type = 'commission'`. |
| Avulso | Não é opção de perfil. Todo barbeiro de comissão aceita pagamento avulso; `payout_schedule = 'none'` é "sem agenda fixa". |
| Quinzenal | Dois dias fixos do mês (`day_1 < day_2`). |
| Mensal / dia inexistente | Dia 29–31 em mês curto vira o último dia do mês. |
| Saldo | Corrente: `ganho − pago`, contado desde `payout_tracking_start`. Sem fechamento de período. |
| "Confirmado" | Só atendimentos `completed`. `scheduled` e `confirmed` (futuros) não entram. |
| Percentual | Histórico por data (`effective_from`). Cada atendimento usa o percentual vigente em `starts_at`. |
| Retroativo | Apaga o histórico do barbeiro e deixa uma linha única em epoch. Não há desfazer. |
| Padrão do diálogo | "Só daqui para frente". |
| Saldo negativo | Mostrado como "pago a mais", nunca erro. |
| Lembrete | Uma notificação por dono por dia, a partir das 08:00 no fuso da barbearia, só com saldo > 0. |
| Pendente | Marcador na tela até haver repasse com `paid_on` igual ou posterior ao último vencimento. |

## Entrega em 3 PRs encadeados

1. `0060` histórico de comissão: tabela, diálogo, relatórios por atendimento.
2. `0061` repasses: agenda, pagamentos, saldo, tela do dono, visão do barbeiro.
3. `0062` notificações: lembrete do dono, aviso ao barbeiro, push, rotas.

## PR1 — histórico de comissão (`0060_commission_rate_history.sql`)

- Tabela `barber_commission_rates (id, shop_id, barber_id, percent numeric(5,2) 0..100, effective_from timestamptz, created_at)`. FK `(shop_id, barber_id) → barbers (shop_id, id)`. Único `(barber_id, effective_from)`. RLS ligada, sem grants: acesso só por funções `security definer`.
- Migração de dados: uma linha por barbeiro de comissão com o percentual atual e `effective_from = 'epoch'`. Os números dos relatórios existentes não mudam.
- `commission_percent_at(barber uuid, at timestamptz) returns numeric`, estável: o percentual da linha mais recente com `effective_from <= at`; sem linha, cai em `barbers.commission_percent`.
- `barbers.commission_percent` continua como espelho do percentual vigente (perfil e resumos seguem lendo ele).
- `set_barber_compensation` ganha `apply_retroactively boolean default false`:
  - Barbeiro já comissão e percentual diferente: retroativo apaga as linhas e insere uma em epoch; senão insere linha com `effective_from = clock_timestamp()`.
  - Percentual igual: histórico intocado.
  - Vindo de aluguel: apaga linhas e insere uma em epoch (não há comissão anterior; não pergunta).
  - Indo para aluguel: apaga as linhas (e, no PR2, zera a agenda de repasse).
  - A assinatura muda, então a função antiga é removida e recriada com `revoke`/`grant`.
- `get_shop_report` (última definição em `0044`) e `get_my_barber_report` (`0036`) passam a somar por atendimento: `round(sum(price × commission_percent_at(barber, starts_at)) / 100)`. Com percentual constante o resultado é idêntico ao anterior.
- Front: `setBarberCompensation(..., { applyRetroactively })`; `CompensationEditor` abre `ConfirmDialog` ao salvar um percentual diferente de quem já é comissão, com três saídas (daqui para frente, também nos anteriores, cancelar). O texto avisa que o retroativo muda o saldo de repasses já pagos e não pode ser desfeito. O `ConfirmDialog` atual tem botão de confirmação vermelho e um só destino; ganha uma segunda ação opcional.

## PR2 — repasses (`0061_barber_payouts.sql`)

### Agenda no barbeiro

Colunas em `barbers`: `payout_schedule` (enum `payout_schedule`: `none | weekly | biweekly | monthly`, padrão `none`), `payout_day_1 smallint`, `payout_day_2 smallint`, `payout_tracking_start date`.

Constraint (mesmo estilo de `barbers_compensation_matches_type`):

- `none`: dias nulos.
- `weekly`: `day_1` 0–6 (0 = domingo, igual a `extract(dow)`), `day_2` nulo.
- `biweekly`: `day_1 < day_2`, ambos 1–31.
- `monthly`: `day_1` 1–31, `day_2` nulo.
- `payout_schedule <> 'none'` exige `compensation_type = 'commission'` e `payout_tracking_start` não nulo.

`set_barber_payout_schedule(target_barber_id, new_schedule, day_1, day_2, tracking_start)`: só o dono. Erro `P0031 PAYOUT_SCHEDULE_INVALID`. `tracking_start` nulo na primeira configuração vale a data de hoje no fuso da barbearia; nulo depois mantém o valor atual.

### Pagamentos

`barber_payouts (id, shop_id, barber_id, amount_cents > 0, paid_on date, note ≤ 200, created_at)`, FK `on delete restrict`, RLS ligada, sem grants.

RPCs do dono (padrão de `0044`, erro de permissão `P0029 REPORT_FORBIDDEN`):

- `record_barber_payout(target_barber_id, amount_cents, paid_on, note)`. Barbeiro que não é de comissão ou valor inválido: `P0032 PAYOUT_INVALID`.
- `list_barber_payouts(period_start, period_end)`, janela de até 91 dias.
- `delete_barber_payout(payout_id)`.

### Datas e saldo

- `payout_due_dates(schedule, day_1, day_2, from_date, to_date) returns setof date`: gera os dias do intervalo e filtra pela regra (semanal por `dow`; mensal e quinzenal com `least(dia, último_dia_do_mês)`). Datas duplicadas pelo ajuste de mês curto colapsam.
- `get_payout_overview()` (dono): por barbeiro de comissão ativo, ou com saldo diferente de zero: `barber_id, name, schedule, day_1, day_2, tracking_start, earned_cents, paid_cents, balance_cents, last_due_date, next_due_date, status`.
  - `earned_cents = round(sum(price × commission_percent_at(barber, starts_at)) / 100)` para `completed` com `starts_at >= tracking_start` (meia-noite local).
  - `paid_cents` soma repasses com `paid_on >= tracking_start`.
  - `last_due_date` é o maior vencimento `<= hoje` e `>= tracking_start`; `next_due_date` é o menor `>= hoje`.
  - `status`: `no_schedule`, `due_today` (último vencimento é hoje, saldo > 0, sem repasse com `paid_on >= hoje`), `pending` (último vencimento passado, saldo > 0, sem repasse com `paid_on >= último vencimento`), senão `ok`. Saldo negativo é identificado pelo sinal de `balance_cents`.
- `get_my_payout_summary()` (barbeiro de comissão logado; `P0019 BARBER_NOT_LINKED` se não houver vínculo): `schedule, day_1, day_2, tracking_start, balance_cents, next_due_date, past_unmarked_count` (atendimentos `scheduled`/`confirmed` com `starts_at < now()` desde `tracking_start`, ainda fora do cálculo) e os últimos repasses (`paid_on`, `amount_cents`, `note`). Nunca devolve o faturamento bruto.
- Mudança para aluguel em `set_barber_compensation` também zera `payout_schedule` e os dias.

### Front

- `src/features/payouts/`: `api.ts`, `types.ts`, `schedule.ts` (resumo da agenda, validação, dia do mês), `balance.ts` (etiqueta e variante de status). Valores em reais reaproveitam `parseReaisToCents` e `centsToReaisInput` (`src/lib/money`).
- `ScheduleEditor` dentro de `CompensationEditor`, visível para comissão: opções Sem agenda fixa / Semanal / Quinzenal / Mensal; chips de dia da semana; seletor de dia do mês com a dica "em meses curtos, vale o último dia"; campo "Controlar a partir de".
- Tela `app/(owner)/payouts.tsx`, aberta pelo hub Gerenciar (`manage.tsx`) e declarada em `MANAGE_SCREENS` de `app/(owner)/_layout.tsx`. Cartões de mesma altura, um por barbeiro: nome, resumo da agenda, saldo, etiqueta (Em dia, Vence hoje, Pendente, Pago a mais, Sem agenda) e botão "Pagar" que abre formulário com valor preenchido pelo saldo, data de hoje e observação. Abaixo, histórico com apagar em dois toques.
- Barbeiro: `app/(barber)/my-profile/compensation.tsx` mostra "A receber até o momento", próxima data e agenda, "contando desde dd/mm", aviso de atendimentos sem baixa e histórico recebido.
- Textos em pt, es e en; códigos `P0031` e `P0032` em `domain-errors.ts`.

## PR3 — notificações (`0062_payout_notifications.sql`)

- `notifications_kind_check` ganha `payout_due` e `payout_paid`; `notification_outbox_event_type_check` ganha `payout.due` e `payout.paid`. `appointment_id` fica nulo nessas linhas.
- `payout_due_barbers(shop_id, local_date)`: barbeiros ativos de comissão com vencimento naquela data, saldo > 0 e `tracking_start <= date`.
- `enqueue_payout_due_notifications()`: para cada barbearia cuja hora local já passou de 08:00 e que tem barbeiros vencendo hoje, cria uma notificação ao dono com `event_key = 'payout_due:<dono>:<data>'` (idempotente) e o evento de push. Parâmetros: `count` e até 3 nomes. Agendada de hora em hora no mesmo bloco condicional de `pg_cron` do `0022`; sem a extensão, o job é chamável à mão.
- `record_barber_payout` passa a criar `payout_paid` para o barbeiro quando ele tem conta e não é quem está operando; `event_key = 'payout_paid:<payout_id>'`. Apagar não notifica.
- Edge function `dispatch-notifications/messages.ts`: textos de `payout.due` e `payout.paid` em en, pt e es.
- App: `inbox-text.ts` renderiza os dois tipos; `inbox-route.ts` leva `payout_due` a `/payouts` e `payout_paid` a `/my-profile/compensation`.

## Testes (escritos antes do código)

- **SQL** (`supabase/tests/042…044`, estilo de `028_rent_payments.sql`): histórico de percentual (daqui para frente mantém o passado, retroativo reescreve, mesmo percentual não mexe); relatórios iguais ao anterior com percentual constante; `payout_due_dates` semanal, quinzenal e mensal, fevereiro e dia 31; saldo, pendente, vence hoje e pago a mais; permissões (só dono registra, barbeiro só vê o próprio resumo); constraints da agenda; lembrete idempotente (duas execuções, uma notificação); `payout_paid` só com conta.
- **Unitários (Jest)**: resumo da agenda, etiquetas de saldo, regra do diálogo de percentual.
- **Integração**: RPCs de repasse e de agenda pelo cliente.
- **E2E web**: dono configura agenda, paga com valor preenchido, faz pagamento avulso, usa as duas saídas do diálogo, barbeiro vê o saldo. Depois, captura de tela e CSS computado das telas novas.

## Riscos

- O barbeiro dá baixa nos próprios atendimentos e assim influencia o próprio saldo. Mitigação: o dono vê o saldo antes de pagar; o aviso "atendimentos sem baixa" incentiva baixa correta.
- O retroativo altera saldos de períodos já pagos. Mitigação: texto explícito no diálogo e saldo negativo tratado como crédito.
- `pg_cron` pode não existir no Supabase local. Mitigação: testes chamam a função do job direto.
- O tipo de remuneração em si (comissão ou aluguel) também não tem histórico: relatórios aplicam o tipo atual ao passado. Fica como está.
