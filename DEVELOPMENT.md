# Desenvolvimento do Cooder

Este guia cobre o ciclo local de desenvolvimento, validação e empacotamento do
Cooder. O produto combina frontend React, backend Node.js, contratos TypeScript
compartilhados e clientes nativos opcionais.

## Pré-requisitos

- Node.js 24 ou mais recente
- pnpm 9 ou mais recente
- Git
- Docker e Docker Compose para o ambiente containerizado
- PostgreSQL para desenvolvimento do backend, ou SQLite via instalação local

## Desenvolvimento local

Instale as dependências e inicie os watchers:

```bash
pnpm install
pnpm dev
```

O backend escuta em `3001`, o Vite em `5173` e o pacote shared acompanha as
alterações de tipos. O Vite encaminha API, autenticação e Socket.IO para o
backend. Ajuste `BACKEND_PORT` e `CORS_ALLOWED_ORIGINS` quando necessário.

A instalação local usa SQLite quando `COODER_DB_DRIVER=sqlite`. Os dados e os
homes dos providers ficam isolados em `COODER_HOME`, normalmente
`~/.local/share/cooder`.

## Docker para desenvolvimento

O ambiente Docker usa PostgreSQL e monta os diretórios de código para permitir
hot reload:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

Abra `http://localhost:${WEBUI_PORT:-4545}`. O banco deve estar disponível e
as variáveis `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` e `PGPASSWORD` devem
selecionar a instância correta. Para usar o banco incluído:

```bash
docker compose up -d postgres
```

Logs do serviço:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f claude-code-webui
```

As tabelas e migrações pendentes são aplicadas durante a inicialização do
backend. Alterações de dependência ou Dockerfile exigem rebuild da imagem.

## Build e validação

```bash
pnpm typecheck
pnpm build
pnpm lint
pnpm format:check
pnpm test
```

O build compila shared, backend e frontend e gera o schema SQLite usado pelo
instalador local. `pnpm test` executa as suítes de regressão disponíveis; as
suítes dependentes de ferramentas externas informam quando uma dependência
opcional não está instalada.

Testes focados ficam no pacote correspondente:

```bash
pnpm --filter @plum-code-webui/backend run test:providers
pnpm --filter @plum-code-webui/backend run test:subagents
pnpm --filter @plum-code-webui/frontend run test:chat-sync
```

## Interface e screenshots

O frontend usa React, Vite, Tailwind, componentes Base UI, Zustand e Socket.IO.
As telas ficam organizadas por feature em `packages/frontend/src/features`.
O catálogo i18n fica em `packages/frontend/src/lib/i18n.tsx`; novos textos de
interface devem receber chaves em inglês e português. O idioma da conta é
alterado em Settings → Appearance e sincronizado pelo endpoint de settings.

Para capturar as telas principais:

```bash
COODER_USER=dev COODER_PASSWORD=... COODER_URL=http://localhost:4545 \
  pnpm screenshots local-check
```

Os artefatos são gravados em `.artifacts/ui-screenshots/`, que não deve ser
versionado.

## Clientes adicionais

### Android

```bash
cd packages/android
./gradlew assembleDebug
./gradlew test
./gradlew :wear:assembleDebug
```

Consulte [packages/android/TESTING.md](packages/android/TESTING.md) para testes
em dispositivo, screenshots e perfis de inicialização.

### Desktop

```bash
pnpm dev:desktop
pnpm --filter @plum-code-webui/desktop run typecheck
pnpm --filter @plum-code-webui/desktop run package
```

## Instalação e release local

O instalador local pressupõe que os artefatos já foram compilados:

```bash
pnpm build
pnpm cooder:install
pnpm cooder:web
```

Use `cooder status`, `cooder logs`, `cooder stop` e `cooder web --no-open` para
operar a instalação, inclusive remotamente por SSH. `cooder start` inicia o
serviço destacado do terminal e grava a saída em `COODER_HOME/run/cooder.log`;
ele continua ativo após o encerramento da conexão. `cooder stop` aguarda o
encerramento completo antes de retornar. Ao atualizar uma instalação ativa,
`cooder install` usa esse mesmo fluxo de stop/start. O runtime, o SQLite, os
dados e os homes dos providers permanecem em `COODER_HOME`.

## Deploy Docker

Para uma execução de produção:

```bash
docker compose up -d --build
```

O serviço principal deve ser recriado pelo fluxo controlado de rebuild quando
um sidecar de manutenção estiver configurado:

```bash
bash scripts/plum-rebuild.sh
```

Não execute comandos de recriação do Compose dentro do próprio container do
serviço. Mantenha o acesso de execução restrito e nunca monte o socket Docker
bruto no backend.

## Convenções

- Preserve os contratos em `packages/shared` quando alterar API ou eventos.
- Mantenha autenticação e autorização no backend; o frontend apenas reflete o
  estado de sessão.
- Novos providers devem ter isolamento de configuração, streaming e uso.
- Mudanças de schema devem atualizar o baseline, a tradução de dialeto e os
  testes de migração.
- Use o browser integrado do Cooder para verificar páginas e previews.
