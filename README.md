# Barberschedule

Sistema de agendamento para barbearias, com aplicações Web e mobile em Expo,
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
