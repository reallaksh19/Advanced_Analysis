#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  deriveLinearPipingParentSet,
  runLinearPipingAnalysis,
} from '../src/core/linear-piping-analysis-consumer/index.js';
import {
  compileLinearPipingInterfaceSet,
  recoverLinearPipingInterfaceLoads,
  sealInterfaceProfile,
} from '../src/core/linear-piping-interface/index.js';
import {
  APPLICATION_RESULT_REQUEST_SCHEMA,
  B31_APPLICATION_REQUEST_SCHEMA,
  NOZZLE_ALLOWABLE_PROFILE_SCHEMA,
  NOZZLE_INTERACTION_RULE,
  compileLinearPipingB31Application,
  compileNozzleAllowableAssessment,
  requireLinearPipingB31Application,
  requireLinearPipingQualifiedApplicationResult,
  requireNozzleAllowableAssessment,
  sealLinearPipingQualifiedApplicationResult,
  sealNozzleAllowableProfile,
} from '../src/core/linear-piping-code-application/index.js';
import {
  COLD_TEMPERATURE,
  codeProfile,
  editionDataset,
  pressureStressContribution,
  reducerFrameElementE1,
  reducerMaterialResolution,
  reducerSectionResolutionE1,
  stressFactorSet,
} from './lfea-b4.0-code-engine-fixtures.mjs';
import {
  recoveryProfile,
  reducerCompilation,
  reducerComponent,
  reducerTipLoadCase,
  reducerTipLoadPrimitive,
  solverProfile,
} from './lfea-b3.4-recovery-fixtures.mjs';

function test(id, name, body) {
  body();
  console.log(`${id} PASS ${name}`);
}

function expectCode(body, expectedCode) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, expectedCode, `expected ${expectedCode}, received ${error?.code}`);
    return true;
  });
}

function clone(value) {
  return structuredClone(value);
}

const compilation = reducerCompilation();
const component = reducerComponent();
const highCase = reducerTipLoadCase(compilation);
const lowCase = reducerTipLoadCase(compilation, {
  loadCaseId: 'LC-RED-TIP-LOW',
  presentation: {
    label: 'Reducer low tip load',
    description: 'Lower comparison load for an ordered displacement range.',
  },
  primitives: [reducerTipLoadPrimitive({
    primitiveId: 'LP-TIP-RED-N2-LOW',
    force: { fx: 0, fy: 250, fz: 0 },
    sourceEvidence: {
      sourceId: 'PROJECT-LOAD-REGISTER',
      sourceRevision: '02',
      sourceSemanticHash: 'fnv1a64:6767676767676767',
    },
  })],
});

function analysisFor(loadCase, identity) {
  const parentInput = {
    compilation,
    loadCase,
    frameElements: [],
    pipingComponents: [component],
    solverProfile: solverProfile(),
    recoveryProfile: recoveryProfile(),
  };
  return runLinearPipingAnalysis({
    schema: 'linear-piping-analysis-request/v1',
    analysisIdentity: identity,
    analysisRevision: 1,
    ...parentInput,
    expectedParents: deriveLinearPipingParentSet(parentInput),
  }, { factorizationCache: null });
}

const highAnalysis = analysisFor(highCase, 'PIPE-PHASE4-HIGH');
const lowAnalysis = analysisFor(lowCase, 'PIPE-PHASE4-LOW');

function declared(value, source = 'FIXTURE-NOZZLE-DATASHEET-NOT-STANDARD') {
  return { value, source };
}

function nozzleProfile(overrides = {}) {
  return sealNozzleAllowableProfile({
    schema: NOZZLE_ALLOWABLE_PROFILE_SCHEMA,
    profileId: 'NOZZLE-PROFILE-RED-001-R1',
    interfaceId: 'IF-NOZZLE-RED-001',
    sourceIdentity: {
      authority: 'FIXTURE-VENDOR-NOT-STANDARD',
      documentId: 'FIXTURE-NOZZLE-DATASHEET-001',
      revision: '00',
      sourceSemanticHash: 'fnv1a64:abababababababab',
    },
    forceAllowables: {
      x: declared(10000),
      y: declared(10000),
      z: declared(10000),
    },
    momentAllowables: {
      x: declared(10000),
      y: declared(10000),
      z: declared(10000),
    },
    interactionRuleId: NOZZLE_INTERACTION_RULE,
    interactionLimit: declared(1),
    semanticHash: '',
    ...overrides,
  });
}

function nozzleInterfaceSet(allowableProfile) {
  const node = compilation.model.nodes.find((row) => row.nodeId === 'RED-001.N0');
  const dofMappings = compilation.model.constraints
    .filter((row) => row.nodeId === node.nodeId)
    .map((row) => ({
      dof: row.dof,
      behavior: row.behavior,
      constraintId: row.constraintId,
      stiffness: row.stiffness ?? null,
    }));
  const interfaceProfile = sealInterfaceProfile({
    schema: 'linear-piping-interface-profile/v1',
    profileId: 'LINEAR-PIPING-PHASE4-NOZZLE-R1',
    basisTolerance: declared(1e-12, 'PHASE-4-INTERFACE-FIXTURE'),
    positionTolerance: declared(1e-12, 'PHASE-4-INTERFACE-FIXTURE'),
    offsetTolerance: declared(1e-12, 'PHASE-4-INTERFACE-FIXTURE'),
    semanticHash: '',
  });
  return compileLinearPipingInterfaceSet({
    compilation,
    supportAttachmentModel: null,
    restraintCapabilityModel: null,
    definitions: [{
      interfaceId: allowableProfile.interfaceId,
      interfaceKind: 'NOZZLE',
      nodeId: node.nodeId,
      sourceEntityId: 'RED-001',
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
        sourceId: 'FIXTURE-EQUIPMENT-NOZZLE-REGISTER',
        sourceRevision: '01',
        sourceSemanticHash: 'fnv1a64:cdcdcdcdcdcdcdcd',
      },
      allowableProfileHash: allowableProfile.semanticHash,
    }],
    profile: interfaceProfile,
  });
}

const allowableProfile = nozzleProfile();
const interfaceSet = nozzleInterfaceSet(allowableProfile);
const interfaceRecovery = recoverLinearPipingInterfaceLoads({
  interfaceSet,
  analysisResult: highAnalysis,
  loadCase: highCase,
});
const nozzleAssessment = compileNozzleAllowableAssessment({
  interfaceSet,
  interfaceRecovery,
  allowableProfile,
});

function commonCodeCheck() {
  return {
    codePointId: 'RED-001.S1',
    componentId: 'RED-001',
    frameElementRecord: reducerFrameElementE1(component),
    sectionResolution: reducerSectionResolutionE1(),
    materialResolution: reducerMaterialResolution(),
    stressFactorSet: stressFactorSet(),
  };
}

function b31Request(overrides = {}) {
  return {
    schema: B31_APPLICATION_REQUEST_SCHEMA,
    applicationId: 'B31-APP-PHASE4-01',
    codeProfile: codeProfile(),
    editionDataset: editionDataset(),
    cases: [
      { caseId: 'HIGH', loadCase: highCase, recovery: highAnalysis.recovery },
      { caseId: 'LOW', loadCase: lowCase, recovery: lowAnalysis.recovery },
    ],
    checks: [
      {
        checkId: 'B31-SUS-RED-S1',
        category: 'SUSTAINED',
        combinationId: highCase.loadCaseId,
        actionSource: { kind: 'SINGLE_CASE', caseId: 'HIGH' },
        ...commonCodeCheck(),
        pressureStressContribution: pressureStressContribution(),
        coldTemperature: null,
        occasionalCategoryId: null,
      },
      {
        checkId: 'B31-OCC-RED-S1',
        category: 'OCCASIONAL',
        combinationId: `${highCase.loadCaseId}-WIND_FIXTURE`,
        actionSource: { kind: 'SINGLE_CASE', caseId: 'HIGH' },
        ...commonCodeCheck(),
        pressureStressContribution: pressureStressContribution(),
        coldTemperature: null,
        occasionalCategoryId: 'WIND_FIXTURE',
      },
      {
        checkId: 'B31-EXP-RED-S1',
        category: 'DISPLACEMENT_STRESS_RANGE',
        combinationId: 'RANGE-HIGH-MINUS-LOW',
        actionSource: { kind: 'CASE_RANGE', fromCaseId: 'LOW', toCaseId: 'HIGH' },
        ...commonCodeCheck(),
        pressureStressContribution: null,
        coldTemperature: {
          value: COLD_TEMPERATURE,
          source: 'FIXTURE-EDITION-DATASET-NOT-ASME',
        },
        occasionalCategoryId: null,
      },
    ],
    ...overrides,
  };
}

const b31Application = compileLinearPipingB31Application(b31Request());
const applicationResult = sealLinearPipingQualifiedApplicationResult({
  schema: APPLICATION_RESULT_REQUEST_SCHEMA,
  applicationId: 'PIPE-PHASE4-APPLICATION-01',
  analysisResults: [highAnalysis, lowAnalysis],
  interfaceSet,
  interfaceRecoveries: [interfaceRecovery],
  nozzleAssessments: [nozzleAssessment],
  b31Application,
});

console.log('\n--- [SIMULATED] Linear piping Phase 4 code and allowable checks ---');

test('P4-NOZ-01', 'Nozzle profile is caller-supplied, traceable, hash-bound and contains no embedded standard table', () => {
  assert.equal(allowableProfile.sourceIdentity.authority, 'FIXTURE-VENDOR-NOT-STANDARD');
  assert.equal(interfaceSet.interfaces[0].allowableProfileHash, allowableProfile.semanticHash);
  assert.ok(Object.isFrozen(allowableProfile));
});

test('P4-NOZ-02', 'Nozzle assessment uses recovered local force and reference-point moment with the declared linear interaction', () => {
  const expected = Object.values(nozzleAssessment.termRatios).reduce((sum, value) => sum + value, 0);
  assert.equal(nozzleAssessment.interactionValue, expected);
  assert.equal(nozzleAssessment.assessmentStatus, 'PASS');
  assert.equal(nozzleAssessment.qualificationStatus, 'QUALIFIED_UNDER_CONFIGURED_PROFILE');
  assert.equal(nozzleAssessment.interfaceRecoverySemanticHash, interfaceRecovery.semanticHash);
  assert.equal(requireNozzleAllowableAssessment(nozzleAssessment).semanticHash, nozzleAssessment.semanticHash);
});

test('P4-NOZ-03', 'A nozzle profile not declared by the governed interface is rejected', () => {
  const wrong = nozzleProfile({
    profileId: 'NOZZLE-PROFILE-RED-001-R2',
    sourceIdentity: {
      authority: 'FIXTURE-VENDOR-NOT-STANDARD',
      documentId: 'FIXTURE-NOZZLE-DATASHEET-002',
      revision: '01',
      sourceSemanticHash: 'fnv1a64:acacacacacacacac',
    },
  });
  expectCode(() => compileNozzleAllowableAssessment({
    interfaceSet,
    interfaceRecovery,
    allowableProfile: wrong,
  }), 'PIPING_NOZZLE_ALLOWABLE_PROFILE_MISMATCH');
});

test('P4-NOZ-04', 'A tampered nozzle evidence hash is rejected independently', () => {
  const tampered = clone(nozzleAssessment);
  tampered.evidenceHash = 'fnv1a64:0000000000000000';
  expectCode(() => requireNozzleAllowableAssessment(tampered), 'PIPING_NOZZLE_ASSESSMENT_HASH_MISMATCH');
});

test('P4-B31-01', 'SUSTAINED B31.3 action is resolved from one sealed B-3.4 case, never caller-injected', () => {
  const entry = b31Application.results.find((row) => row.checkId === 'B31-SUS-RED-S1');
  assert.deepEqual(entry.sourceRecoveryHashes, [highAnalysis.recovery.semanticHash]);
  assert.equal(entry.codeResult.category, 'SUSTAINED');
  assert.equal(entry.codeResult.status, 'QUALIFIED UNDER CONFIGURED PROFILE');
});

test('P4-B31-02', 'OCCASIONAL is resolved from a sealed case and a declared duration category', () => {
  const entry = b31Application.results.find((row) => row.checkId === 'B31-OCC-RED-S1');
  assert.deepEqual(entry.sourceRecoveryHashes, [highAnalysis.recovery.semanticHash]);
  assert.equal(entry.codeResult.category, 'OCCASIONAL');
  assert.equal(entry.codeResult.status, 'QUALIFIED UNDER CONFIGURED PROFILE');
});

test('P4-B31-03', 'Displacement stress range uses an explicit ordered recovery pair and excludes pressure', () => {
  const entry = b31Application.results.find((row) => row.checkId === 'B31-EXP-RED-S1');
  assert.deepEqual(entry.sourceRecoveryHashes, [
    lowAnalysis.recovery.semanticHash,
    highAnalysis.recovery.semanticHash,
  ]);
  assert.equal(entry.codeResult.category, 'DISPLACEMENT_STRESS_RANGE');
  assert.equal(entry.codeResult.stressTerms.pressure, 0);
});

test('P4-B31-04', 'OPERATING cannot be introduced as a compliance category', () => {
  const request = b31Request();
  request.checks[0] = { ...request.checks[0], category: 'OPERATING' };
  expectCode(() => compileLinearPipingB31Application(request), 'PIPING_B31_CATEGORY_UNSUPPORTED');
});

test('P4-B31-05', 'Caller localAction injection is rejected by the exact check schema', () => {
  const request = b31Request();
  request.checks[0] = {
    ...request.checks[0],
    localAction: { fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 },
  };
  assert.throws(() => compileLinearPipingB31Application(request));
});

test('P4-B31-06', 'A displacement range with identical endpoint cases is rejected', () => {
  const request = b31Request();
  request.checks[2] = {
    ...request.checks[2],
    actionSource: { kind: 'CASE_RANGE', fromCaseId: 'HIGH', toCaseId: 'HIGH' },
  };
  expectCode(() => compileLinearPipingB31Application(request), 'PIPING_B31_RANGE_CASES_IDENTICAL');
});

test('P4-B31-07', 'B31 application is deterministic and revalidates its evidence chain', () => {
  const request = b31Request();
  const second = compileLinearPipingB31Application({ ...request, cases: [...request.cases].reverse() });
  assert.equal(second.semanticHash, b31Application.semanticHash);
  assert.equal(requireLinearPipingB31Application(b31Application).semanticHash, b31Application.semanticHash);
});

test('P4-B31-08', 'A tampered retained recovery evidence hash is rejected', () => {
  const tampered = clone(b31Application);
  tampered.caseBindings[0].recoveryEvidenceHash = 'fnv1a64:0000000000000000';
  expectCode(() => requireLinearPipingB31Application(tampered), 'PIPING_B31_APPLICATION_HASH_MISMATCH');
});

test('P4-APP-01', 'Combined application result seals analysis, interface, nozzle and B31 parent identities', () => {
  assert.equal(applicationResult.notConfigured.length, 0);
  assert.equal(applicationResult.assessmentSummary.nozzlePassCount, 1);
  assert.equal(applicationResult.assessmentSummary.codeQualifiedCount, 3);
  assert.equal(applicationResult.status, 'CONDITIONAL');
  assert.equal(
    requireLinearPipingQualifiedApplicationResult(applicationResult).semanticHash,
    applicationResult.semanticHash,
  );
});

test('P4-APP-02', 'Missing nozzle configuration remains explicit and makes the application conditional', () => {
  const result = sealLinearPipingQualifiedApplicationResult({
    schema: APPLICATION_RESULT_REQUEST_SCHEMA,
    applicationId: 'PIPE-PHASE4-APPLICATION-NOT-CONFIGURED',
    analysisResults: [highAnalysis, lowAnalysis],
    interfaceSet,
    interfaceRecoveries: [interfaceRecovery],
    nozzleAssessments: [],
    b31Application,
  });
  assert.deepEqual(result.notConfigured, ['NOZZLE_ALLOWABLE_NOT_CONFIGURED:IF-NOZZLE-RED-001']);
  assert.equal(result.status, 'CONDITIONAL');
  assert.equal(
    result.limitations.find((row) => row.sourceKind === 'APPLICATION_CONFIGURATION').sourceSemanticHash,
    interfaceSet.semanticHash,
  );
});

test('P4-APP-03', 'Tampered nozzle assessment identity is rejected before application sealing', () => {
  const tampered = clone(nozzleAssessment);
  tampered.interfaceRecoverySemanticHash = 'fnv1a64:0000000000000000';
  expectCode(() => sealLinearPipingQualifiedApplicationResult({
    schema: APPLICATION_RESULT_REQUEST_SCHEMA,
    applicationId: 'PIPE-PHASE4-TAMPERED',
    analysisResults: [highAnalysis, lowAnalysis],
    interfaceSet,
    interfaceRecoveries: [interfaceRecovery],
    nozzleAssessments: [tampered],
    b31Application,
  }), 'PIPING_NOZZLE_ASSESSMENT_HASH_MISMATCH');
});

test('P4-APP-04', 'Tampered application evidence is rejected independently', () => {
  const tampered = clone(applicationResult);
  tampered.analysisEvidenceHashes[0] = 'fnv1a64:0000000000000000';
  expectCode(
    () => requireLinearPipingQualifiedApplicationResult(tampered),
    'PIPING_APPLICATION_RESULT_HASH_MISMATCH',
  );
});

console.log('Linear piping Phase 4 code and allowable checks PASS');
