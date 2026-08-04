import { semanticHash } from '../../src/core/shared-piping-model/canonical-json.js';
import {
  P1_PROTECTED_MANIFEST_SCHEMA,
  codeUnitCompare,
  requireIntegerNonNegative,
  requireSemanticHash,
  requireSha1,
  requireSha256,
  requireString,
} from './p1-contracts.mjs';

const MANIFEST_KEYS = [
  'schema', 'exactHeadSha', 'executionId', 'fixtureRole', 'fixturePath',
  'sourceSha256', 'sourcePackageHash', 'sourcePackageHashAfter',
  'sourceMutationStatus', 'materializationAuthority', 'datasetHash',
  'hierarchyHash', 'sharedModelHash', 'supportSiteHash', 'routePartitionHash',
  'modelZoneHash', 'resolvedGeometryHash', 'renderModelHash',
  'diagnosticManifestHash', 'canonicalObjectManifestHash',
  'pickTargetManifestHash', 'sceneBoundsHash', 'diagnosticManifest',
  'canonicalObjectManifest', 'pickTargetManifest', 'sceneBounds', 'counts',
];
const IDENTITY_KEYS = [
  'primitiveId', 'objectId', 'componentKind', 'resolutionStatus', 'layer', 'primitiveKind',
];

export function requireP1ProtectedManifest(value) {
  requireExactObjectKeys(value, MANIFEST_KEYS, 'P1 protected manifest');
  if (value.schema !== P1_PROTECTED_MANIFEST_SCHEMA) fail('P1_MANIFEST_SCHEMA_INVALID');
  requireSha1(value.exactHeadSha, 'manifest.exactHeadSha');
  requireString(value.executionId, 'manifest.executionId');
  requireString(value.fixtureRole, 'manifest.fixtureRole');
  requireString(value.fixturePath, 'manifest.fixturePath');
  requireSha256(value.sourceSha256, 'manifest.sourceSha256');
  requireHashFields(value);
  if (value.sourcePackageHashAfter !== value.sourcePackageHash) {
    fail('P1_MANIFEST_SOURCE_PACKAGE_HASH_MISMATCH');
  }
  if (value.sourceMutationStatus !== 'UNCHANGED') fail('P1_MANIFEST_SOURCE_MUTATED');
  if (value.materializationAuthority !== 'PRODUCTION_RENDER_THREE_MODEL') {
    fail('P1_MANIFEST_MATERIALIZATION_AUTHORITY_INVALID');
  }

  requireIdentityRows(value.diagnosticManifest, 'diagnosticManifest');
  requireIdentityRows(value.canonicalObjectManifest, 'canonicalObjectManifest');
  requirePickRows(value.pickTargetManifest);
  requireSceneBounds(value.sceneBounds);
  requireCounts(value.counts);
  verifyDerivedEvidence(value);
  return value;
}

function requireHashFields(value) {
  for (const field of [
    'sourcePackageHash', 'sourcePackageHashAfter', 'datasetHash', 'hierarchyHash',
    'sharedModelHash', 'supportSiteHash', 'routePartitionHash', 'modelZoneHash',
    'resolvedGeometryHash', 'renderModelHash', 'diagnosticManifestHash',
    'canonicalObjectManifestHash', 'pickTargetManifestHash', 'sceneBoundsHash',
  ]) requireSemanticHash(value[field], `manifest.${field}`);
}
function requireIdentityRows(rows, label) {
  if (!Array.isArray(rows)) fail(`P1_MANIFEST_${label.toUpperCase()}_INVALID`);
  const keys = [];
  rows.forEach((row, index) => {
    requireExactObjectKeys(row, IDENTITY_KEYS, `${label}[${index}]`);
    IDENTITY_KEYS.forEach((key) => {
      if (typeof row[key] !== 'string') fail('P1_MANIFEST_IDENTITY_ROW_INVALID');
    });
    keys.push(`${row.objectId}\u0000${row.primitiveId}`);
  });
  requireUnique(keys, 'P1_MANIFEST_IDENTITY_DUPLICATE');
  const sorted = [...keys].sort(codeUnitCompare);
  if (JSON.stringify(keys) !== JSON.stringify(sorted)) fail('P1_MANIFEST_IDENTITY_ORDER_INVALID');
}
function requirePickRows(rows) {
  if (!Array.isArray(rows)) fail('P1_MANIFEST_PICK_ROWS_INVALID');
  const keys = [];
  rows.forEach((row, index) => {
    requireExactObjectKeys(row,
      ['mapEntityId', 'rootIndex', 'rootResolvedEntityId', 'nodes'],
      `pickTargetManifest[${index}]`);
    requireString(row.mapEntityId, `pickTargetManifest[${index}].mapEntityId`);
    requireString(row.rootResolvedEntityId,
      `pickTargetManifest[${index}].rootResolvedEntityId`);
    requireIntegerNonNegative(row.rootIndex, `pickTargetManifest[${index}].rootIndex`);
    if (row.rootResolvedEntityId !== row.mapEntityId) {
      fail('P1_MANIFEST_PICK_ROOT_IDENTITY_MISMATCH');
    }
    if (!Array.isArray(row.nodes) || !row.nodes.length) fail('P1_MANIFEST_PICK_NODES_INVALID');
    row.nodes.forEach((node, nodeIndex) => {
      requireExactObjectKeys(node, ['path', 'objectType', 'entityId'],
        `pickTargetManifest[${index}].nodes[${nodeIndex}]`);
      requireString(node.path, 'pickNode.path');
      requireString(node.objectType, 'pickNode.objectType');
      requireString(node.entityId, 'pickNode.entityId');
      if (node.entityId !== row.mapEntityId) fail('P1_MANIFEST_PICK_NODE_IDENTITY_MISMATCH');
    });
    keys.push(`${row.mapEntityId}\u0000${row.rootIndex}`);
  });
  requireUnique(keys, 'P1_MANIFEST_PICK_ROOT_DUPLICATE');
}
function requireSceneBounds(bounds) {
  requireExactObjectKeys(bounds, ['min', 'max', 'center', 'size'], 'manifest.sceneBounds');
  for (const field of ['min', 'max', 'center', 'size']) requireFinitePoint(bounds[field], field);
}
function requireCounts(counts) {
  requireExactObjectKeys(counts, [
    'entityCount', 'diagnosticCount', 'renderItemCount',
    'materializedPickRootCount', 'materializedPickNodeCount',
  ], 'manifest.counts');
  Object.entries(counts).forEach(([key, count]) => {
    requireIntegerNonNegative(count, `manifest.counts.${key}`);
  });
}
function verifyDerivedEvidence(value) {
  if (semanticHash(value.diagnosticManifest) !== value.diagnosticManifestHash) {
    fail('P1_MANIFEST_DIAGNOSTIC_HASH_MISMATCH');
  }
  if (semanticHash(value.canonicalObjectManifest) !== value.canonicalObjectManifestHash) {
    fail('P1_MANIFEST_OBJECT_HASH_MISMATCH');
  }
  if (semanticHash(value.pickTargetManifest) !== value.pickTargetManifestHash) {
    fail('P1_MANIFEST_PICK_HASH_MISMATCH');
  }
  if (semanticHash(value.sceneBounds) !== value.sceneBoundsHash) {
    fail('P1_MANIFEST_BOUNDS_HASH_MISMATCH');
  }
  const nodeCount = value.pickTargetManifest.reduce((total, row) => total + row.nodes.length, 0);
  if (value.counts.diagnosticCount !== value.diagnosticManifest.length
      || value.counts.renderItemCount !== value.canonicalObjectManifest.length
      || value.counts.materializedPickRootCount !== value.pickTargetManifest.length
      || value.counts.materializedPickNodeCount !== nodeCount) {
    fail('P1_MANIFEST_COUNT_MISMATCH');
  }
}
function requireFinitePoint(point, label) {
  requireExactObjectKeys(point, ['x', 'y', 'z'], `manifest.sceneBounds.${label}`);
  for (const axis of ['x', 'y', 'z']) {
    if (!Number.isFinite(point[axis])) fail('P1_MANIFEST_BOUNDS_VALUE_INVALID');
  }
}
function requireUnique(values, code) {
  if (new Set(values).size !== values.length) fail(code);
}
function requireExactObjectKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  const actual = Object.keys(value).sort(codeUnitCompare);
  const wanted = [...expected].sort(codeUnitCompare);
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new TypeError(`${label} keys do not match the contract.`);
  }
}
function fail(code) { const error = new Error(code); error.code = code; throw error; }
