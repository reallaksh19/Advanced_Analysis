import { semanticHash } from '../shared-piping-model/index.js';
import { validateBb08Report } from './bb08-pipe-pad.js';

export const BB09_PROCEDURE_SCHEMA =
  'bucket-b-bb09-nozzle-repad-procedure/v1';
export const BB09_EVIDENCE_SCHEMA =
  'bucket-b-bb09-nozzle-repad-evidence/v1';
export const BB09_REPORT_SCHEMA =
  'bucket-b-bb09-nozzle-repad-report/v1';

export const BB09_LEVELS = Object.freeze([
  Object.freeze({
    levelId: 'M0',
    neckAcross: 1,
    hostAcross: 4,
    hostThrough: 1,
    padAcross: 2,
    padThrough: 1,
    neckUpper: 2,
  }),
  Object.freeze({
    levelId: 'M1',
    neckAcross: 2,
    hostAcross: 8,
    hostThrough: 2,
    padAcross: 4,
    padThrough: 1,
    neckUpper: 4,
  }),
  Object.freeze({
    levelId: 'M2',
    neckAcross: 4,
    hostAcross: 16,
    hostThrough: 4,
    padAcross: 8,
    padThrough: 2,
    neckUpper: 8,
  }),
  Object.freeze({
    levelId: 'M3',
    neckAcross: 6,
    hostAcross: 24,
    hostThrough: 6,
    padAcross: 12,
    padThrough: 3,
    neckUpper: 12,
  }),
]);

export const BB09_MODULE = deepFreeze({
  moduleId: 'C2D-NOZZLE-REPAD-SECTION',
  formulationProfile: 'PLANE_STRAIN',
  elementProfile: 'Q8_FULL_3X3',
  geometryProfileId: 'BB09_HALF_NOZZLE_REPAD_PLANAR_SECTION_V1',
  meshFamilyId: 'BB09_CONFORMING_MULTIBLOCK_Q8_M0_M3_V1',
  recoveryProfileId: 'Q8_GAUSS_POINT_IN_PLANE_STRESS_RECOVERY_V1',
  loadIntegrationProfileId:
    'Q8_QUADRATIC_EDGE_GAUSS_3_LOAD_INTEGRATION_V1',
  pathProfileId: 'BB09_FIXED_X_HOST_PAD_PATH_GL8_V1',
  interfaceProfileId: 'BB09_SHARED_NODE_NECK_HOST_PAD_INTERFACES_V1',
  referenceProfileId: 'BB09_PLANE_STRAIN_UNIAXIAL_STRIP_V1',
  nozzleWallThickness: 12,
  hostHalfWidth: 60,
  hostThickness: 12,
  repadOuterX: 36,
  repadThickness: 6,
  neckUpperHeight: 24,
  outOfPlaneThickness: 1,
  internalPressure: 10,
  nozzleAxialTraction: -6,
  material: Object.freeze({
    elasticModulus: 210000,
    poissonRatio: 0.3,
  }),
  procedureScope:
    'HALF_NOZZLE_REPAD_PLANE_STRAIN_SECTION_SURROGATE_WITH_REMOTE_CUT_BOUNDARIES',
  limitations: Object.freeze([
    'PLANAR_HALF_SECTION_SURROGATE_NOT_A_THREE_DIMENSIONAL_NOZZLE_JUNCTION',
    'PLANE_STRAIN_OUT_OF_PLANE_RESPONSE_ONLY',
    'REMOTE_HOST_CUT_IS_FIXED_FOR_THE_QUALIFIED_LOAD_PATH',
    'NOZZLE_BORE_AND_HOST_INNER_FACE_PRESSURE_ONLY',
    'NOZZLE_AXIAL_TRACTION_IS_A_SEPARATE_LINEAR_LOAD_CASE',
    'PERFECT_BOND_WITH_SHARED_INTERFACE_NODES',
    'HOST_NOZZLE_AND_REPAD_USE_IDENTICAL_LINEAR_ELASTIC_MATERIAL',
    'WELD_PROFILE_AND_WELD_THROAT_NOT_MODELED',
    'CONTACT_LIFTOFF_AND_FRICTION_NOT_MODELED',
    'PLASTICITY_BUCKLING_FATIGUE_AND_FRACTURE_NOT_MODELED',
    'CURVED_SHELL_AND_CIRCUMFERENTIAL_LOAD_REDISTRIBUTION_NOT_MODELED',
    'PRESSURE_CORRECTION_STRESS_CLASSIFICATION_AND_CODE_ASSESSMENT_NOT_APPLIED',
    'APPLICATION_TEMPLATE_PROMOTION_AND_PRODUCTION_SWITCH_NOT_AUTHORIZED',
  ]),
});

export function createBb09Procedure({ bb08Report, exactHeadSha }) {
  validateBb08Report(bb08Report);
  requireSha(exactHeadSha, 'exactHeadSha');
  if (bb08Report.exactHeadSha !== exactHeadSha) {
    throw new TypeError(
      'BB-09 requires a BB-08 report from the same exact head.',
    );
  }
  if (!bb08Report.bb09Authorized) {
    throw new TypeError('BB-08 did not authorize BB-09.');
  }
  const procedure = {
    schema: BB09_PROCEDURE_SCHEMA,
    exactHeadSha,
    bb08ReportHash: bb08Report.semanticHash,
    module: BB09_MODULE,
    levels: BB09_LEVELS,
    manufacturedFieldProfileId: 'BB09_AFFINE_PLANE_STRAIN_FIELD_V1',
    referenceProfileId: BB09_MODULE.referenceProfileId,
    applicationLoadProfileIds: Object.freeze([
      'BB09_INTERNAL_PRESSURE_BORE_AND_HOST_FACE_V1',
      'BB09_NOZZLE_AXIAL_EDGE_TRACTION_V1',
    ]),
    applicationExecutionAuthorized: true,
    codeAssessmentAuthorized: false,
    moduleQualificationAuthorized: false,
    applicationModulePromotionAuthorized: false,
    productionSwitchAuthorized: false,
    bb12PlanarIntakeAuthorized: false,
    bb12Authorized: false,
  };
  return seal(procedure);
}

export function createBb09Evidence({ procedure, moduleEvidence }) {
  requireProcedure(procedure);
  requireModuleEvidence(moduleEvidence);
  const evidence = {
    schema: BB09_EVIDENCE_SCHEMA,
    exactHeadSha: procedure.exactHeadSha,
    procedureHash: procedure.semanticHash,
    moduleEvidence,
    applicationProcedureQualified:
      moduleEvidence.applicationProcedureQualified,
    numericalOutputQualified: moduleEvidence.numericalOutputQualified,
    codeAssessmentQualified: false,
    moduleQualified: false,
    applicationModulePromoted: false,
    productionSwitchAuthorized: false,
  };
  return seal(evidence);
}

export function createBb09Report({ evidence, checkResults }) {
  if (evidence?.schema !== BB09_EVIDENCE_SCHEMA) {
    throw new TypeError('Registered BB-09 evidence is required.');
  }
  if (
    !Array.isArray(checkResults)
    || checkResults.length === 0
    || checkResults.some((row) => row?.status !== 'PASS')
  ) {
    throw new TypeError('All BB-09 report checks must pass.');
  }
  const qualified = evidence.applicationProcedureQualified
    && evidence.numericalOutputQualified;
  const report = {
    schema: BB09_REPORT_SCHEMA,
    exactHeadSha: evidence.exactHeadSha,
    evidenceHash: evidence.semanticHash,
    status: qualified
      ? 'BB09_PROCEDURE_QUALIFIED'
      : 'BB09_PARTIAL_PROCEDURE_ONLY',
    checkCount: checkResults.length,
    checkResults,
    applicationProcedureQualified: qualified,
    numericalOutputQualified: qualified,
    codeAssessmentQualified: false,
    moduleQualified: false,
    applicationModulePromoted: false,
    productionSwitchAuthorized: false,
    applicationExecutionAuthorized: false,
    axisymmetricAuthorized: false,
    bb12PlanarIntakeAuthorized: qualified,
    bb12Authorized: false,
  };
  return seal(report);
}

export function validateBb09Report(report) {
  if (report?.schema !== BB09_REPORT_SCHEMA) {
    throw new TypeError('Unsupported BB-09 report schema.');
  }
  requireSha(report.exactHeadSha, 'exactHeadSha');
  if (
    !Array.isArray(report.checkResults)
    || report.checkResults.length !== report.checkCount
    || report.checkResults.length === 0
  ) {
    throw new TypeError('BB-09 report check count is inconsistent.');
  }
  if (report.checkResults.some((row) => row?.status !== 'PASS')) {
    throw new TypeError('BB-09 report contains a failing check.');
  }
  const qualified = report.applicationProcedureQualified
    && report.numericalOutputQualified;
  if (report.bb12PlanarIntakeAuthorized !== qualified) {
    throw new TypeError(
      'BB-12 planar intake authorization does not match BB-09 qualification state.',
    );
  }
  if (
    report.codeAssessmentQualified
    || report.moduleQualified
    || report.applicationModulePromoted
    || report.productionSwitchAuthorized
    || report.applicationExecutionAuthorized
    || report.axisymmetricAuthorized
    || report.bb12Authorized
  ) {
    throw new TypeError('BB-09 report crosses a retained authority boundary.');
  }
  verifyHash(report, 'BB-09 report');
  return true;
}

function requireProcedure(value) {
  if (value?.schema !== BB09_PROCEDURE_SCHEMA) {
    throw new TypeError('Registered BB-09 procedure is required.');
  }
  verifyHash(value, 'BB-09 procedure');
  if (
    value.codeAssessmentAuthorized
    || value.moduleQualificationAuthorized
    || value.applicationModulePromotionAuthorized
    || value.productionSwitchAuthorized
    || value.bb12PlanarIntakeAuthorized
    || value.bb12Authorized
  ) {
    throw new TypeError(
      'BB-09 procedure crosses the pre-execution authority boundary.',
    );
  }
}

function requireModuleEvidence(value) {
  if (value?.moduleId !== BB09_MODULE.moduleId) {
    throw new TypeError('Unregistered BB-09 module evidence.');
  }
  if (
    !Array.isArray(value.levels)
    || value.levels.length !== BB09_LEVELS.length
  ) {
    throw new TypeError('BB-09 module evidence requires M0 through M3.');
  }
  if (
    value.levels.some(
      (row, index) => row?.levelId !== BB09_LEVELS[index].levelId,
    )
  ) {
    throw new TypeError('BB-09 mesh-level order is invalid.');
  }
  if (!value.manufacturedFieldQualified) {
    throw new TypeError(
      'BB-09 manufactured-field verification did not pass.',
    );
  }
  if (!value.stripReferenceQualified) {
    throw new TypeError('BB-09 analytical strip reference did not pass.');
  }
  if (!value.internalPressureQualified || !value.nozzleAxialTractionQualified) {
    throw new TypeError('BB-09 application load-case evidence is incomplete.');
  }
  if (!value.applicationProcedureQualified || !value.numericalOutputQualified) {
    throw new TypeError('BB-09 module evidence is not qualified.');
  }
}

function seal(payload) {
  return deepFreeze({
    ...payload,
    semanticHash: semanticHash(payload),
  });
}

function verifyHash(value, label) {
  const { semanticHash: retained, ...payload } = value;
  if (retained !== semanticHash(payload)) {
    throw new TypeError(`${label} semantic hash mismatch.`);
  }
}

function requireSha(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/i.test(value)) {
    throw new TypeError(`${label} must be a 40-character Git SHA.`);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
