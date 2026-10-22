#!/usr/bin/env node
// Reference screenshots of the main screens, for comparing the interface
// before and after each refactoring phase.
//
//   PLUM_USER=dev PLUM_PASSWORD=... node scripts/ui-screenshots.mjs [label]
//
// PLUM_URL defaults to http://localhost:5173 (pnpm run dev); use
// http://localhost:8010 for the Docker dev server. CHROME_PATH overrides the
// browser. Output: .artifacts/ui-screenshots/<label>/<screen>-<theme>-<viewport>.png, where
// label defaults to the current date and time. Credentials are read from the
// environment only and never written anywhere.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = (process.env.PLUM_URL || 'http://localhost:5173').replace(/\/$/, '');
const username = process.env.PLUM_USER;
const password = process.env.PLUM_PASSWORD;
const label = process.argv[2] || new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const outDir = path.join(repoRoot, '.artifacts', 'ui-screenshots', label);

const SCREENS = [
  { name: 'login', path: '/login', auth: false },
  { name: 'dashboard', path: '/' },
  { name: 'monitor', path: '/monitor' },
  { name: 'analytics', path: '/analytics' },
  { name: 'operations', path: '/operations' },
  { name: 'settings', path: '/settings' },
  { name: 'settings-extensions', path: '/settings?tab=extensions' },
  // The most recently updated session, resolved after login.
  { name: 'session', path: null },
];
const THEMES = ['dark', 'light'];
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

if (!username || !password) {
  console.error('Set PLUM_USER and PLUM_PASSWORD (a development account).');
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true,
});

async function signIn(page) {
  await page.goto(`${baseUrl}/login`);
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

async function latestSessionPath(page) {
  return page.evaluate(async () => {
    const raw = localStorage.getItem('claude-webui-auth');
    const token = raw ? JSON.parse(raw).state?.token : null;
    const response = await fetch('/api/sessions', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const body = await response.json();
    const sessions = Array.isArray(body.data) ? body.data : (body.data?.sessions ?? []);
    const latest = [...sessions].sort(
      (a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
    )[0];
    return latest ? `/session/${latest.id}` : null;
  });
}

mkdirSync(outDir, { recursive: true });
let failures = 0;

try {
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    for (const theme of THEMES) {
      const context = await browser.newContext({ viewport, colorScheme: theme });
      await context.addInitScript((value) => localStorage.setItem('theme', value), theme);
      const page = await context.newPage();

      for (const screen of SCREENS.filter((item) => item.auth === false)) {
        await page.goto(`${baseUrl}${screen.path}`, { waitUntil: 'networkidle' });
        await page.screenshot({
          path: path.join(outDir, `${screen.name}-${theme}-${viewportName}.png`),
        });
      }

      try {
        await signIn(page);
      } catch {
        console.error(
          `[screenshots] sign-in failed at ${baseUrl}/login; check PLUM_USER, PLUM_PASSWORD and PLUM_URL.`
        );
        process.exitCode = 1;
        await context.close();
        break;
      }
      const sessionPath = await latestSessionPath(page);

      for (const screen of SCREENS.filter((item) => item.auth !== false)) {
        const target = screen.path ?? sessionPath;
        if (!target) {
          console.warn(`[screenshots] no session to open; skipping ${screen.name}`);
          continue;
        }
        const file = path.join(outDir, `${screen.name}-${theme}-${viewportName}.png`);
        try {
          await page.goto(`${baseUrl}${target}`, { waitUntil: 'networkidle', timeout: 20_000 });
          // Let lazy chunks, charts and the chat list settle.
          await page.waitForTimeout(800);
          await page.screenshot({ path: file, fullPage: viewportName === 'desktop' });
        } catch (error) {
          failures += 1;
          console.error(
            `[screenshots] ${screen.name} (${theme}, ${viewportName}): ${error.message}`
          );
        }
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}

console.log(`[screenshots] saved to ${path.relative(repoRoot, outDir)}`);
if (failures > 0) process.exitCode = 1;
