import {
  QUALIFICATION_PROFILE,
  createCanonicalLocalContinuumModel,
} from '../core/local-continuum/index.js';
import {
  LAFEA_LUG_PINHOLE_MAPPING_DECLARATION_SCHEMA,
} from './lafea-lug-pinhole-mapping-evidence.js';
import {
  LAFEA_LUG_PINHOLE_MESH_LADDER_INTAKE_SCHEMA,
  createLafeaLugPinholeMeshLadder,
  lafeaLugPinholeAnalysisGeometryHash,
  validateLafeaLugPinholeMeshLadder,
} from './lafea-lug-pinhole-mesh-ladder.js';
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  normalizeControlledContinuumStageSource,
} from './lafea-controlled-continuum-stage-route.js';
import { lafeaDocumentDigest } from './lafea-edit-command.js';
import { issueLafeaSourceAuthority } from './lafea-source-authority.js';

export const LAFEA_LUG_PINHOLE_PHYSICAL_PROJECTION_INTAKE_SCHEMA =
  'lafea-lug-pinhole-physical-projection-intake/v1';
export const LAFEA_LUG_PINHOLE_PHYSICAL_PROJECTION_SCHEMA =
  'lafea-lug-pinhole-physical-projection/v1';
export const LAFEA_LUG_PINHOLE_PHYSICAL_PROJECTION_LEVEL_SCHEMA =
  'lafea-lug-pinhole-physical-projection-level/v1';
export const LAFEA_LUG_PINHOLE_PHYSICAL_PROJECTION_PRODUCER_REVISION =
  'NB-T6C.1';

const STAGE_ID = 'LAFEA.3';
const TEMPLATE_ID = 'C2D-LUG-PINHOLE';
const FEATURE_ROLES = Object.freeze(['HOLE_BOUNDARY', 'OUTER_BOUNDARY']);
const LOAD_WEIGHTS = Object.freeze([1 / 6, 4 / 6, 1 / 6]);
const INTAKE_KEYS = Object.freeze([
  'schema', 'stageId', 'templateId', 'geometry', 'levels',
  'physicalProblem', 'producerRef', 'originRef',
]);
const PHYSICAL_KEYS = Object.freeze([
  'modelIdentity', 'modelVersion', 'material', 'loadCase',
  'loadEdge', 'restraintEdge',
]);
const MATERIAL_KEYS = Object.freeze([
  'materialId', 'elasticModulus', 'poissonRatio', 'thickness',
  'sourceReference',
]);
const LOAD_CASE_KEYS = Object.freeze([
  'loadCaseId', 'resultant', 'sourceReference',
]);
const RESULTANT_KEYS = Object.freeze(['fx', 'fy']);
const SELECTOR_KEYS = Object.freeze([
  'featureRole', 'quarter', 'sourceReference',
]);
const LEVEL_INPUT_KEYS = Object.freeze([
  'ordinal', 'meshIdentity', 'radialDivisions',
  'circumferentialDivisions', 'meshProfile',
]);
const OUTPUT_KEYS = Object.freeze([
  'schema', 'producerRevision', 'stageId', 'templateId',
  'sourceAuthority', 'sourceAuthorityHash', 'canonicalModelHash',
  'analysisGeometryHash', 'physicalProblem', 'meshLadder',
  'applicationEvidence', 'mappingDeclaration', 'levels',
  'baseDocumentRevisionDigest', 'packageHash', 'status', 'authority',
]);
const LIMITATIONS = Object.freeze([
  'CONCENTRIC_ANNULAR_LUG_PINHOLE_ONLY',
  'SINGLE_DECLARED_QUADRATIC_LOAD_EDGE',
  'SINGLE_DECLARED_QUADRATIC_FIXED_EDGE',
  'NO_ARBITRARY_OUTER_PROFILE',
  'NO_ARBITRARY_HOLE_TOPOLOGY',
  'NO_APPLICATION_GEOMETRY_INFERENCE',
  'NO_NODAL_OR_SMOOTHED_STRESS',
  'NO_CODE_COMPLIANCE',
]);

/**
 * Project one explicit physical problem onto the three generated NB-T6B
 * meshes. The producer creates normalized LAFEA.3 stage documents and a B7A
 * declaration input. It does not execute B7D, qualify mapping evidence,
 * recover stress, establish convergence or promote code/report/release state.
 */
export function createLafeaLugPinholePhysicalProjection(intakeValue) {
  const intake = canonicalIntake(intakeValue);
  const analysisGeometryHash = lafeaLugPinholeAnalysisGeometryHash(
    intake.geometry,
  );
  const canonicalModelHash = canonicalLafeaSha256({
    schema: 'lafea-lug-pinhole-physical-model-basis/v1',
    stageId: STAGE_ID,
    templateId: TEMPLATE_ID,
    analysisGeometryHash,
    physicalProblem: intake.physicalProblem,
  });
  const provisionalSourceHash = canonicalLafeaSha256({
    schema: 'lafea-lug-pinhole-provisional-source-parent/v1',
    stageId: STAGE_ID,
    templateId: TEMPLATE_ID,
    canonicalModelHash,
    analysisGeometryHash,
    physicalProblem: intake.physicalProblem,
    levels: intake.levels.map(levelIdentity),
  });
  const provisionalLadder = createMeshLadder(
    intake,
    provisionalSourceHash,
    canonicalModelHash,
    analysisGeometryHash,
  );
  const provisionalLevels = projectLevels(
    provisionalLadder,
    intake.physicalProblem,
    intake.producerRef,
  );
  const sourceAuthority = issueLafeaSourceAuthority(
    STAGE_ID,
    provisionalLevels[0].document,
    intake.originRef,
  );
  const sourceAuthorityHash = canonicalLafeaSha256(sourceAuthority);
  const meshLadder = createMeshLadder(
    intake,
    sourceAuthority.sourceHash,
    canonicalModelHash,
    analysisGeometryHash,
  );
  const levels = projectLevels(
    meshLadder,
    intake.physicalProblem,
    intake.producerRef,
  );
  assertDocumentStability(provisionalLevels, levels);
  assertLadderQualified(meshLadder);
  assertLevelParents(levels, sourceAuthority, canonicalModelHash, analysisGeometryHash);

  const applicationEvidence = deepFreeze({
    geometryClass: 'LUG_PINHOLE',
    declarationBasis: 'CALLER_ENGINEERING_CLASSIFICATION',
    featureIds: Object.freeze(['LOAD-EDGE', 'ROOT-REGION']),
    sourceReference: `${intake.producerRef}#APPLICATION`,
  });
  const mappingDeclaration = levels[0].mappingDeclaration;
  const baseDocumentRevisionDigest = lafeaDocumentDigest(levels[0].document);
  if (baseDocumentRevisionDigest !== sourceAuthority.documentRevisionDigest) {
    throw projectionError('LAFEA_NB_T6C_SOURCE_AUTHORITY_REVISION_MISMATCH');
  }
  const packageHash = canonicalLafeaSha256({
    schema: 'lafea-lug-pinhole-physical-projection-hash-input/v1',
    producerRevision: LAFEA_LUG_PINHOLE_PHYSICAL_PROJECTION_PRODUCER_REVISION,
    stageId: STAGE_ID,
    templateId: TEMPLATE_ID,
    sourceAuthorityHash,
    canonicalModelHash,
    analysisGeometryHash,
    physicalProblem: intake.physicalProblem,
    meshLadderHash: meshLadder.ladderHash,
    levelProjectionHashes: levels.map((level) => level.projectionHash),
    applicationEvidence,
    mappingDeclaration,
  });
  return deepFreeze({
    schema: LAFEA_LUG_PINHOLE_PHYSICAL_PROJECTION_SCHEMA,
    producerRevision: LAFEA_LUG_PINHOLE_PHYSICAL_PROJECTION_PRODUCER_REVISION,
    stageId: STAGE_ID,
    templateId: TEMPLATE_ID,
    sourceAuthority,
    sourceAuthorityHash,
    canonicalModelHash,
    analysisGeometryHash,
    physicalProblem: intake.physicalProblem,
    meshLadder,
    applicationEvidence,
    mappingDeclaration,
    levels,
    baseDocumentRevisionDigest,
    packageHash,
    status: 'PHYSICAL_PROBLEM_PROJECTED',
    authority: {
      productionMeshGenerated: true,
      materialMapped: true,
      loadMapped: true,
      restraintMapped: true,
      stageDocumentsProduced: true,
      mappingEvidenceQualified: false,
      solverExecuted: false,
      recoveryProduced: false,
      convergenceProduced: false,
      codeAssessmentProduced: false,
      reportProduced: false,
      releaseQualified: false,
      shellAuthorized: false,
      lafea6Enabled: false,
    },
  });
}

export function validateLafeaLugPinholePhysicalProjection(value) {
  try {
    exactKeys(value, OUTPUT_KEYS, 'lug-pinhole physical projection');
    if (value.schema !== LAFEA_LUG_PINHOLE_PHYSICAL_PROJECTION_SCHEMA
      || value.producerRevision
        !== LAFEA_LUG_PINHOLE_PHYSICAL_PROJECTION_PRODUCER_REVISION) {
      return validation(false, ['PROJECTION_SCHEMA_INVALID']);
    }
    const rebuilt = createLafeaLugPinholePhysicalProjection({
      schema: LAFEA_LUG_PINHOLE_PHYSICAL_PROJECTION_INTAKE_SCHEMA,
      stageId: value.stageId,
      templateId: value.templateId,
      geometry: value.meshLadder.geometry,
      levels: value.meshLadder.levels.map((level) => ({
        ordinal: level.ordinal,
        meshIdentity: level.meshPackage.spec.meshIdentity,
        radialDivisions: level.meshPackage.spec.radialDivisions,
        circumferentialDivisions:
          level.meshPackage.spec.circumferentialDivisions,
        meshProfile: level.meshEvidence.meshProfile,
      })),
      physicalProblem: value.physicalProblem,
      producerRef: value.meshLadder.levels[0].meshEvidence.authority.producerRef,
      originRef: value.sourceAuthority.originRef,
    });
    const ok = JSON.stringify(rebuilt) === JSON.stringify(value);
    return validation(ok, ok ? [] : ['PROJECTION_REBUILD_MISMATCH']);
  } catch (error) {
    return validation(false, [
      typeof error?.code === 'string'
        ? error.code
        : 'PROJECTION_REBUILD_FAILED',
    ]);
  }
}

function createMeshLadder(intake, sourceHash, canonicalModelHash, analysisGeometryHash) {
  return createLafeaLugPinholeMeshLadder({
    schema: LAFEA_LUG_PINHOLE_MESH_LADDER_INTAKE_SCHEMA,
    stageId: STAGE_ID,
    templateId: TEMPLATE_ID,
    sourceHash,
    canonicalModelHash,
    analysisGeometryHash,
    geometry: intake.geometry,
    levels: intake.levels,
    producerRef: intake.producerRef,
  });
}

function projectLevels(meshLadder, physicalProblem, producerRef) {
  return meshLadder.levels.map((level) => projectLevel(
    level,
    physicalProblem,
    producerRef,
  ));
}

function projectLevel(level, physicalProblem, producerRef) {
  const mesh = level.meshEvidence.mesh;
  const loadSelection = selectFeatureEdge(
    level,
    physicalProblem.loadEdge,
  );
  const restraintSelection = selectFeatureEdge(
    level,
    physicalProblem.restraintEdge,
  );
  if (sameEdge(loadSelection.edgeNodeIds, restraintSelection.edgeNodeIds)) {
    throw projectionError('LAFEA_NB_T6C_LOAD_AND_RESTRAINT_EDGE_COLLISION');
  }
  const nodalForces = loadSelection.edgeNodeIds.map((nodeId, index) => ({
    loadId: `F-L${level.ordinal}-${index + 1}-${safeId(nodeId)}`,
    nodeId,
    fx: physicalProblem.loadCase.resultant.fx * LOAD_WEIGHTS[index],
    fy: physicalProblem.loadCase.resultant.fy * LOAD_WEIGHTS[index],
    sourceReference: `${physicalProblem.loadEdge.sourceReference}#${nodeId}`,
  }));
  const constraints = restraintSelection.edgeNodeIds.flatMap((nodeId) =>
    ['UX', 'UY'].map((dof) => ({
      constraintId: `C-L${level.ordinal}-${dof}-${safeId(nodeId)}`,
      nodeId,
      dof,
      value: 0,
      sourceReference: `${physicalProblem.restraintEdge.sourceReference}#${nodeId}#${dof}`,
    })));
  const rawDocument = stageDocument(
    level,
    physicalProblem,
    nodalForces,
    constraints,
    producerRef,
  );
  const document = normalizeControlledContinuumStageSource(rawDocument);
  createCanonicalLocalContinuumModel(document);
  const mappingDeclaration = deepFreeze({
    schema: LAFEA_LUG_PINHOLE_MAPPING_DECLARATION_SCHEMA,
    templateId: TEMPLATE_ID,
    stageId: STAGE_ID,
    materialRegion: {
      materialId: physicalProblem.material.materialId,
      elementIds: document.elements.map((element) => element.elementId),
    },
    loadEdge: {
      featureId: 'LOAD-EDGE',
      loadCaseId: physicalProblem.loadCase.loadCaseId,
      edgeNodeIds: [...loadSelection.edgeNodeIds],
      loadIds: nodalForces.map((load) => load.loadId),
      expectedResultant: [
        physicalProblem.loadCase.resultant.fx,
        physicalProblem.loadCase.resultant.fy,
      ],
      tolerance: { absolute: 1e-9, relative: 1e-12 },
    },
    boundaryEdge: {
      featureId: 'ROOT-REGION',
      edgeNodeIds: [...restraintSelection.edgeNodeIds],
      constraintIds: constraints.map((constraint) => constraint.constraintId),
    },
  });
  const documentRevisionDigest = lafeaDocumentDigest(document);
  const projectionHash = canonicalLafeaSha256({
    schema: 'lafea-lug-pinhole-physical-projection-level-hash-input/v1',
    ordinal: level.ordinal,
    meshArtifactHash: level.meshEvidence.artifactHash,
    featureSetHash: level.featureSetHash,
    documentRevisionDigest,
    mappingDeclaration,
  });
  return deepFreeze({
    schema: LAFEA_LUG_PINHOLE_PHYSICAL_PROJECTION_LEVEL_SCHEMA,
    ordinal: level.ordinal,
    document,
    meshEvidence: level.meshEvidence,
    loadSelection: {
      featureRole: loadSelection.featureRole,
      quarter: loadSelection.quarter,
      edgeOrdinal: loadSelection.edgeOrdinal,
      edgeNodeIds: loadSelection.edgeNodeIds,
      loadIds: Object.freeze(nodalForces.map((load) => load.loadId)),
      expectedResultant: Object.freeze([
        physicalProblem.loadCase.resultant.fx,
        physicalProblem.loadCase.resultant.fy,
      ]),
    },
    restraintSelection: {
      featureRole: restraintSelection.featureRole,
      quarter: restraintSelection.quarter,
      edgeOrdinal: restraintSelection.edgeOrdinal,
      edgeNodeIds: restraintSelection.edgeNodeIds,
      constraintIds: Object.freeze(
        constraints.map((constraint) => constraint.constraintId),
      ),
    },
    mappingDeclaration,
    documentRevisionDigest,
    projectionHash,
    status: 'PROJECTED',
  });
}

function stageDocument(level, physicalProblem, nodalForces, constraints, producerRef) {
  const mesh = level.meshEvidence.mesh;
  return {
    schema: 'local-continuum-model/v1',
    modelIdentity: physicalProblem.modelIdentity,
    modelVersion: physicalProblem.modelVersion,
    sourceAncestry: {
      sourceModelIdentity: physicalProblem.modelIdentity,
      sourceVersion: physicalProblem.modelVersion,
      adapterIdentity: 'NB-T6C-LUG-PINHOLE-PROJECTION',
      adapterVersion: LAFEA_LUG_PINHOLE_PHYSICAL_PROJECTION_PRODUCER_REVISION,
    },
    units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
    formulation: 'PLANE_STRESS',
    materials: [{
      materialId: physicalProblem.material.materialId,
      elasticModulus: physicalProblem.material.elasticModulus,
      poissonRatio: physicalProblem.material.poissonRatio,
      sourceReference: physicalProblem.material.sourceReference,
    }],
    nodes: mesh.nodes.map((node) => ({
      nodeId: node.nodeId,
      x: node.x,
      y: node.y,
      sourceReference: `${producerRef}#MESH-L${level.ordinal}#NODE#${node.nodeId}`,
    })),
    elements: mesh.elements.map((element) => ({
      elementId: element.elementId,
      elementType: 'T6',
      nodeIds: [...element.nodeIds],
      materialId: physicalProblem.material.materialId,
      thickness: physicalProblem.material.thickness,
      sourceReference: `${producerRef}#MESH-L${level.ordinal}#ELEMENT#${element.elementId}`,
    })),
    elementTypePolicy: {
      allowT3Fallback: false,
      sourceReference: 'NB-T6C-PRODUCTION-T6-ONLY',
    },
    constraints,
    loadCases: [{
      loadCaseId: physicalProblem.loadCase.loadCaseId,
      nodalForces,
      edgeTractions: [],
      pressureLoads: [],
      bodyForces: [],
      temperatureLoads: [],
      imposedDisplacements: [],
      sourceReference: physicalProblem.loadCase.sourceReference,
    }],
    resultRequests: {
      loadCaseIds: [physicalProblem.loadCase.loadCaseId],
    },
    qualificationProfile: structuredClone(QUALIFICATION_PROFILE),
    limitations: [...LIMITATIONS],
  };
}

function selectFeatureEdge(level, selector) {
  const featureSets = level.meshPackage.featureSets;
  const boundary = selector.featureRole === 'HOLE_BOUNDARY'
    ? featureSets.holeBoundary
    : featureSets.outerBoundary;
  if (!boundary || boundary.role !== selector.featureRole
    || boundary.edgeNodeIds.length % 4 !== 0) {
    throw projectionError('LAFEA_NB_T6C_FEATURE_SET_INVALID');
  }
  const edgeOrdinal = selector.quarter * boundary.edgeNodeIds.length / 4;
  const edgeNodeIds = boundary.edgeNodeIds[edgeOrdinal];
  if (!Array.isArray(edgeNodeIds) || edgeNodeIds.length !== 3) {
    throw projectionError('LAFEA_NB_T6C_QUADRATIC_EDGE_REQUIRED');
  }
  return deepFreeze({
    featureRole: selector.featureRole,
    quarter: selector.quarter,
    edgeOrdinal,
    edgeNodeIds: Object.freeze([...edgeNodeIds]),
  });
}

function canonicalIntake(value) {
  exactKeys(value, INTAKE_KEYS, 'lug-pinhole physical projection intake');
  if (value.schema !== LAFEA_LUG_PINHOLE_PHYSICAL_PROJECTION_INTAKE_SCHEMA) {
    throw projectionError('LAFEA_NB_T6C_INTAKE_SCHEMA_INVALID');
  }
  if (value.stageId !== STAGE_ID || value.templateId !== TEMPLATE_ID) {
    throw projectionError('LAFEA_NB_T6C_PILOT_IDENTITY_INVALID');
  }
  if (!Array.isArray(value.levels) || value.levels.length !== 3) {
    throw projectionError('LAFEA_NB_T6C_THREE_LEVELS_REQUIRED');
  }
  const levels = [...value.levels]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((level, index) => canonicalLevel(level, index + 1));
  const physicalProblem = canonicalPhysicalProblem(value.physicalProblem);
  return deepFreeze({
    schema: LAFEA_LUG_PINHOLE_PHYSICAL_PROJECTION_INTAKE_SCHEMA,
    stageId: STAGE_ID,
    templateId: TEMPLATE_ID,
    geometry: structuredClone(value.geometry),
    levels,
    physicalProblem,
    producerRef: text(value.producerRef, 'producerRef'),
    originRef: text(value.originRef, 'originRef'),
  });
}

function canonicalLevel(value, expectedOrdinal) {
  exactKeys(value, LEVEL_INPUT_KEYS, `projection level ${expectedOrdinal}`);
  if (value.ordinal !== expectedOrdinal) {
    throw projectionError('LAFEA_NB_T6C_LEVEL_ORDINAL_INVALID');
  }
  if (!Number.isInteger(value.radialDivisions) || value.radialDivisions < 1
    || !Number.isInteger(value.circumferentialDivisions)
    || value.circumferentialDivisions < 8
    || value.circumferentialDivisions % 4 !== 0) {
    throw projectionError('LAFEA_NB_T6C_LEVEL_REFINEMENT_INVALID');
  }
  return deepFreeze({
    ordinal: value.ordinal,
    meshIdentity: text(value.meshIdentity, 'level.meshIdentity'),
    radialDivisions: value.radialDivisions,
    circumferentialDivisions: value.circumferentialDivisions,
    meshProfile: structuredClone(value.meshProfile),
  });
}

function canonicalPhysicalProblem(value) {
  exactKeys(value, PHYSICAL_KEYS, 'physicalProblem');
  exactKeys(value.material, MATERIAL_KEYS, 'physicalProblem.material');
  exactKeys(value.loadCase, LOAD_CASE_KEYS, 'physicalProblem.loadCase');
  exactKeys(value.loadCase.resultant, RESULTANT_KEYS,
    'physicalProblem.loadCase.resultant');
  const material = deepFreeze({
    materialId: text(value.material.materialId, 'material.materialId'),
    elasticModulus: positive(value.material.elasticModulus,
      'material.elasticModulus'),
    poissonRatio: poisson(value.material.poissonRatio),
    thickness: positive(value.material.thickness, 'material.thickness'),
    sourceReference: text(value.material.sourceReference,
      'material.sourceReference'),
  });
  const resultant = deepFreeze({
    fx: finite(value.loadCase.resultant.fx, 'loadCase.resultant.fx'),
    fy: finite(value.loadCase.resultant.fy, 'loadCase.resultant.fy'),
  });
  if (!(Math.hypot(resultant.fx, resultant.fy) > 0)) {
    throw projectionError('LAFEA_NB_T6C_NONZERO_RESULTANT_REQUIRED');
  }
  const loadEdge = canonicalSelector(value.loadEdge, 'loadEdge');
  const restraintEdge = canonicalSelector(value.restraintEdge, 'restraintEdge');
  if (loadEdge.featureRole === restraintEdge.featureRole
    && loadEdge.quarter === restraintEdge.quarter) {
    throw projectionError('LAFEA_NB_T6C_LOAD_AND_RESTRAINT_SELECTOR_COLLISION');
  }
  return deepFreeze({
    modelIdentity: text(value.modelIdentity, 'physicalProblem.modelIdentity'),
    modelVersion: text(value.modelVersion, 'physicalProblem.modelVersion'),
    material,
    loadCase: {
      loadCaseId: text(value.loadCase.loadCaseId, 'loadCase.loadCaseId'),
      resultant,
      sourceReference: text(value.loadCase.sourceReference,
        'loadCase.sourceReference'),
    },
    loadEdge,
    restraintEdge,
  });
}

function canonicalSelector(value, label) {
  exactKeys(value, SELECTOR_KEYS, `physicalProblem.${label}`);
  if (!FEATURE_ROLES.includes(value.featureRole)) {
    throw projectionError('LAFEA_NB_T6C_FEATURE_ROLE_INVALID');
  }
  if (!Number.isInteger(value.quarter) || value.quarter < 0 || value.quarter > 3) {
    throw projectionError('LAFEA_NB_T6C_FEATURE_QUARTER_INVALID');
  }
  return deepFreeze({
    featureRole: value.featureRole,
    quarter: value.quarter,
    sourceReference: text(value.sourceReference, `${label}.sourceReference`),
  });
}

function assertDocumentStability(provisional, finalLevels) {
  if (provisional.length !== finalLevels.length
    || provisional.some((level, index) =>
      JSON.stringify(level.document) !== JSON.stringify(finalLevels[index].document))) {
    throw projectionError('LAFEA_NB_T6C_SOURCE_BOUND_REGENERATION_DRIFT');
  }
}

function assertLadderQualified(meshLadder) {
  const validationResult = validateLafeaLugPinholeMeshLadder(meshLadder);
  if (!validationResult.ok || meshLadder.status !== 'MESH_LADDER_QUALIFIED') {
    throw projectionError('LAFEA_NB_T6C_MESH_LADDER_INVALID');
  }
}

function assertLevelParents(levels, sourceAuthority, canonicalModelHash,
  analysisGeometryHash) {
  for (const level of levels) {
    const evidence = level.meshEvidence;
    if (evidence.sourceHash !== sourceAuthority.sourceHash
      || evidence.canonicalModelHash !== canonicalModelHash
      || evidence.analysisGeometryHash !== analysisGeometryHash
      || evidence.status !== 'CURRENT'
      || evidence.qualification !== 'PASS') {
      throw projectionError('LAFEA_NB_T6C_LEVEL_PARENT_MISMATCH');
    }
  }
}

function levelIdentity(level) {
  return {
    ordinal: level.ordinal,
    meshIdentity: level.meshIdentity,
    radialDivisions: level.radialDivisions,
    circumferentialDivisions: level.circumferentialDivisions,
    meshProfileHash: level.meshProfile.semanticHash,
  };
}

function sameEdge(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
    || JSON.stringify(left) === JSON.stringify([...right].reverse());
}

function safeId(value) {
  return String(value).replace(/[^A-Za-z0-9_-]/gu, '-');
}

function validation(ok, errors) {
  return Object.freeze({ ok, errors: Object.freeze([...errors]) });
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw projectionError('LAFEA_NB_T6C_RECORD_INVALID',
      `${label} must be a plain record.`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length
    || actual.some((key, index) => key !== required[index])) {
    throw projectionError('LAFEA_NB_T6C_EXACT_KEYS_INVALID',
      `${label} must contain exactly ${required.join(', ')}.`);
  }
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw projectionError('LAFEA_NB_T6C_TEXT_INVALID', `${label} is required.`);
  }
  return value;
}

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw projectionError('LAFEA_NB_T6C_NUMBER_INVALID', `${label} must be finite.`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function positive(value, label) {
  const result = finite(value, label);
  if (!(result > 0)) {
    throw projectionError('LAFEA_NB_T6C_POSITIVE_REQUIRED', `${label} must be positive.`);
  }
  return result;
}

function poisson(value) {
  const result = finite(value, 'material.poissonRatio');
  if (!(result > -1 && result < 0.5)) {
    throw projectionError('LAFEA_NB_T6C_POISSON_RATIO_INVALID');
  }
  return result;
}

function projectionError(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
