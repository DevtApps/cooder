# Migração da interface e do chat do Cooder

**Data:** 22 de outubro de 2026  
**Estado:** primeira etapa implementada e validada; migração visual completa em andamento.

## Objetivo

Adaptar a aparência do sistema ao estilo do aplicativo Claude mostrado na
referência: fundo grafite, barra lateral escura, superfícies foscas, bordas
discretas, tipografia compacta e componentes de chat mais interativos.

A base escolhida é **shadcn/ui + Tailwind CSS + assistant-ui**, com Lucide para
ícones. O projeto já usava Tailwind e componentes locais baseados em Radix UI;
esta etapa formalizou a configuração do shadcn e integrou o assistant-ui ao chat.
React 18 e Tailwind CSS 3 foram mantidos.

## Resumo do que foi entregue

| Área            | Resultado                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------- |
| Inicialização   | Corrigidas as URLs opcionais de OAuth que impediam o serviço de iniciar.                     |
| Instalador      | A falha no teste de saúde interrompe a instalação antes da mensagem de sucesso.              |
| Banco externo   | Schema inicial e nove migrations aplicados no banco configurado pelo usuário.                |
| Autenticação    | Conta de administrador criada e Basic Auth habilitado no novo banco.                         |
| Desenvolvimento | Ambiente Docker com Vite, watchers de TypeScript e código local montado.                     |
| Tema            | Paleta neutra escura e componentes foscos, com suporte ao tema claro e preservação do e-ink. |
| shadcn/ui       | Configuração do registro e componentes locais de Collapsible e Tooltip.                      |
| Chat            | Integração inicial com assistant-ui, ações de mensagens e streaming suave.                   |
| Ferramentas     | Detalhes expansíveis dentro da conversa, mantendo o diálogo completo.                        |

## 1. Correções de inicialização

O container da WebUI estava em um ciclo de reinicialização. A validação do backend
rejeitava `GITHUB_CALLBACK_URL` e `GOOGLE_CALLBACK_URL` vazias, embora o login por
esses provedores fosse opcional.

Em `docker-compose.yml`, essas variáveis passaram a receber URLs locais válidas
quando não foram configuradas. A validação de URLs no backend foi preservada.

Em `scripts/install.sh`, o fallback HTTP passou a consultar `/health/ready`.
Quando o serviço não fica saudável dentro do prazo, o instalador termina com
erro, sem continuar até a mensagem de que a WebUI está disponível.

Foi confirmado acesso à página inicial com HTTP 200 após a correção.

## 2. Banco e acesso

Durante o trabalho, a configuração foi alterada pelo usuário para um Postgres
externo. O ambiente de desenvolvimento foi ajustado para dar precedência a
`PGPASSWORD`, em vez de passar a senha do Postgres embutido ao servidor externo.

Depois da criação do banco pelo usuário, a inicialização do backend aplicou:

1. `001-gateway-token-scope`
2. `002-messages-unread-index`
3. `003-session-subagent-model`
4. `004-reprice-2026-09-27-standard-api-equivalent-v15`
5. `005-usage-history-turn-id-not-null`
6. `006-usage-limit-snapshots-recorded-index`
7. `007-session-agent-runs`
8. `008-claude-legacy-models-keep-1m`
9. `009-browser-tokens`

A conta de acesso foi criada pelo mecanismo existente de seed do backend e
promovida a administrador. O Basic Auth foi habilitado em `app_config`, e o login
com as credenciais fornecidas na conversa retornou HTTP 200.

As credenciais não são reproduzidas neste documento. O banco externo recebeu o
schema, as migrations e o seed de acesso; não foi feita uma transferência geral
dos dados do banco original para ele.

## 3. Modo de desenvolvimento

Foi criado `docker-compose.dev.yml`, com uma etapa `development` no Dockerfile.
O ambiente mantém os CLIs da imagem de produção e adiciona ferramentas de
desenvolvimento, incluindo o compilador nativo necessário para instalar
dependências como `node-pty`.

Os processos executados são:

- Frontend: Vite com atualização automática.
- Backend: `tsx watch src/index.ts`.
- Tipos compartilhados: `tsc --watch`.

O servidor Vite recebe a porta externa configurada em `WEBUI_PORT`, atualmente
**8010**, e encaminha chamadas de API e WebSocket ao backend interno. Também
foram adicionados encaminhamentos para `/health`, `/generated` e `/uploads`.

Os diretórios `src` do frontend, backend e pacote compartilhado são montados a
partir do repositório. A configuração também monta arquivos do frontend e
scripts. O teste de saúde do modo dev verifica tanto o backend quanto o Vite.

Para iniciar ou reconstruir o ambiente:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

O Postgres configurado precisa estar disponível. Para usar o banco embutido,
ele deve ser iniciado separadamente. Durante esta sessão, as dependências novas
foram sincronizadas e instaladas no container ativo; reconstruir a imagem com o
comando acima incorpora essas dependências à imagem reproduzível.

Mais detalhes: [DEVELOPMENT.md](../DEVELOPMENT.md).

### Execução local com `pnpm run dev`

Fora do Docker, `pnpm run dev` falhava em três pontos, corrigidos assim:

- **Desktop (Electron):** o arquivo de configuração se chama
  `electron-vite.config.ts`, nome que o electron-vite não carrega; o dev
  gerava `out/` enquanto o `main` aponta para `dist/`. O script `dev` do
  pacote passou a usar `--outDir dist`, como o `build`. O app desktop saiu do
  `pnpm run dev` da raiz (abria uma janela e disputava a porta do Vite) e
  ganhou o script próprio `pnpm run dev:desktop`.
- **Backend:** `GITHUB_CALLBACK_URL=` e `GOOGLE_CALLBACK_URL=` vazias no `.env`
  derrubavam a validação. Em `config.ts`, valor vazio passou a significar
  "não configurado"; URLs preenchidas continuam validadas.
- **Proxy do Vite:** o padrão de `BACKEND_PORT` era `3006`, mas o backend
  sobe em `3001` quando `PORT` não é definido. O padrão do Vite passou a ser
  `3001`. No `.env` local, `http://localhost:5173` foi incluído em
  `CORS_ALLOWED_ORIGINS`.

Com isso, `http://localhost:5173` abre a interface, e `/health/ready`,
`/auth/providers` e o Socket.IO respondem pelo proxy. O typecheck de todos os
pacotes passou.

## 4. Aparência dos componentes

Foi criado `packages/frontend/src/cowork.css`, carregado após o CSS existente.
Esse arquivo estabelece a camada visual da migração:

- Fundo grafite e barra lateral quase preta no tema escuro.
- Cores neutras para botões, campos, cartões e menus.
- Bordas finas e raios menores nos controles.
- Superfícies foscas, com remoção de efeitos de vidro e gradientes nos componentes tratados.
- Tipografia de interface baseada em fontes do sistema.
- Caixa de mensagem com fundo sólido e borda discreta.
- Balões do usuário com aparência neutra.
- Ações de mensagens visíveis por foco e interação; em dispositivos de toque,
  permanecem acessíveis sem depender de hover.
- Respeito à preferência de movimento reduzido nas animações adicionadas.

O `Layout` deixou de montar o fundo animado da área autenticada. Os componentes
compartilhados usam os mesmos tokens de cor, e o botão local recebeu um atributo
de identificação para a aplicação consistente dos estilos.

O CSS anterior continua no projeto. A nova camada não representa uma reescrita
integral dos componentes nem uma reprodução exata de todas as telas da referência.

### Tela de login

`BasicLoginPage.tsx` foi refeita no estilo fosco: fundo sólido, logotipo,
título e formulário centralizados em um cartão simples, com os provedores
discretos no rodapé. Foram removidos o fundo animado com faixas coloridas e o
brilho que seguia o cursor; o componente `PlumBackground.tsx`, usado apenas
nessa tela, foi apagado. Os ícones dentro dos campos, que ficavam encobertos
pelo fundo do input, saíram; o botão de mostrar senha ganhou rótulo acessível.
A tela de conexão por provedor (`/connect`, `LoginPage.tsx`) recebeu o mesmo
tratamento: cabeçalho centralizado, botões neutros e iguais para Codex,
OpenCode, Pi e Claude (legado), sem o fundo que mudava de cor ao passar o mouse.
O diálogo de login do Claude e os fluxos OAuth foram mantidos.

### Padronização dos componentes

As primitivas de `components/ui` deixaram de usar as classes de vidro do CSS
antigo (`glass-card`, `glass-dialog`, `glass-input`, `glass-tabs`,
`glass-chrome`, `glass-sheet`) e passaram a usar só os tokens do shadcn:

| Componente       | Superfície                                               |
| ---------------- | -------------------------------------------------------- |
| Card             | `bg-card`, borda `border-border`, raio `xl`.             |
| Dialog e Command | `bg-popover`, borda, raio `xl`, sombra `lg`.             |
| Input, Textarea  | Fundo transparente, borda `border-input`, sem gradiente. |
| Select (gatilho) | Igual ao Input, raio `md`.                               |
| Tabs             | Trilho `bg-muted`; aba ativa `bg-background`.            |
| Sheet            | `bg-background` com borda.                               |
| Toast            | `bg-popover` com borda.                                  |

Os modais próprios (plugins, skills, marketplace, seletor de pastas, aprovação
de permissões e perguntas) seguem o mesmo padrão do Dialog, com overlay escuro
sem desfoque. Os cartões de chat (confiança de pasta, provedor pronto, aviso de
limite), o compositor, a barra inicial do painel, o Monitor, a fila de saída e o
erro de carregamento da sessão perderam gradientes, vidro e sombras fortes.
Settings, Analytics e Operations deixaram a classe `glass-page`, que aplicava
desfoque e sombra a todo bloco com borda dentro da página.

Em `cowork.css`:

- Menus e selects mantêm `plum-popup` (altura, rolagem e animação), com a
  aparência do popover: borda, raio de 10 px, sombra discreta e item realçado
  com `accent`.
- `backdrop-filter` foi desligado em todo o tema fosco. Elementos que flutuam
  sobre conteúdo rolável (barra de tarefas, botão de ir ao fim, painéis
  acoplados, resultados de busca) ganharam fundo opaco.

A opção "Background animation" saiu de Settings → Appearance, pois o fundo
animado não é mais montado. O valor salvo continua sendo sincronizado.

### Remoção dos fundos animados

O código dos fundos animados foi apagado: `components/effects/` (Cooder Waves,
Misty Waterdrops, Neon Glow, Aurora Galaxy e o fundo do login),
`lib/ambientMotion.ts`, a dependência `three` e cerca de 1.600 linhas do
`index.css` (`aurora-*`, `galaxy-*`, `login-galaxy-*`, `mist-window-*`,
`neon-glow-*`, `plum-bg-*`, botões de login por provedor, prévias da opção
de fundo e os keyframes correspondentes). A remoção do CSS foi feita com
`postcss`, retirando apenas seletores mortos de listas mistas.

O atributo `data-background-animation` deixou de ser aplicado ao `<html>`. As
46 regras que dependiam dele davam gradientes, transparência e sombras a
balões do chat, cartões de ferramenta, cartões do painel e ao compositor;
foram removidas. A preferência salva continua existindo e sendo sincronizada
entre dispositivos, mas não altera mais a interface.

A cor da barra do navegador (`theme-color`, manifest e `appearanceStore`)
passou de azul escuro `#172637` para o grafite `#141414` do tema.

### Testes

- `ambient-motion` foi removido junto com o código que testava; a entrada
  correspondente saiu do runner e da lista de `regression-runner-tests.mjs`.
- `dashboard-ux` foi ajustado ao markup novo.
- `appearance themes` voltou a passar: o mock de `document`/`window` não
  tinha `querySelector` e `setTimeout`.

Ainda falham, por motivos anteriores a esta etapa: `unit tests` (o Node 20 não
expande o glob do script), `session icon thumbnails` (sem `magick`),
`operations and rollback` (sem `jq`) e `task workbench` (procura o título
"Open run view", que não existe no código).

### Layout do Cooder workspace

**Paleta.** Os tokens de `cowork.css` passaram a seguir o aplicativo Claude:
página `#262624`, barra lateral `#1f1e1d`, superfícies elevadas (compositor,
menus, diálogos) `#30302e`, turnos do usuário `#141413`, texto `#faf9f5` e
botão de envio terracota `#c6613f`. No tema claro: página `#faf9f5`, barra
lateral `#f5f4ed`, compositor branco e turnos do usuário `#f0eee6`. A cor da
barra do navegador acompanha o fundo. A fonte da interface passou de Arial
para a fonte do sistema.

**Conversa.**

- Respostas do assistente sem caixa, borda ou fundo: texto direto na página,
  em serifa (Newsreader, já carregada pelo projeto) a 17 px; títulos seguem em
  sans. Listas voltaram a ter marcadores e o código inline foi reduzido.
- Nome do provedor e modelo continuam acima da resposta, pequenos e discretos.
- Mensagens do usuário em balão neutro; horário aparece só ao passar o mouse e
  o rótulo "Du" saiu.
- Copiar e citar ficam abaixo da mensagem, como no Claude, em vez de flutuar
  sobre ela.

**Compositor.** Texto em cima; `+` (anexar) no canto inferior esquerdo e envio
com seta para cima no canto inferior direito, em botão terracota. Raio de
20 px. O texto de limites de anexos saiu da tela, mas continua disponível
para leitores de tela e na dica do `+`.

**Barra lateral.** Novo item "New session" no topo, com o `+` terracota,
abrindo o compositor de nova sessão do painel (`/?new=true`). A navegação
passou de grade 2×2 para uma coluna.

A conferência foi feita com uma página temporária que carrega o CSS real com
a mesma marcação do chat, compositor e barra lateral, nos temas escuro e
claro; a página foi apagada em seguida.

### Compositor sem fila de follow-up

O botão "Follow-up"/"Steering", o rótulo "Follow-up queue" com "Waiting behind
current run." e o placeholder "Add a follow-up..." saíram do compositor. O
comportamento não mudou: durante uma execução, mensagens continuam entrando na
fila (ou no modo salvo para Codex); "N queued" ainda aparece quando há fila, e
Interrupt e Restart continuam no compositor.

### Pasta de trabalho inexistente

Sessões criadas no Docker guardam a pasta como `/workspace/...`. Abertas a
partir de `pnpm run dev` no host, onde `/workspace` não existe, o Node falhava
com `spawn .../claude ENOENT`, como se o CLI não estivesse instalado.
`spawnManagedProcess` agora troca essa mensagem por `working directory does
not exist: <pasta>`, que chega ao chat via `session:error`, para todos os
provedores. A falta do binário continua com a mensagem original.

### Docker dev

O container dev parava porque a imagem `plum-code-webui:dev` era anterior às
dependências novas do frontend (assistant-ui, Radix Tooltip e Collapsible). A
imagem foi reconstruída com `--build`. Depois de mudar `package.json` ou o
lockfile, é preciso reconstruir.

### Dashboard

Entre o compositor e a lista de sessões entrou `DashboardOverview`
(`components/dashboard/`), só com dados que o backend já fornecia:

- **Últimos 7 dias:** custo (com número de requisições), tokens (entrada e
  saída), sessões (quantas estão rodando) e uso do plano semanal do Codex.
  Custo e tokens mostram a variação contra o mesmo ponto dos 7 dias anteriores
  e um minigráfico diário. Fontes: `/api/analytics/summary` e
  `/api/analytics/timeline`.
- **Projetos:** os 6 projetos descobertos mais recentes, com última atividade,
  número de sessões e um `+` que abre sessão nova na pasta (`/api/projects`).
- **Plugins e extensões:** contagem de MCP servers, skills, agentes e plugins,
  estado da extensão do navegador e atalhos para cada seção de Settings.

O painel direito (categorias e "Discovered Projects") saiu, no desktop e no
celular. As categorias viraram um filtro de chips acima das sessões; criar
categoria continua no botão "New category" da lista. Os estilos do painel
removido foram apagados.

## 5. shadcn/ui e assistant-ui

### Configuração e dependências

Foi adicionado `packages/frontend/components.json`, com aliases para componentes,
primitivas de UI, utilitários e hooks, usando variáveis CSS e ícones Lucide.

Dependências adicionadas ao frontend, com atualização do lockfile:

- `@assistant-ui/react` — `0.15.30`.
- `@assistant-ui/store` — `0.3.22`.
- `@radix-ui/react-collapsible`.
- `@radix-ui/react-tooltip`.

Os componentes shadcn são mantidos como código local em
`packages/frontend/src/components/ui`. Foram adicionados `collapsible.tsx` e
`tooltip.tsx`; Radix continua sendo a base acessível dessas primitivas.

### Integração com o estado existente

`AgentChatProvider.tsx` adapta as mensagens do Zustand ao runtime externo do
assistant-ui. Os callbacks de envio e cancelamento continuam delegando ao fluxo
existente da aplicação.

Os cartões virtualizados usam snapshots de suas próprias mensagens. Isso evita
uma corrida observada na validação: uma mensagem nova podia aparecer na lista
antes da reconciliação do runtime, causando uma consulta a um índice ainda
inexistente. O contexto do compositor também foi vinculado à mensagem para que
a ação de copiar opere sobre o texto do cartão.

O runtime não substituiu a persistência nem os mecanismos atuais de entrega,
replay, anexos e sincronização. A lista continua usando Virtuoso.

### Mudanças visíveis no chat

- `MessageBubble.tsx` passou a usar a primitiva de mensagem do assistant-ui.
- `AgentMessageActions.tsx` reúne copiar e citar, com tooltips e confirmação
  visual e acessível da cópia.
- `StreamingContent.tsx` usa a suavização de texto do assistant-ui dentro do
  contexto de parte de mensagem. O tratamento existente de Markdown, matemática,
  prompts interativos e conteúdo dos provedores foi mantido.
- `ToolExecutionCard.tsx` usa Collapsible para abrir entrada, resultado e erro
  dentro da conversa, mostrando o estado da execução. O botão de detalhes
  completos continua abrindo o diálogo existente.

## 6. Validações realizadas

| Verificação                                           | Resultado                         |
| ----------------------------------------------------- | --------------------------------- |
| Build do frontend, incluindo TypeScript               | Passou.                           |
| ESLint nos componentes de chat e primitivas alterados | Passou.                           |
| Testes de histórico e merge de mensagens              | Passaram.                         |
| Testes de sincronização do chat                       | Passaram.                         |
| Testes de entrega de mensagens                        | Passaram.                         |
| Testes de UX web                                      | Passaram.                         |
| `git diff --check`                                    | Passou.                           |
| Saúde do ambiente dev                                 | `/health/ready` retornou `ready`. |
| Login do administrador no banco externo               | HTTP 200.                         |

No navegador, foram verificados o streaming, a expansão dos detalhes de uma
ferramenta, a cópia com feedback e a ausência de transbordamento horizontal em
largura de celular. Os exemplos temporários usados nessas verificações ficaram
somente no estado do navegador de teste e foram removidos.

O build ainda emite um aviso de chunks maiores que 500 kB; esse aviso não
impediu a compilação. Os testes realizados não equivalem a uma homologação de
todos os provedores nem de todas as telas.

## 7. Pendências da migração

- Revisar visualmente as telas autenticadas (painel, sessão, Settings,
  Analytics, Operations, Monitor) após a padronização dos componentes.
- Decidir se a configuração `backgroundAnimation` deve sair também do
  backend, dos tipos compartilhados e do app Android.
- Consolidar gradualmente os estilos anteriores e reduzir a necessidade de sobrescritas no CSS.
- Avaliar a adoção adicional de componentes do assistant-ui para raciocínio,
  tarefas e atividade de agentes, conforme os dados disponíveis no backend.
- Homologar conversas reais com streaming, ferramentas, aprovações, anexos e
  troca de chat nos diferentes provedores.
- Revisar desempenho e divisão dos bundles do frontend.

Esta etapa concentrou-se no frontend e na infraestrutura necessária para editá-lo
em modo dev. O compositor e vários painéis continuam sendo componentes próprios
do sistema. Não houve migração visual do aplicativo Android nesta etapa.

## 8. Arquivos principais

| Arquivo                                                         | Responsabilidade                                           |
| --------------------------------------------------------------- | ---------------------------------------------------------- |
| `Dockerfile`                                                    | Etapa de desenvolvimento e toolchain nativo.               |
| `docker-compose.dev.yml`                                        | Execução dev, volumes locais, portas e banco externo.      |
| `docker-compose.yml`                                            | Fallbacks das URLs de OAuth.                               |
| `scripts/install.sh`                                            | Verificação de prontidão e tratamento de falha.            |
| `packages/frontend/components.json`                             | Configuração do shadcn/ui.                                 |
| `packages/frontend/package.json` e `pnpm-lock.yaml`             | Dependências da integração.                                |
| `packages/frontend/vite.config.ts`                              | Porta e proxies do modo dev.                               |
| `packages/backend/src/config.ts`                                | URLs de callback OAuth vazias tratadas como ausentes.      |
| `package.json` e `packages/desktop/package.json`                | Scripts `dev` e `dev:desktop`.                             |
| `packages/frontend/src/main.tsx`                                | Carregamento da camada visual.                             |
| `packages/frontend/src/cowork.css`                              | Tema e estilos dos componentes migrados.                   |
| `packages/frontend/src/components/layout/Layout.tsx`            | Fundo da área autenticada.                                 |
| `packages/frontend/src/components/chat/AgentChatProvider.tsx`   | Adaptação do estado e contextos do assistant-ui.           |
| `packages/frontend/src/components/chat/AgentMessageActions.tsx` | Ações das mensagens.                                       |
| `packages/frontend/src/components/chat/MessageBubble.tsx`       | Cartões de mensagens.                                      |
| `packages/frontend/src/components/chat/StreamingContent.tsx`    | Renderização e suavização do streaming.                    |
| `packages/frontend/src/components/chat/ToolExecutionCard.tsx`   | Atividade de ferramentas com detalhes expansíveis.         |
| `packages/frontend/src/components/ui/`                          | Primitivas locais, incluindo botão, Collapsible e Tooltip. |
| `packages/frontend/src/pages/SessionPage.tsx`                   | Integração do chat à tela de sessão.                       |
| `packages/frontend/src/pages/BasicLoginPage.tsx`                | Tela de login no estilo fosco, sem efeito de cursor.       |

As alterações desta migração ainda não foram commitadas nem enviadas ao remoto.
