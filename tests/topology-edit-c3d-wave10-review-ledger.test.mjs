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
} from '../src/workspace/viewport-productivity/topology-edit-review-response.js';
import {
  createTopologyEditReviewResponseLedger,
  parseTopologyEditReviewResponseLedgerJson,
  TOPOLOGY_EDIT_REVIEW_RESPONSE_LEDGER_MAX_BYTES,
  topologyEditReviewResponseLedgerFilename,
  topologyEditReviewResponseLedgerJson,
} from '../src/workspace/viewport-productivity/topology-edit-review-response-ledger.js';
import {
  reconcileTopologyEditReviewResponseLedger,
} from '../src/workspace/viewport-productivity/topology-edit-review-response-ledger-intake.js';
import {
  readTopologyEditReviewResponseLedgerFile,
} from '../src/workspace/viewport-productivity/topology-edit-review-response-ledger-io.js';
import {
  topologyEditReviewResponseLedgerMarkup,
} from '../src/workspace/viewport-productivity/topology-edit-review-response-ledger-panel.js';

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

function dossier({ reviewBasis = basis(), message = 'Gap <review>' } = {}) {
  return createTopologyEditReviewDossier({
    basis: reviewBasis,
    camera: camera(),
    presentationState: { presentationHash: 'presentation:1', basis: reviewBasis },
    selection: { nodeIds: ['node:a'], edgeId: null },
    bookmarks: [],
    provenance: { entries: [], provenanceHash: 'provenance:1' },
    comparison: { entries: [], changedCanonicalIds: [], comparisonHash: 'comparison:1' },
    issueOverlay: {
      entries: [
        {
          issueId: 'issue:1', kind: 'GAP', severity: 'HIGH', message,
          canonicalIds: ['node:a', 'edge:ab'], suggestionHash: 'suggestion:1', commandType: 'BRIDGE_GAP',
        },
        {
          issueId: 'issue:2', kind: 'OVERLAP', severity: 'MEDIUM', message: 'Overlap',
          canonicalIds: ['node:b'], suggestionHash: null, commandType: null,
        },
        {
          issueId: 'issue:3', kind: 'SUPPORT', severity: 'LOW', message: 'Review support',
          canonicalIds: ['node:c'], suggestionHash: null, commandType: null,
        },
      ],
      overlayHash: 'overlay:1',
    },
    inspection: null,
    routeTrace: null,
    visualDiagnostics: [],
  });
}

function topology({ includeEdge = true, includeNodeC = true } = {}) {
  return {
    canonicalTopologyHash: 'draft:1',
    nodes: [
      { id: 'node:a', position: { x: 0, y: 0, z: 0 } },
      { id: 'node:b', position: { x: 3, y: 4, z: 0 } },
      ...(includeNodeC ? [{ id: 'node:c', position: { x: 5, y: 0, z: 0 } }] : []),
    ],
    edges: includeEdge ? [{ id: 'edge:ab', fromNodeId: 'node:a', toNodeId: 'node:b' }] : [],
    supports: [],
    junctions: [],
  };
}

function response(source, rows, responderBasis = basis()) {
  const intake = reconcileTopologyEditReviewDossier({
    dossier: source,
    currentBasis: basis(),
    canonicalTopology: topology(),
    currentEvidenceHashes: {},
  });
  return createTopologyEditReviewResponse({
    dossier: source,
    intake,
    responderBasis,
    responses: rows,
  });
}

function responseA(source = dossier()) {
  return response(source, [
    { issueId: 'issue:1', disposition: 'ACKNOWLEDGED', note: 'Reviewed A.' },
    { issueId: 'issue:2', disposition: 'DEFERRED', note: 'Check later.' },
  ]);
}

function responseB(source = dossier()) {
  return response(source, [
    { issueId: 'issue:1', disposition: 'CONTESTED', note: 'Different interpretation.' },
    { issueId: 'issue:2', disposition: 'DEFERRED', note: 'Still deferred.' },
  ], basis({ draftCanonicalHash: 'draft:older' }));
}

function ledger(source = dossier(), responses = [responseA(source), responseB(source)]) {
  return createTopologyEditReviewResponseLedger({
    dossier: source,
    currentBasis: basis(),
    canonicalTopology: topology(),
    responses,
  });
}

function rehashLedger(value) {
  const clone = structuredClone(value);
  delete clone.ledgerHash;
  return { ...clone, ledgerHash: semanticHash(clone) };
}

test('creates deterministic ledgers under reordered response packages', () => {
  const source = dossier();
  const left = ledger(source, [responseB(source), responseA(source)]);
  const right = ledger(source, [responseA(source), responseB(source)]);
  assert.equal(left.ledgerHash, right.ledgerHash);
  assert.deepEqual(
    left.packages.map((entry) => entry.response.responseHash),
    [...left.packages.map((entry) => entry.response.responseHash)].sort(),
  );
  assert.equal(left.summary.packageCount, 2);
  assert.equal(left.releaseQualified, false);
});

test('classifies conflicting, consistent and unanswered exact dossier issues', () => {
  const value = ledger();
  const matrix = Object.fromEntries(value.issueMatrix.map((row) => [row.issueId, row]));
  assert.equal(matrix['issue:1'].status, 'CONFLICTING');
  assert.deepEqual(matrix['issue:1'].dispositions, ['ACKNOWLEDGED', 'CONTESTED']);
  assert.equal(matrix['issue:2'].status, 'CONSISTENT');
  assert.deepEqual(matrix['issue:2'].dispositions, ['DEFERRED']);
  assert.equal(matrix['issue:3'].status, 'UNANSWERED');
  assert.deepEqual(value.conflictingIssueIds, ['issue:1']);
  assert.equal(value.summary.answeredIssueCount, 2);
});

test('rejects duplicate and cross-dossier response packages', () => {
  const source = dossier();
  const first = responseA(source);
  assert.throws(
    () => createTopologyEditReviewResponseLedger({
      dossier: source,
      currentBasis: basis(),
      canonicalTopology: topology(),
      responses: [first, first],
    }),
    /Duplicate review response package/,
  );
  const other = dossier({ reviewBasis: basis({ scopeHash: 'scope:other' }) });
  assert.throws(
    () => createTopologyEditReviewResponseLedger({
      dossier: source,
      currentBasis: basis(),
      canonicalTopology: topology(),
      responses: [responseA(other)],
    }),
    /binds another dossier/,
  );
});

test('exports, parses and names deterministic ledger JSON', () => {
  const value = ledger();
  const text = topologyEditReviewResponseLedgerJson(value);
  const parsed = parseTopologyEditReviewResponseLedgerJson(text, {
    byteLength: new TextEncoder().encode(text).length,
  });
  assert.equal(parsed.ledgerHash, value.ledgerHash);
  assert.equal(
    topologyEditReviewResponseLedgerFilename(value),
    `topology-edit-review-ledger-${value.ledgerHash.slice(0, 16)}.json`,
  );
  assert.equal(text.endsWith('\n'), true);
});

test('rejects malformed, oversized, unsupported and tampered ledgers', () => {
  assert.throws(() => parseTopologyEditReviewResponseLedgerJson('{bad'), /malformed/);
  assert.throws(
    () => parseTopologyEditReviewResponseLedgerJson('{}', {
      byteLength: TOPOLOGY_EDIT_REVIEW_RESPONSE_LEDGER_MAX_BYTES + 1,
    }),
    /exceeds/,
  );
  assert.throws(
    () => parseTopologyEditReviewResponseLedgerJson(JSON.stringify({ schema: 'Other.v1' })),
    /TopologyEditReviewResponseLedger\.v1/,
  );
  const tampered = structuredClone(ledger());
  tampered.summary.packageCount = 99;
  assert.throws(
    () => parseTopologyEditReviewResponseLedgerJson(JSON.stringify(tampered)),
    /summary does not match|hash mismatch/,
  );
  const recomputed = structuredClone(ledger());
  recomputed.issueMatrix[0].status = 'CONSISTENT';
  assert.throws(
    () => parseTopologyEditReviewResponseLedgerJson(JSON.stringify(rehashLedger(recomputed))),
    /issue matrix does not match/,
  );
});

test('rejects recomputed ledgers detached from exact issue evidence', () => {
  const detached = structuredClone(ledger());
  detached.dossierIssues[0].issueEvidenceHash = 'issue:evidence:detached';
  assert.throws(
    () => parseTopologyEditReviewResponseLedgerJson(JSON.stringify(rehashLedger(detached))),
    /issue evidence mismatch/,
  );
});

test('reconciles dossier, issue evidence, basis, coverage and conflict focus', () => {
  const source = dossier();
  const value = ledger(source);
  const intake = reconcileTopologyEditReviewResponseLedger({
    ledger: value,
    dossier: source,
    currentBasis: basis(),
    canonicalTopology: topology(),
  });
  assert.equal(intake.dossierStatus, 'MATCH');
  assert.equal(intake.issueSetStatus, 'MATCH');
  assert.equal(intake.coverageStatus, 'COMPLETE');
  assert.equal(intake.summary.currentBasisPackageCount, 1);
  assert.equal(intake.summary.staleBasisPackageCount, 1);
  assert.deepEqual(intake.availableConflictCanonicalIds, ['edge:ab', 'node:a']);
  assert.equal(intake.conflictFocusEligible, true);
  assert.equal(intake.releaseQualified, false);
});

test('classifies dossier mismatch, issue-set drift and missing canonical coverage', () => {
  const source = dossier();
  const value = ledger(source);
  const changed = dossier({ message: 'Changed gap evidence' });
  const intake = reconcileTopologyEditReviewResponseLedger({
    ledger: value,
    dossier: changed,
    currentBasis: basis({ draftCanonicalHash: 'draft:new' }),
    canonicalTopology: topology({ includeEdge: false }),
  });
  assert.equal(intake.dossierStatus, 'MISMATCH');
  assert.equal(intake.issueSetStatus, 'ISSUE_SET_DRIFT');
  assert.deepEqual(intake.driftedIssueIds, ['issue:1']);
  assert.equal(intake.coverageStatus, 'PARTIAL');
  assert.deepEqual(intake.missingCanonicalIds, ['edge:ab']);
});

test('reads a bounded local ledger file', async () => {
  const value = ledger();
  const text = topologyEditReviewResponseLedgerJson(value);
  const parsed = await readTopologyEditReviewResponseLedgerFile({
    size: new TextEncoder().encode(text).length,
    text: async () => text,
  });
  assert.equal(parsed.ledgerHash, value.ledgerHash);
  await assert.rejects(
    readTopologyEditReviewResponseLedgerFile({
      size: TOPOLOGY_EDIT_REVIEW_RESPONSE_LEDGER_MAX_BYTES + 1,
      text: async () => text,
    }),
    /exceeds/,
  );
});

test('panel escapes file identity and exposes bounded controls', () => {
  const source = dossier();
  const value = ledger(source, [response(source, [
    { issueId: 'issue:1', disposition: 'CONTESTED', note: '<note>' },
  ])]);
  const intake = reconcileTopologyEditReviewResponseLedger({
    ledger: value,
    dossier: source,
    currentBasis: basis(),
    canonicalTopology: topology(),
  });
  const markup = topologyEditReviewResponseLedgerMarkup({
    ledger: value,
    intake,
    fileName: '<ledger>.json',
    currentResponseHash: value.packages[0].response.responseHash,
  });
  assert.match(markup, /data-action="add-review-ledger-response"/);
  assert.match(markup, /data-action="choose-review-ledger"/);
  assert.match(markup, /data-action="download-review-ledger"/);
  assert.match(markup, /data-action="focus-review-ledger-conflicts"/);
  assert.match(markup, /data-action="remove-review-ledger-response"/);
  assert.match(markup, /&lt;ledger&gt;\.json/);
  assert.doesNotMatch(markup, /<ledger>/);
});

test('standalone composition remains exact-ID, display-only and integration-deferred', async () => {
  const files = [
    'src/workspace/load-calc-consumer-controller.js',
    'src/workspace/topology-edit-3d-review-ledger-controller.js',
    'src/workspace/viewport-productivity/topology-edit-review-response-ledger.js',
    'src/workspace/viewport-productivity/topology-edit-review-response-ledger-intake.js',
    'src/workspace/viewport-productivity/topology-edit-review-response-ledger-io.js',
    'src/workspace/viewport-productivity/topology-edit-review-response-ledger-panel.js',
  ];
  const [consumer, controller, model, intake, io, panel] = await Promise.all(
    files.map((file) => readFile(path.join(ROOT, file), 'utf8')),
  );
  assert.match(consumer, /topology-edit-3d-review-response-controller\.js/);
  assert.doesNotMatch(consumer, /topology-edit-3d-review-ledger-controller\.js/);
  assert.match(controller, /topology-edit-3d-review-response-controller\.js/);
  assert.match(controller, /focusCanonicalIds/);
  assert.match(model, /DISPLAY_REVIEW_RESPONSE_LEDGER_ONLY/);
  assert.match(intake, /ISSUE_SET_DRIFT/);
  assert.match(io, /file\.text\(\)/);
  assert.match(panel, /Multi-response review ledger/);
  const combined = [controller, model, intake, io, panel].join('\n');
  for (const prohibited of [
    'WorkspaceState.', 'createTopologyEditCommandIntent', 'previewAutofix(',
    'acceptAutofix(', 'commitToWorkspace(', 'exportTopologyEditAudit(',
    'resolveIssue(', 'approveEngineering(', 'nearestNeighbor', 'raycast(',
    'screenX', 'screenY', 'mesh.name',
  ]) {
    assert.equal(combined.includes(prohibited), false, `review ledger must not use ${prohibited}`);
  }
});
