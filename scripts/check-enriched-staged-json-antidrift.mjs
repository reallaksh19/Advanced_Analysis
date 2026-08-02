import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const scripts = fs.readdirSync(path.join(root, 'scripts'))
  .filter((name) => name.startsWith('enriched-staged-json-') || name.startsWith('check-enriched-staged-json-') || name === 'benchmark-enriched-staged-json-qualification.mjs' || name === 'run-enriched-staged-json-qualification-checks.mjs')
  .sort();

const forbiddenRuntimeSources = [
  /Date\.now\s*\(/,
  /Math\.random\s*\(/,
  /randomUUID\s*\(/,
  /new\s+Date\s*\(\s*\)/,
  /localeCompare\s*\(/,
  /Intl\./,
];
const forbiddenImportFragments = [
  '/src/',
  'project-data',
  'lfea',
  'solver',
  'empirical',
  'topology',
];
let importCount = 0;
for (const name of scripts) {
  const source = fs.readFileSync(path.join(root, 'scripts', name), 'utf8');
  for (const pattern of forbiddenRuntimeSources) assert.equal(pattern.test(source), false, `${name} contains ${pattern}`);
  const importMatches = source.matchAll(/(?:import\s+(?:[^'\"]+\s+from\s+)?|import\s*\()(['\"])([^'\"]+)\1/g);
  for (const match of importMatches) {
    importCount += 1;
    const specifier = match[2].toLowerCase();
    if (specifier.startsWith('node:')) continue;
    assert.equal(forbiddenImportFragments.some((fragment) => specifier.includes(fragment)), false, `${name} imports ${specifier}`);
    assert.equal(specifier.startsWith('./'), true, `${name} has non-local import ${specifier}`);
  }
}

const sourceFiles = walk(path.join(root, 'src')).filter((file) => /\.(?:js|mjs|cjs)$/.test(file));
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  assert.equal(/enriched-staged-json-(?:fixtures|export-harness|qualification-helpers|hash-worker)/.test(source), false, `${file} imports qualification modules`);
}

const loaderProbe = spawnSync(process.execPath, [
  '--experimental-loader',
  './scripts/enriched-staged-json-import-guard-loader.mjs',
  '--input-type=module',
  '--eval',
  "import('./scripts/enriched-staged-json-fixtures.mjs').then(() => process.stdout.write('ok'))",
], { cwd: root, encoding: 'utf8' });
assert.equal(loaderProbe.status, 0, loaderProbe.stderr);
assert.equal(loaderProbe.stdout, 'ok');

const docs = fs.readFileSync(path.join(root, 'docs', 'enriched-staged-json-qualification.md'), 'utf8');
for (const token of [
  'ENRICHED_STAGED_JSON_SOURCE_MUTATED',
  'ENRICHED_STAGED_JSON_TARGET_JOIN_MISSING',
  'ENRICHED_STAGED_JSON_TARGET_JOIN_DUPLICATE',
  'ENRICHED_STAGED_JSON_BASELINE_HASH_MISMATCH',
  'ENRICHED_STAGED_JSON_GEOMETRY_HASH_MISMATCH',
  'ENRICHED_STAGED_JSON_DUPLICATE_AUTHORITY_NAMESPACE',
  'ENRICHED_STAGED_JSON_BLOCKER_VALUE_INVENTED',
  'ENRICHED_STAGED_JSON_FILE_API_PARITY_MISMATCH',
  'single-root object',
  'branch-array root',
  'non-authority',
]) assert.ok(docs.includes(token), `Documentation lacks ${token}`);

console.log(JSON.stringify({
  status: 'PASS',
  check: 'anti-drift',
  scriptCount: scripts.length,
  importCount,
  productionFilesScanned: sourceFiles.length,
}));

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  const output = [];
  const stack = [directory];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else output.push(full);
    }
  }
  return output;
}
