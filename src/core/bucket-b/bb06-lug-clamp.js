import { semanticHash } from '../shared-piping-model/index.js';
import { BUCKET_B_CURRENT_MAIN_BASELINE, requireBucketBCurrentMainBaseline } from './current-main-baseline.js';

export const BB06_PROCEDURE_SCHEMA = 'bucket-b-bb06-lug-clamp-procedure/v1';
export const BB06_EVIDENCE_SCHEMA = 'bucket-b-bb06-lug-clamp-evidence/v1';
export const BB06_REPORT_SCHEMA = 'bucket-b-bb06-lug-clamp-report/v1';

export const BB06_LEVELS = Object.freeze([
  Object.freeze({ levelId: 'M0', radialElements: 4, circumferentialElementsPerHalf: 8 }),
  Object.freeze({ levelId: 'M1', radialElements: 6, circumferentialElementsPerHalf: 12 }),
  Object.freeze({ levelId: 'M2', radialElements: 8, circumferentialElementsPerHalf: 16 }),
  Object.freeze({ levelId: 'M3', radialElements: 10, circumferentialElementsPerHalf: 24 }),
]);

export const BB06_MODULES = deepFreeze({
  'C2D-LUG-PINHOLE': {
    moduleId: 'C2D-LUG-PINHOLE',
    formulationProfile: 'PLANE_STRESS',
    elementProfile: 'Q8_FULL_3X3',
    geometryProfileId: 'BB06_LUG_ANNULAR_EAR_V1',
    holeRadius: 10,
    outerRadius: 25,
    thickness: 5,
    bearingResultant: 25000,
    material: { elasticModulus: 210000, poissonRatio: 0.3 },
    procedureScope: 'ANNULAR_EAR_BEARING_SURROGATE',
    limitations: [
      'CONTACT_NOT_MODELED',
      'PIN_CLEARANCE_NOT_MODELED',
      'PIN_FRICTION_NOT_MODELED',
      'THREE_DIMENSIONAL_THICKNESS_RESPONSE_NOT_MODELED',
      'D_SHAPED_SHANK_AND_ROOT_FILLET_DEFERRED_TO_APPLICATION_GEOMETRY_EXTENSION',
    ],
  },
  'C2D-CLAMP-EAR': {
    moduleId: 'C2D-CLAMP-EAR',
    formulationProfile: 'PLANE_STRESS',
    elementProfile: 'Q8_FULL_3X3',
    geometryProfileId: 'BB06_CLAMP_ANNULAR_EAR_V1',
    holeRadius: 10,
    outerRadius: 30,
    thickness: 6,
    bearingResultant: 20000,
    material: { elasticModulus: 210000, poissonRatio: 0.3 },
    procedureScope: 'ANNULAR_EAR_BEARING_SURROGATE',
    limitations: [
      'CONTACT_NOT_MODELED',
      'PIN_CLEARANCE_NOT_MODELED',
      'PIN_FRICTION_NOT_MODELED',
      'PIN_ELASTICITY_NOT_MODELED',
      'LOCAL_CRUSHING_CONSTITUTIVE_BEHAVIOR_NOT_MODELED',
      'THREE_DIMENSIONAL_THICKNESS_RESPONSE_NOT_MODELED',
    ],
  },
});

export function createBb06Procedure({ baseline = BUCKET_B_CURRENT_MAIN_BASELINE } = {}) {
  requireBucketBCurrentMainBaseline(baseline);
  const procedure = {
    schema: BB06_PROCEDURE_SCHEMA,
    baseline,
    modules: BB06_MODULES,
    levels: BB06_LEVELS,
    loadIntegrationProfileId: 'Q8_QUADRATIC_EDGE_GAUSS_3_LOAD_INTEGRATION_V1',
    recoveryProfileId: 'Q8_GAUSS_POINT_IN_PLANE_STRESS_RECOVERY_V1',
    openHoleReferenceId: 'CONT-HOLE-01',
    contact: 'NONE',
    pinModel: 'DISTRIBUTED_BEARING_SURROGATE',
    clearance: 'NOT_MODELED',
    friction: 'NOT_MODELED',
    applicationExecutionAuthorized: true,
    codeAssessmentAuthorized: false,
    moduleQualificationAuthorized: false,
    bb07Authorized: false,
  };
  return deepFreeze({ ...procedure, semanticHash: semanticHash(procedure) });
}

export function createBb06Evidence({ procedure, exactHeadSha, moduleEvidence, openHoleEvidence }) {
  requireProcedure(procedure);
  requireSha(exactHeadSha, 'exactHeadSha');
  if (!Array.isArray(moduleEvidence) || moduleEvidence.length !== 2) {
    throw new TypeError('BB-06 evidence requires exactly two application-module evidence rows.');
  }
  const expected = Object.keys(BB06_MODULES).sort();
  const observed = moduleEvidence.map((row) => row?.moduleId).sort();
  if (JSON.stringify(expected) !== JSON.stringify(observed)) {
    throw new TypeError('BB-06 module evidence does not match the registered lug and clamp modules.');
  }
  moduleEvidence.forEach(requireModuleEvidence);
  if (openHoleEvidence?.benchmarkId !== 'CONT-HOLE-01' || openHoleEvidence?.status !== 'PASS') {
    throw new TypeError('BB-06 requires a passing CONT-HOLE-01 open-hole reference.');
  }
  const evidence = {
    schema: BB06_EVIDENCE_SCHEMA,
    exactHeadSha,
    procedureHash: procedure.semanticHash,
    openHoleEvidence,
    moduleEvidence,
    applicationProcedureQualified: moduleEvidence.every((row) => row.applicationProcedureQualified),
    numericalOutputQualified: moduleEvidence.every((row) => row.numericalOutputQualified),
    codeAssessmentQualified: false,
    moduleQualified: false,
  };
  return deepFreeze({ ...evidence, semanticHash: semanticHash(evidence) });
}

export function createBb06Report({ evidence, checkResults }) {
  if (evidence?.schema !== BB06_EVIDENCE_SCHEMA) throw new TypeError('Registered BB-06 evidence is required.');
  if (!Array.isArray(checkResults) || checkResults.some((row) => row?.status !== 'PASS')) {
    throw new TypeError('All BB-06 report checks must pass.');
  }
  const complete = evidence.applicationProcedureQualified && evidence.numericalOutputQualified;
  const report = {
    schema: BB06_REPORT_SCHEMA,
    exactHeadSha: evidence.exactHeadSha,
    evidenceHash: evidence.semanticHash,
    status: complete ? 'BB06_PROCEDURE_QUALIFIED' : 'BB06_PARTIAL_PROCEDURE_ONLY',
    checkCount: checkResults.length,
    checkResults,
    applicationProcedureQualified: complete,
    numericalOutputQualified: complete,
    codeAssessmentQualified: false,
    moduleQualified: false,
    bb07Authorized: complete,
    applicationExecutionAuthorized: false,
    axisymmetricAuthorized: false,
  };
  return deepFreeze({ ...report, semanticHash: semanticHash(report) });
}

export function validateBb06Report(report) {
  if (report?.schema !== BB06_REPORT_SCHEMA) throw new TypeError('Unsupported BB-06 report schema.');
  requireSha(report.exactHeadSha, 'exactHeadSha');
  if (!Array.isArray(report.checkResults) || report.checkResults.length !== report.checkCount) {
    throw new TypeError('BB-06 report check count is inconsistent.');
  }
  if (report.checkResults.some((row) => row?.status !== 'PASS')) throw new TypeError('BB-06 report contains a failing check.');
  if (report.bb07Authorized !== (report.applicationProcedureQualified && report.numericalOutputQualified)) {
    throw new TypeError('BB-07 authorization does not match BB-06 qualification state.');
  }
  if (report.codeAssessmentQualified || report.moduleQualified || report.applicationExecutionAuthorized || report.axisymmetricAuthorized) {
    throw new TypeError('BB-06 report crosses a retained authority boundary.');
  }
  const { semanticHash: retained, ...payload } = report;
  if (retained !== semanticHash(payload)) throw new TypeError('BB-06 report semantic hash mismatch.');
  return true;
}

function requireProcedure(value) {
  if (value?.schema !== BB06_PROCEDURE_SCHEMA) throw new TypeError('Registered BB-06 procedure is required.');
  if (value.baseline !== BUCKET_B_CURRENT_MAIN_BASELINE) throw new TypeError('BB-06 procedure baseline is not the registered current-main authority.');
  const { semanticHash: retained, ...payload } = value;
  if (retained !== semanticHash(payload)) throw new TypeError('BB-06 procedure semantic hash mismatch.');
}

function requireModuleEvidence(row) {
  if (!BB06_MODULES[row?.moduleId]) throw new TypeError('Unregistered BB-06 module evidence.');
  if (!Array.isArray(row.levels) || row.levels.length !== BB06_LEVELS.length) throw new TypeError('BB-06 module evidence requires M0 through M3.');
  if (row.levels.some((level, index) => level?.levelId !== BB06_LEVELS[index].levelId)) throw new TypeError('BB-06 mesh-level order is invalid.');
  if (row.contact !== 'NONE' || row.pinModel !== 'DISTRIBUTED_BEARING_SURROGATE') throw new TypeError('BB-06 contact/pin-model authority mismatch.');
  if (!row.applicationProcedureQualified || !row.numericalOutputQualified) throw new TypeError('BB-06 module evidence is not qualified.');
}

function requireSha(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/i.test(value)) throw new TypeError(`${label} must be a 40-character Git SHA.`);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
