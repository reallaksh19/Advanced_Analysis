import { semanticHash, sha256Bytes } from './contracts.js';
import { DEFAULT_ELASTIC_DENTING_PROCEDURE, REQUIRED_ELASTIC_DENTING_BENCHMARKS } from './elastic-denting-procedure-contract.js';
const hash = (value) => sha256Bytes(Buffer.from(value));
export const PASSING_CONTACT_RECEIPT = Object.freeze({ contactProcedureQualified: true, receiptHash: hash('qualified-contact-receipt') });
export const PASSING_NC03_SOLVER_CUSTODY = Object.freeze({ solverVersion:'PINNED_TEST_PROFILE', solverSourceCommit:'0000000000000000000000000000000000000001', sourceArchiveHash:hash('source'), binaryHash:hash('binary'), containerDigest:hash('container'), compiler:'PINNED_COMPILER', compilerFlags:'-O2', linkedLibrariesHash:hash('libraries'), platform:'linux-x86_64', threadCount:1 });
export function createPassingDimensionlessCells() {
  const bounds = { DOverT:[20,100], indenterWidthOverD:[0.02,0.2], indenterRadiusOverD:[0.01,0.15], lengthOverD:[4,12], pressureElasticRatio:[0,0.6], boundaryDistanceOverSqrtRt:[4,12] };
  return [{ id:'CELL-ELASTIC-001', cellHash:semanticHash({id:'CELL-ELASTIC-001',bounds}), boundsEvidenceHash:hash('cell-bounds-evidence'), validated:true, bounds }];
}
export function createPassingElasticDentingEvidence(cells = createPassingDimensionlessCells()) {
  return cells.flatMap((cell) => REQUIRED_ELASTIC_DENTING_BENCHMARKS.map((id,index)=>({
    id, cellId:cell.id, referenceHash:hash(`elastic-reference:${cell.id}:${id}`), rawEvidenceHash:hash(`elastic-raw:${cell.id}:${id}`),
    referenceUncertainty:0.002, acceptanceTolerance:0.02, observedDifference:0.004 + index*0.0001,
    elasticRecoveryResidualRatio:0.002, globalEquilibriumResidual:0.003, energyImbalance:0.004,
    boundarySensitivity:0.005, meshSensitivity:0.006, incrementSensitivity:0.005,
    boundarySweep:DEFAULT_ELASTIC_DENTING_PROCEDURE.boundaryExtensionScales.map((scale)=>({scale,value:1+0.01/scale})),
    meshSweep:DEFAULT_ELASTIC_DENTING_PROCEDURE.meshRefinementRatios.map((scale)=>({scale,value:1+0.005*scale})),
    incrementSweep:DEFAULT_ELASTIC_DENTING_PROCEDURE.incrementRefinementRatios.map((scale)=>({scale,value:1+0.004*scale})),
    passed:true,
  })));
}
export const NC03_CONTRACT_FIXTURES = Object.freeze([{id:'DEFAULT_ELASTIC_DENTING_CONTRACT',contract:DEFAULT_ELASTIC_DENTING_PROCEDURE},{id:'PASSING_ELASTIC_DENTING_EVIDENCE_SHAPE',contract:DEFAULT_ELASTIC_DENTING_PROCEDURE,cells:createPassingDimensionlessCells(),evidence:createPassingElasticDentingEvidence()}]);
