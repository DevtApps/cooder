// Local install mode: the backend runs on the host instead of in Docker.
//
// Imported first by index.ts, before anything reads HOME or resolves a CLI.
// With COODER_HOME set (by .env.local, written by scripts/local/install.sh):
//   - HOME becomes $COODER_HOME/home, so every provider login, transcript and
//     config (~/.codex, ~/.claude, ~/.opencode…) stays apart from the CLIs the
//     user already runs on this machine;
//   - $COODER_HOME/cli/bin, where the installer puts Cooder's own copies of the
//     CLIs, goes first on PATH.
// Without COODER_HOME (Docker, tests) nothing changes.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

// Host-only settings; never present in the container. Load the installed
// product's settings before config.ts validates required secrets. A checkout's
// .env.local remains available for development and fills in unset values.
const inheritedCooderHome = process.env.COODER_HOME?.trim();
if (inheritedCooderHome) {
  const configuredHome = path.resolve(
    inheritedCooderHome.replace(/^~(?=$|\/)/, process.env.HOME ?? '')
  );
  dotenv.config({ path: path.join(configuredHome, '.env.local') });
}
dotenv.config({ path: path.join(repoRoot, '.env.local') });

const cooderHome = process.env.COODER_HOME?.trim();
if (cooderHome) {
  // COODER_HOME may come from the checkout's .env.local instead of the parent
  // process. Load its install settings as well before applying local isolation.
  if (!inheritedCooderHome) {
    const configuredHome = path.resolve(cooderHome.replace(/^~(?=$|\/)/, process.env.HOME ?? ''));
    dotenv.config({ path: path.join(configuredHome, '.env.local') });
  }
  process.umask(0o077);
  const resolved = path.resolve(cooderHome.replace(/^~(?=$|\/)/, process.env.HOME ?? ''));
  const home = path.join(resolved, 'home');
  const cliBin = path.join(resolved, 'cli', 'bin');
  fs.mkdirSync(home, { recursive: true });

  process.env.COODER_REAL_HOME = process.env.HOME;
  process.env.HOME = home;
  process.env.CODEX_HOME = process.env.CODEX_HOME || path.join(home, '.codex');
  process.env.COODER_CLI_BIN_DIR = cliBin;
  // Agents installed or updated from the panel land in the same prefix.
  process.env.NPM_CONFIG_PREFIX = path.join(resolved, 'cli');
  process.env.PNPM_HOME = cliBin;
  process.env.PIPX_HOME = path.join(resolved, 'pipx');
  process.env.PIPX_BIN_DIR = cliBin;
  const pathParts = (process.env.PATH ?? '').split(':').filter((part) => part && part !== cliBin);
  const runtimeBin = path.join(resolved, 'runtime', 'bin');
  process.env.COODER_PNPM_BIN = process.env.COODER_PNPM_BIN || path.join(runtimeBin, 'pnpm');
  process.env.PATH = [runtimeBin, cliBin, ...pathParts].join(':');

  console.log(`[LOCAL] COODER_HOME=${resolved} (HOME=${home}, CLIs from ${cliBin})`);
}
