import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import {
  createTopologyEditReviewDossier,
} from '../src/workspace/viewport-productivity/topology-edit-review-dossier.js';
import {
  reconcileTopologyEditReviewDossier,
} from '../src/workspace/viewport-productivity/topology-edit-review-dossier-intake.js';
import {
  createTopologyEditReviewResponse,
  parseTopologyEditReviewResponseJson,
  TOPOLOGY_EDIT_REVIEW_RESPONSE_MAX_BYTES,
  TOPOLOGY_EDIT_REVIEW_RESPONSE_NOTE_MAX_CHARS,
  topologyEditReviewResponseFilename,
  topologyEditReviewResponseJson,
} from '../src/workspace/viewport-productivity/topology-edit-review-response.js';
import {
  reconcileTopologyEditReviewResponse,
} from '../src/workspace/viewport-productivity/topology-edit-review-response-intake.js';
import {
  readTopologyEditReviewResponseFile,
} from '../src/workspace/viewport-productivity/topology-edit-review-response-io.js';
import {
  topologyEditReviewResponseMarkup,
} from '../src/workspace/viewport-productivity/topology-edit-review-response-panel.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function basis(overrides = {}) {
  return {
    sourceHash: 'source:1',
    baseCanonicalHash: 'base:1',
    draftCanonicalHash: 'draft:1',
    visualModelHash: 'visual:1',
    scopeHash: 'scope:1',
    ...overrides,
  };
}

function camera() {
  return {
    projection: 'PERSPECTIVE',
    position: { x: 10, y: 20, z: 30 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
    up: { x: 0, y: 1, z: 0 },
    near: 0.1,
    far: 10000,
    zoom: 1,
    fov: 50,
  };
}

function dossier(overrides = {}) {
  const reviewBasis = overrides.basis ?? basis();
  return createTopologyEditReviewDossier({
    basis: reviewBasis,
    camera: camera(),
    presentationState: { presentationHash: 'presentation:1', basis: reviewBasis },
    selection: { nodeIds: ['node:a'], edgeId: 'edge:ab' },
    bookmarks: [],
    provenance: { entries: [], provenanceHash: 'provenance:1' },
    comparison: { entries: [], changedCanonicalIds: [], comparisonHash: 'comparison:1' },
    issueOverlay: {
      entries: [
        {
          issueId: 'issue:1', kind: 'GAP', severity: 'HIGH', message: 'Gap <review>',
          canonicalIds: ['node:a', 'edge:ab'], suggestionHash: 'suggestion:1', commandType: 'BRIDGE_GAP',
        },
        {
          issueId: 'issue:2', kind: 'OVERLAP', severity: 'MEDIUM', message: 'Overlap',
          canonicalIds: ['node:b'], suggestionHash: null, commandType: null,
        },
      ],
      overlayHash: 'overlay:1',
    },
    inspection: null,
    routeTrace: null,
    visualDiagnostics: [],
  });
}

function topology() {
  return {
    canonicalTopologyHash: 'draft:1',
    nodes: [
      { id: 'node:a', position: { x: 0, y: 0, z: 0 } },
      { id: 'node:b', position: { x: 3, y: 4, z: 0 } },
    ],
    edges: [{ id: 'edge:ab', fromNodeId: 'node:a', toNodeId: 'node:b' }],
    supports: [],
    junctions: [],
  };
}

function dossierIntake(value = dossier()) {
  return reconcileTopologyEditReviewDossier({
    dossier: value,
    currentBasis: basis(),
    canonicalTopology: topology(),
    currentEvidenceHashes: {},
  });
}

function response(rows = [
  { issueId: 'issue:1', disposition: 'ACKNOWLEDGED', note: 'Reviewed.' },
]) {
  const source = dossier();
  return createTopologyEditReviewResponse({
    dossier: source,
    intake: dossierIntake(source),
    responderBasis: basis(),
    responses: rows,
  });
}

function rehash(value) {
  const clone = structuredClone(value);
  delete clone.responseHash;
  return { ...clone, responseHash: semanticHash(clone) };
}

test('creates deterministic exact-issue response packages', () => {
  const source = dossier();
  const intake = dossierIntake(source);
  const left = createTopologyEditReviewResponse({
    dossier: source,
    intake,
    responderBasis: basis(),
    responses: [
      { issueId: 'issue:2', disposition: 'DEFERRED', note: 'Later' },
      { issueId: 'issue:1', disposition: 'CONTESTED', note: 'Check basis' },
    ],
  });
  const right = createTopologyEditReviewResponse({
    dossier: source,
    intake,
    responderBasis: basis(),
    responses: [...left.responses].reverse(),
  });
  assert.equal(left.responseHash, right.responseHash);
  assert.deepEqual(left.responses.map((row) => row.issueId), ['issue:1', 'issue:2']);
  assert.deepEqual(left.responses[0].canonicalIds, ['edge:ab', 'node:a']);
  assert.equal(left.releaseQualified, false);
});

test('rejects unknown, duplicate, unsupported and oversized authored responses', () => {
  const source = dossier();
  const input = { dossier: source, intake: dossierIntake(source), responderBasis: basis() };
  assert.throws(
    () => createTopologyEditReviewResponse({ ...input, responses: [
      { issueId: 'issue:missing', disposition: 'ACKNOWLEDGED' },
    ] }),
    /unknown dossier issue/,
  );
  assert.throws(
    () => createTopologyEditReviewResponse({ ...input, responses: [
      { issueId: 'issue:1', disposition: 'ACKNOWLEDGED' },
      { issueId: 'issue:1', disposition: 'DEFERRED' },
    ] }),
    /Duplicate/,
  );
  assert.throws(
    () => createTopologyEditReviewResponse({ ...input, responses: [
      { issueId: 'issue:1', disposition: 'APPROVED' },
    ] }),
    /Unsupported/,
  );
  assert.throws(
    () => createTopologyEditReviewResponse({ ...input, responses: [
      { issueId: 'issue:1', disposition: 'ACKNOWLEDGED', note: 'x'.repeat(TOPOLOGY_EDIT_REVIEW_RESPONSE_NOTE_MAX_CHARS + 1) },
    ] }),
    /exceeds/,
  );
});

test('exports, parses and names deterministic response JSON', () => {
  const value = response();
  const text = topologyEditReviewResponseJson(value);
  const parsed = parseTopologyEditReviewResponseJson(text, {
    byteLength: new TextEncoder().encode(text).length,
  });
  assert.equal(parsed.responseHash, value.responseHash);
  assert.equal(topologyEditReviewResponseFilename(value), `topology-edit-review-response-${value.responseHash.slice(0, 16)}.json`);
  assert.equal(text.endsWith('\n'), true);
});

test('rejects malformed, oversized, unsupported and tampered response JSON', () => {
  assert.throws(() => parseTopologyEditReviewResponseJson('{bad'), /malformed/);
  assert.throws(
    () => parseTopologyEditReviewResponseJson('{}', { byteLength: TOPOLOGY_EDIT_REVIEW_RESPONSE_MAX_BYTES + 1 }),
    /exceeds/,
  );
  assert.throws(
    () => parseTopologyEditReviewResponseJson(JSON.stringify({ schema: 'Other.v1' })),
    /TopologyEditReviewResponse\.v1/,
  );
  const tampered = structuredClone(response());
  tampered.responses[0].note = 'Changed';
  assert.throws(() => parseTopologyEditReviewResponseJson(JSON.stringify(tampered)), /hash mismatch/);
});

test('reconciles matching dossier, issue evidence, basis and exact coverage', () => {
  const source = dossier();
  const value = createTopologyEditReviewResponse({
    dossier: source,
    intake: dossierIntake(source),
    responderBasis: basis(),
    responses: [
      { issueId: 'issue:1', disposition: 'CURRENT_DRAFT_CHANGED', note: 'Draft changed; not certified.' },
      { issueId: 'issue:2', disposition: 'ACKNOWLEDGED', note: '' },
    ],
  });
  const intake = reconcileTopologyEditReviewResponse({
    response: value,
    dossier: source,
    currentBasis: basis(),
    canonicalTopology: topology(),
  });
  assert.equal(intake.dossierStatus, 'MATCH');
  assert.equal(intake.responseStatus, 'MATCH');
  assert.equal(intake.basisStatus, 'CURRENT');
  assert.equal(intake.coverageStatus, 'COMPLETE');
  assert.deepEqual(intake.availableCanonicalIds, ['edge:ab', 'node:a', 'node:b']);
  assert.equal(intake.focusEligible, true);
  assert.equal(intake.releaseQualified, false);
});

test('classifies dossier mismatch, issue drift, basis drift and missing coverage', () => {
  const source = dossier();
  const value = createTopologyEditReviewResponse({
    dossier: source,
    intake: dossierIntake(source),
    responderBasis: basis(),
    responses: [{ issueId: 'issue:1', disposition: 'CONTESTED', note: '' }],
  });
  const other = dossier({ basis: basis({ scopeHash: 'scope:other' }) });
  const mismatch = reconcileTopologyEditReviewResponse({
    response: value, dossier: other, currentBasis: basis(), canonicalTopology: topology(),
  });
  assert.equal(mismatch.dossierStatus, 'MISMATCH');
  assert.equal(mismatch.responseStatus, 'DOSSIER_MISMATCH');

  const driftedValue = structuredClone(value);
  driftedValue.responses[0].issueEvidenceHash = 'issue:evidence:other';
  const drift = reconcileTopologyEditReviewResponse({
    response: rehash(driftedValue), dossier: source,
    currentBasis: basis({ draftCanonicalHash: 'draft:other' }),
    canonicalTopology: { ...topology(), edges: [] },
  });
  assert.equal(drift.responseStatus, 'ISSUE_SET_DRIFT');
  assert.deepEqual(drift.driftedIssueIds, ['issue:1']);
  assert.equal(drift.basisStatus, 'STALE_BASIS');
  assert.equal(drift.coverageStatus, 'PARTIAL');
  assert.deepEqual(drift.missingCanonicalIds, ['edge:ab']);
});

test('rejects recomputed unknown issue identities without retargeting', () => {
  const value = structuredClone(response());
  value.responses[0].issueId = 'issue:unknown';
  assert.throws(
    () => reconcileTopologyEditReviewResponse({
      response: rehash(value),
      dossier: dossier(),
      currentBasis: basis(),
      canonicalTopology: topology(),
    }),
    /unknown exact dossier issue IDs/,
  );
});

test('reads a bounded local response file without network or workspace effects', async () => {
  const value = response();
  const text = topologyEditReviewResponseJson(value);
  const parsed = await readTopologyEditReviewResponseFile({
    size: new TextEncoder().encode(text).length,
    text: async () => text,
  });
  assert.equal(parsed.responseHash, value.responseHash);
  await assert.rejects(
    readTopologyEditReviewResponseFile({ size: TOPOLOGY_EDIT_REVIEW_RESPONSE_MAX_BYTES + 1, text: async () => text }),
    /exceeds/,
  );
});

test('panel escapes issue, note and file identities and exposes bounded controls', () => {
  const source = dossier();
  const value = createTopologyEditReviewResponse({
    dossier: source,
    intake: dossierIntake(source),
    responderBasis: basis(),
    responses: [{ issueId: 'issue:1', disposition: 'ACKNOWLEDGED', note: '<note>' }],
  });
  const intake = reconcileTopologyEditReviewResponse({
    response: value, dossier: source, currentBasis: basis(), canonicalTopology: topology(),
  });
  const markup = topologyEditReviewResponseMarkup({
    dossier: source, response: value, intake, fileName: '<response>.json', selectedIssueId: 'issue:1',
  });
  assert.match(markup, /data-action="choose-review-response"/);
  assert.match(markup, /data-action="download-review-response"/);
  assert.match(markup, /data-action="save-review-response"/);
  assert.match(markup, /maxlength="2000"/);
  assert.match(markup, /&lt;note&gt;/);
  assert.match(markup, /&lt;response&gt;\.json/);
  assert.doesNotMatch(markup, /<note>/);
});

test('production composition remains session-only, exact-ID based and non-authoritative', async () => {
  const files = [
    'src/workspace/load-calc-consumer-controller.js',
    'src/workspace/topology-edit-3d-review-response-controller.js',
    'src/workspace/viewport-productivity/topology-edit-review-response.js',
    'src/workspace/viewport-productivity/topology-edit-review-response-intake.js',
    'src/workspace/viewport-productivity/topology-edit-review-response-io.js',
    'src/workspace/viewport-productivity/topology-edit-review-response-panel.js',
  ];
  const [consumer, controller, model, intake, io, panel] = await Promise.all(
    files.map((file) => readFile(path.join(ROOT, file), 'utf8')),
  );
  assert.match(consumer, /topology-edit-3d-review-response-controller\.js/);
  assert.match(controller, /topology-edit-3d-dossier-intake-controller\.js/);
  assert.match(controller, /focusCanonicalIds/);
  assert.match(model, /DISPLAY_REVIEW_RESPONSE_ONLY/);
  assert.match(intake, /UNKNOWN_ISSUE/);
  assert.match(io, /file\.text\(\)/);
  assert.match(panel, /Review response round trip/);
  const combined = [controller, model, intake, io, panel].join('\n');
  for (const prohibited of [
    'WorkspaceState.', 'createTopologyEditCommandIntent', 'previewAutofix(',
    'acceptAutofix(', 'commitToWorkspace(', 'exportTopologyEditAudit(',
    'resolveIssue(', 'approveEngineering(', 'nearestNeighbor', 'raycast(',
    'screenX', 'screenY', 'mesh.name',
  ]) {
    assert.equal(combined.includes(prohibited), false, `response workflow must not use ${prohibited}`);
  }
});
