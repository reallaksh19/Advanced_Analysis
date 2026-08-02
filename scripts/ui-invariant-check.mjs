import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE = path.join(ROOT, 'src', 'workspace');
// Matches either path separator so the behavioral invariants below apply on
// Windows and POSIX. Module length is not a pass/fail invariant; architecture
// remains governed by public contracts, source-authority boundaries and the
// explicit recomputation prohibitions retained in this check.
const FEA_UI_PATTERN = /(?:^|[\\/])(?:lfea|lafea|fea-benchmark)[^\\/]*\.js$/u;
const NUMERIC_AUTHORITY_FILES = new Set([
  'lfea-field-adapter.js',
  'lfea-plot-descriptor.js',
  'lfea-preflight.js',
]);

const workspaceFiles = walk(WORKSPACE)
  .filter((file) => file.endsWith('.js'));
const feaUiFiles = workspaceFiles.filter((file) => FEA_UI_PATTERN.test(file));

for (const file of feaUiFiles) {
  const source = fs.readFileSync(file, 'utf8');
  if (NUMERIC_AUTHORITY_FILES.has(path.basename(file))) continue;
  const banned = [
    [/\b3\s*\*\s*txy\s*\*\*\s*2/u, 'von Mises recomputation'],
    [/\bMath\.sqrt\s*\([^)]*\bsx\b[^)]*\bsy\b/u, 'stress invariant recomputation'],
    [/\bRichardson\b[^;\n]*(?:Math\.pow|\*\*)/iu, 'Richardson recomputation'],
  ];
  for (const [pattern, description] of banned) {
    assert.equal(
      pattern.test(source),
      false,
      `${path.relative(ROOT, file)} contains ${description}.`,
    );
  }
}

const convergenceFiles = feaUiFiles.filter((file) =>
  path.basename(file).startsWith('lfea-convergence-'));
for (const file of convergenceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const executableSource = source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/\/\/.*$/gmu, '');
  assert.equal(
    /Math\.(?:log|pow)|\*\*/u.test(executableSource),
    false,
    `${path.relative(ROOT, file)} must consume kernel convergence evidence.`,
  );
}

const packageValue = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
);
assert.equal(
  Object.hasOwn(packageValue.dependencies ?? {}, 'axe-core'),
  false,
  'axe-core must not be a runtime dependency.',
);

console.log(`ui-invariant-check: OK (${feaUiFiles.length} FEA UI modules; line count advisory)`);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
