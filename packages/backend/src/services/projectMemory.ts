import { nanoid } from 'nanoid';
import { all as pgAll, get as pgGet, run as pgRun } from '../db/pg.js';

export interface ProjectFact {
  id: string;
  content: string;
  sourceSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const MAX_FACTS = 100;
export const MAX_FACT_CHARS = 500;
/** What one session's prompt carries; the rest stays reachable through `recall`. */
const CONTEXT_CHAR_BUDGET = 5000;

const COLUMNS = `id, content, source_session_id AS "sourceSessionId",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

const projectKey = (cwd: string) => cwd.replace(/\/+$/, '') || '/';

export async function listFacts(userId: string, cwd: string): Promise<ProjectFact[]> {
  return (await pgAll(
    `SELECT ${COLUMNS} FROM project_memories
     WHERE user_id = ? AND working_directory = ? ORDER BY updated_at DESC, id`,
    userId,
    projectKey(cwd)
  )) as unknown as ProjectFact[];
}

function cleanFact(content: string): string {
  const text = content.replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('A fact cannot be empty');
  if (text.length > MAX_FACT_CHARS) {
    throw new Error(`Keep a fact under ${MAX_FACT_CHARS} characters; split it or shorten it`);
  }
  return text;
}

export async function addFact(
  userId: string,
  cwd: string,
  content: string,
  sourceSessionId: string | null
): Promise<{ fact: ProjectFact; duplicate: boolean }> {
  const text = cleanFact(content);
  const existing = await listFacts(userId, cwd);
  const same = existing.find((fact) => fact.content.toLowerCase() === text.toLowerCase());
  if (same) return { fact: same, duplicate: true };
  if (existing.length >= MAX_FACTS) {
    throw new Error(`Project memory is full (${MAX_FACTS} facts); update or forget some first`);
  }
  const id = nanoid(8);
  await pgRun(
    `INSERT INTO project_memories (id, user_id, working_directory, content, source_session_id)
     VALUES (?, ?, ?, ?, ?)`,
    id,
    userId,
    projectKey(cwd),
    text,
    sourceSessionId
  );
  const fact = (await pgGet(
    `SELECT ${COLUMNS} FROM project_memories WHERE id = ?`,
    id
  )) as unknown as ProjectFact;
  return { fact, duplicate: false };
}

export async function updateFact(
  userId: string,
  cwd: string,
  id: string,
  content: string
): Promise<ProjectFact> {
  const text = cleanFact(content);
  await pgRun(
    `UPDATE project_memories
     SET content = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ? AND working_directory = ?`,
    text,
    id,
    userId,
    projectKey(cwd)
  );
  const fact = (await pgGet(
    `SELECT ${COLUMNS} FROM project_memories WHERE id = ? AND user_id = ? AND working_directory = ?`,
    id,
    userId,
    projectKey(cwd)
  )) as unknown as ProjectFact | undefined;
  if (!fact) throw new Error('No such fact');
  return fact;
}

export async function removeFact(userId: string, cwd: string, id: string): Promise<boolean> {
  const before = (await listFacts(userId, cwd)).length;
  await pgRun(
    'DELETE FROM project_memories WHERE id = ? AND user_id = ? AND working_directory = ?',
    id,
    userId,
    projectKey(cwd)
  );
  return (await listFacts(userId, cwd)).length < before;
}

/**
 * The block every session of the project starts from. Null when there is
 * nothing to say, so empty projects add no noise to the prompt.
 */
export function formatMemoryContext(facts: ProjectFact[]): string | null {
  if (facts.length === 0) return null;
  const lines: string[] = [];
  let used = 0;
  for (const fact of facts) {
    const line = `- [${fact.id}] ${fact.content}`;
    if (used + line.length > CONTEXT_CHAR_BUDGET) break;
    lines.push(line);
    used += line.length + 1;
  }
  const omitted = facts.length - lines.length;
  return [
    '<project-memory>',
    'Facts saved for this project by earlier sessions (not the conversation history). Trust them unless the code or the user says otherwise.',
    ...lines,
    omitted > 0 ? `(${omitted} more not shown; call the \`recall\` tool to read them.)` : '',
    'Save new durable facts with the `remember` tool; correct stale ones with `update_memory` or `forget`.',
    '</project-memory>',
  ]
    .filter(Boolean)
    .join('\n');
}
