import { semanticHash as hashSemantic } from '../../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../../shared-piping-model/immutable.js';
import {
  computeInputXmlModelHealthSourceEvidenceHash,
  computeInputXmlModelHealthSourceSemanticHash,
  requireInputXmlModelHealthSource,
} from './inputxml-model-health-source-contract.js';

export const TOPOLOGY_GRAPH_DIAGNOSTICS_SCHEMA = 'fea-model-topology-graph-diagnostics/v1';
export const STRICT_INPUTXML_LINEAR_STATIC_PROFILE = 'STRICT_INPUTXML_LINEAR_STATIC_V1';

export function sealTopologyGraphDiagnostics(value) {
  requireDraft(value);
  const draft = structuredClone(value);
  const semanticHash = hashSemantic(semanticProjection(draft));
  const evidenceHash = hashSemantic(evidenceProjection(draft, semanticHash));
  return deepFreeze({ ...draft, semanticHash, evidenceHash });
}

export function requireTopologyGraphDiagnostics(value, expectedSourceBundle = null) {
  if (!isPlainRecord(value) || value.schema !== TOPOLOGY_GRAPH_DIAGNOSTICS_SCHEMA) {
    throw new TypeError('Topology graph diagnostics schema is invalid.');
  }
  requireDraft(value);
  const expectedSemanticHash = hashSemantic(semanticProjection(value));
  if (value.semanticHash !== expectedSemanticHash) {
    throw new TypeError('Topology graph diagnostics semantic hash mismatch.');
  }
  const expectedEvidenceHash = hashSemantic(evidenceProjection(value, expectedSemanticHash));
  if (value.evidenceHash !== expectedEvidenceHash) {
    throw new TypeError('Topology graph diagnostics evidence hash mismatch.');
  }
  if (expectedSourceBundle !== null) {
    const accepted = requireInputXmlModelHealthSource(expectedSourceBundle);
    if (value.sourceBundleSemanticHash !== computeInputXmlModelHealthSourceSemanticHash(accepted)
      || value.sourceBundleEvidenceHash !== computeInputXmlModelHealthSourceEvidenceHash(accepted)) {
      throw new TypeError('Topology graph diagnostics are stale for the supplied source bundle.');
    }
  }
  return value;
}

function requireDraft(value) {
  if (!isPlainRecord(value)) throw new TypeError('Topology graph diagnostics draft must be a record.');
  if (value.schema !== TOPOLOGY_GRAPH_DIAGNOSTICS_SCHEMA) {
    throw new TypeError('Topology graph diagnostics draft schema is invalid.');
  }
  if (typeof value.sourceBundleSemanticHash !== 'string'
    || typeof value.sourceBundleEvidenceHash !== 'string'
    || typeof value.geometrySemanticHash !== 'string') {
    throw new TypeError('Topology graph diagnostics identities are invalid.');
  }
  if (!isPlainRecord(value.tolerances)
    || !Array.isArray(value.components)
    || !isPlainRecord(value.incidentSegments)
    || !isPlainRecord(value.nodeDegrees)
    || !Array.isArray(value.coordinateClosure)
    || !Array.isArray(value.findings)
    || !isPlainRecord(value.summary)) {
    throw new TypeError('Topology graph diagnostics collections are invalid.');
  }
  if (!['PASS', 'CONDITIONAL', 'BLOCKED'].includes(value.status)) {
    throw new TypeError('Topology graph diagnostics status is invalid.');
  }
  const findingIds = new Set();
  for (const finding of value.findings) {
    if (!isPlainRecord(finding) || typeof finding.findingId !== 'string') {
      throw new TypeError('Topology graph diagnostic finding identity is invalid.');
    }
    if (findingIds.has(finding.findingId)) {
      throw new TypeError(`Topology graph diagnostic finding ${finding.findingId} is duplicated.`);
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
    components: value.components,
    incidentSegments: value.incidentSegments,
    nodeDegrees: value.nodeDegrees,
    coordinateClosure: value.coordinateClosure,
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
