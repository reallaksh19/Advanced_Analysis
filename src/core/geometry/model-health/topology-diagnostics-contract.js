import { semanticHash as hashSemantic } from '../../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../../shared-piping-model/immutable.js';

export const MODEL_TOPOLOGY_DIAGNOSTICS_SCHEMA = 'fea-model-topology-diagnostics/v1';
export const STRICT_LINEAR_STATIC_PROFILE = 'STRICT_INPUTXML_LINEAR_STATIC_V1';

export function sealModelTopologyDiagnostics(value) {
  requireDraft(value);
  const draft = structuredClone(value);
  const semanticHash = hashSemantic(semanticProjection(draft));
  const evidenceHash = hashSemantic(evidenceProjection(draft, semanticHash));
  return deepFreeze({ ...draft, semanticHash, evidenceHash });
}

export function requireModelTopologyDiagnostics(value, expectedSourceBundle = null) {
  if (!isPlainRecord(value) || value.schema !== MODEL_TOPOLOGY_DIAGNOSTICS_SCHEMA) {
    throw new TypeError('Model topology diagnostics schema is invalid.');
  }
  requireDraft(value);
  const expectedSemanticHash = hashSemantic(semanticProjection(value));
  if (value.semanticHash !== expectedSemanticHash) {
    throw new TypeError('Model topology diagnostics semantic hash mismatch.');
  }
  const expectedEvidenceHash = hashSemantic(evidenceProjection(value, expectedSemanticHash));
  if (value.evidenceHash !== expectedEvidenceHash) {
    throw new TypeError('Model topology diagnostics evidence hash mismatch.');
  }
  if (expectedSourceBundle !== null) {
    if (value.sourceBundleSemanticHash !== expectedSourceBundle.semanticHash
      || value.sourceBundleEvidenceHash !== expectedSourceBundle.evidenceHash) {
      throw new TypeError('Model topology diagnostics are stale for the supplied source bundle.');
    }
  }
  return value;
}

function requireDraft(value) {
  if (!isPlainRecord(value)) throw new TypeError('Model topology diagnostics draft must be a record.');
  if (value.schema !== MODEL_TOPOLOGY_DIAGNOSTICS_SCHEMA) throw new TypeError('Model topology diagnostics draft schema is invalid.');
  if (typeof value.sourceBundleSemanticHash !== 'string' || typeof value.sourceBundleEvidenceHash !== 'string') {
    throw new TypeError('Model topology diagnostics source identities are invalid.');
  }
  if (typeof value.geometrySemanticHash !== 'string') throw new TypeError('Model topology diagnostics geometry identity is invalid.');
  if (!isPlainRecord(value.tolerances) || !Array.isArray(value.components)
    || !Array.isArray(value.nodeProximities) || !Array.isArray(value.coordinateClosure)
    || !Array.isArray(value.segmentInteractions) || !Array.isArray(value.findings)
    || !isPlainRecord(value.summary)) {
    throw new TypeError('Model topology diagnostics collections are invalid.');
  }
  if (!['PASS', 'CONDITIONAL', 'BLOCKED'].includes(value.status)) {
    throw new TypeError('Model topology diagnostics status is invalid.');
  }
}

function semanticProjection(value) {
  return {
    schema: value.schema,
    profileId: value.profileId,
    sourceBundleSemanticHash: value.sourceBundleSemanticHash,
    geometrySemanticHash: value.geometrySemanticHash,
    geometryUnit: value.geometryUnit,
    tolerances: value.tolerances,
    components: value.components,
    nodeProximities: value.nodeProximities,
    coordinateClosure: value.coordinateClosure,
    segmentInteractions: value.segmentInteractions,
    findings: value.findings,
    summary: value.summary,
    status: value.status,
  };
}

function evidenceProjection(value, semanticHash) {
  return {
    ...semanticProjection(value),
    semanticHash,
    sourceBundleEvidenceHash: value.sourceBundleEvidenceHash,
  };
}
