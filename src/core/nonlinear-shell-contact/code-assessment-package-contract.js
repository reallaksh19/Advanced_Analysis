import { deepFreeze, semanticHash, verifySealedHash } from './contracts.js';

export const REQUIRED_NC06_DOMAINS = Object.freeze([
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
export const REQUIRED_NC06_REPORT_SECTIONS = Object.freeze([
  'ASSESSMENT_BASIS','APPLICABILITY','SOURCE_RECEIPTS','INPUT_TRACEABILITY',
  'CALCULATION_LEDGER','UNCERTAINTY_AND_SENSITIVITY',
  'LIMITATIONS_AND_EXCLUSIONS','REVIEW_AND_DISPOSITION',
]);
const payload = {
  schema:'nonlinear-shell-contact-code-assessment-package/v2',
  analysisClass:'REGISTERED_LOCAL_DENT_OWNER_PROCEDURE_PACKAGE',
  upstreamDependency:'QUALIFIED_NC05_PLASTIC_DENTING_RECEIPT',
  basisPolicy:'TRANSPARENT_INTERNAL_OWNER_PROCEDURE_WITH_EXACT_SOURCE_HASH',
  approvalPolicy:'REPOSITORY_OWNER_EXACT_HEAD_MERGE',
  independentVerificationPolicy:'SEPARATE_ORACLE_IMPLEMENTATION_REQUIRED',
  sourceCustodyPolicy:'NO_LICENSED_SOURCE_TEXT_REQUIRED_OR_REDISTRIBUTED',
  applicabilityPolicy:'EXACT_QUALIFIED_NC05_CELL_ONLY_FAIL_CLOSED',
  unitPolicy:'SI_DERIVED_CANONICAL_WITH_EXPLICIT_CONVERSION_LEDGER',
  inputPolicy:'NO_UNMAPPED_INFERRED_OR_OUTPUT_FITTED_INPUTS',
  uncertaintyPolicy:'NON_BENEFICIAL_BOUND_AND_FINAL_OUTPUT_ONLY_ROUNDING',
  minimumReferenceCaseCount:3,
  minimumIndependentImplementationCount:1,
  minimumRejectionCaseCount:8,
  maximumEquationRelativeError:1e-12,
  maximumUnitConversionRelativeError:1e-12,
  maximumCellMappingRelativeError:1e-12,
  reproducibilityAbsolute:0,
  requiredDomains:[...REQUIRED_NC06_DOMAINS],
  requiredReportSections:[...REQUIRED_NC06_REPORT_SECTIONS],
  externalCodeComplianceAuthorized:false,
  codeAssessmentAuthorized:false,
  fitnessForServiceAuthorized:false,
  remainingStrengthAuthorized:false,
  failurePressureAuthorized:false,
  productionExecutionAuthorized:false,
  automaticAssetAcceptanceAuthorized:false,
  autonomousDispositionAuthorized:false,
};
export const DEFAULT_CODE_ASSESSMENT_PACKAGE = deepFreeze({
  ...payload,
  codeAssessmentPackageHash:semanticHash(payload),
});
export function validateCodeAssessmentPackageContract(value){
  if (!value || value.schema!==payload.schema || value.codeAssessmentPackageHash!==DEFAULT_CODE_ASSESSMENT_PACKAGE.codeAssessmentPackageHash) throw new TypeError('PACKAGE_CONTRACT_INVALID');
  verifySealedHash({...value},'codeAssessmentPackageHash');
  for(const key of ['externalCodeComplianceAuthorized','codeAssessmentAuthorized','fitnessForServiceAuthorized','remainingStrengthAuthorized','failurePressureAuthorized','productionExecutionAuthorized','automaticAssetAcceptanceAuthorized','autonomousDispositionAuthorized']) if(value[key]!==false) throw new TypeError(`${key}_OUTSIDE_AUTHORITY`);
  return true;
}
