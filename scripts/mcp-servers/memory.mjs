#!/usr/bin/env node
// MCP stdio server: facts about a project that outlive a session.
//
// Work happens in the backend (packages/backend/src/services/projectMemory.ts); this
// process maps MCP tool calls to POST /api/project-memory/internal/call
// with the hook secret and the session id, like the other bridges.
//
// Speaks JSON-RPC 2.0 over stdin/stdout, no external deps.
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';

const BACKEND = process.env.WEBUI_BACKEND_URL || 'http://localhost:3001';
const HOOK_SECRET = process.env.WEBUI_HOOK_SECRET || '';
const SESSION_ID = process.env.WEBUI_SESSION_ID || '';
const SESSION_CONTEXT_FILE = process.env.WEBUI_SESSION_CONTEXT_FILE || '';

const log = (...args) => console.error('[mcp-memory]', ...args);
const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
const result = (id, value) => send({ jsonrpc: '2.0', id, result: value });
const error = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

function getSessionId() {
  if (SESSION_ID) return SESSION_ID;
  if (!SESSION_CONTEXT_FILE) return '';
  try {
    const parsed = JSON.parse(readFileSync(SESSION_CONTEXT_FILE, 'utf8'));
    if (Date.now() - Number(parsed?.updatedAt || 0) > 6 * 60 * 60 * 1000) return '';
    return typeof parsed?.webuiSessionId === 'string' ? parsed.webuiSessionId : '';
  } catch {
    return '';
  }
}

const TOOLS = [
  {
    name: 'remember',
    description:
      'Save a durable fact about this project so later sessions know it too: a decision and its reason, a convention, how to build/run/test, an environment quirk, a user preference, a pitfall. One short, self-contained sentence. Not for progress notes, one-off details, anything already in the code, or secrets. Saved facts are shown to every session of the project.',
    inputSchema: {
      type: 'object',
      properties: { fact: { type: 'string', description: 'The fact, max 500 characters.' } },
      required: ['fact'],
    },
  },
  {
    name: 'recall',
    description: 'List the facts saved for this project, optionally filtered by a word. Check before saving to avoid duplicates.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
  },
  {
    name: 'update_memory',
    description: 'Replace the text of a saved fact (by id from recall) when it changed or was wrong.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, fact: { type: 'string' } },
      required: ['id', 'fact'],
    },
  },
  {
    name: 'forget',
    description: 'Delete a saved fact (by id from recall) that is no longer true.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
];

async function callBackend(tool, args) {
  const sessionId = getSessionId();
  if (!sessionId) throw new Error('This session has no WebUI identity, so there is no project to remember things for.');
  const response = await fetch(`${BACKEND}/api/project-memory/internal/call`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-webui-hook-secret': HOOK_SECRET,
      'x-webui-session-id': sessionId,
    },
    body: JSON.stringify({ tool, args }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success) throw new Error(body?.error?.message || `HTTP ${response.status}`);
  return body.data;
}

async function handleRequest(msg) {
  const { id, method, params } = msg;
  try {
    if (method === 'initialize') {
      return result(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'mcp-memory', version: '0.1.0' },
      });
    }
    if (method === 'notifications/initialized' || method === 'initialized') return;
    if (method === 'tools/list') return result(id, { tools: TOOLS });
    if (method === 'tools/call') {
      const name = params?.name;
      if (!TOOLS.some((tool) => tool.name === name)) return error(id, -32601, `unknown tool: ${name}`);
      try {
        const data = await callBackend(name, params?.arguments || {});
        const content = [];
        if (data.text) content.push({ type: 'text', text: data.text });
        if (data.image) content.push({ type: 'image', data: data.image.data, mimeType: data.image.mimeType });
        return result(id, { content: content.length ? content : [{ type: 'text', text: 'Done.' }] });
      } catch (e) {
        return result(id, { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });
      }
    }
    return error(id, -32601, `method not found: ${method}`);
  } catch (e) {
    log('handler error', e.message);
    return error(id, -32603, e.message);
  }
}

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    void handleRequest(JSON.parse(line));
  } catch (e) {
    log('parse error', e.message);
  }
});
log(`ready (backend=${BACKEND}, session=${getSessionId() || '<unset>'})`);
