#!/usr/bin/env node
// MCP stdio server: the agents' hands on the browser panel.
//
// It drives the same Chrome the user watches in the session's Browser panel
// (see packages/backend/src/services/browserPane). All the work happens in the
// backend; this process maps MCP tool calls to POST /api/browser/internal/call
// with the hook secret and the session id, like the other bridges.
//
// Speaks JSON-RPC 2.0 over stdin/stdout, no external deps.
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';

const BACKEND = process.env.WEBUI_BACKEND_URL || 'http://localhost:3001';
const HOOK_SECRET = process.env.WEBUI_HOOK_SECRET || '';
const SESSION_ID = process.env.WEBUI_SESSION_ID || '';
const SESSION_CONTEXT_FILE = process.env.WEBUI_SESSION_CONTEXT_FILE || '';

const log = (...args) => console.error('[mcp-browser]', ...args);
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

const tabId = { type: 'string', description: 'Tab id from tabs_context. Defaults to the active tab.' };
const ref = { type: 'string', description: 'Element reference (ref_N) from read_page or find.' };
const coordinate = {
  type: 'array',
  items: { type: 'number' },
  description: '[x, y] in page pixels, as in the latest screenshot.',
};

const TOOLS = [
  {
    name: 'tabs_context',
    description: 'List the open tabs of this session\'s browser (the active one is marked with *).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'tabs_create',
    description: 'Open a new tab, optionally at a URL.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' } } },
  },
  {
    name: 'tabs_select',
    description: 'Make a tab the active one.',
    inputSchema: { type: 'object', properties: { tabId }, required: ['tabId'] },
  },
  {
    name: 'tabs_close',
    description: 'Close a tab.',
    inputSchema: { type: 'object', properties: { tabId }, required: ['tabId'] },
  },
  {
    name: 'navigate',
    description:
      'Go to a URL in the active tab. localhost addresses work. Use "back" or "forward" for history. A phrase that is not a URL is searched on Google.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' }, tabId }, required: ['url'] },
  },
  {
    name: 'read_page',
    description:
      'Read the page as an outline (interactive elements with refs, headings, landmarks, text). Prefer this over screenshots to find what to click. filter "interactive" returns only elements you can act on.',
    inputSchema: {
      type: 'object',
      properties: { filter: { type: 'string', enum: ['all', 'interactive'] }, max_chars: { type: 'number' }, tabId },
    },
  },
  {
    name: 'find',
    description: 'Find elements by what they say or do (e.g. "login button"). Returns up to 20 with refs.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, tabId }, required: ['query'] },
  },
  {
    name: 'get_page_text',
    description: 'The visible text of the page (the article or main content first).',
    inputSchema: { type: 'object', properties: { max_chars: { type: 'number' }, tabId } },
  },
  {
    name: 'computer',
    description:
      'Act on the page like a person: screenshot, left_click/right_click/double_click/triple_click (ref or coordinate), type (text), key (text like "ctrl+a Enter", repeat), scroll (coordinate, scroll_direction, scroll_amount), scroll_to (ref), hover, left_click_drag (start_coordinate, coordinate), zoom (region [x0,y0,x1,y1]), wait (duration seconds). The user sees every action in the Browser panel.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['screenshot', 'left_click', 'right_click', 'double_click', 'triple_click', 'type', 'key', 'scroll', 'scroll_to', 'hover', 'left_click_drag', 'zoom', 'wait'],
        },
        ref,
        coordinate,
        start_coordinate: coordinate,
        text: { type: 'string' },
        repeat: { type: 'number' },
        scroll_direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
        scroll_amount: { type: 'number' },
        region: { type: 'array', items: { type: 'number' } },
        duration: { type: 'number' },
        tabId,
      },
      required: ['action'],
    },
  },
  {
    name: 'form_input',
    description: 'Set a form field by ref: text for inputs, an option for selects, true/false for checkboxes.',
    inputSchema: {
      type: 'object',
      properties: { ref, value: { description: 'string, number or boolean' }, tabId },
      required: ['ref', 'value'],
    },
  },
  {
    name: 'javascript_tool',
    description: 'Run JavaScript in the page; top-level await works and the last expression is returned. For inspection and debugging.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' }, tabId }, required: ['text'] },
  },
  {
    name: 'read_console_messages',
    description: 'Console output and page errors of the tab.',
    inputSchema: {
      type: 'object',
      properties: { pattern: { type: 'string' }, onlyErrors: { type: 'boolean' }, limit: { type: 'number' }, tabId },
    },
  },
  {
    name: 'read_network_requests',
    description: 'Requests the tab made (status, method, type, URL).',
    inputSchema: {
      type: 'object',
      properties: { urlPattern: { type: 'string' }, limit: { type: 'number' }, tabId },
    },
  },
  {
    name: 'resize_window',
    description: 'Resize the browser viewport, or use a preset: mobile (375x812), tablet (768x1024), desktop (1280x800).',
    inputSchema: {
      type: 'object',
      properties: { preset: { type: 'string', enum: ['mobile', 'tablet', 'desktop'] }, width: { type: 'number' }, height: { type: 'number' } },
    },
  },
];

async function callBackend(tool, args) {
  const sessionId = getSessionId();
  if (!sessionId) throw new Error('This session has no WebUI identity, so there is no browser to drive.');
  const response = await fetch(`${BACKEND}/api/browser/internal/call`, {
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
        serverInfo: { name: 'mcp-browser', version: '0.1.0' },
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
