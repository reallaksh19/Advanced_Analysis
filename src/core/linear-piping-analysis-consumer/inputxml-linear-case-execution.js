import {
  EXECUTION_RECORD_KEYS,
  compileSolverExecution,
  factorizationCacheFromRuntime,
  requireSolverExecution,
} from '../linear-fea-solver/index.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { compileInputXmlCaseElementAuthorities } from './inputxml-linear-case-elements.js';
import {
  INPUTXML_LINEAR_CASE_EXECUTION_SCHEMA,
  sealInputXmlLinearCaseExecution,
} from './inputxml-linear-case-execution-contract.js';
import {
  inputXmlLinearRuntimeAuthorities,
  requireInputXmlLinearSolveRuntime,
} from './inputxml-linear-solve-runtime.js';

export function solveInputXmlLinearPhysicalCase(runtimeValue, caseId) {
  const runtime = requireInputXmlLinearSolveRuntime(runtimeValue);
  if (!runtime.authorizedCaseIds.includes(caseId)) {
    throw new TypeError(`InputXML physical case ${caseId} is not authorized by this runtime.`);
  }
  const authorities = inputXmlLinearRuntimeAuthorities(runtime);
  const caseRecord = authorities.solvePreparation.physicalCases.find(
    (row) => row.caseId === caseId,
  );
  if (!caseRecord) throw new TypeError(`InputXML physical case ${caseId} is unavailable.`);
  const elements = compileInputXmlCaseElementAuthorities({
    structuralPreparation: authorities.solvePreparation.structuralPreparation,
    frameProfile: authorities.frameProfile,
    physicalCase: caseRecord.loadCase,
    stiffnessElementLedger: authorities.preflight.elementLedger,
  });
  const rawExecution = compileSolverExecution({
    compilation: authorities.solvePreparation.structuralPreparation.compilation,
    elementContributions: elements.elementContributions,
    loadCase: caseRecord.loadCase,
    solverProfile: authorities.solverProfile,
    cache: factorizationCacheFromRuntime(authorities.genericRuntime, {
      compilation: authorities.solvePreparation.structuralPreparation.compilation,
      solverProfile: authorities.solverProfile,
    }),
  });
  const execution = sealedExecutionRecord(rawExecution);
  if (execution.factorization.reused !== true) {
    throw new TypeError('InputXML case execution did not reuse the authorized runtime factorization.');
  }
  const limitations = uniqueAscii([
    ...authorities.solvePreparation.limitations,
    ...caseRecord.loadCase.limitations.map((row) => row.code),
  ]);
  const summary = Object.freeze({
    displacementEntryCount: execution.displacement.length,
    reactionEntryCount: execution.reactions.length,
    freeDofCount: execution.assembly.freeDofCount,
    constrainedDofCount: execution.assembly.constrainedDofCount,
    factorizationReused: execution.factorization.reused,
    factorizationKind: execution.factorization.kind,
    conditionEstimate: execution.factorization.conditionEstimate,
    residualStatus: execution.diagnostics.residual.status,
    forceEquilibriumStatus: execution.diagnostics.forceEquilibrium.status,
    momentEquilibriumStatus: execution.diagnostics.momentEquilibrium.status,
    energyBalanceStatus: execution.diagnostics.energyBalance.status,
    pressurePrimitiveCount: caseRecord.loadCase.primitives.filter(
      (row) => row.kind === 'PRESSURE',
    ).length,
    temperaturePrimitiveCount: caseRecord.loadCase.primitives.filter(
      (row) => row.kind === 'TEMPERATURE',
    ).length,
  });

  return sealInputXmlLinearCaseExecution({
    schema: INPUTXML_LINEAR_CASE_EXECUTION_SCHEMA,
    caseExecutionId: `IXEX-${semanticHash({
      runtime: runtime.runtimeHash,
      caseId,
      execution: execution.semanticHash,
    })}`,
    runtimeId: runtime.runtimeId,
    runtimeHash: runtime.runtimeHash,
    analysisProfileId: runtime.analysisProfileId,
    solvePreparationSemanticHash: runtime.solvePreparationSemanticHash,
    preflightSemanticHash: runtime.preflightSemanticHash,
    stiffnessAssessmentHash: runtime.stiffnessAssessmentHash,
    stiffnessRuntimeHash: runtime.stiffnessRuntimeHash,
    caseId,
    caseRole: caseRecord.caseRole,
    sourceSetIds: caseRecord.sourceSetIds,
    sourceFeatureIds: caseRecord.sourceFeatureIds,
    physicalLoadCaseHash: caseRecord.loadCase.physicalLoadCaseHash,
    execution,
    elementLedger: elements.elementLedger,
    limitations,
    summary,
    status: execution.status,
  });
}

export function solveInputXmlLinearPhysicalCases(runtime, caseIds) {
  const accepted = requireInputXmlLinearSolveRuntime(runtime);
  const selected = caseIds ?? accepted.authorizedCaseIds;
  if (!Array.isArray(selected) || selected.length === 0) {
    throw new TypeError('InputXML physical-case solve requires at least one case ID.');
  }
  const ids = new Set();
  const results = [];
  for (const caseId of selected) {
    if (ids.has(caseId)) throw new TypeError(`InputXML physical case ${caseId} is duplicated.`);
    ids.add(caseId);
    results.push(solveInputXmlLinearPhysicalCase(accepted, caseId));
  }
  return Object.freeze(results);
}

function sealedExecutionRecord(value) {
  const draft = Object.fromEntries(EXECUTION_RECORD_KEYS.map((key) => [key, value[key]]));
  return requireSolverExecution(draft);
}

function uniqueAscii(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort(compareAscii);
}

function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
