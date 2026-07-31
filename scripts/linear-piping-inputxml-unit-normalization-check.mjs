#!/usr/bin/env node

import assert from 'node:assert/strict';
import { conditionGeometry, FRAME_LOCAL_AXIS_PROFILE } from '../src/core/centerline-beam-fea/index.js';
import { inputXmlToCanonicalGeometry } from '../src/core/geometry/adapters/inputXmlToCanonicalGeometry.js';
import {
  INPUTXML_LENGTH_UNIT_REGISTRY_ID,
  LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_SCHEMA,
  LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_V2_SCHEMA,
  LINEAR_PIPING_INPUTXML_UNIT_PROFILE_SCHEMA,
  compileLinearPipingInputXmlAnalysisContext,
  normalizeLinearPipingInputXmlGeometry,
  requireLinearPipingInputXmlUnitResult,
  sealLinearPipingInputXmlSource,
  sealLinearPipingInputXmlUnitProfile,
} from '../src/core/linear-piping-analysis-consumer/index.js';
import {
  axisResult,
  compilerInput,
  materialResolution,
  sectionResolution,
} from './lfea-b2.5-model-compiler-fixtures.mjs';
import {
  cantileverConstraintDeclarations,
  frameElements,
  loadCaseProfile,
  solverProfile,
  tipLoadPrimitive,
} from './lfea-b3.3-solver-fixtures.mjs';
import { recoveryProfile } from './lfea-b3.4-recovery-fixtures.mjs';

const SOURCE_ID = 'PROJECT-CAESAR-UNIT-NORMALIZATION';
const XML_M = '<CAESARII xmlns="COADE" VERSION="14.00" XML_TYPE="Input"><PIPINGMODEL xmlns="" JOBNAME="PHASE2F-M"><PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1.2" DELTA_Y="0" DELTA_Z="0" DIAMETER="0.125" WALL_THICK="0.0078125" MATERIAL_NAME="A106 B"/><PIPINGELEMENT FROM_NODE="20" TO_NODE="30" DELTA_X="1.2" DELTA_Y="0" DELTA_Z="0" DIAMETER="0.125" WALL_THICK="0.0078125" MATERIAL_NAME="A106 B"/></PIPINGMODEL></CAESARII>';
const XML_MM = '<CAESARII xmlns="COADE" VERSION="14.00" XML_TYPE="Input"><PIPINGMODEL xmlns="" JOBNAME="PHASE2F-MM"><PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1200" DELTA_Y="0" DELTA_Z="0" DIAMETER="125" WALL_THICK="7.8125" MATERIAL_NAME="A106 B"/><PIPINGELEMENT FROM_NODE="20" TO_NODE="30" DELTA_X="1200" DELTA_Y="0" DELTA_Z="0" DIAMETER="125" WALL_THICK="7.8125" MATERIAL_NAME="A106 B"/></PIPINGMODEL></CAESARII>';
const CONDITIONING_PROFILE = Object.freeze({
  spanSeedingLimit: { value: 10, source: 'PHASE-2F-FIXTURE' },
  bendSeedingSegments: { value: 4, source: 'PHASE-2F-FIXTURE' },
  bendLengthErrorLimit: { value: 0.01, source: 'PHASE-2F-FIXTURE' },
});

function test(id, name, body) {
  body();
  console.log(`${id} PASS ${name}`);
}

function expectCode(body, code) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, code, `expected ${code}, received ${error?.code}`);
    return true;
  });
}

function unitProfile(allowedSourceUnits = ['ft', 'in', 'm', 'mm']) {
  return sealLinearPipingInputXmlUnitProfile({
    schema: LINEAR_PIPING_INPUTXML_UNIT_PROFILE_SCHEMA,
    profileId: 'INPUTXML-UNIT-PHASE2F-R1',
    registryId: INPUTXML_LENGTH_UNIT_REGISTRY_ID,
    allowedSourceUnits,
    sourceEvidence: {
      authority: 'PROJECT-UNIT-BASIS',
      documentId: 'PHASE2F-UNIT-BASIS',
      revision: '01',
      sourceSemanticHash: 'fnv1a64:7272727272727272',
    },
    semanticHash: '',
  });
}

function source(content, revision) {
  return sealLinearPipingInputXmlSource({
    sourceId: SOURCE_ID,
    sourceRevision: revision,
    fileName: 'phase2f-input.xml',
    mediaType: 'application/xml',
    content,
  });
}

function ingestionOptions(unit, profile = null) {
  const base = {
    unit,
    source: SOURCE_ID,
    componentOrigins: {},
    restraintTypeCodeMap: {},
    bendRadiusTolerance: { value: 1e-8, source: 'PHASE-2F-FIXTURE' },
  };
  return profile === null ? base : { ...base, unitNormalizationProfile: profile };
}

function conditionedFrom(inputSource, options, profile = null) {
  const parsed = inputXmlToCanonicalGeometry(inputSource.content, {
    unit: options.unit,
    source: options.source,
    componentOrigins: options.componentOrigins,
    restraintTypeCodeMap: options.restraintTypeCodeMap,
    bendRadiusTolerance: options.bendRadiusTolerance.value,
    fileName: inputSource.fileName,
  });
  const geometry = profile === null
    ? parsed
    : normalizeLinearPipingInputXmlGeometry(parsed, profile).geometry;
  assert.equal(geometry.valid, true);
  assert.equal(geometry.unit, 'm');
  return conditionGeometry(geometry, [], CONDITIONING_PROFILE);
}

function mechanicalInput(inputSource, conditioned) {
  return compilerInput({
    sourceSemanticHash: inputSource.semanticHash,
    conditionedTopology: conditioned,
    nodeBindings: [
      { nodeId: 'N-000120', conditionedNodeId: 'CN-000120', topologyNodeId: '10' },
      { nodeId: 'N-000121', conditionedNodeId: 'CN-000121', topologyNodeId: '20' },
      { nodeId: 'N-000122', conditionedNodeId: 'CN-000122', topologyNodeId: '30' },
    ],
    elementBindings: [
      elementBinding('E-000120', 'CS-000120', 'IX-S1', 'AXIS-E-000120', 'PIPINGELEMENT[0]'),
      elementBinding('E-000121', 'CS-000121', 'IX-S2', 'AXIS-E-000121', 'PIPINGELEMENT[1]'),
    ],
    materialResolutions: [materialResolution()],
    sectionResolutions: [sectionResolution()],
    localAxisResults: [
      { evidenceIdentity: 'AXIS-E-000120', result: axisResult([0, 0, 0], [1.2, 0, 0]) },
      { evidenceIdentity: 'AXIS-E-000121', result: axisResult([1.2, 0, 0], [2.4, 0, 0]) },
    ],
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    constraintDeclarations: cantileverConstraintDeclarations(),
  });
}

function elementBinding(elementId, conditionedSegmentId, topologySegmentId, axisId, sourceComponentId) {
  return {
    elementId,
    conditionedSegmentId,
    topologySegmentId,
    materialStateId: 'MAT-A106B-393K',
    sectionStateId: 'SEC-NPS6-SCH40',
    formulationId: 'PIPE_FRAME3D_LINEAR_V1',
    localAxisEvidenceIdentity: axisId,
    sourceComponentId,
  };
}

function sourceAnalysisRequest(inputSource, conditioned) {
  const mechanicalModelInput = mechanicalInput(inputSource, conditioned);
  const physicalLoadCaseInput = {
    loadCaseId: 'LC-TIP-01',
    loadCaseClass: 'APPLIED_MECHANICAL',
    presentation: {
      label: 'Unit-normalized tip load',
      description: 'Same SI load authority over metre and millimetre InputXML geometry.',
    },
    primitives: [tipLoadPrimitive()],
    profile: loadCaseProfile(),
  };
  return {
    schema: 'linear-piping-source-analysis-request/v1',
    analysisIdentity: 'PIPE-INPUTXML-PHASE2F-01',
    analysisRevision: 1,
    mechanicalModelInput,
    physicalLoadCaseInput,
    frameElements: frameElements(),
    pipingComponents: [],
    solverProfile: solverProfile(),
    recoveryProfile: recoveryProfile(),
    expectedSourceAuthorities: {
      sourceSemanticHash: inputSource.semanticHash,
      conditionedTopologyHash: conditioned.semanticHash,
      compilerProfileSemanticHash: mechanicalModelInput.profile.semanticHash,
      loadCaseProfileSemanticHash: physicalLoadCaseInput.profile.semanticHash,
    },
  };
}

function request({ content, revision, unit, schema, profile = null }) {
  const inputSource = source(content, revision);
  const options = ingestionOptions(unit, profile);
  const conditioned = conditionedFrom(inputSource, options, profile);
  return {
    schema,
    inputXmlSource: inputSource,
    ingestionOptions: options,
    conditioning: { requiredAttachmentPoints: [], profile: CONDITIONING_PROFILE },
    sourceAnalysisRequest: sourceAnalysisRequest(inputSource, conditioned),
  };
}

function directGeometry(unit = 'mm') {
  return {
    schemaVersion: 'canonical-geometry-v1',
    nodes: [
      { id: '10', x: 0, y: 0, z: 0, restraint: 'FREE', meta: { caesarNodeNumber: '10' } },
      { id: '20', x: 1000, y: 0, z: 0, restraint: 'FREE', meta: { caesarNodeNumber: '20' } },
    ],
    segments: [{
      id: 'IX-S1',
      startNodeId: '10',
      endNodeId: '20',
      type: 'BEND',
      sourceComponentUid: 'PIPINGELEMENT[0]',
      length: 1000,
      diameter: 125,
      thickness: 7.8125,
      material: 'A106 B',
      meta: {
        materialNumber: null,
        sourceType: 'BEND',
        sourceIndex: 0,
        bendDeclaredRadius: 1500,
        bendAngle1: 90,
        bendAngle2: undefined,
        numMiter: 1,
        bendCompoundMiter: undefined,
        bendArcCentre: { x: 500, y: 500, z: 0 },
        bendComputedRadius: 1500,
      },
    }],
    source: SOURCE_ID,
    unit,
    diagnostics: [],
    summary: { componentCount: 1, nodeCount: 2, segmentCount: 1 },
    valid: true,
  };
}

console.log('\n--- [SIMULATED] Linear piping Phase 2F InputXML unit normalization check ---');

const profile = unitProfile();
const normalized = normalizeLinearPipingInputXmlGeometry(directGeometry(), profile);

test('P2F-UNIT-01', 'Exact registry scales every classified InputXML length field', () => {
  assert.deepEqual(normalized.scale, { numerator: 1, denominator: 1000 });
  assert.equal(normalized.geometry.unit, 'm');
  assert.equal(normalized.geometry.nodes[1].x, 1);
  assert.equal(normalized.geometry.segments[0].length, 1);
  assert.equal(normalized.geometry.segments[0].diameter, 0.125);
  assert.equal(normalized.geometry.segments[0].thickness, 0.0078125);
  assert.equal(normalized.geometry.segments[0].meta.bendDeclaredRadius, 1.5);
  assert.deepEqual(normalized.geometry.segments[0].meta.bendArcCentre, { x: 0.5, y: 0.5, z: 0 });
});

test('P2F-UNIT-02', 'Normalization is deterministic and independently revalidated', () => {
  const repeated = normalizeLinearPipingInputXmlGeometry(directGeometry(), unitProfile());
  assert.deepEqual(repeated, normalized);
  assert.equal(requireLinearPipingInputXmlUnitResult(normalized, profile).semanticHash, normalized.semanticHash);
});

test('P2F-UNIT-03', 'Unknown numeric metadata is blocked rather than left unscaled', () => {
  const geometry = directGeometry();
  geometry.segments[0].meta.fabricationOffset = 25;
  expectCode(
    () => normalizeLinearPipingInputXmlGeometry(geometry, profile),
    'PIPING_INPUTXML_UNIT_FIELD_UNCLASSIFIED',
  );
});

test('P2F-UNIT-04', 'Unauthorized source units fail closed', () => {
  expectCode(
    () => normalizeLinearPipingInputXmlGeometry(directGeometry('cm'), unitProfile(['m', 'mm'])),
    'PIPING_INPUTXML_UNIT_NOT_AUTHORIZED',
  );
});

test('P2F-UNIT-05', 'Stale profile and result identities are rejected', () => {
  const staleProfile = structuredClone(profile);
  staleProfile.semanticHash = 'fnv1a64:0000000000000000';
  expectCode(
    () => normalizeLinearPipingInputXmlGeometry(directGeometry(), staleProfile),
    'PIPING_INPUTXML_UNIT_PROFILE_HASH_MISMATCH',
  );
  const staleResult = structuredClone(normalized);
  staleResult.scale.denominator = 10;
  expectCode(
    () => requireLinearPipingInputXmlUnitResult(staleResult, profile),
    'PIPING_INPUTXML_UNIT_SCALE_MISMATCH',
  );
});

const metreRequest = request({
  content: XML_M,
  revision: 'M-01',
  unit: 'm',
  schema: LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_SCHEMA,
});
const millimetreRequest = request({
  content: XML_MM,
  revision: 'MM-01',
  unit: 'mm',
  schema: LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_V2_SCHEMA,
  profile,
});
const metreContext = compileLinearPipingInputXmlAnalysisContext(
  metreRequest,
  { factorizationCache: null },
);
const millimetreContext = compileLinearPipingInputXmlAnalysisContext(
  millimetreRequest,
  { factorizationCache: null },
);

test('P2F-UNIT-06', 'Metre and millimetre sources produce one conditioned topology and stiffness state', () => {
  assert.equal(millimetreContext.conditionedTopologyHash, metreContext.conditionedTopologyHash);
  assert.equal(
    millimetreContext.sourceAnalysisContext.compilation.stiffnessStateHash,
    metreContext.sourceAnalysisContext.compilation.stiffnessStateHash,
  );
});

test('P2F-UNIT-07', 'Metre and millimetre sources produce identical numerical execution and recovery', () => {
  const metreResult = metreContext.sourceAnalysisContext.analysisResult;
  const millimetreResult = millimetreContext.sourceAnalysisContext.analysisResult;
  assert.deepEqual(millimetreResult.execution.displacement, metreResult.execution.displacement);
  assert.deepEqual(millimetreResult.execution.reaction, metreResult.execution.reaction);
  assert.deepEqual(millimetreResult.recovery.elementActions, metreResult.recovery.elementActions);
  assert.deepEqual(millimetreResult.recovery.forceFields, metreResult.recovery.forceFields);
  assert.deepEqual(millimetreResult.recovery.componentResultants, metreResult.recovery.componentResultants);
});

test('P2F-UNIT-08', 'Conversion authority is retained in context ingestion evidence', () => {
  const evidence = millimetreContext.ingestionEvidence.conditioningReport.unitNormalization;
  assert.equal(millimetreContext.ingestionEvidence.unit, 'm');
  assert.equal(evidence.sourceUnit, 'mm');
  assert.equal(evidence.targetUnit, 'm');
  assert.deepEqual(evidence.scale, { numerator: 1, denominator: 1000 });
  assert.equal(evidence.profileSemanticHash, profile.semanticHash);
});

test('P2F-UNIT-09', 'Request v1 remains metre-only', () => {
  const invalid = structuredClone(millimetreRequest);
  invalid.schema = LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_SCHEMA;
  delete invalid.ingestionOptions.unitNormalizationProfile;
  expectCode(
    () => compileLinearPipingInputXmlAnalysisContext(invalid, { factorizationCache: null }),
    'PIPING_INPUTXML_UNIT_NOT_CANONICAL',
  );
});

test('P2F-UNIT-10', 'Caller cannot approve an unnormalized millimetre topology', () => {
  const invalid = structuredClone(millimetreRequest);
  const parsed = inputXmlToCanonicalGeometry(invalid.inputXmlSource.content, {
    unit: 'mm',
    source: SOURCE_ID,
    componentOrigins: {},
    restraintTypeCodeMap: {},
    bendRadiusTolerance: 1e-8,
    fileName: invalid.inputXmlSource.fileName,
  });
  const unnormalized = conditionGeometry(parsed, [], CONDITIONING_PROFILE);
  invalid.sourceAnalysisRequest.mechanicalModelInput.conditionedTopology = unnormalized;
  invalid.sourceAnalysisRequest.expectedSourceAuthorities.conditionedTopologyHash = unnormalized.semanticHash;
  expectCode(
    () => compileLinearPipingInputXmlAnalysisContext(invalid, { factorizationCache: null }),
    'PIPING_INPUTXML_TOPOLOGY_MISMATCH',
  );
});

console.log('\n[SIMULATED] Linear piping Phase 2F InputXML unit normalization check PASS\n');
