import {
  SCHEMAS,
  assertArray,
  assertEnum,
  assertExactKeys,
  assertHash,
  assertId,
  clonePlain,
  sealWithHash,
  verifySealedHash,
} from './contracts.js';

const RESULT_KEYS = Object.freeze([
  'schema',
  'requestId',
  'modelId',
  'canonicalModelHash',
  'solverProfileHash',
  'deckProfileHash',
  'rawOutputManifestHash',
  'solverCompletionDisposition',
  'stepInventory',
  'incrementInventory',
  'availableFieldInventory',
  'completionEvidence',
  'incrementSequenceEvidence',
  'requestedOutputCoverage',
  'provisionalDatasetInventory',
  'diagnostics',
  'limitations',
  'executionEvidenceHash',
]);

export function createCanonicalStructuralResult(input) {
  assertExactKeys(input, RESULT_KEYS, 'resultInput', ['resultPayloadSemanticHash']);
  if (Object.hasOwn(input, 'resultPayloadSemanticHash')) {
    throw new TypeError('resultPayloadSemanticHash is computed internally.');
  }
  if (input.schema !== SCHEMAS.RESULT) throw new TypeError('Unknown result schema.');
  assertId(input.requestId, 'resultInput.requestId');
  assertId(input.modelId, 'resultInput.modelId');
  [
    'canonicalModelHash',
    'solverProfileHash',
    'deckProfileHash',
    'rawOutputManifestHash',
    'executionEvidenceHash',
  ].forEach((field) => assertHash(input[field], `resultInput.${field}`));
  assertEnum(
    input.solverCompletionDisposition,
    ['COMPLETE', 'INCOMPLETE', 'FAILED', 'BLOCKED'],
    'resultInput.solverCompletionDisposition',
  );
  [
    'stepInventory',
    'incrementInventory',
    'availableFieldInventory',
    'provisionalDatasetInventory',
    'diagnostics',
    'limitations',
  ].forEach((field) => assertArray(input[field], `resultInput.${field}`));
  assertExactKeys(input.completionEvidence, [
    'completionMarkers', 'failureMarkers', 'hasCompletionMarker',
    'hasFailureMarker', 'frdEndRecordPresent',
  ], 'resultInput.completionEvidence');
  assertExactKeys(input.incrementSequenceEvidence, [
    'status', 'violations',
  ], 'resultInput.incrementSequenceEvidence');
  assertEnum(
    input.incrementSequenceEvidence.status,
    ['MONOTONIC_OR_EMPTY', 'NON_MONOTONIC'],
    'resultInput.incrementSequenceEvidence.status',
  );
  assertArray(input.incrementSequenceEvidence.violations, 'resultInput.incrementSequenceEvidence.violations');
  assertExactKeys(input.requestedOutputCoverage, [
    'requested', 'available', 'missing', 'status',
  ], 'resultInput.requestedOutputCoverage');
  assertEnum(
    input.requestedOutputCoverage.status,
    ['COMPLETE', 'PARTIAL', 'NONE'],
    'resultInput.requestedOutputCoverage.status',
  );
  ['requested', 'available', 'missing'].forEach((field) => {
    assertArray(input.requestedOutputCoverage[field], `resultInput.requestedOutputCoverage.${field}`);
  });
  if (Object.hasOwn(input, 'contactAccepted')
      || Object.hasOwn(input, 'shellAccepted')
      || Object.hasOwn(input, 'dentingAccepted')) {
    throw new TypeError('NC-00 results cannot carry mechanics acceptance fields.');
  }
  return sealWithHash({
    schema: SCHEMAS.RESULT,
    requestId: input.requestId,
    modelId: input.modelId,
    canonicalModelHash: input.canonicalModelHash,
    solverProfileHash: input.solverProfileHash,
    deckProfileHash: input.deckProfileHash,
    rawOutputManifestHash: input.rawOutputManifestHash,
    solverCompletionDisposition: input.solverCompletionDisposition,
    stepInventory: clonePlain(input.stepInventory),
    incrementInventory: clonePlain(input.incrementInventory),
    availableFieldInventory: [...new Set(input.availableFieldInventory)].sort(),
    completionEvidence: clonePlain(input.completionEvidence),
    incrementSequenceEvidence: clonePlain(input.incrementSequenceEvidence),
    requestedOutputCoverage: clonePlain(input.requestedOutputCoverage),
    provisionalDatasetInventory: clonePlain(input.provisionalDatasetInventory),
    diagnostics: [...new Set(input.diagnostics)].sort(),
    limitations: [...new Set(input.limitations)].sort(),
    executionEvidenceHash: input.executionEvidenceHash,
  }, 'resultPayloadSemanticHash');
}

export function validateCanonicalStructuralResult(result) {
  assertExactKeys(result, [...RESULT_KEYS, 'resultPayloadSemanticHash'], 'canonicalResult');
  verifySealedHash(result, 'resultPayloadSemanticHash', 'canonicalResult');
  ['contactAccepted', 'shellAccepted', 'dentingAccepted'].forEach((field) => {
    if (Object.hasOwn(result, field)) throw new TypeError(`${field} is prohibited in NC-00.`);
  });
  return true;
}
