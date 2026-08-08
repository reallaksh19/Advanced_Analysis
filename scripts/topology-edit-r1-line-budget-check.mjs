import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const LIMIT = 300;
const BASE = process.env.TOPOLOGY_EDIT_R1_BASE_SHA
  || 'ddc0d87aa5e1a02cb8b5bf10e71dbb1fb1ce9fb3';

const changed = execFileSync(
  'git',
  ['diff', '--name-status', `${BASE}...HEAD`],
  { encoding: 'utf8' },
).trim().split('\n').filter(Boolean);

const addedModules = changed
  .map((line) => line.split('\t'))
  .filter(([status, path]) => status === 'A' && /\.(?:js|mjs)$/u.test(path))
  .map(([, path]) => path)
  .sort();

const violations = [];
for (const path of addedModules) {
  const text = readFileSync(path, 'utf8');
  const lineCount = text === '' ? 0 : text.replace(/\n$/u, '').split('\n').length;
  if (lineCount >= LIMIT) violations.push({ path, lineCount });
  process.stdout.write(`${path}: ${lineCount} physical lines\n`);
}

if (violations.length) {
  process.stderr.write(
    `Issue #907 line budget failed: new JS/test modules must be <${LIMIT} physical lines.\n`,
  );
  for (const row of violations) {
    process.stderr.write(`- ${row.path}: ${row.lineCount}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Issue #907 line budget passed for ${addedModules.length} new JS/test module(s).\n`,
  );
}
