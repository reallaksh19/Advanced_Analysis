import { semanticHash } from '../shared-piping-model/index.js';
import { validateBb07Report } from './bb07-bracket-gusset.js';

export const BB08_PROCEDURE_SCHEMA = 'bucket-b-bb08-pipe-pad-procedure/v1';
export const BB08_EVIDENCE_SCHEMA = 'bucket-b-bb08-pipe-pad-evidence/v1';
export const BB08_REPORT_SCHEMA = 'bucket-b-bb08-pipe-pad-report/v1';

export const BB08_LEVELS = Object.freeze([
  Object.freeze({ levelId: 'M0', thetaColumns: 6, pipeRadialRows: 2, padRadialRows: 1 }),
  Object.freeze({ levelId: 'M1', thetaColumns: 12, pipeRadialRows: 4, padRadialRows: 2 }),
  Object.freeze({ levelId: 'M2', thetaColumns: 18, pipeRadialRows: 6, padRadialRows: 3 }),
  Object.freeze({ levelId: 'M3', thetaColumns: 24, pipeRadialRows: 8, padRadialRows: 4 }),
]);

export const BB08_MODULE = deepFreeze({
  moduleId: 'C2D-PIPE-PAD-SECTION',
  formulationProfile: 'PLANE_STRAIN',
  elementProfile: 'Q8_FULL_3X3',
  geometryProfileId: 'BB08_QUARTER_PIPE_WITH_CROWN_PAD_V1',
  meshFamilyId: 'BB08_CONFORMING_POLAR_PIPE_PAD_M0_M3_V1',
  recoveryProfileId: 'Q8_GAUSS_POINT_IN_PLANE_STRESS_RECOVERY_V1',
  loadIntegrationProfileId: 'Q8_QUADRATIC_EDGE_GAUSS_3_LOAD_INTEGRATION_V1',
  radialPathProfileId: 'BB08_FIXED_THETA_COMPOSITE_RADIAL_PATH_GL8_V1',
  interfaceProfileId: 'BB08_PERFECT_BOND_SHARED_NODE_INTERFACE_V1',
  innerRadius: 100,
  pipeThickness: 10,
  padThickness: 8,
  sectorAngleRadians: Math.PI / 2,
  padHalfAngleRadians: Math.PI / 6,
  outOfPlaneThickness: 1,
  internalPressure: 10,
  material: Object.freeze({ elasticModulus: 210000, poissonRatio: 0.3 }),
  procedureScope: 'DIAMETRICALLY_OPPOSED_PIPE_PAD_PLANE_STRAIN_QUARTER_SECTION_SURROGATE',
  limitations: Object.freeze([
    'QUARTER_SYMMETRY_REPRESENTS_DIAMETRICALLY_OPPOSED_PADS',
    'PERFECT_BOND_WITH_SHARED_INTERFACE_NODES',
    'PIPE_AND_PAD_USE_IDENTICAL_LINEAR_ELASTIC_MATERIAL',
    'PLANE_STRAIN_ALONG_PIPE_AXIS',
    'PAD_TOE_AND_WELD_PROFILE_NOT_MODELED',
    'CONTACT_LIFTOFF_AND_FRICTION_NOT_MODELED',
    'THERMAL_MISMATCH_NOT_MODELED',
    'THREE_DIMENSIONAL_SHELL_ATTACHMENT_RESPONSE_NOT_MODELED',
    'PRESSURE_CORRECTION_AND_CODE_CLASSIFICATION_NOT_APPLIED',
  ]),
});

export function createBb08Procedure({ bb07Report, exactHeadSha }) {
  validateBb07Report(bb07Report);
  requireSha(exactHeadSha, 'exactHeadSha');
  if (bb07Report.exactHeadSha !== exactHeadSha) {
    throw new TypeError('BB-08 requires a BB-07 report from the same exact head.');
  }
  if (!bb07Report.bb08Authorized) {
    throw new TypeError('BB-07 did not authorize BB-08.');
  }
  const procedure = {
    schema: BB08_PROCEDURE_SCHEMA,
    exactHeadSha,
    bb07ReportHash: bb07Report.semanticHash,
    module: BB08_MODULE,
    levels: BB08_LEVELS,
    manufacturedFieldProfileId: 'BB08_AFFINE_PLANE_STRAIN_FIELD_V1',
    referenceProfileId: 'BB08_PLANE_STRAIN_LAME_QUARTER_CYLINDER_V1',
    applicationExecutionAuthorized: true,
    codeAssessmentAuthorized: false,
    moduleQualificationAuthorized: false,
    bb09Authorized: false,
  };
  return deepFreeze({ ...procedure, semanticHash: semanticHash(procedure) });
}

export function createBb08Evidence({ procedure, moduleEvidence }) {
  requireProcedure(procedure);
  requireModuleEvidence(moduleEvidence);
  const evidence = {
    schema: BB08_EVIDENCE_SCHEMA,
    exactHeadSha: procedure.exactHeadSha,
    procedureHash: procedure.semanticHash,
    moduleEvidence,
    applicationProcedureQualified: moduleEvidence.applicationProcedureQualified,
    numericalOutputQualified: moduleEvidence.numericalOutputQualified,
    codeAssessmentQualified: false,
    moduleQualified: false,
  };
  return deepFreeze({ ...evidence, semanticHash: semanticHash(evidence) });
}

export function createBb08Report({ evidence, checkResults }) {
  if (evidence?.schema !== BB08_EVIDENCE_SCHEMA) {
    throw new TypeError('Registered BB-08 evidence is required.');
  }
  if (!Array.isArray(checkResults) || checkResults.some((row) => row?.status !== 'PASS')) {
    throw new TypeError('All BB-08 report checks must pass.');
  }
  const qualified = evidence.applicationProcedureQualified
    && evidence.numericalOutputQualified;
  const report = {
    schema: BB08_REPORT_SCHEMA,
    exactHeadSha: evidence.exactHeadSha,
    evidenceHash: evidence.semanticHash,
    status: qualified
      ? 'BB08_PROCEDURE_QUALIFIED'
      : 'BB08_PARTIAL_PROCEDURE_ONLY',
    checkCount: checkResults.length,
    checkResults,
    applicationProcedureQualified: qualified,
    numericalOutputQualified: qualified,
    codeAssessmentQualified: false,
    moduleQualified: false,
    bb09Authorized: qualified,
    applicationExecutionAuthorized: false,
    axisymmetricAuthorized: false,
    productionSwitchAuthorized: false,
  };
  return deepFreeze({ ...report, semanticHash: semanticHash(report) });
}

export function validateBb08Report(report) {
  if (report?.schema !== BB08_REPORT_SCHEMA) {
    throw new TypeError('Unsupported BB-08 report schema.');
  }
  requireSha(report.exactHeadSha, 'exactHeadSha');
  if (!Array.isArray(report.checkResults) || report.checkResults.length !== report.checkCount) {
    throw new TypeError('BB-08 report check count is inconsistent.');
  }
  if (report.checkResults.some((row) => row?.status !== 'PASS')) {
    throw new TypeError('BB-08 report contains a failing check.');
  }
  if (report.bb09Authorized !== (
    report.applicationProcedureQualified && report.numericalOutputQualified
  )) {
    throw new TypeError('BB-09 authorization does not match BB-08 qualification state.');
  }
  if (
    report.codeAssessmentQualified
    || report.moduleQualified
    || report.applicationExecutionAuthorized
    || report.axisymmetricAuthorized
    || report.productionSwitchAuthorized
  ) {
    throw new TypeError('BB-08 report crosses a retained authority boundary.');
  }
  const { semanticHash: retained, ...payload } = report;
  if (retained !== semanticHash(payload)) {
    throw new TypeError('BB-08 report semantic hash mismatch.');
  }
  return true;
}

function requireProcedure(value) {
  if (value?.schema !== BB08_PROCEDURE_SCHEMA) {
    throw new TypeError('Registered BB-08 procedure is required.');
  }
  const { semanticHash: retained, ...payload } = value;
  if (retained !== semanticHash(payload)) {
    throw new TypeError('BB-08 procedure semantic hash mismatch.');
  }
}

function requireModuleEvidence(value) {
  if (value?.moduleId !== BB08_MODULE.moduleId) {
    throw new TypeError('Unregistered BB-08 module evidence.');
  }
  if (!Array.isArray(value.levels) || value.levels.length !== BB08_LEVELS.length) {
    throw new TypeError('BB-08 module evidence requires M0 through M3.');
  }
  if (value.levels.some((row, index) => row?.levelId !== BB08_LEVELS[index].levelId)) {
    throw new TypeError('BB-08 mesh-level order is invalid.');
  }
  if (!value.manufacturedFieldQualified || !value.lameReferenceQualified) {
    throw new TypeError('BB-08 prerequisite numerical references did not pass.');
  }
  if (!value.applicationProcedureQualified || !value.numericalOutputQualified) {
    throw new TypeError('BB-08 module evidence is not qualified.');
  }
}

function requireSha(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/i.test(value)) {
    throw new TypeError(`${label} must be a 40-character Git SHA.`);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
