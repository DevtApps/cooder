import { execFile, execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type BrowserName = 'chrome' | 'firefox';

export interface BrowserBinary {
  path: string;
  /** Installed by Cooder, found on the system, or set by an environment variable. */
  source: 'cooder' | 'system' | 'env';
  version: string | null;
}

export interface BrowserStatus {
  /** The panel always runs Chrome; Firefox can be installed but is not used. */
  use: 'chrome';
  chrome: BrowserBinary | null;
  firefox: BrowserBinary | null;
  browsersDir: string;
}

/** Where Cooder keeps the browsers it installs (inside Cooder's own HOME locally). */
export function browsersDir(): string {
  return process.env.COODER_BROWSERS_DIR || path.join(os.homedir(), '.cache', 'cooder-browsers');
}

function onPath(names: string[]): string | null {
  for (const name of names) {
    try {
      const found = execFileSync('which', [name], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 3000,
      }).trim();
      if (found) return found;
    } catch {
      // Not on PATH.
    }
  }
  return null;
}

/** Newest browser installed by `@puppeteer/browsers` into browsersDir(). */
function plumInstalled(browser: BrowserName): string | null {
  const root = path.join(browsersDir(), browser);
  let versions: string[];
  try {
    versions = fs.readdirSync(root).sort().reverse();
  } catch {
    return null;
  }
  const relative = browser === 'chrome' ? ['chrome-linux64', 'chrome'] : ['firefox', 'firefox'];
  for (const version of versions) {
    const candidate = path.join(root, version, ...relative);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const versionCache = new Map<string, string | null>();

function versionOf(binary: string): string | null {
  if (versionCache.has(binary)) return versionCache.get(binary)!;
  let version: string | null = null;
  try {
    version =
      execFileSync(binary, ['--version'], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
      })
        .trim()
        .split('\n')[0] || null;
  } catch {
    version = null;
  }
  versionCache.set(binary, version);
  return version;
}

function describe(binary: string, source: BrowserBinary['source']): BrowserBinary {
  return { path: binary, source, version: versionOf(binary) };
}

/**
 * Chrome for the browser panel: an explicit override, then the copy Cooder
 * installed, then one on the system. A local install never falls back to a
 * browser it did not install unless nothing else exists, so the panel keeps
 * working on a machine that already has Chrome.
 */
export function findChrome(): BrowserBinary | null {
  const env = process.env.COODER_CHROME_BIN?.trim();
  if (env && fs.existsSync(env)) return describe(env, 'env');
  const own = plumInstalled('chrome');
  if (own) return describe(own, 'cooder');
  const system =
    onPath(['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser']) ??
    [process.env.CHROME_BIN, '/usr/local/bin/cooder-chromium'].find(
      (candidate): candidate is string => !!candidate && fs.existsSync(candidate)
    ) ??
    null;
  return system ? describe(system, 'system') : null;
}

export function findFirefox(): BrowserBinary | null {
  const own = plumInstalled('firefox');
  if (own) return describe(own, 'cooder');
  const system = onPath(['firefox']);
  return system ? describe(system, 'system') : null;
}

export function getBrowserStatus(): BrowserStatus {
  return {
    use: 'chrome',
    chrome: findChrome(),
    firefox: findFirefox(),
    browsersDir: browsersDir(),
  };
}

let installing: Promise<string> | null = null;

/**
 * Downloads the stable channel of a browser into browsersDir() with
 * `@puppeteer/browsers`. One install at a time; returns the tool's output.
 */
export function installBrowser(browser: BrowserName): Promise<string> {
  if (installing) return installing;
  const dir = browsersDir();
  fs.mkdirSync(dir, { recursive: true });
  installing = (async () => {
    try {
      const { stdout, stderr } = await execFileAsync(
        process.env.COODER_PNPM_BIN || 'pnpm',
        ['dlx', '@puppeteer/browsers@latest', 'install', `${browser}@stable`, '--path', dir],
        { timeout: 15 * 60_000, maxBuffer: 10 * 1024 * 1024, env: process.env }
      );
      versionCache.clear();
      return `${stdout}${stderr}`.trim();
    } finally {
      installing = null;
    }
  })();
  return installing;
}
