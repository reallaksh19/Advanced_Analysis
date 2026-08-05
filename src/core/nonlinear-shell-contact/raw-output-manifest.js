import {
  SCHEMAS,
  assertBoolean,
  assertEnum,
  assertExactKeys,
  assertFiniteNumber,
  assertGitSha,
  assertHash,
  assertRelativePath,
  assertString,
  clonePlain,
  codeUnitCompare,
  deepFreeze,
  semanticHash,
} from './contracts.js';

export function createRawOutputManifest(input) {
  assertExactKeys(input, [
    'requestId',
    'exactHeadSha',
    'canonicalModelHash',
    'solverProfileHash',
    'deckProfileHash',
    'deckSha256',
    'startedAtEvidence',
    'completedAtEvidence',
    'exitCode',
    'timeoutDisposition',
    'stdoutSha256',
    'stderrSha256',
    'files',
  ], 'rawManifestInput');
  assertString(input.requestId, 'rawManifestInput.requestId');
  assertGitSha(input.exactHeadSha, 'rawManifestInput.exactHeadSha');
  [
    'canonicalModelHash',
    'solverProfileHash',
    'deckProfileHash',
    'deckSha256',
    'stdoutSha256',
    'stderrSha256',
  ].forEach((field) => assertHash(input[field], `rawManifestInput.${field}`));
  assertString(input.startedAtEvidence, 'rawManifestInput.startedAtEvidence');
  assertString(input.completedAtEvidence, 'rawManifestInput.completedAtEvidence');
  assertFiniteNumber(
    input.exitCode,
    'rawManifestInput.exitCode',
    (v) => Number.isInteger(v),
    'integer',
  );
  assertEnum(
    input.timeoutDisposition,
    ['COMPLETED_WITHIN_TIMEOUT', 'TIMED_OUT'],
    'rawManifestInput.timeoutDisposition',
  );
  if (!Array.isArray(input.files)) throw new TypeError('rawManifestInput.files must be an array.');
  const files = input.files.map((file, index) => normalizeFile(file, index))
    .sort((a, b) => codeUnitCompare(a.relativePath, b.relativePath));
  if (new Set(files.map((file) => file.relativePath)).size !== files.length) {
    throw new TypeError('Raw output manifest contains duplicate file paths.');
  }
  const semanticPayload = {
    schema: SCHEMAS.RAW_MANIFEST,
    requestId: input.requestId,
    exactHeadSha: input.exactHeadSha,
    canonicalModelHash: input.canonicalModelHash,
    solverProfileHash: input.solverProfileHash,
    deckProfileHash: input.deckProfileHash,
    deckSha256: input.deckSha256,
    exitCode: input.exitCode,
    timeoutDisposition: input.timeoutDisposition,
    stdoutSha256: input.stdoutSha256,
    stderrSha256: input.stderrSha256,
    files,
  };
  return deepFreeze({
    ...semanticPayload,
    startedAtEvidence: input.startedAtEvidence,
    completedAtEvidence: input.completedAtEvidence,
    rawManifestSemanticHash: semanticHash(semanticPayload),
  });
}

export function validateRawOutputManifest(manifest) {
  assertExactKeys(manifest, [
    'schema',
    'requestId',
    'exactHeadSha',
    'canonicalModelHash',
    'solverProfileHash',
    'deckProfileHash',
    'deckSha256',
    'startedAtEvidence',
    'completedAtEvidence',
    'exitCode',
    'timeoutDisposition',
    'stdoutSha256',
    'stderrSha256',
    'files',
    'rawManifestSemanticHash',
  ], 'rawManifest');
  const semanticPayload = clonePlain(manifest);
  delete semanticPayload.startedAtEvidence;
  delete semanticPayload.completedAtEvidence;
  delete semanticPayload.rawManifestSemanticHash;
  if (semanticHash(semanticPayload) !== manifest.rawManifestSemanticHash) {
    throw new TypeError('Raw output manifest semantic hash mismatch.');
  }
  return true;
}

function normalizeFile(file, index) {
  const path = `rawManifestInput.files[${index}]`;
  assertExactKeys(file, [
    'relativePath',
    'role',
    'byteLength',
    'sha256',
    'mediaType',
    'required',
  ], path);
  assertRelativePath(file.relativePath, `${path}.relativePath`);
  assertEnum(
    file.role,
    ['INPUT_DECK', 'RAW_RESULT', 'STATUS', 'CONVERGENCE', 'LOG', 'AUXILIARY'],
    `${path}.role`,
  );
  assertFiniteNumber(
    file.byteLength,
    `${path}.byteLength`,
    (v) => Number.isInteger(v) && v >= 0,
    'nonnegative integer',
  );
  assertHash(file.sha256, `${path}.sha256`);
  assertString(file.mediaType, `${path}.mediaType`);
  assertBoolean(file.required, `${path}.required`);
  return clonePlain(file);
}
