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

export const LAFEA_BUCKET_01_CANDIDATE_PATH_MAPPING_DECLARATION_SCHEMA =
  'lafea-bucket-01-candidate-path-mapping-declaration/v1';
export const LAFEA_BUCKET_01_CANDIDATE_PATH_MAPPING_PRODUCER_REVISION =
  'B01-CANDIDATE-PATH-MAPPING.1';

const OPTION_KEYS = Object.freeze([
  'pendingBinding', 'meshEvidence', 'stageSource',
  'applicationEvidence', 'declaration',
]);
const DECLARATION_KEYS = Object.freeze([
  'schema', 'templateId', 'stageId', 'materialRegion',
  'loadPath', 'boundaryPath',
]);
const MATERIAL_KEYS = Object.freeze(['materialId', 'elementIds']);
const LOAD_KEYS = Object.freeze([
  'featureId', 'loadCaseId', 'edgeNodePaths', 'loadIds',
  'expectedResultant', 'tolerance', 'radialStart', 'radialEnd',
  'mappingWindowHash',
]);
const BOUNDARY_KEYS = Object.freeze([
  'featureId', 'edgeNodePaths', 'constraintIds', 'radialStart',
  'radialEnd', 'mappingWindowHash',
]);
const TOLERANCE_KEYS = Object.freeze(['absolute', 'relative']);
const APPLICATION_KEYS = Object.freeze([
  'geometryClass', 'declarationBasis', 'featureIds', 'sourceReference',
]);

export function createLafeaBucket01CandidatePathMappingDeclaration(
  level,
  physicalProblem,
  featureProjection,
) {
  const loadCase = level.document.loadCases.find(
    (row) => row.loadCaseId === physicalProblem.loadCase.loadCaseId,
  );
  const boundaryNodes = new Set(level.boundaryEdges.flat());
  const authority = level.mappingAuthority;
  if (!authority
    || authority.physicalCoordinateSelection !== true
    || authority.indexScaledSelectionUsed !== false
    || authority.radialStart !== 20
    || authority.radialEnd !== 60) {
    throw mappingError('LAFEA_B01_CANDIDATE_PATH_MAPPING_AUTHORITY_INVALID');
  }
  return deepFreeze({
    schema: LAFEA_BUCKET_01_CANDIDATE_PATH_MAPPING_DECLARATION_SCHEMA,
    templateId: 'C2D-LUG-PINHOLE',
    stageId: 'LAFEA.3',
    materialRegion: {
      materialId: physicalProblem.material.materialId,
      elementIds: level.document.elements.map((row) => row.elementId),
    },
    loadPath: {
      featureId: featureProjection.loadFeature.featureId,
      loadCaseId: physicalProblem.loadCase.loadCaseId,
      edgeNodePaths: level.loadEdges.map((edge) => [...edge]),
      loadIds: loadCase.nodalForces.map((row) => row.loadId).sort(),
      expectedResultant: [...physicalProblem.loadCase.resultant],
      tolerance: featureProjection.loadTolerance,
      radialStart: authority.radialStart,
      radialEnd: authority.radialEnd,
      mappingWindowHash: authority.mappingWindowHash,
    },
    boundaryPath: {
      featureId: featureProjection.boundaryFeature.featureId,
      edgeNodePaths: level.boundaryEdges.map((edge) => [...edge]),
      constraintIds: level.document.constraints
        .filter((row) => boundaryNodes.has(row.nodeId))
        .map((row) => row.constraintId).sort(),
      radialStart: authority.radialStart,
      radialEnd: authority.radialEnd,
      mappingWindowHash: authority.mappingWindowHash,
    },
  });
}

export function createLafeaBucket01CandidatePathMappingEvidence(options) {
  exactKeys(options, OPTION_KEYS, 'candidate path mapping options');
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
      schema: 'lafea-b01-candidate-stage-source-hash-input/v1',
      stageSource,
    }),
    applicationEvidenceHash: canonicalLafeaSha256({
      schema: 'lafea-b01-candidate-application-evidence-hash-input/v1',
      applicationEvidence,
    }),
    declarationHash: canonicalLafeaSha256({
      schema: 'lafea-b01-candidate-path-mapping-declaration-hash-input/v1',
      declaration,
    }),
  };
  const materialResult = evaluateMaterialRegion(
    stageSource,
    declaration.materialRegion,
  );
  const loadResult = evaluateLoadPath(
    stageSource,
    meshEvidence.mesh,
    applicationEvidence,
    declaration.loadPath,
  );
  const boundaryResult = evaluateBoundaryPath(
    stageSource,
    meshEvidence.mesh,
    applicationEvidence,
    declaration.boundaryPath,
  );
  const materialRegionEvidence = mappingEvidence(
    parents,
    'MATERIAL_REGION',
    materialResult,
  );
  const loadEdgeEvidence = mappingEvidence(
    parents,
    'LOAD_EDGE',
    loadResult,
  );
  const boundaryEdgeEvidence = mappingEvidence(
    parents,
    'BOUNDARY_EDGE',
    boundaryResult,
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
    producerRevision: LAFEA_BUCKET_01_CANDIDATE_PATH_MAPPING_PRODUCER_REVISION,
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
    throw mappingError(
      'LAFEA_B01_CANDIDATE_PENDING_BINDING_INVALID',
      validation.errors.join(' '),
    );
  }
  if (value.templateId !== 'C2D-LUG-PINHOLE'
    || value.targetStageId !== 'LAFEA.3'
    || value.status !== 'MAPPING_EVIDENCE_PENDING'
    || value.sourceAuthorityHash === null) {
    throw mappingError('LAFEA_B01_CANDIDATE_PENDING_BINDING_STATE_INVALID');
  }
  return value;
}

function reconstructMeshEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw mappingError('LAFEA_B01_CANDIDATE_MESH_EVIDENCE_INVALID');
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
  if (JSON.stringify(rebuilt) !== JSON.stringify(value)
    || rebuilt.stageId !== 'LAFEA.3'
    || rebuilt.status !== 'CURRENT'
    || rebuilt.qualification !== 'PASS'
    || rebuilt.mesh.elements.some((row) => row.elementType !== 'T6')) {
    throw mappingError('LAFEA_B01_CANDIDATE_CURRENT_T6_MESH_REQUIRED');
  }
  return rebuilt;
}

function requireMeshParents(binding, evidence) {
  for (const [key, actual] of [
    ['sourceHash', evidence.sourceHash],
    ['canonicalModelHash', evidence.canonicalModelHash],
    ['analysisGeometryHash', evidence.analysisGeometryHash],
    ['meshProfileHash', evidence.meshProfileHash],
    ['meshHash', evidence.meshHash],
  ]) {
    if (binding[key] !== actual) {
      throw mappingError('LAFEA_B01_CANDIDATE_MAPPING_PARENT_STALE', key);
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
    throw mappingError('LAFEA_B01_CANDIDATE_STAGE_SOURCE_INVALID');
  }
  const sourceElements = new Map(value.elements.map((row) => [row.elementId, row]));
  if (sourceElements.size !== meshEvidence.mesh.elements.length) {
    throw mappingError('LAFEA_B01_CANDIDATE_STAGE_SOURCE_ELEMENT_SET_MISMATCH');
  }
  for (const meshElement of meshEvidence.mesh.elements) {
    const sourceElement = sourceElements.get(meshElement.elementId);
    if (!sourceElement || sourceElement.elementType !== 'T6'
      || JSON.stringify(sourceElement.nodeIds)
        !== JSON.stringify(meshElement.nodeIds)) {
      throw mappingError('LAFEA_B01_CANDIDATE_STAGE_SOURCE_CONNECTIVITY_MISMATCH');
    }
  }
  const sourceNodes = new Map(value.nodes.map((row) => [row.nodeId, row]));
  if (sourceNodes.size !== meshEvidence.mesh.nodes.length) {
    throw mappingError('LAFEA_B01_CANDIDATE_STAGE_SOURCE_NODE_SET_MISMATCH');
  }
  for (const meshNode of meshEvidence.mesh.nodes) {
    const sourceNode = sourceNodes.get(meshNode.nodeId);
    if (!sourceNode || sourceNode.x !== meshNode.x || sourceNode.y !== meshNode.y
      || meshNode.z !== 0) {
      throw mappingError('LAFEA_B01_CANDIDATE_STAGE_SOURCE_COORDINATE_MISMATCH');
    }
  }
  return structuredClone(value);
}

function requireApplicationEvidence(value) {
  exactKeys(value, APPLICATION_KEYS, 'candidate application evidence');
  if (value.geometryClass !== 'LUG_PINHOLE'
    || value.declarationBasis !== 'CALLER_ENGINEERING_CLASSIFICATION'
    || !Array.isArray(value.featureIds)
    || !value.featureIds.includes('LOAD-EDGE')
    || !value.featureIds.includes('ROOT-REGION')) {
    throw mappingError('LAFEA_B01_CANDIDATE_APPLICATION_EVIDENCE_INVALID');
  }
  requireText(value.sourceReference, 'applicationEvidence.sourceReference');
  return structuredClone(value);
}

function requireDeclaration(value, applicationEvidence) {
  exactKeys(value, DECLARATION_KEYS, 'candidate path declaration');
  if (value.schema !== LAFEA_BUCKET_01_CANDIDATE_PATH_MAPPING_DECLARATION_SCHEMA
    || value.templateId !== 'C2D-LUG-PINHOLE'
    || value.stageId !== 'LAFEA.3') {
    throw mappingError('LAFEA_B01_CANDIDATE_DECLARATION_IDENTITY_INVALID');
  }
  exactKeys(value.materialRegion, MATERIAL_KEYS, 'materialRegion');
  exactKeys(value.loadPath, LOAD_KEYS, 'loadPath');
  exactKeys(value.boundaryPath, BOUNDARY_KEYS, 'boundaryPath');
  exactKeys(value.loadPath.tolerance, TOLERANCE_KEYS, 'loadPath.tolerance');
  textArray(value.materialRegion.elementIds, 'materialRegion.elementIds');
  edgePath(value.loadPath.edgeNodePaths, 'loadPath.edgeNodePaths');
  edgePath(value.boundaryPath.edgeNodePaths, 'boundaryPath.edgeNodePaths');
  textArray(value.loadPath.loadIds, 'loadPath.loadIds');
  textArray(value.boundaryPath.constraintIds, 'boundaryPath.constraintIds');
  vector2(value.loadPath.expectedResultant, 'loadPath.expectedResultant');
  nonNegative(value.loadPath.tolerance.absolute, 'loadPath.tolerance.absolute');
  nonNegative(value.loadPath.tolerance.relative, 'loadPath.tolerance.relative');
  for (const pathValue of [value.loadPath, value.boundaryPath]) {
    if (pathValue.radialStart !== 20 || pathValue.radialEnd !== 60) {
      throw mappingError('LAFEA_B01_CANDIDATE_PATH_WINDOW_INVALID');
    }
    sha256(pathValue.mappingWindowHash, 'mappingWindowHash');
  }
  if (value.loadPath.mappingWindowHash
      !== value.boundaryPath.mappingWindowHash) {
    throw mappingError('LAFEA_B01_CANDIDATE_PATH_WINDOW_HASH_MISMATCH');
  }
  requireText(value.materialRegion.materialId, 'materialRegion.materialId');
  requireText(value.loadPath.featureId, 'loadPath.featureId');
  requireText(value.loadPath.loadCaseId, 'loadPath.loadCaseId');
  requireText(value.boundaryPath.featureId, 'boundaryPath.featureId');
  if (!applicationEvidence.featureIds.includes(value.loadPath.featureId)
    || !applicationEvidence.featureIds.includes(value.boundaryPath.featureId)) {
    throw mappingError('LAFEA_B01_CANDIDATE_DECLARED_FEATURE_NOT_AUTHORIZED');
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

function evaluateLoadPath(source, mesh, application, declaration) {
  const reasons = [];
  if (!application.featureIds.includes(declaration.featureId)) {
    reasons.push('LOAD_FEATURE_NOT_DECLARED');
  }
  if (!quadraticBoundaryPathExists(mesh, declaration.edgeNodePaths)) {
    reasons.push('LOAD_PATH_NOT_T6_BOUNDARY_PATH');
  }
  const pathNodeIds = uniquePathNodes(declaration.edgeNodePaths);
  const loadCase = source.loadCases.find(
    (row) => row.loadCaseId === declaration.loadCaseId,
  );
  const sourceLoads = Array.isArray(loadCase?.nodalForces)
    ? loadCase.nodalForces : [];
  if (!loadCase) reasons.push('LOAD_CASE_NOT_FOUND');
  const loadMap = new Map(sourceLoads.map((row) => [row.loadId, row]));
  const selected = [];
  for (const loadId of declaration.loadIds) {
    const load = loadMap.get(loadId);
    if (!load) reasons.push(`LOAD_ID_NOT_FOUND:${loadId}`);
    else if (!pathNodeIds.includes(load.nodeId)) {
      reasons.push(`LOAD_NODE_NOT_ON_PATH:${loadId}`);
    } else selected.push(load);
  }
  if (selected.length !== sourceLoads.length
    || sourceLoads.some((row) => !declaration.loadIds.includes(row.loadId))) {
    reasons.push('LOAD_SELECTION_INCOMPLETE');
  }
  const observed = selected.reduce(
    (sum, row) => [sum[0] + row.fx, sum[1] + row.fy],
    [0, 0],
  );
  const expected = [...declaration.expectedResultant];
  const residual = [observed[0] - expected[0], observed[1] - expected[1]];
  const scale = Math.max(1, ...observed.map(Math.abs), ...expected.map(Math.abs));
  const tolerance = declaration.tolerance.absolute
    + declaration.tolerance.relative * scale;
  const closureAccepted = residual.every((value) =>
    Math.abs(value) <= tolerance);
  if (!closureAccepted) reasons.push('LOAD_RESULTANT_CLOSURE_FAILED');
  return {
    qualification: reasons.length ? 'BLOCK' : 'PASS',
    reasons,
    metrics: {
      featureId: declaration.featureId,
      loadCaseId: declaration.loadCaseId,
      edgeNodePaths: declaration.edgeNodePaths,
      pathNodeIds,
      radialStart: declaration.radialStart,
      radialEnd: declaration.radialEnd,
      mappingWindowHash: declaration.mappingWindowHash,
      loadIds: [...declaration.loadIds].sort(),
      expectedResultant: expected,
      observedResultant: observed,
      residual,
      tolerance,
      closureAccepted,
    },
  };
}

function evaluateBoundaryPath(source, mesh, application, declaration) {
  const reasons = [];
  if (!application.featureIds.includes(declaration.featureId)) {
    reasons.push('BOUNDARY_FEATURE_NOT_DECLARED');
  }
  if (!quadraticBoundaryPathExists(mesh, declaration.edgeNodePaths)) {
    reasons.push('BOUNDARY_PATH_NOT_T6_BOUNDARY_PATH');
  }
  const pathNodeIds = uniquePathNodes(declaration.edgeNodePaths);
  const constraintMap = new Map(
    source.constraints.map((row) => [row.constraintId, row]),
  );
  const selected = [];
  for (const constraintId of declaration.constraintIds) {
    const constraint = constraintMap.get(constraintId);
    if (!constraint) reasons.push(`CONSTRAINT_ID_NOT_FOUND:${constraintId}`);
    else if (!pathNodeIds.includes(constraint.nodeId)) {
      reasons.push(`CONSTRAINT_NODE_NOT_ON_PATH:${constraintId}`);
    } else if (!['UX', 'UY'].includes(constraint.dof)
      || constraint.value !== 0) {
      reasons.push(`CONSTRAINT_NOT_ZERO_IN_PLANE:${constraintId}`);
    } else selected.push(constraint);
  }
  const pathConstraints = source.constraints.filter((row) =>
    pathNodeIds.includes(row.nodeId));
  if (selected.length !== pathConstraints.length
    || pathConstraints.some((row) =>
      !declaration.constraintIds.includes(row.constraintId))) {
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
      edgeNodePaths: declaration.edgeNodePaths,
      pathNodeIds,
      radialStart: declaration.radialStart,
      radialEnd: declaration.radialEnd,
      mappingWindowHash: declaration.mappingWindowHash,
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

function quadraticBoundaryPathExists(mesh, edges) {
  const boundaryCounts = new Map();
  for (const element of mesh.elements) {
    for (const edge of t6Edges(element.nodeIds)) {
      const key = canonicalEdgeKey(edge);
      boundaryCounts.set(key, (boundaryCounts.get(key) ?? 0) + 1);
    }
  }
  return edges.every((edge, index) => {
    if (index > 0 && edges[index - 1][2] !== edge[0]) return false;
    return boundaryCounts.get(canonicalEdgeKey(edge)) === 1;
  });
}
function uniquePathNodes(edges) {
  return [...new Set(edges.flat())];
}
function t6Edges(nodeIds) {
  if (!Array.isArray(nodeIds) || nodeIds.length !== 6) return [];
  return [
    [nodeIds[0], nodeIds[3], nodeIds[1]],
    [nodeIds[1], nodeIds[4], nodeIds[2]],
    [nodeIds[2], nodeIds[5], nodeIds[0]],
  ];
}
function canonicalEdgeKey(edge) {
  const forward = edge.join('|');
  const reverse = [...edge].reverse().join('|');
  return forward < reverse ? forward : reverse;
}
function matrixRank(rows, tolerance) {
  if (!rows.length) return 0;
  const matrix = rows.map((row) => [...row]);
  let rank = 0;
  for (let column = 0; column < 3 && rank < matrix.length; column += 1) {
    let pivot = rank;
    for (let row = rank + 1; row < matrix.length; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) {
        pivot = row;
      }
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
function edgePath(value, label) {
  if (!Array.isArray(value) || !value.length) {
    throw mappingError('LAFEA_B01_CANDIDATE_EDGE_PATH_INVALID', label);
  }
  const rows = value.map((edge, index) => {
    if (!Array.isArray(edge) || edge.length !== 3) {
      throw mappingError('LAFEA_B01_CANDIDATE_EDGE_INVALID', `${label}[${index}]`);
    }
    const result = edge.map((nodeId, nodeIndex) =>
      requireText(nodeId, `${label}[${index}][${nodeIndex}]`));
    if (new Set(result).size !== 3) {
      throw mappingError('LAFEA_B01_CANDIDATE_EDGE_NODE_DUPLICATE');
    }
    return result;
  });
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index - 1][2] !== rows[index][0]) {
      throw mappingError('LAFEA_B01_CANDIDATE_EDGE_PATH_DISCONNECTED');
    }
  }
  return rows;
}
function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value).sort())
      !== JSON.stringify([...expected].sort())) {
    throw mappingError('LAFEA_B01_CANDIDATE_EXACT_KEYS_INVALID', label);
  }
}
function textArray(value, label) {
  if (!Array.isArray(value) || !value.length) {
    throw mappingError('LAFEA_B01_CANDIDATE_TEXT_ARRAY_INVALID', label);
  }
  const rows = value.map((row, index) =>
    requireText(row, `${label}[${index}]`));
  if (new Set(rows).size !== rows.length) {
    throw mappingError('LAFEA_B01_CANDIDATE_TEXT_ARRAY_DUPLICATE', label);
  }
  return rows;
}
function vector2(value, label) {
  if (!Array.isArray(value) || value.length !== 2
    || value.some((row) => typeof row !== 'number' || !Number.isFinite(row))) {
    throw mappingError('LAFEA_B01_CANDIDATE_VECTOR_INVALID', label);
  }
  return value;
}
function nonNegative(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw mappingError('LAFEA_B01_CANDIDATE_TOLERANCE_INVALID', label);
  }
  return value;
}
function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw mappingError('LAFEA_B01_CANDIDATE_HASH_INVALID', label);
  }
  return value;
}
function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw mappingError('LAFEA_B01_CANDIDATE_TEXT_INVALID', label);
  }
  return value;
}
function mappingError(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
