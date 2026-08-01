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
import {
  qualifyScaledJacobian,
  worstStatus,
} from '../core/lafea-meshing/index.js';
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';

export const LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA = 'lafea-analysis-mesh-intake/v1';
export const LAFEA_ANALYSIS_MESH_SCHEMA = 'lafea-analysis-mesh/v1';
export const LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA = 'lafea-analysis-mesh-authority/v1';
export const LAFEA_ANALYSIS_MESH_QUALITY_SCHEMA = 'lafea-analysis-mesh-quality/v1';
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

export function qualifyLafeaAnalysisMesh(stageId, mesh, meshProfile) {
  const nodeById = new Map(mesh.nodes.map((node) => [node.nodeId, node]));
  const thresholds = meshProfile.fields;
  const elementResults = mesh.elements.map((element) => {
    const physicalNodes = element.nodeIds.map((nodeId) => nodeById.get(nodeId));
    if (stageId === 'LAFEA.3' && physicalNodes.some((node) => node.z !== 0)) {
      throw meshContractError('LAFEA_ANALYSIS_MESH_CONTINUUM_NODE_NOT_PLANAR');
    }
    const cornerCount = element.elementType === 'Q8' ? 4 : 3;
    const aspectRatio = aspectRatioMetric(
      physicalNodes.slice(0, cornerCount), thresholds,
    );
    const scaledJacobian = scaledJacobianMetric(
      stageId, element.elementType, physicalNodes, thresholds,
    );
    const metrics = Object.freeze([aspectRatio, scaledJacobian]);
    return Object.freeze({
      elementId: element.elementId,
      elementType: element.elementType,
      metrics,
      worstStatus: worstStatus(metrics),
    });
  });
  const aspectValue = Math.max(...elementResults.map((row) => row.metrics[0].value));
  const jacobianValue = Math.min(...elementResults.map((row) => row.metrics[1].value));
  const gateResults = Object.freeze([
    aggregateMetric('ASPECT_RATIO', aspectValue,
      classifyHigher(aspectValue, thresholds.aspectRatioWarn, thresholds.aspectRatioBlock),
      thresholds.aspectRatioWarn, thresholds.aspectRatioBlock),
    aggregateMetric('SCALED_JACOBIAN', jacobianValue,
      jacobianValue <= 0 ? 'BLOCK' : classifyLower(
        jacobianValue, thresholds.scaledJacobianWarn, thresholds.scaledJacobianBlock,
      ), thresholds.scaledJacobianWarn, thresholds.scaledJacobianBlock),
  ]);
  return deepFreeze({
    schema: LAFEA_ANALYSIS_MESH_QUALITY_SCHEMA,
    meshProfileIdentity: meshProfile.profileIdentity,
    meshProfileHash: meshProfile.semanticHash,
    elementResults,
    gateResults,
    worstStatus: worstStatus(gateResults),
    blockingElementIds: elementResults
      .filter((row) => row.worstStatus === 'BLOCK').map((row) => row.elementId),
    warningElementIds: elementResults
      .filter((row) => row.worstStatus === 'WARNING').map((row) => row.elementId),
    elementCount: elementResults.length,
  });
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

function aspectRatioMetric(cornerNodes, thresholds) {
  const lengths = cornerNodes.map((node, index) => distance3d(
    node, cornerNodes[(index + 1) % cornerNodes.length],
  ));
  const shortest = Math.min(...lengths);
  if (!(shortest > 0)) throw meshContractError('LAFEA_ANALYSIS_MESH_DEGENERATE_EDGE');
  const value = Math.max(...lengths) / shortest;
  return Object.freeze({
    metric: 'ASPECT_RATIO',
    value,
    status: classifyHigher(value, thresholds.aspectRatioWarn,
      thresholds.aspectRatioBlock),
  });
}

function scaledJacobianMetric(stageId, elementType, physicalNodes, thresholds) {
  if (elementType === 'T6' || elementType === 'Q8') {
    return qualifyScaledJacobian(elementType, physicalNodes, {
      warn: thresholds.scaledJacobianWarn,
      block: thresholds.scaledJacobianBlock,
    });
  }
  const value = triangleScaledJacobian(stageId, physicalNodes.slice(0, 3));
  return Object.freeze({
    metric: 'SCALED_JACOBIAN',
    value,
    status: value <= 0 ? 'BLOCK' : classifyLower(
      value, thresholds.scaledJacobianWarn, thresholds.scaledJacobianBlock,
    ),
  });
}

function triangleScaledJacobian(stageId, nodes) {
  return Math.min(...nodes.map((origin, index) => {
    const first = subtract3d(nodes[(index + 1) % 3], origin);
    const second = subtract3d(nodes[(index + 2) % 3], origin);
    const denominator = norm3d(first) * norm3d(second);
    if (!(denominator > 0)) return 0;
    if (stageId === 'LAFEA.3') {
      return ((first.x * second.y) - (first.y * second.x)) / denominator;
    }
    return norm3d(cross3d(first, second)) / denominator;
  }));
}

function aggregateMetric(metric, value, status, warningThreshold, blockingThreshold) {
  return Object.freeze({ metric, value, status, warningThreshold, blockingThreshold });
}

function classifyHigher(value, warning, blocking) {
  if (value >= blocking) return 'BLOCK';
  if (value >= warning) return 'WARNING';
  return 'OK';
}

function classifyLower(value, warning, blocking) {
  if (value <= blocking) return 'BLOCK';
  if (value <= warning) return 'WARNING';
  return 'OK';
}

function distance3d(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y, right.z - left.z);
}

function subtract3d(left, right) {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function cross3d(left, right) {
  return {
    x: (left.y * right.z) - (left.z * right.y),
    y: (left.z * right.x) - (left.x * right.z),
    z: (left.x * right.y) - (left.y * right.x),
  };
}

function norm3d(value) {
  return Math.hypot(value.x, value.y, value.z);
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
