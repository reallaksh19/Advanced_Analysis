import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  buildEnrichmentUiFixture,
  calculateFixtureSemanticHash,
} from './enrichment-ui-phase0-fixtures.mjs';
import {
  applyFilter,
  buildEnrichmentUiIndexes,
  buildExceptionQueues,
  buildGroups,
  buildVisibleOrder,
  materializeViewport,
} from './enrichment-ui-phase0-indexes.mjs';
import {
  captureAuthorityHashes,
  compareAuthorityHashes,
  createGuardedDom,
  createGuardedEventTarget,
  createGuardedProjectData,
  createGuardedStorage,
  expectFailure,
  fail,
  readonlyProxy,
} from './enrichment-ui-phase0-qualification-helpers.mjs';

const REPOSITORY_ROOT = process.env.ENRICHMENT_UI_PHASE0_CHECK_ROOT
  ? path.resolve(process.env.ENRICHMENT_UI_PHASE0_CHECK_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const protectedPaths = [
  'scripts/enrichment-ui-phase0-fixtures.mjs',
  'scripts/enrichment-ui-phase0-indexes.mjs',
  'src/workspace/lfea-preflight-ui.js',
  'src/workspace/master-data-controller.js',
  'src/workspace/project-data/project-data-store.js',
].filter((relativePath) => fs.existsSync(path.join(REPOSITORY_ROOT, relativePath)));

const domState = Object.freeze({
  rootId: 'preflight-root',
  childCount: 0,
  inputs: Object.freeze([]),
});
const projectDataSnapshot = Object.freeze({
  profile: Object.freeze({ schema: 'SyntheticProjectData.v1', values: Object.freeze({}) }),
  origin: Object.freeze({ kind: 'TEST_SNAPSHOT', semanticHash: 'synthetic' }),
});
const sharedModelSnapshot = Object.freeze({
  modelId: 'synthetic-model',
  components: Object.freeze([{ id: 'C-1' }]),
  supports: Object.freeze([{ id: 'S-1' }]),
});
const masterDataSnapshot = Object.freeze({
  lineList: Object.freeze({ normalizedRows: Object.freeze([]) }),
  pipingClass: Object.freeze({ normalizedRows: Object.freeze([]) }),
});

const local = createGuardedStorage({ masterDataConfigV1: '{"version":1}' });
const session = createGuardedStorage({ activeTab: 'preflight' });
const dom = createGuardedDom();
const events = createGuardedEventTarget();
const guardedProjectData = createGuardedProjectData(projectDataSnapshot.profile, projectDataSnapshot.origin);
const guardedSharedModel = readonlyProxy(sharedModelSnapshot, 'SHARED_MODEL');
const guardedMasterData = readonlyProxy(masterDataSnapshot, 'MASTER_DATA');

const before = captureAuthorityHashes({
  domState,
  localStorage: local.storage.snapshot(),
  sessionStorage: session.storage.snapshot(),
  projectData: projectDataSnapshot,
  sharedModel: sharedModelSnapshot,
  masterData: masterDataSnapshot,
  sourceFiles: hashProtectedFiles(protectedPaths),
  eventLog: events.emitted,
});

const restoreGlobals = installGlobalGuards({
  localStorage: local.storage,
  sessionStorage: session.storage,
  document: dom.document,
  window: events,
});

let validEvidence;
try {
  assert.equal(guardedProjectData.getProfile().schema, 'SyntheticProjectData.v1');
  assert.equal(guardedSharedModel.supports.length, 1);
  assert.equal(guardedMasterData.lineList.normalizedRows.length, 0);

  const fixture = buildEnrichmentUiFixture('small');
  const fixtureHashBefore = calculateFixtureSemanticHash(fixture);
  const guardedFixture = readonlyProxy(fixture, 'FIXTURE');
  const indexes = buildEnrichmentUiIndexes(guardedFixture);
  const groups = buildGroups(indexes, guardedFixture);
  const filtered = applyFilter(indexes, { serviceIds: [0, 1], lineFlags: [] });
  const visibleOrder = buildVisibleOrder(filtered.ordinals, guardedFixture, [
    { fieldId: 'serviceId', direction: 'asc' },
    { fieldId: 'normalizedLineKey', direction: 'asc' },
  ]);
  const queues = buildExceptionQueues(indexes, guardedFixture);
  const viewport = materializeViewport({ fixture: guardedFixture, indexes, visibleOrder });
  assert.equal(calculateFixtureSemanticHash(fixture), fixtureHashBefore, 'E_QF_FIXTURE_HASH_CHANGED');
  validEvidence = {
    fixtureSemanticHash: fixture.semanticHash,
    indexStructuralDigest: indexes.structuralDigest,
    groupDigest: groups.digest,
    filterDigest: filtered.digest,
    queueDigest: queues.digest,
    viewportDigest: viewport.digest,
    materializedLineRows: viewport.materializedLineRows,
    materializedComponentRows: viewport.materializedComponentRows,
  };
} finally {
  restoreGlobals();
}

const after = captureAuthorityHashes({
  domState,
  localStorage: local.storage.snapshot(),
  sessionStorage: session.storage.snapshot(),
  projectData: projectDataSnapshot,
  sharedModel: sharedModelSnapshot,
  masterData: masterDataSnapshot,
  sourceFiles: hashProtectedFiles(protectedPaths),
  eventLog: events.emitted,
});

assert.equal(compareAuthorityHashes(before, after), true);
assert.equal(local.calls.length, 0, 'E_QF_STORAGE_ACCESS');
assert.equal(session.calls.length, 0, 'E_QF_STORAGE_ACCESS');
assert.equal(dom.calls.length, 0, 'E_QF_DOM_ACCESS');
assert.equal(events.emitted.length, 0, 'E_QF_EVENT_EMITTED');
assert.equal(validEvidence.materializedComponentRows, 0, 'E_QF_EAGER_COMPONENT_ROWS');

await expectFailure('E_QF_STORAGE_WRITE', () => local.storage.setItem('engineeringOverride', '1'));
await expectFailure('E_QF_PROJECT_DATA_API_CALL', () => guardedProjectData.update('process.designPressureKpaG', 1200));
await expectFailure('E_QF_FIXTURE_MUTATION', () => {
  const fixture = readonlyProxy(buildEnrichmentUiFixture('small'), 'FIXTURE');
  fixture.lines.flagsByOrdinal[0] = 255;
});
await expectFailure('E_QF_SHARED_MODEL_MUTATION', () => guardedSharedModel.supports.push({ id: 'S-2' }));
await expectFailure('E_QF_MASTER_DATA_MUTATION', () => guardedMasterData.lineList.normalizedRows.push({ lineKey: 'X' }));
await expectFailure('E_QF_TOPOLOGY_EVENT', () => events.dispatchEvent({ type: 'topology:rebuild-requested' }));
await expectFailure('E_QF_VIEWPORT_EVENT', () => events.dispatchEvent({ type: 'viewport:render-autofix-overlays' }));
await expectFailure('E_QF_DOM_MUTATION', () => dom.document.createElement('tr'));
await expectFailure('E_QF_SOURCE_FILE_WRITE', () => guardedWriteFile(path.join(REPOSITORY_ROOT, 'src/workspace/lfea-preflight-ui.js'), 'changed'));

console.log(JSON.stringify({
  check: 'enrichment-ui-phase0-containment',
  status: 'PASS',
  repositoryRoot: REPOSITORY_ROOT,
  protectedPaths,
  authorityHashes: before,
  validEvidence,
  negativeTests: [
    'E_QF_STORAGE_WRITE',
    'E_QF_PROJECT_DATA_API_CALL',
    'E_QF_FIXTURE_MUTATION',
    'E_QF_SHARED_MODEL_MUTATION',
    'E_QF_MASTER_DATA_MUTATION',
    'E_QF_TOPOLOGY_EVENT',
    'E_QF_VIEWPORT_EVENT',
    'E_QF_DOM_MUTATION',
    'E_QF_SOURCE_FILE_WRITE',
  ],
}));

function installGlobalGuards(values) {
  const originals = new Map();
  for (const [key, value] of Object.entries(values)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    originals.set(key, descriptor);
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: false,
      enumerable: false,
    });
  }
  return () => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  };
}

function hashProtectedFiles(relativePaths) {
  return Object.freeze(relativePaths.map((relativePath) => {
    const absolutePath = path.join(REPOSITORY_ROOT, relativePath);
    const bytes = fs.readFileSync(absolutePath);
    return Object.freeze({
      path: relativePath,
      byteLength: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }));
}

function guardedWriteFile(targetPath, _content) {
  const absoluteTarget = path.resolve(targetPath);
  const temporaryEvidenceRoot = path.join(REPOSITORY_ROOT, '.tmp', 'enrichment-ui-phase0-evidence');
  if (!absoluteTarget.startsWith(`${temporaryEvidenceRoot}${path.sep}`)) {
    fail('E_QF_SOURCE_FILE_WRITE', { targetPath: absoluteTarget });
  }
}
