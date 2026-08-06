/** Canonical validator for retained NB-T4A analysis-mesh evidence. */
import {
  LAFEA_ANALYSIS_MESH_EVIDENCE_SCHEMA,
  LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
  createLafeaAnalysisMeshEvidence,
} from './lafea-analysis-mesh-evidence.js';

export function validateLafeaAnalysisMeshEvidence(evidenceValue) {
  if (!evidenceValue || evidenceValue.schema !== LAFEA_ANALYSIS_MESH_EVIDENCE_SCHEMA) {
    throw validationError('LAFEA_ANALYSIS_MESH_EVIDENCE_SCHEMA_INVALID');
  }
  const rebuilt = createLafeaAnalysisMeshEvidence({
    schema: LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
    stageId: evidenceValue.stageId,
    sourceHash: evidenceValue.sourceHash,
    canonicalModelHash: evidenceValue.canonicalModelHash,
    analysisGeometryHash: evidenceValue.analysisGeometryHash,
    meshProfile: evidenceValue.meshProfile,
    mesh: evidenceValue.mesh,
    authority: evidenceValue.authority,
  });
  if (JSON.stringify(rebuilt) !== JSON.stringify(evidenceValue)) {
    throw validationError('LAFEA_ANALYSIS_MESH_EVIDENCE_TAMPERED');
  }
  return rebuilt;
}

function validationError(code) {
  const error = new TypeError(code);
  error.code = code;
  return error;
}
