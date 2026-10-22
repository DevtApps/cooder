import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import os from 'os';
import { nanoid } from 'nanoid';
import { hostShell, hostShellEnv } from '../../utils/hostShell.js';

const LOG_LIMIT = 200_000;
const MAX_PER_SESSION = 20;
const STARTUP_WAIT_MS = 1500;
const STOP_GRACE_MS = 4000;
const URL_PATTERN = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0):\d+[^\s"'<>)\]]*/g;
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

export type ProcessStatus = 'running' | 'exited' | 'failed' | 'stopped';

export interface ProcessInfo {
  id: string;
  sessionId: string;
  name: string;
  command: string;
  cwd: string;
  status: ProcessStatus;
  pid: number | null;
  startedAt: number;
  endedAt: number | null;
  exitCode: number | null;
  /** Local addresses the process printed, e.g. a dev server's URL. */
  urls: string[];
}

interface Entry extends ProcessInfo {
  child: ChildProcess | null;
  log: string;
  stopRequested: boolean;
}

function publicInfo(entry: Entry): ProcessInfo {
  const { child: _child, log: _log, stopRequested: _stop, ...info } = entry;
  return info;
}

/**
 * Long-running processes an agent starts on the user's machine (dev servers,
 * watchers…). They outlive the agent's turn, belong to a session, and are
 * listed in the panel where the user can read their output and stop them.
 */
export class ProcessManager {
  private entries = new Map<string, Entry>();

  constructor() {
    const stopAll = () => {
      for (const entry of this.entries.values()) this.signal(entry, 'SIGTERM');
    };
    process.once('exit', stopAll);
    for (const sig of ['SIGINT', 'SIGTERM'] as const) {
      process.once(sig, () => {
        stopAll();
        process.exit(0);
      });
    }
  }

  list(sessionId: string): ProcessInfo[] {
    return [...this.entries.values()]
      .filter((entry) => entry.sessionId === sessionId)
      .sort((a, b) => b.startedAt - a.startedAt)
      .map(publicInfo);
  }

  get(sessionId: string, id: string): Entry | undefined {
    const entry = this.entries.get(id);
    return entry && entry.sessionId === sessionId ? entry : undefined;
  }

  logs(sessionId: string, id: string, maxChars = 64_000): string {
    const entry = this.get(sessionId, id);
    if (!entry) throw new Error('No such process');
    return entry.log.slice(-maxChars);
  }

  async start(
    sessionId: string,
    input: { command: string; name?: string; cwd: string }
  ): Promise<ProcessInfo> {
    const command = input.command.trim();
    if (!command) throw new Error('A command is required');
    this.prune(sessionId);
    const running = this.list(sessionId).filter((p) => p.status === 'running').length;
    if (running >= MAX_PER_SESSION) {
      throw new Error(`This session already runs ${MAX_PER_SESSION} processes; stop some first`);
    }
    const cwd = fs.existsSync(input.cwd) ? input.cwd : os.homedir();
    const entry: Entry = {
      id: nanoid(8),
      sessionId,
      name: (input.name || command).trim().slice(0, 80),
      command,
      cwd,
      status: 'running',
      pid: null,
      startedAt: Date.now(),
      endedAt: null,
      exitCode: null,
      urls: [],
      child: null,
      log: '',
      stopRequested: false,
    };
    this.entries.set(entry.id, entry);
    this.launch(entry);
    // Give it a moment, so a command that dies at once is reported as such.
    await new Promise((resolve) => setTimeout(resolve, STARTUP_WAIT_MS));
    return publicInfo(entry);
  }

  private launch(entry: Entry): void {
    entry.status = 'running';
    entry.stopRequested = false;
    entry.endedAt = null;
    entry.exitCode = null;
    const child = spawn(hostShell(), ['-c', entry.command], {
      cwd: entry.cwd,
      env: { ...hostShellEnv(), FORCE_COLOR: '0', TERM: 'dumb' },
      detached: true, // its own process group, so stopping takes the children too
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    entry.child = child;
    entry.pid = child.pid ?? null;
    const onData = (chunk: Buffer) => {
      const text = chunk.toString('utf8').replace(ANSI, '');
      entry.log = (entry.log + text).slice(-LOG_LIMIT);
      for (const url of text.match(URL_PATTERN) ?? []) {
        if (!entry.urls.includes(url) && entry.urls.length < 5) entry.urls.push(url);
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('error', (error) => {
      onData(Buffer.from(`[could not start: ${error.message}]\n`));
      entry.status = 'failed';
      entry.endedAt = Date.now();
    });
    child.on('exit', (code, sig) => {
      if (entry.child !== child) return; // restarted meanwhile
      entry.exitCode = code;
      entry.endedAt = Date.now();
      entry.status = entry.stopRequested ? 'stopped' : code === 0 ? 'exited' : 'failed';
      if (sig && !entry.stopRequested) onData(Buffer.from(`[killed by ${sig}]\n`));
    });
  }

  private signal(entry: Entry, sig: NodeJS.Signals): void {
    if (!entry.child?.pid || entry.status !== 'running') return;
    try {
      process.kill(-entry.child.pid, sig);
    } catch {
      try {
        entry.child.kill(sig);
      } catch {
        // already gone
      }
    }
  }

  async stop(sessionId: string, id: string): Promise<ProcessInfo> {
    const entry = this.get(sessionId, id);
    if (!entry) throw new Error('No such process');
    if (entry.status === 'running') {
      entry.stopRequested = true;
      this.signal(entry, 'SIGTERM');
      const deadline = Date.now() + STOP_GRACE_MS;
      while (entry.status === 'running' && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (entry.status === 'running') {
        this.signal(entry, 'SIGKILL');
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
    return publicInfo(entry);
  }

  async restart(sessionId: string, id: string): Promise<ProcessInfo> {
    const entry = this.get(sessionId, id);
    if (!entry) throw new Error('No such process');
    await this.stop(sessionId, id);
    entry.log = '';
    entry.urls = [];
    entry.startedAt = Date.now();
    this.launch(entry);
    await new Promise((resolve) => setTimeout(resolve, STARTUP_WAIT_MS));
    return publicInfo(entry);
  }

  /** Forget a finished process. */
  remove(sessionId: string, id: string): void {
    const entry = this.get(sessionId, id);
    if (!entry) return;
    if (entry.status === 'running') throw new Error('Stop it before removing it');
    this.entries.delete(id);
  }

  /** Keep the list bounded: drop the oldest finished ones. */
  private prune(sessionId: string): void {
    const finished = this.list(sessionId).filter((p) => p.status !== 'running');
    for (const old of finished.slice(MAX_PER_SESSION - 1)) this.entries.delete(old.id);
  }
}

export const processManager = new ProcessManager();
