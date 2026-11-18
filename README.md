# Zenc

Sistema de agendamento para estabelecimentos de beleza (barbearias, salões, nail e lash
designers, trancistas e similares), com aplicações Web e mobile em Expo,
autenticação, catálogo, agenda, disponibilidade, recorrências e integração
com Supabase.

## Requisitos

- Node.js e npm
- Docker, para os testes locais do Supabase

## Configuração

```bash
npm install
cp .env.example .env.local
```

Preencha `EXPO_PUBLIC_SUPABASE_URL` e
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` em `.env.local`.

## Desenvolvimento

```bash
npm run start
npm run web
```

## Verificação

```bash
npm run verify
npm run test:e2e:web
npm run export:web
```

Os testes Web usam respostas Supabase determinísticas. Os testes Jest e pgTAP
cobrem as regras de domínio, autorização, concorrência e persistência.

## Documentação

- `docs/project-status.md`: estado atual e histórico por tarefa.
- `docs/decisions/`: registros de decisão (marca, vocabulário, tema por loja, papéis, LGPD, concorrência).
- `docs/testing.md` e `docs/release.md`: como verificar e publicar. O e2e Web não roda no CI.
- `docs/hosted-deploy.md`: checklist do primeiro deploy no Supabase hospedado (ainda não existe ambiente hospedado).
- Migrations: podem ser reescritas apenas até o primeiro deploy hospedado; depois são só de acréscimo
  (decisão `018`).
