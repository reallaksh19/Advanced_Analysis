import assert from 'node:assert/strict';
import {
  LAFEA_MESH_REQUEST_READINESS_SCHEMA,
  LAFEA_MESH_STAGE_ADAPTER_SCHEMA,
  lafeaMeshStageAdapter,
  projectLafeaMeshRequestReadiness,
} from '../src/workspace/lafea-mesh-stage-adapter.js';
import {
  buildLafeaMeshGenerationIntentFromStage,
  buildLafeaMeshRefinementCommandFromStage,
} from '../src/workspace/lafea-mesh-stage-request.js';
import * as guided from '../src/workspace/lafea-guided-workbench-contracts.js';

const H = { source: sha('1'), model: sha('2'), geometry: sha('3'), geometry2: sha('4') };
const PROFILE = 'mesh-profile:test:v1';

for (const name of [
  'lafeaMeshStageAdapter', 'projectLafeaMeshRequestReadiness',
  'buildLafeaMeshGenerationIntentFromStage', 'buildLafeaMeshRefinementCommandFromStage',
]) assert.equal(typeof guided[name], 'function', `${name} must be exported by guided contracts.`);

const stage3 = stage('LAFEA.3', {
  nodes: [{ nodeId: 'N2' }, { nodeId: 'N1' }],
  elements: [{ elementId: 'E1' }],
});
const stage4 = stage('LAFEA.4', {
  nodes: [{ nodeId: 'S1' }],
  elements: [{ elementId: 'SE1' }],
});
const stage5 = stage('LAFEA.5', {
  shellTemplate: {
    nodes: [{ nodeId: 'H1' }],
    elements: [{ elementId: 'HE1' }],
  },
});

for (const [stageId, families, sourceSurface] of [
  ['LAFEA.3', ['T3', 'T6', 'Q8'], 'CONTINUUM_2D'],
  ['LAFEA.4', ['CST_DKT_TRI3_THIN_SHELL_V1'], 'THIN_SHELL'],
  ['LAFEA.5', ['CST_DKT_TRI3_THIN_SHELL_V1'], 'HOST_SHELL'],
]) {
  const adapter = lafeaMeshStageAdapter(stageId);
  assert.equal(adapter.schema, LAFEA_MESH_STAGE_ADAPTER_SCHEMA);
  assert.deepEqual(adapter.allowedElementFamilies, families);
  assert.equal(adapter.sourceSurface, sourceSurface);
  assert.equal(adapter.generationExecutionAuthorized, false);
  assert.equal(adapter.refinementExecutionAuthorized, false);
  assert(Object.isFrozen(adapter));
}

for (const stageId of ['LAFEA.1', 'LAFEA.2', 'LAFEA.6']) {
  throwsCode(() => lafeaMeshStageAdapter(stageId), 'LAFEA_MESH_STAGE_ADAPTER_NOT_AVAILABLE');
  assert.equal(projectLafeaMeshRequestReadiness({ stageId }).ready, false);
}

for (const candidate of [stage3, stage4, stage5]) {
  const projection = projectLafeaMeshRequestReadiness(candidate);
  assert.equal(projection.schema, LAFEA_MESH_REQUEST_READINESS_SCHEMA);
  assert.equal(projection.ready, true, projection.reasons.join(','));
  assert.equal(projection.executionAuthorized, false);
}
assert.deepEqual(
  projectLafeaMeshRequestReadiness(stage3).availableRefinementEntityIds,
  ['E1', 'N1', 'N2'],
);
assert.deepEqual(
  projectLafeaMeshRequestReadiness(stage5).availableRefinementEntityIds,
  ['H1', 'HE1'],
);

for (const elementFamily of ['T3', 'T6', 'Q8']) {
  const intent = buildLafeaMeshGenerationIntentFromStage(
    stage3, generationConfig(elementFamily, ['N1', 'E1']),
  );
  assert.equal(intent.status, 'UNEXECUTABLE_INTENT');
  assert.equal(intent.executionAuthorized, false);
  assert.equal(intent.producerRef, null);
  assert.equal(intent.producesMesh, false);
  assert.deepEqual(
    [intent.sourceHash, intent.canonicalModelHash, intent.analysisGeometryHash, intent.meshProfileHash],
    [H.source, H.model, H.geometry, PROFILE],
  );
}

for (const candidate of [stage4, stage5]) {
  const intent = buildLafeaMeshGenerationIntentFromStage(
    candidate, generationConfig('CST_DKT_TRI3_THIN_SHELL_V1', []),
  );
  assert.equal(intent.stageId, candidate.stageId);
  assert.equal(intent.executionAuthorized, false);
}

throwsCode(
  () => buildLafeaMeshGenerationIntentFromStage(stage4, generationConfig('Q8', [])),
  'LAFEA_MESH_REQUEST_ELEMENT_FAMILY_NOT_AUTHORIZED',
);

const ordered = buildLafeaMeshGenerationIntentFromStage(
  stage3, generationConfig('T6', ['E1', 'N1']),
);
const reordered = buildLafeaMeshGenerationIntentFromStage(
  stage3, generationConfig('T6', ['N1', 'E1']),
);
assert.equal(ordered.semanticHash, reordered.semanticHash);
assert.deepEqual(ordered.refinementEntityIds, ['E1', 'N1']);

for (const [ids, code] of [
  [['N1', 'N1'], 'LAFEA_MESH_REQUEST_REFINEMENT_IDS_DUPLICATE'],
  [['UNKNOWN'], 'LAFEA_MESH_REQUEST_REFINEMENT_ID_UNKNOWN'],
]) {
  throwsCode(
    () => buildLafeaMeshGenerationIntentFromStage(stage3, generationConfig('T6', ids)),
    code,
  );
}

for (const [mutation, reason] of [
  [(value) => { value.lifecycleBinding.status = 'STALE_DOCUMENT_REVISION'; },
    'LAFEA_MESH_REQUEST_LIFECYCLE_BINDING_NOT_CURRENT'],
  [(value) => { value.lifecycle.source.status = 'STALE'; },
    'LAFEA_MESH_REQUEST_SOURCE_NOT_CURRENT'],
  [(value) => { value.lifecycle.artifacts.CANONICAL_MODEL.status = 'STALE'; },
    'LAFEA_MESH_REQUEST_CANONICAL_MODEL_NOT_CURRENT'],
  [(value) => { value.lifecycle.artifacts.ANALYSIS_GEOMETRY.qualification = 'BLOCK'; },
    'LAFEA_MESH_REQUEST_ANALYSIS_GEOMETRY_NOT_CURRENT'],
  [(value) => { value.analysisMeshProfileHash = null; },
    'LAFEA_MESH_REQUEST_PROFILE_BINDING_REQUIRED'],
  [(value) => { value.lifecycle.artifacts.CANONICAL_MODEL.parentHashes.sourceHash = sha('9'); },
    'LAFEA_MESH_REQUEST_CANONICAL_MODEL_PARENT_MISMATCH'],
  [(value) => { value.lifecycle.artifacts.ANALYSIS_GEOMETRY.parentHashes.canonicalModelHash = sha('9'); },
    'LAFEA_MESH_REQUEST_ANALYSIS_GEOMETRY_PARENT_MISMATCH'],
]) {
  const candidate = structuredClone(stage3);
  mutation(candidate);
  const projection = projectLafeaMeshRequestReadiness(candidate);
  assert.equal(projection.ready, false);
  assert(projection.reasons.includes(reason), `${reason}: ${projection.reasons.join(',')}`);
  throwsCode(
    () => buildLafeaMeshGenerationIntentFromStage(candidate, generationConfig('T6', [])),
    'LAFEA_MESH_STAGE_REQUEST_NOT_READY',
  );
}

const refinement = buildLafeaMeshRefinementCommandFromStage(stage3, {
  generationIntent: ordered,
  commandId: 'REFINE-1',
  kind: 'DISCONTINUITY_ZONE',
  entityIds: ['N1', 'E1'],
  targetElementLength: 0.5,
  lengthUnit: 'mm',
  reason: 'Explicit local discontinuity refinement request.',
});
assert.deepEqual(
  [refinement.status, refinement.executionAuthorized, refinement.rollbackPolicy],
  ['UNEXECUTABLE_COMMAND', false, 'NO_MUTATION_WITHOUT_QUALIFIED_PRODUCER'],
);
assert.equal(refinement.expectedGenerationIntentHash, ordered.semanticHash);

const staleIntentStage = stage('LAFEA.3', stage3.document, H.geometry2);
throwsCode(
  () => buildLafeaMeshRefinementCommandFromStage(
    staleIntentStage, refinementConfig(ordered, 'REFINE-STALE', ['N1']),
  ),
  'LAFEA_MESH_GENERATION_INTENT_STALE',
);

const tampered = structuredClone(ordered);
tampered.semanticHash = sha('f');
throwsCode(
  () => buildLafeaMeshRefinementCommandFromStage(
    stage3, refinementConfig(tampered, 'REFINE-TAMPER', ['N1']),
  ),
  'LAFEA_MESH_GENERATION_INTENT_TAMPERED',
);
throwsCode(
  () => buildLafeaMeshRefinementCommandFromStage(
    stage3, refinementConfig(ordered, 'REFINE-UNKNOWN', ['MISSING']),
  ),
  'LAFEA_MESH_REQUEST_REFINEMENT_ID_UNKNOWN',
);

console.log(JSON.stringify({
  status: 'PASS',
  package: 'WP-MA1',
  stageAdapters: ['LAFEA.3', 'LAFEA.4', 'LAFEA.5'],
  generationExecutionAuthorized: false,
  refinementExecutionAuthorized: false,
}, null, 2));

function stage(stageId, document, geometryHash = H.geometry) {
  return {
    stageId,
    document: structuredClone(document),
    lifecycleBinding: { status: 'CURRENT' },
    lifecycle: {
      source: { status: 'CURRENT', sourceHash: H.source },
      artifacts: {
        CANONICAL_MODEL: {
          status: 'CURRENT', qualification: 'PASS', artifactHash: H.model,
          parentHashes: { sourceHash: H.source },
        },
        ANALYSIS_GEOMETRY: {
          status: 'CURRENT', qualification: 'PASS', artifactHash: geometryHash,
          parentHashes: { sourceHash: H.source, canonicalModelHash: H.model },
        },
      },
    },
    analysisMeshProfileHash: PROFILE,
  };
}

function generationConfig(elementFamily, refinementEntityIds) {
  return {
    targetElementLength: 1, lengthUnit: 'mm', elementFamily,
    curvatureToleranceDegrees: 10, growthLimit: 1.5,
    maximumNodes: 10000, maximumElements: 8000, maximumEstimatedDofs: 60000,
    refinementEntityIds,
  };
}

function refinementConfig(generationIntent, commandId, entityIds) {
  return {
    generationIntent, commandId, kind: 'TARGET_LENGTH', entityIds,
    targetElementLength: 0.5, lengthUnit: 'mm', reason: 'Qualification check.',
  };
}

function sha(character) { return `sha256:${character.repeat(64)}`; }
function throwsCode(operation, code) {
  assert.throws(operation, (error) => error?.code === code);
}
