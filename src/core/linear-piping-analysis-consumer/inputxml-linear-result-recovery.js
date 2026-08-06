import { compileResultRecovery, requireRecoveryProfile } from '../linear-fea-result-recovery/index.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { compileInputXmlCaseElementAuthorities } from './inputxml-linear-case-elements.js';
import { requireInputXmlLinearCaseExecution } from './inputxml-linear-case-execution-contract.js';
import {
  INPUTXML_LINEAR_RECOVERED_CASE_SCHEMA,
  requireInputXmlLinearRecoveredCase,
  sealInputXmlLinearRecoveredCase,
} from './inputxml-linear-recovered-case-contract.js';
import {
  buildInputXmlPressureCustody,
  buildInputXmlRecoveredElementResults,
  buildInputXmlSourceStations,
  buildInputXmlUnrepresentedSources,
  requireInputXmlCaseElementCustody,
  uniqueAscii,
} from './inputxml-linear-recovery-custody.js';
import { inputXmlRecoveryFailure as fail } from './inputxml-linear-recovery-error.js';
import { inputXmlLinearRecoveryProfile } from './inputxml-linear-recovery-profile.js';
import {
  inputXmlLinearRuntimeAuthorities,
  requireInputXmlLinearSolveRuntime,
} from './inputxml-linear-solve-runtime.js';

export const INPUTXML_LINEAR_SOURCE_MAPPING_POLICY_ID =
  'INPUTXML-SOURCE-END-SIDE-CUSTODY-R1';

const MAPPING_POLICY_HASH = semanticHash({
  policyId: INPUTXML_LINEAR_SOURCE_MAPPING_POLICY_ID,
  startEnd: 'I', startSide: 'RIGHT', endEnd: 'J', endSide: 'LEFT',
  startInternalAction: 'NEGATE_I_JOINT_ON_ELEMENT',
  endInternalAction: 'USE_J_JOINT_ON_ELEMENT',
  coincidentStations: 'PRESERVE_BY_SEGMENT_END_AND_SIDE',
});

export function recoverInputXmlLinearCaseResult(runtimeValue, executionValue, options) {
  const runtime = requireInputXmlLinearSolveRuntime(runtimeValue);
  const execution = requireInputXmlLinearCaseExecution(executionValue, runtime);
  const authorities = inputXmlLinearRuntimeAuthorities(runtime);
  const solve = authorities.solvePreparation;
  const structural = solve.structuralPreparation;
  const caseRecord = solve.physicalCases.find((row) => row.caseId === execution.caseId);
  if (!caseRecord) fail(
    `InputXML physical case ${execution.caseId} is unavailable for recovery.`,
    'INPUTXML_RECOVERY_CASE_UNAVAILABLE',
  );
  if (!runtime.authorizedCaseIds.includes(execution.caseId)) fail(
    `InputXML physical case ${execution.caseId} is not authorized for recovery.`,
    'INPUTXML_RECOVERY_CASE_UNAUTHORIZED',
  );
  if (execution.status === 'BLOCKED') fail(
    `InputXML physical case ${execution.caseId} is blocked.`,
    'INPUTXML_RECOVERY_EXECUTION_BLOCKED',
  );

  const profile = options?.recoveryProfile
    ? requireRecoveryProfile(options.recoveryProfile)
    : inputXmlLinearRecoveryProfile();
  const elements = compileInputXmlCaseElementAuthorities({
    structuralPreparation: structural,
    frameProfile: authorities.frameProfile,
    physicalCase: caseRecord.loadCase,
    stiffnessElementLedger: authorities.preflight.elementLedger,
  });
  requireInputXmlCaseElementCustody(elements.elementLedger, execution.elementLedger);
  const genericRecovery = compileResultRecovery({
    compilation: structural.compilation,
    execution: execution.execution,
    loadCase: caseRecord.loadCase,
    frameElements: elements.frameElements,
    recoveryProfile: profile,
  });
  const elementResults = buildInputXmlRecoveredElementResults({
    structural, execution, frameElements: elements.frameElements, genericRecovery,
  });
  const sourceStations = buildInputXmlSourceStations(elementResults);
  const pressureCustody = buildInputXmlPressureCustody(caseRecord.loadCase);
  const unrepresentedSources = buildInputXmlUnrepresentedSources(solve.loadLedger);
  const limitations = uniqueAscii([
    ...solve.limitations,
    ...execution.limitations,
    ...structural.componentBindings.map((row) => row.limitationCode),
  ].filter(Boolean));
  const diagnostics = recoveryDiagnostics(
    execution, genericRecovery, elementResults, sourceStations,
    pressureCustody, unrepresentedSources,
  );
  const identities = identityRecords({
    runtime, execution, authorities, solve, structural, caseRecord,
    profile, genericRecovery,
  });
  const recoveredCaseId = `IXRC-${semanticHash({
    runtimeHash: runtime.runtimeHash,
    caseExecutionSemanticHash: execution.semanticHash,
    recoveryProfileSemanticHash: profile.semanticHash,
    mappingPolicySemanticHash: MAPPING_POLICY_HASH,
  })}`;

  return sealInputXmlLinearRecoveredCase({
    schema: INPUTXML_LINEAR_RECOVERED_CASE_SCHEMA,
    recoveredCaseId,
    analysisProfileId: runtime.analysisProfileId,
    ...identities,
    displacements: execution.execution.displacement.map((row) => ({ ...row })),
    reactions: execution.execution.reactions.map((row) => ({ ...row })),
    elementResults,
    sourceStations,
    unrepresentedSources,
    pressureCustody,
    limitations,
    diagnostics,
    status: execution.status,
    semanticHash: '',
    evidenceHash: '',
  });
}

export function recoverInputXmlLinearCaseResults(runtimeValue, executionValues, options) {
  const runtime = requireInputXmlLinearSolveRuntime(runtimeValue);
  if (!Array.isArray(executionValues) || executionValues.length === 0) fail(
    'InputXML batch recovery requires at least one case execution.',
    'INPUTXML_RECOVERY_BATCH_INVALID',
  );
  const seen = new Set();
  return Object.freeze(executionValues.map((execution) => {
    const accepted = requireInputXmlLinearCaseExecution(execution, runtime);
    if (seen.has(accepted.caseId)) fail(
      `InputXML batch recovery duplicates case ${accepted.caseId}.`,
      'INPUTXML_RECOVERY_CASE_DUPLICATE',
    );
    seen.add(accepted.caseId);
    return recoverInputXmlLinearCaseResult(runtime, accepted, options);
  }));
}

function identityRecords(request) {
  const { runtime, execution, authorities, solve, structural, caseRecord,
    profile, genericRecovery } = request;
  return {
    sourceIdentity: {
      sourceBundleSemanticHash: solve.sourceBundleSemanticHash,
      sourceBundleEvidenceHash: solve.sourceBundleEvidenceHash,
      modelHealthSemanticHash: solve.modelHealthSemanticHash,
      modelHealthEvidenceHash: solve.modelHealthEvidenceHash,
      topologySemanticHash: structural.topologySemanticHash,
      topologyEvidenceHash: structural.topologyEvidenceHash,
      unitNormalizationSemanticHash: structural.unitNormalizationSemanticHash,
      unitNormalizationEvidenceHash: structural.unitNormalizationEvidenceHash,
      structuralPreparationSemanticHash: solve.structuralPreparationSemanticHash,
      structuralPreparationEvidenceHash: solve.structuralPreparationEvidenceHash,
      solvePreparationSemanticHash: solve.semanticHash,
      solvePreparationEvidenceHash: solve.evidenceHash,
      loadCaseProfileSemanticHash: solve.loadCaseProfileSemanticHash,
    },
    stiffnessIdentity: {
      mechanicalModelSemanticHash: execution.execution.mechanicalModelSemanticHash,
      stiffnessStateHash: execution.execution.stiffnessStateHash,
      stiffnessAssessmentHash: authorities.preflight.stiffnessAssessmentHash,
      preflightSemanticHash: authorities.preflight.semanticHash,
      preflightEvidenceHash: authorities.preflight.evidenceHash,
      genericPreflightSemanticHash: authorities.preflight.genericPreflightSemanticHash,
      genericPreflightEvidenceHash: authorities.preflight.genericPreflightEvidenceHash,
      frameElementProfileSemanticHash: runtime.frameElementProfileSemanticHash,
      solverProfileSemanticHash: runtime.solverProfileSemanticHash,
      stiffnessRuntimeHash: runtime.stiffnessRuntimeHash,
      partitionHash: runtime.partitionHash,
      elementLedgerHash: semanticHash(execution.elementLedger),
    },
    runtimeIdentity: {
      runtimeId: runtime.runtimeId,
      runtimeHash: runtime.runtimeHash,
      authorizationMode: runtime.authorizationMode,
      authorizedCaseSetHash: semanticHash(runtime.authorizedCaseIds),
    },
    caseIdentity: {
      caseId: execution.caseId,
      caseRole: execution.caseRole,
      sourceSetIds: [...execution.sourceSetIds],
      sourceFeatureIds: [...execution.sourceFeatureIds],
      physicalLoadCaseHash: execution.physicalLoadCaseHash,
      physicalLoadCaseSemanticHash: caseRecord.loadCase.semanticHash,
      physicalLoadCaseEvidenceHash: caseRecord.loadCase.evidenceHash,
      primitiveLedgerHash: semanticHash(caseRecord.loadCase.primitives.map((primitive) => ({
        primitiveId: primitive.primitiveId,
        kind: primitive.kind,
        semanticHash: primitive.semanticHash,
      }))),
    },
    executionIdentity: {
      caseExecutionId: execution.caseExecutionId,
      caseExecutionSemanticHash: execution.semanticHash,
      caseExecutionEvidenceHash: execution.evidenceHash,
      solverExecutionHash: execution.execution.executionHash,
      solverExecutionSemanticHash: execution.execution.semanticHash,
      solverExecutionEvidenceHash: execution.execution.evidenceHash,
    },
    recoveryIdentity: {
      recoveryProfileSemanticHash: profile.semanticHash,
      mappingPolicyId: INPUTXML_LINEAR_SOURCE_MAPPING_POLICY_ID,
      mappingPolicySemanticHash: MAPPING_POLICY_HASH,
      genericRecoverySemanticHash: genericRecovery.semanticHash,
      genericRecoveryEvidenceHash: genericRecovery.evidenceHash,
    },
  };
}

function recoveryDiagnostics(execution, genericRecovery, elements, stations, pressure, missing) {
  return {
    solver: execution.execution.diagnostics,
    genericRecovery: {
      elementActionCount: genericRecovery.elementActions.length,
      forceFieldCount: genericRecovery.forceFields.length,
      componentResultantCount: genericRecovery.componentResultants.length,
      executionStatus: genericRecovery.executionStatus,
    },
    custody: {
      caseElementLedgerMatched: true,
      recoveredElementCount: elements.length,
      sourceStationCount: stations.length,
      pressurePrimitiveCount: pressure.length,
      unrepresentedSourceCount: missing.length,
      pressureStructuralIsolation: pressure.every((row) => row.structuralEffect === 'NONE'),
      equationChanges: [],
    },
  };
}

export { requireInputXmlLinearRecoveredCase };
