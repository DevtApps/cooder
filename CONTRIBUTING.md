# Contributing to Cooder

Thanks for your interest in contributing. Bug reports, documentation
improvements, tests and focused code changes are welcome.

## Before opening an issue

- Search existing issues and discussions for the same problem or proposal.
- For security vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of
  opening a public issue.
- Do not include passwords, API keys, personal information, private project
  files or unredacted conversation logs in issues or pull requests.

## Development setup

Requirements:

- Node.js 24 or newer
- pnpm 9 or newer
- Git
- Docker and Docker Compose for the PostgreSQL-backed development environment

From the repository root:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for database setup, focused tests,
additional clients and local installation details.

## Before submitting a pull request

1. Keep the change focused and explain the user-visible behavior or problem it
   addresses.
2. Add or update tests for behavior changes. Avoid including local credentials,
   generated build output, databases, logs or screenshots containing private
   data.
3. Run the checks relevant to your change:

   ```bash
   pnpm typecheck
   pnpm lint
   pnpm format:check
   pnpm test
   pnpm build
   ```

4. Update user or developer documentation when behavior, configuration or
   setup changes.
5. Open a pull request with a concise summary, testing notes and any relevant
   issue links. Call out known limitations or checks you could not run.

There is no required issue assignment, commit-message format or contributor
license agreement.
