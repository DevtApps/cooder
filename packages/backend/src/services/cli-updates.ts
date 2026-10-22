import { exec } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import type {
  CliProviderUninstallResponse,
  CliProviderUpdateResponse,
  CLIProvider,
} from '@plum-code-webui/shared';
import { getCliEnv, getNpmPrefix } from '../utils/cliPaths.js';

const execAsync = promisify(exec);

export const CLI_UPDATE_PROVIDERS = ['claude', 'codex', 'opencode', 'pi', 'kimi', 'vibe'] as const;

const CLI_UPDATE_PACKAGES: Partial<Record<CLIProvider, string[]>> = {
  claude: ['@anthropic-ai/claude-code@latest'],
  zai: ['@anthropic-ai/claude-code@latest'],
  codex: ['@openai/codex@latest'],
  opencode: ['opencode-ai@latest'],
  pi: ['@earendil-works/pi-coding-agent@latest', 'pi-mcp-adapter@latest'],
  kimi: ['@moonshot-ai/kimi-code@latest'],
};

const CLI_UNINSTALL_PACKAGES: Partial<Record<CLIProvider, string[]>> = {
  claude: ['@anthropic-ai/claude-code'],
  codex: ['@openai/codex'],
  opencode: ['opencode-ai'],
  pi: ['@earendil-works/pi-coding-agent', 'pi-mcp-adapter'],
  kimi: ['@moonshot-ai/kimi-code'],
};

const CLI_UPDATE_COMMANDS: Partial<Record<CLIProvider, string>> = {
  // Vibe is a Python CLI installed with pipx into ~/.local (node-writable, on
  // PATH ahead of the image's /opt/cooder-cli copy), so an in-app update survives
  // without root and the symlink in /opt/cooder-cli/bin keeps resolving.
  vibe: 'pipx upgrade mistral-vibe || pipx install mistral-vibe',
};

const CLI_UNINSTALL_COMMANDS: Partial<Record<CLIProvider, string>> = {
  vibe: 'pipx uninstall mistral-vibe',
};

let updateInFlight: Promise<CliProviderUpdateResponse> | null = null;

async function runUpdateCommand(command: string, env: NodeJS.ProcessEnv, timeoutMs: number) {
  try {
    const { stdout, stderr } = await execAsync(command, {
      env,
      cwd: os.homedir(),
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });
    const output = [stdout, stderr].filter((value) => value && value.length > 0).join('');
    return { output, exitCode: 0 };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number | string;
    };
    const output = [err.stdout, err.stderr, err.message]
      .filter((value) => value && value.length > 0)
      .join('\n');
    const exitCode = typeof err.code === 'number' ? err.code : null;
    return { output, exitCode };
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function getCliUpdateCommand(
  provider: CLIProvider,
  prefix = getNpmPrefix()
): string | undefined {
  const packages = CLI_UPDATE_PACKAGES[provider];
  if (packages) {
    const smokeTest =
      provider === 'claude' || provider === 'zai'
        ? 'claude --version'
        : provider === 'opencode'
          ? 'opencode --version'
          : provider === 'pi'
            ? 'pi --version'
            : undefined;
    return [
      'pnpm add --global',
      `--global-dir ${shellQuote(path.join(prefix, 'global'))}`,
      packages.map(shellQuote).join(' '),
      ...(smokeTest ? [`&& ${smokeTest}`] : []),
    ].join(' ');
  }
  return CLI_UPDATE_COMMANDS[provider];
}

export function getCliUninstallCommand(
  provider: CLIProvider,
  prefix = getNpmPrefix()
): string | undefined {
  const packages = CLI_UNINSTALL_PACKAGES[provider];
  if (packages) {
    return [
      'pnpm remove --global',
      `--global-dir ${shellQuote(path.join(prefix, 'global'))}`,
      packages.map(shellQuote).join(' '),
    ].join(' ');
  }
  return CLI_UNINSTALL_COMMANDS[provider];
}

export async function runCliUninstalls(
  providers: CLIProvider[]
): Promise<CliProviderUninstallResponse> {
  const results: CliProviderUninstallResponse['results'] = [];
  const prefix = getNpmPrefix();
  const env = getCliEnv();

  for (const provider of providers) {
    const command = getCliUninstallCommand(provider, prefix);
    if (!command) {
      results.push({
        provider,
        command: '',
        output: 'No uninstall command configured.',
        exitCode: null,
        status: 'failed',
      });
      continue;
    }

    const { output, exitCode } = await runUpdateCommand(command, env, 5 * 60 * 1000);
    results.push({
      provider,
      command,
      output,
      exitCode,
      status: exitCode === 0 ? 'uninstalled' : 'failed',
    });
  }

  return { results };
}

export async function runCliUpdates(providers?: CLIProvider[]): Promise<CliProviderUpdateResponse> {
  if (updateInFlight) {
    return updateInFlight;
  }

  updateInFlight = (async () => {
    const targetProviders =
      providers && providers.length > 0 ? providers : [...CLI_UPDATE_PROVIDERS];

    const results: CliProviderUpdateResponse['results'] = [];
    for (const provider of targetProviders) {
      const prefix = getNpmPrefix();
      const env = getCliEnv();
      await fs.mkdir(path.join(prefix, 'bin'), { recursive: true });
      await fs.mkdir(path.join(prefix, 'lib'), { recursive: true });

      const command = getCliUpdateCommand(provider, prefix);
      if (!command) {
        results.push({
          provider,
          command: '',
          output: 'No update command configured.',
          exitCode: null,
          status: 'failed',
        });
        continue;
      }

      const timeoutMs = 5 * 60 * 1000;
      const { output, exitCode } = await runUpdateCommand(command, env, timeoutMs);
      results.push({
        provider,
        command,
        output,
        exitCode,
        status: exitCode === 0 ? 'updated' : 'failed',
      });
    }

    return { results };
  })();

  try {
    return updateInFlight;
  } finally {
    updateInFlight = null;
  }
}
