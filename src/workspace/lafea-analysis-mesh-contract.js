/**
 * Exact NB-T4A analysis-mesh, authority and quality contracts.
 *
 * This module classifies explicit mesh content only. It does not generate a
 * mesh, execute an engine or create lifecycle evidence.
 */
import {
  PROFILE_KINDS,
  canonicalProfile,
  reconstructProfileSemanticHash,
} from '../core/lafea-profile-contract/index.js';
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  LAFEA_ANALYSIS_MESH_QUALITY_SCHEMA,
  qualifyLafeaAnalysisMesh,
} from './lafea-analysis-mesh-quality.js';

export {
  LAFEA_ANALYSIS_MESH_QUALITY_SCHEMA,
  qualifyLafeaAnalysisMesh,
};

export const LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA = 'lafea-analysis-mesh-intake/v1';
export const LAFEA_ANALYSIS_MESH_SCHEMA = 'lafea-analysis-mesh/v1';
export const LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA = 'lafea-analysis-mesh-authority/v1';
export const LAFEA_ANALYSIS_MESH_EVIDENCE_SCHEMA = 'lafea-analysis-mesh-evidence/v1';
export const LAFEA_ANALYSIS_MESH_PRODUCER_REVISION = 'NB-T4A.1';
export const LAFEA_ANALYSIS_MESH_AUTHORITY_ROLE = 'STAGE_AUTHORIZED_ANALYSIS_MESH';
export const LAFEA_ANALYSIS_MESH_AUTHORITY_STATUS = 'ACCEPTED_BY_STAGE_CONTRACT';
export const LAFEA_ANALYSIS_MESH_FEA_STAGES = Object.freeze([
  'LAFEA.3', 'LAFEA.4', 'LAFEA.5',
]);

const SHELL_TRI3 = 'CST_DKT_TRI3_THIN_SHELL_V1';
const ELEMENT_NODE_COUNTS = Object.freeze({
  T3: 3,
  T6: 6,
  Q8: 8,
  [SHELL_TRI3]: 3,
});
const MESH_KEYS = Object.freeze(['schema', 'meshIdentity', 'nodes', 'elements']);
const NODE_KEYS = Object.freeze(['nodeId', 'x', 'y', 'z']);
const ELEMENT_KEYS = Object.freeze(['elementId', 'elementType', 'nodeIds']);
const AUTHORITY_KEYS = Object.freeze([
  'schema', 'stageId', 'authorityRole', 'status', 'producerRef',
  'sourceHash', 'canonicalModelHash', 'analysisGeometryHash',
  'meshProfileHash', 'meshHash',
]);

export function canonicalLafeaAnalysisMeshProfile(value) {
  const profile = canonicalProfile(PROFILE_KINDS.MESH, value);
  if (reconstructProfileSemanticHash(profile) !== profile.semanticHash) {
    throw meshContractError('LAFEA_ANALYSIS_MESH_PROFILE_HASH_INVALID');
  }
  return profile;
}

export function canonicalLafeaAnalysisMesh(value) {
  const source = requireExactRecord(value, MESH_KEYS, 'analysis mesh');
  if (source.schema !== LAFEA_ANALYSIS_MESH_SCHEMA) {
    throw meshContractError('LAFEA_ANALYSIS_MESH_SCHEMA_INVALID');
  }
  if (!Array.isArray(source.nodes) || !source.nodes.length
    || !Array.isArray(source.elements) || !source.elements.length) {
    throw meshContractError('LAFEA_ANALYSIS_MESH_EMPTY');
  }
  const nodes = source.nodes.map(canonicalNode)
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  const elements = source.elements.map(canonicalElement)
    .sort((left, right) => left.elementId.localeCompare(right.elementId));
  requireUnique(nodes.map((row) => row.nodeId), 'LAFEA_ANALYSIS_MESH_NODE_ID_DUPLICATE');
  requireUnique(elements.map((row) => row.elementId),
    'LAFEA_ANALYSIS_MESH_ELEMENT_ID_DUPLICATE');
  const nodeIds = new Set(nodes.map((row) => row.nodeId));
  for (const element of elements) {
    const expectedCount = ELEMENT_NODE_COUNTS[element.elementType];
    if (!expectedCount || element.nodeIds.length !== expectedCount) {
      throw meshContractError('LAFEA_ANALYSIS_MESH_ELEMENT_NODE_COUNT_INVALID');
    }
    requireUnique(element.nodeIds, 'LAFEA_ANALYSIS_MESH_ELEMENT_NODE_DUPLICATE');
    if (element.nodeIds.some((nodeId) => !nodeIds.has(nodeId))) {
      throw meshContractError('LAFEA_ANALYSIS_MESH_ELEMENT_NODE_MISSING');
    }
  }
  return deepFreeze({
    schema: LAFEA_ANALYSIS_MESH_SCHEMA,
    meshIdentity: requireText(source.meshIdentity, 'mesh.meshIdentity'),
    nodes,
    elements,
  });
}

export function lafeaAnalysisMeshContentHash(value) {
  return canonicalLafeaSha256({
    schema: 'lafea-analysis-mesh-content-hash-input/v1',
    mesh: canonicalLafeaAnalysisMesh(value),
  });
}

export function requireLafeaAnalysisMeshElementFamily(stageId, meshProfile, elements) {
  const allowed = stageId === 'LAFEA.3'
    ? new Set(['T3', 'T6', 'Q8'])
    : new Set([SHELL_TRI3]);
  if (elements.some((element) => !allowed.has(element.elementType))) {
    throw meshContractError('LAFEA_ANALYSIS_MESH_ELEMENT_FAMILY_NOT_AUTHORIZED');
  }
  const declared = stageId === 'LAFEA.3'
    ? meshProfile.fields.continuumElement
    : meshProfile.fields.shellElement;
  if (elements.some((element) => element.elementType !== declared)) {
    throw meshContractError('LAFEA_ANALYSIS_MESH_PROFILE_ELEMENT_MISMATCH');
  }
}

export function requireLafeaAnalysisMeshAuthority(value, expected) {
  const row = requireExactRecord(value, AUTHORITY_KEYS, 'analysis mesh authority');
  if (row.schema !== LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA) {
    throw meshContractError('LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA_INVALID');
  }
  if (row.authorityRole !== LAFEA_ANALYSIS_MESH_AUTHORITY_ROLE
    || row.status !== LAFEA_ANALYSIS_MESH_AUTHORITY_STATUS) {
    throw meshContractError('LAFEA_ANALYSIS_MESH_NOT_STAGE_AUTHORIZED');
  }
  const canonical = {
    schema: LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
    stageId: requireText(row.stageId, 'authority.stageId'),
    authorityRole: LAFEA_ANALYSIS_MESH_AUTHORITY_ROLE,
    status: LAFEA_ANALYSIS_MESH_AUTHORITY_STATUS,
    producerRef: requireText(row.producerRef, 'authority.producerRef'),
    sourceHash: requireSha256(row.sourceHash, 'authority.sourceHash'),
    canonicalModelHash: requireSha256(row.canonicalModelHash,
      'authority.canonicalModelHash'),
    analysisGeometryHash: requireSha256(row.analysisGeometryHash,
      'authority.analysisGeometryHash'),
    meshProfileHash: requireText(row.meshProfileHash, 'authority.meshProfileHash'),
    meshHash: requireSha256(row.meshHash, 'authority.meshHash'),
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (canonical[key] !== expectedValue) {
      throw meshContractError('LAFEA_ANALYSIS_MESH_AUTHORITY_PARENT_MISMATCH');
    }
  }
  return deepFreeze(canonical);
}

export function requireExactMeshRecord(value, keys, label) {
  return requireExactRecord(value, keys, label);
}

export function requireAnalysisMeshSha256(value, label) {
  return requireSha256(value, label);
}

function canonicalNode(value, index) {
  const row = requireExactRecord(value, NODE_KEYS, `analysis mesh node[${index}]`);
  return Object.freeze({
    nodeId: requireText(row.nodeId, `mesh.nodes[${index}].nodeId`),
    x: requireFinite(row.x, `mesh.nodes[${index}].x`),
    y: requireFinite(row.y, `mesh.nodes[${index}].y`),
    z: requireFinite(row.z, `mesh.nodes[${index}].z`),
  });
}

function canonicalElement(value, index) {
  const row = requireExactRecord(value, ELEMENT_KEYS, `analysis mesh element[${index}]`);
  if (!Array.isArray(row.nodeIds)) {
    throw meshContractError('LAFEA_ANALYSIS_MESH_ELEMENT_NODE_IDS_INVALID');
  }
  return Object.freeze({
    elementId: requireText(row.elementId, `mesh.elements[${index}].elementId`),
    elementType: requireText(row.elementType, `mesh.elements[${index}].elementType`),
    nodeIds: Object.freeze(row.nodeIds.map((nodeId, nodeIndex) =>
      requireText(nodeId, `mesh.elements[${index}].nodeIds[${nodeIndex}]`))),
  });
}

function requireExactRecord(value, expectedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw meshContractError('LAFEA_ANALYSIS_MESH_RECORD_INVALID',
      `${label} must be a plain record.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) {
    throw meshContractError('LAFEA_ANALYSIS_MESH_EXACT_KEYS_INVALID',
      `${label} must contain exactly ${expected.join(', ')}.`);
  }
  return value;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw meshContractError('LAFEA_ANALYSIS_MESH_TEXT_INVALID', `${label} is required.`);
  }
  return value;
}

function requireSha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw meshContractError('LAFEA_ANALYSIS_MESH_HASH_INVALID',
      `${label} must be canonical SHA-256.`);
  }
  return value;
}

function requireFinite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw meshContractError('LAFEA_ANALYSIS_MESH_NUMBER_INVALID', `${label} must be finite.`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function requireUnique(values, code) {
  if (new Set(values).size !== values.length) throw meshContractError(code);
}

function meshContractError(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
