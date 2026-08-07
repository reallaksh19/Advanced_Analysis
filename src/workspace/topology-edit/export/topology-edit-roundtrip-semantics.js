import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_ROUNDTRIP_SEMANTICS_SCHEMA =
  'TopologyEditRoundTripSemantics.v1';

const COLLECTIONS = Object.freeze([
  'nodes', 'edges', 'junctions', 'supports', 'boundaries', 'rigids', 'bends',
]);
const LINEAGE_KEYS = new Set([
  'sourcePath', 'sourceIndex', 'sourceEntityId', 'sourceNodeKey', 'jsonPointer',
  'componentKey', 'entityId', 'identityKind', 'portKeys', 'writebackHash',
  'geometryHash', 'evidenceHash', 'authorityHash', 'candidateHash', 'recordRevisionHash',
  'topologyOperation', 'lastModifiedByCommandId', 'editAncestry',
]);

export function projectTopologyEditEngineeringSemantics(topology, options = {}) {
  assertCanonical(topology);
  const reverseIdentity = inverseIdentityMap(options.identityMap ?? {});
  const coordinateToleranceMm = nonNegative(options.coordinateToleranceMm ?? 0, 'coordinateToleranceMm');
  const material = {
    schema: 'TopologyEditEngineeringSemanticProjection.v1',
    collections: Object.fromEntries(COLLECTIONS.map((collection) => [
      collection,
      normalizeCollection(topology[collection] ?? [], {
        reverseIdentity,
        coordinateToleranceMm,
        compareCatalogueEvidence: options.compareCatalogueEvidence !== false,
      }),
    ])),
  };
  return deepFreeze({ ...material, engineeringSemanticHash: semanticHash(material) });
}

export function compareTopologyEditRoundTripSemantics(input = {}) {
  const expected = projectTopologyEditEngineeringSemantics(input.expectedTopology, {
    coordinateToleranceMm: input.coordinateToleranceMm,
    compareCatalogueEvidence: input.compareCatalogueEvidence,
  });
  const actual = projectTopologyEditEngineeringSemantics(input.actualTopology, {
    identityMap: input.identityMap,
    coordinateToleranceMm: input.coordinateToleranceMm,
    compareCatalogueEvidence: input.compareCatalogueEvidence,
  });
  const mismatches = compareCollections(expected.collections, actual.collections);
  const identity = identityEvidence(input.identityMap ?? {});
  const material = {
    schema: TOPOLOGY_EDIT_ROUNDTRIP_SEMANTICS_SCHEMA,
    expectedEngineeringHash: expected.engineeringSemanticHash,
    actualEngineeringHash: actual.engineeringSemanticHash,
    coordinateToleranceMm: nonNegative(input.coordinateToleranceMm ?? 0, 'coordinateToleranceMm'),
    compareCatalogueEvidence: input.compareCatalogueEvidence !== false,
    identityMapHash: identity.identityMapHash,
    mismatchCount: mismatches.length,
    mismatches,
  };
  return deepFreeze({
    ...material,
    status: mismatches.length ? 'MISMATCH' : 'EQUIVALENT',
    comparisonHash: semanticHash(material),
    identity,
    expected,
    actual,
  });
}

export function assertTopologyEditRoundTripSemantics(value) {
  if (value?.schema !== TOPOLOGY_EDIT_ROUNDTRIP_SEMANTICS_SCHEMA) {
    throw new TypeError(`Roundtrip comparison must use ${TOPOLOGY_EDIT_ROUNDTRIP_SEMANTICS_SCHEMA}.`);
  }
  const material = { ...value };
  delete material.status;
  delete material.comparisonHash;
  delete material.identity;
  delete material.expected;
  delete material.actual;
  if (semanticHash(material) !== value.comparisonHash
    || value.status !== (value.mismatchCount ? 'MISMATCH' : 'EQUIVALENT')) {
    throw new Error('TopologyEditRoundTripSemantics: comparison authority mismatch.');
  }
  return value;
}

function normalizeCollection(rows, options) {
  return rows.map((row) => normalizeValue(row, options, [])).sort((left, right) => (
    String(left.id ?? '').localeCompare(String(right.id ?? ''))
  ));
}

function normalizeValue(value, options, path) {
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'string') {
    return remapIdentity(value, options.reverseIdentity);
  }
  if (typeof value === 'number') return normalizeNumber(value, options.coordinateToleranceMm, path);
  if (Array.isArray(value)) {
    const normalized = value.map((row, index) => normalizeValue(row, options, [...path, String(index)]));
    return shouldSortArray(path) ? [...normalized].sort(compareJson) : normalized;
  }
  if (typeof value !== 'object') return value;
  const parent = path.at(-1) ?? '';
  const entries = [];
  for (const key of Object.keys(value).sort()) {
    if (omitKey(key, parent, options)) continue;
    entries.push([key, normalizeValue(value[key], options, [...path, key])]);
  }
  return Object.fromEntries(entries);
}

function omitKey(key, parent, options) {
  if (LINEAGE_KEYS.has(key)) return true;
  if (key === 'catalogueBinding' && !options.compareCatalogueEvidence) return true;
  if (parent !== 'catalogueBinding' && /Hash$/u.test(key)) return true;
  if (/^source[A-Z_]/u.test(key) && parent !== 'catalogueBinding') return true;
  return false;
}

function normalizeNumber(value, tolerance, path) {
  if (!Number.isFinite(value)) throw new RangeError(`TopologyEditRoundTripSemantics: non-finite number at ${path.join('.')}.`);
  if (!(tolerance > 0) || !isCoordinatePath(path)) return Object.is(value, -0) ? 0 : value;
  const rounded = Math.round(value / tolerance) * tolerance;
  return Object.is(rounded, -0) ? 0 : Number(rounded.toPrecision(15));
}
function isCoordinatePath(path) {
  return path.includes('position') || path.includes('positionMm') || path.includes('coordinatesMm');
}
function shouldSortArray(path) {
  const key = path.at(-1) ?? '';
  return /Ids$/u.test(key) || key === 'nodeIds' || key === 'edgeIds';
}
function remapIdentity(value, reverseIdentity) {
  return typeof value === 'string' && reverseIdentity.has(value) ? reverseIdentity.get(value) : value;
}
function inverseIdentityMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('TopologyEditRoundTripSemantics: identityMap must be an object.');
  }
  const reverse = new Map();
  for (const [expectedId, actualIdValue] of Object.entries(value)) {
    const actualId = String(actualIdValue ?? '').trim();
    if (!expectedId || !actualId) throw new TypeError('TopologyEditRoundTripSemantics: identityMap IDs are required.');
    if (reverse.has(actualId)) throw new RangeError(`TopologyEditRoundTripSemantics: duplicate mapped actual ID ${actualId}.`);
    reverse.set(actualId, expectedId);
  }
  return reverse;
}
function identityEvidence(value) {
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  const material = { entries };
  return deepFreeze({ ...material, identityMapHash: semanticHash(material) });
}

function compareCollections(expected, actual) {
  const mismatches = [];
  for (const collection of COLLECTIONS) {
    const expectedIndex = new Map(expected[collection].map((row) => [row.id, row]));
    const actualIndex = new Map(actual[collection].map((row) => [row.id, row]));
    const ids = [...new Set([...expectedIndex.keys(), ...actualIndex.keys()])].sort();
    for (const id of ids) {
      const left = expectedIndex.get(id); const right = actualIndex.get(id);
      if (!left) mismatches.push(mismatch(collection, id, 'EXTRA', null, semanticHash(right)));
      else if (!right) mismatches.push(mismatch(collection, id, 'MISSING', semanticHash(left), null));
      else if (semanticHash(left) !== semanticHash(right)) {
        mismatches.push(mismatch(collection, id, 'CHANGED', semanticHash(left), semanticHash(right), diffPaths(left, right)));
      }
    }
  }
  return mismatches;
}
function mismatch(collection, canonicalId, kind, expectedHash, actualHash, paths = []) {
  return deepFreeze({ collection, canonicalId, kind, expectedHash, actualHash, paths });
}
function diffPaths(left, right, path = '') {
  if (semanticHash(left) === semanticHash(right)) return [];
  if (!isObject(left) || !isObject(right) || Array.isArray(left) || Array.isArray(right)) return [path || '$'];
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return keys.flatMap((key) => diffPaths(left[key], right[key], path ? `${path}.${key}` : key)).slice(0, 50);
}
function compareJson(left, right) { return JSON.stringify(left).localeCompare(JSON.stringify(right)); }
function isObject(value) { return value !== null && typeof value === 'object'; }
function assertCanonical(value) {
  if (!value?.canonicalTopologyHash || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new TypeError('TopologyEditRoundTripSemantics: canonical topology authority is required.');
  }
}
function nonNegative(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new RangeError(`TopologyEditRoundTripSemantics: ${label} must be non-negative.`);
  return number;
}
