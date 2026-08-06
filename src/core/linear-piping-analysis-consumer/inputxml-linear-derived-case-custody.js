import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { inputXmlDerivedCaseFailure as fail } from './inputxml-linear-derived-case-error.js';
import { uniqueAscii } from './inputxml-linear-recovery-custody.js';

export function requireCompatibleRecoveredCases(recovered) {
  const identities = recovered.map(compatibilityProjection);
  const expected = semanticHash(identities[0]);
  if (identities.some((identity) => semanticHash(identity) !== expected)) fail(
    'Recovered cases do not share one qualified model, stiffness, runtime, and recovery context.',
    'INPUTXML_DERIVED_CONTEXT_INCOMPATIBLE',
  );
  return identities[0];
}

export function inputXmlDerivedSourceCaseRecord(row) {
  return {
    recoveredCaseId: row.recoveredCaseId,
    recoveredCaseSemanticHash: row.semanticHash,
    recoveredCaseEvidenceHash: row.evidenceHash,
    caseId: row.caseIdentity.caseId,
    caseRole: row.caseIdentity.caseRole,
    physicalLoadCaseHash: row.caseIdentity.physicalLoadCaseHash,
    physicalLoadCaseSemanticHash: row.caseIdentity.physicalLoadCaseSemanticHash,
    physicalLoadCaseEvidenceHash: row.caseIdentity.physicalLoadCaseEvidenceHash,
    caseExecutionId: row.executionIdentity.caseExecutionId,
    caseExecutionSemanticHash: row.executionIdentity.caseExecutionSemanticHash,
    caseExecutionEvidenceHash: row.executionIdentity.caseExecutionEvidenceHash,
    stiffnessRuntimeHash: row.stiffnessIdentity.stiffnessRuntimeHash,
  };
}

export function buildInputXmlDerivedPressureCustody(algebra, recoveredById) {
  const groups = algebra.kind === 'ENVELOPE'
    ? algebra.candidates.map((candidate) => ({
      candidateId: candidate.candidateId, terms: candidate.terms,
    }))
    : [{ candidateId: null, terms: algebra.terms }];
  return groups.flatMap(({ candidateId, terms }) => terms.flatMap((term) => {
    const recovered = recoveredById.get(term.recoveredCaseId);
    return recovered.pressureCustody.map((pressure) => ({
      custodyId: `IXPC-${semanticHash({
        candidateId, recoveredCaseId: recovered.recoveredCaseId,
        primitiveId: pressure.primitiveId, factor: term.factor,
      })}`,
      candidateId,
      recoveredCaseId: recovered.recoveredCaseId,
      recoveredCaseEvidenceHash: recovered.evidenceHash,
      factor: term.factor,
      ...structuredClone(pressure),
      structuralEffect: 'NONE',
      futureUse: 'CODE_STRESS_CUSTODY_ONLY',
      combinationDisposition: 'PRESERVE_TERM_FOR_CODE_EVALUATION_NO_STRUCTURAL_EFFECT',
    }));
  })).sort((left, right) => compareAscii(left.custodyId, right.custodyId));
}

export function inputXmlDerivedLimitations(algebra, recovered) {
  return uniqueAscii([
    ...recovered.flatMap((row) => row.limitations),
    ...(algebra.kind === 'RANGE'
      ? ['INPUTXML_DERIVED_RANGE_MAGNITUDE_REPORTING_ONLY'] : []),
    ...(algebra.kind === 'ENVELOPE'
      ? ['INPUTXML_DERIVED_ENVELOPE_NOT_EQUILIBRIUM_STATE'] : []),
  ]);
}

export function inputXmlDerivedStatus(recovered) {
  const statuses = uniqueAscii(recovered.map((row) => row.status));
  return statuses.length === 1 ? statuses[0] : 'MIXED_SOURCE_STATUS';
}

export function inputXmlDerivedDiagnostics(algebra, recovered, pressure, states) {
  return {
    algebra: {
      kind: algebra.kind,
      sourceCaseCount: recovered.length,
      candidateCount: algebra.kind === 'ENVELOPE' ? algebra.candidates.length : 0,
      signedEquilibriumStateAvailable: algebra.kind !== 'ENVELOPE',
      componentwiseEnvelopeReportingOnly: algebra.kind === 'ENVELOPE',
      rangeMagnitudeReportingOnly: algebra.kind === 'RANGE',
    },
    custody: {
      compatibleModel: true,
      compatibleStiffnessState: true,
      compatibleRuntime: true,
      compatibleRecoveryProfile: true,
      pressurePrimitiveTermCount: pressure.length,
      pressureStructuralIsolation: pressure.every((row) => row.structuralEffect === 'NONE'),
      serializedRuntimeStateExcluded: true,
      resultStateAvailable: states.resultState !== null,
      equationChanges: [],
    },
  };
}

function compatibilityProjection(row) {
  return {
    sourceBundleSemanticHash: row.sourceIdentity.sourceBundleSemanticHash,
    structuralPreparationSemanticHash: row.sourceIdentity.structuralPreparationSemanticHash,
    solvePreparationSemanticHash: row.sourceIdentity.solvePreparationSemanticHash,
    mechanicalModelSemanticHash: row.stiffnessIdentity.mechanicalModelSemanticHash,
    stiffnessStateHash: row.stiffnessIdentity.stiffnessStateHash,
    preflightSemanticHash: row.stiffnessIdentity.preflightSemanticHash,
    stiffnessRuntimeHash: row.stiffnessIdentity.stiffnessRuntimeHash,
    runtimeId: row.runtimeIdentity.runtimeId,
    runtimeHash: row.runtimeIdentity.runtimeHash,
    authorizedCaseSetHash: row.runtimeIdentity.authorizedCaseSetHash,
    recoveryProfileSemanticHash: row.recoveryIdentity.recoveryProfileSemanticHash,
    mappingPolicySemanticHash: row.recoveryIdentity.mappingPolicySemanticHash,
  };
}

function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
