# Tema por loja (white-label de cores) — design

Data: 2026-11-11 · Subprojeto da expansão do Zenc para o setor de beleza (marca, vocabulário neutro e
renomeio barber → professional já estão em `main`/PR #91; landing, logo e GitHub da empresa são separados).

## Objetivo

Cada estabelecimento escolhe as cores do seu app ao contratar: **principal**, **destaque** e **base**. Quem não
escolhe vê o padrão Zenc, que não muda. Um único binário atende todas as lojas, então o tema é resolvido em
tempo de execução.

## Decisões (aprovadas em 2026-11-11)

- **3 cores**, todas opcionais. Nulo = padrão Zenc; destaque nulo = usa a principal.
  - **Destaque** (`accent`): botões de ação preenchidos (agendar, entrar, confirmar, salvar): o `Button` de
    variante primária (96 usos) e o `FabAdd`.
  - **Principal** (`primary-*`): identidade: aba ativa, preços, links e botões ghost, borda/fundo de item
    selecionado, foco de campo, barra de progresso, ponto do calendário, selo do avatar.
  - **Base**: tom das superfícies e do texto (`canvas`, `surface`, `mist`, `neutral-*`, `ink`). É um **tom claro**:
    só matiz e intensidade da cor escolhida entram; a luminosidade de cada token é fixa. **Não há modo escuro**
    (o app é `userInterfaceStyle: light`); modo escuro por loja é um projeto à parte.
- **Fixos para todas as lojas:** cores de status e erro (`danger`, `success`, `warning`), `white`, paleta categórica
  dos gráficos, barra de status, splash e ícone do app.
- O token `wine` (e `ink-soft`) tem 0 usos e sai.
- **Padrão Zenc inalterado:** os valores atuais ficam em `DEFAULT_COLORS` (`src/lib/design/colors.ts`, sem imports,
  junto de `colorsToVars`) e no `global.css`; a derivação roda só para cores personalizadas. Valores iguais às
  amostras padrão (`#DB9A34`, `#F7F3EE`) contam como "não escolhidos", preservando o padrão exato. Com tudo nulo, o
  provider **na web** não escreve nenhuma variável; **no nativo** ele sempre aplica `vars()`, inclusive o padrão, para
  não depender de `:root` do CSS no nativo.
- **Quando vale:** só depois do login, em todas as plataformas. Antes, padrão Zenc. O tema pré-login por
  subdomínio (`<slug>.zencpro.app`) entra com o subprojeto de resolução de loja; só a origem de "qual é a loja
  atual" muda. Hoje a loja atual é a primeira loja (suposição de loja única, igual às outras telas).
- **Sem dependência nova:** conversão sRGB ↔ OKLab/OKLCH escrita à mão (~40 linhas, testada contra valores de
  referência). Se crescer, troca-se por `culori`.

## Dados

Migration aditiva `supabase/migrations/0066_shop_theme.sql`:

- `shops.theme_primary`, `shops.theme_accent`, `shops.theme_base`: `text` nulo, com
  `check (col is null or col ~ '^#[0-9A-Fa-f]{6}$')`.
- `grant select (theme_primary, theme_accent, theme_base) on public.shops to anon, authenticated;`
  `grant update (theme_primary, theme_accent, theme_base) on public.shops to authenticated;`
  A escrita continua restrita ao dono pela política `shops_update_owner` existente.
- pgTAP (`supabase/tests/048_shop_theme.sql`): hex inválido é rejeitado; `anon` lê; o dono grava; profissional e
  cliente não conseguem gravar.

## Derivação (`src/lib/design/theme/derive.ts`, função pura)

Ajustes de 2026-11-11: ver o plano `2026-11-11-shop-theme.md`, seção "Ajustes ao spec".

Assinatura: `deriveTheme(input: { primary?: string | null; accent?: string | null; base?: string | null }): Theme`
com `Theme = { vars: Record<string, string>; colors: Colors; adjusted: { primary: boolean; accent: boolean } }`.
`vars` usa chaves `--c-<token>` e valores `"R G B"` (inteiros 0–255), para `rgb(var(--c-x) / <alpha-value>)`.
Tokens: `primary-50…900`, `accent`, `on-accent`, `on-primary`, `canvas`, `surface`, `mist`, `ink`, `neutral-50…900`
(`ink` = `neutral-900`).

**Referência medida (padrão atual, OKLCH):**

| passo | primary L | primary C | neutral L | neutral C |
|---|---|---|---|---|
| 50 | 0.976 | 0.015 | 0.980 | 0.005 |
| 100 | 0.938 | 0.042 | 0.951 | 0.009 |
| 200 | 0.869 | 0.090 | 0.900 | 0.016 |
| 300 | 0.796 | 0.126 | 0.810 | 0.026 |
| 400 | 0.733 | 0.137 | 0.654 | 0.032 |
| 500 | 0.647 | 0.128 | 0.515 | 0.030 |
| 600 | 0.560 | 0.111 | 0.417 | 0.026 |
| 700 | 0.463 | 0.090 | 0.328 | 0.025 |
| 800 | 0.368 | 0.070 | 0.261 | 0.019 |
| 900 | 0.283 | 0.051 | 0.194 | 0.006 |

`canvas` L 0.966 C 0.008; `surface` L 0.995 C 0.005; `mist` L 0.927 C 0.013.

**Cor de preenchimento (principal 400 e destaque):**
1. Converter para OKLCH. Limitar L a [0.15, 0.88] (ajuste de 2026-11-11: o piso 0.40 marcaria como "ajustadas"
   as nossas próprias amostras escuras, como o Vinho e o Preto).
2. `on` = o de maior contraste entre `ink` (da base efetiva) e branco.
3. Se contraste(`on`, preenchimento) < 4.5, mover L (mais claro se `on` = ink, mais escuro se `on` = branco) em
   passos de 0.01 (máx. 50), reduzindo a intensidade até caber no gamut sRGB. Marcar `adjusted`.

**Escala principal (50–900):** o preenchimento ajustado ancora o 400. Para k < 400, `L_k = A + t·(L50 − A)` com
`t = (L_k,padrão − L400,padrão) / (L50,padrão − L400,padrão)`; para k > 400, `L_k = A − t·(A − L900)` (com `L900 = min(L900,padrão, A − 0.12)`) com
`t = (L400,padrão − L_k,padrão) / (L400,padrão − L900,padrão)` (A = L do âncora; extremos fixos, sempre
monótona). Matiz = o da cor escolhida; `C_k = C_k,padrão · clamp(C_âncora / 0.137, 0.25, 2)`, reduzida ao gamut.
Depois: baixar `L_600` (e `L_700`) até contraste ≥ 4.5 contra `canvas` efetivo e garantir L estritamente
decrescente de 400 a 900 com folga mínima de 0.02. No preto puro os degraus 800 e 900 podem
cair no mesmo hex (resolução de 8 bits); o contrato testado é estrito até o 600 e não crescente depois. Uma cor sem
matiz (preto, cinza, branco; C < 0.01) gera escala neutra, com intensidade zero.

**Base:** matiz da cor escolhida; `C_k = C_k,padrão · clamp(C_escolhida / 0.008, 0, 2)` para `neutral-*`, `canvas`,
`surface` e `mist`; L de cada token fixo (tabela acima). Cinza ou branco escolhidos geram neutros sem tom.

**Destaque nulo:** `accent` = preenchimento 400 da principal; `on-accent` = `on-primary`.
**Todas nulas:** devolve `DEFAULT_THEME` (valores atuais, sem derivação).

**Contratos testados (entre 500 cores sorteadas com semente fixa e os extremos amarelo puro, azul-marinho, cinza,
preto, branco):** `on-primary`/`on-accent` sobre o preenchimento ≥ 4.5; `primary-600` sobre `canvas` ≥ 4.5;
`neutral-500…900` e `ink` sobre `canvas` e `surface` ≥ 4.5; `neutral-400` sobre `canvas` ≥ 98% de 2.89
(razão do padrão, texto de apoio). **Lacuna conhecida do padrão:** `primary-600` sobre `canvas` mede 4.31
(4.69 sobre `surface`); fica como está para não alterar o visual atual e entra na revisão da paleta Zenc.

## Mecanismo no app

- `tailwind.config.ts`: `primary`, `canvas`, `surface`, `mist`, `ink`, `neutral` e os novos `accent`,
  `on-accent`, `on-primary` viram `rgb(var(--c-…) / <alpha-value>)`. `danger`, `success`, `warning` seguem em hex.
  Os 510 usos de `className` não mudam; `Button` primário e `FabAdd` passam de `primary` para `accent`.
- `global.css`: `:root { --c-…: R G B; }` com os valores padrão. Um teste compara o CSS com `DEFAULT_COLORS`.
- `ThemeProvider` (`src/lib/design/theme/ThemeProvider.tsx`): aplica `theme.vars`. **Web:** escreve em
  `document.documentElement.style` (o `Modal` do react-native-web renderiza em `document.body`, fora da raiz do
  app; 4 pop-ups usam `Modal`). **Nativo:** `<View style={vars(theme.vars)} className="flex-1">` na raiz (o
  contexto do React atravessa o `Modal`). Sem personalização não escreve nada.
- `ThemeScope`: mesmo `vars()`, escopado a uma subárvore, para a pré-visualização da tela Aparência.
- `useColors(): Colors`: mesmo formato do `colors` atual (hex), menos `wine`/`inkSoft`, mais `accent`,
  `onAccent`, `onPrimary`. Os 29 arquivos que importam `colors` passam a chamar o hook; o layout raiz usa o hook
  para o fundo dos navegadores. `colors.ts` continua exportando o padrão como `DEFAULT_COLORS`.
- **Loja atual:** `useShopTheme()` (primeira loja; uma consulta devolve `shopId` e as 3 cores)
  (`select theme_primary, theme_accent, theme_base`). Cache do último tema por loja em `key-value-storage`
  (`zenc.shop-theme.<userId>`, por usuário, pois a loja só é conhecida depois da consulta) para a próxima abertura nascer na cor certa. O layout raiz mantém a tela de
  carregamento enquanto há sessão e o tema ainda não foi resolvido.
- **Risco técnico:** `vars()` do NativeWind 4.2.7 ainda não foi provado neste app (nativo e `Modal` da web). A
  primeira tarefa do plano é um spike descartável; se falhar, o desenho volta para revisão antes de migrar telas.

## Tela Aparência (`app/(owner)/appearance.tsx`)

- Entrada no hub Gerenciar (`app/(owner)/manage.tsx`), ao lado de "Dados do estabelecimento" (`/shop`); pai da
  rota `/appearance` em `src/lib/navigation/parents.ts`: `/manage`.
- Três linhas: cor principal, cor de destaque (com "usar a mesma da principal") e cor de base.
- Seletor: grade de amostras + campo hex com máscara `#RRGGBB`, sem biblioteca de color picker.
  Amostras de principal/destaque: Âmbar `#DB9A34` (padrão), Terracota `#C2593A`, Vinho `#7A1F2B`,
  Rosa `#D9588A`, Violeta `#7C5CE0`, Azul `#2F6FDB`, Turquesa `#1BA39C`, Verde `#2F9E5B`, Grafite `#3D3327`,
  Preto `#171412`. Amostras de base: Quente `#F7F3EE` (padrão), Neutro `#F5F5F5`, Frio `#EEF3F8`,
  Rosado `#F8EFF1`, Verde claro `#EFF5F0`, Lavanda `#F3F0F8`.
- Pré-visualização ao vivo em `ThemeScope`: botão de ação, aba ativa, preço, item selecionado e dia selecionado,
  com as cores do rascunho. Só rascunho; o resto da tela não muda enquanto se escolhe.
- **Salvar** grava as 3 colunas (`updateShopTheme`) e invalida a query do tema (o app inteiro troca na hora);
  Toast de sucesso. **Voltar ao padrão Zenc** pede confirmação (`ConfirmDialog`) e grava nulos.
- Se `adjusted` for verdadeiro: mostra a cor realmente usada e uma frase curta. Não bloqueia o salvamento.
- Validação com zod (`^#[0-9A-Fa-f]{6}$`, normalizando para maiúsculas); erros em i18n
  (`owner.appearance.*` em pt/es/en). Formulário segue `KeyboardAwareScrollView` e `useFieldChain`.
- Profissionais e clientes só veem o tema; apenas o dono edita (grupo `(owner)` e RLS).

## Testes (TDD, nesta ordem)

1. Derivação (unit), contratos acima, mais: tudo nulo devolve `DEFAULT_THEME`; destaque nulo usa a principal;
   escala monótona; chaves de `vars` iguais às do `global.css`.
2. pgTAP da migration.
3. Jest: o provider emite as variáveis certas e não escreve nada com tudo nulo; `useColors` reflete o tema;
   validação hex; `updateShopTheme`.
4. e2e (Playwright com Chrome do sistema, REST mockado): o dono escolhe uma cor, a pré-visualização muda
   (CSS computado) e a requisição leva os valores certos; depois o botão de ação da home e um pop-up (`Modal`)
   saem na cor escolhida; "voltar ao padrão" limpa tudo.
5. Verificação visual no navegador (captura e CSS computado) das telas de cliente, dono e profissional com e sem
   tema. Pendente do usuário: teste no celular para confirmar `vars()` no nativo.

## Entrega

- **PR A, tokens:** spike, derivação, `DEFAULT_COLORS`, tokens do Tailwind, `global.css`, `ThemeProvider`,
  `useColors`, troca nos 29 arquivos, `Button`/`FabAdd` em `accent`, remoção de `wine`. Sem mudança visível com o
  padrão.
- **PR B, tema da loja:** migration `0066`, `useShopTheme`/cache/espera no carregamento,
  tela Aparência, i18n, e2e. Branch a partir da A.

## Fora de escopo

Modo escuro por loja; logo da loja; tema pré-login por subdomínio; cor por profissional; paleta dos gráficos;
splash e ícone por loja; ajuste do `primary-600` padrão (revisão da paleta Zenc); reescrita do `DESIGN_SYSTEM.md`
(vem depois, com logo e paleta); atualização do Figma.
