#!/usr/bin/env node
/** Build the local Node 24 SQLite schema from the canonical Postgres schema. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'packages/backend/src/db/schema.sql');
const outputPath = path.join(root, 'packages/backend/src/db/schema.sqlite.sql');
let schema = fs.readFileSync(sourcePath, 'utf8');
schema = schema.split('-- Invariants the SQLite schema enforced with triggers.')[0];

const foreignKeys = [];
for (const match of schema.matchAll(
  /ALTER TABLE "([^"]+)" ADD CONSTRAINT "[^"]+" FOREIGN KEY \("([^"]+)"\) REFERENCES "([^"]+)" \("([^"]+)"\)( ON DELETE [A-Z ]+)?;/g
)) {
  foreignKeys.push({
    table: match[1],
    column: match[2],
    target: match[3],
    targetColumn: match[4],
    onDelete: match[5] ?? '',
  });
}

schema = schema.replace(/DO \$\$[\s\S]*?END \$\$;/g, '');
schema = schema.replace(
  /ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "search_vector"[\s\S]*?;\s*CREATE INDEX IF NOT EXISTS "idx_messages_search_vector"[\s\S]*?;\s*/,
  ''
);
schema = schema.replace(/to_char\(now\(\) AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'\)/g, 'CURRENT_TIMESTAMP');
schema = schema.replace(/DOUBLE PRECISION/g, 'REAL').replace(/\bJSONB\b/g, 'TEXT').replace(/\bBYTEA\b/g, 'BLOB');

const sequenceTables = [];
schema = schema.replace(
  /CREATE TABLE IF NOT EXISTS "([^"]+)" \(([\s\S]*?)\n\);/g,
  (_whole, table, rawBody) => {
    let body = rawBody;
    if (/"id" BIGSERIAL/.test(body) && /PRIMARY KEY \("id"\)/.test(body)) {
      body = body.replace(/"id" BIGSERIAL\s*,/, '"id" INTEGER PRIMARY KEY AUTOINCREMENT,');
      body = body.replace(/,?\s*PRIMARY KEY \("id"\)/, '');
    }
    if (/"seq" BIGSERIAL NOT NULL/.test(body)) {
      body = body.replace(/"seq" BIGSERIAL NOT NULL/, '"seq" INTEGER');
      sequenceTables.push(table);
    }
    const keys = foreignKeys
      .filter((key) => key.table === table)
      .map(
        (key) =>
          `  FOREIGN KEY ("${key.column}") REFERENCES "${key.target}" ("${key.targetColumn}")${key.onDelete}`
      );
    if (keys.length) body = `${body},\n${keys.join(',\n')}`;
    return `CREATE TABLE IF NOT EXISTS "${table}" (${body}\n);`;
  }
);

for (const table of sequenceTables) {
  schema += `\nCREATE TRIGGER IF NOT EXISTS "trg_${table}_sequence"\n` +
    `AFTER INSERT ON "${table}" WHEN NEW."seq" IS NULL\n` +
    `BEGIN UPDATE "${table}" SET "seq" = NEW.rowid WHERE rowid = NEW.rowid; END;\n`;
}

schema += `

CREATE TABLE IF NOT EXISTS session_agent_runs (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  id TEXT NOT NULL, chat_id TEXT, updated_at INTEGER NOT NULL, payload TEXT NOT NULL,
  PRIMARY KEY (session_id, id)
);
CREATE INDEX IF NOT EXISTS idx_session_agent_runs_chat ON session_agent_runs(session_id, chat_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS browser_tokens (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
  token_hash TEXT NOT NULL, token_prefix TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_browser_tokens_user ON browser_tokens(user_id);

CREATE TABLE IF NOT EXISTS project_memories (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, working_directory TEXT NOT NULL,
  content TEXT NOT NULL, source_session_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_project_memories_project ON project_memories(user_id, working_directory);
`;

fs.writeFileSync(outputPath, schema);
console.log(`Wrote ${path.relative(root, outputPath)} (${sequenceTables.length} sequence triggers)`);
