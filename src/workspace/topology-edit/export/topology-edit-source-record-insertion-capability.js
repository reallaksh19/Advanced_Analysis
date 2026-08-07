import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import { SOURCE_CAPABILITY, SOURCE_REPRESENTABILITY } from './topology-edit-source-representability.js';

export const TOPOLOGY_EDIT_SOURCE_RECORD_INSERTION_CAPABILITY_SCHEMA =
  'TopologyEditSourceRecordInsertionCapability.v1';

export const SOURCE_RECORD_INSERTION_FAMILY = Object.freeze({
  STAGED_JSON: 'STAGED_JSON',
  INPUT_XML: 'INPUT_XML',
});

export const SOURCE_RECORD_INSERTION_BLOCKER = Object.freeze({
  STAGED_JSON: 'STAGEDJSON_SOURCE_RECORD_INSERTION_UNSUPPORTED',
  INPUT_XML: 'INPUTXML_SOURCE_RECORD_INSERTION_UNSUPPORTED',
});

export function assessTopologyEditSourceRecordInsertion({
  family,
  baseCanonicalTopology: base,
  canonicalTopology: edited,
} = {}) {
  const normalizedFamily = normalizeFamily(family);
  assertCanonical(base, 'baseCanonicalTopology');
  assertCanonical(edited, 'canonicalTopology');
  const baseEdgeIds = new Set(base.edges.map((row) => row.id));
  const blockers = [];
  for (const edge of edited.edges) {
    if (baseEdgeIds.has(edge.id)) continue;
    blockers.push(blocker(normalizedFamily, edge));
  }
  blockers.sort((left, right) => left.canonicalId.localeCompare(right.canonicalId));
  const material = {
    schema: TOPOLOGY_EDIT_SOURCE_RECORD_INSERTION_CAPABILITY_SCHEMA,
    family: normalizedFamily,
    baseCanonicalTopologyHash: base.canonicalTopologyHash,
    canonicalTopologyHash: edited.canonicalTopologyHash,
    blockerCount: blockers.length,
    blockers,
  };
  return deepFreeze({
    ...material,
    status: blockers.length ? 'BLOCKED' : 'REPRESENTABLE',
    capabilityHash: semanticHash(material),
  });
}

export function assertTopologyEditSourceRecordInsertionCapability(value) {
  if (value?.schema !== TOPOLOGY_EDIT_SOURCE_RECORD_INSERTION_CAPABILITY_SCHEMA) {
    throw new TypeError(
      `Source record insertion capability must use ${TOPOLOGY_EDIT_SOURCE_RECORD_INSERTION_CAPABILITY_SCHEMA}.`,
    );
  }
  const material = { ...value };
  delete material.status;
  delete material.capabilityHash;
  if (semanticHash(material) !== value.capabilityHash
    || value.blockerCount !== value.blockers.length
    || value.status !== (value.blockerCount ? 'BLOCKED' : 'REPRESENTABLE')) {
    throw new Error('Source record insertion capability: authority mismatch.');
  }
  return value;
}

function blocker(family, edge) {
  const native = token(edge.identityKind) === 'NATIVE_COMMAND'
    && token(edge.topologyOperation) === 'INSERT_PIPE_SEGMENT';
  const material = {
    canonicalId: edge.id,
    componentKey: edge.componentKey ?? null,
    property: 'sourceRecordInsertion',
    capability: SOURCE_CAPABILITY.SOURCE_RECORD_INSERTION,
    classification: SOURCE_REPRESENTABILITY.BLOCKING,
    code: SOURCE_RECORD_INSERTION_BLOCKER[family],
    identityKind: edge.identityKind ?? null,
    topologyOperation: edge.topologyOperation ?? null,
    nativeGovernedPipe: native,
  };
  return deepFreeze({ ...material, blockerHash: semanticHash(material) });
}

function normalizeFamily(value) {
  const family = token(value);
  if (!Object.values(SOURCE_RECORD_INSERTION_FAMILY).includes(family)) {
    throw new RangeError(`Source record insertion capability: unsupported family ${family || '(missing)'}.`);
  }
  return family;
}
function token(value) { return String(value ?? '').trim().toUpperCase(); }
function assertCanonical(value, label) {
  if (!value?.canonicalTopologyHash || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new TypeError(`Source record insertion capability requires ${label}.`);
  }
}
