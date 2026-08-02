import {
  LAFEA_LUG_PINHOLE_T6_GENERATOR_REVISION,
  LAFEA_LUG_PINHOLE_T6_MESH_SPEC_SCHEMA,
  generateLafeaLugPinholeT6Mesh,
  validateLafeaLugPinholeT6MeshPackage,
} from '../core/lafea-meshing/index.js';
import {
  LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
  LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
  createLafeaAnalysisMeshEvidence,
  lafeaAnalysisMeshContentHash,
} from './lafea-analysis-mesh-evidence.js';
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';

export const LAFEA_LUG_PINHOLE_MESH_LADDER_INTAKE_SCHEMA =
  'lafea-lug-pinhole-mesh-ladder-intake/v1';
export const LAFEA_LUG_PINHOLE_MESH_LADDER_SCHEMA =
  'lafea-lug-pinhole-mesh-ladder/v1';
export const LAFEA_LUG_PINHOLE_MESH_LADDER_LEVEL_SCHEMA =
  'lafea-lug-pinhole-mesh-ladder-level/v1';
export const LAFEA_LUG_PINHOLE_MESH_LADDER_PRODUCER_REVISION = 'NB-T6B.1';

const STAGE_ID = 'LAFEA.3';
const TEMPLATE_ID = 'C2D-LUG-PINHOLE';
const INTAKE_KEYS = Object.freeze([
  'schema', 'stageId', 'templateId', 'sourceHash', 'canonicalModelHash',
  'analysisGeometryHash', 'geometry', 'levels', 'producerRef',
]);
const GEOMETRY_KEYS = Object.freeze([
  'center', 'holeRadius', 'outerRadius', 'startAngleDegrees',
]);
const CENTER_KEYS = Object.freeze(['x', 'y']);
const LEVEL_INPUT_KEYS = Object.freeze([
  'ordinal', 'meshIdentity', 'radialDivisions',
  'circumferentialDivisions', 'meshProfile',
]);
const OUTPUT_KEYS = Object.freeze([
  'schema', 'producerRevision', 'stageId', 'templateId', 'sourceHash',
  'canonicalModelHash', 'analysisGeometryHash', 'geometry', 'levels',
  'ladderHash', 'status', 'productionMeshGenerated',
  'selectedGeometryClass', 'arbitraryOuterProfileSupported',
  'arbitraryHoleTopologySupported', 'solverExecuted', 'recoveryProduced',
  'convergenceProduced', 'codeAssessmentProduced', 'releaseQualified',
]);

/**
 * Create the selected-pilot, three-level production T6 mesh ladder.
 *
 * The producer creates geometry-to-mesh evidence only. It does not create a
 * stage source, infer material/load/restraint mappings, execute LAFEA.3 or
 * register lifecycle descendants.
 */
export function createLafeaLugPinholeMeshLadder(intakeValue) {
  exactKeys(intakeValue, INTAKE_KEYS, 'lug-pinhole mesh ladder intake');
  if (intakeValue.schema !== LAFEA_LUG_PINHOLE_MESH_LADDER_INTAKE_SCHEMA) {
    throw ladderError('LAFEA_LUG_PINHOLE_MESH_LADDER_INTAKE_SCHEMA_INVALID');
  }
  if (intakeValue.stageId !== STAGE_ID
    || intakeValue.templateId !== TEMPLATE_ID) {
    throw ladderError('LAFEA_LUG_PINHOLE_MESH_LADDER_PILOT_IDENTITY_INVALID');
  }
  const sourceHash = sha256(intakeValue.sourceHash, 'sourceHash');
  const canonicalModelHash = sha256(
    intakeValue.canonicalModelHash,
    'canonicalModelHash',
  );
  const analysisGeometryHash = sha256(
    intakeValue.analysisGeometryHash,
    'analysisGeometryHash',
  );
  const geometry = canonicalGeometry(intakeValue.geometry);
  const expectedGeometryHash = lafeaLugPinholeAnalysisGeometryHash(geometry);
  if (analysisGeometryHash !== expectedGeometryHash) {
    throw ladderError('LAFEA_LUG_PINHOLE_ANALYSIS_GEOMETRY_HASH_MISMATCH');
  }
  const producerRef = text(intakeValue.producerRef, 'producerRef');
  if (!Array.isArray(intakeValue.levels) || intakeValue.levels.length !== 3) {
    throw ladderError('LAFEA_LUG_PINHOLE_MESH_LADDER_THREE_LEVELS_REQUIRED');
  }
  const levels = [...intakeValue.levels]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((level, index) => createLevel({
      level,
      expectedOrdinal: index + 1,
      sourceHash,
      canonicalModelHash,
      analysisGeometryHash,
      geometry,
      producerRef,
    }));
  assertIncreasingLadder(levels);
  const ladderHash = canonicalLafeaSha256({
    schema: 'lafea-lug-pinhole-mesh-ladder-hash-input/v1',
    stageId: STAGE_ID,
    templateId: TEMPLATE_ID,
    sourceHash,
    canonicalModelHash,
    analysisGeometryHash,
    geometry,
    levelHashes: levels.map((level) => level.levelHash),
  });
  return deepFreeze({
    schema: LAFEA_LUG_PINHOLE_MESH_LADDER_SCHEMA,
    producerRevision: LAFEA_LUG_PINHOLE_MESH_LADDER_PRODUCER_REVISION,
    stageId: STAGE_ID,
    templateId: TEMPLATE_ID,
    sourceHash,
    canonicalModelHash,
    analysisGeometryHash,
    geometry,
    levels,
    ladderHash,
    status: 'MESH_LADDER_QUALIFIED',
    productionMeshGenerated: true,
    selectedGeometryClass: 'CONCENTRIC_ANNULAR_LUG_PINHOLE',
    arbitraryOuterProfileSupported: false,
    arbitraryHoleTopologySupported: false,
    solverExecuted: false,
    recoveryProduced: false,
    convergenceProduced: false,
    codeAssessmentProduced: false,
    releaseQualified: false,
  });
}

export function validateLafeaLugPinholeMeshLadder(value) {
  try {
    exactKeys(value, OUTPUT_KEYS, 'lug-pinhole mesh ladder');
    if (value.schema !== LAFEA_LUG_PINHOLE_MESH_LADDER_SCHEMA
      || value.producerRevision
        !== LAFEA_LUG_PINHOLE_MESH_LADDER_PRODUCER_REVISION) {
      return Object.freeze({
        ok: false,
        errors: Object.freeze(['LADDER_SCHEMA_INVALID']),
      });
    }
    const rebuilt = createLafeaLugPinholeMeshLadder({
      schema: LAFEA_LUG_PINHOLE_MESH_LADDER_INTAKE_SCHEMA,
      stageId: value.stageId,
      templateId: value.templateId,
      sourceHash: value.sourceHash,
      canonicalModelHash: value.canonicalModelHash,
      analysisGeometryHash: value.analysisGeometryHash,
      geometry: value.geometry,
      levels: value.levels.map((level) => ({
        ordinal: level.ordinal,
        meshIdentity: level.meshPackage.spec.meshIdentity,
        radialDivisions: level.meshPackage.spec.radialDivisions,
        circumferentialDivisions:
          level.meshPackage.spec.circumferentialDivisions,
        meshProfile: level.meshEvidence.meshProfile,
      })),
      producerRef: value.levels[0].meshEvidence.authority.producerRef,
    });
    const ok = JSON.stringify(rebuilt) === JSON.stringify(value);
    return Object.freeze({
      ok,
      errors: ok ? Object.freeze([]) : Object.freeze(['LADDER_REBUILD_MISMATCH']),
    });
  } catch (error) {
    return Object.freeze({
      ok: false,
      errors: Object.freeze([
        typeof error?.code === 'string' ? error.code : 'LADDER_REBUILD_FAILED',
      ]),
    });
  }
}

export function lafeaLugPinholeAnalysisGeometryHash(geometryValue) {
  const geometry = canonicalGeometry(geometryValue);
  return canonicalLafeaSha256({
    schema: 'lafea-lug-pinhole-analysis-geometry-hash-input/v1',
    stageId: STAGE_ID,
    templateId: TEMPLATE_ID,
    geometry,
  });
}

function createLevel({
  level,
  expectedOrdinal,
  sourceHash,
  canonicalModelHash,
  analysisGeometryHash,
  geometry,
  producerRef,
}) {
  exactKeys(level, LEVEL_INPUT_KEYS, `mesh ladder level ${expectedOrdinal}`);
  if (level.ordinal !== expectedOrdinal) {
    throw ladderError('LAFEA_LUG_PINHOLE_MESH_LADDER_ORDINAL_INVALID');
  }
  const meshPackage = generateLafeaLugPinholeT6Mesh({
    schema: LAFEA_LUG_PINHOLE_T6_MESH_SPEC_SCHEMA,
    meshIdentity: text(level.meshIdentity, 'level.meshIdentity'),
    center: geometry.center,
    holeRadius: geometry.holeRadius,
    outerRadius: geometry.outerRadius,
    radialDivisions: integerAtLeast(
      level.radialDivisions,
      1,
      'level.radialDivisions',
    ),
    circumferentialDivisions: integerAtLeast(
      level.circumferentialDivisions,
      8,
      'level.circumferentialDivisions',
    ),
    startAngleDegrees: geometry.startAngleDegrees,
  });
  const packageValidation = validateLafeaLugPinholeT6MeshPackage(meshPackage);
  if (!packageValidation.ok) {
    throw ladderError('LAFEA_LUG_PINHOLE_GENERATED_MESH_PACKAGE_INVALID');
  }
  const meshHash = lafeaAnalysisMeshContentHash(meshPackage.mesh);
  const meshEvidence = createLafeaAnalysisMeshEvidence({
    schema: LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
    stageId: STAGE_ID,
    sourceHash,
    canonicalModelHash,
    analysisGeometryHash,
    meshProfile: level.meshProfile,
    mesh: meshPackage.mesh,
    authority: {
      schema: LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
      stageId: STAGE_ID,
      authorityRole: 'STAGE_AUTHORIZED_ANALYSIS_MESH',
      status: 'ACCEPTED_BY_STAGE_CONTRACT',
      producerRef,
      sourceHash,
      canonicalModelHash,
      analysisGeometryHash,
      meshProfileHash: level.meshProfile.semanticHash,
      meshHash,
    },
  });
  if (meshEvidence.status !== 'CURRENT'
    || meshEvidence.qualification !== 'PASS') {
    throw ladderError('LAFEA_LUG_PINHOLE_GENERATED_MESH_QUALITY_BLOCKED');
  }
  const featureSetHash = canonicalLafeaSha256({
    schema: 'lafea-lug-pinhole-feature-set-hash-input/v1',
    meshHash,
    featureSets: meshPackage.featureSets,
  });
  const generationQualityHash = canonicalLafeaSha256({
    schema: 'lafea-lug-pinhole-generation-quality-hash-input/v1',
    meshHash,
    quality: meshPackage.quality,
  });
  const levelHash = canonicalLafeaSha256({
    schema: 'lafea-lug-pinhole-mesh-ladder-level-hash-input/v1',
    ordinal: level.ordinal,
    generatorRevision: LAFEA_LUG_PINHOLE_T6_GENERATOR_REVISION,
    meshArtifactHash: meshEvidence.artifactHash,
    featureSetHash,
    generationQualityHash,
  });
  return deepFreeze({
    schema: LAFEA_LUG_PINHOLE_MESH_LADDER_LEVEL_SCHEMA,
    ordinal: level.ordinal,
    generatorRevision: LAFEA_LUG_PINHOLE_T6_GENERATOR_REVISION,
    meshPackage,
    meshEvidence,
    featureSetHash,
    generationQualityHash,
    levelHash,
    status: 'QUALIFIED',
  });
}

function assertIncreasingLadder(levels) {
  const elementCounts = levels.map((level) =>
    level.meshEvidence.mesh.elements.length);
  const meshHashes = levels.map((level) => level.meshEvidence.meshHash);
  const errors = levels.map((level) =>
    level.meshPackage.quality.relativeAreaError);
  if (!(elementCounts[0] < elementCounts[1]
    && elementCounts[1] < elementCounts[2])) {
    throw ladderError('LAFEA_LUG_PINHOLE_MESH_LADDER_NOT_REFINED');
  }
  if (new Set(meshHashes).size !== 3) {
    throw ladderError('LAFEA_LUG_PINHOLE_MESH_LADDER_HASH_NOT_DISTINCT');
  }
  if (!(errors[1] <= errors[0] && errors[2] <= errors[1])) {
    throw ladderError('LAFEA_LUG_PINHOLE_MESH_LADDER_GEOMETRY_ERROR_NOT_IMPROVING');
  }
}

function canonicalGeometry(value) {
  exactKeys(value, GEOMETRY_KEYS, 'lug-pinhole analysis geometry');
  exactKeys(value.center, CENTER_KEYS, 'lug-pinhole analysis geometry center');
  const center = deepFreeze({
    x: finite(value.center.x, 'geometry.center.x'),
    y: finite(value.center.y, 'geometry.center.y'),
  });
  const holeRadius = positive(value.holeRadius, 'geometry.holeRadius');
  const outerRadius = positive(value.outerRadius, 'geometry.outerRadius');
  if (!(outerRadius > holeRadius)) {
    throw ladderError('LAFEA_LUG_PINHOLE_ANALYSIS_GEOMETRY_RADIUS_INVALID');
  }
  return deepFreeze({
    center,
    holeRadius,
    outerRadius,
    startAngleDegrees: finite(
      value.startAngleDegrees,
      'geometry.startAngleDegrees',
    ),
  });
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw ladderError('LAFEA_LUG_PINHOLE_MESH_LADDER_RECORD_INVALID',
      `${label} must be a plain record.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) {
    throw ladderError('LAFEA_LUG_PINHOLE_MESH_LADDER_EXACT_KEYS_INVALID',
      `${label} must contain exactly ${expected.join(', ')}.`);
  }
}

function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw ladderError('LAFEA_LUG_PINHOLE_MESH_LADDER_HASH_INVALID',
      `${label} must be canonical SHA-256.`);
  }
  return value;
}

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw ladderError('LAFEA_LUG_PINHOLE_MESH_LADDER_NUMBER_INVALID',
      `${label} must be finite.`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function positive(value, label) {
  const result = finite(value, label);
  if (!(result > 0)) {
    throw ladderError('LAFEA_LUG_PINHOLE_MESH_LADDER_POSITIVE_REQUIRED');
  }
  return result;
}

function integerAtLeast(value, minimum, label) {
  if (!Number.isInteger(value) || value < minimum) {
    throw ladderError('LAFEA_LUG_PINHOLE_MESH_LADDER_INTEGER_INVALID',
      `${label} must be an integer >= ${minimum}.`);
  }
  return value;
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw ladderError('LAFEA_LUG_PINHOLE_MESH_LADDER_TEXT_INVALID',
      `${label} is required.`);
  }
  return value;
}

function ladderError(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
