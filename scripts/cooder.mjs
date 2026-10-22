#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localEnv = { ...process.env };

const cooderHome = path.resolve(
  (localEnv.COODER_HOME || path.join(os.homedir(), '.local/share/cooder')).replace(
    /^~(?=$|\/)/,
    os.homedir()
  )
);
const root = path.resolve(localEnv.COODER_APP_DIR || path.join(cooderHome, 'app'));
const envFile = path.join(os.homedir(), '.cooder', 'config.toml');
localEnv.COODER_HOME = cooderHome;
localEnv.COODER_APP_DIR = root;
localEnv.NODE_ENV = 'production';

if (fs.existsSync(envFile)) {
  for (const rawLine of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*("(?:\\.|[^"\\])*"|[0-9]+)\s*(?:#.*)?$/.exec(line);
    if (!match) throw new Error(`Invalid Cooder config line: ${line}`);
    const value = match[2].startsWith('"') ? JSON.parse(match[2]) : match[2];
    localEnv[match[1]] = String(value);
  }
}
localEnv.COODER_HOME = cooderHome;
localEnv.COODER_APP_DIR = root;
localEnv.NODE_ENV = 'production';
localEnv.COODER_DB_DRIVER = 'sqlite';
localEnv.COODER_DATABASE_PATH = path.join(cooderHome, 'data', 'cooder.db');
localEnv.WEBUI_DATA_DIR = path.join(cooderHome, 'data');
localEnv.COODER_CLI_BIN_DIR = path.join(cooderHome, 'cli', 'bin');
localEnv.CODEX_HOME = path.join(cooderHome, 'home', '.codex');
localEnv.COODER_PNPM_BIN = path.join(cooderHome, 'runtime', 'bin', 'pnpm');
localEnv.HOST = localEnv.HOST || '0.0.0.0';
const publicUrl = localEnv.BACKEND_URL || `http://127.0.0.1:${localEnv.PORT || 3001}`;
if (!/^https?:\/\/[^/]+\/?$/.test(publicUrl)) {
  throw new Error('BACKEND_URL must be an HTTP(S) origin, for example http://192.168.1.10:3001');
}
localEnv.FRONTEND_URL = publicUrl.replace(/\/$/, '');
localEnv.ALLOWED_BASE_PATHS = localEnv.ALLOWED_BASE_PATHS || os.homedir();

const bundledNode =
  localEnv.COODER_NODE_BIN || path.join(cooderHome, 'runtime', 'node', 'bin', 'node');
if (fs.existsSync(bundledNode) && process.execPath !== bundledNode) {
  const child = spawnSync(bundledNode, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    cwd: root,
    env: localEnv,
    stdio: 'inherit',
  });
  process.exit(child.status ?? 1);
}

const stateDir = path.join(cooderHome, 'run');
const pidFile = path.join(stateDir, 'cooder.pid');
const logFile = path.join(stateDir, 'cooder.log');
const command = process.argv[2] || 'help';
const privateBin = path.join(cooderHome, 'runtime', 'tools', 'bin');
const runtimeBin = path.join(cooderHome, 'runtime', 'bin');
localEnv.PNPM_HOME = localEnv.COODER_CLI_BIN_DIR || path.join(cooderHome, 'cli', 'bin');
localEnv.PATH = `${runtimeBin}:${path.dirname(bundledNode)}:${privateBin}:${localEnv.PNPM_HOME}:${localEnv.PATH || ''}`;

function run(commandName, args) {
  const result = spawnSync(commandName, args, { cwd: root, env: localEnv, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

const port = Number(localEnv.PORT || 3001);
const url = `http://127.0.0.1:${port}`;

async function isRunning() {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(700),
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return false;
    return (await response.text()).includes('<div id="root"></div>');
  } catch {
    return false;
  }
}

async function portIsOccupied() {
  return await new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', (error) => resolve(error.code === 'EADDRINUSE'));
    probe.listen(port, localEnv.HOST, () => probe.close(() => resolve(false)));
  });
}

function isProcessGroupAlive(pid) {
  try {
    process.kill(process.platform === 'win32' ? pid : -pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

async function start() {
  if (!fs.existsSync(envFile)) {
    console.error('Cooder is not installed yet. Run: cooder install');
    process.exit(1);
  }
  if (await isRunning()) {
    console.log(`Cooder is already running at ${url}`);
    return;
  }
  if (await portIsOccupied()) {
    console.error(`Port ${port} is already occupied by another process. Stop it or change PORT in ${envFile}.`);
    process.exit(1);
  }
  const serverEntry = path.join(root, 'packages/backend/dist/index.js');
  if (!fs.existsSync(serverEntry)) {
    console.error(
      `Compiled Cooder backend missing: ${serverEntry}. Install a compiled release first.`
    );
    process.exit(1);
  }
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(stateDir, 0o700);
  } catch {}
  const log = fs.openSync(logFile, 'a', 0o600);
  const server = spawn(bundledNode, [serverEntry], {
    cwd: root,
    env: localEnv,
    detached: process.platform !== 'win32',
    stdio: ['ignore', log, log],
  });
  server.unref();
  fs.closeSync(log);
  fs.writeFileSync(pidFile, String(server.pid), { mode: 0o600 });
  for (let attempt = 0; attempt < 20; attempt++) {
    if (await isRunning()) {
      console.log(`Cooder is running at ${url}`);
      console.log(`Logs: ${logFile}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.error(`Cooder did not become ready. Check: ${logFile}`);
  process.exit(1);
}

switch (command) {
  case 'install':
    if (!fs.existsSync(path.join(scriptRoot, 'scripts/local/install.sh'))) {
      console.error('Install from a compiled Cooder checkout with: pnpm cooder:install');
      process.exit(1);
    }
    run('bash', [path.join(scriptRoot, 'scripts/local/install.sh'), ...process.argv.slice(3)]);
    break;
  case 'start':
    await start();
    break;
  case 'web': {
    await start();
    if (process.argv.includes('--no-open')) {
      console.log(`Open Cooder at ${url}`);
      break;
    }
    const opener =
      process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    const browser = spawn(opener, args, { detached: true, stdio: 'ignore' });
    browser.on('error', () => console.log(`Open this address in your browser: ${url}`));
    browser.unref();
    console.log(`Opening ${url}`);
    break;
  }
  case 'stop': {
    if (!fs.existsSync(pidFile)) {
      console.log('Cooder is not running.');
      break;
    }
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    if (!Number.isSafeInteger(pid) || pid < 1) {
      throw new Error(`Invalid Cooder PID in ${pidFile}`);
    }
    try {
      process.kill(process.platform === 'win32' ? pid : -pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    const deadline = Date.now() + 10_000;
    while (isProcessGroupAlive(pid) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (isProcessGroupAlive(pid)) {
      throw new Error(`Cooder did not stop within 10 seconds. Check ${logFile}`);
    }
    if (Number(fs.readFileSync(pidFile, 'utf8')) === pid) {
      fs.rmSync(pidFile, { force: true });
    }
    console.log('Cooder stopped.');
    break;
  }
  case 'status':
    console.log((await isRunning()) ? `Running at ${url}` : 'Stopped');
    break;
  case 'logs':
    if (!fs.existsSync(logFile)) {
      console.log('No local log yet. Start Cooder with: cooder start');
      break;
    }
    run('tail', ['-n', '100', '-f', logFile]);
    break;
  case 'help':
  case '--help':
  case '-h':
    console.log(`Cooder — local web product

Usage: cooder <command>

  install   Install the local web product, SQLite database and first account
            from this source checkout
  start     Start backend + built frontend in the background
  web       Start Cooder and open its web interface
  web --no-open  Start it and print the address without launching a browser
  stop      Stop the local server
  status    Show whether the local server is available
  logs      Follow the server log
`);
    break;
  default:
    console.error(`Unknown command: ${command}\nRun cooder --help for available commands.`);
    process.exit(2);
}
