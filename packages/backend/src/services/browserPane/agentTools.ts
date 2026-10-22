import type { Page } from 'playwright-core';
import type { BrowserPaneManager, Tab } from './BrowserPane.js';
import { EVAL_SCRIPT, OUTLINE_SCRIPT } from './pageScripts.js';

export interface ToolResult {
  text?: string;
  image?: { data: string; mimeType: string };
}

type Args = Record<string, unknown>;

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const point = (value: unknown): [number, number] | null =>
  Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === 'number')
    ? [value[0] as number, value[1] as number]
    : null;

const KEY_ALIASES: Record<string, string> = {
  cmd: 'Meta',
  meta: 'Meta',
  command: 'Meta',
  win: 'Meta',
  windows: 'Meta',
  ctrl: 'Control',
  control: 'Control',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
  enter: 'Enter',
  return: 'Enter',
  esc: 'Escape',
  escape: 'Escape',
  del: 'Delete',
  delete: 'Delete',
  backspace: 'Backspace',
  tab: 'Tab',
  space: 'Space',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
};

function combo(text: string): string {
  return text
    .split('+')
    .map((part) => KEY_ALIASES[part.toLowerCase()] ?? part)
    .join('+');
}

const PRESETS: Record<string, { width: number; height: number }> = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
};

async function shot(page: Page, clip?: { x: number; y: number; width: number; height: number }) {
  const data = await page.screenshot({ type: 'jpeg', quality: 80, clip });
  return { data: data.toString('base64'), mimeType: 'image/jpeg' };
}

function target(tab: Tab, ref: string) {
  if (!/^ref_\d+$/.test(ref))
    throw new Error(`Unknown element reference "${ref}". Read the page first.`);
  return tab.page.locator(`[data-cooder-ref="${ref}"]`).first();
}

/**
 * Tools the agents call on the session's browser, the one shown in the panel.
 * Everything acts on the same Chrome the user is watching.
 */
export async function runBrowserTool(
  panes: BrowserPaneManager,
  sessionId: string,
  tool: string,
  args: Args
): Promise<ToolResult> {
  const tab = async (): Promise<Tab> => {
    const requested = str(args.tabId);
    const found = requested ? panes.tabById(sessionId, requested) : null;
    if (requested && !found) throw new Error(`No tab with id ${requested}`);
    return found ?? (await panes.ensureTab(sessionId));
  };

  switch (tool) {
    case 'tabs_context': {
      const { tabs, activeTabId } = panes.tabList(sessionId);
      if (tabs.length === 0) return { text: 'No tabs are open yet. Use tabs_create or navigate.' };
      return {
        text: tabs
          .map(
            (t) =>
              `${t.id === activeTabId ? '*' : ' '} ${t.id}  ${t.title || '(untitled)'}  ${t.url}`
          )
          .join('\n'),
      };
    }
    case 'tabs_create': {
      await panes.ensureTab(sessionId);
      await panes.openTab(sessionId, str(args.url) || undefined);
      return { text: JSON.stringify(panes.tabList(sessionId)) };
    }
    case 'tabs_select':
      await panes.select(sessionId, str(args.tabId));
      return { text: 'Tab selected.' };
    case 'tabs_close':
      await panes.closeTab(sessionId, str(args.tabId));
      return { text: 'Tab closed.' };
    case 'navigate': {
      const current = await tab();
      const url = str(args.url);
      if (url === 'back' || url === 'forward') await panes.nav(sessionId, url);
      else await panes.navigate(sessionId, current.id, url);
      await panes.refreshView(sessionId);
      return {
        text: `Now at ${current.page.url()} — ${await current.page.title().catch(() => '')}`,
      };
    }
    case 'read_page': {
      const current = await tab();
      const outline = await current.page.evaluate(
        `(${OUTLINE_SCRIPT})(${JSON.stringify({
          filter: str(args.filter) || 'all',
          maxChars: num(args.max_chars, 50_000),
        })})`
      );
      return { text: `${current.page.url()}\n${String(outline)}` };
    }
    case 'find': {
      const current = await tab();
      const matches = await current.page.evaluate(
        `(${OUTLINE_SCRIPT})(${JSON.stringify({
          filter: 'all',
          query: str(args.query),
          maxChars: 20_000,
        })})`
      );
      return { text: (matches as string) || `Nothing on the page matches "${str(args.query)}".` };
    }
    case 'get_page_text': {
      const current = await tab();
      const text = (await current.page.evaluate(
        `(document.querySelector('article, main') || document.body).innerText`
      )) as string;
      return { text: String(text).slice(0, num(args.max_chars, 50_000)) };
    }
    case 'form_input': {
      const current = await tab();
      const element = target(current, str(args.ref));
      const value = args.value;
      const kind = await element.evaluate(
        (el) => `${el.tagName.toLowerCase()}:${(el.getAttribute('type') || '').toLowerCase()}`
      );
      if (kind.startsWith('select')) await element.selectOption(String(value));
      else if (kind === 'input:checkbox' || kind === 'input:radio') {
        await element.setChecked(Boolean(value));
      } else await element.fill(String(value ?? ''));
      await panes.refreshView(sessionId);
      return { text: `Set ${str(args.ref)}.` };
    }
    case 'javascript_tool': {
      const current = await tab();
      const result = await current.page.evaluate(
        `(${EVAL_SCRIPT})(${JSON.stringify(str(args.text))})`
      );
      return { text: result === undefined ? 'undefined' : JSON.stringify(result, null, 2) };
    }
    case 'read_console_messages': {
      const current = await tab();
      const pattern = str(args.pattern).toLowerCase();
      const lines = current.console
        .filter((line) => !args.onlyErrors || line.startsWith('[error]'))
        .filter((line) => !pattern || line.toLowerCase().includes(pattern))
        .slice(-num(args.limit, 50));
      return { text: lines.join('\n') || 'No console messages.' };
    }
    case 'read_network_requests': {
      const current = await tab();
      const pattern = str(args.urlPattern).toLowerCase();
      const lines = current.network
        .filter((entry) => !pattern || entry.url.toLowerCase().includes(pattern))
        .slice(-num(args.limit, 50))
        .map((entry) => `${entry.status ?? '---'} ${entry.method} ${entry.type} ${entry.url}`);
      return { text: lines.join('\n') || 'No requests recorded.' };
    }
    case 'resize_window': {
      await panes.ensureTab(sessionId);
      const preset = PRESETS[str(args.preset)];
      const width = preset?.width ?? num(args.width, 1280);
      const height = preset?.height ?? num(args.height, 800);
      await panes.resize(sessionId, { width, height });
      return { text: `Viewport is ${width}×${height}.` };
    }
    case 'computer':
      return computer(panes, sessionId, await tab(), args);
    default:
      throw new Error(`Unknown browser tool "${tool}"`);
  }
}

async function computer(
  panes: BrowserPaneManager,
  sessionId: string,
  current: Tab,
  args: Args
): Promise<ToolResult> {
  const { page } = current;
  const action = str(args.action);
  const ref = str(args.ref);
  const at = point(args.coordinate);
  const done = async (text: string): Promise<ToolResult> => {
    await panes.refreshView(sessionId);
    return { text };
  };

  switch (action) {
    case 'screenshot':
      return { image: await shot(page), text: `${page.url()}` };
    case 'zoom': {
      const region = args.region;
      if (!Array.isArray(region) || region.length !== 4)
        throw new Error('zoom needs region [x0, y0, x1, y1]');
      const [x0, y0, x1, y1] = region.map(Number) as [number, number, number, number];
      return { image: await shot(page, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }) };
    }
    case 'left_click':
    case 'right_click':
    case 'double_click':
    case 'triple_click': {
      const button = action === 'right_click' ? 'right' : 'left';
      const clickCount = action === 'double_click' ? 2 : action === 'triple_click' ? 3 : 1;
      if (ref) await target(current, ref).click({ button, clickCount, timeout: 5000 });
      else if (at) await page.mouse.click(at[0], at[1], { button, clickCount });
      else throw new Error('A click needs a ref or a coordinate');
      await page.waitForTimeout(250);
      return done(`Clicked ${ref || at?.join(',')}.`);
    }
    case 'hover':
      if (ref) await target(current, ref).hover({ timeout: 5000 });
      else if (at) await page.mouse.move(at[0], at[1]);
      else throw new Error('hover needs a ref or a coordinate');
      return done('Hovering.');
    case 'type':
      await page.keyboard.type(str(args.text), { delay: 8 });
      return done(`Typed ${str(args.text).length} characters.`);
    case 'key': {
      const repeat = Math.max(1, Math.min(100, num(args.repeat, 1)));
      const keys = str(args.text).split(/\s+/).filter(Boolean);
      for (let n = 0; n < repeat; n += 1)
        for (const key of keys) await page.keyboard.press(combo(key));
      return done(`Pressed ${str(args.text)}.`);
    }
    case 'scroll': {
      const [x, y] = at ?? [200, 200];
      const ticks = Math.max(1, Math.min(10, num(args.scroll_amount, 3))) * 100;
      const direction = str(args.scroll_direction) || 'down';
      await page.mouse.move(x, y);
      await page.mouse.wheel(
        direction === 'left' ? -ticks : direction === 'right' ? ticks : 0,
        direction === 'up' ? -ticks : direction === 'down' ? ticks : 0
      );
      await page.waitForTimeout(200);
      return done(`Scrolled ${direction}.`);
    }
    case 'scroll_to':
      await target(current, ref).scrollIntoViewIfNeeded({ timeout: 5000 });
      return done('Scrolled into view.');
    case 'left_click_drag': {
      const from = point(args.start_coordinate);
      if (!from || !at) throw new Error('drag needs start_coordinate and coordinate');
      await page.mouse.move(from[0], from[1]);
      await page.mouse.down();
      await page.mouse.move(at[0], at[1], { steps: 12 });
      await page.mouse.up();
      return done('Dragged.');
    }
    case 'wait':
      await page.waitForTimeout(Math.min(10, Math.max(0, num(args.duration, 1))) * 1000);
      return { text: 'Waited.' };
    default:
      throw new Error(`Unknown computer action "${action}"`);
  }
}
