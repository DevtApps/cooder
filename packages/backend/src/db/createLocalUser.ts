import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';

import '../bootstrap/localInstall.js';
import '../config.js';
import { closePool, get as pgGet, isSQLiteBackend, run as pgRun } from './pg.js';

if (!isSQLiteBackend()) throw new Error('The local first-user setup requires COODER_DB_DRIVER=sqlite');

if (process.env.COODER_CHECK_FIRST_USER === '1') {
  const existing = await pgGet('SELECT id FROM users LIMIT 1');
  console.log(existing ? 'EXISTS' : 'EMPTY');
  await closePool();
  process.exit(0);
}

const email = process.env.COODER_INITIAL_EMAIL?.trim().toLowerCase();
const password = process.env.COODER_INITIAL_PASSWORD;
if (!email || !password) throw new Error('COODER_INITIAL_EMAIL and COODER_INITIAL_PASSWORD are required');

const existing = (await pgGet('SELECT id FROM users LIMIT 1')) as { id: string } | undefined;
if (existing) throw new Error('This Cooder database already has an account; refusing to replace it.');

const id = nanoid();
const name = email.split('@')[0] || 'Cooder';
const passwordHash = bcrypt.hashSync(password, 12);
await pgRun(
  'INSERT INTO users (id, email, name, provider, provider_id, password_hash, role, status) ' +
    'VALUES (?, ?, ?, \'cli\', ?, ?, \'admin\', \'active\')',
  id,
  email,
  name,
  'local-' + id,
  passwordHash
);
await pgRun(
  'INSERT INTO user_settings (user_id, theme, allowed_tools) ' +
    'VALUES (?, \'dark\', \'["Bash","Read","Write","Edit","Glob","Grep"]\')',
  id
);
await pgRun(
  'INSERT INTO app_config (key, value) VALUES (\'basic_auth_enabled\', \'true\') ' +
    'ON CONFLICT (key) DO UPDATE SET value = \'true\', updated_at = CURRENT_TIMESTAMP'
);
console.log('Created the local administrator account for ' + email + '.');
await closePool();
