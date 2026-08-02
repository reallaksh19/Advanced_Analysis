import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';

export class CommonEnrichedPropertiesError extends SharedAnalysisContractError {
  constructor(message, code, evidence = null) {
    super(message, code);
    this.name = 'CommonEnrichedPropertiesError';
    this.evidence = evidence;
  }
}

export function failCommonEnrichment(message, code, evidence = null) {
  throw new CommonEnrichedPropertiesError(message, code, evidence);
}
