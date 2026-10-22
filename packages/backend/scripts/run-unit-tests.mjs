// Node 20's test runner neither expands `src/**/*.test.ts` nor picks up .ts
// files from a directory, so the unit suite used to run zero files. List them
// here and hand them over explicitly.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const files = readdirSync('src', { recursive: true })
  .filter((file) => String(file).endsWith('.test.ts'))
  .map((file) => path.join('src', String(file)))
  .sort();

if (files.length === 0) {
  console.error('No unit test files found under src/.');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
