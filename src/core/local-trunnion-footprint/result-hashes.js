import { semanticHash } from './json.js';

export function reconstructTrunnionFootprintResultHashes(result) {
  const payload = { ...result };
  delete payload.semanticHashes;
  return {
    sourceEvidenceSemanticHash: sourceEvidenceHash(result),
    canonicalWorkflowModelSemanticHash: result.canonicalWorkflowModelHash ?? null,
    footprintGeometryHash: result.footprintGeometryEvidence?.footprintGeometryHash ?? null,
    loadDistributionInputHash: hashDistributionField(result, 'loadDistributionInputHash'),
    loadDistributionResultHash: hashDistributionField(result, 'loadDistributionResultHash'),
    canonicalShellModelHash: result.canonicalShellModelHash ?? null,
    shellResultHash: result.shellResultHash ?? null,
    resultPayloadSemanticHash: semanticHash(payload),
    executionEvidenceHash: semanticHash(executionEvidence(result)),
    qualificationEvidenceHash: semanticHash(qualificationEvidence(result)),
  };
}
export function attachTrunnionFootprintResultHashes(result) {
  const seeded = { ...result, semanticHashes: {} };
  seeded.semanticHashes = reconstructTrunnionFootprintResultHashes(seeded);
  return seeded;
}
function sourceEvidenceHash(result) {
  if (!result.canonicalWorkflowModel) return null;
  return semanticHash({ sourceAncestry: result.sourceAncestry, attachmentEvidenceHash: result.attachmentEvidenceHash, canonicalWorkflowModel: result.canonicalWorkflowModel });
}
function hashDistributionField(result, field) {
  if (!Array.isArray(result.loadDistributionEvidence)) return null;
  return semanticHash(result.loadDistributionEvidence.map((row) => row[field]));
}
function executionEvidence(result) {
  return {
    footprintGeometryEvidence: result.footprintGeometryEvidence ?? null,
    loadDistributionEvidence: result.loadDistributionEvidence ?? null,
    canonicalShellModelHash: result.canonicalShellModelHash ?? null,
    shellResultHash: result.shellResultHash ?? null,
    assessmentRegionResults: result.assessmentRegionResults ?? null,
    formulaTrace: result.formulaTrace,
    diagnostics: result.diagnostics,
  };
}
function qualificationEvidence(result) { return { qualification: result.qualification, diagnostics: result.diagnostics, limitations: result.limitations }; }