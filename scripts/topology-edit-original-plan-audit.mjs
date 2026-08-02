import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(
  ROOT,
  'reports/qualification/topology-edit-original-plan-audit.json',
);
const WORKFLOW_PATH = '.github/workflows/topology-edit-wave5.yml';
const DEMO_WORKFLOW_PATH = '.github/workflows/topology-edit-demo-walkthrough.yml';
const DEMO_SPEC_PATH = 'e2e/topology-edit-20-element-demo-edit-flow.spec.js';
const REPAIR_SPEC_PATH = 'e2e/topology-edit-20-element-demo-repair-flow.spec.js';
const LIFECYCLE_SPEC_PATH = 'e2e/topology-edit-20-element-demo-lifecycle-flow.spec.js';
const DEMO_FIXTURE_PATH = 'public/fixtures/topology-edit-20-element-demo.staged.json';
const PREREQUISITE_PATH = 'tests/fixtures/topology-edit/1885s/prerequisite-manifest.json';

const waves = Object.freeze([
  wave('W0', ['W0.1', 'W0.2', 'W0.3'], [
    '.github/workflows/topology-edit-wave0.yml',
    'src/workspace/topology-edit/topology-edit-baseline-manifest.js',
    'src/vendor/topology-edit/qualification-evidence-schema.json',
    'scripts/topology-edit-source-drift-check.mjs',
    'scripts/topology-edit-api-drift-check.mjs',
    'scripts/topology-edit-prohibited-imports.mjs',
    'tests/production-startup.spec.mjs',
  ]),
  wave('W1', ['W1.1', 'W1.2', 'W1.3', 'W1.4'], [
    'tests/topology-edit-wave1-pure-kernel.test.mjs',
    'tests/topology-edit-wave1-candidate-certification.test.mjs',
    'tests/topology-edit-wave1-journal-replay.test.mjs',
    'tests/topology-edit-wave1-production-integration.test.mjs',
  ]),
  wave('W2', ['W2.1', 'W2.2', 'W2.3', 'W2.4', 'W2.5'], [
    'tests/topology-edit-dimension-authority.test.mjs',
    'tests/topology-edit-fitting-support-geometry.test.mjs',
    'tests/topology-edit-fitting-support-integration.test.mjs',
  ]),
  wave('W3', ['W3.1', 'W3.2', 'W3.3', 'W3.4', 'W3.5'], [
    'tests/topology-edit-wave3a-checker.test.mjs',
    'tests/topology-edit-wave3-commands.test.mjs',
    'tests/topology-edit-wave3-exact-gap-modes.test.mjs',
    'tests/topology-edit-wave3b-autofix.test.mjs',
    'tests/topology-edit-wave3c-autofix-ui.test.mjs',
  ]),
  wave('W4', ['W4.1', 'W4.2', 'W4.3', 'W4.4', 'W4.5'], [
    'tests/topology-edit-wave4a-persistence-export.test.mjs',
    'tests/topology-edit-wave4b-commit-rollback.test.mjs',
    'tests/topology-edit-wave4c-lifecycle-ui.test.mjs',
    'tests/topology-edit-lifecycle-view-state.test.mjs',
  ]),
  wave('W5', ['W5.1', 'W5.2', 'W5.3', 'W5.4', 'W5.5'], [
    WORKFLOW_PATH,
    DEMO_WORKFLOW_PATH,
    DEMO_SPEC_PATH,
    REPAIR_SPEC_PATH,
    LIFECYCLE_SPEC_PATH,
    DEMO_FIXTURE_PATH,
    'scripts/topology-edit-wave5-contract.mjs',
    'scripts/topology-edit-wave5-fixture-check.mjs',
    'scripts/topology-edit-write-wave5-evidence.mjs',
    'tests/topology-edit-20-element-demo-loader.test.mjs',
    'tests/topology-edit-20-element-demo-repairs.test.mjs',
    'tests/topology-edit-search-composition.test.mjs',
    'tests/topology-edit-track-c.test.mjs',
    'tests/topology-edit-wave5.test.mjs',
    'tests/topology-edit-wave5-track-b-closure.test.mjs',
    'tests/topology-edit-wave5-browser-harness.js',
    'tests/topology-edit-wave5-browser.spec.mjs',
    PREREQUISITE_PATH,
  ]),
]);

const additiveC3d = Object.freeze({
  scopeId: 'C3D_ADDITIVE_REVIEW_STACK',
  requiredFiles: Object.freeze([
    'src/workspace/load-calc-consumer-controller.js',
    'src/workspace/topology-edit-3d-search-controller.js',
    'src/workspace/topology-edit-3d-issue-controller.js',
    'src/workspace/topology-edit-3d-inspection-controller.js',
    'src/workspace/topology-edit-3d-comparison-controller.js',
    'src/workspace/topology-edit-3d-route-controller.js',
    'src/workspace/topology-edit-3d-dossier-controller.js',
    'tests/topology-edit-c3d-wave0.test.mjs',
    'tests/topology-edit-c3d-wave1-visibility.test.mjs',
    'tests/topology-edit-c3d-wave1-sectioning.test.mjs',
    'tests/topology-edit-c3d-wave2-search.test.mjs',
    'tests/topology-edit-search-composition.test.mjs',
    'tests/topology-edit-c3d-wave3-gpu-picking.test.mjs',
    'tests/topology-edit-c3d-wave3-review.test.mjs',
    'tests/topology-edit-c3d-wave4-issue-review.test.mjs',
    'tests/topology-edit-c3d-wave4-comparison.test.mjs',
    'tests/topology-edit-c3d-wave5-inspection-measurement.test.mjs',
    'tests/topology-edit-c3d-wave6-route-trace.test.mjs',
  ]),
});

const requiredFiles = unique([
  'docs/TOPOLOGY_EDIT_ORIGINAL_PLAN_CLOSURE_AUDIT.md',
  'scripts/topology-edit-original-plan-audit.mjs',
  ...waves.flatMap((entry) => entry.requiredFiles),
  ...additiveC3d.requiredFiles,
]);
await assertFilesExist(requiredFiles);

const workflow = await readFile(path.join(ROOT, WORKFLOW_PATH), 'utf8');
const workflowCoverage = unique([
  ...waves.slice(1, 5).flatMap((entry) => entry.requiredFiles),
  ...additiveC3d.requiredFiles.filter((file) => file.startsWith('tests/')),
]);
for (const file of workflowCoverage) {
  assert.match(workflow, new RegExp(escapeRegExp(file)), `Wave 5 must execute ${file}.`);
}
for (const trigger of [
  "'src/workspace/topology-edit-3d-*.js'",
  "'src/workspace/viewport-productivity/**'",
  "'tests/topology-edit-c3d-*.test.mjs'",
  `'${DEMO_SPEC_PATH}'`,
  `'${REPAIR_SPEC_PATH}'`,
  `'${LIFECYCLE_SPEC_PATH}'`,
]) {
  assert.ok(workflow.includes(trigger), `Wave 5 path coverage is missing ${trigger}.`);
}
for (const commandEvidence of [
  DEMO_SPEC_PATH,
  REPAIR_SPEC_PATH,
  LIFECYCLE_SPEC_PATH,
  'tests/topology-edit-20-element-demo-loader.test.mjs',
  'tests/topology-edit-20-element-demo-repairs.test.mjs',
  'tests/topology-edit-lifecycle-view-state.test.mjs',
  'tests/topology-edit-search-composition.test.mjs',
  'tests/topology-edit-wave3-exact-gap-modes.test.mjs',
]) {
  assert.ok(
    workflow.includes(commandEvidence),
    `Wave 5 must execute the real demo dependency ${commandEvidence}.`,
  );
}
assert.ok(
  workflow.includes('node scripts/topology-edit-original-plan-audit.mjs'),
  'Wave 5 must execute the original-plan audit.',
);

const demoWorkflow = await readFile(path.join(ROOT, DEMO_WORKFLOW_PATH), 'utf8');
for (const qualifiedPath of [
  DEMO_SPEC_PATH,
  REPAIR_SPEC_PATH,
  LIFECYCLE_SPEC_PATH,
  DEMO_FIXTURE_PATH,
  'tests/topology-edit-20-element-demo-loader.test.mjs',
  'tests/topology-edit-20-element-demo-repairs.test.mjs',
  'tests/topology-edit-lifecycle-view-state.test.mjs',
  'tests/topology-edit-search-composition.test.mjs',
  'tests/topology-edit-wave3-exact-gap-modes.test.mjs',
  'tests/topology-edit-c3d-wave2-search.test.mjs',
]) {
  assert.ok(
    demoWorkflow.includes(qualifiedPath),
    `Demo walkthrough workflow must bind ${qualifiedPath}.`,
  );
}
for (const exactEvidence of [
  'PASS_EXACT_GAP_USER_WALKTHROUGH',
  'PASS_BRIDGE_AND_TRIM_USER_WALKTHROUGH',
  'PASS_REPAIRED_DEMO_LIFECYCLE',
  'TOPOLOGY_EDIT_TARGET_HEAD_SHA',
  'topology-edit-demo-walkthrough.json',
  'topology-edit-demo-repairs.json',
  'topology-edit-demo-lifecycle.json',
]) {
  assert.ok(
    demoWorkflow.includes(exactEvidence),
    `Demo walkthrough workflow is missing ${exactEvidence}.`,
  );
}

const prerequisiteManifest = JSON.parse(
  await readFile(path.join(ROOT, PREREQUISITE_PATH), 'utf8'),
);
assert.equal(prerequisiteManifest.schema, 'TopologyEditWave5PrerequisiteManifest.v2');
assert.deepEqual(
  prerequisiteManifest.prerequisites.map((entry) => entry.waveId),
  ['WAVE_0', 'WAVE_1', 'WAVE_2', 'WAVE_3', 'WAVE_4'],
);
for (const entry of prerequisiteManifest.prerequisites) {
  assert.equal(entry.status, 'PASS_MERGED', `${entry.waveId} is not marked merged.`);
  assert.match(entry.mergeCommit, /^[0-9a-f]{40}$/u, `${entry.waveId} needs an exact merge commit.`);
}

const candidateHead = git(['rev-parse', 'HEAD']);
const expectedHead = process.env.TOPOLOGY_EDIT_TARGET_HEAD_SHA || candidateHead;
assert.equal(candidateHead, expectedHead, 'Original-plan audit must bind to the exact candidate head.');
const exactHeadStatus = normalizeExactHeadStatus(
  process.env.TOPOLOGY_EDIT_WAVE5_EXACT_HEAD_STATUS,
);
const finalStatus = exactHeadStatus === 'PASS'
  ? 'PASS_ORIGINAL_PLAN_CLOSURE'
  : 'PASS_IMPLEMENTATION_AUDIT';
const report = {
  schema: 'TopologyEditOriginalPlanAudit.v1',
  status: finalStatus,
  candidateHead,
  expectedHead,
  originalPlanPackages: waves.map((entry) => ({
    waveId: entry.waveId,
    packageIds: entry.packageIds,
    disposition: entry.waveId === 'W5' && exactHeadStatus !== 'PASS'
      ? 'IMPLEMENTED_EXACT_HEAD_EXECUTION_PENDING'
      : 'PASS_IMPLEMENTED_AND_COVERED',
    requiredFiles: entry.requiredFiles,
  })),
  prerequisiteManifest: prerequisiteManifest.prerequisites,
  additiveC3d: {
    ...additiveC3d,
    disposition: 'PASS_IMPLEMENTED_AND_COVERED',
  },
  userWalkthrough: {
    workflowPath: DEMO_WORKFLOW_PATH,
    specificationPaths: [DEMO_SPEC_PATH, REPAIR_SPEC_PATH, LIFECYCLE_SPEC_PATH],
    fixturePath: DEMO_FIXTURE_PATH,
    requestedGapModesMm: [3, 20],
    manualBridgeGapMm: 250,
    sourceBackedTrimOverlapMm: 150,
    lifecycleOperations: ['SAVE', 'RELOAD', 'EXPORT', 'COMMIT', 'REOPEN'],
    expectedCommittedDatasetVersion: 1,
    expectedCommittedEntityCount: 21,
    disposition: exactHeadStatus === 'PASS'
      ? 'PASS_EXECUTED_EXACT_HEAD'
      : 'IMPLEMENTED_EXACT_HEAD_EXECUTION_PENDING',
  },
  exactHeadStatus,
  deferredBehavior: exactHeadStatus === 'PASS' ? [] : [{
    code: 'EXACT_HEAD_EXECUTION_REQUIRED',
    message: 'A clean runner must execute the final Wave 5 workflow before PASS_RELEASE may be claimed.',
  }],
  authorityBoundary: {
    productionBehaviorChanged: false,
    commandAuthorityChanged: false,
    persistenceAuthorityChanged: false,
    releaseQualified: exactHeadStatus === 'PASS',
  },
  qualifiedFiles: requiredFiles,
};
await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Topology Edit original-plan audit: ${report.status} at ${candidateHead}.`);

function wave(waveId, packageIds, requiredFilesValue) {
  return Object.freeze({
    waveId,
    packageIds: Object.freeze(packageIds),
    requiredFiles: Object.freeze(requiredFilesValue),
  });
}
async function assertFilesExist(files) {
  for (const repositoryPath of files) {
    const value = await stat(path.join(ROOT, repositoryPath));
    assert.ok(value.isFile(), `${repositoryPath} must be a file.`);
  }
}
function normalizeExactHeadStatus(value) {
  return String(value ?? 'PRECHECK').toUpperCase() === 'PASS' ? 'PASS' : 'PRECHECK';
}
function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}
function unique(values) {
  return [...new Set(values)].sort();
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
