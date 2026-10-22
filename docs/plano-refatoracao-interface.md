# Plano de refatoração da interface do Cooder

**Data:** 22 de outubro de 2026
**Base:** estado do código após a primeira etapa descrita em
[migracao-interface-e-chat.md](migracao-interface-e-chat.md).

> **Mudança de rumo (22/10/2026).** Em vez de migrar as telas antigas, um
> frontend novo está sendo escrito em `src/features/`, com a interface do
> Claude Code, só Tailwind (sem CSS por componente) e reaproveitando
> `stores/`, `services/`, `hooks/` e `lib/`. Ele vive em `/next` até atingir a
> paridade e então assume `/`. Cada tela antiga é apagada quando a nova a
> substitui; `styles/legacy.css` (o antigo `index.css` + `cowork.css`), o Radix
> e o assistant-ui saem com a última delas. Os tokens ficam em
> `styles/globals.css`. As fases 1 a 5 abaixo valem como inventário do que a
> interface nova precisa cobrir, não como roteiro de migração.
>
> **Escopo decidido em 22/10/2026.** Ficam: Extensões, Integrações (redefinidas:
> GitHub, APIs e apps de produtividade, no lugar de Home Assistant, ComfyUI,
> Oracle e Discord), ferramentas extras da sessão (preview, notas, Android,
> memórias, checkpoints, mesh, log de ferramentas), alertas de uso, administração,
> busca global, `Ctrl+K` e troca de thread. **Saem** junto com o layout antigo:
> Monitor, Operations (Docker/watchdogs) e a biblioteca de estilos.
>
> | Tela nova | Estado |
> | --- | --- |
> | Shell: navegador por projeto/sessão, menu de conta | Feito |
> | Início: nova sessão, escolher pasta, clonar do GitHub | Feito |
> | Sessão: conversa, ferramentas, aprovações, perguntas, compositor (comandos `/`, anexos, ditado, limite de uso) | Feito |
> | Sessão: painel (progresso, mudanças e git, arquivos, contexto) e ferramentas (preview, notas, memória, checkpoints, GitHub, Android, log, navegador) | Feito |
> | Ctrl+K, busca global, troca de chat, menu da sessão | Feito |
> | Analytics | Feito |
> | Settings: aparência, workspace, agentes, extensões, integrações, alertas de uso, segurança, sistema, administração | Feito |
> | Login, conexão, setup | Movidos para `features/auth` |
> | Layout antigo, `legacy.css`, páginas antigas, Monitor, Operations, estilos | **Removidos** |
>
> Pendente: integrações de
> produtividade (a definir quais), Z.AI e listas de modelos do OpenCode/Pi em
> Settings, e o app Android. No Android, a Fase 1 está concluída (22/10/2026):
> as paletas `_light`/`_dark` do `PlumPalette.kt` seguem os tokens do Cowork,
> o fundo é flat (aurora/vidro/grid apagados), e o e-ink e a preferência
> `backgroundAnimation` saíram da UI e das stores (`eink` do servidor migra
> para claro). Etapa 2 também concluída no Android (22/10/2026): `Monitor` e
> `Operations` removidos junto com `OperationsApi` (os widgets continuam
> funcio­nando com o `MonitorSlotsStore` movido para `widget/`), e o
> Dashboard ganhou chips de projeto (filtro por `workingDirectory`, como os
> Projetos do shell novo); o chip selecionado usa agora `selectionTint` da
> paleta. Falta no Android: o visual do chat estilo Claude (texto serif do
> assistente, tools em linha recolhível).

Este documento lista o que precisa ser alterado, melhorado e corrigido no
frontend, inclui a remoção completa do Radix UI e a limpeza das telas, e
organiza tudo em fases executáveis. Cada fase termina com o sistema
funcionando e pode ser entregue sozinha.

## 1. Diagnóstico

### 1.1 Números do frontend hoje

| Medida                                                     | Valor                                 |
| ---------------------------------------------------------- | ------------------------------------- |
| Linhas em `index.css` (CSS legado)                         | 13.402                                |
| Linhas em `cowork.css` (camada nova por cima do legado)    | 862                                   |
| `!important` em `index.css` / `cowork.css`                 | 227 / 130                             |
| Regras ligadas a temas de provedor (`provider-codex` etc.) | 45 seletores, todos mortos            |
| Regras de e-ink / Gecko                                    | 73 / 18                               |
| Pacotes `@radix-ui/*` no frontend                          | 12                                    |
| Arquivos que importam Radix diretamente                    | 15 (14 em `components/ui`, 1 no chat) |
| Arquivos que usam as primitivas de `components/ui`         | 48                                    |
| `<button>` cru vs. `<Button>`                              | 168 / 327                             |
| Cores fixas do Tailwind (`bg-blue-500`, `text-amber-…`)    | 653 ocorrências                       |
| `style={{…}}` inline                                       | 132                                   |
| Modais próprios com `fixed inset-0`                        | 8                                     |
| Maior chunk do build                                       | `SessionPage` 912 kB                  |

### 1.2 Tamanho das telas

| Arquivo                                           | Linhas |
| ------------------------------------------------- | -----: |
| `pages/SettingsPage.tsx`                          |  5.660 |
| `pages/SessionPage.tsx`                           |  5.039 |
| `components/session/SessionStyleLibraryPanel.tsx` |  4.042 |
| `pages/DashboardPage.tsx`                         |  2.038 |
| `components/files/WorkspaceFiles.tsx`             |  1.537 |
| `components/layout/Sidebar.tsx`                   |  1.341 |
| `pages/AnalyticsPage.tsx`                         |    971 |

Arquivos desse tamanho misturam busca de dados, estado, regras de negócio e
markup. Cada mudança visual exige ler milhares de linhas e tem alto risco de
regressão.

### 1.3 Problema estrutural do CSS

A aparência atual resulta de três camadas sobrepostas:

1. `index.css` legado, com vidro, gradientes, temas por provedor e ajustes de
   Gecko e e-ink;
2. Tailwind nas classes dos componentes;
3. `cowork.css`, que sobrescreve as duas primeiras com `!important`.

A camada 3 é um remendo: funciona, mas cada tela nova pode herdar estilos
antigos inesperados. O objetivo final é que os componentes usem só os tokens
do tema (shadcn) e que `index.css` fique reduzido a tokens, base e o que for
genuinamente específico (Markdown, diff, terminal).

## 2. Remoção completa do Radix UI

### 2.1 Onde o Radix está

| Origem                              | Uso                                                                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/ui/*`                   | Dialog, Sheet, Command (Dialog), DropdownMenu, Select, Tabs, Switch, RadioGroup, Label, ScrollArea, Toast, Tooltip, Collapsible, Slot (Button) |
| `chat/PermissionApprovalDialog.tsx` | Usa `@radix-ui/react-dialog` diretamente                                                                                                       |
| `@assistant-ui/react` 0.15          | **Depende do pacote `radix-ui`**. Enquanto ele existir, o Radix continua no bundle, mesmo sem nenhum import nosso.                             |

Consequência: "remoção completa" exige decidir o destino do assistant-ui.
Hoje usamos dele pouco: `MessagePrimitive.Root`, `ActionBarPrimitive` (copiar),
o hook de suavização do streaming e o runtime externo em
`AgentChatProvider.tsx`.

### 2.2 Substituto

**Decisão: manter o shadcn/ui e trocar a base Radix pela Base UI
(`@base-ui-components/react`).** O shadcn publica os mesmos componentes sobre
Base UI; é a mesma biblioteca de componentes, só que sem Radix por baixo. A
Base UI é mantida pela equipe que criou o Radix e pelo MUI e cobre foco,
teclado, ARIA e portais. A API pública de `components/ui` (nomes e props usados
pelas 48 telas) é mantida, então as telas quase não mudam.

| Primitiva Radix | Substituto (shadcn sobre Base UI) | Observação                                        |
| --------------- | --------------------------------- | ------------------------------------------------- |
| Dialog          | `Dialog`                          | Inclui `PermissionApprovalDialog` e `command.tsx` |
| Sheet           | `Dialog` com classes de painel    |                                                   |
| DropdownMenu    | `Menu`                            | Manter a classe `plum-popup`                      |
| Select          | `Select`                          |                                                   |
| Tabs            | `Tabs`                            |                                                   |
| Switch          | `Switch`                          |                                                   |
| RadioGroup      | `RadioGroup`                      |                                                   |
| Tooltip         | `Tooltip`                         |                                                   |
| Collapsible     | `Collapsible`                     |                                                   |
| ScrollArea      | `ScrollArea` ou `overflow-auto`   | Avaliar se a rolagem nativa basta                 |
| Toast           | `sonner` (padrão atual do shadcn) | Manter a API de `useToast` como adaptador         |
| Label           | `<label>` nativo                  | Sem dependência                                   |
| Slot (Button)   | Prop `render` da Base UI          | Usado em `<Button asChild>`                       |

### 2.3 Chat próprio no lugar do assistant-ui

**Decisão: remover o assistant-ui** e construir os componentes do chat com
Tailwind e as primitivas do shadcn. O que ele entregava (ações por mensagem,
streaming suave) é pouco código, e um chat próprio permite o visual do Cowork
sem adaptar o estado do Zustand a um runtime externo — fonte da corrida
corrigida na primeira etapa.

Componentes em `features/chat/`:

| Componente         | Papel                                                                           |
| ------------------ | ------------------------------------------------------------------------------- |
| `Thread`           | Lista virtualizada (Virtuoso), rolagem para o fim, carregamento de histórico    |
| `UserMessage`      | Balão neutro, anexos, editar e reenviar                                         |
| `AssistantMessage` | Texto em serifa sem caixa, Markdown, ações abaixo                               |
| `MessageActions`   | Copiar (com confirmação), citar, tentar de novo; visíveis por foco e no toque   |
| `ToolCall`         | Linha recolhível: ícone, verbo ("Leu 3 arquivos"), estado; detalhes ao expandir |
| `ThinkingBlock`    | Raciocínio recolhido, com duração                                               |
| `ApprovalCard`     | Pedido de permissão em cartão simples com Permitir / Negar                      |
| `QuestionCard`     | Perguntas do agente com opções                                                  |
| `Composer`         | Texto, anexos, chip de modelo, envio que vira Parar durante a execução          |
| `useSmoothText`    | Suavização do streaming respeitando `prefers-reduced-motion`                    |

### 2.4 Critério de conclusão

- `grep -r "@radix-ui\|radix-ui" packages/frontend/src packages/frontend/package.json` sem resultados;
- `pnpm why radix-ui` e `pnpm why @radix-ui/react-dialog` sem dependentes no frontend;
- teclado e leitor de tela verificados em: diálogo de aprovação, menu da sessão,
  select de modelo, abas de Settings, tooltip, toast.

## 3. Nova experiência (estilo Cooder workspace)

### 3.1 Problema atual

A barra lateral acumula tudo: navegação global, lista de sessões, alternância
"Sessions / Session tools" e, dentro da sessão, um menu com dezenas de
ferramentas (tarefas, agentes, arquivos, Git, preview, notas, navegador,
Android, mesh, memórias, checkpoints, estilos, configuração do modelo…). O chat
perde o foco e o usuário precisa entender a estrutura inteira para começar.

### 3.2 Princípio

**O projeto é o centro.** Uma sessão sempre pertence a um projeto (pasta). A
interface mostra o projeto atual, as conversas dele e o que está acontecendo
agora. Ferramentas aparecem quando são úteis, não como uma lista permanente.

### 3.3 Estrutura

```text
┌───────────────┬──────────────────────────────────────┬──────────────────┐
│ Barra lateral │ Conversa                             │ Painel do projeto│
│               │                                      │ (recolhível)     │
│ + Nova tarefa │ Projeto ▸ Sessão          [⋯] [▣]    │                  │
│ Buscar        │                                      │ Progresso        │
│               │   mensagens centradas, até ~760 px   │  tarefas do      │
│ Projetos      │                                      │  agente          │
│  ▸ plum-code  │                                      │ Arquivos         │
│  ▸ ola        │                                      │  alterados       │
│               │                                      │ Contexto         │
│ Recentes      │                                      │  modelo, uso,    │
│  (do projeto  │                                      │  agentes         │
│   atual, ~10) │  ┌────────────────────────────────┐  │                  │
│               │  │ Compositor                     │  │                  │
│ ─────────     │  │ +  modelo ▾              ↑/■   │  │                  │
│ conta · ⚙     │  └────────────────────────────────┘  │                  │
└───────────────┴──────────────────────────────────────┴──────────────────┘
```

**Barra lateral** (no máximo ~20 itens visíveis):

- "Nova tarefa" e busca (abre a paleta de comandos);
- **Projetos**: lista curta; ao escolher um, a lista abaixo mostra só as
  conversas dele;
- **Recentes** do projeto atual, com "Ver todas" para o resto;
- rodapé com conta, Dashboard/Analytics/Operations num menu e Settings.

Sai da barra lateral: a alternância "Sessions / Session tools", o menu de
ferramentas da sessão, os medidores de uso (vão para o painel do projeto) e os
links soltos.

**Cabeçalho da conversa:** nome do projeto e da sessão, menu `⋯` (renomear,
reiniciar, exportar, apagar, configurações da sessão) e botão para abrir o
painel do projeto.

**Painel do projeto** (direita, recolhível, como o painel de progresso do
Cowork):

- **Progresso:** lista de tarefas do agente e subagentes ativos;
- **Arquivos:** o que mudou nesta sessão, com diff ao clicar;
- **Contexto:** provedor, modelo, uso da sessão/semana/contexto.

**Ferramentas avançadas** (Git, preview, notas, navegador, Android, mesh,
memórias, checkpoints, estilos): saem dos menus fixos e passam a ser abertas
pela paleta de comandos (`Ctrl+K`) ou pelo menu `⋯`, exibidas como aba no
painel do projeto. Quem usa sempre pode fixá-las.

**Dashboard:** vira a tela "início" fora de um projeto — métricas, projetos e
extensões (já iniciado com `DashboardOverview`) e o compositor para começar
algo novo escolhendo o projeto.

### 3.4 Tema

Paleta e tipografia do Cooder workspace, já aplicadas em `cowork.css`, passam a
ser os tokens oficiais (Fase 1). O app Android acompanha depois desta
refatoração.

## 4. Limpeza das telas

### 4.1 Princípios

1. Uma tela = um arquivo de página fino, que compõe seções. Nenhuma página
   acima de ~400 linhas; nenhum componente acima de ~500.
2. Dados em hooks (`useSessionQuery`, `useAnalyticsSummary`…), não dentro do JSX.
3. Só componentes de `components/ui` para botões, campos, menus e diálogos.
   Nada de `<button>` estilizado à mão nem modal com `fixed inset-0`.
4. Cores por token (`text-muted-foreground`, `bg-card`, `text-destructive`) e um
   pequeno conjunto de tokens de estado (`--success`, `--warning`, `--info`).
5. Sem `style={{}}` para aparência; só para valores realmente dinâmicos.

### 4.2 Por tela

| Tela                                                   | Problemas                                                                                          | Ação                                                                                                                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sessão** (`SessionPage`)                             | 5 mil linhas; chunk de 912 kB; timeline lateral com horários; painel "Session tools" denso         | Dividir em `SessionHeader`, `ChatTimeline`, `Composer`, `RunPanel`, `SessionToolsPanel`; lazy-load de painéis (Git, Files, Preview, Notes); rever a timeline lateral |
| **Chat**                                               | Cartões de ferramenta, raciocínio e aprovações ainda no estilo antigo; mensagens do sistema        | Padronizar no estilo Claude: ferramentas como linha recolhível discreta, raciocínio recolhido, aprovação em cartão simples                                           |
| **Compositor**                                         | Barra de status acima do texto; botões Restart/Interrupt competem com o texto                      | Status em uma linha discreta; Interrupt vira o próprio botão de envio durante execução (como no Claude); Restart no menu da sessão                                   |
| **Dashboard**                                          | Caixa de nova sessão com 6 controles visíveis; cartões de sessão grandes                           | Compositor enxuto (provedor/modelo num chip, resto em "Opções"); lista compacta de sessões; validar o novo `DashboardOverview` com dados reais                       |
| **Settings** (`SettingsPage`)                          | 5,6 mil linhas; abas, sub-abas e seções misturadas; muitos formulários soltos                      | Um arquivo por destino (`settings/general/…`, `settings/extensions/…`); navegação lateral única; formulários com o mesmo padrão de campo, ajuda e salvar             |
| **Analytics**                                          | Gráficos e cartões com estilo próprio                                                              | Reaproveitar `MetricCard` do Dashboard; paleta de gráficos única                                                                                                     |
| **Operations / Monitor**                               | Cartões e estados próprios                                                                         | Mesmo cartão e mesmos estados vazios/erro/carregando                                                                                                                 |
| **Barra lateral**                                      | 1,3 mil linhas; alternância Sessions / Session tools; itens soltos em baixo (Operations, Settings) | Seções: Nova sessão · Navegação · Recentes; ferramentas da sessão migram para a própria tela da sessão; rodapé com conta e Settings                                  |
| **Login / Connect / Setup**                            | Já refeitos; `SetupPage` ainda no estilo antigo                                                    | Aplicar o mesmo padrão no Setup                                                                                                                                      |
| **Admin**                                              | Tabelas próprias                                                                                   | Componente de tabela único                                                                                                                                           |
| **Biblioteca de estilos** (`SessionStyleLibraryPanel`) | 4 mil linhas num painel                                                                            | Separar catálogo, prévia e editor; carregar sob demanda                                                                                                              |

### 4.3 Organização de pastas

```text
src/
  app/            rotas, providers, layout raiz
  components/ui/  primitivas (Base UI + Tailwind), sem regra de negócio
  components/     peças compartilhadas (MetricCard, EmptyState, PageHeader…)
  features/
    chat/         mensagens, compositor, ferramentas, aprovações
    session/      página e painéis da sessão
    dashboard/
    settings/     um diretório por destino
    analytics/
    operations/
    auth/
  hooks/ services/ stores/ lib/
  styles/
    tokens.css    paleta clara e escura do Cowork
    base.css      reset, tipografia, prose
    features/     CSS realmente específico (diff, terminal, markdown)
```

A mudança de pastas acompanha a refatoração de cada tela; não deve ser um
grande movimento único de arquivos.

## 5. Correções pendentes

| #   | Problema                                                                                             | Correção proposta                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Testes unitários do backend não rodam: o Node 20 não expande `src/**/*.test.ts`                      | Usar `tsx --test` com o glob entre aspas ou listar com `fast-glob`; os 125 testes passam quando chamados direto   |
| 2   | `task workbench` procura `title="Open run view"`, que não existe                                     | Atualizar o teste para o markup atual ou restaurar o título                                                       |
| 3   | `session icon thumbnails` e `operations and rollback` exigem `magick` e `jq` na máquina              | Documentar pré-requisitos ou pular com aviso quando ausentes                                                      |
| 4   | Sessões criadas no Docker (`/workspace/…`) não abrem pelo `pnpm run dev` no host                     | Hoje a mensagem é clara; resolver de fato com mapeamento de caminho (`WORKSPACE_HOST_DIR`) ou avisar no Dashboard |
| 5   | `FRONTEND_URL=http://localhost:8010` no `.env` local afeta redirecionamentos OAuth no `pnpm run dev` | Documentar dois `.env` (Docker e host) ou derivar do request                                                      |
| 6   | Erro de `SESSION_SECRET`/`JWT_SECRET` relatado em uma subida do Docker dev, não reproduzido depois   | Reproduzir com o comando exato; adicionar checagem no entrypoint dev                                              |
| 7   | `OPENCODE-CATALOG`: `EACCES` ao criar `/home/node/.cache/opencode` no container dev                  | Criar e dar posse ao diretório no estágio `development` do Dockerfile                                             |
| 8   | Preferência `backgroundAnimation` ainda gravada e sincronizada, sem efeito                           | Remover do backend, tipos compartilhados, Settings e Android (ver Fase 6)                                         |
| 9   | Fonte Newsreader e outras carregadas do Google Fonts via `@import`                                   | Hospedar localmente só as fontes usadas; remover Space Grotesk, Sora, Plus Jakarta e IBM Plex se não usadas       |
| 10  | Chunks acima de 500 kB (`SessionPage`, `AnalyticsPage`, KaTeX)                                       | Lazy-load por painel e por rota; KaTeX só quando houver matemática                                                |
| 11  | ESLint não cobre `packages/frontend/scripts/*.mjs` (erros de `URL`/`console` não definidos)          | Adicionar globals de Node para scripts                                                                            |
| 12  | 28 avisos de ESLint no backend                                                                       | Corrigir junto com as fases que tocarem esses arquivos                                                            |

## 6. Plano

Estimativas em dias de trabalho de uma pessoa, já com verificação. As fases 1
e 2 são pré-requisito das demais; 3 a 6 podem ser intercaladas.

### Fase 0 — Base de verificação (1 dia) — concluída em 22/10/2026

- [x] Testes unitários do backend: o runner passava um glob que o Node 20 não
      expande e rodava **zero** arquivos. `packages/backend/scripts/run-unit-tests.mjs`
      lista os `*.test.ts`; 132 testes passam.
- [x] `task workbench`: removidas as asserções sobre o cabeçalho do workbench e o
      botão "Interrupt & run now", que já não existiam; mantidas as do estado.
- [x] Suites que dependem de `magick` e `jq` declaram `requires` e são puladas
      com aviso quando a ferramenta falta, exceto com `CI` definido.
- [x] `pnpm screenshots`: Playwright (`playwright-core`, Chrome do sistema)
      entra pela tela de login e captura as telas principais em claro/escuro,
      desktop/celular, em `.artifacts/ui-screenshots/`.
- [ ] Screenshots de referência: aguardam uma conta de desenvolvimento.
- **Resultado:** `pnpm test` com 49 suites aprovadas e 2 puladas (sem
  `magick`/`jq` nesta máquina).

### Fase 1 — Tokens e CSS base (2–3 dias)

- Extrair a paleta de `cowork.css` para `styles/tokens.css` (claro e escuro do
  Cowork) e adicionar `--success`, `--warning`, `--info`.
- Remover o tema e-ink (seção 7).
- Remover de `index.css` os temas por provedor, o vidro, os gradientes e os
  ajustes de Gecko que só existiam por causa do desfoque.
- Reduzir `cowork.css` à medida que os estilos legados saem; meta: nenhum
  `!important`.
- **Pronto quando:** screenshots iguais aos da Fase 0, com `index.css` abaixo
  de ~6 mil linhas.

### Fase 2 — shadcn sem Radix (3–4 dias)

- Instalar Base UI; regenerar cada arquivo de `components/ui` com a variante
  Base UI do shadcn, mantendo a API usada pelas telas.
- Migrar `PermissionApprovalDialog` para o `Dialog` comum.
- Converter os 8 modais próprios para `Dialog`/`Sheet`.
- Toast com `sonner` atrás da API atual de `useToast`.
- Remover os 12 pacotes `@radix-ui/*`.
- **Pronto quando:** teclado e leitor de tela conferidos nos componentes da
  seção 2.4 (exceto a parte do assistant-ui, que sai na Fase 3).

### Fase 3 — Chat próprio e tela da sessão (5–6 dias)

- Criar os componentes da seção 2.3 em `features/chat/` e remover
  assistant-ui e `AgentChatProvider`. Critério da seção 2.4 completo.
- Dividir `SessionPage`: cabeçalho, conversa, compositor e painel do projeto
  (seção 3.3); carregar painéis sob demanda.
- Ferramentas, raciocínio, aprovações e perguntas no estilo Cowork.
- Compositor: envio vira Parar durante a execução; status em uma linha;
  Restart no menu `⋯`.
- **Pronto quando:** chunk da sessão abaixo de 400 kB e conversa real
  verificada com Codex, Claude e OpenCode (streaming, ferramentas, aprovação,
  anexos, troca de chat).

### Fase 4 — Navegação centrada no projeto (3–4 dias)

- Nova barra lateral (seção 3.3): Nova tarefa, busca, Projetos, Recentes do
  projeto, rodapé. Sem "Session tools".
- Painel do projeto à direita: Progresso, Arquivos, Contexto.
- Ferramentas avançadas na paleta `Ctrl+K` e no menu `⋯`, abrindo como aba
  no painel do projeto, com opção de fixar.
- Dashboard como tela inicial fora de um projeto; compositor enxuto com
  escolha de projeto.
- **Pronto quando:** barra lateral com no máximo ~20 itens visíveis; toda
  ferramenta atual alcançável em até dois cliques ou pela paleta; conferido em
  desktop e celular.

### Fase 5 — Settings, Analytics, Operations, Monitor, Admin, Setup (5–7 dias)

- Quebrar `SettingsPage` por destino; padrão único de formulário.
- `MetricCard`, `EmptyState`, `PageHeader` e tabela compartilhados.
- Substituir as 653 cores fixas por tokens de estado, tela por tela.
- Separar `SessionStyleLibraryPanel`.
- **Pronto quando:** nenhuma página acima de ~400 linhas e nenhuma cor fixa
  fora de gráficos e ícones de marca.

### Fase 6 — Limpeza final e desempenho (2 dias)

- Remover `backgroundAnimation` de ponta a ponta (item 8), incluindo Android.
- Fontes locais e só as usadas (item 9); divisão de bundles (item 10).
- ESLint para scripts (item 11) e avisos restantes (item 12).
- Atualizar `CLAUDE.md`, `AGENTS.md`, `DEVELOPMENT.md` e o documento de migração.
- **Pronto quando:** build sem avisos de chunk, lint sem avisos, docs atualizadas.

### Resumo

| Fase | Tema                          | Dias      | Depende de |
| ---- | ----------------------------- | --------- | ---------- |
| 0    | Base de verificação           | 1         | —          |
| 1    | Tokens e CSS base             | 2–3       | 0          |
| 2    | shadcn sem Radix              | 3–4       | 1          |
| 3    | Chat próprio e sessão         | 5–6       | 2          |
| 4    | Navegação centrada no projeto | 3–4       | 3          |
| 5    | Demais telas                  | 5–7       | 2          |
| 6    | Limpeza final e desempenho    | 2         | 3, 4, 5    |
|      | **Total**                     | **21–27** |            |

## 7. Decisões

Tomadas em 22 de outubro de 2026:

| Tema                      | Decisão                                                  |
| ------------------------- | -------------------------------------------------------- |
| Biblioteca de componentes | Manter shadcn/ui                                         |
| Radix                     | Remover por completo; shadcn sobre Base UI               |
| Chat                      | Componentes próprios com Tailwind; remover assistant-ui  |
| Tema                      | Cooder workspace                                            |
| Experiência               | Chat centrado no projeto, barra lateral enxuta (seção 3) |
| Android                   | Acompanha depois desta refatoração                       |

Tema e-ink: **removido**. Ficam apenas os temas claro e escuro do Claude
Cowork; quem tinha e-ink salvo passa para o claro. A remoção entra na Fase 1,
junto com as 73 regras de e-ink do CSS legado, a opção em Settings → Appearance
e o valor `eink` em `normalizeTheme` e nos tipos compartilhados.

Ainda em aberto:

1. **Provedor e modelo acima de cada resposta:** manter ou esconder como no
   Claude; com o chip de modelo no compositor e o painel de contexto, a
   recomendação é esconder.

## 8. Riscos

| Risco                                                | Mitigação                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Regressão de acessibilidade ao trocar primitivas     | Checklist de teclado e leitor de tela por componente na Fase 2                        |
| Quebra de fluxos do chat ao dividir `SessionPage`    | Testes de histórico, entrega e sincronização a cada passo; conversa real por provedor |
| Estilos legados reaparecendo ao remover `cowork.css` | Screenshots de referência da Fase 0, comparados a cada fase                           |
| Fases longas sem entrega                             | Cada fase termina com o sistema funcionando e pode ser commitada                      |
