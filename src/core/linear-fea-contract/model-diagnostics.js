import { canonicalizeDiagnostics } from './model-canonicalization.js';

export const DIAGNOSTIC_SEVERITIES = Object.freeze(['ERROR', 'INFO', 'WARNING']);
export const LIMITATION_SEVERITIES = Object.freeze(['INFO', 'WARNING']);

export function canonicalDiagnosticEvidence(diagnostics) {
  return canonicalizeDiagnostics(diagnostics).map((diagnostic) => ({
    severity: diagnostic.severity,
    code: diagnostic.code,
    entityType: diagnostic.entityType,
    entityId: diagnostic.entityId,
    message: diagnostic.message,
    evidence: diagnostic.evidence,
    qualificationEvidenceIds: diagnostic.qualificationEvidenceIds,
  }));
}
