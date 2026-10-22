import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// packages/backend/src/utils -> repository root.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/**
 * Root of the app's files (scripts, extensions). The Docker image has them at
 * /app; a local install runs from the repository checkout.
 */
export function appRoot(): string {
  return process.env.COODER_APP_ROOT || (fs.existsSync('/app/scripts') ? '/app' : repoRoot);
}

export function appPath(...segments: string[]): string {
  return path.join(appRoot(), ...segments);
}

/** The on-demand skill/agent catalog CLI, as agents should be told to run it. */
export const CAPABILITY_CLI = appPath('scripts', 'capability-catalog.mjs');
