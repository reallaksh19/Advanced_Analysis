import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import { assertPipeSegmentCatalogueBinding } from '../topology-edit-pipe-segment-contract.js';

export const CONNECT_ENDPOINTS_INTENT_SCHEMA = 'TopologyEditConnectEndpointsIntent.v1';

function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditConnectEndpointsIntent: ${message}`);
}
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}
function normalizedPolicy(value = {}) {
  if (typeof value.allowDirect !== 'boolean' || typeof value.allowOrthogonal !== 'boolean') {
    fail('routePolicy must explicitly declare allowDirect and allowOrthogonal.');
  }
  const maxAlternatives = Number(value.maxAlternatives);
  if (!Number.isInteger(maxAlternatives) || maxAlternatives < 1 || maxAlternatives > 8) {
    fail('routePolicy.maxAlternatives must be an integer from 1 through 8.', RangeError);
  }
  if (!value.allowDirect && !value.allowOrthogonal) {
    fail('routePolicy must authorize at least one routing family.', RangeError);
  }
  const material = {
    allowDirect: value.allowDirect,
    allowOrthogonal: value.allowOrthogonal,
    maxAlternatives,
  };
  return deepFreeze({ ...material, policyHash: semanticHash(material) });
}
function normalizedSegmentPolicy(value = {}) {
  const minimumLengthMm = Number(value.minimumLengthMm);
  const overlapToleranceMm = Number(value.overlapToleranceMm);
  if (!Number.isFinite(minimumLengthMm) || minimumLengthMm <= 0) {
    fail('segmentPolicy.minimumLengthMm must be positive.', RangeError);
  }
  if (!Number.isFinite(overlapToleranceMm) || overlapToleranceMm < 0) {
    fail('segmentPolicy.overlapToleranceMm must be non-negative.', RangeError);
  }
  const material = { minimumLengthMm, overlapToleranceMm };
  return deepFreeze({ ...material, policyHash: semanticHash(material) });
}

export function createConnectEndpointsIntent(input = {}) {
  const startNodeId = requiredText(input.startNodeId, 'startNodeId');
  const endNodeId = requiredText(input.endNodeId, 'endNodeId');
  if (startNodeId === endNodeId) fail('startNodeId and endNodeId must differ.', RangeError);
  const material = {
    schema: CONNECT_ENDPOINTS_INTENT_SCHEMA,
    startNodeId,
    startNodeRevision: requiredText(input.startNodeRevision, 'startNodeRevision'),
    endNodeId,
    endNodeRevision: requiredText(input.endNodeRevision, 'endNodeRevision'),
    catalogueBinding: assertPipeSegmentCatalogueBinding(input.catalogueBinding),
    segmentPolicy: normalizedSegmentPolicy(input.segmentPolicy),
    routePolicy: normalizedPolicy(input.routePolicy),
  };
  return deepFreeze({ ...material, intentHash: semanticHash(material) });
}

export function assertConnectEndpointsIntent(value) {
  const rebuilt = createConnectEndpointsIntent(value);
  if (value?.schema !== CONNECT_ENDPOINTS_INTENT_SCHEMA || value?.intentHash !== rebuilt.intentHash) {
    fail('intent differs from immutable normalized authority.', RangeError);
  }
  return rebuilt;
}
