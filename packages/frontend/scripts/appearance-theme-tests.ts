import assert from 'node:assert/strict';
import type { Theme } from '@plum-code-webui/shared';
import {
  applyTheme,
  getStoredTheme,
  normalizeTheme,
  setStoredTheme,
} from '../src/stores/appearanceStore.ts';

function createClassList() {
  const classes = new Set<string>();
  return {
    add: (...values: string[]) => {
      values.forEach((value) => classes.add(value));
    },
    remove: (...values: string[]) => {
      values.forEach((value) => classes.delete(value));
    },
    contains: (value: string) => classes.has(value),
    values: () => Array.from(classes).sort(),
  };
}

function installLocalStorage() {
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
  } as Storage;
  globalThis.window = { localStorage } as unknown as Window & typeof globalThis;
}

function testRetiredEinkThemeFallsBackToLight(): void {
  const classList = createClassList();
  // Run the transition-guard release at once so only theme classes remain.
  globalThis.window = {
    setTimeout: (callback: () => void) => {
      callback();
      return 0;
    },
  } as unknown as Window & typeof globalThis;
  globalThis.document = {
    documentElement: {
      classList,
      dataset: {},
    },
    querySelector: () => null,
  } as unknown as Document;

  assert.equal(normalizeTheme('eink'), 'light');

  // A leftover e-ink class from an older session is cleared.
  classList.add('eink');
  applyTheme('eink' as Theme);
  assert.deepEqual(classList.values(), ['light']);

  applyTheme('dark');
  assert.deepEqual(classList.values(), ['dark']);
}

function testThemePersistsInDeviceStorage(): void {
  installLocalStorage();

  setStoredTheme('light');
  assert.equal(getStoredTheme(), 'light');

  window.localStorage.setItem('theme', 'eink');
  assert.equal(getStoredTheme(), 'light');

  setStoredTheme('not-a-theme');
  assert.equal(getStoredTheme(), 'dark');
}

testRetiredEinkThemeFallsBackToLight();
testThemePersistsInDeviceStorage();
console.log('appearance theme tests passed');
