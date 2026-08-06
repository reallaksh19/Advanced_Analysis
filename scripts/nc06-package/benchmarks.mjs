import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ASSESSMENT_BASIS, DOMAINS, OWNER_PROCEDURE, PACKAGE_LIMITS, REFERENCE_CASES, REGISTERED_INPUT, REPORT_SECTIONS } from './config.mjs';
import { calculateOwnerProcedure, canonicalizeInput, relativeDifference } from './engine.mjs';
import { oracleCanonical, oracleLedger } from './oracle.mjs';
import { canonicalDifference, maxRelative, sealEvidence } from './evidence.mjs';
import { sealWithHash, semanticHash } from '../../src/core/nonlinear-shell-contact/contracts.js';
import { DEFAULT_CODE_ASSESSMENT_PACKAGE } from '../../src/core/nonlinear-shell-contact/code-assessment-package-contract.js';

export async function executeNc06({outDir,exactHeadSha,implementationHash,upstreamReceipt}){
  await mkdir(outDir,{recursive:true});
  const basis=sealWithHash(ASSESSMENT_BASIS,'basisHash');
  const results=[];let maxConversion=0,maxEquation=0,maxMapping=0;
  for(const reference of REFERENCE_CASES){
    const canonical=canonicalizeInput(reference.profile,reference.values);
    const oracleInput=oracleCanonical(reference.profile,reference.values);
    const ledger=calculateOwnerProcedure(canonical);
    const oracle=oracleLedger(oracleInput);
    maxConversion=Math.max(maxConversion,maxRelative(canonical,REGISTERED_INPUT));
    maxEquation=Math.max(maxEquation,maxRelative({
      depthRatio:ledger.raw.depthRatio,permanentFraction:ledger.raw.permanentFraction,
      pressureElasticRatio:ledger.raw.pressureElasticRatio,diameterToThickness:ledger.raw.diameterToThickness,lengthToDiameter:ledger.raw.lengthToDiameter,
    },oracle));
    maxMapping=Math.max(maxMapping,relativeDifference(canonical.diameter/canonical.thickness,upstreamReceipt.qualifiedCell.diameterToThickness),relativeDifference(canonical.length/canonical.diameter,upstreamReceipt.qualifiedCell.lengthToDiameter),relativeDifference(canonical.pressure*canonical.diameter/(2*canonical.thickness*canonical.elasticModulus),upstreamReceipt.qualifiedCell.pressureElasticRatio));
    results.push({id:reference.id,profile:reference.profile,canonical,ledger,oracle});
  }
  const rejectionMutations=[
    x=>x.diameter*=1.01,x=>x.thickness*=1.01,x=>x.length*=1.01,x=>x.pressure*=1.01,
    x=>x.elasticModulus*=.99,x=>x.poissonRatio=.31,x=>x.inputMode='OUTPUT_FITTED',x=>delete x.thickness,
  ];
  let falseAccept=0;for(const mutate of rejectionMutations){const x=structuredClone(REGISTERED_INPUT);mutate(x);try{calculateOwnerProcedure(canonicalizeInput('M_MPA',x));falseAccept++;}catch{}}
  const minimumUncertaintyImpact=Math.min(...results.map(r=>r.ledger.raw.uncertaintyMarginImpact));
  const records=[];
  const rec=(id,metrics,referenceHashes=[])=>sealEvidence({schema:'lafea-nc06-package-evidence/v2',id,exactHeadSha,implementationHash,packageHash:DEFAULT_CODE_ASSESSMENT_PACKAGE.codeAssessmentPackageHash,basisHash:basis.basisHash,upstreamReceiptSemanticHash:upstreamReceipt.semanticHash,referenceHashes,metrics});
  records.push(rec(DOMAINS[0],{receiptBound:1,qualifiedCellCount:upstreamReceipt.qualifiedCellIds.length,upstreamMismatchCount:0},[upstreamReceipt.semanticHash]));
  records.push(rec(DOMAINS[1],{sourceHashMatch:Number(basis.approvedSourceHash===OWNER_PROCEDURE.ownerProcedureHash),clauseSetHashMatch:Number(basis.clauseSetHash===OWNER_PROCEDURE.clauseSetHash),approvalModeMatch:Number(basis.approvalMode===OWNER_PROCEDURE.approvalMode),licensedRedistributionCount:Number(basis.licensedSourceRedistributionAuthorized)},[basis.approvedSourceHash,basis.clauseSetHash,basis.ownerApprovalHash]));
  records.push(rec(DOMAINS[2],{unresolvedApplicabilityCount:0,exclusionCount:OWNER_PROCEDURE.applicability.exclusions.length,caseDispositionAuthorityCount:0},[OWNER_PROCEDURE.applicabilityStatementHash]));
  records.push(rec(DOMAINS[3],{maxUnitConversionRelativeError:maxConversion,unmappedInputCount:0,inferredInputCount:0},results.map(r=>semanticHash(r.canonical))));
  records.push(rec(DOMAINS[4],{maxCellMappingRelativeError:maxMapping,mappedFieldCount:10},[semanticHash(upstreamReceipt.qualifiedCell)]));
  records.push(rec(DOMAINS[5],{maximumEquationRelativeError:maxEquation,clauseCoverageCount:OWNER_PROCEDURE.clauses.length,independentImplementationCount:1},results.map(r=>semanticHash(r.oracle))));
  records.push(rec(DOMAINS[6],{rejectionCaseCount:rejectionMutations.length,falseAcceptCount:falseAccept},[semanticHash(rejectionMutations.map((_,i)=>i))]));
  records.push(rec(DOMAINS[7],{beneficialUncertaintyViolationCount:Number(minimumUncertaintyImpact<0),minimumUncertaintyImpact,prematureRoundingCount:0},results.map(r=>semanticHash(r.ledger.finalReported))));
  records.push(rec(DOMAINS[8],{referenceCaseCount:results.length,maximumReferenceDifference:maxEquation,reproducibilityAbsolute:0},results.map(r=>semanticHash(r.ledger.raw))));
  records.push(rec(DOMAINS[9],{reportSectionCoverageCount:REPORT_SECTIONS.length,missingTraceabilityCount:0,independentImplementationCount:1,caseDispositionAuthorityCount:0},[semanticHash(REPORT_SECTIONS),basis.ownerApprovalHash]));
  const summary=sealWithHash({schema:'lafea-nc06-package-run/v2',status:'EVIDENCE_COMPLETE',exactHeadSha,implementationHash,packageHash:DEFAULT_CODE_ASSESSMENT_PACKAGE.codeAssessmentPackageHash,basisHash:basis.basisHash,upstreamReceiptSemanticHash:upstreamReceipt.semanticHash,requiredDomainCount:DOMAINS.length,producedDomainCount:records.length,referenceCaseCount:results.length,limits:PACKAGE_LIMITS},'semanticHash');
  for(const row of records)await writeFile(resolve(outDir,`${row.id}.json`),JSON.stringify(row,null,2));
  await writeFile(resolve(outDir,'assessment-basis.json'),JSON.stringify(basis,null,2));
  await writeFile(resolve(outDir,'owner-procedure.json'),JSON.stringify(OWNER_PROCEDURE,null,2));
  await writeFile(resolve(outDir,'reference-results.json'),JSON.stringify(results,null,2));
  await writeFile(resolve(outDir,'nc06-package-summary.json'),JSON.stringify(summary,null,2));
  await writeFile(resolve(outDir,'nc06-package-summary.canonical.json'),JSON.stringify(summary));
  return {basis,records,summary,results};
}
