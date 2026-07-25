import { semanticHash } from '../shared-piping-model/index.js';
export function reconstructResultHashes(result) {
  const payload = { ...result };
  delete payload.semanticHashes;
  return {
    sourceSemanticHash: result.sourceAncestry?.sourceSemanticHash ?? null,
    canonicalModelSemanticHash: result.sourceAncestry?.canonicalModelSemanticHash ?? null,
    resultPayloadSemanticHash: semanticHash(payload),
    executionEvidenceHash: semanticHash(executionEvidence(result)),
    qualificationEvidenceHash: semanticHash(qualificationEvidence(result)),
  };
}
export function attachResultHashes(result) {
  return { ...result, semanticHashes: reconstructResultHashes(result) };
}
function executionEvidence(result) {
  return {
    coordinateSystemEvidence: result.coordinateSystemEvidence ?? null,
    transformedLoadCases: result.transformedLoadCases ?? null,
    pressureStressResults: result.pressureStressResults ?? null,
    forceMomentAccounting: result.forceMomentAccounting ?? null,
    formulaTrace: result.formulaTrace,
    diagnostics: result.diagnostics,
  };
}
function qualificationEvidence(result) {
  return {
    qualification: result.qualification,
    limitations: result.limitations,
    diagnostics: result.diagnostics,
  };
}
