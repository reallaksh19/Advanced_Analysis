import { deepFreeze, semanticHash } from '../../src/core/nonlinear-shell-contact/contracts.js';

export const DOMAINS = Object.freeze([
  'NC06-PKG-01_UPSTREAM_RECEIPT_BINDING',
  'NC06-PKG-02_OWNER_PROCEDURE_CUSTODY',
  'NC06-PKG-03_APPLICABILITY_AND_EXCLUSIONS',
  'NC06-PKG-04_INPUT_AND_UNIT_MAPPING',
  'NC06-PKG-05_GEOMETRY_MATERIAL_PRESSURE_MAPPING',
  'NC06-PKG-06_EQUATION_REPRODUCTION',
  'NC06-PKG-07_DOMAIN_REJECTION',
  'NC06-PKG-08_UNCERTAINTY_AND_ROUNDING',
  'NC06-PKG-09_INDEPENDENT_REFERENCE_REPRODUCTION',
  'NC06-PKG-10_REVIEW_AND_REPORT_TRACEABILITY',
]);

export const REPORT_SECTIONS = Object.freeze([
  'ASSESSMENT_BASIS',
  'APPLICABILITY',
  'SOURCE_RECEIPTS',
  'INPUT_TRACEABILITY',
  'CALCULATION_LEDGER',
  'UNCERTAINTY_AND_SENSITIVITY',
  'LIMITATIONS_AND_EXCLUSIONS',
  'REVIEW_AND_DISPOSITION',
]);

const clauses = Object.freeze([
  { id: 'OP-01', expression: 'depthRatio = loadedDent / diameter' },
  { id: 'OP-02', expression: 'permanentFraction = residualDent / loadedDent' },
  { id: 'OP-03', expression: 'pressureElasticRatio = pressure * diameter / (2 * thickness * elasticModulus)' },
  { id: 'OP-04', expression: 'governingIndex = max(normalized registered metrics)' },
  { id: 'OP-05', expression: 'uncertainty uses non-beneficial bounds; rounding is final-output-only' },
]);
const applicability = Object.freeze({
  qualifiedCellId: 'NC05-CELL-DT40-LD2-PER0.04',
  exactDimensionlessCellOnly: true,
  externalCodeComplianceClaimed: false,
  assetDispositionClaimed: false,
  exclusions: [
    'collapse', 'failure-pressure', 'damage', 'fracture', 'fatigue',
    'external-code-compliance', 'fitness-for-service', 'remaining-strength',
    'production-execution', 'automatic-asset-acceptance', 'autonomous-disposition',
  ],
});
const ownerPayload = {
  schema: 'lafea-owner-procedure/v1',
  id: 'OP-LAFEA-LOCAL-DENT-PACKAGE-001',
  edition: '1',
  addenda: '0',
  jurisdiction: 'INTERNAL-ENGINEERING-GOVERNANCE',
  title: 'Registered local dent package traceability and deterministic screening ledger',
  clauses,
  applicability,
  canonicalUnitProfile: 'SI-DERIVED_LENGTH_M_STRESS_MPA',
  approvalMode: 'REPOSITORY_OWNER_EXACT_HEAD_MERGE',
  independentVerificationMode: 'SEPARATE_ORACLE_IMPLEMENTATION',
  licensedSourceRedistributionAuthorized: false,
};
export const OWNER_PROCEDURE = deepFreeze({
  ...ownerPayload,
  ownerProcedureHash: semanticHash(ownerPayload),
  clauseSetHash: semanticHash(clauses),
  applicabilityStatementHash: semanticHash(applicability),
});
const approvalPayload = {
  ownerProcedureHash: OWNER_PROCEDURE.ownerProcedureHash,
  approvalMode: OWNER_PROCEDURE.approvalMode,
  authorityBoundary: 'PACKAGE_ONLY_NO_CASE_DISPOSITION',
};
export const ASSESSMENT_BASIS = deepFreeze({
  schema: 'lafea-nc06-assessment-basis/v2',
  id: 'LAFEA-OP-DENT-001-REV0',
  standardId: OWNER_PROCEDURE.id,
  edition: OWNER_PROCEDURE.edition,
  addenda: OWNER_PROCEDURE.addenda,
  jurisdiction: OWNER_PROCEDURE.jurisdiction,
  clauseSetHash: OWNER_PROCEDURE.clauseSetHash,
  approvedSourceHash: OWNER_PROCEDURE.ownerProcedureHash,
  applicabilityStatementHash: OWNER_PROCEDURE.applicabilityStatementHash,
  unitProfile: OWNER_PROCEDURE.canonicalUnitProfile,
  ownerApprovalHash: semanticHash(approvalPayload),
  approvalMode: OWNER_PROCEDURE.approvalMode,
  independentVerificationMode: OWNER_PROCEDURE.independentVerificationMode,
  licensedSourceRedistributionAuthorized: false,
});

export const REGISTERED_INPUT = deepFreeze({
  diameter: 2,
  thickness: 0.05,
  length: 4,
  elasticModulus: 210000,
  poissonRatio: 0.3,
  pressure: 10,
  loadedDent: 0.0144227215,
  residualDent: 0.004102019,
  maxPeeq: 0.002097147,
  plasticPointFraction: 0.0763888888888889,
  inputMode: 'MEASURED_OR_QUALIFIED_SOURCE_ONLY',
});
export const UNCERTAINTY = deepFreeze({
  diameter: 0.001,
  thickness: 0.0001,
  length: 0.001,
  elasticModulus: 1000,
  pressure: 0.1,
  loadedDent: 0.0001,
  residualDent: 0.00005,
  maxPeeq: 0.00005,
  plasticPointFraction: 0.002,
});

const MPA_TO_KSI = 0.14503773773020923;
const M_TO_IN = 39.37007874015748;
export const REFERENCE_CASES = deepFreeze([
  { id: 'REF-SI', profile: 'M_MPA', values: { ...REGISTERED_INPUT } },
  { id: 'REF-MM', profile: 'MM_MPA', values: {
    ...REGISTERED_INPUT,
    diameter: REGISTERED_INPUT.diameter * 1000,
    thickness: REGISTERED_INPUT.thickness * 1000,
    length: REGISTERED_INPUT.length * 1000,
    loadedDent: REGISTERED_INPUT.loadedDent * 1000,
    residualDent: REGISTERED_INPUT.residualDent * 1000,
  } },
  { id: 'REF-IN-KSI', profile: 'IN_KSI', values: {
    ...REGISTERED_INPUT,
    diameter: REGISTERED_INPUT.diameter * M_TO_IN,
    thickness: REGISTERED_INPUT.thickness * M_TO_IN,
    length: REGISTERED_INPUT.length * M_TO_IN,
    loadedDent: REGISTERED_INPUT.loadedDent * M_TO_IN,
    residualDent: REGISTERED_INPUT.residualDent * M_TO_IN,
    elasticModulus: REGISTERED_INPUT.elasticModulus * MPA_TO_KSI,
    pressure: REGISTERED_INPUT.pressure * MPA_TO_KSI,
  } },
]);

export const PACKAGE_LIMITS = deepFreeze({
  maximumEquationRelativeError: 1e-12,
  maximumUnitConversionRelativeError: 1e-12,
  maximumCellMappingRelativeError: 1e-12,
  minimumReferenceCaseCount: 3,
  minimumIndependentImplementationCount: 1,
  minimumRejectionCaseCount: 8,
  reproducibilityAbsolute: 0,
});
