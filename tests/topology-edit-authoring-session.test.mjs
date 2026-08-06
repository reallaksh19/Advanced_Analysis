import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activateTopologyEditAuthoringTool,
  beginTopologyEditAuthoringValidation,
  completeTopologyEditAuthoringValidation,
  createTopologyEditAuthoringSession,
  markTopologyEditAuthoringApplied,
  publishTopologyEditAuthoringPreview,
  setTopologyEditAuthoringTarget,
  topologyEditAuthoringToolDefinition,
  updateTopologyEditAuthoringProperties,
} from '../src/workspace/topology-edit/authoring/topology-edit-authoring-session.js';

test('authoring session enforces target → properties → preview → validation → apply', () => {
  let session = createTopologyEditAuthoringSession();
  assert.equal(session.phase, 'IDLE');

  session = activateTopologyEditAuthoringTool(session, 'VALVE_ASSEMBLY');
  assert.equal(session.phase, 'TARGET_REQUIRED');
  assert.equal(session.tool, 'VALVE_ASSEMBLY');

  session = setTopologyEditAuthoringTarget(session, {
    kind: 'straight-edge',
    canonicalIds: ['edge:host'],
    stationMm: 1200,
    position: { x: 1200, y: 0, z: 0 },
    direction: { x: 1, y: 0, z: 0 },
    targetHash: 'fnv1a64:target',
  });
  assert.equal(session.phase, 'PARAMETERS_REQUIRED');

  session = updateTopologyEditAuthoringProperties(session, {
    stationMm: 1200,
    valveRecordId: 'VALVE-DN100-GATE-600-A',
    upstreamFlangeRecordId: 'FLANGE-DN100-600-RF-A',
    downstreamFlangeRecordId: 'FLANGE-DN100-600-RF-B',
  });
  assert.equal(session.propertyAuthorities.valveRecordId, 'USER_INPUT');

  session = publishTopologyEditAuthoringPreview(session, {
    previewHash: 'fnv1a64:preview',
    planHash: 'fnv1a64:plan',
    candidateCanonicalHash: 'fnv1a64:candidate',
    changedCanonicalIds: ['edge:host'],
  });
  assert.equal(session.phase, 'PREVIEW_READY');

  session = beginTopologyEditAuthoringValidation(session);
  assert.equal(session.phase, 'VALIDATING');

  session = completeTopologyEditAuthoringValidation(session, {
    validationHash: 'fnv1a64:validation',
    status: 'PASS',
    blockingIssueCount: 0,
    diagnostics: [],
  });
  assert.equal(session.phase, 'READY_TO_APPLY');

  session = markTopologyEditAuthoringApplied(session, 'fnv1a64:transaction');
  assert.equal(session.phase, 'APPLIED');
  assert.equal(session.lastAppliedTransactionHash, 'fnv1a64:transaction');
});

test('tool definitions expose requested engineering properties', () => {
  const valve = topologyEditAuthoringToolDefinition('VALVE_ASSEMBLY');
  assert.ok(valve.fields.some((field) => field.key === 'pressureClass'));
  assert.ok(valve.fields.some((field) => field.key === 'assemblyMassKg'));

  const reducer = topologyEditAuthoringToolDefinition('REDUCER');
  assert.ok(reducer.fields.some((field) => field.key === 'toNominalSizeMm'));

  const branch = topologyEditAuthoringToolDefinition('BRANCH');
  assert.equal(branch.fields.find((field) => field.key === 'branchNominalSizeMm').defaultValue, 50);

  const blind = topologyEditAuthoringToolDefinition('BLIND_FLANGE');
  assert.ok(blind.fields.some((field) => field.key === 'thicknessMm'));
});
