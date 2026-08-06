import { deepFreeze } from '../../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_CANONICAL_ID_KINDS = deepFreeze([
  'node',
  'edge',
  'junction',
  'support',
  'boundary',
  'rigid',
  'bend',
]);

const KIND_SET = new Set(TOPOLOGY_EDIT_CANONICAL_ID_KINDS);
const CANONICAL_ID = /^(node|edge|junction|support|boundary|rigid|bend):[^\s]+$/u;

export function normalizeTopologyEditCanonicalId(
  value,
  label = 'canonicalId',
  expectedKind = null,
) {
  if (typeof value !== 'string' || !CANONICAL_ID.test(value)) {
    fail(`${label} must be an exact canonical ID with no whitespace.`, RangeError);
  }
  const kind = value.slice(0, value.indexOf(':'));
  if (expectedKind !== null) {
    const normalizedKind = normalizeKind(expectedKind, `${label} kind`);
    if (kind !== normalizedKind) {
      fail(`${label} must use the ${normalizedKind}: canonical namespace.`, RangeError);
    }
  }
  return value;
}

export function normalizeTopologyEditCanonicalIds(
  value,
  label = 'canonicalIds',
  expectedKind = null,
  options = {},
) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  if (options.allowEmpty === false && value.length === 0) {
    fail(`${label} must not be empty.`, RangeError);
  }
  const ids = value.map((row, index) => normalizeTopologyEditCanonicalId(
    row,
    `${label}[${index}]`,
    expectedKind,
  ));
  return deepFreeze([...new Set(ids)].sort(compareText));
}

export function topologyEditCanonicalIdKind(value, label = 'canonicalId') {
  const id = normalizeTopologyEditCanonicalId(value, label);
  return id.slice(0, id.indexOf(':'));
}

export function isTopologyEditCanonicalId(value, expectedKind = null) {
  try {
    normalizeTopologyEditCanonicalId(value, 'canonicalId', expectedKind);
    return true;
  } catch {
    return false;
  }
}

function normalizeKind(value, label) {
  if (typeof value !== 'string' || !KIND_SET.has(value)) {
    fail(`${label} must be one of ${TOPOLOGY_EDIT_CANONICAL_ID_KINDS.join(', ')}.`);
  }
  return value;
}

function compareText(left, right) {
  return left.localeCompare(right);
}

function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditCanonicalId: ${message}`);
}
