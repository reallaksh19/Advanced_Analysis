#!/usr/bin/env node

import assert from 'node:assert/strict';
import { conditionGeometry, FRAME_LOCAL_AXIS_PROFILE } from '../src/core/centerline-beam-fea/index.js';
import { inputXmlToCanonicalGeometry } from '../src/core/geometry/adapters/inputXmlToCanonicalGeometry.js';
import {
  LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_SCHEMA,
  compileLinearPipingInputXmlAnalysisContext,
  requireLinearPipingInputXmlAnalysisContext,
  runLinearPipingAnalysisFromInputXml,
  sealLinearPipingInputXmlAnalysisContext,
  sealLinearPipingInputXmlSource,
} from '../src/core/linear-piping-analysis-consumer/index.js';
import {
  compileLinearPipingInterfaceSet,
  recoverLinearPipingInterfaceLoads,
  sealInterfaceProfile,
} from '../src/core/linear-piping-interface/index.js';
import { createFactorizationCache } from '../src/core/linear-fea-solver/index.js';
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

const XML = '<CAESARII xmlns="COADE" VERSION="14.00" XML_TYPE="Input"><PIPINGMODEL xmlns="" JOBNAME="PHASE2D"><PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1.2" DELTA_Y="0" DELTA_Z="0" DIAMETER="0.1683" WALL_THICK="0.00711" MATERIAL_NAME="A106 B"/><PIPINGELEMENT FROM_NODE="20" TO_NODE="30" DELTA_X="1.2" DELTA_Y="0" DELTA_Z="0" DIAMETER="0.1683" WALL_THICK="0.00711" MATERIAL_NAME="A106 B"/></PIPINGMODEL></CAESARII>';
const PROFILE = Object.freeze({
  spanSeedingLimit: { value: 10, source: 'PHASE-2D-FIXTURE' },
  bendSeedingSegments: { value: 4, source: 'PHASE-2D-FIXTURE' },
  bendLengthErrorLimit: { value: 0.01, source: 'PHASE-2D-FIXTURE' },
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

function buildRequest() {
  const source = sealLinearPipingInputXmlSource({
    sourceId: 'PROJECT-INPUTXML-PHASE2D',
    sourceRevision: '01',
    fileName: 'phase2d-input.xml',
    mediaType: 'application/xml',
    content: XML,
  });
  const ingestionOptions = {
    unit: 'm',
    source: source.sourceId,
    componentOrigins: {},
    restraintTypeCodeMap: {},
    bendRadiusTolerance: { value: 1e-8, source: 'PHASE-2D-FIXTURE' },
  };
  const geometry = inputXmlToCanonicalGeometry(source.content, {
    ...ingestionOptions,
    bendRadiusTolerance: ingestionOptions.bendRadiusTolerance.value,
    fileName: source.fileName,
  });
  const topology = conditionGeometry(geometry, [], PROFILE);
  const mechanicalModelInput = compilerInput({
    sourceSemanticHash: source.semanticHash,
    conditionedTopology: topology,
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
    presentation: { label: 'Phase 2D tip load', description: 'Declared fixture load.' },
    primitives: [tipLoadPrimitive()],
    profile: loadCaseProfile(),
  };
  return {
    schema: LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_SCHEMA,
    inputXmlSource: source,
    ingestionOptions,
    conditioning: { requiredAttachmentPoints: [], profile: PROFILE },
    sourceAnalysisRequest: {
      schema: 'linear-piping-source-analysis-request/v1',
      analysisIdentity: 'PIPE-INPUTXML-CONTEXT-01',
      analysisRevision: 1,
      mechanicalModelInput,
      physicalLoadCaseInput,
      frameElements: frameElements(),
      pipingComponents: [],
      solverProfile: solverProfile(),
      recoveryProfile: recoveryProfile(),
      expectedSourceAuthorities: {
        sourceSemanticHash: source.semanticHash,
        conditionedTopologyHash: topology.semanticHash,
        compilerProfileSemanticHash: mechanicalModelInput.profile.semanticHash,
        loadCaseProfileSemanticHash: physicalLoadCaseInput.profile.semanticHash,
      },
    },
  };
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

function interfaceSet(context) {
  const sourceContext = context.sourceAnalysisContext;
  const node = sourceContext.compilation.model.nodes.find((row) => row.nodeId === 'N-000120');
  const dofMappings = sourceContext.compilation.model.constraints
    .filter((row) => row.nodeId === node.nodeId)
    .map((row) => ({
      dof: row.dof,
      behavior: row.behavior,
      constraintId: row.constraintId,
      stiffness: row.stiffness ?? null,
    }));
  return compileLinearPipingInterfaceSet({
    compilation: sourceContext.compilation,
    supportAttachmentModel: null,
    restraintCapabilityModel: null,
    definitions: [{
      interfaceId: 'IF-PHASE2D-NOZZLE',
      interfaceKind: 'NOZZLE',
      nodeId: node.nodeId,
      sourceEntityId: 'EQUIPMENT-PHASE2D',
      supportBinding: null,
      basis: {
        origin: node.position,
        e1: { x: 1, y: 0, z: 0 },
        e2: { x: 0, y: 1, z: 0 },
        e3: { x: 0, y: 0, z: 1 },
      },
      referencePointGlobal: { x: -0.1, y: 0, z: 0 },
      leverReferenceToNodeLocal: { x: 0.1, y: 0, z: 0 },
      dofMappings,
      reportingSignConvention: 'FORCE_ON_INTERFACE_FROM_PIPE',
      sourceEvidence: {
        sourceId: 'PHASE2D-NOZZLE-DATASHEET',
        sourceRevision: '01',
        sourceSemanticHash: 'fnv1a64:5656565656565656',
      },
      allowableProfileHash: 'fnv1a64:7878787878787878',
    }],
    profile: sealInterfaceProfile({
      schema: 'linear-piping-interface-profile/v1',
      profileId: 'PHASE2D-INTERFACE-PROFILE',
      basisTolerance: { value: 1e-12, source: 'PHASE-2D-FIXTURE' },
      positionTolerance: { value: 1e-12, source: 'PHASE-2D-FIXTURE' },
      offsetTolerance: { value: 1e-12, source: 'PHASE-2D-FIXTURE' },
      semanticHash: '',
    }),
  });
}

console.log('\n--- [SIMULATED] Linear piping Phase 2D InputXML context check ---');
const request = buildRequest();
const context = compileLinearPipingInputXmlAnalysisContext(request, { factorizationCache: null });
const legacy = runLinearPipingAnalysisFromInputXml(buildRequest(), { factorizationCache: null });

test('P2D-CONTEXT-01', 'Raw source, topology and retained context are sealed together', () => {
  assert.equal(context.inputXmlSource.semanticHash, context.sourceAnalysisContext.compilation.sourceSemanticHash);
  assert.equal(context.conditionedTopologyHash, context.sourceAnalysisContext.compilation.conditionedTopologyHash);
  assert.equal(
    requireLinearPipingInputXmlAnalysisContext(context).semanticHash,
    context.semanticHash,
  );
});

test('P2D-CONTEXT-02', 'Legacy InputXML result remains behavior compatible', () => {
  assert.equal(legacy.analysisResult.semanticHash, context.sourceAnalysisContext.analysisResult.semanticHash);
  assert.equal(legacy.analysisResult.evidenceHash, context.sourceAnalysisContext.analysisResult.evidenceHash);
  assert.deepEqual(legacy.ingestionEvidence, context.ingestionEvidence);
});

test('P2D-CONTEXT-03', 'Phase 3 consumes the retained InputXML context directly', () => {
  const set = interfaceSet(context);
  const recovered = recoverLinearPipingInterfaceLoads({
    interfaceSet: set,
    analysisResult: context.sourceAnalysisContext.analysisResult,
    loadCase: context.sourceAnalysisContext.loadCase,
  });
  assert.equal(recovered.results.length, 1);
  assert.equal(recovered.physicalLoadCaseHash, context.sourceAnalysisContext.loadCase.physicalLoadCaseHash);
});

test('P2D-CONTEXT-04', 'Different source cannot be attached to the retained context', () => {
  const changedRequest = buildRequest();
  changedRequest.inputXmlSource = sealLinearPipingInputXmlSource({
    sourceId: 'PROJECT-INPUTXML-PHASE2D',
    sourceRevision: '02',
    fileName: 'phase2d-input.xml',
    mediaType: 'application/xml',
    content: XML,
  });
  expectCode(
    () => sealLinearPipingInputXmlAnalysisContext({
      inputXmlSource: changedRequest.inputXmlSource,
      conditionedTopologyHash: context.conditionedTopologyHash,
      ingestionEvidence: context.ingestionEvidence,
      sourceAnalysisContext: context.sourceAnalysisContext,
    }),
    'PIPING_INPUTXML_CONTEXT_SOURCE_MISMATCH',
  );
});

test('P2D-CONTEXT-05', 'Context evidence tamper is independently rejected', () => {
  const tampered = structuredClone(context);
  tampered.evidenceHash = 'fnv1a64:0000000000000000';
  expectCode(
    () => requireLinearPipingInputXmlAnalysisContext(tampered),
    'PIPING_INPUTXML_CONTEXT_HASH_MISMATCH',
  );
});

test('P2D-CONTEXT-06', 'Repeated InputXML context compilation is deterministic', () => {
  const repeated = compileLinearPipingInputXmlAnalysisContext(
    buildRequest(),
    { factorizationCache: null },
  );
  assert.equal(repeated.semanticHash, context.semanticHash);
  assert.equal(repeated.evidenceHash, context.evidenceHash);
});

test('P2D-CONTEXT-07', 'Factorization reuse changes context evidence only', () => {
  const cache = createFactorizationCache();
  const first = compileLinearPipingInputXmlAnalysisContext(buildRequest(), { factorizationCache: cache });
  const second = compileLinearPipingInputXmlAnalysisContext(buildRequest(), { factorizationCache: cache });
  assert.equal(first.semanticHash, second.semanticHash);
  assert.notEqual(first.evidenceHash, second.evidenceHash);
  assert.equal(first.sourceAnalysisContext.analysisResult.execution.factorization.reused, false);
  assert.equal(second.sourceAnalysisContext.analysisResult.execution.factorization.reused, true);
});

console.log('\n[SIMULATED] Linear piping Phase 2D InputXML context check PASS\n');
