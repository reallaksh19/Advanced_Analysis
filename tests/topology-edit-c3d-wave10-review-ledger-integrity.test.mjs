import assert from 'node:assert/strict';
import test from 'node:test';
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
} from '../src/workspace/viewport-productivity/topology-edit-review-response-ledger.js';
import {
  reconcileTopologyEditReviewResponseLedger,
} from '../src/workspace/viewport-productivity/topology-edit-review-response-ledger-intake.js';
import {
  topologyEditReviewResponseLedgerMarkup,
} from '../src/workspace/viewport-productivity/topology-edit-review-response-ledger-panel.js';

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

function topology() {
  return {
    canonicalTopologyHash: 'draft:1',
    nodes: [{ id: 'node:a', position: { x: 0, y: 0, z: 0 } }],
    edges: [{ id: 'edge:ab', fromNodeId: 'node:a', toNodeId: 'node:a' }],
    supports: [],
    junctions: [],
  };
}

function dossier() {
  const reviewBasis = basis();
  return createTopologyEditReviewDossier({
    basis: reviewBasis,
    camera: {
      projection: 'PERSPECTIVE',
      position: { x: 10, y: 20, z: 30 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
      up: { x: 0, y: 1, z: 0 },
      near: 0.1,
      far: 10000,
      zoom: 1,
      fov: 50,
    },
    presentationState: { presentationHash: 'presentation:1', basis: reviewBasis },
    selection: { nodeIds: ['node:a'], edgeId: null },
    bookmarks: [],
    provenance: { entries: [], provenanceHash: 'provenance:1' },
    comparison: { entries: [], changedCanonicalIds: [], comparisonHash: 'comparison:1' },
    issueOverlay: {
      entries: [{
        issueId: 'issue:1',
        kind: 'GAP',
        severity: 'HIGH',
        message: 'Gap',
        canonicalIds: ['edge:ab', 'node:a'],
        suggestionHash: null,
        commandType: null,
      }],
      overlayHash: 'overlay:1',
    },
    inspection: null,
    routeTrace: null,
    visualDiagnostics: [],
  });
}

function response(source) {
  const intake = reconcileTopologyEditReviewDossier({
    dossier: source,
    currentBasis: basis(),
    canonicalTopology: topology(),
    currentEvidenceHashes: {},
  });
  return createTopologyEditReviewResponse({
    dossier: source,
    intake,
    responderBasis: basis(),
    responses: [{
      issueId: 'issue:1',
      disposition: 'ACKNOWLEDGED',
      note: 'Reviewed.',
    }],
  });
}

function ledger() {
  const source = dossier();
  return {
    source,
    value: createTopologyEditReviewResponseLedger({
      dossier: source,
      currentBasis: basis(),
      canonicalTopology: topology(),
      responses: [response(source)],
    }),
  };
}

function rehash(value, hashKey) {
  const payload = { ...value };
  delete payload[hashKey];
  value[hashKey] = semanticHash(payload);
}

test('rehashed embedded intake cannot forge creation-basis classification', () => {
  const { value } = ledger();
  assert.equal(value.packages[0].intake.basisStatus, 'CURRENT');
  const forged = structuredClone(value);
  forged.packages[0].intake.basisStatus = 'STALE_BASIS';
  rehash(forged.packages[0].intake, 'responseIntakeHash');
  rehash(forged, 'ledgerHash');
  assert.throws(
    () => parseTopologyEditReviewResponseLedgerJson(JSON.stringify(forged)),
    /embedded intake does not match reconstructable response evidence/,
  );
});

test('package controls display current reconciliation, not historical intake status', () => {
  const { source, value } = ledger();
  assert.equal(value.packages[0].intake.basisStatus, 'CURRENT');
  const intake = reconcileTopologyEditReviewResponseLedger({
    ledger: value,
    dossier: source,
    currentBasis: basis({ draftCanonicalHash: 'draft:new' }),
    canonicalTopology: topology(),
  });
  assert.equal(intake.packageComparisons[0].basisStatus, 'STALE_BASIS');
  const markup = topologyEditReviewResponseLedgerMarkup({ ledger: value, intake });
  assert.match(markup, /STALE_BASIS/);
});
