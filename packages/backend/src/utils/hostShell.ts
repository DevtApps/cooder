import fs from 'fs';

/** The user's shell, falling back to whatever the machine has. */
export function hostShell(): string {
  const wanted = process.env.SHELL;
  if (wanted && fs.existsSync(wanted)) return wanted;
  return fs.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh';
}

/**
 * Environment for things the user would run themselves (terminal, background
 * processes): their real home and PATH, without Cooder's internal variables.
 */
export function hostShellEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && !/^(WEBUI_|npm_|NPM_CONFIG_)/.test(key)) env[key] = value;
  }
  if (process.env.COODER_REAL_HOME) env.HOME = process.env.COODER_REAL_HOME;
  return env;
}
