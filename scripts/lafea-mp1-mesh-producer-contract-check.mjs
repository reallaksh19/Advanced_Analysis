#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  LAFEA_MESH_PLAN_SCHEMA,
  LAFEA_MESH_PRODUCER_CAPABILITY_SCHEMA,
  LAFEA_MESH_PRODUCER_OUTPUT_SCHEMA,
  LAFEA_MESH_PRODUCER_QUALIFICATION_SCHEMA,
  LAFEA_MESH_PUBLICATION_POLICY,
  LAFEA_MESH_REPEATABILITY_POLICY,
  LAFEA_MESH_ROLLBACK_POLICY,
  buildLafeaMeshProducerReadiness,
  createLafeaMeshPlan,
  createLafeaMeshProducerCapability,
  createLafeaMeshProducerOutput,
  createLafeaMeshProducerQualification,
  validateLafeaMeshPlan,
  validateLafeaMeshProducerOutput,
  validateLafeaMeshProducerQualification,
} from '../src/workspace/lafea-mesh-producer-public.js';
import { createLafeaMeshGenerationIntent } from '../src/workspace/lafea-mesh-generation-intent.js';

const hash = (char) => `sha256:${char.repeat(64)}`;
const capability = createLafeaMeshProducerCapability({
  schema: LAFEA_MESH_PRODUCER_CAPABILITY_SCHEMA,
  producerId: 'TEST-MP1-PRODUCER',
  producerRevision: 'TEST.1',
  scopes: [{ stageId: 'LAFEA.3', elementFamilies: ['T6', 'T3'] }],
  generationModes: ['AUTOMATIC_MESH'],
  supportsLocalRefinement: false,
  repeatabilityPolicy: LAFEA_MESH_REPEATABILITY_POLICY,
  qualityPolicyId: 'MESH-QUALITY-POLICY-V1',
  rollbackPolicy: LAFEA_MESH_ROLLBACK_POLICY,
  publicationPolicy: LAFEA_MESH_PUBLICATION_POLICY,
  maximumNodes: 1000,
  maximumElements: 2000,
  maximumEstimatedDofs: 3000,
});
assert.ok(Object.isFrozen(capability));
assert.deepEqual(capability.scopes[0].elementFamilies, ['T3', 'T6']);

const qualification = createLafeaMeshProducerQualification({
  schema: LAFEA_MESH_PRODUCER_QUALIFICATION_SCHEMA,
  qualificationId: 'TEST-MP1-QUALIFICATION',
  qualificationRevision: 'TEST.1',
  capabilityHash: capability.capabilityHash,
  authorizedScopes: [{ stageId: 'LAFEA.3', elementFamilies: ['T3'] }],
  authorizedGenerationModes: ['AUTOMATIC_MESH'],
  localRefinementAuthorized: false,
  maximumNodes: 100,
  maximumElements: 200,
  maximumEstimatedDofs: 300,
  repeatabilityPolicy: LAFEA_MESH_REPEATABILITY_POLICY,
  qualityPolicyId: 'MESH-QUALITY-POLICY-V1',
  rollbackPolicy: LAFEA_MESH_ROLLBACK_POLICY,
  publicationPolicy: LAFEA_MESH_PUBLICATION_POLICY,
  governanceRef: 'ISSUE-864-TEST-ONLY',
  invalidationPolicy: 'INVALIDATE_ON_CAPABILITY_OR_POLICY_CHANGE',
});
assert.equal(validateLafeaMeshProducerQualification(qualification, capability).qualificationHash, qualification.qualificationHash);

const intent = createLafeaMeshGenerationIntent({
  schema: 'lafea-mesh-generation-intent/v1',
  stageId: 'LAFEA.3',
  sourceHash: hash('a'),
  canonicalModelHash: hash('b'),
  analysisGeometryHash: hash('c'),
  meshProfileHash: hash('d'),
  targetElementLength: 1,
  lengthUnit: 'mm',
  elementFamily: 'T3',
  curvatureToleranceDegrees: 10,
  growthLimit: 1.5,
  maximumNodes: 100,
  maximumElements: 200,
  maximumEstimatedDofs: 300,
  refinementEntityIds: ['E-2', 'E-1'],
});
const readiness = buildLafeaMeshProducerReadiness(intent, capability, qualification);
assert.equal(readiness.producerContractReady, true);
assert.equal(readiness.executionAuthorized, false);
assert.deepEqual(readiness.reasons, ['REAL_PRODUCER_IMPLEMENTATION_NOT_BOUND']);

const refinementOnlyCapability = createLafeaMeshProducerCapability({
  ...stripHash(capability),
  producerId: 'TEST-REFINEMENT-ONLY',
  generationModes: ['REFINEMENT_REGENERATION'],
});
const refinementOnlyQualification = createLafeaMeshProducerQualification({
  ...stripHash(qualification),
  qualificationId: 'TEST-REFINEMENT-ONLY-QUALIFICATION',
  capabilityHash: refinementOnlyCapability.capabilityHash,
  authorizedGenerationModes: ['REFINEMENT_REGENERATION'],
});
const refinementOnlyReadiness = buildLafeaMeshProducerReadiness(
  intent,
  refinementOnlyCapability,
  refinementOnlyQualification,
);
assert.equal(refinementOnlyReadiness.producerContractReady, false);
assert.deepEqual(refinementOnlyReadiness.reasons, [
  'CAPABILITY_AUTOMATIC_MESH_MODE_MISSING',
  'QUALIFICATION_AUTOMATIC_MESH_MODE_MISSING',
]);

const plan = createLafeaMeshPlan({
  schema: LAFEA_MESH_PLAN_SCHEMA,
  stageId: intent.stageId,
  intentHash: intent.semanticHash,
  capabilityHash: capability.capabilityHash,
  qualificationHash: qualification.qualificationHash,
  producerId: capability.producerId,
  producerRevision: capability.producerRevision,
  sourceHash: intent.sourceHash,
  canonicalModelHash: intent.canonicalModelHash,
  analysisGeometryHash: intent.analysisGeometryHash,
  meshProfileHash: intent.meshProfileHash,
  elementFamily: intent.elementFamily,
  estimatedNodes: 3,
  estimatedElements: 1,
  estimatedDofs: 6,
  characteristicLengthMin: 0.8,
  characteristicLengthMedian: 1,
  characteristicLengthMax: 1.2,
  refinementEntityIds: ['E-1', 'E-2'],
  resourceDisposition: 'WITHIN_LIMITS',
});
assert.equal(plan.producesMesh, false);
assert.equal(plan.engineeringAuthority, false);
assert.equal(validateLafeaMeshPlan(plan, { intent, capability, qualification }).planHash, plan.planHash);

const output = createLafeaMeshProducerOutput({
  schema: LAFEA_MESH_PRODUCER_OUTPUT_SCHEMA,
  stageId: intent.stageId,
  intentHash: intent.semanticHash,
  planHash: plan.planHash,
  capabilityHash: capability.capabilityHash,
  qualificationHash: qualification.qualificationHash,
  producerId: capability.producerId,
  producerRevision: capability.producerRevision,
  sourceHash: intent.sourceHash,
  canonicalModelHash: intent.canonicalModelHash,
  analysisGeometryHash: intent.analysisGeometryHash,
  meshProfileHash: intent.meshProfileHash,
  elementFamily: intent.elementFamily,
  mesh: {
    schema: 'lafea-analysis-mesh/v1',
    meshIdentity: 'TEST-MESH',
    nodes: [
      { nodeId: 'N3', x: 0, y: 1, z: 0 },
      { nodeId: 'N1', x: 0, y: 0, z: 0 },
      { nodeId: 'N2', x: 1, y: 0, z: 0 },
    ],
    elements: [{ elementId: 'E1', elementType: 'T3', nodeIds: ['N1', 'N2', 'N3'] }],
  },
});
const context = { intent, capability, qualification, plan };
assert.equal(validateLafeaMeshProducerOutput(output, context).outputHash, output.outputHash);
assert.equal(output.lifecycleAuthority, false);

assert.throws(() => createLafeaMeshProducerCapability({
  ...stripHash(capability), scopes: [{ stageId: 'LAFEA.1', elementFamilies: ['T3'] }],
}), /LAFEA_MESH_PRODUCER_SCOPE_STAGE_NOT_APPLICABLE/u);
assert.throws(() => validateLafeaMeshProducerQualification(createLafeaMeshProducerQualification({
  ...stripHash(qualification), authorizedScopes: [{ stageId: 'LAFEA.3', elementFamilies: ['Q8'] }],
}), capability), /LAFEA_MESH_PRODUCER_QUALIFICATION_SCOPE_WIDENING/u);
assert.throws(() => validateLafeaMeshProducerQualification(createLafeaMeshProducerQualification({
  ...stripHash(qualification), maximumNodes: 1001,
}), capability), /LAFEA_MESH_PRODUCER_QUALIFICATION_MAXIMUM_NODES_WIDENING/u);
assert.throws(() => validateLafeaMeshProducerOutput({ ...output, producerRevision: 'TAMPERED' }, context), /HASH_INVALID|PRODUCER_REVISION/u);

const shellCapability = createLafeaMeshProducerCapability({
  ...stripHash(capability), producerId: 'TEST-SHELL',
  scopes: [
    { stageId: 'LAFEA.4', elementFamilies: ['CST_DKT_TRI3_THIN_SHELL_V1'] },
    { stageId: 'LAFEA.5', elementFamilies: ['CST_DKT_TRI3_THIN_SHELL_V1'] },
  ],
});
assert.deepEqual(shellCapability.scopes.map((row) => row.stageId), ['LAFEA.4', 'LAFEA.5']);

for (const relative of [
  '../src/workspace/lafea-mesh-producer-contract.js',
  '../src/workspace/lafea-mesh-plan-contract.js',
  '../src/workspace/lafea-mesh-producer-output.js',
]) {
  const source = fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
  assert.doesNotMatch(source, /executeLafeaStage|registerLafeaArtifact|registerAnalysisMeshEvidence|recoverLafea|releaseQualified\s*:\s*true/u);
}

console.log(JSON.stringify({
  check: 'lafea-mp1-mesh-producer-contract',
  status: 'PASS',
  producerContractReady: readiness.producerContractReady,
  executionAuthorized: readiness.executionAuthorized,
  meshPlanProducesMesh: plan.producesMesh,
  outputLifecycleAuthority: output.lifecycleAuthority,
  realProducerQualified: false,
  generalMeshGeneration: false,
}));

function stripHash(value) {
  const result = { ...value };
  delete result.capabilityHash;
  delete result.qualificationHash;
  return result;
}
