import {
  SCHEMAS,
  assertEnum,
  assertExactKeys,
  assertFiniteNumber,
  assertHash,
  assertId,
  sealWithHash,
  verifySealedHash,
} from './contracts.js';

export function createExecutionRequest(input) {
  assertExactKeys(input, [
    'schema',
    'requestId',
    'canonicalModelHash',
    'solverProfileHash',
    'deckProfileHash',
    'timeoutSeconds',
    'maximumInputBytes',
    'maximumOutputBytes',
    'requestedArtifactPolicy',
  ], 'executionRequestInput', ['executionRequestSemanticHash']);
  if (Object.hasOwn(input, 'executionRequestSemanticHash')) {
    throw new TypeError('executionRequestSemanticHash is computed internally.');
  }
  if (input.schema !== SCHEMAS.EXECUTION_REQUEST) {
    throw new TypeError('Unknown external FE execution request schema.');
  }
  assertId(input.requestId, 'executionRequestInput.requestId');
  assertHash(input.canonicalModelHash, 'executionRequestInput.canonicalModelHash');
  assertHash(input.solverProfileHash, 'executionRequestInput.solverProfileHash');
  assertHash(input.deckProfileHash, 'executionRequestInput.deckProfileHash');
  assertFiniteNumber(
    input.timeoutSeconds,
    'executionRequestInput.timeoutSeconds',
    (v) => Number.isInteger(v) && v >= 1 && v <= 3600,
    'bounded positive integer',
  );
  assertFiniteNumber(
    input.maximumInputBytes,
    'executionRequestInput.maximumInputBytes',
    (v) => Number.isInteger(v) && v >= 1 && v <= 100_000_000,
    'bounded positive integer',
  );
  assertFiniteNumber(
    input.maximumOutputBytes,
    'executionRequestInput.maximumOutputBytes',
    (v) => Number.isInteger(v) && v >= 1 && v <= 1_000_000_000,
    'bounded positive integer',
  );
  assertEnum(
    input.requestedArtifactPolicy,
    ['RETAIN_ALLOWLISTED_RAW_OUTPUTS'],
    'executionRequestInput.requestedArtifactPolicy',
  );
  return sealWithHash({
    schema: SCHEMAS.EXECUTION_REQUEST,
    requestId: input.requestId,
    canonicalModelHash: input.canonicalModelHash,
    solverProfileHash: input.solverProfileHash,
    deckProfileHash: input.deckProfileHash,
    timeoutSeconds: input.timeoutSeconds,
    maximumInputBytes: input.maximumInputBytes,
    maximumOutputBytes: input.maximumOutputBytes,
    requestedArtifactPolicy: input.requestedArtifactPolicy,
  }, 'executionRequestSemanticHash');
}

export function validateExecutionRequest(request) {
  verifySealedHash(request, 'executionRequestSemanticHash', 'executionRequest');
  const forbidden = [
    'executablePath',
    'workingDirectory',
    'arguments',
    'shellCommand',
    'environment',
    'includeFiles',
    'networkUrl',
    'containerOverride',
    'authorityState',
  ];
  forbidden.forEach((field) => {
    if (Object.hasOwn(request, field)) throw new TypeError(`Caller-provided ${field} is prohibited.`);
  });
  return true;
}
