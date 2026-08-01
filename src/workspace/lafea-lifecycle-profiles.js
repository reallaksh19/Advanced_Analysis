/**
 * Stage-correct LAFEA lifecycle profiles.
 *
 * Profiles authorize exact artifact kinds, parent contracts, prerequisites and
 * readiness semantics for each current stage. They do not create evidence,
 * choose producers or promote calculation output.
 */

export const LAFEA_LIFECYCLE_PROFILE_SCHEMA = 'lafea-lifecycle-profile/v1';

export const LAFEA_LIFECYCLE_PROFILE_IDS = Object.freeze([
  'ANALYTICAL_FOUNDATION_V1',
  'ANALYTICAL_SCREENING_V1',
  'FEA_MESH_RECOVERY_V1',
  'UNSUPPORTED_STAGE_V1',
]);

export const LAFEA_STAGE_LIFECYCLE_PROFILE_IDS = deepFreeze({
  'LAFEA.1': 'ANALYTICAL_FOUNDATION_V1',
  'LAFEA.2': 'ANALYTICAL_SCREENING_V1',
  'LAFEA.3': 'FEA_MESH_RECOVERY_V1',
  'LAFEA.4': 'FEA_MESH_RECOVERY_V1',
  'LAFEA.5': 'FEA_MESH_RECOVERY_V1',
  'LAFEA.6': 'UNSUPPORTED_STAGE_V1',
});

const CANONICAL_MODEL = Object.freeze({
  parentKeys: ['sourceHash'],
  opaqueParentKeys: [],
  prerequisites: [],
});

const ANALYTICAL_EXECUTION = Object.freeze({
  parentKeys: ['canonicalModelHash', 'physicalLoadCaseHash', 'solverProfileHash'],
  opaqueParentKeys: ['physicalLoadCaseHash', 'solverProfileHash'],
  prerequisites: [['CANONICAL_MODEL', 'PASS']],
});

const ANALYTICAL_RESULT = Object.freeze({
  parentKeys: ['canonicalModelHash', 'executionHash', 'resultProfileHash'],
  opaqueParentKeys: ['resultProfileHash'],
  prerequisites: [['EXECUTION', 'PASS']],
});

const ANALYTICAL_PRODUCT = Object.freeze({
  parentKeys: [
    'sourceHash', 'canonicalModelHash', 'executionHash',
    'resultEvidenceHash', 'productProfileHash',
  ],
  opaqueParentKeys: ['productProfileHash'],
  prerequisites: [['RESULT_EVIDENCE', 'PASS']],
});

const FEA_GEOMETRY = Object.freeze({
  parentKeys: ['sourceHash', 'canonicalModelHash'],
  opaqueParentKeys: [],
  prerequisites: [['CANONICAL_MODEL', 'PASS']],
});

const FEA_MESH = Object.freeze({
  parentKeys: ['analysisGeometryHash', 'meshProfileHash'],
  opaqueParentKeys: ['meshProfileHash'],
  prerequisites: [['ANALYSIS_GEOMETRY', 'PASS']],
});

const FEA_EXECUTION = Object.freeze({
  parentKeys: [
    'canonicalModelHash', 'meshHash', 'physicalLoadCaseHash',
    'solverProfileHash',
  ],
  opaqueParentKeys: ['physicalLoadCaseHash', 'solverProfileHash'],
  prerequisites: [['CANONICAL_MODEL', 'PASS'], ['ANALYSIS_MESH', 'PASS']],
});

const FEA_RECOVERY = Object.freeze({
  parentKeys: ['executionHash', 'meshHash', 'recoveryProfileHash'],
  opaqueParentKeys: ['recoveryProfileHash'],
  prerequisites: [['EXECUTION', 'PASS'], ['ANALYSIS_MESH', 'PASS']],
});

const FEA_CONVERGENCE = Object.freeze({
  parentKeys: ['recoveryHash', 'recoverySetHash', 'convergenceProfileHash'],
  opaqueParentKeys: ['recoverySetHash', 'convergenceProfileHash'],
  prerequisites: [['RECOVERY', 'PASS']],
});

export const LAFEA_LIFECYCLE_PROFILES = deepFreeze([
  profile({
    profileId: 'ANALYTICAL_FOUNDATION_V1',
    label: 'Analytical foundation result lifecycle',
    stageIds: ['LAFEA.1'],
    artifactDefinitions: {
      CANONICAL_MODEL,
      EXECUTION: ANALYTICAL_EXECUTION,
      RESULT_EVIDENCE: ANALYTICAL_RESULT,
      FOUNDATION_DISTRIBUTION: ANALYTICAL_PRODUCT,
      REPORT_EVIDENCE: {
        parentKeys: [
          'sourceHash', 'canonicalModelHash', 'executionHash',
          'resultEvidenceHash', 'reportProfileHash',
        ],
        opaqueParentKeys: ['reportProfileHash'],
        prerequisites: [['RESULT_EVIDENCE', 'PASS']],
      },
    },
    resultRequiredKinds: ['CANONICAL_MODEL', 'EXECUTION', 'RESULT_EVIDENCE'],
    assessmentRequiredKinds: [],
    reportPassRequiredKinds: ['CANONICAL_MODEL', 'EXECUTION', 'RESULT_EVIDENCE'],
    meshApplicable: false,
    convergenceApplicable: false,
    codeAssessmentApplicable: false,
    engineeringChangeClasses: [
      'MATERIAL_PROPERTY', 'GEOMETRY', 'LOAD_OR_BC', 'MODEL_METADATA',
    ],
  }),
  profile({
    profileId: 'ANALYTICAL_SCREENING_V1',
    label: 'Analytical screening result lifecycle',
    stageIds: ['LAFEA.2'],
    artifactDefinitions: {
      CANONICAL_MODEL,
      EXECUTION: ANALYTICAL_EXECUTION,
      RESULT_EVIDENCE: ANALYTICAL_RESULT,
      SCREENING_ASSESSMENT: ANALYTICAL_PRODUCT,
      REPORT_EVIDENCE: {
        parentKeys: [
          'sourceHash', 'canonicalModelHash', 'executionHash',
          'resultEvidenceHash', 'screeningAssessmentHash',
          'reportProfileHash',
        ],
        opaqueParentKeys: ['reportProfileHash'],
        prerequisites: [['SCREENING_ASSESSMENT', 'PASS']],
      },
    },
    resultRequiredKinds: ['CANONICAL_MODEL', 'EXECUTION', 'RESULT_EVIDENCE'],
    assessmentRequiredKinds: ['SCREENING_ASSESSMENT'],
    reportPassRequiredKinds: [
      'CANONICAL_MODEL', 'EXECUTION', 'RESULT_EVIDENCE', 'SCREENING_ASSESSMENT',
    ],
    meshApplicable: false,
    convergenceApplicable: false,
    codeAssessmentApplicable: false,
    engineeringChangeClasses: [
      'MATERIAL_PROPERTY', 'GEOMETRY', 'LOAD_OR_BC', 'MODEL_METADATA',
    ],
  }),
  profile({
    profileId: 'FEA_MESH_RECOVERY_V1',
    label: 'Finite-element mesh, execution and recovery lifecycle',
    stageIds: ['LAFEA.3', 'LAFEA.4', 'LAFEA.5'],
    artifactDefinitions: {
      CANONICAL_MODEL,
      ANALYSIS_GEOMETRY: FEA_GEOMETRY,
      ANALYSIS_MESH: FEA_MESH,
      EXECUTION: FEA_EXECUTION,
      RECOVERY: FEA_RECOVERY,
      CONVERGENCE: FEA_CONVERGENCE,
      REPORT_EVIDENCE: {
        parentKeys: [
          'sourceHash', 'canonicalModelHash', 'meshHash', 'executionHash',
          'recoveryHash', 'convergenceHash', 'reportProfileHash',
        ],
        opaqueParentKeys: ['reportProfileHash'],
        prerequisites: [['RECOVERY', 'PASS']],
      },
    },
    resultRequiredKinds: [
      'CANONICAL_MODEL', 'ANALYSIS_GEOMETRY', 'ANALYSIS_MESH',
      'EXECUTION', 'RECOVERY',
    ],
    assessmentRequiredKinds: [],
    reportPassRequiredKinds: [
      'CANONICAL_MODEL', 'ANALYSIS_GEOMETRY', 'ANALYSIS_MESH',
      'EXECUTION', 'RECOVERY',
    ],
    meshApplicable: true,
    convergenceApplicable: true,
    codeAssessmentApplicable: false,
    engineeringChangeClasses: [
      'MATERIAL_PROPERTY', 'GEOMETRY', 'LOAD_OR_BC', 'MODEL_METADATA',
      'ANALYSIS_MESH_PROFILE', 'RECOVERY_PROFILE',
    ],
  }),
  profile({
    profileId: 'UNSUPPORTED_STAGE_V1',
    label: 'Unsupported stage lifecycle containment',
    stageIds: ['LAFEA.6'],
    artifactDefinitions: {},
    resultRequiredKinds: [],
    assessmentRequiredKinds: [],
    reportPassRequiredKinds: [],
    meshApplicable: false,
    convergenceApplicable: false,
    codeAssessmentApplicable: false,
    engineeringChangeClasses: [],
  }),
]);

export function requireLafeaLifecycleProfile(profileId) {
  if (!LAFEA_LIFECYCLE_PROFILE_IDS.includes(profileId)) {
    throw new TypeError(`Unsupported LAFEA lifecycle profile: ${profileId}.`);
  }
  const result = LAFEA_LIFECYCLE_PROFILES.find((row) => row.profileId === profileId);
  if (!result) throw new TypeError(`LAFEA lifecycle profile is missing: ${profileId}.`);
  return result;
}

export function requireLafeaLifecycleProfileForStage(stageId) {
  const profileId = LAFEA_STAGE_LIFECYCLE_PROFILE_IDS[stageId];
  if (!profileId) throw new TypeError(`No LAFEA lifecycle profile is registered for ${stageId}.`);
  const profileValue = requireLafeaLifecycleProfile(profileId);
  if (!profileValue.stageIds.includes(stageId)) {
    throw new TypeError(`LAFEA lifecycle profile ${profileId} does not authorize ${stageId}.`);
  }
  return profileValue;
}

export function lafeaLifecycleArtifactKinds(stageId) {
  return requireLafeaLifecycleProfileForStage(stageId).artifactKinds;
}

export function requireLafeaLifecycleArtifactDefinition(stageId, kind) {
  const profileValue = requireLafeaLifecycleProfileForStage(stageId);
  const definition = profileValue.artifactDefinitions[kind];
  if (!definition) {
    const error = new TypeError(`${kind} is not authorized by ${profileValue.profileId}.`);
    error.code = 'LAFEA_ARTIFACT_KIND_NOT_AUTHORIZED_FOR_PROFILE';
    throw error;
  }
  return definition;
}

function profile(value) {
  const artifactDefinitions = Object.fromEntries(
    Object.entries(value.artifactDefinitions).map(([kind, definition]) => [
      kind,
      Object.freeze({
        parentKeys: Object.freeze([...definition.parentKeys]),
        opaqueParentKeys: Object.freeze([...definition.opaqueParentKeys]),
        prerequisites: Object.freeze(definition.prerequisites.map((row) => Object.freeze([...row]))),
        descendants: Object.freeze([]),
      }),
    ]),
  );
  const artifactKinds = Object.freeze(Object.keys(artifactDefinitions));
  for (const [index, kind] of artifactKinds.entries()) {
    artifactDefinitions[kind] = Object.freeze({
      ...artifactDefinitions[kind],
      descendants: Object.freeze(artifactKinds.slice(index + 1)),
    });
  }
  return {
    schema: LAFEA_LIFECYCLE_PROFILE_SCHEMA,
    ...value,
    stageIds: Object.freeze([...value.stageIds]),
    artifactKinds,
    artifactDefinitions: Object.freeze(artifactDefinitions),
    resultRequiredKinds: Object.freeze([...value.resultRequiredKinds]),
    assessmentRequiredKinds: Object.freeze([...value.assessmentRequiredKinds]),
    reportPassRequiredKinds: Object.freeze([...value.reportPassRequiredKinds]),
    engineeringChangeClasses: Object.freeze([...value.engineeringChangeClasses]),
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
