#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PROFILE_KINDS,
  canonicalProfile,
} from '../src/core/lafea-profile-contract/index.js';
import {
  LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
  LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
  LAFEA_ANALYSIS_MESH_SCHEMA,
  createLafeaAnalysisMeshEvidence,
  lafeaAnalysisMeshContentHash,
  registerLafeaAnalysisMeshEvidence,
} from '../src/workspace/lafea-analysis-mesh-evidence.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  applyLafeaLifecycleEvent,
  createLafeaArtifactRecord,
  createLafeaLifecycle,
  createLafeaLifecycleEvent,
  lafeaLifecycleReadiness,
  registerLafeaArtifact,
} from '../src/workspace/lafea-lifecycle.js';
import {
  LAFEA_RECOVERY_RENDER_FIELD_REQUEST_SCHEMA,
  LAFEA_RECOVERY_RENDER_INTAKE_SCHEMA,
  LAFEA_RECOVERY_RENDER_LOCATION_SCHEMA,
  LAFEA_RECOVERY_RENDER_PACKAGE_SCHEMA,
  LAFEA_RECOVERY_RENDER_PRODUCER_REVISION,
  createLafeaRecoveryRenderPackage,
  lafeaRecoveryRenderDisplayGeometryHash,
  lafeaRecoveryRenderProfileHash,
  registerLafeaRecoveryRenderPackage,
} from '../src/workspace/lafea-recovery-render-producer.js';
import { evaluateLafeaRenderEvidenceIntake } from '../src/workspace/lafea-render-evidence-intake.js';
import { issueLafeaSourceAuthority } from '../src/workspace/lafea-source-authority.js';

const t3 = t3Harness();
const t3Package = createLafeaRecoveryRenderPackage(t3.intake);
assert.equal(t3Package.schema, LAFEA_RECOVERY_RENDER_PACKAGE_SCHEMA);
assert.equal(t3Package.producerRevision, LAFEA_RECOVERY_RENDER_PRODUCER_REVISION);
assert.equal(t3Package.stageId, 'LAFEA.3');
assert.equal(t3Package.calculationState,
  'CALCULATION_ACCEPTED_BY_STAGE_CONTRACT');
assert.equal(t3Package.releaseState, 'RELEASE_NOT_QUALIFIED');
assert.equal(t3Package.convergenceProduced, false);
assert.equal(t3Package.codeAssessmentProduced, false);
assert.equal(t3Package.reportProduced, false);
assert.equal(t3Package.releaseQualified, false);
assert.equal(t3Package.renderPacket.field.valueRole,
  'PRODUCER_PROJECTED_DISPLAY_ONLY');
assert.equal(t3Package.renderPacket.field.kind, 'ELEMENT');
assert.deepEqual([...t3Package.renderPacket.fieldValues], [10, 10, 10, 30, 30, 30]);
assert.ok(![...t3Package.renderPacket.fieldValues].includes(20),
  'shared-node values must never be cross-element averaged');
assert.deepEqual(t3Package.renderPacket.vertexMeshNodeIds,
  ['A', 'B', 'C', 'B', 'D', 'C']);
assert.deepEqual(t3Package.renderPacket.sourceElementIds, ['E1', 'E2']);
assert.deepEqual([...t3Package.renderPacket.drawTriangleElementIndices], [0, 1]);
assert.equal(t3Package.displayField.values[0].sourcePath,
  'result.loadCaseResults[0].elementResults[0].stress.sigmaX');
assert.equal(t3Package.renderPacket.lineage.meshHash,
  t3.meshEvidence.artifactHash);
assert.equal(t3Package.renderPacket.lineage.topologyHash,
  t3.meshEvidence.analysisGeometryHash);
assert.ok(Object.isFrozen(t3Package));
assert.ok(Object.isFrozen(t3Package.displayField.values));

const t3Lifecycle = registerLafeaRecoveryRenderPackage(t3.lifecycle, t3Package);
const t3Readiness = lafeaLifecycleReadiness(t3Lifecycle);
assert.equal(t3Readiness.meshQualified, true);
assert.equal(t3Readiness.resultReady, true);
assert.equal(t3Readiness.convergenceReady, false);
assert.equal(t3Readiness.codeReady, false);
const renderIntake = evaluateLafeaRenderEvidenceIntake({
  stageId: 'LAFEA.3',
  sceneRevision: t3Package.sceneRevision,
  packet: t3Package.renderPacket,
  lifecycle: t3Lifecycle,
  lifecycleBinding: lifecycleBinding(t3.authority.documentRevisionDigest),
});
assert.equal(renderIntake.status, 'READY');
assert.equal(renderIntake.renderEvidenceReady, true);

const q8 = q8Harness();
const q8Package = createLafeaRecoveryRenderPackage(q8.intake);
assert.equal(q8Package.renderPacket.sourceElementType, 'Q8');
assert.equal(q8Package.renderPacket.field.kind, 'INTEGRATION_POINT');
assert.equal(q8Package.renderPacket.vertexMeshNodeIds.length, 4,
  'Q8 result tessellation is corner-only display geometry');
assert.deepEqual([...q8Package.renderPacket.drawTriangleIndices],
  [0, 1, 2, 0, 2, 3]);
assert.deepEqual([...q8Package.renderPacket.fieldValues], [44, 44, 44, 44]);
assert.equal(q8Package.displayField.values[0].authorityLayer,
  'INTEGRATION_POINT_RETAINED_ENGINEERING_RESULT');

const shell = shellHarness('LAFEA.4');
const shellPackage = createLafeaRecoveryRenderPackage(shell.intake);
assert.equal(shellPackage.renderPacket.sourceElementType, 'CST_DKT_TRI3');
assert.equal(shellPackage.renderPacket.field.kind, 'SHELL_TOP');
assert.deepEqual([...shellPackage.renderPacket.fieldValues], [125, 125, 125]);
assert.equal(shellPackage.displayField.values[0].authorityLayer,
  'SHELL_SURFACE_RETAINED_ENGINEERING_RESULT');
assert.doesNotMatch(shellPackage.renderPacket.lineage.producerRef, /MITC/u);

const trunnion = shellHarness('LAFEA.5');
const trunnionPackage = createLafeaRecoveryRenderPackage(trunnion.intake);
assert.equal(trunnionPackage.stageId, 'LAFEA.5');
assert.equal(trunnionPackage.displayField.values[0].sourcePath,
  'result.rawShellResult.loadCaseResults[0].elementResults[0].integrationPoints[0].surfaces[2].combinedStress.sigmaX');
assert.equal(lafeaLifecycleReadiness(
  registerLafeaRecoveryRenderPackage(trunnion.lifecycle, trunnionPackage),
).resultReady, true);

expectCode(() => createLafeaRecoveryRenderPackage({
  ...t3.intake, stageId: 'LAFEA.1',
}), 'LAFEA_RECOVERY_RENDER_STAGE_NOT_FEA');
expectCode(() => createLafeaRecoveryRenderPackage({
  ...t3.intake, stageId: 'LAFEA.6',
}), 'LAFEA_RECOVERY_RENDER_STAGE_NOT_FEA');

const failedExecution = clone(t3.intake);
failedExecution.execution.status = 'FAILED';
expectCode(() => createLafeaRecoveryRenderPackage(failedExecution),
  'LAFEA_RECOVERY_RENDER_EXECUTION_INVALID');

const rejectedExecution = clone(t3.intake);
rejectedExecution.execution.result.qualification.state = 'REJECTED';
expectCode(() => createLafeaRecoveryRenderPackage(rejectedExecution),
  'LAFEA_RECOVERY_RENDER_CALCULATION_NOT_ACCEPTED');

const staleAuthority = clone(t3.intake);
staleAuthority.sourceAuthority.sourceHash = hash('STALE-SOURCE');
expectCode(() => createLafeaRecoveryRenderPackage(staleAuthority),
  'LAFEA_RECOVERY_RENDER_LIFECYCLE_MISMATCH');

const changedCanonical = clone(t3.intake);
changedCanonical.execution.canonicalInput.modelMarker = 'CHANGED';
expectCode(() => createLafeaRecoveryRenderPackage(changedCanonical),
  'LAFEA_RECOVERY_RENDER_CANONICAL_MODEL_MISMATCH');

const staleMeshLifecycle = clone(t3.intake);
staleMeshLifecycle.lifecycle.artifacts.ANALYSIS_MESH.artifactHash = hash('STALE-MESH');
expectCode(() => createLafeaRecoveryRenderPackage(staleMeshLifecycle),
  'LAFEA_RECOVERY_RENDER_MESH_PARENT_STALE');

const tamperedMeshEvidence = clone(t3.intake);
tamperedMeshEvidence.analysisMeshEvidence.quality.elementCount = 99;
expectCode(() => createLafeaRecoveryRenderPackage(tamperedMeshEvidence),
  'LAFEA_RECOVERY_RENDER_ANALYSIS_MESH_EVIDENCE_INVALID');

const staleDisplayGeometry = clone(t3.intake);
staleDisplayGeometry.lifecycle.display.displayMeshDensityHash = hash('OTHER-DISPLAY');
expectCode(() => createLafeaRecoveryRenderPackage(staleDisplayGeometry),
  'LAFEA_RECOVERY_RENDER_DISPLAY_GEOMETRY_PROFILE_STALE');

const staleRenderProfile = clone(t3.intake);
staleRenderProfile.lifecycle.display.contourPaletteHash = hash('OTHER-RENDER');
expectCode(() => createLafeaRecoveryRenderPackage(staleRenderProfile),
  'LAFEA_RECOVERY_RENDER_PROFILE_STALE');

const wrongUnit = clone(t3.intake);
wrongUnit.fieldRequest.units = 'Pa';
wrongUnit.lifecycle.display.contourPaletteHash =
  lafeaRecoveryRenderProfileHash(wrongUnit.fieldRequest);
expectCode(() => createLafeaRecoveryRenderPackage(wrongUnit),
  'LAFEA_RECOVERY_RENDER_STRESS_UNIT_MISMATCH');

const missingCase = clone(t3.intake);
missingCase.fieldRequest.loadCaseId = 'MISSING';
missingCase.lifecycle.display.contourPaletteHash =
  lafeaRecoveryRenderProfileHash(missingCase.fieldRequest);
expectCode(() => createLafeaRecoveryRenderPackage(missingCase),
  'LAFEA_RECOVERY_RENDER_LOAD_CASE_NOT_FOUND');

const missingElement = clone(t3.intake);
missingElement.execution.result.loadCaseResults[0].elementResults.pop();
expectCode(() => createLafeaRecoveryRenderPackage(missingElement),
  'LAFEA_RECOVERY_RENDER_ELEMENT_RESULT_NOT_FOUND');

const t3WrongLocation = clone(t3.intake);
t3WrongLocation.fieldRequest.location = location('INTEGRATION_POINT', 0, null);
t3WrongLocation.lifecycle.display.contourPaletteHash =
  lafeaRecoveryRenderProfileHash(t3WrongLocation.fieldRequest);
expectCode(() => createLafeaRecoveryRenderPackage(t3WrongLocation),
  'LAFEA_RECOVERY_RENDER_T3_LOCATION_INVALID');

const q8AuthorityMissing = clone(q8.intake);
delete q8AuthorityMissing.execution.result.loadCaseResults[0]
  .elementResults[0].recoveryLayer;
expectCode(() => createLafeaRecoveryRenderPackage(q8AuthorityMissing),
  'LAFEA_RECOVERY_RENDER_INTEGRATION_POINT_AUTHORITY_MISSING');

const q8PointMissing = clone(q8.intake);
q8PointMissing.fieldRequest.location.integrationPointIndex = 99;
q8PointMissing.lifecycle.display.contourPaletteHash =
  lafeaRecoveryRenderProfileHash(q8PointMissing.fieldRequest);
expectCode(() => createLafeaRecoveryRenderPackage(q8PointMissing),
  'LAFEA_RECOVERY_RENDER_INTEGRATION_POINT_NOT_FOUND');

const shellWrongLocation = clone(shell.intake);
shellWrongLocation.fieldRequest.location = location('ELEMENT_CONSTANT', null, null);
shellWrongLocation.lifecycle.display.contourPaletteHash =
  lafeaRecoveryRenderProfileHash(shellWrongLocation.fieldRequest);
expectCode(() => createLafeaRecoveryRenderPackage(shellWrongLocation),
  'LAFEA_RECOVERY_RENDER_SHELL_LOCATION_INVALID');

const shellSurfaceMissing = clone(shell.intake);
shellSurfaceMissing.execution.result.loadCaseResults[0].elementResults[0]
  .integrationPoints[0].surfaces.pop();
expectCode(() => createLafeaRecoveryRenderPackage(shellSurfaceMissing),
  'LAFEA_RECOVERY_RENDER_SHELL_SURFACE_NOT_FOUND');

const unsupportedQuantity = clone(t3.intake);
unsupportedQuantity.fieldRequest.quantity = 'VON_MISES';
expectCode(() => createLafeaRecoveryRenderPackage(unsupportedQuantity),
  'LAFEA_RECOVERY_RENDER_QUANTITY_UNSUPPORTED');

const tamperedPackage = clonePackage(t3Package);
tamperedPackage.renderPacket.fieldValues[0] = 999;
expectCode(() => registerLafeaRecoveryRenderPackage(t3.lifecycle, tamperedPackage),
  'LAFEA_RECOVERY_RENDER_PACKAGE_TAMPERED');

const staleRegistration = clone(t3.lifecycle);
staleRegistration.artifacts.ANALYSIS_GEOMETRY.artifactHash = hash('OTHER-GEOMETRY');
expectCode(() => registerLafeaRecoveryRenderPackage(
  staleRegistration, t3Package,
), 'LAFEA_RECOVERY_RENDER_GEOMETRY_PARENT_STALE');

const producerSource = fs.readFileSync(
  'src/workspace/lafea-recovery-render-producer.js', 'utf8',
);
const contractSource = fs.readFileSync(
  'src/workspace/lafea-recovery-render-contract.js', 'utf8',
);
const productionSource = `${producerSource}\n${contractSource}`;
assert.doesNotMatch(productionSource,
  /from ['"][^'"]*(?:lafea-workbench-controller|lafea-workbench-view|local-continuum|local-shell|local-trunnion-footprint)[^'"]*['"]/u);
assert.doesNotMatch(productionSource,
  /\b(?:calculateLocalContinuum|calculateLocalShell|calculateLocalTrunnionFootprint|projectElementGaussStressToNodes|averageWithinGroups|smooth|smoothing)\b/u);
assert.doesNotMatch(productionSource, /MITC4|MITC3/u);
assert.match(producerSource, /PRODUCER_PROJECTED_DISPLAY_ONLY/u);
assert.match(producerSource,
  /ELEMENT_LOCAL_CORNER_TESSELLATION_NO_CROSS_ELEMENT_VERTEX_SHARING/u);
assert.match(producerSource, /RELEASE_NOT_QUALIFIED/u);
assert.match(producerSource, /convergenceProduced:\s*false/u);
assert.match(producerSource, /codeAssessmentProduced:\s*false/u);
assert.match(producerSource, /releaseQualified:\s*false/u);

console.log(JSON.stringify({
  check: 'lafea-nb-t4b-recovery-render-producer',
  status: 'PASS',
  producerRevision: LAFEA_RECOVERY_RENDER_PRODUCER_REVISION,
  acceptedStages: ['LAFEA.3', 'LAFEA.4', 'LAFEA.5'],
  exactExecutionRecoveryLineage: true,
  resultReadyAfterRegistration: true,
  crossElementSmoothing: false,
  shellNodalExtrapolation: false,
  displayValuesAuthoritative: false,
  shellAuthority: 'CST_DKT_TRI3_THIN_SHELL_V1',
  mitcClaimed: false,
  convergenceProduced: false,
  codeAssessmentProduced: false,
  reportProduced: false,
  releaseQualified: false,
  lafea6Enabled: false,
}));

function t3Harness() {
  const meshValue = mesh('T3-MESH', [
    node('A', 0, 0, 0), node('B', 1, 0, 0),
    node('C', 0, 1, 0), node('D', 1, 1, 0),
  ], [
    element('E1', 'T3', ['A', 'B', 'C']),
    element('E2', 'T3', ['B', 'D', 'C']),
  ]);
  const execution = acceptedExecution('LAFEA.3', {
    qualification: { state: 'ACCEPTED' },
    meshEvidence: { retained: true },
    loadCaseResults: [{
      loadCaseId: 'LC1',
      elementResults: [
        { elementId: 'E1', stress: stress(10) },
        { elementId: 'E2', stress: stress(30) },
      ],
    }],
  });
  return harness('LAFEA.3', meshValue, execution,
    fieldRequest('LC1', 'ELEMENT_CONSTANT', null, null));
}

function q8Harness() {
  const meshValue = mesh('Q8-MESH', [
    node('N1', 0, 0, 0), node('N2', 2, 0, 0),
    node('N3', 2, 2, 0), node('N4', 0, 2, 0),
    node('N5', 1, 0, 0), node('N6', 2, 1, 0),
    node('N7', 1, 2, 0), node('N8', 0, 1, 0),
  ], [element('Q1', 'Q8', [
    'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8',
  ])]);
  const execution = acceptedExecution('LAFEA.3', {
    qualification: { state: 'ACCEPTED' },
    meshEvidence: { retained: true },
    loadCaseResults: [{
      loadCaseId: 'LCQ',
      elementResults: [{
        elementId: 'Q1',
        recoveryLayer: 'INTEGRATION_POINT',
        gaussPointResults: [{ stress: stress(44) }],
      }],
    }],
  });
  return harness('LAFEA.3', meshValue, execution,
    fieldRequest('LCQ', 'INTEGRATION_POINT', 0, null));
}

function shellHarness(stageId) {
  const meshValue = mesh(`${stageId}-SHELL-MESH`, [
    node('S1', 0, 0, 0), node('S2', 2, 0, 0), node('S3', 0, 2, 0.2),
  ], [element('SE1', 'CST_DKT_TRI3_THIN_SHELL_V1', ['S1', 'S2', 'S3'])]);
  const shellLoadCases = [{
    loadCaseId: 'SHELL-LC',
    elementResults: [{
      elementId: 'SE1',
      integrationPoints: [{
        integrationPointId: 'IP1',
        surfaces: [
          { surface: 'BOTTOM', combinedStress: stress(75) },
          { surface: 'MIDSURFACE', combinedStress: stress(100) },
          { surface: 'TOP', combinedStress: stress(125) },
        ],
      }],
    }],
  }];
  const result = stageId === 'LAFEA.4'
    ? {
      qualification: { accepted: true },
      meshEvidence: { retained: true },
      loadCaseResults: shellLoadCases,
    }
    : {
      qualification: { state: 'ACCEPTED' },
      generatedShellModel: { units: units() },
      rawShellResult: {
        qualification: { accepted: true },
        meshEvidence: { retained: true },
        loadCaseResults: shellLoadCases,
      },
      assessmentRegionResults: [],
      footprintGeometryEvidence: { retained: true },
    };
  const execution = acceptedExecution(stageId, result);
  return harness(stageId, meshValue, execution,
    fieldRequest('SHELL-LC', 'SHELL_SURFACE', 0, 'TOP'));
}

function acceptedExecution(stageId, result) {
  const source = {
    schema: 'nb-t4b-test-source/v1',
    stageId,
    sourceMarker: `${stageId}-SOURCE`,
    units: units(),
    ...(stageId === 'LAFEA.5' ? { shellTemplate: { units: units() } } : {}),
  };
  const canonicalInput = {
    schema: 'nb-t4b-test-canonical/v1',
    modelMarker: `${stageId}-MODEL`,
    units: units(),
    loadCases: [{ loadCaseId: 'LC1' }],
    resultRequests: { loadCaseIds: ['LC1'] },
    ...(stageId === 'LAFEA.5'
      ? { loadCaseMappings: [{ workflowLoadCaseId: 'WF1' }] }
      : {}),
  };
  return {
    stageId,
    status: 'QUALIFIED',
    source,
    canonicalInput,
    result,
    diagnostics: [],
  };
}

function harness(stageId, meshValue, execution, request) {
  const authority = issueLafeaSourceAuthority(
    stageId, execution.source, `NB-T4B-TEST/${stageId}`,
  );
  const canonicalModelHash = canonicalLafeaSha256({
    schema: 'lafea-engineering-evidence-hash-input/v1',
    stageId,
    role: 'CANONICAL_MODEL',
    payload: {
      sourceHash: authority.sourceHash,
      canonicalInput: execution.canonicalInput,
    },
  });
  const geometryHash = hash(`${stageId}-GEOMETRY`);
  let lifecycle = createLafeaLifecycle(stageId, authority.sourceHash);
  lifecycle = registerLafeaArtifact(lifecycle, createLafeaArtifactRecord({
    stageId,
    kind: 'CANONICAL_MODEL',
    status: 'CURRENT',
    artifactHash: canonicalModelHash,
    parentHashes: { sourceHash: authority.sourceHash },
    qualification: 'PASS',
    producerRef: `TEST/${stageId}/CANONICAL-MODEL`,
    diagnostics: [],
  }), `TEST-${stageId}-MODEL`);
  lifecycle = registerLafeaArtifact(lifecycle, createLafeaArtifactRecord({
    stageId,
    kind: 'ANALYSIS_GEOMETRY',
    status: 'CURRENT',
    artifactHash: geometryHash,
    parentHashes: {
      sourceHash: authority.sourceHash,
      canonicalModelHash,
    },
    qualification: 'PASS',
    producerRef: `TEST/${stageId}/ANALYSIS-GEOMETRY`,
    diagnostics: [],
  }), `TEST-${stageId}-GEOMETRY`);
  const profile = meshProfile(meshValue.elements[0].elementType);
  const meshHash = lafeaAnalysisMeshContentHash(meshValue);
  const meshEvidence = createLafeaAnalysisMeshEvidence({
    schema: LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
    stageId,
    sourceHash: authority.sourceHash,
    canonicalModelHash,
    analysisGeometryHash: geometryHash,
    meshProfile: profile,
    mesh: meshValue,
    authority: {
      schema: LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
      stageId,
      authorityRole: 'STAGE_AUTHORIZED_ANALYSIS_MESH',
      status: 'ACCEPTED_BY_STAGE_CONTRACT',
      producerRef: `TEST/${stageId}/ANALYSIS-MESH`,
      sourceHash: authority.sourceHash,
      canonicalModelHash,
      analysisGeometryHash: geometryHash,
      meshProfileHash: profile.semanticHash,
      meshHash,
    },
  });
  lifecycle = registerLafeaAnalysisMeshEvidence(lifecycle, meshEvidence);
  const displayGeometryHash = lafeaRecoveryRenderDisplayGeometryHash(
    stageId, meshEvidence,
  );
  const renderProfileHash = lafeaRecoveryRenderProfileHash(request);
  lifecycle = applyDisplayHash(lifecycle, stageId,
    'DISPLAY_MESH_DENSITY', displayGeometryHash, 'DISPLAY');
  lifecycle = applyDisplayHash(lifecycle, stageId,
    'CONTOUR_PALETTE', renderProfileHash, 'RENDER');
  return {
    authority,
    lifecycle,
    meshEvidence,
    intake: {
      schema: LAFEA_RECOVERY_RENDER_INTAKE_SCHEMA,
      stageId,
      sceneRevision: 7,
      lifecycle,
      sourceAuthority: authority,
      analysisMeshEvidence: meshEvidence,
      execution,
      fieldRequest: request,
    },
  };
}

function applyDisplayHash(lifecycle, stageId, changeClass, profileHash, suffix) {
  return applyLafeaLifecycleEvent(lifecycle, createLafeaLifecycleEvent({
    eventId: `NB-T4B-${stageId.replace('.', '-')}-${suffix}`,
    stageId,
    changeClass,
    previousSourceHash: null,
    currentSourceHash: null,
    profileHash,
    originRef: `NB-T4B-TEST/${suffix}`,
  }));
}

function fieldRequest(loadCaseId, kind, integrationPointIndex, surface) {
  return {
    schema: LAFEA_RECOVERY_RENDER_FIELD_REQUEST_SCHEMA,
    fieldId: `FIELD-${loadCaseId}-SIGMA-X`,
    loadCaseId,
    quantity: 'SIGMA_X',
    units: 'MPa',
    colorMapId: 'COOL_WARM',
    location: location(kind, integrationPointIndex, surface),
  };
}

function location(kind, integrationPointIndex, surface) {
  return {
    schema: LAFEA_RECOVERY_RENDER_LOCATION_SCHEMA,
    kind,
    integrationPointIndex,
    surface,
  };
}

function meshProfile(elementType) {
  return canonicalProfile(PROFILE_KINDS.MESH, {
    schema: 'lafea-mesh-profile/v1',
    profileIdentity: `NB-T4B-${elementType}`,
    sourceRevision: 'TEST-1',
    fields: {
      continuumElement: ['T3', 'T6', 'Q8'].includes(elementType)
        ? elementType : 'T3',
      shellElement: 'CST_DKT_TRI3_THIN_SHELL_V1',
      globalTargetSize: 25,
      adjacentSizeRatioMax: 1.5,
      aspectRatioWarn: 3,
      aspectRatioBlock: 6,
      scaledJacobianWarn: 0.3,
      scaledJacobianBlock: 0.1,
      adaptiveLevels: 3,
    },
    semanticHash: undefined,
  });
}

function mesh(meshIdentity, nodes, elements) {
  return { schema: LAFEA_ANALYSIS_MESH_SCHEMA, meshIdentity, nodes, elements };
}

function node(nodeId, x, y, z) { return { nodeId, x, y, z }; }
function element(elementId, elementType, nodeIds) {
  return { elementId, elementType, nodeIds };
}
function stress(sigmaX) {
  return { sigmaX, sigmaY: sigmaX / 2, sigmaZ: 0, tauXY: sigmaX / 10 };
}
function units() {
  return { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' };
}
function lifecycleBinding(digest) {
  return {
    schema: 'lafea-lifecycle-binding/v1',
    status: 'CURRENT',
    boundDocumentDigest: digest,
    currentDocumentDigest: digest,
    reason: null,
    originRef: 'NB-T4B-TEST',
  };
}
function hash(value) {
  return canonicalLafeaSha256({ schema: 'nb-t4b-test-hash/v1', value });
}
function clone(value) { return structuredClone(value); }
function clonePackage(value) {
  return {
    ...structuredClone(value),
    renderPacket: {
      ...structuredClone(value.renderPacket),
      positions: new Float32Array(value.renderPacket.positions),
      drawTriangleIndices: new Uint32Array(value.renderPacket.drawTriangleIndices),
      drawTriangleElementIndices: new Uint32Array(
        value.renderPacket.drawTriangleElementIndices,
      ),
      fieldValues: new Float32Array(value.renderPacket.fieldValues),
      qualityFlags: new Uint8Array(value.renderPacket.qualityFlags),
    },
  };
}
function expectCode(body, code) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, code,
      `expected ${code}, received ${error?.code}: ${error?.message}`);
    return true;
  });
}
