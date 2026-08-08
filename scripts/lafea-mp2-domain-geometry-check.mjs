#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  mp2Attachment as attachment,
  mp2Hash as hash,
  mp2MeshProfile as meshProfile,
  mp2SquareWithCircularHole as squareWithCircularHole,
  mp2T6Mesh as t6Mesh,
} from './lafea-mp2-domain-geometry-fixtures.mjs';
import {
  LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_PROFILE,
  LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_SCHEMA,
  LAFEA_ANALYSIS_GEOMETRY_ORIENTATION_POLICY,
  LAFEA_ANALYSIS_GEOMETRY_SCHEMA,
  LAFEA_ANALYSIS_MESH_AUTHORITY_V2_ROLE,
  LAFEA_ANALYSIS_MESH_AUTHORITY_V2_SCHEMA,
  LAFEA_ANALYSIS_MESH_INTAKE_V2_SCHEMA,
  LAFEA_CONTINUUM_ANALYSIS_DOMAIN_SCHEMA,
  LAFEA_MESH_GENERATION_INTENT_V2_SCHEMA,
  LAFEA_MESH_PRODUCER_READINESS_V2_SCHEMA,
  LAFEA_PREPARATION_REQUEST_V2_SCHEMA,
  createLafeaAnalysisGeometry,
  createLafeaAnalysisGeometryEvidence,
  createLafeaAnalysisMeshEvidenceV2,
  createLafeaContinuumAnalysisDomain,
  createLafeaMeshGenerationIntentV2,
  createLafeaPreparationRequestV2,
  validateLafeaAnalysisGeometry,
  validateLafeaAnalysisGeometryEvidence,
  validateLafeaContinuumAnalysisDomain,
  validateLafeaAnalysisMeshEvidenceV2,
  buildLafeaMeshProducerReadinessV2,
} from '../src/workspace/lafea-domain-geometry-public.js';
import {
  LAFEA_MESH_PRODUCER_CAPABILITY_SCHEMA,
  LAFEA_MESH_PRODUCER_QUALIFICATION_SCHEMA,
  LAFEA_MESH_PUBLICATION_POLICY,
  LAFEA_MESH_REPEATABILITY_POLICY,
  LAFEA_MESH_ROLLBACK_POLICY,
  createLafeaMeshProducerCapability,
  createLafeaMeshProducerQualification,
} from '../src/workspace/lafea-mesh-producer-contract.js';
import { createLafeaWorkbenchGeometryState } from '../src/workspace/lafea-workbench-geometry-state.js';
import { lafeaAnalysisMeshContentHash } from '../src/workspace/lafea-analysis-mesh-contract.js';

const SOURCE = hash('MP2-SOURCE');
const geometry = createLafeaAnalysisGeometry(squareWithCircularHole());
assert.equal(validateLafeaAnalysisGeometry(geometry).semanticHash, geometry.semanticHash);
const permutedGeometry = createLafeaAnalysisGeometry({
  ...squareWithCircularHole(),
  vertices: [...squareWithCircularHole().vertices].reverse(),
  segments: [...squareWithCircularHole().segments].reverse(),
  loops: [...squareWithCircularHole().loops].reverse(),
});
assert.equal(permutedGeometry.semanticHash, geometry.semanticHash);

const domain = createLafeaContinuumAnalysisDomain({
  schema: LAFEA_CONTINUUM_ANALYSIS_DOMAIN_SCHEMA,
  stageId: 'LAFEA.3',
  sourceHash: SOURCE,
  applicationRef: 'MP2-QUALIFICATION',
  units: { length: 'mm', force: 'N', stress: 'MPa', temperature: 'C' },
  formulation: 'PLANE_STRESS',
  region: { regionId: 'REGION-1', materialRef: 'MAT-STEEL' },
  physicalCases: [{ caseId: 'LC-SUS' }, { caseId: 'LC-OPE' }],
  attachments: [
    attachment('FIX-LEFT', 'RESTRAINT', 'SEGMENT', 'S4', ['LC-SUS', 'LC-OPE'], { ux: true, uy: true }),
    attachment('PULL-RIGHT', 'TRACTION', 'SEGMENT', 'S2', ['LC-OPE'], { tx: 10, ty: 0, unit: 'MPa' }),
    attachment('TEMP', 'TEMPERATURE', 'REGION', 'REGION-1', ['LC-OPE'], { value: 50, unit: 'C' }),
  ],
}, geometry);
assert.equal(validateLafeaContinuumAnalysisDomain(domain, geometry).semanticHash, domain.semanticHash);
expectCode(() => createLafeaContinuumAnalysisDomain({
  schema: LAFEA_CONTINUUM_ANALYSIS_DOMAIN_SCHEMA,
  stageId: 'LAFEA.3',
  sourceHash: SOURCE,
  applicationRef: 'BAD',
  units: { length: 'mm', force: 'N', stress: 'MPa', temperature: 'C' },
  formulation: 'PLANE_STRESS',
  region: { regionId: 'REGION-1', materialRef: 'MAT' },
  physicalCases: [{ caseId: 'LC' }],
  attachments: [attachment('BAD', 'RESTRAINT', 'SEGMENT', 'S1', ['LC'], { nodeId: 'N1' })],
}, geometry), 'LAFEA_CONTINUUM_DOMAIN_MESH_AUTHORITY_FORBIDDEN');

const evidence = createLafeaAnalysisGeometryEvidence({
  schema: LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_SCHEMA,
  stageId: 'LAFEA.3',
  sourceHash: SOURCE,
  analysisDomain: domain,
  geometry,
  producerRef: 'MP2/ANALYSIS-GEOMETRY',
  profileId: LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_PROFILE,
});
assert.equal(validateLafeaAnalysisGeometryEvidence(evidence).semanticHash, evidence.semanticHash);

const state = createLafeaWorkbenchGeometryState(['LAFEA.3', 'LAFEA.4']);
const stage = () => ({
  stageId: 'LAFEA.3',
  lifecycleBinding: { status: 'CURRENT' },
  lifecycle: { source: { sourceHash: SOURCE } },
  ...state.fields('LAFEA.3'),
});
assert.equal(state.activate(stage()).changed, true);
state.registerDomain(domain, stage());
state.registerGeometryEvidence(evidence, stage());
let projections = state.buildProjections(stage());
assert.equal(projections.analysisDomainProjection.state, 'CURRENT_PASS');
assert.equal(projections.analysisGeometryProjection.state, 'CURRENT_PASS');
state.invalidate('LAFEA.3');
projections = state.buildProjections(stage());
assert.equal(projections.analysisDomainProjection.state, 'STALE');
assert.ok(projections.analysisDomainProjection.reasons.includes('DOMAIN_FIRST_EXPLICIT_REVALIDATION_REQUIRED'));
expectCode(() => state.registerGeometryEvidence(evidence, stage()), 'LAFEA_ANALYSIS_DOMAIN_NOT_CURRENT');
state.registerDomain(domain, stage());
state.registerGeometryEvidence(evidence, stage());
assert.equal(state.buildProjections(stage()).analysisGeometryProjection.state, 'CURRENT_PASS');
const beforeConflict = state.fields('LAFEA.3').domainFirstLifecycle;
const conflict = createLafeaAnalysisGeometryEvidence({
  schema: LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_SCHEMA, stageId: 'LAFEA.3',
  sourceHash: SOURCE, analysisDomain: domain, geometry,
  producerRef: 'MP2/CONFLICT', profileId: LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_PROFILE,
});
expectCode(() => state.registerGeometryEvidence(conflict, stage()), 'LAFEA_ANALYSIS_GEOMETRY_CONFLICTING_REPLAY');
assert.deepEqual(state.fields('LAFEA.3').domainFirstLifecycle, beforeConflict);

const prep = createLafeaPreparationRequestV2({
  schema: LAFEA_PREPARATION_REQUEST_V2_SCHEMA,
  stageId: 'LAFEA.3',
  sourceHash: SOURCE,
  analysisDomainHash: domain.semanticHash,
  analysisGeometryHash: geometry.semanticHash,
  preparationProfileId: 'LAFEA_PREPARATION_BASELINE:LAFEA.3:V1',
  preparationProfileHash: hash('PREP'),
  requestedCaseIds: ['LC-OPE', 'LC-SUS'],
  stageAdapterId: 'LAFEA_STAGE_ADAPTER:LAFEA.3:V1',
  stageAdapterRevision: 'V1',
});
assert.equal(prep.schema, LAFEA_PREPARATION_REQUEST_V2_SCHEMA);
assert.equal(Object.hasOwn(prep, 'canonicalModelHash'), false);

const intent = createLafeaMeshGenerationIntentV2({
  schema: LAFEA_MESH_GENERATION_INTENT_V2_SCHEMA,
  stageId: 'LAFEA.3',
  sourceHash: SOURCE,
  analysisDomainHash: domain.semanticHash,
  analysisGeometryHash: geometry.semanticHash,
  meshProfileHash: hash('MESH-PROFILE'),
  targetElementLength: 5,
  lengthUnit: 'mm',
  elementFamily: 'T6',
  curvatureToleranceDegrees: 5,
  growthLimit: 1.5,
  maximumNodes: 1000,
  maximumElements: 1000,
  maximumEstimatedDofs: 2000,
  refinementFeatureIds: ['S2'],
  allowT3Fallback: false,
  stageAdapterId: 'LAFEA_STAGE_ADAPTER:LAFEA.3:V1',
  stageAdapterRevision: 'V1',
});
assert.equal(intent.executionAuthorized, false);
assert.equal(Object.hasOwn(intent, 'canonicalModelHash'), false);
expectCode(() => createLafeaMeshGenerationIntentV2({
  ...Object.fromEntries([
    'schema', 'stageId', 'sourceHash', 'analysisDomainHash', 'analysisGeometryHash',
    'meshProfileHash', 'targetElementLength', 'lengthUnit', 'elementFamily',
    'curvatureToleranceDegrees', 'growthLimit', 'maximumNodes', 'maximumElements',
    'maximumEstimatedDofs', 'refinementFeatureIds', 'allowT3Fallback',
    'stageAdapterId', 'stageAdapterRevision',
  ].map((key) => [key, intent[key]])),
  elementFamily: 'T3',
  allowT3Fallback: false,
}), 'LAFEA_MESH_GENERATION_V2_T3_FALLBACK_NOT_AUTHORIZED');

const capability = createLafeaMeshProducerCapability({
  schema: LAFEA_MESH_PRODUCER_CAPABILITY_SCHEMA,
  producerId: 'MP2-FUTURE-T6',
  producerRevision: 'TEST-1',
  scopes: [{ stageId: 'LAFEA.3', elementFamilies: ['T6'] }],
  generationModes: ['AUTOMATIC_MESH'],
  supportsLocalRefinement: false,
  repeatabilityPolicy: LAFEA_MESH_REPEATABILITY_POLICY,
  qualityPolicyId: 'MESH-QUALITY-POLICY-V1',
  rollbackPolicy: LAFEA_MESH_ROLLBACK_POLICY,
  publicationPolicy: LAFEA_MESH_PUBLICATION_POLICY,
  maximumNodes: 1000,
  maximumElements: 1000,
  maximumEstimatedDofs: 2000,
});
const qualification = createLafeaMeshProducerQualification({
  schema: LAFEA_MESH_PRODUCER_QUALIFICATION_SCHEMA,
  qualificationId: 'MP2-FUTURE-T6-TEST',
  qualificationRevision: 'TEST-1',
  capabilityHash: capability.capabilityHash,
  authorizedScopes: [{ stageId: 'LAFEA.3', elementFamilies: ['T6'] }],
  authorizedGenerationModes: ['AUTOMATIC_MESH'],
  localRefinementAuthorized: false,
  maximumNodes: 1000,
  maximumElements: 1000,
  maximumEstimatedDofs: 2000,
  repeatabilityPolicy: LAFEA_MESH_REPEATABILITY_POLICY,
  qualityPolicyId: 'MESH-QUALITY-POLICY-V1',
  rollbackPolicy: LAFEA_MESH_ROLLBACK_POLICY,
  publicationPolicy: LAFEA_MESH_PUBLICATION_POLICY,
  governanceRef: 'ISSUE-868-TEST-ONLY',
  invalidationPolicy: 'INVALIDATE_ON_PARENT_OR_QUALIFICATION_CHANGE',
});
const readiness = buildLafeaMeshProducerReadinessV2(intent, capability, qualification);
assert.equal(readiness.schema, LAFEA_MESH_PRODUCER_READINESS_V2_SCHEMA);
assert.equal(readiness.producerContractReady, true);
assert.equal(readiness.executionAuthorized, false);

const profile = meshProfile('T6');
const mesh = t6Mesh();
const meshHash = lafeaAnalysisMeshContentHash(mesh);
const meshEvidence = createLafeaAnalysisMeshEvidenceV2({
  schema: LAFEA_ANALYSIS_MESH_INTAKE_V2_SCHEMA,
  stageId: 'LAFEA.3',
  sourceHash: SOURCE,
  analysisDomainHash: domain.semanticHash,
  analysisGeometryHash: geometry.semanticHash,
  meshProfile: profile,
  mesh,
  authority: {
    schema: LAFEA_ANALYSIS_MESH_AUTHORITY_V2_SCHEMA,
    stageId: 'LAFEA.3',
    authorityRole: LAFEA_ANALYSIS_MESH_AUTHORITY_V2_ROLE,
    status: 'ACCEPTED_BY_STAGE_CONTRACT',
    producerRef: 'TEST-ONLY-NOT-QUALIFIED',
    sourceHash: SOURCE,
    analysisDomainHash: domain.semanticHash,
    analysisGeometryHash: geometry.semanticHash,
    meshProfileHash: profile.semanticHash,
    meshHash,
    capabilityHash: capability.capabilityHash,
    qualificationHash: qualification.qualificationHash,
    planHash: hash('PLAN'),
  },
});
assert.equal(validateLafeaAnalysisMeshEvidenceV2(meshEvidence).artifactHash, meshEvidence.artifactHash);
assert.equal(meshEvidence.releaseQualified, false);

expectCode(() => createLafeaAnalysisGeometry({
  ...squareWithCircularHole(),
  vertices: [
    { vertexId: 'A', x: 0, y: 0 }, { vertexId: 'B', x: 10, y: 10 },
    { vertexId: 'C', x: 0, y: 10 }, { vertexId: 'D', x: 10, y: 0 },
    ...squareWithCircularHole().vertices.filter((row) => row.vertexId.startsWith('H')),
  ],
}), 'LAFEA_ANALYSIS_GEOMETRY_OUTER_ORIENTATION_INVALID', 'LAFEA_ANALYSIS_GEOMETRY_SELF_INTERSECTION');

const guarded = [
  'src/workspace/lafea-analysis-geometry-contract.js',
  'src/workspace/lafea-analysis-geometry-topology.js',
  'src/workspace/lafea-analysis-geometry-evidence.js',
  'src/workspace/lafea-continuum-analysis-domain.js',
  'src/workspace/lafea-domain-first-lifecycle.js',
  'src/workspace/lafea-domain-first-requests.js',
  'src/workspace/lafea-domain-first-producer-readiness.js',
  'src/workspace/lafea-analysis-mesh-evidence-v2.js',
  'src/workspace/lafea-domain-first-mesh-custody.js',
  'src/workspace/lafea-workbench-geometry-state.js',
  'src/workspace/lafea-workbench-orchestrator-api.js',
  'src/workspace/lafea-workbench-orchestrator-store.js',
  'src/workspace/lafea-workbench-readiness.js',
  'src/workspace/lafea-workbench-orchestration-projection.js',
  'scripts/lafea-mp2-domain-geometry-check.mjs',
  'scripts/lafea-mp2-domain-geometry-fixtures.mjs',
];
for (const path of guarded) {
  const source = fs.readFileSync(path, 'utf8');
  assert.ok(source.split(/\r?\n/u).length - 1 < 300, `${path} exceeds 299 physical lines`);
}
const domainSources = guarded.slice(0, 10).map((path) => fs.readFileSync(path, 'utf8')).join('\n');
assert.doesNotMatch(domainSources, /\bexecuteLafeaStage\b|\bcalculateLocalContinuum\b|\bregisterLafeaArtifact\b|\brecoverLafea\b|releaseQualified\s*:\s*true/u);
const orchestratorSource = fs.readFileSync('src/workspace/lafea-workbench-orchestrator-store.js', 'utf8');
assert.match(orchestratorSource, /LAFEA_DOMAIN_FIRST_SOLVER_MODEL_NOT_COMPILED/u);
assert.doesNotMatch(orchestratorSource, /LAFEA_DOMAIN_FIRST_ANALYSIS_MESH_REQUIRES_V2_CUSTODY/u);

console.log(JSON.stringify({
  check: 'lafea-mp2-domain-geometry',
  status: 'PASS',
  domainFirstProfile: 'FEA_DOMAIN_FIRST_V1',
  geometryHash: geometry.semanticHash,
  domainHash: domain.semanticHash,
  meshGenerationIntentV2Executable: intent.executionAuthorized,
  producerExecutionAuthorized: readiness.executionAuthorized,
  realMeshGenerated: false,
  solverExecution: false,
  releaseQualified: false,
}));

function expectCode(body, ...codes) {
  assert.throws(body, (error) => {
    assert.ok(codes.includes(error?.code), `expected ${codes.join('|')}, received ${error?.code}`);
    return true;
  });
}