import { DEFAULT_SYNTHETIC_CASE_ASSESSMENT_CONTRACT, createSyntheticCaseAssessmentContract } from './synthetic-case-assessment-contract.js';
export const NC07_FIXTURES = Object.freeze([
  { id: 'DEFAULT', contract: DEFAULT_SYNTHETIC_CASE_ASSESSMENT_CONTRACT },
  { id: 'EXPLICIT', contract: createSyntheticCaseAssessmentContract({ maximumEquationRelativeError: 1e-12 }) },
]);
