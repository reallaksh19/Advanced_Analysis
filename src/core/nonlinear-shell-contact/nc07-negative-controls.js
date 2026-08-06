import { createSyntheticCaseAssessmentContract, validateSyntheticCaseAssessmentContract } from './synthetic-case-assessment-contract.js';
export function runNc07NegativeControls() {
  const controls = [];
  const reject = (id, mutate) => { const value = structuredClone(createSyntheticCaseAssessmentContract()); delete value.syntheticCaseAssessmentContractHash; mutate(value); let passed=false; try{validateSyntheticCaseAssessmentContract(value);}catch{passed=true;} controls.push({id,passed}); };
  reject('REAL_ASSET_AUTHORITY', x=>{x.realAssetAssessmentAuthorized=true;});
  reject('AUTO_ACCEPT', x=>{x.automaticAcceptanceAuthorized=true;});
  reject('AUTONOMOUS', x=>{x.autonomousDispositionAuthorized=true;});
  reject('FFS', x=>{x.fitnessForServiceAuthorized=true;});
  reject('REMAINING_STRENGTH', x=>{x.remainingStrengthAuthorized=true;});
  reject('FAILURE_PRESSURE', x=>{x.failurePressureAuthorized=true;});
  reject('PRODUCTION', x=>{x.productionExecutionAuthorized=true;});
  reject('EXTERNAL_CODE', x=>{x.externalCodeComplianceAuthorized=true;});
  reject('NO_REVIEWER', x=>{x.minimumSimulatedReviewerCount=0;});
  reject('LOOSE_EQUATION', x=>{x.maximumEquationRelativeError=1e-4;});
  reject('LOOSE_UNIT', x=>{x.maximumUnitConversionRelativeError=1e-4;});
  reject('LOOSE_LEDGER', x=>{x.maximumLedgerRelativeDifference=1e-4;});
  reject('BAD_NATURE', x=>{x.caseNatureRequirement='REAL';});
  reject('BAD_REVIEW', x=>{x.reviewPolicy='HUMAN';});
  reject('BAD_DISPOSITION', x=>{x.dispositionPolicy='ACCEPTED';});
  reject('MISSING_DOMAIN', x=>{x.requiredDomains.pop();});
  reject('MISSING_SECTION', x=>{x.requiredReportSections.pop();});
  reject('SYNTH_DISABLED', x=>{x.syntheticCaseAssessmentAuthorized=false;});
  return controls;
}
