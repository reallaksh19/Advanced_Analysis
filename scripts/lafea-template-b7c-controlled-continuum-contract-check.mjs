#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  LAFEA_CONTROLLED_CONTINUUM_CONTROLLER_BOUNDARY,
  LAFEA_CONTROLLED_CONTINUUM_PILOT_ID,
  createControlledContinuumExecutionRequest,
  createControlledContinuumExecutionReceipt,
  createControlledContinuumLevelEvidence,
  validateControlledContinuumExecutionReceipt,
  validateControlledContinuumExecutionRequest,
  validateControlledContinuumLevelEvidence,
} from '../src/core/lafea-application-templates/controlled-continuum-pilot-contract.js';

const REVISION = 'fnv1a64:0123456789abcdef';
let negativeCount = 0;

sourceGuards();

const request = createControlledContinuumExecutionRequest(requestInput());
assert.equal(request.pilotId, LAFEA_CONTROLLED_CONTINUUM_PILOT_ID);
assert.equal(request.templateId, 'C2D-LUG-PINHOLE');
assert.equal(request.stageId, 'LAFEA.3');
assert.equal(request.meshLevels.length, 3);
assert.equal(request.meshLevels.every((row) => row.elementType === 'T6'), true);
assert.equal(validateControlledContinuumExecutionRequest(request).ok, true);
assert.equal(Object.isFrozen(request), true);
assert.equal(
  LAFEA_CONTROLLED_CONTINUUM_CONTROLLER_BOUNDARY.authority,
  'B7C_CONTRACT_ONLY_CONTROLLER_IMPLEMENTATION_WITHHELD',
);

const acceptedLevels = [1, 2, 3].map((ordinal) => levelEvidence(request, ordinal));
acceptedLevels.forEach((level) => {
  assert.equal(level.status, 'ACCEPTED');
  assert.equal(level.recoveryAuthority, 'RETAINED_INTEGRATION_POINT_VALUES');
  assert.equal(validateControlledContinuumLevelEvidence(level).ok, true);
});

const accepted = createControlledContinuumExecutionReceipt({
  receiptId: 'B7C-RECEIPT-ACCEPTED',
  request,
  currentDocumentRevisionDigest: REVISION,
  sourceAuthorityHash: hash('SOURCE-AUTHORITY'),
  exactSourceHash: hash('EXACT-SOURCE'),
  levelEvidence: acceptedLevels,
  pilotConvergence: convergenceInput(request, acceptedLevels, [100, 110, 113]),
  diagnostics: [],
});
assert.equal(accepted.status, 'ACCEPTED');
assert.equal(accepted.calculationAccepted, true);
assert.equal(accepted.recoveryReady, true);
assert.equal(accepted.convergenceReady, true);
assert.equal(accepted.resultReady, true);
assert.equal(accepted.assessmentReady, false);
assert.equal(accepted.codeReady, false);
assert.equal(accepted.releaseQualified, false);
assert.equal(accepted.generalT7dAuthorized, false);
assert.equal(accepted.lifecycleParents.registrationAuthorized, true);
assert.equal(accepted.lifecycleParents.recoveryHash, acceptedLevels[2].recoveryHash);
assert.equal(validateControlledContinuumExecutionReceipt(accepted).ok, true);

const convergenceBlocked = createControlledContinuumExecutionReceipt({
  receiptId: 'B7C-RECEIPT-CONVERGENCE-BLOCKED',
  request,
  currentDocumentRevisionDigest: REVISION,
  sourceAuthorityHash: hash('SOURCE-AUTHORITY'),
  exactSourceHash: hash('EXACT-SOURCE'),
  levelEvidence: acceptedLevels,
  pilotConvergence: convergenceInput(request, acceptedLevels, [100, 110, 130]),
  diagnostics: [],
});
assert.equal(convergenceBlocked.status, 'BLOCKED');
assert.equal(convergenceBlocked.calculationAccepted, true);
assert.equal(convergenceBlocked.recoveryReady, true);
assert.equal(convergenceBlocked.resultReady, true);
assert.equal(convergenceBlocked.convergenceReady, false);
assert.equal(convergenceBlocked.lifecycleParents.registrationAuthorized, false);
assert.equal(
  convergenceBlocked.pilotConvergence.reasons.includes(
    'PILOT_FINE_LEVEL_CHANGE_EXCEEDS_TOLERANCE',
  ),
  true,
);

const staleRevision = createControlledContinuumExecutionReceipt({
  receiptId: 'B7C-RECEIPT-STALE-REVISION',
  request,
  currentDocumentRevisionDigest: 'fnv1a64:fedcba9876543210',
  sourceAuthorityHash: hash('SOURCE-AUTHORITY'),
  exactSourceHash: hash('EXACT-SOURCE'),
  levelEvidence: acceptedLevels,
  pilotConvergence: null,
  diagnostics: [],
});
assert.equal(staleRevision.status, 'BLOCKED');
assert.equal(staleRevision.calculationAccepted, false);
assert.equal(staleRevision.recoveryReady, false);
assert.equal(staleRevision.resultReady, false);
assert.equal(staleRevision.diagnostics.includes('IMPORTED_DOCUMENT_REVISION_STALE'), true);
assert.equal(validateControlledContinuumExecutionReceipt(staleRevision).ok, true);

const failedLevels = [
  levelEvidence(request, 1),
  createControlledContinuumLevelEvidence({
    ...levelInput(request, 2),
    executionHash: hash('EXECUTION-2-FAILED'),
    resultHash: null,
    recoveryHash: null,
    calculationAccepted: false,
    recoveryAuthority: 'NOT_PRODUCED',
    integrationPointResultHash: null,
    status: 'FAILED',
    diagnostics: ['NUMERICAL_FAILURE'],
  }),
  levelEvidence(request, 3),
];
const failed = createControlledContinuumExecutionReceipt({
  receiptId: 'B7C-RECEIPT-FAILED',
  request,
  currentDocumentRevisionDigest: REVISION,
  sourceAuthorityHash: hash('SOURCE-AUTHORITY'),
  exactSourceHash: hash('EXACT-SOURCE'),
  levelEvidence: failedLevels,
  pilotConvergence: null,
  diagnostics: [],
});
assert.equal(failed.status, 'FAILED');
assert.equal(failed.calculationAccepted, false);
assert.equal(failed.recoveryReady, false);
assert.equal(failed.convergenceReady, false);
assert.equal(failed.resultReady, false);
assert.equal(failed.diagnostics.includes('LEVEL_2_FAILED'), true);

negative('release not ENGINE_EXECUTABLE', () => createControlledContinuumExecutionRequest({
  ...requestInput(),
  releaseAuthorityState: 'IMPORTED_FOR_EDITING',
}));
negative('stale compatibility', () => createControlledContinuumExecutionRequest({
  ...requestInput(),
  compatibilityStatus: 'STALE',
}));
negative('mapping not qualified', () => createControlledContinuumExecutionRequest({
  ...requestInput(),
  mappingStatus: 'MAPPING_EVIDENCE_BLOCKED',
}));
negative('binding not BOUND', () => createControlledContinuumExecutionRequest({
  ...requestInput(),
  boundBindingStatus: 'MAPPING_EVIDENCE_PENDING',
}));
negative('benchmark not qualified', () => createControlledContinuumExecutionRequest({
  ...requestInput(),
  benchmarkStatus: 'BENCHMARK_EVIDENCE_BLOCKED',
}));
negative('caller source hash forbidden', () => createControlledContinuumExecutionRequest({
  ...requestInput(),
  sourceHash: hash('FORBIDDEN'),
}));
negative('caller source-authority hash forbidden', () =>
  createControlledContinuumExecutionRequest({
    ...requestInput(),
    sourceAuthorityHash: hash('FORBIDDEN'),
  }));
negative('two mesh levels', () => createControlledContinuumExecutionRequest({
  ...requestInput(),
  meshLevels: requestInput().meshLevels.slice(0, 2),
}));
negative('duplicate mesh hash', () => {
  const input = requestInput();
  input.meshLevels[1].meshHash = input.meshLevels[0].meshHash;
  return createControlledContinuumExecutionRequest(input);
});
negative('Q8 pilot level', () => {
  const input = requestInput();
  input.meshLevels[1].elementType = 'Q8';
  return createControlledContinuumExecutionRequest(input);
});
negative('stale mesh model parent', () => {
  const input = requestInput();
  input.meshLevels[2].canonicalModelHash = hash('STALE-MODEL');
  return createControlledContinuumExecutionRequest(input);
});
negative('accepted level missing recovery', () =>
  createControlledContinuumLevelEvidence({
    ...levelInput(request, 1),
    recoveryHash: null,
  }));
negative('projected stress promoted', () =>
  createControlledContinuumLevelEvidence({
    ...levelInput(request, 1),
    projectedDisplayHash: hash('DISPLAY'),
    projectedDisplayRole: 'ASSESSMENT_AUTHORITY',
  }));
negative('duplicate recovery hash', () => {
  const duplicate = [
    acceptedLevels[0],
    createControlledContinuumLevelEvidence({
      ...levelInput(request, 2),
      recoveryHash: acceptedLevels[0].recoveryHash,
    }),
    acceptedLevels[2],
  ];
  return createControlledContinuumExecutionReceipt({
    receiptId: 'DUPLICATE-RECOVERY',
    request,
    currentDocumentRevisionDigest: REVISION,
    sourceAuthorityHash: hash('SOURCE-AUTHORITY'),
    exactSourceHash: hash('EXACT-SOURCE'),
    levelEvidence: duplicate,
    pilotConvergence: null,
    diagnostics: [],
  });
});
negative('stale level request parent', () => {
  const stale = createControlledContinuumLevelEvidence({
    ...levelInput(request, 2),
    requestHash: hash('STALE-REQUEST'),
  });
  return createControlledContinuumExecutionReceipt({
    receiptId: 'STALE-LEVEL-PARENT',
    request,
    currentDocumentRevisionDigest: REVISION,
    sourceAuthorityHash: hash('SOURCE-AUTHORITY'),
    exactSourceHash: hash('EXACT-SOURCE'),
    levelEvidence: [acceptedLevels[0], stale, acceptedLevels[2]],
    pilotConvergence: null,
    diagnostics: [],
  });
});
negative('convergence missing level', () =>
  createControlledContinuumExecutionReceipt({
    receiptId: 'MISSING-CONVERGENCE-LEVEL',
    request,
    currentDocumentRevisionDigest: REVISION,
    sourceAuthorityHash: hash('SOURCE-AUTHORITY'),
    exactSourceHash: hash('EXACT-SOURCE'),
    levelEvidence: acceptedLevels,
    pilotConvergence: {
      ...convergenceInput(request, acceptedLevels, [100, 110, 113]),
      levels: convergenceInput(request, acceptedLevels, [100, 110, 113])
        .levels.slice(0, 2),
    },
    diagnostics: [],
  }));
negative('convergence stale recovery parent', () => {
  const convergence = convergenceInput(request, acceptedLevels, [100, 110, 113]);
  convergence.levels[2].recoveryHash = hash('STALE-RECOVERY');
  return createControlledContinuumExecutionReceipt({
    receiptId: 'STALE-CONVERGENCE-PARENT',
    request,
    currentDocumentRevisionDigest: REVISION,
    sourceAuthorityHash: hash('SOURCE-AUTHORITY'),
    exactSourceHash: hash('EXACT-SOURCE'),
    levelEvidence: acceptedLevels,
    pilotConvergence: convergence,
    diagnostics: [],
  });
});
negativeValidation('tampered request hash', validateControlledContinuumExecutionRequest, {
  ...request,
  semanticHash: hash('TAMPERED-REQUEST'),
});
negativeValidation('mutable request', validateControlledContinuumExecutionRequest,
  structuredClone(request));
negativeValidation('tampered receipt evidence', validateControlledContinuumExecutionReceipt, {
  ...accepted,
  evidenceHash: hash('TAMPERED-RECEIPT'),
});

console.log(JSON.stringify({
  schema: 'lafea-template-b7c-controlled-continuum-contract-check/v1',
  status: 'PASS',
  pilotId: LAFEA_CONTROLLED_CONTINUUM_PILOT_ID,
  acceptedReceipt: accepted.semanticHash,
  blockedConvergenceReceipt: convergenceBlocked.semanticHash,
  failedReceipt: failed.semanticHash,
  negativeTestCount: negativeCount,
  authority: {
    controllerImplemented: false,
    engineExecutionAuthorized: false,
    sourceAuthorityIssuedByThisPackage: false,
    recoveryProducedByThisPackage: false,
    convergenceRegistered: false,
    assessmentReady: false,
    codeReady: false,
    releaseQualified: false,
    generalT7dAuthorized: false,
  },
}));

function requestInput() {
  const canonicalModelHash = hash('CANONICAL-MODEL');
  const analysisGeometryHash = hash('ANALYSIS-GEOMETRY');
  return {
    requestId: 'B7C-REQUEST-001',
    releaseRecordHash: hash('RELEASE-RECORD'),
    releaseAuthorityState: 'ENGINE_EXECUTABLE',
    releaseValidity: 'CURRENT',
    compatibilityReceiptHash: hash('COMPATIBILITY'),
    compatibilityStatus: 'CURRENT',
    mappingPackageHash: hash('B7A-MAPPING'),
    mappingStatus: 'MAPPING_EVIDENCE_QUALIFIED',
    boundBindingHash: hash('B7A-BOUND-BINDING'),
    boundBindingStatus: 'BOUND',
    benchmarkQualificationHash: hash('B7B-BENCHMARK'),
    benchmarkStatus: 'BENCHMARK_EVIDENCE_QUALIFIED',
    importedDocumentRevisionDigest: REVISION,
    sourceAuthorityRequest: {
      originRef: 'B7C-CONTROLLED-PILOT',
      expectedStageId: 'LAFEA.3',
      expectedDocumentRevisionDigest: REVISION,
      requestedRole: 'AUTHORITATIVE_EDITABLE_STAGE_SOURCE',
    },
    canonicalModelHash,
    analysisGeometryHash,
    meshLevels: [1, 2, 3].map((ordinal) => ({
      ordinal,
      meshHash: hash(`MESH-${ordinal}`),
      meshProfileHash: engineeringHash(`MESH-PROFILE-${ordinal}`),
      elementType: 'T6',
      canonicalModelHash,
      analysisGeometryHash,
    })),
    recoveryProfileHash: engineeringHash('RECOVERY-PROFILE'),
    convergenceProfileHash: engineeringHash('CONVERGENCE-PROFILE'),
  };
}

function levelInput(requestValue, ordinal) {
  return {
    requestHash: requestValue.semanticHash,
    ordinal,
    meshHash: requestValue.meshLevels[ordinal - 1].meshHash,
    sourceAuthorityHash: hash('SOURCE-AUTHORITY'),
    exactSourceHash: hash('EXACT-SOURCE'),
    importedDocumentRevisionDigest: REVISION,
    executionHash: hash(`EXECUTION-${ordinal}`),
    resultHash: hash(`RESULT-${ordinal}`),
    recoveryHash: hash(`RECOVERY-${ordinal}`),
    resultSchema: 'local-continuum-result/v1',
    calculationAccepted: true,
    recoveryAuthority: 'RETAINED_INTEGRATION_POINT_VALUES',
    integrationPointResultHash: hash(`INTEGRATION-POINT-${ordinal}`),
    projectedDisplayHash: ordinal === 1 ? hash('DISPLAY-1') : null,
    projectedDisplayRole: ordinal === 1
      ? 'DISPLAY_ONLY_NOT_ASSESSMENT_AUTHORITY'
      : 'NOT_PRODUCED',
    status: 'ACCEPTED',
    diagnostics: [],
  };
}

function levelEvidence(requestValue, ordinal) {
  return createControlledContinuumLevelEvidence(levelInput(requestValue, ordinal));
}

function convergenceInput(requestValue, levels, observed) {
  return {
    quantityId: 'PINHOLE_PEAK_INTEGRATION_POINT_STRESS',
    units: 'MPa',
    tolerance: 0.05,
    levels: levels.map((level, index) => ({
      ordinal: index + 1,
      meshHash: requestValue.meshLevels[index].meshHash,
      recoveryHash: level.recoveryHash,
      observedQuantity: observed[index],
    })),
  };
}

function sourceGuards() {
  const source = fs.readFileSync(
    'src/core/lafea-application-templates/controlled-continuum-pilot-contract.js',
    'utf8',
  );
  assert.doesNotMatch(source, /\bexecuteLafeaStage\s*\(/u);
  assert.doesNotMatch(source, /\bcalculateLocalContinuum\s*\(/u);
  assert.doesNotMatch(source, /\bissueLafeaSourceAuthority\s*\(/u);
  assert.doesNotMatch(source, /\bregisterLafeaArtifact\s*\(/u);
  assert.doesNotMatch(source, /\bregisterLafeaLifecycleProducerBatch\s*\(/u);
  assert.doesNotMatch(source, /from ['"][^'"]*local-continuum/u);
  assert.doesNotMatch(source, /from ['"][^'"]*lafea-workbench-model/u);
}

function negative(label, callback) {
  negativeCount += 1;
  assert.throws(callback, undefined, label);
}

function negativeValidation(label, validator, value) {
  negativeCount += 1;
  assert.equal(validator(value).ok, false, label);
}

function hash(label) {
  return `sha256:${crypto.createHash('sha256').update(label).digest('hex')}`;
}

function engineeringHash(label) {
  return `fnv1a64:${crypto.createHash('sha256').update(label).digest('hex').slice(0, 16)}`;
}
