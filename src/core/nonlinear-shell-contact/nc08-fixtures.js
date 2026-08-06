import { DEFAULT_SYNTHETIC_REFERENCE_MODULE_CONTRACT, createSyntheticReferenceModuleContract } from './synthetic-reference-module-contract.js';
export const NC08_FIXTURES = Object.freeze([
  { id: 'DEFAULT', contract: DEFAULT_SYNTHETIC_REFERENCE_MODULE_CONTRACT },
  { id: 'EXPLICIT', contract: createSyntheticReferenceModuleContract({ maximumReferenceRelativeDifference: 1e-12 }) },
]);
