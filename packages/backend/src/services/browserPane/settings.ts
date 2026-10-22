import fs from 'fs';
import os from 'os';
import path from 'path';

export interface BrowserPaneSettings {
  /** Downloads the page starts are saved here; null means ~/Downloads. */
  downloadsDir: string | null;
  /** When false every download the page starts is cancelled. */
  allowDownloads: boolean;
}

const DEFAULTS: BrowserPaneSettings = { downloadsDir: null, allowDownloads: true };

function file(): string {
  return path.join(os.homedir(), '.config', 'cooder-browser.json');
}

export function readBrowserSettings(): BrowserPaneSettings {
  try {
    const parsed = JSON.parse(fs.readFileSync(file(), 'utf-8')) as Partial<BrowserPaneSettings>;
    return {
      downloadsDir: typeof parsed.downloadsDir === 'string' ? parsed.downloadsDir : null,
      allowDownloads: parsed.allowDownloads !== false,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeBrowserSettings(next: BrowserPaneSettings): void {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(next, null, 2));
}

/** The folder downloads go to right now (created when missing). */
export function resolveDownloadsDir(settings = readBrowserSettings()): string {
  const dir =
    settings.downloadsDir ?? path.join(process.env.COODER_REAL_HOME || os.homedir(), 'Downloads');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
