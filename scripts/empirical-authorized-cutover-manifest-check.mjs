import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const defaultBase = '80624a8ec12bce99f348f9494c95c06fe541c791';
const base = process.env.EMP01_BASE_SHA || defaultBase;
const expected = [
  'docs/empirical-mechanical-extension-seams.md',
  'scripts/authorized-empirical-execution-view-anti-drift-check.mjs',
  'scripts/authorized-enrichment-consumer-controller-anti-drift-check.mjs',
  'scripts/authorized-enrichment-consumer-controller-check.mjs',
  'scripts/authorized-enrichment-workspace-api-anti-drift-check.mjs',
  'scripts/authorized-enrichment-workspace-api-check.mjs',
  'scripts/empirical-authorized-cutover-manifest-check.mjs',
  'scripts/empirical-authorized-cutover-production-check.mjs',
  'scripts/empirical-authorized-parity-check.mjs',
  'scripts/empirical-authorized-runtime-check.mjs',
  'scripts/run-empirical-authorized-cutover-checks.mjs',
  'src/main.js',
  'src/workspace/engineering-loads/authorized-empirical-runtime-package.js',
  'src/workspace/engineering-loads/authorized-empirical-runtime-store.js',
  'src/workspace/engineering-loads/engineering-support-load-store.js',
  'src/workspace/engineering-model-controller.js',
  'src/workspace/engineering-model-store.js',
  'src/workspace/enrichment/authorized-enrichment-consumer-controller.js',
  'src/workspace/enrichment/authorized-enrichment-runtime.js',
  'src/workspace/enrichment/authorized-enrichment-workspace-api.js',
  'src/workspace/load-calc-consumer-controller.js',
  'src/workspace/load-calc-consumer-view.js',
  'tests/engineering-model-controller-dataset-guard.test.mjs',
].sort(ascii);

const actual = git(['diff', '--name-only', `${base}..HEAD`])
  .split('\n').map((row) => row.trim()).filter(Boolean).sort(ascii);
assert.deepEqual(actual, expected, 'EMP-01 changed-file manifest differs from the governed set');

for (const file of actual) {
  for (const forbidden of [
    '.github/', 'src/core/linear-fea-', 'src/core/linear-piping-analysis/',
    'src/workspace/lfea-', 'src/workspace/lafea-', 'package.json', 'package-lock.json',
    'vite.config', 'stagedjson', 'staged-json-writer', 'project-data-store.js',
  ]) assert.equal(file.includes(forbidden), false, `forbidden EMP-01 path changed: ${file}`);
}
assert.equal(actual.includes('src/workspace/engineering-loads/support-load-distribution-v3.js'), false,
  'governed numerical engine changed inside EMP-01');

console.log(JSON.stringify({
  status: 'PASS',
  base,
  head: git(['rev-parse', 'HEAD']),
  changedFileCount: actual.length,
  changedFiles: actual,
  workflowFilesChanged: 0,
  lfeaOrFeaFilesChanged: 0,
  numericalEngineChanged: false,
}, null, 2));

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    const error = new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
    error.code = 'EMP01_GIT_EVIDENCE_FAILED';
    throw error;
  }
  return result.stdout.trim();
}
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
