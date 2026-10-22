# Cooder

Cooder is a local-first coding workspace for running Codex and other agent
harnesses against real projects. It combines a web workspace, streaming chat,
project files, Git operations, browser automation, MCP tools and provider-aware
usage tracking in one place.

Codex is the default provider. OpenCode, Pi, Kimi Code, Mistral Vibe and Claude
Code are available when a project needs a different model, runtime or account.

## Project origin

Cooder began as a project based on [PlumCode](https://github.com/zwaetschge/plum-code-webui)
and has since continued under its own name and direction.

## What Cooder provides

- Streaming agent sessions over Socket.IO, with history, approvals, questions,
  todos, subagents and resumable turns.
- Project navigation with file browsing, editing, Git status, diffs, branches,
  commits and GitHub operations.
- Provider controls for model, reasoning, permission mode, web search and
  service tier on each session.
- A shared browser panel and MCP integrations for browser work, images,
  Android projects, Godot, Blender, processes and subagents.
- Analytics for tokens, cache usage, provider mix, model pricing and limits.
- Local SQLite installation with an isolated runtime, plus PostgreSQL-backed
  Docker deployment for shared or hosted environments.
- Responsive web UI, native Android client, desktop shell and Firefox/Chrome
  browser extension.
- Interface disponível em inglês e português do Brasil, com idioma persistido
  por conta e configurável em Settings → Appearance.

## Architecture

```text
Web / Android / Desktop / Browser extension
                    │
                    ▼
       Express API + Socket.IO backend
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
    SQLite       PostgreSQL   CLI/MCP workers
   (local)        (Docker)    Codex, Pi, ...
```

The backend owns authentication, sessions, persistence, provider processes,
WebSocket delivery, browser access and integrations. The frontend is a React
single-page application. Shared TypeScript types keep client and server
contracts aligned.

## Requirements

For local development:

- Node.js 24 or newer
- pnpm 9 or newer
- Git
- At least one installed and authenticated provider CLI, normally `codex`

For Docker deployment:

- Docker 24 or newer
- Docker Compose plugin
- OpenSSL

## Quick start

### Local installation

The local installer packages the compiled application, downloads an isolated
Node.js runtime and keeps Cooder data below `COODER_HOME` (default:
`~/.local/share/cooder`).

```bash
pnpm install
pnpm build
pnpm cooder:install
pnpm cooder:web
```

Useful lifecycle commands:

```bash
pnpm cooder -- status
pnpm cooder -- logs
pnpm cooder -- stop
pnpm cooder -- web --no-open
```

The installer creates the first administrator, initializes local SQLite and
installs Codex into an isolated provider home. Provider authentication and
additional integrations are configured from Settings.

### Docker

No prebuilt container image is published. Docker Compose builds Cooder locally
from the checked-out source.

Create `.env` with `POSTGRES_PASSWORD`, `SESSION_SECRET`, `JWT_SECRET` and
`ENCRYPTION_KEY`, then start the stack:

```bash
cp .env.example .env
docker compose up -d --build
```

Open `http://localhost:4545`, or the port configured by `WEBUI_PORT`. Docker
uses PostgreSQL for durable records and bind mounts for project data, provider
state and workspaces. Keep `CLI_RUNNER_ACCESS=admin-only` unless every account
with execution access is trusted.

For a deployment with a rebuild sidecar, trigger the controlled rebuild path:

```bash
bash scripts/plum-rebuild.sh
```

Do not recreate the main service from inside its own container.

### Development

```bash
pnpm install
pnpm dev
```

This starts the backend on port `3001`, Vite on port `5173` and the shared type
watcher. For the containerized development stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for database setup, screenshots, tests and
release packaging.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for
development setup and pull request guidance. Please report security issues
privately using the process in [SECURITY.md](SECURITY.md).

## Providers

| Provider | Runtime | Typical use |
| --- | --- | --- |
| Codex | `codex exec` per turn | Default coding workflow |
| OpenCode | HTTP/SSE server | Multi-model routing and persistent provider state |
| Pi | JSONL RPC | Alternative agent runtime using shared provider connections |
| Kimi Code | ACP stdio | Persistent ACP sessions and native resume |
| Mistral Vibe | ACP stdio | Mistral coding plans and approval-aware sessions |
| Claude Code | stream JSON | Anthropic-compatible workflows |

Provider authentication is isolated per user. Sessions retain their selected
provider, model, permission mode and runtime settings.

## Integrations

- **Browser panel** — shared Chrome automation with navigation, screenshots,
  forms, JavaScript, console and network inspection.
- **Browser extension** — remote Firefox and Chrome control through a paired,
  scoped browser bridge.
- **MCP catalog** — managed capabilities, plugins, skills and project tools.
- **Image generation** — ComfyUI workflows and optional Gemini image support.
- **Android builder** — build, install, launch and inspect Android projects.
- **GitHub** — clone, create, push, branch and repository management.
- **Project memory** — durable project facts available to future sessions.
- **Analytics** — idempotent per-turn usage ledger with provider/model pricing.

## Clients

### Web

The main client is a React 18 + Vite application. The primary screens are:

- Home and session discovery
- Streaming session chat
- Files, Git, browser, notes, memory and process tools
- Analytics
- Provider, security, browser, MCP, skill and admin settings

### Android

The native Android client lives in `packages/android` and uses Kotlin,
Jetpack Compose and the same backend APIs. It supports sessions, streaming
chat, approvals, analytics, offline outbox behavior, tablets and an optional
Wear OS companion.

```bash
cd packages/android
./gradlew assembleDebug
./gradlew :wear:assembleDebug
```

### Desktop

The Electron shell is packaged separately from the web client:

```bash
pnpm dev:desktop
pnpm --filter @plum-code-webui/desktop run package
```

## Configuration

The complete validated environment schema is in
`packages/backend/src/config.ts`. The most important settings are:

| Variable | Purpose |
| --- | --- |
| `SESSION_SECRET` / `JWT_SECRET` | Session and token signing; each must be at least 32 characters |
| `ENCRYPTION_KEY` | Encrypts provider credentials and integration tokens |
| `AUTH_ALLOWED_EMAILS` | Optional login allowlist; recommended outside a private network |
| `FRONTEND_URL` / `CORS_ALLOWED_ORIGINS` | Public URL and allowed browser origins |
| `DATA_DIR` / `CONFIG_DIR` / `WORKSPACE_DIR` | Docker persistence and project mounts |
| `ALLOWED_BASE_PATHS` | Filesystem roots agents may access |
| `CLI_RUNNER_ACCESS` | Controls which users may execute provider processes |
| `CLI_PROVIDER_*` | Provider model menus and defaults |
| `COMFYUI_URL` / `GODOT_BIN` / `BLENDER_BIN` | Optional integration endpoints and binaries |

## Testing and quality checks

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm lint
pnpm format:check
```

Provider-specific and backend regression suites are available under
`packages/backend/package.json`. UI screenshots can be captured with:

```bash
COODER_USER=dev COODER_PASSWORD=... COODER_URL=http://localhost:4545 \
  pnpm screenshots local-check
```

## Repository map

```text
packages/
├── backend/              Express API, Socket.IO, providers and persistence
├── frontend/             React application and feature modules
├── shared/               Shared TypeScript types and utilities
├── android/              Android and Wear OS clients
├── desktop/              Electron shell
├── desktop-companion/    Desktop helper process
└── firefox-extension/    Firefox and Chrome browser extension
scripts/                  Installers, MCP bridges, maintenance and checks
docs/                     Architecture, operations and implementation notes
```

## Documentation

- [Development guide](DEVELOPMENT.md) — local workflows, Docker development,
  tests and release builds.
- [Architecture notes](docs/session-mesh-docker-watchdogs.md) — session mesh,
  Docker health and watchdog design.
- [Discord integration](docs/discord-cooder-bot-integration.md) — optional
  automation bridge and event model.
- [Android verification](packages/android/TESTING.md) — native build and device
  checks.
- [Browser extension](packages/firefox-extension/README.md) — pairing, tools,
  packaging and browser security boundaries.

## Security model

Cooder runs agent processes with access to the selected workspace. Use a private
network or a trusted reverse proxy, configure an email allowlist for exposed
deployments, keep execution admin-only by default and never mount the raw
Docker socket into the main service. Browser pairing tokens are scoped to the
browser bridge and can be revoked independently.

## License

MIT.
