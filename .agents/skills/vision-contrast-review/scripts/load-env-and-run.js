#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
let envPath = '.env';

if (args[0] === '--env') {
  envPath = args[1] || envPath;
  args.splice(0, 2);
}

if (args.length === 0) {
  console.error('Usage: node load-env-and-run.js [--env .env] <command> [...args]');
  process.exit(2);
}

Object.assign(process.env, parseEnvFile(envPath));

const result = spawnSync(args[0], args.slice(1), {
  env: process.env,
  shell: false,
  stdio: 'inherit'
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);

function parseEnvFile(filePath) {
  let text = '';

  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    return {};
  }

  const env = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');
    if (separator < 1) {
      continue;
    }

    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[name] = value;
  }

  return env;
}
