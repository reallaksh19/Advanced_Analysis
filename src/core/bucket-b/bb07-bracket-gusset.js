import { semanticHash } from '../shared-piping-model/index.js';
import { validateBb06Report } from './bb06-lug-clamp.js';

export const BB07_PROCEDURE_SCHEMA = 'bucket-b-bb07-bracket-gusset-procedure/v1';
export const BB07_EVIDENCE_SCHEMA = 'bucket-b-bb07-bracket-gusset-evidence/v1';
export const BB07_REPORT_SCHEMA = 'bucket-b-bb07-bracket-gusset-report/v1';

export const BB07_LEVELS = Object.freeze([
  Object.freeze({ levelId: 'M0', columns: 4, rows: 2 }),
  Object.freeze({ levelId: 'M1', columns: 8, rows: 4 }),
  Object.freeze({ levelId: 'M2', columns: 12, rows: 6 }),
  Object.freeze({ levelId: 'M3', columns: 16, rows: 8 }),
]);

export const BB07_MODULE = deepFreeze({
  moduleId: 'C2D-BRACKET-GUSSET',
  formulationProfile: 'PLANE_STRESS',
  elementProfile: 'Q8_FULL_3X3',
  geometryProfileId: 'BB07_TAPERED_BRACKET_GUSSET_MEMBRANE_V1',
  meshFamilyId: 'BB07_MAPPED_TAPERED_MEMBRANE_M0_M3_V1',
  recoveryProfileId: 'Q8_GAUSS_POINT_IN_PLANE_STRESS_RECOVERY_V1',
  loadIntegrationProfileId: 'Q8_QUADRATIC_EDGE_GAUSS_3_LOAD_INTEGRATION_V1',
  length: 200,
  supportDepth: 120,
  loadedEdgeDepth: 40,
  thickness: 6,
  distributedEndLoad: -10000,
  material: Object.freeze({ elasticModulus: 210000, poissonRatio: 0.3 }),
  procedureScope: 'TAPERED_BRACKET_GUSSET_MEMBRANE_SURROGATE',
  limitations: Object.freeze([
    'L_SHAPED_ARM_AND_SUPPORT_LEG_EXTENSION_DEFERRED',
    'TOE_AND_ROOT_FILLET_GEOMETRY_EXTENSION_DEFERRED',
    'WELD_THROAT_BEHAVIOR_NOT_MODELED',
    'OUT_OF_PLANE_BENDING_NOT_MODELED',
    'FLANGE_TORSION_NOT_MODELED',
    'ECCENTRIC_FASTENER_LOADING_NOT_MODELED',
    'PLATE_BUCKLING_NOT_MODELED',
    'THREE_DIMENSIONAL_THICKNESS_RESPONSE_NOT_MODELED',
  ]),
});

export function createBb07Procedure({ bb06Report, exactHeadSha }) {
  validateBb06Report(bb06Report);
  requireSha(exactHeadSha, 'exactHeadSha');
  if (bb06Report.exactHeadSha !== exactHeadSha) {
    throw new TypeError('BB-07 requires a BB-06 report from the same exact head.');
  }
  if (!bb06Report.bb07Authorized) {
    throw new TypeError('BB-06 did not authorize BB-07.');
  }
  const procedure = {
    schema: BB07_PROCEDURE_SCHEMA,
    exactHeadSha,
    bb06ReportHash: bb06Report.semanticHash,
    module: BB07_MODULE,
    levels: BB07_LEVELS,
    manufacturedFieldProfileId: 'BB07_AFFINE_PLANE_STRESS_FIELD_V1',
    beamReferenceProfileId: 'BB07_VARIABLE_DEPTH_TIMOSHENKO_BEAM_V1',
    sectionRecoveryProfileId: 'BB07_FIXED_X_GL8_SECTION_RESULTANTS_V1',
    applicationExecutionAuthorized: true,
    codeAssessmentAuthorized: false,
    moduleQualificationAuthorized: false,
    bb08Authorized: false,
  };
  return deepFreeze({ ...procedure, semanticHash: semanticHash(procedure) });
}

export function createBb07Evidence({ procedure, moduleEvidence }) {
  requireProcedure(procedure);
  requireModuleEvidence(moduleEvidence);
  const evidence = {
    schema: BB07_EVIDENCE_SCHEMA,
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

export function createBb07Report({ evidence, checkResults }) {
  if (evidence?.schema !== BB07_EVIDENCE_SCHEMA) {
    throw new TypeError('Registered BB-07 evidence is required.');
  }
  if (!Array.isArray(checkResults) || checkResults.some((row) => row?.status !== 'PASS')) {
    throw new TypeError('All BB-07 report checks must pass.');
  }
  const qualified = evidence.applicationProcedureQualified
    && evidence.numericalOutputQualified;
  const report = {
    schema: BB07_REPORT_SCHEMA,
    exactHeadSha: evidence.exactHeadSha,
    evidenceHash: evidence.semanticHash,
    status: qualified
      ? 'BB07_PROCEDURE_QUALIFIED'
      : 'BB07_PARTIAL_PROCEDURE_ONLY',
    checkCount: checkResults.length,
    checkResults,
    applicationProcedureQualified: qualified,
    numericalOutputQualified: qualified,
    codeAssessmentQualified: false,
    moduleQualified: false,
    bb08Authorized: qualified,
    applicationExecutionAuthorized: false,
    axisymmetricAuthorized: false,
    productionSwitchAuthorized: false,
  };
  return deepFreeze({ ...report, semanticHash: semanticHash(report) });
}

export function validateBb07Report(report) {
  if (report?.schema !== BB07_REPORT_SCHEMA) {
    throw new TypeError('Unsupported BB-07 report schema.');
  }
  requireSha(report.exactHeadSha, 'exactHeadSha');
  if (!Array.isArray(report.checkResults) || report.checkResults.length !== report.checkCount) {
    throw new TypeError('BB-07 report check count is inconsistent.');
  }
  if (report.checkResults.some((row) => row?.status !== 'PASS')) {
    throw new TypeError('BB-07 report contains a failing check.');
  }
  if (report.bb08Authorized !== (
    report.applicationProcedureQualified && report.numericalOutputQualified
  )) {
    throw new TypeError('BB-08 authorization does not match BB-07 qualification state.');
  }
  if (
    report.codeAssessmentQualified
    || report.moduleQualified
    || report.applicationExecutionAuthorized
    || report.axisymmetricAuthorized
    || report.productionSwitchAuthorized
  ) {
    throw new TypeError('BB-07 report crosses a retained authority boundary.');
  }
  const { semanticHash: retained, ...payload } = report;
  if (retained !== semanticHash(payload)) {
    throw new TypeError('BB-07 report semantic hash mismatch.');
  }
  return true;
}

function requireProcedure(value) {
  if (value?.schema !== BB07_PROCEDURE_SCHEMA) {
    throw new TypeError('Registered BB-07 procedure is required.');
  }
  const { semanticHash: retained, ...payload } = value;
  if (retained !== semanticHash(payload)) {
    throw new TypeError('BB-07 procedure semantic hash mismatch.');
  }
}

function requireModuleEvidence(value) {
  if (value?.moduleId !== BB07_MODULE.moduleId) {
    throw new TypeError('Unregistered BB-07 module evidence.');
  }
  if (!Array.isArray(value.levels) || value.levels.length !== BB07_LEVELS.length) {
    throw new TypeError('BB-07 module evidence requires M0 through M3.');
  }
  if (value.levels.some((row, index) => row?.levelId !== BB07_LEVELS[index].levelId)) {
    throw new TypeError('BB-07 mesh-level order is invalid.');
  }
  if (!value.manufacturedFieldQualified) {
    throw new TypeError('BB-07 manufactured-field verification did not pass.');
  }
  if (!value.applicationProcedureQualified || !value.numericalOutputQualified) {
    throw new TypeError('BB-07 module evidence is not qualified.');
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
