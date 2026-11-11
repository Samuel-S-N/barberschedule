# Renomeio barber → professional — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o papel "barbeiro" por "profissional" em todo o stack (banco, edge functions, app, i18n, docs), sem migração de dados.

**Architecture:** Um script de substituição reproduzível (`scripts/rename-barber.mjs`) aplica regras de texto sobre conteúdo e caminhos dos arquivos rastreados, camada por camada (banco → app → i18n → docs), com um commit por camada na mesma branch e um PR único. As migrations 0001–0065 são reescritas no lugar; a verificação é `supabase db reset` + pgTAP, Jest, typecheck, eslint e e2e.

**Tech Stack:** Postgres/Supabase (migrations, pgTAP, edge functions Deno), Expo/React Native, TypeScript, Jest, Playwright, Node 20 (`node --test`).

**Spec:** `docs/superpowers/specs/2026-11-11-professional-rename-design.md`

## Global Constraints

- `barber` → `professional`; `shop` **não** muda; `chair_rent*`/`chair_rental*` **não** mudam.
- A marca `barberschedule` / `Barberschedule` / `BARBERSCHEDULE*` **não** muda neste plano (inclui `supabase/config.toml` `project_id`, container `supabase_db_barberschedule`, scheme `barberschedule://`).
- Texto em espanhol/português (`barbero`, `barbería`, `barbearia`) e `barbershop` **não** são tocados pelo script; são revisados à mão na Task 7.
- Não reescrever `docs/superpowers/specs/*` e `docs/superpowers/plans/*` antigos (histórico).
- Não renomear nada em `.claude/worktrees/` (greps usam `--exclude-dir=.claude`).
- `npx supabase db reset` apaga os dados locais de dev: só rodar com confirmação explícita do usuário.
- Ambiente: `.env.local` deve sair do lugar durante o e2e e voltar depois; lint no raiz falha, usar `npx eslint app src tests`.

---

### Task 1: Branch e script de renomeio (TDD)

**Files:**
- Create: `scripts/rename-barber.mjs`
- Create: `scripts/rename-barber.test.mjs`

**Interfaces:**
- Produces: `renameText(text: string): string` (export nomeado) e a CLI `node scripts/rename-barber.mjs [--dry] <path...>`, que reescreve conteúdo e move arquivos rastreados (`git mv`). Tasks 2, 5, 7 e 8 usam a CLI.

- [ ] **Step 1: Criar a branch**

```bash
git checkout -b refactor-professional-rename
```

- [ ] **Step 2: Escrever o teste que falha**

`scripts/rename-barber.test.mjs`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { renameText } from "./rename-barber.mjs";

const renamed = [
  ["public.barbers", "public.professionals"],
  ["barber_service_id", "professional_service_id"],
  ["barberServiceId", "professionalServiceId"],
  ["BarberCard", "ProfessionalCard"],
  ["BARBER_COMPENSATION", "PROFESSIONAL_COMPENSATION"],
  ["app/(barber)/clients", "app/(professional)/clients"],
  ["invite-barber", "invite-professional"],
  ["'barber'", "'professional'"],
];

const kept = [
  "barberschedule",
  "Barberschedule",
  "BARBERSCHEDULE_E2E_WEB_PORT",
  "barberschedule://**",
  "supabase_db_barberschedule",
  "Barbero",
  "barberos",
  "barbería",
  "Barbershop",
  "barbershop",
];

test("renames barber to professional", () => {
  for (const [from, to] of renamed) assert.equal(renameText(from), to, from);
});

test("leaves the brand, Spanish and barbershop alone", () => {
  for (const text of kept) assert.equal(renameText(text), text, text);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node --test scripts/rename-barber.test.mjs`
Expected: FAIL (`Cannot find module './rename-barber.mjs'`).

- [ ] **Step 4: Implementar o script**

`scripts/rename-barber.mjs`:

```js
// One-off: barber -> professional across tracked files (content and paths).
// Brand "barberschedule", Spanish "barbero/barbería" and "barbershop" are left alone.
// Deleted in the last task of docs/superpowers/plans/2026-11-11-professional-rename.md.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const KEEP = "(?!schedule|shop|o|[ií]a)";
const RULES = [
  [new RegExp(`barber${KEEP}`, "g"), "professional"],
  [new RegExp(`Barber${KEEP}`, "g"), "Professional"],
  [/BARBER(?!SCHEDULE)/g, "PROFESSIONAL"],
];

export const renameText = (text) => RULES.reduce((acc, [re, to]) => acc.replace(re, to), text);

const SKIP = /^scripts\/rename-barber(\.test)?\.mjs$/;

function main(paths, dry) {
  const files = execFileSync("git", ["ls-files", "-z", "--", ...paths], { encoding: "utf8" })
    .split("\0")
    .filter((file) => file && !SKIP.test(file));
  let edited = 0;
  const moves = [];
  for (const file of files) {
    const buf = readFileSync(file);
    if (!buf.includes(0)) {
      const before = buf.toString("utf8");
      const after = renameText(before);
      if (after !== before) {
        edited++;
        if (!dry) writeFileSync(file, after);
      }
    }
    const target = renameText(file);
    if (target !== file) {
      if (existsSync(target)) throw new Error(`${target} already exists`);
      moves.push([file, target]);
    }
  }
  if (!dry) {
    for (const [from, to] of moves) {
      mkdirSync(dirname(to), { recursive: true });
      execFileSync("git", ["mv", from, to]);
    }
  }
  console.log(`${dry ? "[dry] " : ""}edited ${edited} files, moved ${moves.length}`);
  for (const [from, to] of moves) console.log(`  ${from} -> ${to}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  main(args.filter((arg) => arg !== "--dry"), args.includes("--dry"));
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test scripts/rename-barber.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add scripts/rename-barber.mjs scripts/rename-barber.test.mjs docs/superpowers/specs/2026-11-11-professional-rename-design.md docs/superpowers/plans/2026-11-11-professional-rename.md
git commit -m "chore: spec, plan and script for the barber -> professional rename"
```

---

### Task 2: Camada banco (migrations, pgTAP, seeds, edge functions)

**Files:**
- Modify/rename: tudo que `git ls-files supabase` contém com `barber` no conteúdo ou no caminho (16 migrations, 9 arquivos pgTAP, `dev-barber.sql`, `functions/invite-barber/`, `functions/dispatch-notifications/messages.ts`, `seed.sql`, `dev-owner.sql`).

**Interfaces:**
- Consumes: CLI da Task 1.
- Produces: esquema com `professionals`, `professional_services`, `professional_commission_rates`, `profile_role` com valor `professional`, `appointment_source` com valor `professional`, funções `professional_*`, `list_owner_professionals`, `get_my_professional_report` etc., edge function `invite-professional`. A Task 5 (app) depende exatamente desses nomes.

- [ ] **Step 1: Dry-run**

Run: `node scripts/rename-barber.mjs --dry supabase`
Expected: `[dry] edited ~90 files, moved ~27` e a lista de `git mv` (por exemplo `supabase/migrations/0005_barbers.sql -> supabase/migrations/0005_professionals.sql`).

- [ ] **Step 2: Aplicar**

Run: `node scripts/rename-barber.mjs supabase`

- [ ] **Step 3: Corrigir o nome neutro do seed**

`seed.sql` tinha `'Seed Barber Shop'`, que virou `'Seed Professional Shop'`. Trocar por `'Seed Shop'` e conferir se algum teste depende do nome:

```bash
grep -rn "Seed Professional Shop\|Seed Barber Shop" supabase tests src
```

Edite cada ocorrência para `Seed Shop` (seed e asserts).

- [ ] **Step 4: Verificar que não sobrou barber**

Run:
```bash
grep -rIiE "barber" supabase | grep -viE "barberschedule|barbero|barberia|barbería|barbershop"
```
Expected: sem saída.

- [ ] **Step 5: Conferir o diff por amostragem**

```bash
git diff -M --stat | tail -3
git diff -M supabase/migrations/0025_professional_role.sql supabase/migrations/0031_professional_booking_schema.sql | head -60
```
Expected: `alter type public.profile_role add value 'professional';` e `alter type public.appointment_source add value if not exists 'professional';`.

- [ ] **Step 6: Commit**

```bash
git add -A supabase
git commit -m "refactor(db): rename barber to professional in migrations, tests, seeds and edge functions"
```

---

### Task 3: `db reset` e suíte pgTAP

**Files:** nenhum (verificação).

- [ ] **Step 1: Confirmar com o usuário** que `supabase db reset` pode apagar os dados locais de dev (inclui `samuel@teste.com`). Só seguir com "sim" explícito.

- [ ] **Step 2: Reset**

Run: `npx supabase db reset`
Expected: aplica 0001–0065 sem erro e roda `seed.sql`.

- [ ] **Step 3: pgTAP**

Run: `npx supabase test db`
Expected: `Result: PASS`, 44 arquivos. (Baseline antes do reset, com dados de dev: falhas em 010, 012 e 031, guardadas fora do repo; depois do reset elas devem sumir. Se algum arquivo ainda falhar, comparar a mensagem com o baseline antes de assumir erro do renomeio.)

- [ ] **Step 4: Sanidade do esquema**

```bash
docker exec -i supabase_db_barberschedule psql -U postgres -d postgres -c "select count(*) from information_schema.columns where table_schema='public' and column_name ilike '%barber%'" -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ilike '%barber%'" -c "select unnest(enum_range(null::public.profile_role))"
```
Expected: `0`, `0` e a lista `owner, customer, professional`.

- [ ] **Step 5: Recriar os dados de dev**

```bash
docker exec -i supabase_db_barberschedule psql -U postgres -d postgres < supabase/dev-owner.sql
docker exec -i supabase_db_barberschedule psql -U postgres -d postgres < supabase/dev-professional.sql
```
Expected: sem erro (idempotentes).

- [ ] **Step 6: Commit** só se os passos acima exigirem ajuste de arquivo (ex.: correção de um nome que o script não alcançou).

---

### Task 4: Edge functions

**Files:**
- Modify: `supabase/functions/invite-professional/index.ts`, `supabase/functions/dispatch-notifications/messages.ts` (já renomeados na Task 2)

- [ ] **Step 1: Conferir o contrato**

```bash
grep -n "professional" supabase/functions/invite-professional/index.ts | head -20
grep -n "professional" supabase/functions/dispatch-notifications/messages.ts | head -20
```
Expected: o corpo da requisição usa `professionalId`, o nome da RPC bate com a migration `0065_invite_professional_grants.sql` e a mensagem de push usa o rótulo "professional".

- [ ] **Step 2: Servir e chamar sem token**

Run: `npx supabase functions serve invite-professional --no-verify-jwt` (em outro terminal) e `curl -s -X POST http://127.0.0.1:54321/functions/v1/invite-professional -H 'content-type: application/json' -d '{}'`
Expected: resposta de validação (4xx, "professionalId" ausente), não 404.

- [ ] **Step 3: Commit** só se houve correção.

---

### Task 5: Camada app (rotas, features, tipos, testes)

**Files:**
- Modify/rename: tudo em `app`, `src`, `tests` com `barber` (grupo `app/(barber)` → `app/(professional)`, `src/features/barbers` → `professionals`, `BarberAgenda.tsx` → `ProfessionalAgenda.tsx` etc.).

**Interfaces:**
- Consumes: nomes de RPC/colunas da Task 2 (`professional_id`, `professionalId` nas respostas já passa pelo mapeamento do código).
- Produces: rotas `/(professional)/...`, `/book/professional`, `testID`s com prefixo `professional`.

- [ ] **Step 1: Dry-run**

Run: `node scripts/rename-barber.mjs --dry app src tests`
Expected: `[dry] edited ~190 files, moved ~100`; sem erro de "already exists".

- [ ] **Step 2: Aplicar**

Run: `node scripts/rename-barber.mjs app src tests`

- [ ] **Step 3: Sobras**

```bash
grep -rIiE "barber" app src tests | grep -viE "barberschedule|barbero|barberia|barbería|barbershop"
```
Expected: sem saída. Cuidado: `src/i18n/locales/*.ts` ainda terá o rótulo `barber:` virando `professional:`; isso é esperado, o texto é tratado na Task 7.

- [ ] **Step 4: Typecheck, lint e Jest**

```bash
npm run typecheck
npx eslint app src tests
npm test -- --runInBand
```
Expected: verdes. Se o `typecheck` acusar import de caminho, é um `git mv` que não acompanhou um alias; corrigir o import à mão.

- [ ] **Step 5: Commit**

```bash
git add -A app src tests
git commit -m "refactor(app): rename barber to professional in routes, features, types and tests"
```

---

### Task 6: e2e web completo e verificação visual

**Files:** nenhum (verificação; correções pontuais se algum spec quebrar).

- [ ] **Step 1: Tirar `.env.local` do lugar**

```bash
mv .env.local /tmp/claude-1000/-home-samuel-projects-barberschedule/f22508cf-ec52-415f-9e57-7ec836eea3e6/scratchpad/env.local.bak
```

- [ ] **Step 2: Rodar a suíte inteira**

Run: `npm run test:e2e:web`
Expected: todos os specs passam. Falhas comuns: seletor por texto que mudou (`Barber` → `Professional`) ou rota `/book/professional`; corrigir o spec, não o app.

- [ ] **Step 3: Devolver `.env.local`**

```bash
mv /tmp/claude-1000/-home-samuel-projects-barberschedule/f22508cf-ec52-415f-9e57-7ec836eea3e6/scratchpad/env.local.bak .env.local
```

- [ ] **Step 4: Conferir no navegador** as telas do profissional (agenda, clientes, perfil) e do dono (equipe) com `preview_start`: screenshot e checagem de CSS computado.

- [ ] **Step 5: Commit** de qualquer correção de spec.

---

### Task 7: i18n (pt, es, en)

**Files:**
- Modify: `src/i18n/locales/pt.ts`, `src/i18n/locales/es.ts`, `src/i18n/locales/en.ts`; asserts de texto em `tests/` que dependam de "barbeiro"/"barbero"/"Barber".

- [ ] **Step 1: Listar o que falta**

```bash
grep -nE "barbeir|barbear|Barbeir|Barbear" src/i18n/locales/pt.ts | cut -c1-140
grep -nE "barber[oí]|Barber[oí]|barbería|Barbería" src/i18n/locales/es.ts | cut -c1-140
grep -nE "[Bb]arbershop|Professional" src/i18n/locales/en.ts | cut -c1-140
```

- [ ] **Step 2: Substituições seguras (sem artigo)**

```bash
sed -i -E 's/barbeiros/profissionais/g; s/Barbeiros/Profissionais/g; s/barbeiro/profissional/g; s/Barbeiro/Profissional/g' src/i18n/locales/pt.ts
sed -i -E 's/barberos/profesionales/g; s/Barberos/Profesionales/g; s/barbero/profesional/g; s/Barbero/Profesional/g' src/i18n/locales/es.ts
```

- [ ] **Step 3: Revisão manual de concordância**

`barbearia`/`barbería`/`Barbershop` → "estabelecimento"/"establecimiento"/"business". Trocar o substantivo e o artigo juntos (`a barbearia` → `o estabelecimento`, `da barbearia` → `do estabelecimento`, `sua barbearia` → `seu estabelecimento`, `nesta barbearia` → `neste estabelecimento`; es: `la barbería` → `el establecimiento`). En: `Barbershop` → `Business`, `the barbershop` → `the business`. Reler cada linha das listas do Step 1 depois da edição.

- [ ] **Step 4: Atualizar asserts de texto**

```bash
grep -rnE "[Bb]arbeiro|[Bb]arbero|[Bb]arber[ ']|barbearia|Barbershop" tests | cut -c1-140
```
Ajustar cada expectativa para o novo texto.

- [ ] **Step 5: Verificar**

```bash
npm run typecheck && npm test -- --runInBand
```
Expected: verdes.

- [ ] **Step 6: Commit**

```bash
git add -A src/i18n tests
git commit -m "refactor(i18n): professional and establishment wording in pt, es and en"
```

---

### Task 8: Docs vivas

**Files:**
- Modify/rename: `docs/decisions/013-barber-role.md` → `013-professional-role.md` e demais `docs/decisions/*.md`, `docs/*.md`
- Modify: `DESIGN_SYSTEM.md` (apenas menções ao papel "barbeiro", à mão), `README.md` (só se citar o papel)

- [ ] **Step 1: Script nas docs vivas**

```bash
node scripts/rename-barber.mjs docs/decisions docs/database.md docs/hosted-deploy.md docs/project-status.md docs/release.md docs/security.md docs/testing.md
```

- [ ] **Step 2: DESIGN_SYSTEM.md à mão**

Trocar "indicador de barbeiro em destaque" por "indicador de profissional em destaque". As menções a "barber pole", "barbearia clássica" e "placa de barbearia" descrevem a marca visual e ficam para o subprojeto da marca Zenc.

- [ ] **Step 3: Conferir**

```bash
grep -rIiE "barber" docs/decisions docs/*.md README.md | grep -viE "barberschedule|barbero|barbershop|barber pole" | head
```
Expected: sem saída (ou só menções históricas conscientes em `project-status.md`, que devem ganhar uma nota "renomeado em 2026-11-11").

- [ ] **Step 4: Commit**

```bash
git add -A docs DESIGN_SYSTEM.md README.md
git commit -m "docs: professional wording in decisions, status and design system"
```

---

### Task 9: Limpeza, verificação final e PR

**Files:**
- Delete: `scripts/rename-barber.mjs`, `scripts/rename-barber.test.mjs`

- [ ] **Step 1: Remover o script**

```bash
git rm scripts/rename-barber.mjs scripts/rename-barber.test.mjs
git commit -m "chore: drop the one-off rename script"
```

- [ ] **Step 2: Verificação completa**

```bash
grep -rIiE "barber" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.claude --exclude-dir=graphify-out --exclude-dir=dist --exclude-dir=.expo --exclude-dir=superpowers | grep -viE "barberschedule|barbero|barbería|barbershop|barber pole|package-lock" | head
npm run verify
```
Expected: o grep sem saída e `verify` verde (typecheck, eslint, Jest, runner, pgTAP). Reexecutar `npm run test:e2e:web` (Task 6) na árvore final.

- [ ] **Step 3: Push e PR** (usuário delegou push e PR; sem force-push e sem merge)

```bash
git push -u origin refactor-professional-rename
gh pr create --title "refactor: rename barber to professional" --body "<resumo + checklist de verificação>"
```
Depois: `get_status`/`bind_pr` e ligar o Auto-fix (`set_monitor`).

- [ ] **Step 4: Memória do projeto** — registrar o renomeio concluído, o baseline pgTAP e que o `db reset` foi feito.
