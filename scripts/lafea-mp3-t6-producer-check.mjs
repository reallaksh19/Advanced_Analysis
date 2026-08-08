#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILE_KINDS, canonicalProfile } from '../src/core/lafea-profile-contract/index.js';
import { LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_PROFILE, LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_SCHEMA, createLafeaAnalysisGeometryEvidence } from '../src/workspace/lafea-analysis-geometry-evidence.js';
import { LAFEA_ANALYSIS_GEOMETRY_ORIENTATION_POLICY, LAFEA_ANALYSIS_GEOMETRY_SCHEMA, createLafeaAnalysisGeometry } from '../src/workspace/lafea-analysis-geometry-contract.js';
import { LAFEA_CONTINUUM_ANALYSIS_DOMAIN_SCHEMA, createLafeaContinuumAnalysisDomain } from '../src/workspace/lafea-continuum-analysis-domain.js';
import { LAFEA_MESH_GENERATION_INTENT_V2_SCHEMA, createLafeaMeshGenerationIntentV2 } from '../src/workspace/lafea-domain-first-requests.js';
import { createLafeaDomainFirstArtifact, createLafeaDomainFirstLifecycle, registerLafeaDomainFirstArtifact } from '../src/workspace/lafea-domain-first-lifecycle.js';
import { executeLafeaDomainFirstT6Mesh, planLafeaDomainFirstT6Mesh } from '../src/workspace/lafea-domain-first-t6-producer.js';
import { validateLafeaDomainFirstMeshProducerOutputV2 } from '../src/workspace/lafea-domain-first-producer-output-v2.js';
import { createLafeaWorkbenchDomainFirstMeshState } from '../src/workspace/lafea-workbench-domain-first-mesh-state.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = canonicalLafeaSha256({ fixture: 'MP3-SOURCE' });

console.log('\n--- LAFEA WP-MP3 T6 producer and v2 custody check ---');
const square = fixture(squareGeometry(), 10, 100);
const firstPlan = planLafeaDomainFirstT6Mesh(square.input);
assert.equal(firstPlan.producesMesh, false);
assert.equal(firstPlan.engineeringAuthority, false);
assert.equal(firstPlan.policyDisposition, 'PASS');
const first = executeLafeaDomainFirstT6Mesh(square.input);
const replay = executeLafeaDomainFirstT6Mesh(square.input);
assert.equal(first.status, 'QUALIFIED');
assert.equal(first.custodyEligible, true);
assert.equal(first.output.meshHash, replay.output.meshHash);
assert.equal(first.evidence.artifactHash, replay.evidence.artifactHash);
assert.equal(first.output.mesh.nodes.length, 9, 'two T6 triangles must share one diagonal midside');
assert.equal(first.output.mesh.elements.length, 2);
assert.ok(first.output.mesh.nodes.every((node) => node.z === 0));
assert.equal(
  validateLafeaDomainFirstMeshProducerOutputV2(first.output, {
    intent: square.intent, plan: first.plan,
  }).outputHash,
  first.output.outputHash,
);
console.log('✅ deterministic square T6 generation, shared midsides and output reconstruction');

const concave = executeLafeaDomainFirstT6Mesh(fixture(concaveGeometry(), 10, 100).input);
assert.equal(concave.status, 'QUALIFIED');
assert.ok(concave.output.mesh.elements.length >= 4);
console.log('✅ concave simple outer loop produces qualified T6 mesh');

const arc = fixture(semicircleGeometry(), 5, 100);
const arcExecution = executeLafeaDomainFirstT6Mesh(arc.input);
const analyticBoundaryMidsides = arcExecution.output.mesh.nodes.filter((node) =>
  node.nodeId.startsWith('MP3-M-')
  && node.y > 1e-8
  && Math.abs(Math.hypot(node.x, node.y) - 5) < 1e-9);
assert.ok(analyticBoundaryMidsides.length > 0);
console.log('✅ circular boundary midsides remain on the analytic arc');

const hole = fixture(squareWithHoleGeometry(), 10, 100);
expectCode(() => planLafeaDomainFirstT6Mesh(hole.input), 'LAFEA_MP3_HOLES_NOT_QUALIFIED');
expectCode(() => planLafeaDomainFirstT6Mesh({
  ...square.input,
  intent: intent(square.domain, square.geometry, square.profile, {
    elementFamily: 'T3', allowT3Fallback: true,
  }),
}), 'CAPABILITY_SCOPE_MISMATCH', 'LAFEA_MP3_T6_FAMILY_REQUIRED');
expectCode(() => planLafeaDomainFirstT6Mesh({
  ...square.input,
  intent: intent(square.domain, square.geometry, square.profile, { elementFamily: 'Q8' }),
}), 'CAPABILITY_SCOPE_MISMATCH', 'LAFEA_MP3_T6_FAMILY_REQUIRED');
expectCode(() => planLafeaDomainFirstT6Mesh({
  ...square.input,
  intent: intent(square.domain, square.geometry, square.profile, {
    refinementFeatureIds: ['S1'],
  }),
}), 'LAFEA_MESH_PRODUCER_READINESS_V2_REFINEMENT_NOT_AUTHORIZED', 'LAFEA_MP3_REFINEMENT_NOT_QUALIFIED');
const blockedResource = fixture(squareGeometry(), 10, 100, { maximumElements: 1 });
const blockedPlan = planLafeaDomainFirstT6Mesh(blockedResource.input);
assert.equal(blockedPlan.resourceDisposition, 'BLOCK');
expectCode(() => executeLafeaDomainFirstT6Mesh(blockedResource.input), 'LAFEA_MP3_PLAN_BLOCKED');
console.log('✅ holes, family widening, refinement and resource widening fail closed');

const custody = createLafeaWorkbenchDomainFirstMeshState(['LAFEA.3']);
const stage = currentStage(square);
const prepared = custody.prepareRegistration(first.evidence, stage);
assert.equal(prepared.changed, true);
custody.commitRegistration(prepared, stage);
assert.equal(custody.buildProjection(stage).state, 'CURRENT_PASS');
assert.equal(custody.prepareRegistration(first.evidence, stage).changed, false);
const overlay = custody.lifecycleOverlay(stage);
assert.equal(overlay.domainFirstReadiness.meshQualified, true);
assert.equal(overlay.domainFirstLifecycle.artifacts.ANALYSIS_MESH.artifactHash, first.output.meshHash);
const refinedRequest = fixture(squareGeometry(), 5, 100);
const replacement = executeLafeaDomainFirstT6Mesh(refinedRequest.input);
const replacePrepared = custody.prepareRegistration(replacement.evidence, stage);
assert.equal(replacePrepared.changed, true);
custody.commitRegistration(replacePrepared, stage);
assert.equal(custody.select('LAFEA.3').artifactHash, replacement.evidence.artifactHash);
const staleStage = { ...stage, domainFirstCustodyEpoch: 2 };
assert.equal(custody.buildProjection(staleStage).state, 'STALE');
assert.deepEqual(custody.lifecycleOverlay(staleStage), {});
expectCode(() => custody.prepareRegistration(first.evidence, {
  ...stage, sourceAuthority: { sourceHash: canonicalLafeaSha256({ fixture: 'OTHER' }) },
}), 'LAFEA_MP3_MESH_EVIDENCE_PARENT_STALE');
console.log('✅ v2 custody is atomic, replay-idempotent, replaceable and non-resurrecting');

sourceAndLineGuards();
console.log('✅ architecture/import guards and <300-line rule');
console.log('\n✅ LAFEA WP-MP3 check passed.\n');

function fixture(geometryInput, target, growth, limits = {}) {
  const geometry = createLafeaAnalysisGeometry(geometryInput);
  const domain = createLafeaContinuumAnalysisDomain({
    schema: LAFEA_CONTINUUM_ANALYSIS_DOMAIN_SCHEMA,
    stageId: 'LAFEA.3',
    sourceHash: SOURCE,
    applicationRef: 'MP3-QUALIFICATION-FIXTURE',
    units: { length: 'mm', force: 'N', stress: 'MPa', temperature: 'C' },
    formulation: 'PLANE_STRESS',
    region: { regionId: 'REGION', materialRef: 'MAT' },
    physicalCases: [{ caseId: 'LC1' }],
    attachments: [],
  }, geometry);
  const evidence = createLafeaAnalysisGeometryEvidence({
    schema: LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_SCHEMA,
    stageId: 'LAFEA.3',
    sourceHash: SOURCE,
    analysisDomain: domain,
    geometry,
    producerRef: 'MP3-QUALIFICATION-GEOMETRY',
    profileId: LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_PROFILE,
  });
  const profile = meshProfile(target, growth);
  const request = intent(domain, geometry, profile, limits);
  return {
    geometry, domain, evidence, profile, intent: request,
    input: {
      intent: request,
      analysisDomain: domain,
      analysisGeometryEvidence: evidence,
      meshProfile: profile,
    },
  };
}

function intent(domain, geometry, profile, overrides = {}) {
  return createLafeaMeshGenerationIntentV2({
    schema: LAFEA_MESH_GENERATION_INTENT_V2_SCHEMA,
    stageId: 'LAFEA.3',
    sourceHash: SOURCE,
    analysisDomainHash: domain.semanticHash,
    analysisGeometryHash: geometry.semanticHash,
    meshProfileHash: profile.semanticHash,
    targetElementLength: profile.fields.globalTargetSize,
    lengthUnit: 'mm',
    elementFamily: 'T6',
    curvatureToleranceDegrees: 10,
    growthLimit: profile.fields.adjacentSizeRatioMax,
    maximumNodes: 1000,
    maximumElements: 1000,
    maximumEstimatedDofs: 2000,
    refinementFeatureIds: [],
    allowT3Fallback: false,
    stageAdapterId: 'LAFEA_STAGE_ADAPTER:LAFEA.3:V1',
    stageAdapterRevision: 'V1',
    ...overrides,
  });
}

function meshProfile(target, growth) {
  return canonicalProfile(PROFILE_KINDS.MESH, {
    schema: 'lafea-mesh-profile/v1',
    profileIdentity: `MP3-T6-${target}-${growth}`,
    sourceRevision: 'MP3.1',
    fields: {
      continuumElement: 'T6',
      shellElement: 'CST_DKT_TRI3_THIN_SHELL_V1',
      globalTargetSize: target,
      adjacentSizeRatioMax: growth,
      aspectRatioWarn: 500,
      aspectRatioBlock: 1000,
      scaledJacobianWarn: 1e-5,
      scaledJacobianBlock: 1e-6,
      adaptiveLevels: 3,
    },
    semanticHash: undefined,
  });
}

function currentStage(f) {
  let lifecycle = createLafeaDomainFirstLifecycle(SOURCE, 1);
  lifecycle = registerLafeaDomainFirstArtifact(lifecycle, createLafeaDomainFirstArtifact({
    kind: 'ANALYSIS_DOMAIN', status: 'CURRENT', artifactHash: f.domain.semanticHash,
    parentHashes: { sourceHash: SOURCE }, qualification: 'PASS', producerRef: 'MP2',
  }), 'DOMAIN');
  lifecycle = registerLafeaDomainFirstArtifact(lifecycle, createLafeaDomainFirstArtifact({
    kind: 'ANALYSIS_GEOMETRY', status: 'CURRENT', artifactHash: f.geometry.semanticHash,
    parentHashes: { sourceHash: SOURCE, analysisDomainHash: f.domain.semanticHash },
    qualification: 'PASS', producerRef: 'MP2',
  }), 'GEOMETRY');
  return {
    stageId: 'LAFEA.3',
    domainFirstProfileActive: true,
    domainFirstCustodyEpoch: 1,
    domainFirstLifecycle: lifecycle,
    lifecycleBinding: { status: 'CURRENT' },
    sourceAuthority: { sourceHash: SOURCE },
    analysisDomainProjection: {
      state: 'CURRENT_PASS', analysisDomainHash: f.domain.semanticHash,
    },
    analysisGeometryProjection: {
      state: 'CURRENT_PASS', analysisGeometryHash: f.geometry.semanticHash,
    },
  };
}

function squareGeometry() {
  return geometry([
    ['A', 0, 0], ['B', 10, 0], ['C', 10, 10], ['D', 0, 10],
  ], [
    line('S1', 'A', 'B'), line('S2', 'B', 'C'),
    line('S3', 'C', 'D'), line('S4', 'D', 'A'),
  ], [{ loopId: 'OUTER', role: 'OUTER', segmentIds: ['S1', 'S2', 'S3', 'S4'] }], 'SQUARE');
}
function concaveGeometry() {
  return geometry([
    ['A', 0, 0], ['B', 20, 0], ['C', 20, 10],
    ['D', 10, 10], ['E', 10, 20], ['F', 0, 20],
  ], [
    line('S1', 'A', 'B'), line('S2', 'B', 'C'), line('S3', 'C', 'D'),
    line('S4', 'D', 'E'), line('S5', 'E', 'F'), line('S6', 'F', 'A'),
  ], [{ loopId: 'OUTER', role: 'OUTER',
    segmentIds: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'] }], 'CONCAVE-L');
}
function semicircleGeometry() {
  return geometry([
    ['A', -5, 0], ['B', 0, 5], ['C', 5, 0],
  ], [
    line('S1', 'A', 'C'),
    { segmentId: 'S2', type: 'CIRCULAR_ARC', startVertexId: 'C', endVertexId: 'B',
      centerX: 0, centerY: 0, radius: 5, sweep: 'CCW' },
    { segmentId: 'S3', type: 'CIRCULAR_ARC', startVertexId: 'B', endVertexId: 'A',
      centerX: 0, centerY: 0, radius: 5, sweep: 'CCW' },
  ], [{ loopId: 'OUTER', role: 'OUTER', segmentIds: ['S1', 'S2', 'S3'] }], 'SEMICIRCLE');
}
function squareWithHoleGeometry() {
  return geometry([
    ['A', 0, 0], ['B', 10, 0], ['C', 10, 10], ['D', 0, 10],
    ['H1', 3, 3], ['H2', 3, 7], ['H3', 7, 7], ['H4', 7, 3],
  ], [
    line('S1', 'A', 'B'), line('S2', 'B', 'C'), line('S3', 'C', 'D'), line('S4', 'D', 'A'),
    line('H1S', 'H1', 'H2'), line('H2S', 'H2', 'H3'),
    line('H3S', 'H3', 'H4'), line('H4S', 'H4', 'H1'),
  ], [
    { loopId: 'OUTER', role: 'OUTER', segmentIds: ['S1', 'S2', 'S3', 'S4'] },
    { loopId: 'HOLE', role: 'HOLE', segmentIds: ['H1S', 'H2S', 'H3S', 'H4S'] },
  ], 'HOLE');
}
function geometry(vertices, segments, loops, id) {
  return {
    schema: LAFEA_ANALYSIS_GEOMETRY_SCHEMA, stageId: 'LAFEA.3',
    geometryId: id, coordinateSystemId: 'XY', lengthUnit: 'mm',
    orientationPolicy: LAFEA_ANALYSIS_GEOMETRY_ORIENTATION_POLICY,
    vertices: vertices.map(([vertexId, x, y]) => ({ vertexId, x, y })),
    segments, loops,
  };
}
function line(segmentId, startVertexId, endVertexId) {
  return { segmentId, type: 'LINE', startVertexId, endVertexId };
}

function sourceAndLineGuards() {
  const files = [
    'src/workspace/lafea-domain-first-mesh-profile.js', 'src/workspace/lafea-domain-first-mesh-plan-v2.js',
    'src/workspace/lafea-domain-first-producer-output-v2.js', 'src/workspace/lafea-domain-first-t6-producer-policy.js',
    'src/workspace/lafea-domain-first-t6-geometry-adapter.js', 'src/workspace/lafea-domain-first-t6-producer.js',
    'src/workspace/lafea-domain-first-lifecycle-mesh-transition.js', 'src/workspace/lafea-workbench-domain-first-mesh-state.js',
    'src/workspace/lafea-analysis-mesh-evidence-v2.js', 'src/workspace/lafea-domain-first-mesh-custody.js',
    'src/workspace/lafea-domain-first-requests.js', 'src/workspace/lafea-mp3-mesh-producer-public.js',
    'src/workspace/lafea-domain-geometry-public.js', 'src/workspace/lafea-workbench-orchestrator-api.js',
    'src/workspace/lafea-workbench-orchestrator-store.js', 'scripts/lafea-mp3-t6-producer-check.mjs',
  ];
  for (const rel of files) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(text.split(/\r?\n/u).length < 300, `${rel} must remain below 300 physical lines`);
    if (rel.includes('mp3') || rel.includes('domain-first-t6')) {
      assert.doesNotMatch(text, /from ['"][^'"]*(?:solver|recovery|report|release)[^'"]*['"]/u);
    }
  }
  const store = fs.readFileSync(path.join(ROOT, 'src/workspace/lafea-workbench-orchestrator-store.js'), 'utf8');
  assert.doesNotMatch(store, /LAFEA_DOMAIN_FIRST_ANALYSIS_MESH_REQUIRES_V2_CUSTODY/u);
  assert.match(store, /domainMesh\.buildProjection/u);
  const api = fs.readFileSync(path.join(ROOT, 'src/workspace/lafea-workbench-orchestrator-api.js'), 'utf8');
  assert.match(api, /generateDomainT6Mesh/u);
}
function expectCode(fn, ...codes) {
  assert.throws(fn, (error) => codes.includes(error?.code));
}
