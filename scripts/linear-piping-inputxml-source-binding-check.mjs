#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { conditionGeometry, FRAME_LOCAL_AXIS_PROFILE } from '../src/core/centerline-beam-fea/index.js';
import { inputXmlToCanonicalGeometry } from '../src/core/geometry/adapters/inputXmlToCanonicalGeometry.js';
import {
  LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_SCHEMA,
  requireLinearPipingInputXmlAnalysisResult,
  runLinearPipingAnalysisFromInputXml,
  runLinearPipingAnalysisFromSourceAuthorities,
  sealLinearPipingInputXmlSource,
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

const XML = '<CAESARII xmlns="COADE" VERSION="14.00" XML_TYPE="Input"><PIPINGMODEL xmlns="" JOBNAME="PHASE2B"><PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1.2" DELTA_Y="0" DELTA_Z="0" DIAMETER="0.1683" WALL_THICK="0.00711" MATERIAL_NAME="A106 B"/><PIPINGELEMENT FROM_NODE="20" TO_NODE="30" DELTA_X="1.2" DELTA_Y="0" DELTA_Z="0" DIAMETER="0.1683" WALL_THICK="0.00711" MATERIAL_NAME="A106 B"/></PIPINGMODEL></CAESARII>';
const PROFILE = Object.freeze({
  spanSeedingLimit: { value: 10, source: 'PHASE-2B-FIXTURE-PROFILE' },
  bendSeedingSegments: { value: 4, source: 'PHASE-2B-FIXTURE-PROFILE' },
  bendLengthErrorLimit: { value: 0.01, source: 'PHASE-2B-FIXTURE-PROFILE' },
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

function sealedSource(content = XML) {
  return sealLinearPipingInputXmlSource({
    sourceId: 'PROJECT-CAESAR-INPUTXML',
    sourceRevision: '01',
    fileName: 'phase2b-input.xml',
    mediaType: 'application/xml',
    content,
  });
}

function ingestionOptions(overrides = {}) {
  return {
    unit: 'm',
    source: 'PROJECT-CAESAR-INPUTXML',
    componentOrigins: {},
    restraintTypeCodeMap: {},
    bendRadiusTolerance: { value: 1e-8, source: 'PHASE-2B-FIXTURE-PROFILE' },
    ...overrides,
  };
}

function conditionedFrom(inputSource = sealedSource(), options = ingestionOptions()) {
  const geometry = inputXmlToCanonicalGeometry(inputSource.content, {
    unit: options.unit,
    source: options.source,
    componentOrigins: options.componentOrigins,
    restraintTypeCodeMap: options.restraintTypeCodeMap,
    bendRadiusTolerance: options.bendRadiusTolerance.value,
    fileName: inputSource.fileName,
  });
  assert.equal(geometry.valid, true);
  return conditionGeometry(geometry, [], PROFILE);
}

function elementBinding(elementId, conditionedSegmentId, topologySegmentId, axisId, sourceId) {
  return {
    elementId,
    conditionedSegmentId,
    topologySegmentId,
    materialStateId: 'MAT-A106B-393K',
    sectionStateId: 'SEC-NPS6-SCH40',
    formulationId: 'PIPE_FRAME3D_LINEAR_V1',
    localAxisEvidenceIdentity: axisId,
    sourceComponentId: sourceId,
  };
}

function phase2aRequest(inputSource, conditioned) {
  const mechanicalModelInput = compilerInput({
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
  const physicalLoadCaseInput = {
    loadCaseId: 'LC-TIP-01',
    loadCaseClass: 'APPLIED_MECHANICAL',
    presentation: {
      label: 'InputXML-bound tip load',
      description: 'Declared load authority bound to an InputXML-derived topology.',
    },
    primitives: [tipLoadPrimitive()],
    profile: loadCaseProfile(),
  };
  return {
    schema: 'linear-piping-source-analysis-request/v1',
    analysisIdentity: 'PIPE-INPUTXML-PHASE2B-01',
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

function request() {
  const inputSource = sealedSource();
  const conditioned = conditionedFrom(inputSource);
  return {
    schema: LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_SCHEMA,
    inputXmlSource: inputSource,
    ingestionOptions: ingestionOptions(),
    conditioning: { requiredAttachmentPoints: [], profile: PROFILE },
    sourceAnalysisRequest: phase2aRequest(inputSource, conditioned),
  };
}

console.log('\n--- [SIMULATED] Linear piping Phase 2B InputXML source-binding check ---');
const baselineRequest = request();
const baselineResult = runLinearPipingAnalysisFromInputXml(
  baselineRequest,
  { factorizationCache: null },
);
const manualResult = runLinearPipingAnalysisFromSourceAuthorities(
  baselineRequest.sourceAnalysisRequest,
  { factorizationCache: null },
);

test('P2B-INPUTXML-01', 'Raw source and topology bind to the retained result', () => {
  assert.equal(baselineResult.analysisResult.status, 'QUALIFIED');
  assert.equal(baselineResult.sourceSemanticHash, baselineRequest.inputXmlSource.semanticHash);
  assert.equal(
    baselineResult.conditionedTopologyHash,
    baselineRequest.sourceAnalysisRequest.mechanicalModelInput.conditionedTopology.semanticHash,
  );
});

test('P2B-INPUTXML-02', 'Bound execution remains numerically identical to Phase 2A', () => {
  assert.equal(baselineResult.analysisResult.semanticHash, manualResult.semanticHash);
  assert.equal(baselineResult.analysisResult.execution.executionHash, manualResult.execution.executionHash);
  assert.equal(baselineResult.analysisResult.recovery.semanticHash, manualResult.recovery.semanticHash);
});

test('P2B-INPUTXML-03', 'Source text and result hashes revalidate independently', () => {
  assert.equal(baselineResult.contentHash, baselineRequest.inputXmlSource.contentHash);
  assert.equal(
    requireLinearPipingInputXmlAnalysisResult(baselineResult).semanticHash,
    baselineResult.semanticHash,
  );
});

test('P2B-INPUTXML-04', 'Content tamper is rejected before parsing', () => {
  const tampered = request();
  tampered.inputXmlSource = structuredClone(tampered.inputXmlSource);
  tampered.inputXmlSource.content = tampered.inputXmlSource.content.replace('PHASE2B', 'TAMPERED');
  expectCode(
    () => runLinearPipingAnalysisFromInputXml(tampered, { factorizationCache: null }),
    'PIPING_INPUTXML_CONTENT_HASH_MISMATCH',
  );
});

test('P2B-INPUTXML-05', 'Caller cannot substitute geometry under an approved hash', () => {
  const mismatched = request();
  mismatched.sourceAnalysisRequest = structuredClone(mismatched.sourceAnalysisRequest);
  mismatched.sourceAnalysisRequest.mechanicalModelInput.conditionedTopology.geometry.nodes[1].y = 0.25;
  expectCode(
    () => runLinearPipingAnalysisFromInputXml(mismatched, { factorizationCache: null }),
    'PIPING_INPUTXML_TOPOLOGY_MISMATCH',
  );
});

test('P2B-INPUTXML-06', 'Raw and Phase 2A source identities cannot diverge', () => {
  const mismatched = request();
  mismatched.sourceAnalysisRequest = structuredClone(mismatched.sourceAnalysisRequest);
  mismatched.sourceAnalysisRequest.mechanicalModelInput.sourceSemanticHash = 'fnv1a64:0000000000000000';
  mismatched.sourceAnalysisRequest.expectedSourceAuthorities.sourceSemanticHash = 'fnv1a64:0000000000000000';
  expectCode(
    () => runLinearPipingAnalysisFromInputXml(mismatched, { factorizationCache: null }),
    'PIPING_INPUTXML_SOURCE_AUTHORITY_MISMATCH',
  );
});

test('P2B-INPUTXML-07', 'Request v1 remains metre-only', () => {
  const nonCanonical = request();
  nonCanonical.ingestionOptions = ingestionOptions({ unit: 'mm' });
  expectCode(
    () => runLinearPipingAnalysisFromInputXml(nonCanonical, { factorizationCache: null }),
    'PIPING_INPUTXML_UNIT_NOT_CANONICAL',
  );
});

test('P2B-INPUTXML-08', 'Disconnected geometry is refused before B-2.5', () => {
  const disconnectedXml = XML.replace(
    '</PIPINGMODEL>',
    '<PIPINGELEMENT FROM_NODE="900" TO_NODE="910" DELTA_X="1" DELTA_Y="0" DELTA_Z="0" DIAMETER="0.1683" WALL_THICK="0.00711" MATERIAL_NAME="A106 B"/></PIPINGMODEL>',
  );
  const disconnected = request();
  disconnected.inputXmlSource = sealedSource(disconnectedXml);
  expectCode(
    () => runLinearPipingAnalysisFromInputXml(disconnected, { factorizationCache: null }),
    'PIPING_INPUTXML_GEOMETRY_INVALID',
  );
});

test('P2B-INPUTXML-09', 'Repeated binding is deterministic', () => {
  const repeated = runLinearPipingAnalysisFromInputXml(request(), { factorizationCache: null });
  assert.deepEqual(repeated, baselineResult);
});

test('P2B-INPUTXML-10', 'Binding does not freeze caller-owned requests', () => {
  const mutable = request();
  runLinearPipingAnalysisFromInputXml(mutable, { factorizationCache: null });
  assert.equal(Object.isFrozen(mutable), false);
  assert.equal(Object.isFrozen(mutable.sourceAnalysisRequest), false);
});

test('P2B-GUARD-01', 'InputXML binding remains provenance and orchestration only', () => {
  const sourceText = fs.readFileSync(
    'src/core/linear-piping-analysis-consumer/inputxml-source-binding.js',
    'utf8',
  );
  assert.match(sourceText, /inputXmlToCanonicalGeometry/u);
  assert.match(sourceText, /conditionGeometry/u);
  assert.match(sourceText, /compileLinearPipingSourceAnalysisContext/u);
  assert.doesNotMatch(
    sourceText,
    /resolveLinearFeaMaterialState|resolvePipeSection|resolveFrameLocalAxes|compileSolverExecution|compileResultRecovery|recoverLinearPipingInterfaceLoads|compileNozzleAllowableAssessment|compileLinearPipingB31Application/u,
  );
  assert.doesNotMatch(sourceText, /localeCompare|Math\.random|randomUUID/u);
});

console.log('\n[SIMULATED] Linear piping Phase 2B InputXML source-binding check PASS\n');
