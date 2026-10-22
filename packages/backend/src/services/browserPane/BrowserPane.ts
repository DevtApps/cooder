import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  chromium,
  type BrowserContext,
  type CDPSession,
  type Download,
  type Page,
} from 'playwright-core';
import { findChrome } from './binaries.js';
import { CURSOR_SCRIPT } from './pageScripts.js';
import { readBrowserSettings, resolveDownloadsDir } from './settings.js';

export interface TabInfo {
  id: string;
  title: string;
  url: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface PaneState {
  tabs: TabInfo[];
  activeTabId: string | null;
}

export interface MouseInput {
  type: 'move' | 'down' | 'up' | 'wheel';
  x: number;
  y: number;
  button?: 'left' | 'middle' | 'right';
  clickCount?: number;
  deltaX?: number;
  deltaY?: number;
}

export interface KeyInput {
  type: 'down' | 'up';
  key: string;
}

/** Sends an event to everyone watching a session's browser. */
export type PaneSink = (sessionId: string, event: string, payload: unknown) => void;

interface Viewport {
  width: number;
  height: number;
}

const DEFAULT_VIEWPORT: Viewport = { width: 1024, height: 700 };
const IDLE_CLOSE_MS = 10 * 60_000;
const FRAME_QUALITY = 70;

interface ScreencastFrame {
  data: string;
  sessionId: number;
  metadata: { deviceWidth: number; deviceHeight: number };
}

export class Tab {
  readonly id = randomUUID().slice(0, 8);
  title = '';
  url = 'about:blank';
  loading = false;
  canGoBack = false;
  canGoForward = false;
  cdp: CDPSession | null = null;
  streaming = false;
  onFrame: ((frame: ScreencastFrame) => void) | null = null;
  /** Recent console output and requests, for agents that debug the page. */
  readonly console: string[] = [];
  readonly network: Array<{ method: string; url: string; status: number | null; type: string }> =
    [];
  constructor(readonly page: Page) {}
}

class Pane {
  readonly tabs = new Map<string, Tab>();
  activeTabId: string | null = null;
  viewport: Viewport = DEFAULT_VIEWPORT;
  viewers = 0;
  idleTimer: NodeJS.Timeout | null = null;
}

/** Turn what was typed in the address bar into a URL. */
export function normalizeUrl(input: string): string {
  const value = input.trim();
  if (!value) return 'about:blank';
  if (/^(about|chrome|file|data|blob):/i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:]+\])(:\d+)?(\/|$)/i.test(value)) {
    return `http://${value}`;
  }
  if (!/\s/.test(value) && /^[^/]+\.[a-z]{2,}(:\d+)?(\/|$|\?|#)/i.test(value)) {
    return `https://${value}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

/** One real Chrome shared by every session; each session owns a set of tabs. */
export class BrowserPaneManager {
  private context: BrowserContext | null = null;
  private launching: Promise<BrowserContext> | null = null;
  private readonly panes = new Map<string, Pane>();

  constructor(private readonly sink: PaneSink) {}

  private async ensureContext(): Promise<BrowserContext> {
    if (this.context) return this.context;
    if (this.launching) return this.launching;
    const chrome = findChrome();
    if (!chrome) {
      throw new Error('Chrome is not installed. Install it in Settings → Browser.');
    }
    const profile = path.join(os.homedir(), '.cache', 'cooder-browser-profile');
    fs.mkdirSync(profile, { recursive: true });
    // The container image runs without user namespaces, which Chrome's sandbox needs.
    const args = ['--no-first-run', '--no-default-browser-check', '--disable-features=Translate'];
    if (!process.env.COODER_CLI_BIN_DIR) args.push('--no-sandbox');
    this.launching = chromium
      .launchPersistentContext(profile, {
        executablePath: chrome.path,
        headless: true,
        viewport: DEFAULT_VIEWPORT,
        acceptDownloads: true,
        args,
      })
      .then(async (context) => {
        await context.addInitScript({ content: CURSOR_SCRIPT });
        context.on('close', () => {
          this.context = null;
          this.panes.clear();
        });
        this.context = context;
        return context;
      })
      .finally(() => {
        this.launching = null;
      });
    return this.launching;
  }

  private pane(sessionId: string): Pane {
    let pane = this.panes.get(sessionId);
    if (!pane) {
      pane = new Pane();
      this.panes.set(sessionId, pane);
    }
    return pane;
  }

  private state(pane: Pane): PaneState {
    return {
      tabs: [...pane.tabs.values()].map((tab) => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        loading: tab.loading,
        canGoBack: tab.canGoBack,
        canGoForward: tab.canGoForward,
      })),
      activeTabId: pane.activeTabId,
    };
  }

  private publish(sessionId: string): void {
    const pane = this.panes.get(sessionId);
    if (pane) this.sink(sessionId, 'browser:state', this.state(pane));
  }

  private async refresh(sessionId: string, tab: Tab): Promise<void> {
    try {
      tab.url = tab.page.url();
      tab.title = await tab.page.title().catch(() => '');
      if (tab.cdp) {
        const history = await tab.cdp.send('Page.getNavigationHistory');
        tab.canGoBack = history.currentIndex > 0;
        tab.canGoForward = history.currentIndex < history.entries.length - 1;
      }
    } catch {
      // The page is gone or navigating; the next event refreshes again.
    }
    this.publish(sessionId);
  }

  private async frame(sessionId: string, tab: Tab): Promise<void> {
    try {
      const data = await tab.page.screenshot({ type: 'jpeg', quality: FRAME_QUALITY });
      const viewport = tab.page.viewportSize() ?? DEFAULT_VIEWPORT;
      this.sink(sessionId, 'browser:frame', {
        tabId: tab.id,
        data: data.toString('base64'),
        width: viewport.width,
        height: viewport.height,
      });
    } catch {
      // Closed while capturing.
    }
  }

  private async startStreaming(sessionId: string, tab: Tab): Promise<void> {
    if (tab.streaming || !tab.cdp) return;
    const cdp = tab.cdp;
    tab.streaming = true;
    const viewport = this.pane(sessionId).viewport;
    tab.onFrame = (frame) => {
      this.sink(sessionId, 'browser:frame', {
        tabId: tab.id,
        data: frame.data,
        width: frame.metadata.deviceWidth,
        height: frame.metadata.deviceHeight,
      });
      void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
    };
    cdp.on('Page.screencastFrame', tab.onFrame);
    await cdp
      .send('Page.startScreencast', {
        format: 'jpeg',
        quality: FRAME_QUALITY,
        maxWidth: viewport.width,
        maxHeight: viewport.height,
        everyNthFrame: 1,
      })
      .catch(() => {
        tab.streaming = false;
      });
  }

  private async stopStreaming(tab: Tab): Promise<void> {
    if (!tab.streaming || !tab.cdp) return;
    tab.streaming = false;
    if (tab.onFrame) tab.cdp.off('Page.screencastFrame', tab.onFrame);
    tab.onFrame = null;
    await tab.cdp.send('Page.stopScreencast').catch(() => {});
  }

  private async register(sessionId: string, page: Page): Promise<Tab> {
    const pane = this.pane(sessionId);
    const tab = new Tab(page);
    tab.cdp = await (await this.ensureContext()).newCDPSession(page);
    pane.tabs.set(tab.id, tab);

    page.on('console', (message) => {
      tab.console.push(`[${message.type()}] ${message.text()}`);
      if (tab.console.length > 300) tab.console.shift();
    });
    page.on('pageerror', (error) => {
      tab.console.push(`[error] ${error.message}`);
      if (tab.console.length > 300) tab.console.shift();
    });
    page.on('response', (response) => {
      tab.network.push({
        method: response.request().method(),
        url: response.url(),
        status: response.status(),
        type: response.request().resourceType(),
      });
      if (tab.network.length > 300) tab.network.shift();
    });
    page.on('framenavigated', (frame) => {
      if (frame !== page.mainFrame()) return;
      tab.loading = true;
      void this.refresh(sessionId, tab);
    });
    page.on('domcontentloaded', () => void this.refresh(sessionId, tab));
    page.on('load', () => {
      tab.loading = false;
      void this.refresh(sessionId, tab);
    });
    page.on('popup', (popup) => {
      void this.register(sessionId, popup).then((next) => this.select(sessionId, next.id));
    });
    page.on('download', (download) => void this.handleDownload(sessionId, download));
    page.on('close', () => this.dropTab(sessionId, tab.id));
    return tab;
  }

  private dropTab(sessionId: string, tabId: string): void {
    const pane = this.panes.get(sessionId);
    if (!pane || !pane.tabs.delete(tabId)) return;
    if (pane.activeTabId === tabId) {
      const next = [...pane.tabs.keys()].at(-1) ?? null;
      pane.activeTabId = null;
      if (next) void this.select(sessionId, next);
    }
    this.publish(sessionId);
  }

  private async handleDownload(sessionId: string, download: Download): Promise<void> {
    const settings = readBrowserSettings();
    const filename = download.suggestedFilename();
    if (!settings.allowDownloads) {
      await download.cancel().catch(() => {});
      this.sink(sessionId, 'browser:download', { filename, status: 'blocked' });
      return;
    }
    try {
      const dir = resolveDownloadsDir(settings);
      let target = path.join(dir, filename);
      for (let n = 1; fs.existsSync(target); n += 1) {
        const { name, ext } = path.parse(filename);
        target = path.join(dir, `${name} (${n})${ext}`);
      }
      await download.saveAs(target);
      this.sink(sessionId, 'browser:download', { filename, path: target, status: 'saved' });
    } catch (error) {
      this.sink(sessionId, 'browser:download', {
        filename,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Download failed',
      });
    }
  }

  private active(sessionId: string): Tab | null {
    const pane = this.panes.get(sessionId);
    return (pane?.activeTabId && pane.tabs.get(pane.activeTabId)) || null;
  }

  /** The session's active tab, creating the pane and a tab when none exists. */
  private firstTabs = new Map<string, Promise<void>>();

  /** Opens a pane's first tab once, even when the viewer and an agent ask together. */
  private openFirstTab(sessionId: string, viewport: Viewport): Promise<void> {
    let pending = this.firstTabs.get(sessionId);
    if (!pending) {
      pending = (async () => {
        const context = await this.ensureContext();
        const pane = this.pane(sessionId);
        if (pane.tabs.size > 0) return;
        const page = await context.newPage();
        await page.setViewportSize(viewport);
        const tab = await this.register(sessionId, page);
        pane.activeTabId = tab.id;
      })().finally(() => this.firstTabs.delete(sessionId));
      this.firstTabs.set(sessionId, pending);
    }
    return pending;
  }

  async ensureTab(sessionId: string): Promise<Tab> {
    const pane = this.pane(sessionId);
    if (pane.tabs.size === 0) {
      await this.openFirstTab(sessionId, pane.viewport);
      const tab = this.active(sessionId);
      if (tab) await this.startStreaming(sessionId, tab);
      this.publish(sessionId);
    }
    return this.active(sessionId)!;
  }

  tabList(sessionId: string): PaneState {
    const pane = this.panes.get(sessionId);
    return pane ? this.state(pane) : { tabs: [], activeTabId: null };
  }

  /** Tab by id (or the active one), for tools that act on a specific tab. */
  tabById(sessionId: string, tabId?: string): Tab | null {
    const pane = this.panes.get(sessionId);
    if (!pane) return null;
    return (tabId ? pane.tabs.get(tabId) : this.active(sessionId)) ?? null;
  }

  /** Repaint viewers after an agent action that changed the page. */
  async refreshView(sessionId: string): Promise<void> {
    const tab = this.active(sessionId);
    if (tab) await this.refresh(sessionId, tab);
  }

  /** A viewer opened the panel: make sure a tab exists and show it. */
  async attach(sessionId: string, viewport: Viewport): Promise<PaneState> {
    const pane = this.pane(sessionId);
    if (pane.idleTimer) clearTimeout(pane.idleTimer);
    pane.idleTimer = null;
    pane.viewers += 1;
    pane.viewport = viewport;
    if (pane.tabs.size === 0) {
      await this.openFirstTab(sessionId, viewport);
    } else {
      await this.ensureContext();
      await this.resize(sessionId, viewport);
    }
    const tab = this.active(sessionId);
    if (tab) {
      await this.startStreaming(sessionId, tab);
      void this.frame(sessionId, tab);
    }
    return this.state(pane);
  }

  detach(sessionId: string): void {
    const pane = this.panes.get(sessionId);
    if (!pane) return;
    pane.viewers = Math.max(0, pane.viewers - 1);
    if (pane.viewers > 0) return;
    const tab = this.active(sessionId);
    if (tab) void this.stopStreaming(tab);
    // Tabs stay for a while so reopening the panel finds the page as it was.
    pane.idleTimer = setTimeout(() => void this.closeSession(sessionId), IDLE_CLOSE_MS);
  }

  async closeSession(sessionId: string): Promise<void> {
    const pane = this.panes.get(sessionId);
    if (!pane) return;
    this.panes.delete(sessionId);
    if (pane.idleTimer) clearTimeout(pane.idleTimer);
    await Promise.all([...pane.tabs.values()].map((tab) => tab.page.close().catch(() => {})));
  }

  async closeAll(): Promise<void> {
    await this.context?.close().catch(() => {});
  }

  async openTab(sessionId: string, url?: string): Promise<void> {
    const pane = this.pane(sessionId);
    const context = await this.ensureContext();
    const page = await context.newPage();
    await page.setViewportSize(pane.viewport);
    const tab = await this.register(sessionId, page);
    await this.select(sessionId, tab.id);
    if (url) await this.navigate(sessionId, tab.id, url);
  }

  async closeTab(sessionId: string, tabId: string): Promise<void> {
    await this.panes
      .get(sessionId)
      ?.tabs.get(tabId)
      ?.page.close()
      .catch(() => {});
  }

  async select(sessionId: string, tabId: string): Promise<void> {
    const pane = this.panes.get(sessionId);
    const tab = pane?.tabs.get(tabId);
    if (!pane || !tab) return;
    const previous = this.active(sessionId);
    if (previous && previous.id !== tab.id) await this.stopStreaming(previous);
    pane.activeTabId = tab.id;
    await tab.page.bringToFront().catch(() => {});
    await tab.page.setViewportSize(pane.viewport).catch(() => {});
    await this.startStreaming(sessionId, tab);
    this.publish(sessionId);
    void this.frame(sessionId, tab);
  }

  async navigate(sessionId: string, tabId: string, input: string): Promise<void> {
    const tab = this.panes.get(sessionId)?.tabs.get(tabId);
    if (!tab) return;
    try {
      await tab.page.goto(normalizeUrl(input), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    } catch (error) {
      // Navigation errors (refused connection, bad certificate) show as Chrome's own error page.
      this.sink(sessionId, 'browser:error', {
        message: error instanceof Error ? error.message.split('\n')[0] : 'Navigation failed',
      });
    }
  }

  async nav(sessionId: string, action: 'back' | 'forward' | 'reload' | 'stop'): Promise<void> {
    const tab = this.active(sessionId);
    if (!tab) return;
    try {
      if (action === 'back') await tab.page.goBack({ waitUntil: 'domcontentloaded' });
      else if (action === 'forward') await tab.page.goForward({ waitUntil: 'domcontentloaded' });
      else if (action === 'reload') await tab.page.reload({ waitUntil: 'domcontentloaded' });
      else await tab.cdp?.send('Page.stopLoading');
    } catch {
      // Nothing to go back to, or the page changed mid-way.
    }
  }

  async resize(sessionId: string, viewport: Viewport): Promise<void> {
    const pane = this.panes.get(sessionId);
    if (!pane) return;
    pane.viewport = viewport;
    await Promise.all(
      [...pane.tabs.values()].map((tab) => tab.page.setViewportSize(viewport).catch(() => {}))
    );
    const tab = this.active(sessionId);
    if (tab) {
      await this.stopStreaming(tab);
      await this.startStreaming(sessionId, tab);
      void this.frame(sessionId, tab);
    }
  }

  async mouse(sessionId: string, input: MouseInput): Promise<void> {
    const tab = this.active(sessionId);
    if (!tab) return;
    const { page } = tab;
    try {
      if (input.type === 'move') await page.mouse.move(input.x, input.y);
      else if (input.type === 'down') {
        await page.mouse.move(input.x, input.y);
        await page.mouse.down({
          button: input.button ?? 'left',
          clickCount: input.clickCount ?? 1,
        });
      } else if (input.type === 'up') {
        await page.mouse.up({ button: input.button ?? 'left', clickCount: input.clickCount ?? 1 });
      } else {
        await page.mouse.move(input.x, input.y);
        await page.mouse.wheel(input.deltaX ?? 0, input.deltaY ?? 0);
      }
    } catch {
      // The page navigated away during the gesture.
    }
  }

  async key(sessionId: string, input: KeyInput): Promise<void> {
    const tab = this.active(sessionId);
    if (!tab) return;
    const key = input.key === ' ' ? 'Space' : input.key;
    try {
      if (input.type === 'down') await tab.page.keyboard.down(key);
      else await tab.page.keyboard.up(key);
    } catch {
      // Unknown key names are ignored.
    }
  }

  async paste(sessionId: string, text: string): Promise<void> {
    await this.active(sessionId)
      ?.page.keyboard.insertText(text)
      .catch(() => {});
  }

  async screenshot(
    sessionId: string
  ): Promise<{ data: string; url: string; title: string } | null> {
    const tab = this.active(sessionId);
    if (!tab) return null;
    const data = await tab.page.screenshot({ type: 'png' });
    return { data: data.toString('base64'), url: tab.url, title: tab.title };
  }
}
