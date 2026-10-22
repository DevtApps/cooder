import { Pool, types, type PoolClient } from 'pg';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

import { createLogger } from '../utils/logger.js';
import { convertPlaceholders, translateDialect } from './dialect.js';

const log = createLogger('pg');

/**
 * BIGINT comes back as a number, not a string.
 *
 * `pg` returns int8 as a string because a Postgres BIGINT can hold values a
 * JavaScript number cannot represent exactly. That default is right in general
 * and wrong here: SQLite handed these columns back as numbers, so the code
 * compares them (`revision > 0`), does arithmetic on them, and sends them
 * straight to the clients, where the WebUI and the Android app both expect a
 * number. Left as strings the failures are quiet — `"0" > 0` is false,
 * `total + 1` is `"01"`, and a resume snapshot arrives with `revision: "0"`.
 *
 * Every BIGINT in this schema is a count, a token total, a byte size or an
 * ordering key. The largest of them is `messages.seq`, which at the current
 * rate of 99k rows reaches 2^53 in roughly ten billion years. IDs are TEXT and
 * are unaffected.
 */
types.setTypeParser(types.builtins.INT8, (value) => Number(value));

/**
 * And so does NUMERIC, which is what an aggregate over BIGINT produces.
 *
 * `SUM(total_tokens)` on a BIGINT column returns numeric, not int8 — Postgres
 * widens it so the sum cannot overflow. `pg` returns numeric as a string for
 * the same reason it does int8, and the analytics code adds those sums,
 * compares them and sends them to the charts. Left as strings, a token total
 * renders as `"600"` and two of them add up to `"600200"`.
 *
 * No column in this schema is declared NUMERIC, so this parser only ever sees
 * an aggregate of values that were already safe as numbers.
 */
types.setTypeParser(types.builtins.NUMERIC, (value) => Number(value));

/**
 * Async data access for the migration off SQLite.
 *
 * `better-sqlite3` is synchronous, so all 536 call sites read like
 * `db.prepare(sql).get(id)` and every caller above them is written as if the
 * database were free. Postgres is a network service; those call sites have to
 * become async, and so does everything up the stack.
 *
 * Two decisions keep that diff as small as it can be:
 *
 * - **`?` placeholders still work.** The existing SQL uses SQLite's `?`;
 *   rewriting every statement to `$1, $2` by hand would be thousands of edits
 *   whose only purpose is syntax. [convertPlaceholders] does it, so a ported
 *   query differs from the original by `await` and the method name.
 * - **The method names match.** `get`, `all` and `run` mirror better-sqlite3's
 *   statement API, so reviewing a ported module is reading the same shape.
 *
 * What is deliberately *not* provided is a synchronous facade. It is technically
 * possible with a worker thread and Atomics.wait, and it would make this a
 * drop-in change — but it would block the event loop on network I/O. Blocking on
 * a local file, which is what happens today, costs microseconds; blocking on a
 * socket would stall every streaming session in the process for the duration of
 * each query.
 */

let pool: Pool | null = null;
let sqlite: any = null;
let sqliteQueue: Promise<unknown> = Promise.resolve();

export function isSQLiteBackend(): boolean {
  return process.env.COODER_DB_DRIVER?.toLowerCase() === 'sqlite';
}

export function getSQLiteDatabasePath(): string {
  if (!isSQLiteBackend()) throw new Error('SQLite is not the configured database driver');
  const dataDirectory = process.env.WEBUI_DATA_DIR
    ? path.resolve(process.env.WEBUI_DATA_DIR)
    : path.resolve(process.cwd(), 'data');
  return path.resolve(process.env.COODER_DATABASE_PATH || path.join(dataDirectory, 'cooder.db'));
}

function getSQLiteDatabase(): any {
  if (sqlite) return sqlite;
  const file = getSQLiteDatabasePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let DatabaseSync: new (file: string) => any;
  try {
    ({ DatabaseSync } = createRequire(import.meta.url)('node:sqlite'));
  } catch (error) {
    throw new Error(
      `The local SQLite backend requires Node.js 24 or newer (node:sqlite): ${String(error)}`
    );
  }
  sqlite = new DatabaseSync(file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Some mounted filesystems do not implement chmod; the installer still
    // creates the local data directory with private permissions.
  }
  sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
  sqlite.function('regexp', (pattern: string, value: string | null) =>
    value == null ? 0 : new RegExp(pattern).test(value) ? 1 : 0
  );
  log.info('Local SQLite database opened', { file });
  return sqlite;
}

function prepareSQLiteQuery(sql: string): string {
  let translated = sql.replace(/\bIS NOT DISTINCT FROM\b/gi, 'IS');
  translated = translated.replace(
    /([A-Za-z_][A-Za-z0-9_.]*)\s*::jsonb\s*#>>\s*'\{([^}]+)\}'/gi,
    (_match, column: string, fields: string) =>
      `json_extract(${column}, '$.${fields.split(',').join('.')}')`
  );
  translated = translated.replace(/::(?:jsonb|bigint|int|integer|numeric|text)\b/gi, '');
  return translated;
}

function sqliteStatement(sql: string): any {
  return getSQLiteDatabase().prepare(prepareSQLiteQuery(sql));
}

export async function applySQLiteSchema(schema: string): Promise<void> {
  if (!isSQLiteBackend()) throw new Error('SQLite schema requested while using Postgres');
  await withSQLiteLock(() => getSQLiteDatabase().exec(schema));
}

export async function createSQLiteBackup(destination: string): Promise<{ verified: boolean; detail: string }> {
  if (!isSQLiteBackend()) throw new Error('SQLite backup requested while using Postgres');
  return withSQLiteLock(() => {
    const db = getSQLiteDatabase();
    db.prepare('VACUUM INTO ?').run(destination);
    const require = createRequire(import.meta.url);
    const { DatabaseSync } = require('node:sqlite');
    const copy = new DatabaseSync(destination, { readOnly: true });
    try {
      const check = copy.prepare('PRAGMA quick_check').get();
      const tables = Number(
        copy.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get().count
      );
      const detail = check?.quick_check === 'ok' ? `${tables} tables` : String(check?.quick_check ?? 'unknown');
      return { verified: check?.quick_check === 'ok' && tables > 0, detail };
    } finally {
      copy.close();
    }
  });
}

function withSQLiteLock<T>(work: () => T | Promise<T>): Promise<T> {
  const result = sqliteQueue.then(work);
  sqliteQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export interface PgConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max: number;
}

export function readPgConfig(): PgConfig {
  return {
    host: process.env.PGHOST || 'cooder-postgres',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'plumcode',
    user: process.env.PGUSER || 'plumcode',
    // POSTGRES_PASSWORD is what the compose file and .env already call it,
    // because that is the name the Postgres image requires. Accepting it here
    // as well means the secret is written once rather than kept in step in two
    // places, while PGPASSWORD still wins for anything setting it explicitly.
    password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || '',
    max: Number(process.env.PGPOOL_MAX || 10),
  };
}

export function getPool(): Pool {
  if (isSQLiteBackend()) {
    throw new Error('getPool() is only available with the Postgres database driver');
  }
  if (pool) return pool;
  const config = readPgConfig();

  // PGSCHEMA gives a test run its own tables in the same database. It goes in
  // as a connection parameter rather than a `SET` on the 'connect' event: that
  // handler cannot be awaited, so the SET raced the first real query on the
  // same client and a query could reach `public` — the live data — before the
  // search path was in place.
  const schema = process.env.PGSCHEMA;
  if (schema && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error(`PGSCHEMA is not a valid identifier: ${schema}`);
  }

  pool = new Pool({
    ...config,
    ...(schema ? { options: `-c search_path=${schema}` } : {}),
  });
  // An idle client that dies (a restart of the database, a dropped connection)
  // emits on the pool, and an unhandled 'error' event takes the process down.
  pool.on('error', (error) => log.error('Idle client error', { error: String(error) }));
  log.info('Postgres pool created', {
    host: config.host,
    database: config.database,
    max: config.max,
  });
  return pool;
}

export async function closePool(): Promise<void> {
  if (sqlite) {
    const current = sqlite;
    sqlite = null;
    current.close();
    return;
  }
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}

type Queryable = Pick<Pool, 'query'> | PoolClient;

async function execute(
  client: Queryable,
  sql: string,
  params: unknown[]
): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }> {
  return client.query(convertPlaceholders(translateDialect(sql)), params);
}

/** First row, or undefined — the shape `better-sqlite3`'s `.get()` returns. */
export async function get(sql: string, ...params: unknown[]): Promise<any> {
  if (isSQLiteBackend()) {
    return withSQLiteLock(() => sqliteStatement(sql).get(...params));
  }
  return (await execute(getPool(), sql, params)).rows[0];
}

/** All rows, like `.all()`. */
export async function all(sql: string, ...params: unknown[]): Promise<any[]> {
  if (isSQLiteBackend()) {
    return withSQLiteLock(() => sqliteStatement(sql).all(...params));
  }
  return (await execute(getPool(), sql, params)).rows;
}

/** Writes, like `.run()`; `changes` mirrors the field the callers already read. */
export async function run(sql: string, ...params: unknown[]): Promise<{ changes: number }> {
  if (isSQLiteBackend()) {
    return withSQLiteLock(() => {
      const result = sqliteStatement(sql).run(...params);
      return { changes: Number(result.changes) };
    });
  }
  const result = await execute(getPool(), sql, params);
  return { changes: result.rowCount ?? 0 };
}

/**
 * The same three methods, pinned to one client.
 *
 * Deliberately not generic. `pg` ships an ESM entry without declarations, so a
 * generic constrained to its QueryResultRow resolves to two unrelated types in
 * one file. The existing code already casts every read — `.get(...) as { ok:
 * number } | undefined` — so returning rows and letting the caller name the
 * shape matches what is there rather than adding a type dance around it.
 */
export interface TransactionScope {
  get(sql: string, ...params: unknown[]): Promise<any>;
  all(sql: string, ...params: unknown[]): Promise<any[]>;
  run(sql: string, ...params: unknown[]): Promise<{ changes: number }>;
}

/**
 * All statements inside `fn` run on one client, so they share the transaction.
 * Using the pool helpers there instead would silently take a different
 * connection per statement and commit nothing.
 */
export async function transaction<T>(
  fn: (tx: TransactionScope) => Promise<T>,
  options: { isolation?: 'repeatable read' } = {}
): Promise<T> {
  if (isSQLiteBackend()) {
    return withSQLiteLock(async () => {
      const db = getSQLiteDatabase();
      db.exec('BEGIN');
      const scope: TransactionScope = {
        async get(sql, ...params) {
          return db.prepare(prepareSQLiteQuery(sql)).get(...params);
        },
        async all(sql, ...params) {
          return db.prepare(prepareSQLiteQuery(sql)).all(...params);
        },
        async run(sql, ...params) {
          const result = db.prepare(prepareSQLiteQuery(sql)).run(...params);
          return { changes: Number(result.changes) };
        },
      };
      try {
        const result = await fn(scope);
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    });
  }
  const client = await getPool().connect();
  const scope: TransactionScope = {
    async get(sql, ...params) {
      return (await execute(client, sql, params)).rows[0];
    },
    async all(sql, ...params) {
      return (await execute(client, sql, params)).rows;
    },
    async run(sql, ...params) {
      return { changes: (await execute(client, sql, params)).rowCount ?? 0 };
    },
  };

  try {
    await client.query(
      options.isolation === 'repeatable read' ? 'BEGIN ISOLATION LEVEL REPEATABLE READ' : 'BEGIN'
    );
    const result = await fn(scope);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export { convertPlaceholders, translateDialect } from './dialect.js';
