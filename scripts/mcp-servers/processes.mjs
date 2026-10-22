#!/usr/bin/env node
// MCP stdio server: background processes of a session, shown in the Runs panel.
//
// Work happens in the backend (packages/backend/src/services/processes); this
// process maps MCP tool calls to POST /api/processes/internal/call
// with the hook secret and the session id, like the other bridges.
//
// Speaks JSON-RPC 2.0 over stdin/stdout, no external deps.
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';

const BACKEND = process.env.WEBUI_BACKEND_URL || 'http://localhost:3001';
const HOOK_SECRET = process.env.WEBUI_HOOK_SECRET || '';
const SESSION_ID = process.env.WEBUI_SESSION_ID || '';
const SESSION_CONTEXT_FILE = process.env.WEBUI_SESSION_CONTEXT_FILE || '';

const log = (...args) => console.error('[mcp-processes]', ...args);
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

const id = { type: 'string', description: 'Process id from bg_start or bg_list.' };

const TOOLS = [
  {
    name: 'bg_start',
    description:
      'Start a long-running command in the background (dev server, watcher, tunnel, database…) and keep it running after your turn ends. Use this instead of `&`, `nohup` or a blocking shell call. It is listed in the Runs panel, where the user can read its output and stop it. Returns its id and the first output.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to run, e.g. "pnpm dev".' },
        name: { type: 'string', description: 'Short label shown in the panel, e.g. "web dev server".' },
        cwd: { type: 'string', description: 'Working directory. Defaults to the session project.' },
      },
      required: ['command'],
    },
  },
  {
    name: 'bg_list',
    description: 'List this session\'s background processes with their state and detected local URLs.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'bg_logs',
    description: 'Read the latest output of a background process.',
    inputSchema: {
      type: 'object',
      properties: { id, tail: { type: 'number', description: 'How many characters from the end (default 4000).' } },
      required: ['id'],
    },
  },
  {
    name: 'bg_stop',
    description: 'Stop a background process (and its children).',
    inputSchema: { type: 'object', properties: { id }, required: ['id'] },
  },
  {
    name: 'bg_restart',
    description: 'Stop and start a background process again with the same command.',
    inputSchema: { type: 'object', properties: { id }, required: ['id'] },
  },
];

async function callBackend(tool, args) {
  const sessionId = getSessionId();
  if (!sessionId) throw new Error('This session has no WebUI identity, so there are no processes to manage.');
  const response = await fetch(`${BACKEND}/api/processes/internal/call`, {
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
        serverInfo: { name: 'mcp-processes', version: '0.1.0' },
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
