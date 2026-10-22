/**
 * Standalone migration runner for `pnpm db:migrate`.
 *
 * Applies the baseline schema and every migration not yet recorded, then exits.
 * It is the same work `initDatabase()` does at boot, minus the bootstrapping and
 * reconciliation that only make sense with a server about to start — so running
 * it against a database the server is also using is safe and does nothing twice.
 *
 * The connection comes from PGHOST/PGDATABASE/PGUSER and PGPASSWORD, or
 * POSTGRES_PASSWORD, which is what compose and .env already set.
 */
// Load host-only install settings before config or CLI paths are resolved.
import '../bootstrap/localInstall.js';
import '../config.js';
import { closePool, getSQLiteDatabasePath, isSQLiteBackend, readPgConfig } from './pg.js';
import { runPendingMigrations } from './migrations.js';
import { applySchema } from './index.js';

try {
  if (isSQLiteBackend()) {
    await applySchema();
    console.log(`[db:migrate] Local SQLite schema applied at ${getSQLiteDatabasePath()}`);
    await closePool();
    process.exit(0);
  }
  const config = readPgConfig();
  await applySchema();
  const applied = await runPendingMigrations();
  console.log(
    `[db:migrate] Schema applied to ${config.user}@${config.host}/${config.database}; ` +
      `${applied} migration(s) run`
  );
  await closePool();
  process.exit(0);
} catch (error) {
  console.error('[db:migrate] Migration failed:', error);
  await closePool().catch(() => {});
  process.exit(1);
}
