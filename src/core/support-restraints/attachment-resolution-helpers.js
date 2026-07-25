import { deepFreeze, semanticHash, stringValue } from '../shared-piping-model/index.js';
import { projectPointToTarget } from './attachment-geometry.js';
import { assessAttachmentIdentity } from './attachment-identity.js';
import { ATTACHMENT_EVIDENCE } from './constants.js';

export function createAttachmentRecord(support, target, evidenceType, tolerance, alternatives = []) {
  const projection = support.positionCanonical ? projectPointToTarget(support.positionCanonical, target) : null;
  const explicit = evidenceType !== ATTACHMENT_EVIDENCE.GEOMETRIC;
  const identity = assessAttachmentIdentity(support.identity, target.identity, explicit);
  const alternativeTargetIds = alternatives.map((item) => item.targetId).filter((id) => id !== target.targetId).sort();
  const diagnostics = explicitOffsetDiagnostics(support, evidenceType, projection);
  const base = {
    supportKey: support.supportKey,
    attachedComponentKey: target.componentKey,
    attachedPortKey: evidenceType === ATTACHMENT_EVIDENCE.EXPLICIT_PORT ? target.portKey : null,
    targetId: target.targetId,
    evidenceType,
    projectedPointCanonical: projection?.projectedPointCanonical || null,
    distanceCanonical: projection?.distanceCanonical ?? null,
    segmentParameter: projection?.segmentParameter ?? null,
    confidence: confidence(evidenceType, projection, tolerance, identity),
    identityCompatibility: identity,
    alternativeTargetIds,
    diagnostics,
  };
  const identityPayload = {
    supportKey: support.supportKey,
    targetId: target.targetId,
    evidenceType,
    attachedPortKey: base.attachedPortKey,
  };
  return deepFreeze({
    attachmentId: `attachment:${semanticHash(identityPayload).split(':')[1]}`,
    ...base,
  });
}

export function sourceRelatedComponents(support, sharedModel, targets) {
  const nodes = sharedModel.sourceReferences?.nodes || [];
  const parentByNode = new Map(nodes.map((node) => [node.sourceNodeKey, node.parentSourceNodeKey]));
  const supportParent = parentByNode.get(support.sourceReferences.sourceNodeKey) || '';
  const supportPathParent = parentPath(support.sourceReferences.sourcePath);
  return targets.filter((target) => target.targetType === 'COMPONENT_REFERENCE').filter((target) => {
    const targetParent = parentByNode.get(target.sourceEvidence.sourceNodeKey) || '';
    const targetPathParent = parentPath(target.sourceEvidence.sourcePath);
    return Boolean(
      (supportParent && targetParent && supportParent === targetParent)
      || (supportPathParent && targetPathParent && supportPathParent === targetPathParent),
    );
  });
}

export function portTargets(ports, targets) {
  const keys = new Set(ports.map((port) => port.portKey));
  return targets.filter((target) => target.targetType === 'COMPONENT_PORT_POINT' && keys.has(target.portKey));
}

export function portMatches(port, reference) {
  return [
    port.portKey,
    port.sourceEndpointIdentity,
    port.sourceReference?.sourceNodeId,
    port.sourceReference?.sourceEndpointId,
    port.sourceReference?.endpointId,
  ].map(stringValue).includes(reference);
}

export function componentMatches(target, reference) {
  return [
    target.componentKey,
    target.sourceEvidence?.sourceEntityId,
    target.sourceEvidence?.sourceNodeKey,
    target.sourceEvidence?.sourcePath,
  ].map(stringValue).includes(reference);
}

export function evidenceValues(rows) {
  return [...new Set(rows.map((row) => stringValue(row.value)).filter(Boolean))].sort();
}

export function explicitMultiAttachment(support) {
  return support.multiAttachmentEvidence.some((row) => (
    ['TRUE', 'YES', '1', 'MULTIPLE'].includes(stringValue(row.value).toUpperCase())
  ));
}

export function uniqueTargets(targets) {
  return [...new Map(targets.map((target) => [target.targetId, target])).values()]
    .sort(byKey('targetId'));
}

export function bestTargetsByComponent(candidates) {
  const grouped = new Map();
  candidates.forEach((candidate) => {
    const current = grouped.get(candidate.target.componentKey);
    if (!current || candidateOrder(candidate, current) < 0) {
      grouped.set(candidate.target.componentKey, candidate);
    }
  });
  return [...grouped.values()].sort(candidateOrder);
}

export function candidateOrder(left, right) {
  const distance = left.projection.distanceCanonical - right.projection.distanceCanonical;
  if (distance) return distance;
  const rank = targetRank(left.target.targetType) - targetRank(right.target.targetType);
  return rank || left.target.targetId.localeCompare(right.target.targetId);
}

export function nearlyEqual(left, right) {
  return Math.abs(left - right) <= 1e-9;
}

export function diagnostic(code, scope, message, details = {}) {
  return deepFreeze({ code, severity: 'WARNING', scope, message, ...details });
}

export function identityDiagnostic(support, target, identity) {
  return diagnostic(
    'ATTACHMENT_IDENTITY_CONFLICT',
    support.supportKey,
    'Inferred attachment is blocked by line/system identity conflict.',
    { targetId: target.targetId, identityCompatibility: identity },
  );
}

export function handled(status, attachments = [], alternatives = [], diagnostics = []) {
  return { handled: true, status, attachments, alternatives, diagnostics };
}

export function unhandled() {
  return { handled: false };
}

export function diagnosticOrder(left, right) {
  return `${left.code}|${left.scope}|${left.targetId || ''}`
    .localeCompare(`${right.code}|${right.scope}|${right.targetId || ''}`);
}

export function byKey(field) {
  return (left, right) => stringValue(left?.[field]).localeCompare(stringValue(right?.[field]));
}

function confidence(evidenceType, projection, tolerance, identity) {
  const bases = {
    [ATTACHMENT_EVIDENCE.EXPLICIT_PORT]: 1,
    [ATTACHMENT_EVIDENCE.EXPLICIT_COMPONENT]: 0.98,
    [ATTACHMENT_EVIDENCE.SOURCE_RELATION]: 0.9,
    [ATTACHMENT_EVIDENCE.GEOMETRIC]: 0.75,
  };
  const distancePenalty = evidenceType === ATTACHMENT_EVIDENCE.GEOMETRIC && projection && tolerance
    ? (projection.distanceCanonical / tolerance) * 0.2
    : 0;
  return Math.max(0, Math.min(1, bases[evidenceType] - distancePenalty + identity.confidenceAdjustment));
}

function explicitOffsetDiagnostics(support, evidenceType, projection) {
  if (evidenceType === ATTACHMENT_EVIDENCE.GEOMETRIC || !projection?.distanceCanonical) return [];
  return [diagnostic(
    'EXPLICIT_ATTACHMENT_COORDINATE_OFFSET',
    support.supportKey,
    'Explicit attachment retained despite coordinate offset.',
    { distanceCanonical: projection.distanceCanonical },
  )];
}

function targetRank(type) {
  return {
    COMPONENT_PORT_POINT: 0,
    EXPLICIT_COMPONENT_CENTER: 1,
    TWO_PORT_CENTERLINE: 2,
    EXPLICIT_CENTER_TO_PORT_LEG: 3,
  }[type] ?? 9;
}

function parentPath(value) {
  const path = stringValue(value).replace(/\/+$/, '');
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
}
