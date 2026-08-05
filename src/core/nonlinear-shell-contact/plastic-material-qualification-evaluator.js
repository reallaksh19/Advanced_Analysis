import { HASH_PATTERN, assertArray, assertFiniteNumber, assertPlainData, assertString, deepFreeze, semanticHash } from './contracts.js';
import { REQUIRED_PLASTIC_MATERIAL_EVIDENCE, validatePlasticMaterialContract } from './plastic-material-contract.js';
const CUSTODY_FIELDS = Object.freeze(['solverVersion','solverSourceCommit','sourceArchiveHash','binaryHash','containerDigest','compiler','compilerFlags','linkedLibrariesHash','platform','threadCount']);

export function evaluatePlasticMaterialQualification({ contract, solverCustody = {}, materialEvidencePackage = null, benchmarkEvidence = [] }) {
  validatePlasticMaterialContract(contract); assertPlainData(solverCustody,'$solverCustody'); assertArray(benchmarkEvidence,'$benchmarkEvidence'); const blockers=[];
  for (const field of CUSTODY_FIELDS) { const value=solverCustody[field]; if (value===null||value===undefined||value===''||value==='UNRESOLVED') blockers.push(`SOLVER_CUSTODY_MISSING:${field}`); }
  try { validateMaterialEvidencePackage(materialEvidencePackage, contract); } catch (error) { blockers.push(`MATERIAL_EVIDENCE_PACKAGE_INVALID:${error.message}`); }
  const ids=new Set(); for (const evidence of benchmarkEvidence) { if (ids.has(evidence?.id)) blockers.push(`BENCHMARK_DUPLICATE_ID:${evidence?.id}`); ids.add(evidence?.id); }
  for (const id of REQUIRED_PLASTIC_MATERIAL_EVIDENCE) {
    const evidence=benchmarkEvidence.find((entry)=>entry?.id===id); if (!evidence) { blockers.push(`BENCHMARK_MISSING:${id}`); continue; }
    try { validatePlasticMaterialEvidence(evidence,contract); if (evidence.passed!==true) blockers.push(`BENCHMARK_FAILED:${id}`); } catch (error) { blockers.push(`BENCHMARK_INVALID:${id}:${error.message}`); }
  }
  const plasticMaterialQualified=blockers.length===0;
  const report={ schema:'nonlinear-shell-contact-nc04-report/v1', status:plasticMaterialQualified?'NC04_QUALIFIED':'NC04_BLOCKED', plasticMaterialContractHash:contract.plasticMaterialContractHash, maximumQualifiedEquivalentPlasticStrain:plasticMaterialQualified?materialEvidencePackage.maximumValidatedEquivalentPlasticStrain:null, blockers:[...blockers].sort(), authority:{ nc04ContractQualified:true, plasticMaterialQualified, plasticDentingProcedureQualified:false, codeAssessmentQualified:false, productionExecutionAuthorized:false } };
  return deepFreeze({...report,reportSemanticHash:semanticHash(report)});
}

export function validateMaterialEvidencePackage(value, contract) {
  assertPlainData(value,'$materialEvidencePackage'); if (!value) throw new TypeError('Material evidence package is required.');
  for (const field of ['datasetHash','testProcedureHash','specimenTraceabilityHash','curveHash']) if (!HASH_PATTERN.test(value[field]??'')) throw new TypeError(`${field} is required.`);
  if (value.approved!==true) throw new TypeError('Material evidence package must be approved.');
  assertPlainData(value.replicateCounts,'$materialEvidencePackage.replicateCounts');
  for (const orientation of contract.requiredOrientations) assertFiniteNumber(value.replicateCounts[orientation],`replicateCounts.${orientation}`,(n)=>Number.isInteger(n)&&n>=contract.minimumReplicatesPerOrientation,'adequate integer replicate count');
  assertFiniteNumber(value.maximumValidatedEquivalentPlasticStrain,'maximumValidatedEquivalentPlasticStrain',(n)=>n>0,'positive');
  assertFiniteNumber(value.uniformElongationEquivalentPlasticStrain,'uniformElongationEquivalentPlasticStrain',(n)=>n>0,'positive');
  if (value.maximumValidatedEquivalentPlasticStrain < value.uniformElongationEquivalentPlasticStrain) throw new TypeError('Maximum validated strain cannot be below uniform elongation strain.');
  if (typeof value.curveExtendsBeyondUniformElongation!=='boolean') throw new TypeError('Post-necking extent flag is required.');
  assertString(value.postNeckingMethod,'postNeckingMethod');
  const allowed=['NOT_USED_BEYOND_UNIFORM_ELONGATION','AREA_REDUCTION_MEASURED','INVERSE_CALIBRATED']; if (!allowed.includes(value.postNeckingMethod)) throw new TypeError('Unsupported post-necking method.');
  if (value.curveExtendsBeyondUniformElongation && value.postNeckingMethod==='NOT_USED_BEYOND_UNIFORM_ELONGATION') throw new TypeError('Post-necking data lacks authorized reconstruction.');
  assertFiniteNumber(value.replicateScatterBound,'replicateScatterBound',(n)=>n>=0&&n<=0.2,'bounded nonnegative ratio');
  assertFiniteNumber(value.orientationDifferenceBound,'orientationDifferenceBound',(n)=>n>=0&&n<=0.2,'bounded nonnegative ratio');
  return true;
}

function validatePlasticMaterialEvidence(evidence, contract) {
  assertPlainData(evidence,'$plasticMaterialEvidence'); if (!REQUIRED_PLASTIC_MATERIAL_EVIDENCE.includes(evidence.id)) throw new TypeError('Unknown plastic-material benchmark.');
  for (const field of ['referenceHash','rawEvidenceHash']) if (!HASH_PATTERN.test(evidence[field]??'')) throw new TypeError(`${field} is required.`);
  assertFiniteNumber(evidence.referenceUncertainty,'referenceUncertainty',(n)=>n>=0,'nonnegative'); assertFiniteNumber(evidence.acceptanceTolerance,'acceptanceTolerance',(n)=>n>0,'positive'); if (evidence.acceptanceTolerance<evidence.referenceUncertainty) throw new TypeError('Tolerance understates uncertainty.');
  assertFiniteNumber(evidence.observedError,'observedError',(n)=>n>=0,'nonnegative'); if (evidence.observedError>evidence.acceptanceTolerance) throw new TypeError('Observed error exceeds tolerance.');
  assertFiniteNumber(evidence.yieldSurfaceResidual,'yieldSurfaceResidual',(n)=>n>=0,'nonnegative'); if (evidence.yieldSurfaceResidual>contract.yieldSurfaceResidualLimit) throw new TypeError('Yield-surface residual exceeds limit.');
  assertFiniteNumber(evidence.returnMappingResidual,'returnMappingResidual',(n)=>n>=0,'nonnegative'); if (evidence.returnMappingResidual>contract.returnMappingResidualLimit) throw new TypeError('Return-mapping residual exceeds limit.');
  assertFiniteNumber(evidence.consistentTangentRelativeError,'consistentTangentRelativeError',(n)=>n>=0,'nonnegative'); if (evidence.consistentTangentRelativeError>contract.consistentTangentRelativeErrorLimit) throw new TypeError('Consistent tangent error exceeds limit.');
  assertFiniteNumber(evidence.minimumObservedPlasticDissipation,'minimumObservedPlasticDissipation'); if (evidence.minimumObservedPlasticDissipation<contract.minimumPlasticDissipation) throw new TypeError('Negative plastic dissipation observed.');
  if (typeof evidence.passed!=='boolean') throw new TypeError('Pass disposition is required.');
}
