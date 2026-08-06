import { semanticHash as hashSemantic } from '../../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../../shared-piping-model/immutable.js';
import {
  computeInputXmlModelHealthSourceEvidenceHash,
  computeInputXmlModelHealthSourceSemanticHash,
  requireInputXmlModelHealthSource,
} from './inputxml-model-health-source-contract.js';

export const TOPOLOGY_PROXIMITY_DIAGNOSTICS_SCHEMA = 'fea-model-topology-proximity-diagnostics/v1';

export function sealTopologyProximityDiagnostics(value) {
  requireDraft(value);
  const draft = structuredClone(value);
  const semanticHash = hashSemantic(semanticProjection(draft));
  const evidenceHash = hashSemantic(evidenceProjection(draft, semanticHash));
  return deepFreeze({ ...draft, semanticHash, evidenceHash });
}

export function requireTopologyProximityDiagnostics(value, expectedSourceBundle = null) {
  if (!isPlainRecord(value) || value.schema !== TOPOLOGY_PROXIMITY_DIAGNOSTICS_SCHEMA) {
    throw new TypeError('Topology proximity diagnostics schema is invalid.');
  }
  requireDraft(value);
  const expectedSemanticHash = hashSemantic(semanticProjection(value));
  if (value.semanticHash !== expectedSemanticHash) {
    throw new TypeError('Topology proximity diagnostics semantic hash mismatch.');
  }
  const expectedEvidenceHash = hashSemantic(evidenceProjection(value, expectedSemanticHash));
  if (value.evidenceHash !== expectedEvidenceHash) {
    throw new TypeError('Topology proximity diagnostics evidence hash mismatch.');
  }
  if (expectedSourceBundle !== null) {
    const accepted = requireInputXmlModelHealthSource(expectedSourceBundle);
    if (value.sourceBundleSemanticHash !== computeInputXmlModelHealthSourceSemanticHash(accepted)
      || value.sourceBundleEvidenceHash !== computeInputXmlModelHealthSourceEvidenceHash(accepted)) {
      throw new TypeError('Topology proximity diagnostics are stale for the supplied source bundle.');
    }
  }
  return value;
}

function requireDraft(value) {
  if (!isPlainRecord(value)) throw new TypeError('Topology proximity diagnostics draft must be a record.');
  if (value.schema !== TOPOLOGY_PROXIMITY_DIAGNOSTICS_SCHEMA) {
    throw new TypeError('Topology proximity diagnostics draft schema is invalid.');
  }
  if (typeof value.profileId !== 'string'
    || typeof value.sourceBundleSemanticHash !== 'string'
    || typeof value.sourceBundleEvidenceHash !== 'string'
    || typeof value.geometrySemanticHash !== 'string') {
    throw new TypeError('Topology proximity diagnostics identities are invalid.');
  }
  if (!isPlainRecord(value.tolerances)
    || !Array.isArray(value.nodeProximities)
    || !Array.isArray(value.segmentInteractions)
    || !Array.isArray(value.findings)
    || !isPlainRecord(value.summary)) {
    throw new TypeError('Topology proximity diagnostics collections are invalid.');
  }
  if (!['PASS', 'CONDITIONAL', 'BLOCKED'].includes(value.status)) {
    throw new TypeError('Topology proximity diagnostics status is invalid.');
  }
  const findingIds = new Set();
  for (const finding of value.findings) {
    if (!isPlainRecord(finding) || typeof finding.findingId !== 'string') {
      throw new TypeError('Topology proximity diagnostic finding identity is invalid.');
    }
    if (findingIds.has(finding.findingId)) {
      throw new TypeError(`Topology proximity diagnostic finding ${finding.findingId} is duplicated.`);
    }
    findingIds.add(finding.findingId);
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
    nodeProximities: value.nodeProximities,
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
