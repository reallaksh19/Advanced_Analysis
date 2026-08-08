import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { calculatePreproductionThermalLiftoffActiveSet } from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-active-set.js';
import {
  PREPRODUCTION_TL05_REFERENCE_METHOD,
  computePreproductionThermalLiftoffCorrelationProblemSemanticHash,
  createPreproductionThermalLiftoffCorrelationAcceptance,
  createPreproductionThermalLiftoffCorrelationReference,
} from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-correlation-authority.js';
import {
  assessPreproductionThermalLiftoffCorrelationCurrentness,
  correlatePreproductionThermalLiftoffBenchmarkProgramme,
  requirePreproductionThermalLiftoffCorrelation,
} from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-correlation.js';
import { solveIndependentTlBComplementarityReference } from './preproduction-thermal-liftoff-correlation-reference-oracle.mjs';

const H = (label) => semanticHash({ label });
const IDS = ['SITE-A','SITE-B','SITE-C','SITE-D'];
const X = [0,1000,2000,3000];
const C = [[.001,-.0004,0,0],[-.0004,.001,-.0004,0],[0,-.0004,.001,-.0004],[0,0,-.0004,.001]];
const CASES = [
  ['DOUBLE_LIFTOFF',[-.05,.12,.12,-.05],['SITE-A','SITE-D']],
  ['NO_LIFTOFF_COUPLED',[-.02,-.01,-.01,-.02],IDS],
  ['RELEASE_RECONTACT',[-.15,.1,.1,-.1],['SITE-A','SITE-B','SITE-D']],
  ['SINGLE_LIFTOFF',[-.05,-.02,.12,-.05],['SITE-A','SITE-B','SITE-D']],
  ['ZERO_MOVEMENT_COLD_PARITY',[0,0,0,0],IDS],
];
const acceptance = createPreproductionThermalLiftoffCorrelationAcceptance({
  acceptanceId:'TL05-ACCEPTANCE-V1', requiredBenchmarkCaseIds:CASES.map((x)=>x[0]),
  reactionAbsoluteToleranceN:1e-8, gapAbsoluteToleranceM:1e-12,
  source:source('TL05-ACCEPTANCE-SOURCE','BENCHMARK_QUALIFIED'), benchmarkReference:benchmark('TL05-PROGRAMME'), qualification:'QUALIFIED',
});

const programmeCases=[];
for (const [caseId,movement,expectedActive] of CASES) {
  const intake = makeIntake(caseId,movement,10);
  // INDEPENDENT_REFERENCE_GENERATED_BEFORE_CANDIDATE
  const oracle = solveIndependentTlBComplementarityReference(intake);
  assert(oracle.referenceMethod===PREPRODUCTION_TL05_REFERENCE_METHOD,'reference method');
  assert(oracle.enumeratedStateCount===15 && oracle.admissibleStateCount===1,`${caseId} unique exhaustive state`);
  assert(oracle.problemSemanticHash===computePreproductionThermalLiftoffCorrelationProblemSemanticHash(intake),`${caseId} problem hash parity`);
  const reference = makeReference(caseId,intake,oracle);
  const candidate = calculatePreproductionThermalLiftoffActiveSet({executionId:`TL04-CANDIDATE-${caseId}`,executedAt:'2026-08-08T12:45:00.000Z',intake});
  assert(candidate.status==='CONVERGED_PREPRODUCTION_SCREEN',`${caseId} candidate converged`);
  assert(JSON.stringify(candidate.finalActiveSupportSiteIds)===JSON.stringify(expectedActive),`${caseId} active set`);
  assert(candidate.policy.productionFinalReactionCalculated===false && candidate.policy.finalHotReactionPublicationPermitted===false,`${caseId} remains preproduction`);
  programmeCases.push({intake,candidate,reference});
}

const result=correlatePreproductionThermalLiftoffBenchmarkProgramme({programmeId:'TL05-CONTROLLED-PROGRAMME',executedAt:'2026-08-08T12:46:00.000Z',cases:programmeCases,acceptance});
assert(result.status==='QUALIFIED_PREPRODUCTION_CORRELATION','programme qualifies');
assert(result.summary.benchmarkCaseCount===5 && result.summary.passCaseCount===5 && result.summary.failCaseCount===0,'five-case complete pass');
assert(result.summary.stateMismatchCount===0,'all states match');
assert(result.summary.maxReactionAbsoluteDeviationN<=acceptance.reactionAbsoluteToleranceN,'reaction tolerance');
assert(result.summary.maxGapAbsoluteDeviationM<=acceptance.gapAbsoluteToleranceM,'gap tolerance');
const rr=result.caseResults.find((x)=>x.benchmarkCaseId==='RELEASE_RECONTACT');
const rrCandidate=programmeCases.find((x)=>x.reference.benchmarkCaseId==='RELEASE_RECONTACT').candidate;
assert(rr.status==='PASS','release/recontact case passes');
assert(rrCandidate.summary.releaseEventCount===2 && rrCandidate.summary.recontactEventCount===1,'release/recontact retained');
assert(result.policy.generalAccuracyClaimPermitted===false && result.policy.tl06ProductionIntegrationAutomaticallyPermitted===false,'no general accuracy/TL06 auto promotion');

let incompleteRejected=false;
try { correlatePreproductionThermalLiftoffBenchmarkProgramme({programmeId:'INCOMPLETE',executedAt:'2026-08-08T12:47:00.000Z',cases:programmeCases.slice(1),acceptance}); }
catch(e){ incompleteRejected=e?.code==='PREPRODUCTION_TL05_REQUIRED_CASE_COVERAGE_MISMATCH'; }
assert(incompleteRejected,'incomplete programme rejected');

const wrongProblemOracle=solveIndependentTlBComplementarityReference(programmeCases[0].intake);
wrongProblemOracle.problemSemanticHash=H('WRONG-PROBLEM');
const wrongProblemReference=makeReference(programmeCases[0].reference.benchmarkCaseId,programmeCases[0].intake,wrongProblemOracle);
const wrongProblemCases=[{...programmeCases[0],reference:wrongProblemReference},...programmeCases.slice(1)];
const wrongProblemResult=correlatePreproductionThermalLiftoffBenchmarkProgramme({programmeId:'WRONG-PROBLEM',executedAt:'2026-08-08T12:48:00.000Z',cases:wrongProblemCases,acceptance});
assert(wrongProblemResult.status==='CORRELATION_FAILED','problem mismatch fails correlation');

const driftOracle=solveIndependentTlBComplementarityReference(programmeCases[0].intake);
driftOracle.supportResults=structuredClone(driftOracle.supportResults); driftOracle.supportResults[0].referenceTotalReactionN+=0.01;
const driftReference=makeReference(programmeCases[0].reference.benchmarkCaseId,programmeCases[0].intake,driftOracle);
const driftResult=correlatePreproductionThermalLiftoffBenchmarkProgramme({programmeId:'DRIFT',executedAt:'2026-08-08T12:49:00.000Z',cases:[{...programmeCases[0],reference:driftReference},...programmeCases.slice(1)],acceptance});
assert(driftResult.status==='CORRELATION_FAILED','reference numerical drift fails');

let nonIndependentRejected=false;
try {
  createPreproductionThermalLiftoffCorrelationReference({
    referenceId:'BAD-REFERENCE',benchmarkCaseId:'DOUBLE_LIFTOFF',benchmarkReference:benchmark('BAD'),source:source('BAD','BENCHMARK_QUALIFIED'),
    candidateIntakeSemanticHash:programmeCases[0].intake.semanticHash,problemSemanticHash:computePreproductionThermalLiftoffCorrelationProblemSemanticHash(programmeCases[0].intake),
    applicabilityClass:programmeCases[0].intake.applicabilityClass,datasetId:programmeCases[0].intake.datasetId,loadCaseId:programmeCases[0].intake.loadCaseId,
    referenceMethod:PREPRODUCTION_TL05_REFERENCE_METHOD,supportOrdering:IDS,supportResults:solveIndependentTlBComplementarityReference(programmeCases[0].intake).supportResults,
    enumeratedStateCount:15,admissibleStateCount:1,qualification:'QUALIFIED',
  });
} catch (e) { nonIndependentRejected=e?.code==='PREPRODUCTION_TL05_REFERENCE_SOURCE_INVALID'; }
assert(nonIndependentRejected,'non-independent reference fails closed');

const oneIterationIntake=makeIntake('RELEASE_RECONTACT_ONE_ITER',[-.15,.1,.1,-.1],1);
const oneIteration=calculatePreproductionThermalLiftoffActiveSet({executionId:'ONE-ITER',executedAt:'2026-08-08T12:50:00.000Z',intake:oneIterationIntake});
assert(oneIteration.status==='BLOCKED_NONCONVERGENT' && oneIteration.supportResults.length===0,'blocked candidate no final set');

const changed=makeCase('DOUBLE_LIFTOFF',[-.05,.121,.12,-.05],10);
const currentness=assessPreproductionThermalLiftoffCorrelationCurrentness(result,{cases:[changed,...programmeCases.slice(1)],acceptance});
assert(currentness.status==='STALE_RECORRELATION_REQUIRED','authority change makes correlation stale');

const tampered=structuredClone(result); tampered.caseResults[0].supportComparisons[0].reactionAbsoluteDeviationN=1;
rehash(tampered.caseResults[0].supportComparisons[0]); rehash(tampered.caseResults[0]); rehash(tampered);
let tamperRejected=false; try{requirePreproductionThermalLiftoffCorrelation(tampered);}catch(e){tamperRejected=e?.code==='PREPRODUCTION_TL05_COMPARISON_ARITHMETIC_MISMATCH';}
assert(tamperRejected,'self-rehashed arithmetic tamper rejected');

console.log(JSON.stringify({
  check:'preproduction-thermal-liftoff-controlled-correlation',status:'PASS',correlationSchema:result.schema,correlationClass:result.correlationClass,
  benchmarkCaseCount:result.summary.benchmarkCaseCount,passCaseCount:result.summary.passCaseCount,stateMismatchCount:result.summary.stateMismatchCount,
  maxReactionAbsoluteDeviationN:result.summary.maxReactionAbsoluteDeviationN,maxGapAbsoluteDeviationM:result.summary.maxGapAbsoluteDeviationM,
  referenceMethod:programmeCases[0].reference.referenceMethod,enumeratedStatesPerCase:15,uniqueReferenceStateEveryCase:true,
  releaseRecontactCandidateIterations:rrCandidate.summary.iterationCount,releaseEvents:rrCandidate.summary.releaseEventCount,recontactEvents:rrCandidate.summary.recontactEventCount,
  incompleteProgrammeFailsClosed:incompleteRejected,problemBindingMismatchFails:wrongProblemResult.status==='CORRELATION_FAILED',referenceDriftFails:driftResult.status==='CORRELATION_FAILED',
  nonIndependentReferenceFailsClosed:nonIndependentRejected,nonconvergentCandidatePublishesNoFinalSet:oneIteration.supportResults.length===0,
  currentnessDetectsAuthorityChange:currentness.status==='STALE_RECORRELATION_REQUIRED',arithmeticTamperFailsClosed:tamperRejected,
  generalAccuracyClaimPermitted:result.policy.generalAccuracyClaimPermitted,tl06ProductionIntegrationAutomaticallyPermitted:result.policy.tl06ProductionIntegrationAutomaticallyPermitted,
  qualificationFixtureOnly:true,
},null,2));

function makeCase(caseId,movement,maxIterations){const intake=makeIntake(caseId,movement,maxIterations);const oracle=solveIndependentTlBComplementarityReference(intake);const reference=makeReference(caseId,intake,oracle);const candidate=calculatePreproductionThermalLiftoffActiveSet({executionId:`CAND-${caseId}`,executedAt:'2026-08-08T12:51:00.000Z',intake});return {intake,candidate,reference};}
function makeReference(caseId,intake,oracle){return createPreproductionThermalLiftoffCorrelationReference({referenceId:`REF-${caseId}`,benchmarkCaseId:caseId,benchmarkReference:benchmark(`BENCH-${caseId}`),source:source(`ORACLE-${caseId}`,'INDEPENDENT_QUALIFICATION_ORACLE'),candidateIntakeSemanticHash:intake.semanticHash,problemSemanticHash:oracle.problemSemanticHash,applicabilityClass:intake.applicabilityClass,datasetId:intake.datasetId,loadCaseId:intake.loadCaseId,referenceMethod:oracle.referenceMethod,supportOrdering:IDS,supportResults:oracle.supportResults,enumeratedStateCount:oracle.enumeratedStateCount,admissibleStateCount:oracle.admissibleStateCount,qualification:'QUALIFIED'});}
function makeIntake(caseId,movement,maxIterations){
  const cold=[50,100,100,50]; const classifications=caseId.includes('ZERO')||caseId.includes('NO_LIFTOFF')?IDS.map(()=> 'CONTACT_RETAINED_CANDIDATE'):IDS.map((id,i)=>movement[i]>.05?'LIFTOFF_CANDIDATE':'CONTACT_RETAINED_CANDIDATE');
  const supports=IDS.map((id,i)=>freezeHash({supportKey:`SUP-${id}`,supportSiteId:id,routeId:'ROUTE-TL05',routeChainageMm:X[i],coldGravityReactionN:cold[i],coldGapM:0,usedUpwardRelativeDisplacementM:movement[i],freeOpeningM:movement[i],tl03Classification:classifications[i],contactRowSemanticHash:H(`CONTACT-${id}`),prerequisiteRowSemanticHash:H(`PREREQ-${id}-${caseId}`),tl03SupportScreenSemanticHash:H(`TL03-${id}-${caseId}`),displacementSemanticHash:H(`DISP-${id}-${movement[i]}`)}));
  const gravityContributions=[[500,100],[1500,100],[2500,100]].map(([chainageMm,verticalForceN],i)=>freezeHash({contributionId:`P-${i+1}`,routeId:'ROUTE-TL05',verticalForceN,chainageMm,sourceContributionSemanticHash:H(`P-${i+1}`)}));
  const material={schema:'engineering-preproduction-thermal-liftoff-active-set-intake/v1',method:'THERMAL_LIFTOFF_ACTIVE_SET_V1',applicabilityClass:'TL-B_REDUCED_FLEXIBILITY_SINGLE_ROUTE_V1',datasetId:'DATASET-TL05-CORRELATION',loadCaseId:'OPE',coldGravityMethod:'CHAINAGE_TRIBUTARY_SPAN_V2',routeId:'ROUTE-TL05',reactionToleranceN:1e-6,sourceBindings:{coldGravityExecutionSemanticHash:H('COLD-EXEC'),coldGravityDistributionSemanticHash:H('COLD-DIST'),contactAuthoritySemanticHash:H('CONTACT'),prerequisiteAuthoritySemanticHash:H(`PREREQ-${caseId}`),localScreenSemanticHash:H(`TL03-${caseId}`),flexibilityEvidenceSemanticHash:H('FLEX'),numericalAuthoritySemanticHash:H(`NUM-${maxIterations}`)},status:'READY_FOR_TL04_ACTIVE_SET',ordering:IDS,supports,gravityContributions,flexibilityMatrixMPerN:C.map((r)=>[...r]),numericalControls:{gapToleranceM:1e-9,complementarityToleranceNM:1e-7,gravityParityToleranceN:1e-9,forceToleranceN:1e-8,momentToleranceNmm:1e-5,matrixPivotToleranceMPerN:1e-12,maxIterations},blockers:[],summary:{supportCount:4,contributionCount:3,tl03LiftoffCandidateCount:classifications.filter((x)=>x==='LIFTOFF_CANDIDATE').length,blockerCount:0},policy:{productionCalculationConsumptionEnabled:false,productionMethodRegistrationPermitted:false,defaultUiExposurePermitted:false,gravitySourceRecalculationPermitted:false,gravityContributionRebracketingPermitted:true,coupledFlexibilitySolvePermitted:true,stiffnessSubmatrixReductionPermitted:false,activeSetExecutionPermitted:true,recontactEvaluationPermitted:true,negativeReactionClampingPermitted:false,springMechanicsExecuted:false,frictionMechanicsExecuted:false,finalHotReactionPublicationPermitted:false}};
  return freezeHash(material);
}
function freezeHash(material){return Object.freeze({...material,semanticHash:semanticHash(material)});} function rehash(value){delete value.semanticHash;value.semanticHash=semanticHash(value);} function source(id,kind){return {sourceId:id,sourceRevision:'1',sourceSemanticHash:H(id),sourceKind:kind};} function benchmark(id){return {benchmarkId:id,benchmarkRevision:'1',benchmarkSemanticHash:H(id)};} function assert(c,m){if(!c)throw new Error(m);}
