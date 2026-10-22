#!/usr/bin/env node
// Lists source files no import chain from main.tsx reaches.
//   node scripts/find-orphans.mjs
import fs from 'node:fs';
import path from 'node:path';

const src = path.resolve('src');
const exts = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

function resolveImport(from, spec) {
  let base;
  if (spec.startsWith('@/')) base = path.join(src, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null;
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of exts) if (fs.existsSync(base + ext)) return base + ext;
  return null;
}

const seen = new Set();
const queue = [path.join(src, 'main.tsx')];
while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  if (!/\.(tsx?|jsx?)$/.test(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)) {
    const target = resolveImport(file, match[1]);
    if (target && !seen.has(target)) queue.push(target);
  }
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}
const orphans = walk(src).filter((file) => !seen.has(file));
for (const file of orphans) console.log(path.relative(src, file));
console.log(`\n${orphans.length} unreachable of ${walk(src).length} files`);
