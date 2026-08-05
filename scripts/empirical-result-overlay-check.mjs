import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  createEmpiricalResultOverlay,
  requireEmpiricalResultOverlay,
} from '../src/workspace/engineering-loads/empirical-result-overlay.js';
import {
  EmpiricalResultOverlayStore,
} from '../src/workspace/engineering-loads/empirical-result-overlay-store.js';
import {
  clearGovernedEmpiricalResultEvidence,
  renderGovernedEmpiricalResults,
} from '../src/workspace/topology-edit/topology-edit-empirical-result-renderer-v1.js';

const proposal = Object.freeze({
  semanticHash: 'fnv1a64:1111111111111111',
  scenarioId: 'SCENARIO:WP4',
  adaptedRequest: Object.freeze({
    semanticHash: 'fnv1a64:2222222222222222',
    datasetId: 'WP4-FIXTURE',
    coordinateFrame: Object.freeze({
      forceOutputConvention: 'RESTRAINT_ON_PIPE',
      momentOutputConvention: 'RESTRAINT_ON_PIPE',
    }),
    restraintOccurrences: Object.freeze([
      occurrence('REST-A', 'SUP-A', { x: 100, y: 200, z: 300 }),
      occurrence('REST-B', 'SUP-B', { x: 400, y: 500, z: 600 }),
    ]),
  }),
  runtimeProfile: Object.freeze({ semanticHash: 'fnv1a64:3333333333333333' }),
});
const execution = Object.freeze({
  semanticHash: 'fnv1a64:4444444444444444',
  method: 'EMPIRICAL_BEAM_CONTACT_V1',
  executionId: 'EXEC:WP4',
  executedAt: '2026-08-05T18:40:00.000Z',
  coreResult: Object.freeze({
    loadCases: Object.freeze([{
      loadCaseId: 'W-COLD',
      label: 'Cold weight',
      resultClass: 'VERTICAL_SCREENING_RESULT',
      status: 'CALCULATED',
      supportResults: Object.freeze([
        result('REST-A', 'SUP-A', 'ACTIVE', { x: 3000, y: 4000, z: 0 }),
        result('REST-B', 'SUP-B', 'LIFTED', { x: 0, y: 0, z: 0 }),
      ]),
    }]),
  }),
});
const currentSnapshot = Object.freeze({
  state: 'EXECUTED_CURRENT',
  proposalSemanticHash: proposal.semanticHash,
  authorizationSemanticHash: 'fnv1a64:5555555555555555',
  executionSemanticHash: execution.semanticHash,
});
const overlay = createEmpiricalResultOverlay({
  snapshot: currentSnapshot,
  proposal,
  execution,
  displayPolicy: {
    minimumArrowLengthMm: 40,
    maximumArrowLengthMm: 200,
    referenceForceN: 10000,
    magnitudeExponent: 0.5,
    zeroForceToleranceN: 1e-9,
  },
});

assert.equal(overlay.schema, 'empirical-result-overlay/v1');
assert.equal(overlay.renderStyle, 'EMPIRICAL_RESULT_FORCE_ARROWS_V1');
assert.equal(overlay.summary.arrowCount, 2);
assert.equal(overlay.summary.activeCount, 1);
assert.equal(overlay.summary.liftedCount, 1);
assert.equal(overlay.summary.zeroForceCount, 1);
assert.equal(overlay.geometryMutation, false);
assert.equal(overlay.sourceRestraintProjectionMutation, false);
assert.deepEqual(overlay.arrows[0].start, { x: 100, y: 200, z: 300 });
assert(Math.abs(overlay.arrows[0].forceMagnitudeN - 5000) < 1e-9);
assert(overlay.arrows[0].displayLengthMm > 40);
assert.notDeepEqual(overlay.arrows[0].start, overlay.arrows[0].end);
assert.deepEqual(overlay.arrows[1].start, overlay.arrows[1].end);
assert.equal(overlay.arrows[0].renderRole, 'EMPIRICAL_RESULT_FORCE_ARROW');
assert.equal(overlay.arrows[0].sourceRestraintArrowChanged, false);
assert.equal(overlay.arrows[0].geometryChanged, false);
assert.deepEqual(requireEmpiricalResultOverlay(overlay), overlay);

const store = new EmpiricalResultOverlayStore();
let changed = 0;
store.subscribe(() => { changed += 1; });
let storeSnapshot = store.sync({
  snapshot: currentSnapshot,
  proposal,
  execution,
});
assert.equal(storeSnapshot.state, 'CURRENT');
assert.equal(storeSnapshot.current, true);
assert.equal(storeSnapshot.arrowCount, 2);
assert.equal(store.getProjection().semanticHash, storeSnapshot.projectionSemanticHash);
storeSnapshot = store.sync({
  snapshot: {
    ...currentSnapshot,
    state: 'EXECUTED_STALE',
  },
  proposal,
  execution,
});
assert.equal(storeSnapshot.state, 'EMPTY');
assert.equal(storeSnapshot.current, false);
assert.equal(storeSnapshot.reasonCode, 'EMPIRICAL_RESULTS_STALE');
assert.equal(storeSnapshot.arrowCount, 0);
assert.equal(store.getProjection(), null);
assert(changed >= 2);

const group = new THREE.Group();
const hostElement = { dataset: {} };
const backend = {
  navigationConfiguration: { meshRadialSegments: 12 },
  hostElement,
  applySectionPlanesToGroup(target) {
    assert.equal(target, group);
  },
};
const bounds = renderGovernedEmpiricalResults({ backend, group, projection: overlay });
assert(bounds instanceof THREE.Box3);
assert.equal(group.children.length, 2);
const activeArrow = group.children.find((child) => child.name.includes(overlay.arrows[0].overlayId));
assert(activeArrow, 'nonzero reaction arrow must render');
assert.equal(activeArrow.userData.empiricalResult, true);
assert.equal(activeArrow.userData.sourceRestraintArrow, false);
assert.equal(activeArrow.userData.separateFromSourceRestraintProjection, true);
const proxies = [];
group.traverse((object) => {
  if (object.userData?.pickProxy) proxies.push(object);
});
assert.equal(proxies.length, 2);
assert(proxies.every((object) => object.userData.objectKind === 'result'));
assert(proxies.every((object) => object.userData.restraintId));
assert.equal(hostElement.dataset.topologyEditEmpiricalResultOverlayCurrent, 'true');
assert.equal(hostElement.dataset.topologyEditEmpiricalResultOverlayHash, overlay.semanticHash);
assert.equal(hostElement.dataset.topologyEditEmpiricalResultSeparateFromSourceRestraints, 'true');
assert.equal(hostElement.dataset.topologyEditEmpiricalResultGeometryMutation, 'false');
clearGovernedEmpiricalResultEvidence(hostElement, 'EMPIRICAL_RESULTS_STALE');
assert.equal(hostElement.dataset.topologyEditEmpiricalResultOverlayCurrent, 'false');
assert.equal(hostElement.dataset.topologyEditEmpiricalResultArrowCount, '0');
assert.equal(hostElement.dataset.topologyEditEmpiricalResultClearReason, 'EMPIRICAL_RESULTS_STALE');

const backendSource = readFileSync(
  new URL('../src/workspace/topology-edit/topology-edit-sjson-governed-viewport-backend-v2.js', import.meta.url),
  'utf8',
);
assert.match(backendSource, /resultGroup/u);
assert.match(backendSource, /setGovernedResultProjection/u);
assert.match(backendSource, /renderGovernedEmpiricalResults/u);
assert.match(backendSource, /clearGovernedEmpiricalResultEvidence/u);
assert.doesNotMatch(backendSource, /governedSupportProjection\s*=\s*this\.governedResultProjection/u);

const loadCalcSource = readFileSync(
  new URL('../src/workspace/load-calc-consumer-controller.js', import.meta.url),
  'utf8',
);
assert.match(loadCalcSource, /RESULT_OVERLAY_CHANGED/u);
assert.match(loadCalcSource, /setGovernedResultProjection/u);
assert.match(loadCalcSource, /empiricalResultOverlayStore\.getProjection/u);

console.log('empirical-result-overlay-check: PASS');

function occurrence(restraintId, supportSiteId, attachmentPointMm) {
  return Object.freeze({
    supportSiteId,
    restraintId,
    sourceSupportIds: Object.freeze([supportSiteId]),
    sourceEntityIds: Object.freeze([`entity:${supportSiteId}`]),
    hostEntityId: `PIPE:${supportSiteId}`,
    attachmentPointMm: Object.freeze(attachmentPointMm),
  });
}

function result(restraintId, supportSiteId, contactState, forceN) {
  return Object.freeze({
    supportSiteId,
    restraintId,
    sourceSupportIds: Object.freeze([supportSiteId]),
    sourceEntityIds: Object.freeze([`entity:${supportSiteId}`]),
    hostEntityId: `PIPE:${supportSiteId}`,
    nodeId: `NODE:${supportSiteId}`,
    contactState,
    trialTensileReactionN: contactState === 'LIFTED' ? -10 : null,
    globalReaction: Object.freeze({
      forceN: Object.freeze(forceN),
      momentNm: Object.freeze({ x: 0, y: 0, z: 0 }),
    }),
    anchorDecomposition: null,
    overrideId: null,
    occurrenceIdentity: restraintId,
  });
}
