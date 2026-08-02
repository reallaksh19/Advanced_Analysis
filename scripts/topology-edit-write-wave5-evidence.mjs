import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTopologyEditWave5ReleaseReceipt } from './topology-edit-wave5-contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_ROOT = path.join(ROOT, 'reports/qualification');
const OUTPUT = path.join(REPORT_ROOT, 'topology-edit-wave5-evidence.json');
const BROWSER_PATH = path.join(REPORT_ROOT, 'topology-edit-wave5-browser.json');
const FIXTURE_PATH = path.join(REPORT_ROOT, 'topology-edit-wave5-fixtures.json');
const AUDIT_PATH = path.join(REPORT_ROOT, 'topology-edit-original-plan-audit.json');
const DEMO_GAP_PATH = path.join(REPORT_ROOT, 'topology-edit-demo-walkthrough.json');
const DEMO_REPAIRS_PATH = path.join(REPORT_ROOT, 'topology-edit-demo-repairs.json');
const DEMO_LIFECYCLE_PATH = path.join(REPORT_ROOT, 'topology-edit-demo-lifecycle.json');
const PREREQUISITE_PATH = path.join(
  ROOT,
  'tests/fixtures/topology-edit/1885s/prerequisite-manifest.json',
);
const QUALIFIED_FILES = Object.freeze([
  '.github/workflows/topology-edit-wave5.yml',
  '.github/workflows/topology-edit-demo-walkthrough.yml',
  'docs/TOPOLOGY_EDIT_ORIGINAL_PLAN_CLOSURE_AUDIT.md',
  'e2e/topology-edit-20-element-demo-edit-flow.spec.js',
  'e2e/topology-edit-20-element-demo-repair-flow.spec.js',
  'e2e/topology-edit-20-element-demo-lifecycle-flow.spec.js',
  'scripts/1885s-empirical-qualification.mjs',
  'scripts/topology-edit-original-plan-audit.mjs',
  'scripts/topology-edit-wave5-contract.mjs',
  'scripts/topology-edit-wave5-fixture-check.mjs',
  'scripts/topology-edit-write-wave5-evidence.mjs',
  'src/workspace/topology-edit-3d-view-controller.js',
  'src/workspace/topology-edit/topology-edit-autofix-controller.js',
  'src/workspace/topology-edit/topology-edit-persistence.js',
  'src/workspace/topology-edit/topology-edit-export.js',
  'src/workspace/topology-edit/topology-edit-commit-service.js',
  'src/workspace/topology-edit/topology-edit-lifecycle-controller.js',
  'tests/topology-edit-20-element-demo-loader.test.mjs',
  'tests/topology-edit-20-element-demo-repairs.test.mjs',
  'tests/topology-edit-lifecycle-view-state.test.mjs',
  'tests/topology-edit-wave5.test.mjs',
  'tests/topology-edit-wave5-browser-harness.js',
  'tests/topology-edit-wave5-browser.spec.mjs',
  'tests/topology-edit-wave4c-lifecycle-ui.test.mjs',
  'tests/fixtures/topology-edit/1885s/fixture-manifest.json',
  'tests/fixtures/topology-edit/1885s/prerequisite-manifest.json',
]);

const candidateHead = git(['rev-parse', 'HEAD']);
const expectedHead = process.env.TOPOLOGY_EDIT_TARGET_HEAD_SHA || candidateHead;
assert.equal(candidateHead, expectedHead, 'Wave 5 evidence must bind to the exact candidate head.');

const prerequisiteManifest = JSON.parse(await readFile(PREREQUISITE_PATH, 'utf8'));
const prerequisites = prerequisiteManifest.prerequisites.map((row) => {
  const ancestor = Boolean(row.mergeCommit)
    && gitStatus(['merge-base', '--is-ancestor', row.mergeCommit, candidateHead]);
  return {
    ...row,
    status: ancestor ? 'PASS' : 'FAIL',
    reason: ancestor ? null : `Merge commit ${row.mergeCommit ?? '<missing>'} is not an ancestor of ${candidateHead}.`,
  };
});
const browserEvidence = await readJsonOrBlocked(BROWSER_PATH, 'BROWSER_EVIDENCE_NOT_RUN');
const fixtureEvidence = await readJsonOrBlocked(FIXTURE_PATH, 'FIXTURE_EVIDENCE_NOT_RUN');
const originalPlanAudit = await readJsonOrBlocked(AUDIT_PATH, 'ORIGINAL_PLAN_AUDIT_NOT_RUN');
const userWalkthroughEvidence = {
  exactGap: await readRequiredWalkthrough(
    DEMO_GAP_PATH,
    'PASS_EXACT_GAP_USER_WALKTHROUGH',
    candidateHead,
  ),
  repairs: await readRequiredWalkthrough(
    DEMO_REPAIRS_PATH,
    'PASS_BRIDGE_AND_TRIM_USER_WALKTHROUGH',
    candidateHead,
  ),
  lifecycle: await readRequiredWalkthrough(
    DEMO_LIFECYCLE_PATH,
    'PASS_REPAIRED_DEMO_LIFECYCLE',
    candidateHead,
  ),
};
assert.equal(
  originalPlanAudit.status,
  'PASS_ORIGINAL_PLAN_CLOSURE',
  JSON.stringify(originalPlanAudit, null, 2),
);
assert.equal(originalPlanAudit.candidateHead, candidateHead);
assert.equal(originalPlanAudit.expectedHead, expectedHead);
assert.equal(userWalkthroughEvidence.exactGap.cases?.length, 2);
assert.equal(userWalkthroughEvidence.repairs.bridge?.gapMm, 250);
assert.equal(userWalkthroughEvidence.repairs.trim?.overlapRemovedMm, 150);
assert.equal(userWalkthroughEvidence.lifecycle.activeCommandCount, 4);
assert.equal(userWalkthroughEvidence.lifecycle.committedDatasetVersion, 1);
assert.equal(userWalkthroughEvidence.lifecycle.committedEntityCount, 21);
assert.equal(userWalkthroughEvidence.lifecycle.persistedDraftCleared, true);
assert.equal(userWalkthroughEvidence.lifecycle.reopenedRouteLengthMm, 250);

const operationsStatus = normalizeStatus(
  process.env.TOPOLOGY_EDIT_WAVE5_OPERATIONS_STATUS || 'BLOCKED_NOT_RUN',
);
const browserStatus = normalizeStatus(browserEvidence.status);
const performanceEvidence = {
  status: operationsStatus === 'PASS' && browserStatus === 'PASS'
    ? 'PASS'
    : `BLOCKED_OPERATIONS_${operationsStatus}_BROWSER_${browserStatus}`,
  operationCoverage: [
    'CHECKER_DETECTION',
    'CERTIFIED_AUTOFIX_PREVIEW_ACCEPT_CANCEL',
    'JOURNAL_UNDO_REDO_REPLAY',
    'REAL_DEMO_EXACT_GAP_3_20',
    'REAL_DEMO_BRIDGE_250',
    'REAL_DEMO_SOURCE_BACKED_TRIM_150',
    'DRAFT_SAVE_RELOAD',
    'PREPARED_STAGED_JSON_EXPORT',
    'WORKSPACE_COMMIT_READBACK',
    'WORKSPACE_REOPEN_ROUTE_TRACE',
    'ROLLBACK_AND_INVALIDATION',
    'C3D_PRESENTATION_SEARCH_REVIEW_COMPARISON_ROUTE_DOSSIER_INTAKE_RESPONSE',
  ],
  browserMetrics: browserStatus === 'PASS' ? {
    firstValidFrameMs: browserEvidence.firstValidFrameMs,
    pickP95Ms: browserEvidence.pick?.p95 ?? null,
    frameP95Ms: browserEvidence.navigationFrame?.p95 ?? null,
  } : null,
};
const driftEvidence = {
  status: normalizeStatus(process.env.TOPOLOGY_EDIT_WAVE5_DRIFT_STATUS || 'BLOCKED_NOT_RUN'),
};
const releaseReceipt = createTopologyEditWave5ReleaseReceipt({
  candidateHead,
  expectedHead,
  prerequisites,
  performanceEvidence,
  browserEvidence,
  fixtureEvidence,
  driftEvidence,
});
assert.equal(releaseReceipt.status, 'PASS_RELEASE', JSON.stringify(releaseReceipt, null, 2));

const qualifiedFiles = unique([
  ...QUALIFIED_FILES,
  ...(Array.isArray(originalPlanAudit.qualifiedFiles)
    ? originalPlanAudit.qualifiedFiles
    : []),
]);
const fileHashes = {};
for (const repositoryPath of qualifiedFiles) {
  fileHashes[repositoryPath] = sha256(await readFile(path.join(ROOT, repositoryPath)));
}
const evidenceBase = {
  schema: 'TopologyEditWave5QualificationEvidence.v4',
  status: 'PASS_RELEASE',
  candidateHead,
  expectedHead,
  releaseReceipt,
  originalPlanAudit,
  browserEvidence,
  fixtureEvidence,
  userWalkthroughEvidence,
  performanceEvidence,
  driftEvidence,
  qualifiedFiles,
  fileHashes,
};
const evidence = {
  ...evidenceBase,
  evidenceSha256: sha256(Buffer.from(JSON.stringify(canonicalize(evidenceBase)))),
};
await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`Topology Edit Wave 5 evidence written for ${candidateHead}: ${evidence.status}.`);

async function readJsonOrBlocked(filePath, reason) {
  try { return JSON.parse(await readFile(filePath, 'utf8')); }
  catch { return { status: `BLOCKED_${reason}` }; }
}
async function readRequiredWalkthrough(filePath, status, head) {
  const report = JSON.parse(await readFile(filePath, 'utf8'));
  assert.equal(report.status, status, JSON.stringify(report, null, 2));
  assert.equal(report.candidateHead, head, `${path.basename(filePath)} is not exact-head bound.`);
  return report;
}
function normalizeStatus(value) {
  const status = String(value ?? 'BLOCKED').toUpperCase();
  if (status.startsWith('PASS')) return 'PASS';
  if (status.startsWith('FAIL')) return 'FAIL';
  return 'BLOCKED';
}
function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}
function gitStatus(args) {
  try { execFileSync('git', args, { cwd: ROOT, stdio: 'ignore' }); return true; }
  catch { return false; }
}
function unique(values) {
  return [...new Set(values)].sort();
}
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}
