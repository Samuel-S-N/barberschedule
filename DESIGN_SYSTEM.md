# Design System — Barberschedule

App de agendamento para barbearias. Stack: **React Native · Expo · TypeScript · NativeWind v4 · Tailwind v3**.

Este documento é a **fonte de verdade da marca e dos tokens visuais**, seguindo a mesma convenção/estrutura usada no FitBrother (tokens NativeWind, tipografia dupla display/corpo, ícones via lucide, motion via Reanimated).

**Direção de marca:** barbearia clássica revisitada — couro, aço escovado, latão. Âmbar/dourado como cor de ação sobre uma âncora quase-preta quente (carvão), com uma segunda cor de assinatura (vinho) para toques pontuais que remetem ao barber pole. Tipografia condensada em caps para headers (placa de barbearia), corpo neutro e legível.

---

## 0. Setup necessário (equivalente ao §0 do FitBrother)

```bash
npx expo install nativewind tailwindcss@^3
npx expo install expo-font @expo-google-fonts/oswald @expo-google-fonts/inter
npx expo install lucide-react-native react-native-svg
npx expo install react-native-reanimated
```

Criar `tailwind.config.ts`, `lib/colors.ts` (espelho JS dos tokens abaixo, para SVG/Reanimated) e `lib/motion.ts` na raiz do app, junto com `global.css` + `babel.config.js`/`metro.config.js` configurados para NativeWind (o app ainda não tem NativeWind instalado — stack atual do barberschedule é Expo Router + React 19 + RN puro, sem lib de estilo).

---

## 1. Convenções e Regras de Ouro

Mesmas regras do FitBrother — valem integralmente aqui:

### 1.1 Tipografia
`font-medium`/`font-semibold`/`font-bold` só aplicam `fontWeight`, não trocam a família em React Native. **Sempre usar a família correspondente ao peso.**

| Peso | Classe correta ✅ | Classe ERRADA ❌ |
|---|---|---|
| 400 Regular | `font-sans` | (sem classe) |
| 500 Medium | `font-sans-medium` | `font-medium` |
| 600 SemiBold | `font-sans-semibold` | `font-semibold` |
| 700 Bold | `font-sans-bold` | `font-bold` |

### 1.2 Números → `tabular-nums`
Preço, duração, horário e contadores usam `fontVariant: ["tabular-nums"]` para não "pular" no layout.

```tsx
<Text
  className="text-2xl font-display-bold text-primary-600"
  style={{ fontVariant: ["tabular-nums"] }}
>
  R$ 65,00
</Text>
```

### 1.3 Cores via tokens
Proibido `#hex` inline em JSX. Exceção: `react-native-svg`/Reanimated → importar de `@/lib/colors.ts`.

### 1.4 Hit target mínimo
`min-w-[44px] min-h-[44px]` ou `hitSlop={8}`.

### 1.5 Espaçamento
Base 4px, escala Tailwind padrão. Nada de valores soltos fora do theme.

---

## 2. Paleta de Cores

### 2.1 Marca — Âmbar (primary)

Dourado quente, remete a latão polido e navalha — CTAs, preços, ícones ativos, anel de avatar do barbeiro em destaque.

| Escala | HEX | Uso |
|---|---|---|
| 50 | `#FDF6EC` | Surface âmbar muito suave |
| 100 | `#FAE8CC` | Background de badge/chip |
| 200 | `#F3CE8F` | Decorações, disabled |
| 300 | `#EAB157` | Âmbar claro |
| **400** | **`#DB9A34`** | **PRIMÁRIA — botões, ícones ativos, preços, bordas ativas** |
| 500 | `#BD8020` | Pressed/hover |
| 600 | `#9C6819` | **Âmbar de texto/realce sobre claro** (melhor contraste) |
| 700 | `#784F14` | Ênfase alta |
| 800 | `#56380E` | Ênfase muito alta |
| 900 | `#392509` | Quase preto âmbar |

> **Contraste:** âmbar-400 sobre branco não atinge AA para texto pequeno. Use como preenchimento (texto `ink` por cima) ou, para texto, use âmbar-600 em peso forte. Texto `ink` sobre âmbar-400 ✅. Texto branco sobre âmbar-400 ⚠️ evitar em texto pequeno.

### 2.2 Marca — Carvão & superfícies

Âncora escura quente (não é slate frio) — remete a couro e aço escurecido.

| Token | HEX | Uso |
|---|---|---|
| `ink` | `#171412` | Texto principal, botão dark, contraste máximo |
| `ink-soft` | `#241F1B` | Variante levemente mais clara (headers dark, nav) |
| `canvas` | `#F7F3EE` | Fundo de tela (creme quente, "papel envelhecido") |
| `surface` | `#FFFDFA` | Cards |
| `mist` | `#ECE6DE` | Seções/fills alternados, skeleton base |

### 2.3 Assinatura — Vinho (accent, uso pontual)

Segunda cor de marca — referência ao vermelho do barber pole, usada com moderação: badge "Popular", indicador de barbeiro em destaque, detalhe decorativo. **Não usar como CTA principal** (isso é papel do âmbar).

| Token | HEX | Uso |
|---|---|---|
| `wine-500` | `#7A1F2B` | Badge "Popular"/"Top", ring de destaque |
| `wine-100` | `#F4DBDD` | Background do badge |
| `wine-50` | `#FBEEEF` | Surface |

### 2.4 Neutros (stone — tom quente)

| Escala | HEX | Uso |
|---|---|---|
| 50 | `#FAF8F5` | Fundo de itens de lista, skeleton base |
| 100 | `#F2EEE8` | Fundo de card flat, divider suave |
| 200 | `#E4DDD3` | Bordas de inputs/cards, dividers |
| 300 | `#CBBFAF` | Placeholder icons, elementos inativos |
| 400 | `#9C8E7B` | Placeholder text |
| 500 | `#736555` | Body text secundário, meta info |
| 600 | `#564A3D` | Texto secundário com mais peso |
| 700 | `#3D3327` | Texto de label, headings menores |
| **800** | **`#2A231A`** | **Headings principais** |
| **900** | **`#171412`** | **= `ink`, texto de máximo contraste** |

### 2.5 Feedback

| Token | HEX | Uso |
|---|---|---|
| `danger-50` | `#FDF1F0` | Fundo do banner de erro |
| `danger-500` | `#DC3B30` | Texto/ícone de erro |
| `danger-600` | `#B92C22` | Borda do banner de erro |
| `success-500` | `#2F9E5B` | Agendamento confirmado |
| `warning-400` | `#E8A93B` | Avisos leves (tom levemente diferente do primary p/ não confundir com CTA) |
| `warning-500` | `#C98A1F` | Avisos médios, "pendente de confirmação" |

### 2.6 Status de agendamento (domínio Barberschedule)

| Token | HEX | Uso |
|---|---|---|
| `status-confirmed` | `success-500` `#2F9E5B` | Badge/borda "Confirmado" |
| `status-pending` | `warning-500` `#C98A1F` | Badge/borda "Pendente" |
| `status-cancelled` | `neutral-400` `#9C8E7B` | Badge/borda "Cancelado" (texto riscado) |
| `status-completed` | `neutral-600` `#564A3D` | Badge "Concluído", histórico |

**Convenção de ícones (lucide-react-native):**
- Corte: `Scissors`
- Barba: `Sparkles` (ou ícone custom de navalha)
- Horário: `Clock`
- Data: `Calendar`
- Barbeiro: `User`
- Avaliação: `Star`
- Local: `MapPin`

---

## 3. Tipografia

### 3.1 Famílias

- **Oswald** — **display**: headings, nome de barbearia/barbeiro em destaque, preços, título de tela. Condensada, remete a placa de barbearia/tipografia de sinalização vintage.
- **Inter** — **corpo**: parágrafos, labels, inputs, metadados (mesma escolha do FitBrother — mantém consistência e legibilidade entre produtos).

```bash
npx expo install expo-font @expo-google-fonts/oswald @expo-google-fonts/inter
```

```ts
// app/_layout.tsx
import { useFonts } from "expo-font";
import {
  Oswald_500Medium,
  Oswald_600SemiBold,
  Oswald_700Bold,
} from "@expo-google-fonts/oswald";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
```

**Mapa de papéis:** `font-display-*` (Oswald) para títulos, nome de barbeiro/barbearia e preços; `font-sans-*` (Inter) para corpo. Pegadinha do §1.1 vale para ambas.

### 3.2 Escala

| Token | px | line-height | Uso |
|---|---|---|---|
| `text-xs`   | 12 | 16 | Meta info, timestamps, duração do serviço |
| `text-sm`   | 14 | 20 | Labels de input, helper text, subtítulo de card |
| `text-base` | 16 | 24 | Corpo padrão, texto de input |
| `text-lg`   | 18 | 28 | Item title (nome do serviço), subtítulo de seção |
| `text-xl`   | 20 | 28 | Título menor de tela |
| `text-2xl`  | 24 | 32 | Preço de destaque em card |
| `text-3xl`  | 28 | 36 | Heading de onboarding/tela |
| `text-4xl`  | 32 | 40 | Heading grande (nome da barbearia no perfil) |
| `text-5xl`  | 40 | 48 | Hero number (ex.: horário selecionado em destaque) |

### 3.3 Pesos

| Classe | Peso | Uso |
|---|---|---|
| `font-sans` | 400 | Body, placeholder |
| `font-sans-medium` | 500 | Labels, subtítulos |
| `font-sans-semibold` | 600 | Botões, labels de campo |
| `font-sans-bold` | 700 | Headings de card, preços |
| `font-display-semibold` | 600 | Títulos de tela |
| `font-display-bold` | 700 | Nome de barbearia, hero |

---

## 4. Espaçamento

Base **4px** (Tailwind padrão) — igual FitBrother.

| Classe | px | Uso |
|---|---|---|
| `p-1` | 4 | Micro espaço, ícones |
| `p-2` | 8 | Gaps apertados |
| `p-3` | 12 | Gap ícone↔label, padding de badge |
| `p-4` | 16 | Padding interno padrão (cards, inputs) |
| `p-5` | 20 | Padding horizontal de tela (`safe-horizontal`) |
| `p-6` | 24 | Seções maiores |
| `p-8` | 32 | Espaço entre seções principais |

Tokens semânticos extras em `tailwind.config.ts`:
- `safe-horizontal` (20px)
- `input-height` (52px), `button-height` (52px), `button-height-sm` (44px), `button-height-lg` (60px)
- `slot-height` (56px) — altura de item na grade de horários

---

## 5. Formas e Bordas

| Elemento | Valor | Classe |
|---|---|---|
| Botões (primário, dark) | 9999px | `rounded-full` |
| Inputs | 12px | `rounded-xl` |
| Cards | 20px | `rounded-[20px]` |
| Badges/chips/status | 9999px | `rounded-full` |
| Avatar de barbeiro | 50% | `rounded-full` |
| Time slot (chip de horário) | 12px | `rounded-xl` |
| Bottom sheet (topo) | 24px | `rounded-t-3xl` |

| Uso | Estilo |
|---|---|
| Input repouso | `border border-neutral-200` |
| Input focused | `border-[1.5px] border-primary-400` |
| Input error | `border-[1.5px] border-danger-500` |
| Card outlined | `border border-neutral-200` |
| Time slot selecionado | `border-[1.5px] border-primary-400 bg-primary-50` |
| Time slot indisponível | `bg-neutral-100 opacity-50` (não clicável) |

---

## 6. Elevação e Sombras

Mesma lógica do FitBrother — iOS via `shadow*`, Android via `elevation` explícito (`Platform.select`).

**Nível 1 — Card padrão:** `shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: {0,1}, elevation: 2`
**Nível 2 — Card em destaque (ex. barbeiro selecionado):** `shadowOpacity: 0.10, shadowRadius: 12, shadowOffset: {0,4}, elevation: 5`
**Nível 3 — Bottom sheet, modal:** `shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: {0,-2}, elevation: 12`

---

## 7. Motion

`lib/motion.ts` — mesmos tokens do FitBrother:

```ts
export const Motion = {
  duration: { fast: 120, base: 200, slow: 300, slower: 500 },
  easing: {
    standard: [0.4, 0, 0.2, 1],
    accelerate: [0.4, 0, 1, 1],
    decelerate: [0, 0, 0.2, 1],
  },
} as const;
```

**Usos canônicos:**
- Botão pressed: scale `0.97`, `duration.fast`
- Seleção de time slot: scale `1.03` + fade da borda, `duration.fast`
- Bottom sheet open: `duration.base`, decelerate
- Troca de status do agendamento (badge): fade cross, `duration.base`
- Toast: slide-down `duration.base` decelerate

---

## 8. Acessibilidade

Idêntico ao FitBrother: hit target 44×44, contraste 4.5:1 (texto <18pt) / 3:1 (≥18pt), `accessibilityLabel` obrigatório em ícone-only, `accessibilityRole`/`accessibilityState` em interativos, respeitar `useReducedMotion()`.

Combinações testadas: `neutral-500` em `canvas` ✅, `ink` em `neutral-50` ✅, `white` em `primary-400` ⚠️ (usar só em texto grande/bold), `ink` em `primary-400` ✅.

---

## 9. Ícones

**Biblioteca única: `lucide-react-native`** (igual FitBrother).

```bash
npx expo install lucide-react-native react-native-svg
```

| Contexto | Size |
|---|---|
| Inline em texto | 16 |
| Leading icon em input | 20 |
| Icon button (44×44 hit) | 24 |
| Feature icon (empty state) | 32–40 |
| Tab bar | 24 |

Cor sempre via prop `color`, importada de `@/lib/colors.ts`.

---

## 10. Dark Mode

Fora do MVP, mesma decisão do FitBrother. Não usar `dark:` em código inicialmente.

---

## 11. Componentes Base

Mesmos componentes-base do FitBrother (`Button`, `Input`, `Card`, `Checkbox`, banners, progress bar), só trocando os tokens de cor:

### 11.1 Button

| Variante | Fundo | Texto | Borda |
|---|---|---|---|
| `primary` | `primary-400` | `ink` (não branco — melhor contraste no âmbar) | — |
| `dark` | `ink` | white | — |
| `outline` | transparent | `neutral-800` | `neutral-200` |
| `ghost` | transparent | `primary-600` | — |
| `danger` | `danger-500` | white | — |

Tamanhos: `sm` 44px, `md` 52px (padrão), `lg` 60px. `rounded-full · px-6 · font-sans-semibold`.

### 11.2 Input

`rounded-xl · border-neutral-200`, focused → `primary-400`, error → `danger-500`. Igual estrutura do FitBrother.

### 11.3 Card

| Variante | Fundo | Borda | Sombra |
|---|---|---|---|
| `elevated` | `surface` | — | Nível 1 |
| `outlined` | `surface` | `neutral-200` | — |
| `flat` | `neutral-50` | — | — |

`p-4 · rounded-[20px]`.

---

## 12. Componentes do Domínio Barbearia

> Specs para os componentes específicos deste produto.

### 12.1 Barber Card

```
┌────────────────────────────────────────┐
│  [avatar]  João Silva          ⭐ 4.9  │
│            Especialista em barba        │
│            📍 2.3 km                    │
└────────────────────────────────────────┘
   Card outlined · p-4 · avatar 56px rounded-full
   nome: text-lg font-display-semibold ink
   especialidade: text-sm font-sans neutral-500
   rating: text-sm font-sans-semibold + Star 14 warning-400 fill
```

Selecionado: borda `primary-400` + `bg-primary-50`.

### 12.2 Service Card / Chip

```
┌──────────────────────────────────┐
│ ✂  Corte + Barba          45 min │
│                            R$ 65 │
└──────────────────────────────────┘
   Card flat · p-4
   nome: text-base font-sans-semibold ink
   duração: text-xs font-sans neutral-500 + Clock 14
   preço: text-xl font-display-bold primary-600 · tabular-nums
```

### 12.3 Time Slot Picker (grade de horários)

```
 09:00   09:30   10:00   10:30
┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐
│09:00│ │09:30│ │▓▓▓▓▓│ │10:30│
└─────┘ └─────┘ └─────┘ └─────┘
 livre   livre  ocupado  livre
```

Grid `gap-2`, cada slot `slot-height` (56px) `rounded-xl`.
- Livre: `border border-neutral-200 bg-surface`, texto `neutral-800 font-sans-medium tabular-nums`
- Selecionado: `border-[1.5px] border-primary-400 bg-primary-50`, texto `primary-600 font-sans-bold`
- Ocupado: `bg-neutral-100`, texto `neutral-300`, não clicável, sem sombra

### 12.4 Appointment / Booking Card

```
┌──────────────────────────────────────────────┐
│ Confirmado                          ⋯        │ ← status badge
│ ✂ Corte + Barba · João Silva                 │
│ 📅 Qui, 18 set · 🕐 14:30                    │
│ ──────────────────────────────────────────── │
│ Barbearia Alfa · R. das Flores, 123          │
└──────────────────────────────────────────────┘
   Card elevated · p-4
   status badge: rounded-full px-3 py-1 text-xs font-sans-semibold
     confirmado → bg-success-500/10 text-success-500
     pendente   → bg-warning-500/10 text-warning-500
     cancelado  → bg-neutral-100 text-neutral-400 (texto do card com opacity-60)
```

### 12.5 Status Badge

```
● Confirmado    ● Pendente    ● Cancelado    ● Concluído
```
`rounded-full · px-3 · py-1 · text-xs font-sans-semibold`, cor conforme §2.6, com um dot (`●`, 6px) da mesma cor à esquerda do texto.

### 12.6 Calendar Strip (seletor de data horizontal)

```
 QUI    SEX    SÁB    DOM    SEG
  18     19     20     21     22
┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐
│ ●  │ │    │ │    │ │    │ │    │
└────┘ └────┘ └────┘ └────┘ └────┘
```

Item `w-14 h-16 rounded-2xl`. Selecionado: `bg-ink`, dia da semana + número em `white`. Não selecionado: `bg-transparent`, texto `neutral-600`. Dia com agendamento existente: dot `primary-400` abaixo do número.

### 12.7 Rating Stars

`Star` (lucide) 16px, `fill={warning-400}` `stroke={warning-400}` para preenchida; vazia: `stroke={neutral-300}` sem fill. Usado em Barber Card e em tela de avaliação pós-atendimento.

### 12.8 Empty State

```
        ╭───────╮
        │   ✂   │   ← lucide Scissors · 64 · neutral-300
        ╰───────╯
   Nenhum agendamento ainda   ← text-lg font-display-semibold ink
   Escolha um barbeiro e reserve seu horário  ← text-sm font-sans neutral-500
        [   Agendar agora   ]  ← Button primary sm
```

### 12.9 Bottom Tab Bar

4 tabs: **Início** (`House`), **Agenda** (`Calendar`), **Barbeiros** (`Users`), **Perfil** (`User`).

```
┌─────────────────────────────────────────────┐
│  Início   Agenda   Barbeiros   Perfil        │
│    ◯        ●          ◯          ◯          │
└─────────────────────────────────────────────┘
```
Ícone lucide 24, ativa: `primary-600` + label visível; inativa: `neutral-400`.

> **Implementação (área do cliente):** as abas são Home / Book / Agenda / Profile (`BottomTabBar` é apresentacional; os itens vêm do layout). Todas as abas mostram o label; a ativa muda apenas de cor e peso. "Barbeiros" não é uma aba: a escolha de barbeiro faz parte do fluxo Book.

### 12.10 Toast

`success` (agendamento confirmado) / `error` / `info`, mesma estrutura do FitBrother: `rounded-2xl · p-4 · text-sm font-sans-medium`, Sombra Nível 2, auto-dismiss 3s.

### 12.11 Skeleton Loader

Base `bg-neutral-100`, shimmer para `neutral-200`, mesmos componentes wrapper (`SkeletonBlock`, `SkeletonText`, `SkeletonCircle`).

---

## 13. Referência NativeWind

```tsx
// ✅ Correto
<View className="flex-1 bg-canvas px-5">
  <Text className="text-3xl font-display-bold text-ink">
    Barbearia Alfa
  </Text>
  <Text
    className="text-2xl font-display-bold text-primary-600"
    style={{ fontVariant: ["tabular-nums"] }}
  >
    R$ 65,00
  </Text>
</View>

// ❌ Errado — não usar tags HTML, nunca font-bold/font-medium/etc.
<div className="...">
  <h1 className="font-bold">Barbearia Alfa</h1>
</div>
```

```ts
import { colors } from "@/lib/colors";
import { Motion } from "@/lib/motion";
import { Button, Input, Card } from "@/components";
import { Scissors, Clock, Calendar, User, Star } from "lucide-react-native";
```

---

## 14. Próximos passos no Claude Code CLI

1. `npx expo install nativewind tailwindcss@^3` + configurar `tailwind.config.ts` (copiar estrutura de escala do FitBrother, trocar valores de cor pelos desta tabela), `global.css`, `babel.config.js` (plugin nativewind) e `metro.config.js` (`withNativeWind`).
2. Criar `lib/colors.ts` espelhando os tokens do §2 e `lib/motion.ts` com o objeto do §7.
3. Instalar fontes (`@expo-google-fonts/oswald`, `@expo-google-fonts/inter`) e registrar em `app/_layout.tsx` via `useFonts`.
4. Instalar `lucide-react-native` + `react-native-svg`.
5. Construir os componentes base do §11 (`Button`, `Input`, `Card`) antes de qualquer tela.
6. Construir os componentes de domínio do §12 conforme as telas forem sendo implementadas (Barber Card, Service Card, Time Slot Picker, Appointment Card primeiro — são o núcleo do fluxo de agendamento).

---

*v1 — design system inicial do Barberschedule, seguindo a mesma convenção de tokens/estrutura do FitBrother (NativeWind v4, tipografia dupla display/corpo, ícones lucide, motion via Reanimated), com paleta e componentes de domínio próprios (âmbar/carvão/vinho, agendamento em vez de nutrição).*
