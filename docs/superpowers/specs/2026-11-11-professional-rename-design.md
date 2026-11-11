# Renomeio barber → professional (design)

Data: 2026-11-11 · Subprojeto 2 da expansão do app para todo o setor de beleza
(marca Zenc, tema por loja, landing e GitHub da empresa têm specs próprios).

## Objetivo

O app nasceu para barbearias; o papel "barbeiro" passa a ser **profissional**
(nail designer, lash designer, trancista, cabeleireiro, barbeiro...). Como não
há ambiente hospedado nem dados reais, o renomeio é feito **agora no banco**,
sem migração de dados, para que o esquema nasça com o nome definitivo.

## Decisões (aprovadas em 2026-11-11)

- `barber` → `professional` em tabelas, colunas, funções, enum, constraints,
  policies, rotas, tipos, hooks, chaves de query e testes.
- `shop` **continua `shop`** (neutro em inglês; ~600 ocorrências sem ganho).
  Nos textos para o usuário o conceito vira "estabelecimento".
- `chair_rent_payments`, `chair_rental_frequency` e o valor `chair_rental`
  permanecem: o conceito existe em salões (salão parceiro). O rótulo por
  segmento é assunto do subprojeto de vocabulário.
- **Migrations 0001–0065 são reescritas no lugar**, não se cria uma 0066.
  Motivo: corpos plpgsql são texto, então `ALTER ... RENAME` não os atualiza;
  uma migration de renomeação teria que recriar quase todas as funções e
  deixaria o histórico com os dois nomes.
- Arquivos de migration/teste com `barber` no nome são renomeados com
  `git mv`, mantendo o prefixo numérico (a ordem não muda).
- A marca "Barberschedule" (`barberschedule`, `Barberschedule`,
  `BARBERSCHEDULE`) **não é tocada aqui**: pertence ao subprojeto da marca Zenc.

## Fora do escopo

Marca Zenc (`app.json`, `package.json`, README, `supabase/config.toml`
`project_id`, scheme), colunas `slug`/`segment`/tema em `shops`, vocabulário
por segmento, landing, mover o repositório para a organização.

## Método

Um script único e reproduzível (`scripts/rename-barber.mjs`, removido na última
tarefa) aplica, nesta ordem, sobre conteúdo **e** caminhos:

| Regra | Origem | Destino |
|---|---|---|
| 1 | `barber(?!schedule)` | `professional` |
| 2 | `Barber(?!schedule)` | `Professional` |
| 3 | `BARBER(?!SCHEDULE)` | `PROFESSIONAL` |

O plural em inglês sai correto sozinho (`barbers` → `professionals`).
Camel case também (`barberServiceId` → `professionalServiceId`,
`BarberCard` → `ProfessionalCard`). Verificado antes: não existe nenhuma
ocorrência prévia de `professional`/`profissional` (sem colisão) e nenhum
identificador passa de 55 caracteres depois da troca (limite do Postgres: 63).

Textos em português e espanhol (`barbeiro`, `barbero`, `barbearia`) **não** são
cobertos pelo script: passam por revisão manual no i18n (concordância de
gênero e número: "o barbeiro" → "o profissional", "barbeiros" →
"profissionais").

## Camadas e ordem

1. **Banco** (esta fase vem primeiro): `supabase/migrations`, `supabase/tests`,
   `seed.sql`, `dev-barber.sql` → `dev-professional.sql`, `dev-owner.sql`,
   edge functions (`invite-barber` → `invite-professional`,
   `dispatch-notifications/messages.ts`). Termina com `supabase db reset` e a
   suíte pgTAP verde.
2. **App**: `app/(barber)` → `app/(professional)`, `src/features/barbers` →
   `professionals`, tipos, hooks, strings de rota e `testID`s, testes
   unit/integration/e2e.
3. **i18n**: pt/en/es, revisão manual.
4. **Docs**: `docs/decisions`, `project-status.md`, `DESIGN_SYSTEM.md`
   (apenas a palavra do papel; a reescrita de marca vem depois), specs e planos
   antigos **não** são reescritos (são histórico).

As camadas 1 e 2 só podem ir para `main` juntas: o app chama RPCs pelo nome.
Tudo vive numa branch, em commits por camada, e vira **um único PR**.

## Verificação (critério de pronto)

- `npx supabase db reset` sem erro e `npx supabase test db` verde (44
  arquivos; o baseline em `main` com dados de dev falhava em 010, 012 e 031
  por causa da conta `samuel@teste.com`; depois do reset espera-se tudo verde).
- `npm run typecheck`, `npx eslint app src tests`, `npm test -- --runInBand`.
- e2e web completo (não roda no CI; ver observações de ambiente em memória).
- `grep -rIi barber` fora de `docs/superpowers/{specs,plans}` e da marca
  `barberschedule` sem resultados.
- Conferência visual no navegador das telas do profissional e do dono.

## Riscos

- **`supabase db reset` apaga os dados locais de dev** (inclui a conta
  `samuel@teste.com`). Aceito porque nada está no ar; `dev-owner.sql` e
  `dev-professional.sql` recriam o essencial. O reset só roda com confirmação
  explícita.
- Concordância de gênero no i18n (ver acima).
- Strings de rota (`/book/barber`) e `testID`s mudam: specs e2e precisam
  acompanhar.
- Worktrees antigos em `.claude/worktrees/` não são tocados (o script só
  processa arquivos rastreados da árvore principal) e ficam fora dos greps de
  verificação (`--exclude-dir=.claude`).
- Edge function renomeada precisa ser servida de novo
  (`supabase functions serve`).
