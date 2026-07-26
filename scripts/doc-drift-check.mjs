import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORBIDDEN_PATHS = [
  'src/calc-extended',
  'src/store',
  'src/settings',
  'src/gc3d',
  'src/3d-analysis',
  'src/simp-analysis',
  'src/components',
  'src/config',
];
const SUPERSEDED_DOCS = [
  'rules.md',
  'CORE_SPECIFICATION.md',
  'AUDIT_CURRENT_BASELINE.md',
  'Tasks.md',
];

for (const relativePath of FORBIDDEN_PATHS) {
  assert.equal(
    fs.existsSync(path.join(ROOT, relativePath)),
    false,
    `Forbidden legacy path was recreated: ${relativePath}.`,
  );
}

const sourceFiles = walk(path.join(ROOT, 'src'));
const jsxFiles = sourceFiles.filter((file) => /\.(?:jsx|tsx)$/u.test(file));
assert.deepEqual(jsxFiles, [], `JSX is not permitted: ${jsxFiles.join(', ')}`);

for (const file of sourceFiles.filter((value) => value.endsWith('.js'))) {
  const source = fs.readFileSync(file, 'utf8');
  assert.equal(
    /React\.createElement|from\s+['"]react(?:-dom)?['"]|import\s+\*\s+as\s+React/u.test(source),
    false,
    `React runtime usage is not permitted: ${path.relative(ROOT, file)}`,
  );
}

const packageValue = readJson('package.json');
const dependencies = {
  ...packageValue.dependencies,
  ...packageValue.devDependencies,
};
for (const dependency of Object.keys(dependencies)) {
  assert.equal(
    /^(?:react(?:-|$)|zustand$|@react-three\/)/u.test(dependency),
    false,
    `Forbidden dependency added: ${dependency}`,
  );
}

for (const relativePath of SUPERSEDED_DOCS) {
  const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  assert.ok(
    source.startsWith('> **SUPERSEDED**'),
    `${relativePath} must point to ARCHITECTURE_TRUTH.md.`,
  );
}

for (const [name, command] of Object.entries(packageValue.scripts)) {
  for (const match of command.matchAll(/node (scripts\/[\w.-]+\.mjs)/gu)) {
    assert.ok(
      fs.existsSync(path.join(ROOT, match[1])),
      `Script "${name}" references missing ${match[1]}.`,
    );
  }
}

console.log('doc-drift-check: OK');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
