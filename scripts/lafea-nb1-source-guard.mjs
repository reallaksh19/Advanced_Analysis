#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const baseIndex = process.argv.indexOf('--base');
const base = baseIndex === -1 ? null : process.argv[baseIndex + 1];
if (!base) {
  throw new TypeError('Usage: node scripts/lafea-nb1-source-guard.mjs --base <sha>');
}

const expected = Object.freeze([
  '.github/workflows/lafea-nb1-foundation-screening-verticals.yml',
  'docs/LAFEA_NonBucket_NB1_Foundation_Screening_Verticals.md',
  'scripts/lafea-nb-t3-composition-root-check.mjs',
  'scripts/lafea-nb1-analytical-verticals-check.mjs',
  'scripts/lafea-nb1-source-guard.mjs',
  'scripts/lafea-nonbucket-scope-guard.mjs',
  'scripts/lafea-nonbucket-stack-check.mjs',
  'scripts/lafea-u3a-public-surface-check.mjs',
  'src/core/lafea-analytical-handoff.js',
  'src/core/local-attachment-screening/index.js',
  'src/core/local-attachment-screening/product-escalation-contract.js',
  'src/core/local-attachment-screening/product-escalation.js',
  'src/core/local-attachment-screening/product-handoff.js',
  'src/core/local-stress/finite-footprint-contract.js',
  'src/core/local-stress/finite-footprint-handoff.js',
  'src/core/local-stress/finite-footprint.js',
  'src/core/local-stress/index.js',
  'src/workspace/lafea-stage-components.js',
  'src/workspace/lafea-stage-composition-bindings.js',
  'src/workspace/lafea-stage-composition-root.js',
  'src/workspace/lafea-workbench.js',
].sort());
const changed = git(['diff', '--name-only', `${base}...HEAD`])
  .trim().split('\n').filter(Boolean).sort();
assert.deepEqual(changed, expected);

const additive = new Set([
  '.github/workflows/lafea-nb1-foundation-screening-verticals.yml',
  'docs/LAFEA_NonBucket_NB1_Foundation_Screening_Verticals.md',
  'scripts/lafea-nb1-analytical-verticals-check.mjs',
  'scripts/lafea-nb1-source-guard.mjs',
  'src/core/lafea-analytical-handoff.js',
  'src/core/local-attachment-screening/product-escalation-contract.js',
  'src/core/local-attachment-screening/product-escalation.js',
  'src/core/local-attachment-screening/product-handoff.js',
  'src/core/local-stress/finite-footprint-contract.js',
  'src/core/local-stress/finite-footprint-handoff.js',
  'src/core/local-stress/finite-footprint.js',
]);
const statuses = new Map(git(['diff', '--name-status', `${base}...HEAD`])
  .trim().split('\n').filter(Boolean).map((line) => {
    const [status, path] = line.split('\t');
    return [path, status];
  }));
for (const path of expected) {
  assert.equal(statuses.get(path), additive.has(path) ? 'A' : 'M',
    `${path} has an unexpected change kind.`);
}

const footprintContract = read('src/core/local-stress/finite-footprint-contract.js');
const footprint = read('src/core/local-stress/finite-footprint.js');
const foundationHandoff = read('src/core/local-stress/finite-footprint-handoff.js');
const productContract = read(
  'src/core/local-attachment-screening/product-escalation-contract.js',
);
const product = read('src/core/local-attachment-screening/product-escalation.js');
const productHandoff = read('src/core/local-attachment-screening/product-handoff.js');
const handoff = read('src/core/lafea-analytical-handoff.js');
const bindings = read('src/workspace/lafea-stage-composition-bindings.js');
const root = read('src/workspace/lafea-stage-composition-root.js');

assert.match(footprintContract, /lafea-load-foundation-footprint-request\/v2/u);
for (const type of [
  'POINT', 'LINE', 'RECTANGULAR_PATCH', 'CIRCULAR_PATCH',
  'WELD_LINE', 'RIGID_SPIDER',
]) assert.match(footprintContract, new RegExp(`'${type}'`, 'u'));
assert.match(footprintContract, /pressure.*area.*normal.*applicationPoint/isu);
assert.match(footprintContract, /FOOTPRINT_GEOMETRY_RANK_DEFICIENT/u);
assert.match(footprint, /balancingMoment/u);
assert.match(footprint, /FOOTPRINT_FORCE_CLOSURE_FAILED/u);
assert.match(footprint, /FOOTPRINT_MOMENT_CLOSURE_FAILED/u);
assert.match(foundationHandoff, /sourceStageId:\s*'LAFEA\.1'/u);

assert.match(productContract, /PASS.*ESCALATE.*BLOCKED/su);
assert.match(productContract, /ATTACHMENT_EDGE/u);
assert.match(productContract, /OPENING/u);
assert.match(productContract, /WELD/u);
assert.match(productContract, /TRANSVERSE_SHEAR/u);
assert.match(product, /MISSING_APPLICABILITY_EVIDENCE/u);
assert.match(product, /UNRESOLVED/u);
assert.match(productHandoff, /sourceStageId:\s*'LAFEA\.2'/u);
assert.doesNotMatch(productHandoff, /pointStressStates|vonMises|principalStress/u);

assert.match(handoff, /TARGET_SOURCE_VALIDATION_ONLY/u);
assert.match(handoff, /NO_FE_OR_CODE_STRESS_TRANSFER/u);
assert.match(handoff, /targetEngineExecuted:\s*false/u);
assert.match(handoff, /lifecycleRegistered:\s*false/u);
assert.match(handoff, /releaseQualified:\s*false/u);
assert.doesNotMatch(handoff, /calculateLocalContinuum|calculateLocalShell|calculateLocalTrunnion/u);
assert.match(bindings, /PRODUCT_ASSESSMENT/u);
assert.match(bindings, /HANDOFF/u);
assert.match(root, /evaluateProductAssessment/u);
assert.match(root, /createHandoff/u);

for (const path of [
  'src/core/lafea-analytical-handoff.js',
  'src/core/local-attachment-screening/product-escalation-contract.js',
  'src/core/local-attachment-screening/product-escalation.js',
  'src/core/local-attachment-screening/product-handoff.js',
  'src/core/local-stress/finite-footprint-contract.js',
  'src/core/local-stress/finite-footprint-handoff.js',
  'src/core/local-stress/finite-footprint.js',
]) {
  assert.ok(lineCount(read(path)) <= 300, `${path} exceeds the 300-line module policy.`);
}

for (const forbidden of [
  'src/core/local-continuum/',
  'src/core/local-shell/',
  'src/core/local-trunnion-footprint/',
  'src/core/lafea-application-templates/',
  'src/workspace/lafea-lifecycle.js',
  'src/workspace/lafea-lifecycle-producers.js',
  'src/workspace/lafea-lifecycle-profiles.js',
  'src/workspace/lafea-lifecycle-workbench-store.js',
  'src/workspace/lafea-workbench-controller.js',
  'src/workspace/lafea-workbench-view.js',
  'src/workspace/lafea-result-presenters/',
  'release/',
]) assert.equal(changed.some((path) => path === forbidden || path.startsWith(forbidden)),
  false, `Forbidden NB1 path changed: ${forbidden}`);

console.log(JSON.stringify({
  check: 'lafea-nb1-source-guard',
  status: 'PASS',
  base,
  changedFiles: changed.length,
  additiveFiles: additive.size,
  modifiedIntegrationFiles: expected.length - additive.size,
  finiteFootprintTypes: 6,
  screeningProductStates: 3,
  targetStagesValidated: ['LAFEA.3', 'LAFEA.4', 'LAFEA.5'],
  targetEngineExecutionAdded: false,
  lifecycleSemanticsFilesModified: 0,
  shellOrContinuumCoreFilesModified: 0,
  templateBucketFilesModified: 0,
  releaseFilesModified: 0,
  codeAuthorityPromoted: false,
  releaseQualified: false,
  lafea6Enabled: false,
}));

function lineCount(source) { return source.split('\n').length; }
function read(path) { return readFileSync(path, 'utf8'); }
function git(args) { return execFileSync('git', args, { encoding: 'utf8' }); }
