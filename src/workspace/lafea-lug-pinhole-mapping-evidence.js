/**
 * B7A application-mapping evidence for C2D-LUG-PINHOLE -> LAFEA.3.
 *
 * This producer inspects explicit stage-source and T6 mesh entities only. It
 * does not execute a numerical kernel, recover stress, infer convergence,
 * project display values, assess code or qualify release.
 */
import {
  createContinuumApplicationMappingEvidence,
  createLafeaLugPinholeMappingPackage,
} from '../core/lafea-application-templates/continuum-application-mapping-evidence.js';
import {
  createTemplateCallerMeshBinding,
  validateTemplateCallerMeshBinding,
} from '../core/lafea-application-templates/caller-mesh-binding.js';
import {
  LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
  createLafeaAnalysisMeshEvidence,
} from './lafea-analysis-mesh-evidence.js';
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';

export const LAFEA_LUG_PINHOLE_MAPPING_PRODUCER_REVISION = 'B7A.1';
export const LAFEA_LUG_PINHOLE_MAPPING_DECLARATION_SCHEMA =
  'lafea-lug-pinhole-mapping-declaration/v1';

const OPTION_KEYS = Object.freeze([
  'pendingBinding', 'meshEvidence', 'stageSource',
  'applicationEvidence', 'declaration',
]);
const DECLARATION_KEYS = Object.freeze([
  'schema', 'templateId', 'stageId',
  'materialRegion', 'loadEdge', 'boundaryEdge',
]);
const MATERIAL_KEYS = Object.freeze(['materialId', 'elementIds']);
const LOAD_KEYS = Object.freeze([
  'featureId', 'loadCaseId', 'edgeNodeIds', 'loadIds',
  'expectedResultant', 'tolerance',
]);
const BOUNDARY_KEYS = Object.freeze([
  'featureId', 'edgeNodeIds', 'constraintIds',
]);
const TOLERANCE_KEYS = Object.freeze(['absolute', 'relative']);
const APPLICATION_KEYS = Object.freeze([
  'geometryClass', 'declarationBasis', 'featureIds', 'sourceReference',
]);

export function createLafeaLugPinholeMappingEvidence(options) {
  exactKeys(options, OPTION_KEYS, 'Lug-pinhole mapping options');
  const pendingBinding = requirePendingBinding(options.pendingBinding);
  const meshEvidence = reconstructMeshEvidence(options.meshEvidence);
  requireMeshParents(pendingBinding, meshEvidence);
  const stageSource = requireStageSource(options.stageSource, meshEvidence);
  const applicationEvidence = requireApplicationEvidence(options.applicationEvidence);
  const declaration = requireDeclaration(options.declaration, applicationEvidence);

  const parents = {
    templateId: 'C2D-LUG-PINHOLE',
    stageId: 'LAFEA.3',
    sourceHash: pendingBinding.sourceHash,
    canonicalModelHash: pendingBinding.canonicalModelHash,
    analysisGeometryHash: pendingBinding.analysisGeometryHash,
    meshProfileHash: pendingBinding.meshProfileHash,
    meshHash: pendingBinding.meshHash,
    stageSourceHash: canonicalLafeaSha256({
      schema: 'lafea-b7a-stage-source-hash-input/v1',
      stageSource,
    }),
    applicationEvidenceHash: canonicalLafeaSha256({
      schema: 'lafea-b7a-application-evidence-hash-input/v1',
      applicationEvidence,
    }),
    declarationHash: canonicalLafeaSha256({
      schema: 'lafea-b7a-mapping-declaration-hash-input/v1',
      declaration,
    }),
  };

  const materialResult = evaluateMaterialRegion(stageSource, declaration.materialRegion);
  const loadResult = evaluateLoadEdge(
    stageSource, meshEvidence.mesh, applicationEvidence, declaration.loadEdge,
  );
  const boundaryResult = evaluateBoundaryEdge(
    stageSource, meshEvidence.mesh, applicationEvidence, declaration.boundaryEdge,
  );

  const materialRegionEvidence = mappingEvidence(
    parents, 'MATERIAL_REGION', materialResult,
  );
  const loadEdgeEvidence = mappingEvidence(parents, 'LOAD_EDGE', loadResult);
  const boundaryEdgeEvidence = mappingEvidence(
    parents, 'BOUNDARY_EDGE', boundaryResult,
  );
  const boundBinding = createTemplateCallerMeshBinding({
    templateId: pendingBinding.templateId,
    templateSemanticHash: pendingBinding.templateSemanticHash,
    compilationHash: pendingBinding.compilationHash,
    handoffHash: pendingBinding.handoffHash,
    compatibilityReceiptHash: pendingBinding.compatibilityReceiptHash,
    targetStageId: pendingBinding.targetStageId,
    targetCompositionRootHash: pendingBinding.targetCompositionRootHash,
    sourceAuthorityHash: pendingBinding.sourceAuthorityHash,
    sourceHash: pendingBinding.sourceHash,
    canonicalModelHash: pendingBinding.canonicalModelHash,
    analysisGeometryHash: pendingBinding.analysisGeometryHash,
    meshProfileHash: pendingBinding.meshProfileHash,
    meshHash: pendingBinding.meshHash,
    meshAuthorityHash: pendingBinding.meshAuthorityHash,
    qualityEvidenceHash: pendingBinding.qualityEvidenceHash,
    materialRegionEvidence: bindingEvidence(materialRegionEvidence),
    loadEdgeEvidence: bindingEvidence(loadEdgeEvidence),
    boundaryEdgeEvidence: bindingEvidence(boundaryEdgeEvidence),
  });

  return createLafeaLugPinholeMappingPackage({
    producerRevision: LAFEA_LUG_PINHOLE_MAPPING_PRODUCER_REVISION,
    pendingBindingHash: pendingBinding.semanticHash,
    ...parents,
    materialRegionEvidence,
    loadEdgeEvidence,
    boundaryEdgeEvidence,
    boundBinding,
  });
}

function requirePendingBinding(value) {
  const validation = validateTemplateCallerMeshBinding(value);
  if (!validation.ok) {
    throw mappingError('LAFEA_B7A_PENDING_BINDING_INVALID', validation.errors.join(' '));
  }
  if (value.templateId !== 'C2D-LUG-PINHOLE'
    || value.targetStageId !== 'LAFEA.3'
    || value.status !== 'MAPPING_EVIDENCE_PENDING') {
    throw mappingError('LAFEA_B7A_PENDING_BINDING_STATE_INVALID');
  }
  if (value.sourceAuthorityHash === null) {
    throw mappingError('LAFEA_B7A_SOURCE_AUTHORITY_HASH_REQUIRED');
  }
  const allowedReasons = new Set([
    'MATERIAL_REGION_PENDING', 'LOAD_EDGE_PENDING', 'BOUNDARY_EDGE_PENDING',
  ]);
  if (value.reasons.some((reason) => !allowedReasons.has(reason))) {
    throw mappingError('LAFEA_B7A_PENDING_BINDING_HAS_NON_MAPPING_BLOCKER');
  }
  return value;
}

function reconstructMeshEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw mappingError('LAFEA_B7A_MESH_EVIDENCE_INVALID');
  }
  const rebuilt = createLafeaAnalysisMeshEvidence({
    schema: LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
    stageId: value.stageId,
    sourceHash: value.sourceHash,
    canonicalModelHash: value.canonicalModelHash,
    analysisGeometryHash: value.analysisGeometryHash,
    meshProfile: value.meshProfile,
    mesh: value.mesh,
    authority: value.authority,
  });
  if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
    throw mappingError('LAFEA_B7A_MESH_EVIDENCE_TAMPERED');
  }
  if (rebuilt.stageId !== 'LAFEA.3' || rebuilt.status !== 'CURRENT'
    || rebuilt.qualification !== 'PASS'
    || rebuilt.mesh.elements.some((row) => row.elementType !== 'T6')) {
    throw mappingError('LAFEA_B7A_CURRENT_T6_MESH_REQUIRED');
  }
  return rebuilt;
}

function requireMeshParents(binding, evidence) {
  const pairs = [
    ['sourceHash', evidence.sourceHash],
    ['canonicalModelHash', evidence.canonicalModelHash],
    ['analysisGeometryHash', evidence.analysisGeometryHash],
    ['meshProfileHash', evidence.meshProfileHash],
    ['meshHash', evidence.meshHash],
  ];
  for (const [key, actual] of pairs) {
    if (binding[key] !== actual) {
      throw mappingError(`LAFEA_B7A_${key.replace(/[A-Z]/gu, (c) => `_${c}`).toUpperCase()}_STALE`);
    }
  }
}

function requireStageSource(value, meshEvidence) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.schema !== 'local-continuum-model/v1'
    || value.formulation !== 'PLANE_STRESS'
    || !Array.isArray(value.materials) || !value.materials.length
    || !Array.isArray(value.nodes) || !value.nodes.length
    || !Array.isArray(value.elements) || !value.elements.length
    || !Array.isArray(value.constraints)
    || !Array.isArray(value.loadCases) || !value.loadCases.length) {
    throw mappingError('LAFEA_B7A_STAGE_SOURCE_INVALID');
  }
  if (value.elements.some((row) => row.elementType !== 'T6')) {
    throw mappingError('LAFEA_B7A_STAGE_SOURCE_T6_REQUIRED');
  }
  const sourceElements = new Map(value.elements.map((row) => [row.elementId, row]));
  const meshElements = new Map(meshEvidence.mesh.elements.map((row) => [row.elementId, row]));
  if (sourceElements.size !== meshElements.size) {
    throw mappingError('LAFEA_B7A_STAGE_SOURCE_MESH_ELEMENT_SET_MISMATCH');
  }
  for (const [elementId, meshElement] of meshElements) {
    const sourceElement = sourceElements.get(elementId);
    if (!sourceElement
      || JSON.stringify(sourceElement.nodeIds) !== JSON.stringify(meshElement.nodeIds)) {
      throw mappingError('LAFEA_B7A_STAGE_SOURCE_MESH_CONNECTIVITY_MISMATCH');
    }
  }
  const sourceNodes = new Map(value.nodes.map((row) => [row.nodeId, row]));
  if (sourceNodes.size !== meshEvidence.mesh.nodes.length) {
    throw mappingError('LAFEA_B7A_STAGE_SOURCE_MESH_NODE_SET_MISMATCH');
  }
  for (const meshNode of meshEvidence.mesh.nodes) {
    const sourceNode = sourceNodes.get(meshNode.nodeId);
    if (!sourceNode || sourceNode.x !== meshNode.x || sourceNode.y !== meshNode.y
      || meshNode.z !== 0) {
      throw mappingError('LAFEA_B7A_STAGE_SOURCE_MESH_COORDINATE_MISMATCH');
    }
  }
  return structuredClone(value);
}

function requireApplicationEvidence(value) {
  exactKeys(value, APPLICATION_KEYS, 'Lug-pinhole application evidence');
  if (value.geometryClass !== 'LUG_PINHOLE'
    || value.declarationBasis !== 'CALLER_ENGINEERING_CLASSIFICATION'
    || !Array.isArray(value.featureIds)
    || !value.featureIds.includes('LOAD-EDGE')
    || !value.featureIds.includes('ROOT-REGION')) {
    throw mappingError('LAFEA_B7A_APPLICATION_EVIDENCE_INVALID');
  }
  requireText(value.sourceReference, 'applicationEvidence.sourceReference');
  return structuredClone(value);
}

function requireDeclaration(value, applicationEvidence) {
  exactKeys(value, DECLARATION_KEYS, 'Lug-pinhole mapping declaration');
  if (value.schema !== LAFEA_LUG_PINHOLE_MAPPING_DECLARATION_SCHEMA
    || value.templateId !== 'C2D-LUG-PINHOLE' || value.stageId !== 'LAFEA.3') {
    throw mappingError('LAFEA_B7A_DECLARATION_IDENTITY_INVALID');
  }
  exactKeys(value.materialRegion, MATERIAL_KEYS, 'materialRegion');
  exactKeys(value.loadEdge, LOAD_KEYS, 'loadEdge');
  exactKeys(value.boundaryEdge, BOUNDARY_KEYS, 'boundaryEdge');
  exactKeys(value.loadEdge.tolerance, TOLERANCE_KEYS, 'loadEdge.tolerance');
  textArray(value.materialRegion.elementIds, 'materialRegion.elementIds');
  exactTextArray(value.loadEdge.edgeNodeIds, 3, 'loadEdge.edgeNodeIds');
  textArray(value.loadEdge.loadIds, 'loadEdge.loadIds');
  vector2(value.loadEdge.expectedResultant, 'loadEdge.expectedResultant');
  nonNegative(value.loadEdge.tolerance.absolute, 'loadEdge.tolerance.absolute');
  nonNegative(value.loadEdge.tolerance.relative, 'loadEdge.tolerance.relative');
  exactTextArray(value.boundaryEdge.edgeNodeIds, 3, 'boundaryEdge.edgeNodeIds');
  textArray(value.boundaryEdge.constraintIds, 'boundaryEdge.constraintIds');
  requireText(value.materialRegion.materialId, 'materialRegion.materialId');
  requireText(value.loadEdge.featureId, 'loadEdge.featureId');
  requireText(value.loadEdge.loadCaseId, 'loadEdge.loadCaseId');
  requireText(value.boundaryEdge.featureId, 'boundaryEdge.featureId');
  if (!applicationEvidence.featureIds.includes(value.loadEdge.featureId)
    || !applicationEvidence.featureIds.includes(value.boundaryEdge.featureId)) {
    throw mappingError('LAFEA_B7A_DECLARED_FEATURE_NOT_IN_APPLICATION_EVIDENCE');
  }
  return structuredClone(value);
}

function evaluateMaterialRegion(source, declaration) {
  const reasons = [];
  const materials = new Set(source.materials.map((row) => row.materialId));
  if (!materials.has(declaration.materialId)) reasons.push('MATERIAL_ID_NOT_FOUND');
  const elements = new Map(source.elements.map((row) => [row.elementId, row]));
  const declared = [...declaration.elementIds].sort();
  const covered = declared.filter((elementId) => {
    const element = elements.get(elementId);
    if (!element) {
      reasons.push(`MATERIAL_ELEMENT_MISSING:${elementId}`);
      return false;
    }
    if (element.materialId !== declaration.materialId) {
      reasons.push(`MATERIAL_ASSIGNMENT_MISMATCH:${elementId}`);
      return false;
    }
    return true;
  });
  const completeCoverage = covered.length === elements.size
    && declared.length === elements.size
    && [...elements.keys()].every((elementId) => declared.includes(elementId));
  if (!completeCoverage) reasons.push('MATERIAL_REGION_INCOMPLETE');
  return {
    qualification: reasons.length ? 'BLOCK' : 'PASS',
    reasons,
    metrics: {
      materialId: declaration.materialId,
      elementIds: declared,
      coveredElementCount: covered.length,
      totalElementCount: elements.size,
      completeCoverage,
    },
  };
}

function evaluateLoadEdge(source, mesh, application, declaration) {
  const reasons = [];
  if (!application.featureIds.includes(declaration.featureId)) {
    reasons.push('LOAD_FEATURE_NOT_DECLARED');
  }
  if (!quadraticBoundaryEdgeExists(mesh, declaration.edgeNodeIds)) {
    reasons.push('LOAD_EDGE_NOT_T6_BOUNDARY_EDGE');
  }
  const loadCase = source.loadCases.find((row) => row.loadCaseId === declaration.loadCaseId);
  const sourceLoads = Array.isArray(loadCase?.nodalForces) ? loadCase.nodalForces : [];
  if (!loadCase) reasons.push('LOAD_CASE_NOT_FOUND');
  const loadMap = new Map(sourceLoads.map((row) => [row.loadId, row]));
  const selected = [];
  for (const loadId of declaration.loadIds) {
    const load = loadMap.get(loadId);
    if (!load) reasons.push(`LOAD_ID_NOT_FOUND:${loadId}`);
    else if (!declaration.edgeNodeIds.includes(load.nodeId)) {
      reasons.push(`LOAD_NODE_NOT_ON_EDGE:${loadId}`);
    } else selected.push(load);
  }
  if (selected.length !== sourceLoads.length
    || sourceLoads.some((row) => !declaration.loadIds.includes(row.loadId))) {
    reasons.push('LOAD_SELECTION_INCOMPLETE');
  }
  const observed = selected.reduce(
    (sum, row) => [sum[0] + row.fx, sum[1] + row.fy], [0, 0],
  );
  const expected = [...declaration.expectedResultant];
  const residual = [observed[0] - expected[0], observed[1] - expected[1]];
  const scale = Math.max(1, ...observed.map(Math.abs), ...expected.map(Math.abs));
  const tolerance = declaration.tolerance.absolute
    + declaration.tolerance.relative * scale;
  const closureAccepted = residual.every((value) => Math.abs(value) <= tolerance);
  if (!closureAccepted) reasons.push('LOAD_RESULTANT_CLOSURE_FAILED');
  return {
    qualification: reasons.length ? 'BLOCK' : 'PASS',
    reasons,
    metrics: {
      featureId: declaration.featureId,
      loadCaseId: declaration.loadCaseId,
      edgeNodeIds: [...declaration.edgeNodeIds],
      loadIds: [...declaration.loadIds].sort(),
      expectedResultant: expected,
      observedResultant: observed,
      residual,
      tolerance,
      closureAccepted,
    },
  };
}

function evaluateBoundaryEdge(source, mesh, application, declaration) {
  const reasons = [];
  if (!application.featureIds.includes(declaration.featureId)) {
    reasons.push('BOUNDARY_FEATURE_NOT_DECLARED');
  }
  if (!quadraticBoundaryEdgeExists(mesh, declaration.edgeNodeIds)) {
    reasons.push('BOUNDARY_EDGE_NOT_T6_BOUNDARY_EDGE');
  }
  const constraintMap = new Map(source.constraints.map((row) => [row.constraintId, row]));
  const selected = [];
  for (const constraintId of declaration.constraintIds) {
    const constraint = constraintMap.get(constraintId);
    if (!constraint) reasons.push(`CONSTRAINT_ID_NOT_FOUND:${constraintId}`);
    else if (!declaration.edgeNodeIds.includes(constraint.nodeId)) {
      reasons.push(`CONSTRAINT_NODE_NOT_ON_EDGE:${constraintId}`);
    } else if (!['UX', 'UY'].includes(constraint.dof) || constraint.value !== 0) {
      reasons.push(`CONSTRAINT_NOT_ZERO_IN_PLANE:${constraintId}`);
    } else selected.push(constraint);
  }
  const edgeConstraints = source.constraints.filter((row) =>
    declaration.edgeNodeIds.includes(row.nodeId));
  if (selected.length !== edgeConstraints.length
    || edgeConstraints.some((row) => !declaration.constraintIds.includes(row.constraintId))) {
    reasons.push('BOUNDARY_CONSTRAINT_SELECTION_INCOMPLETE');
  }
  const nodes = new Map(source.nodes.map((row) => [row.nodeId, row]));
  const rows = selected.map((constraint) => {
    const node = nodes.get(constraint.nodeId);
    return constraint.dof === 'UX'
      ? [1, 0, -node.y]
      : [0, 1, node.x];
  });
  const rigidBodyRank = matrixRank(rows, 1e-12);
  const restraintSufficient = rigidBodyRank === 3;
  if (!restraintSufficient) reasons.push('BOUNDARY_RIGID_BODY_RANK_DEFICIENT');
  return {
    qualification: reasons.length ? 'BLOCK' : 'PASS',
    reasons,
    metrics: {
      featureId: declaration.featureId,
      edgeNodeIds: [...declaration.edgeNodeIds],
      constraintIds: [...declaration.constraintIds].sort(),
      rigidBodyRank,
      requiredRank: 3,
      restraintSufficient,
    },
  };
}

function mappingEvidence(parents, kind, result) {
  return createContinuumApplicationMappingEvidence({
    ...parents,
    kind,
    qualification: result.qualification,
    metrics: result.metrics,
    reasons: result.reasons,
  });
}

function bindingEvidence(evidence) {
  return {
    applicability: 'REQUIRED',
    evidenceHash: evidence.semanticHash,
    qualification: evidence.qualification,
  };
}

function quadraticBoundaryEdgeExists(mesh, nodeIds) {
  return mesh.elements.some((element) => t6Edges(element.nodeIds)
    .some((edge) => sameEdge(edge, nodeIds)));
}

function t6Edges(nodeIds) {
  if (!Array.isArray(nodeIds) || nodeIds.length !== 6) return [];
  return [
    [nodeIds[0], nodeIds[3], nodeIds[1]],
    [nodeIds[1], nodeIds[4], nodeIds[2]],
    [nodeIds[2], nodeIds[5], nodeIds[0]],
  ];
}

function sameEdge(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
    || JSON.stringify(left) === JSON.stringify([...right].reverse());
}

function matrixRank(rows, tolerance) {
  if (!rows.length) return 0;
  const matrix = rows.map((row) => [...row]);
  let rank = 0;
  for (let column = 0; column < 3 && rank < matrix.length; column += 1) {
    let pivot = rank;
    for (let row = rank + 1; row < matrix.length; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    }
    if (Math.abs(matrix[pivot][column]) <= tolerance) continue;
    [matrix[rank], matrix[pivot]] = [matrix[pivot], matrix[rank]];
    const divisor = matrix[rank][column];
    for (let c = column; c < 3; c += 1) matrix[rank][c] /= divisor;
    for (let row = 0; row < matrix.length; row += 1) {
      if (row === rank) continue;
      const factor = matrix[row][column];
      for (let c = column; c < 3; c += 1) {
        matrix[row][c] -= factor * matrix[rank][c];
      }
    }
    rank += 1;
  }
  return rank;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw mappingError('LAFEA_B7A_RECORD_INVALID', `${label} must be a plain object.`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw mappingError('LAFEA_B7A_EXACT_KEYS_INVALID', `${label} exact-key mismatch.`);
  }
}

function textArray(value, label) {
  if (!Array.isArray(value) || !value.length) {
    throw mappingError('LAFEA_B7A_TEXT_ARRAY_INVALID', `${label} must be non-empty.`);
  }
  const rows = value.map((row, index) => requireText(row, `${label}[${index}]`));
  if (new Set(rows).size !== rows.length) {
    throw mappingError('LAFEA_B7A_TEXT_ARRAY_DUPLICATE', `${label} must be unique.`);
  }
  return rows;
}

function exactTextArray(value, count, label) {
  const rows = textArray(value, label);
  if (rows.length !== count) {
    throw mappingError('LAFEA_B7A_EDGE_NODE_COUNT_INVALID', `${label} must contain ${count} values.`);
  }
  return rows;
}

function vector2(value, label) {
  if (!Array.isArray(value) || value.length !== 2
    || value.some((row) => typeof row !== 'number' || !Number.isFinite(row))) {
    throw mappingError('LAFEA_B7A_VECTOR_INVALID', `${label} must be a finite 2-vector.`);
  }
  return value;
}

function nonNegative(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw mappingError('LAFEA_B7A_TOLERANCE_INVALID', `${label} must be finite and non-negative.`);
  }
  return value;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw mappingError('LAFEA_B7A_TEXT_INVALID', `${label} is required.`);
  }
  return value;
}

function mappingError(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}
