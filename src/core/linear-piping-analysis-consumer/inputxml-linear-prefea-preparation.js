import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { prepareInputXmlLinearSolve } from './inputxml-linear-solve-preparation.js';
import { compileInputXmlLinearStructure } from './inputxml-linear-structural-preparation.js';
import { compileInputXmlLinearPhysicalCases } from './inputxml-linear-physical-cases.js';
import { preflightInputXmlLinearSolve } from './inputxml-linear-stiffness-preflight.js';
import { requireInputXmlLinearPreFeaDiagnostics } from './inputxml-linear-prefea-diagnostics.js';
import {
  INPUTXML_LINEAR_PREFEA_PREPARATION_SCHEMA,
  foldReadiness,
  makeFinding,
  requirePreFeaRecord,
  sealPreFeaRecord,
  uniqueAscii,
} from './inputxml-linear-prefea-contract.js';

export function prepareInputXmlLinearPreFea(diagnostics, options = {}) {
  const accepted = requireInputXmlLinearPreFeaDiagnostics(diagnostics);
  if (accepted.status === 'BLOCK') {
    return sealBlockedPreparation(accepted, accepted.findings, 'DIAGNOSTICS_BLOCKED');
  }

  let sourcePreparation;
  let structuralPreparation;
  let physicalPreparation;
  let stiffnessPreflight;
  try {
    sourcePreparation = (options.prepareAuthorities ?? prepareInputXmlLinearSolve)(
      accepted.sourceBundle,
      accepted.requestedProfileId,
      {
        ...(options.authorityOptions ?? {}),
        modelHealthReport: accepted.representabilityDiagnostics,
      },
    );
    structuralPreparation = (options.compileStructure ?? compileInputXmlLinearStructure)(
      accepted.sourceBundle,
      accepted.representabilityDiagnostics,
      sourcePreparation,
      options.structuralOptions ?? {},
    );
    physicalPreparation = (options.compilePhysicalCases ?? compileInputXmlLinearPhysicalCases)(
      sourcePreparation,
      structuralPreparation,
      options.physicalCaseOptions ?? {},
    );
    stiffnessPreflight = (options.preflightStiffness ?? preflightInputXmlLinearSolve)(
      physicalPreparation,
      options.stiffnessOptions ?? {},
    );
  } catch (error) {
    const finding = errorFinding(error, accepted.requestedCaseIds);
    return sealBlockedPreparation(accepted, [...accepted.findings, finding], 'PREPARATION_FAILED');
  }

  const caseRecords = physicalPreparation.physicalCases ?? [];
  const availableCaseIds = uniqueAscii(caseRecords.map((row) => row.caseId));
  const missingCaseIds = accepted.requestedCaseIds.filter((caseId) => !availableCaseIds.includes(caseId));
  const findings = [...accepted.findings];
  if (missingCaseIds.length > 0) {
    findings.push(makeFinding({
      code: 'PHYSICAL_CASE_AUTHORITY_INCOMPLETE',
      category: 'PHYSICAL_CASE',
      severity: 'ERROR',
      disposition: 'BLOCK',
      capabilityEffects: missingCaseIds.map((caseId) => `PHYSICAL_CASE:${caseId}`),
      sourceFeatureIds: [],
      sourcePaths: [],
      canonicalEntityIds: [],
      physicalCaseIds: missingCaseIds,
      message: `Requested physical cases are unavailable: ${missingCaseIds.join(', ')}.`,
      technicalBasis: 'A physical case can be authorized only when every required structural primitive and source authority was compiled.',
      evidence: { requestedCaseIds: accepted.requestedCaseIds, availableCaseIds, missingCaseIds },
      remediation: 'Supply the missing material, section, load, pressure, thermal, or prescribed-movement authority and rerun preparation.',
      approximationEligible: false,
      authorizationRequired: false,
    }));
  }
  findings.push(...preflightFindings(stiffnessPreflight, accepted.requestedCaseIds));
  const folded = foldReadiness(findings, accepted.requestedCaseIds);
  const requestedCases = caseRecords.filter((row) => accepted.requestedCaseIds.includes(row.caseId));
  const loadIdentity = semanticHash({
    loadLedger: physicalPreparation.loadLedger ?? [],
    requestedCases: requestedCases.map((row) => ({
      caseId: row.caseId,
      loadCaseSemanticHash: row.loadCase?.semanticHash ?? null,
      physicalLoadCaseHash: row.loadCase?.physicalLoadCaseHash ?? null,
    })),
  });
  const limitations = uniqueAscii([
    ...(sourcePreparation.limitations ?? []),
    ...(structuralPreparation.limitations ?? []),
    ...(physicalPreparation.limitations ?? []),
    ...folded.findings.filter((row) => row.disposition === 'CONDITIONAL').map((row) => row.code),
  ]);
  const summary = preparationSummary({
    status: folded.status,
    diagnostics: accepted,
    folded,
    sourcePreparation,
    structuralPreparation,
    physicalPreparation,
    stiffnessPreflight,
    missingCaseIds,
    limitations,
  });

  return sealPreFeaRecord({
    schema: INPUTXML_LINEAR_PREFEA_PREPARATION_SCHEMA,
    preparationId: `IXREADY-${semanticHash({
      diagnostics: accepted.semanticHash,
      structure: structuralPreparation.semanticHash,
      physical: physicalPreparation.semanticHash,
      stiffness: stiffnessPreflight.semanticHash,
      requestedCaseIds: accepted.requestedCaseIds,
    }).slice(0, 28)}`,
    status: folded.status,
    requestedProfileId: accepted.requestedProfileId,
    requestedCaseIds: accepted.requestedCaseIds,
    diagnosticsSemanticHash: accepted.semanticHash,
    diagnosticsEvidenceHash: accepted.evidenceHash,
    sourceBundleSemanticHash: accepted.sourceAuthority.sourceBundleSemanticHash,
    sourceBundleEvidenceHash: accepted.sourceAuthority.sourceBundleEvidenceHash,
    modelSemanticHash: structuralPreparation.compilation?.mechanicalModelSemanticHash
      ?? structuralPreparation.summary?.mechanicalModelSemanticHash,
    stiffnessStateHash: stiffnessPreflight.stiffnessStateHash,
    loadStateHash: loadIdentity,
    sourcePreparation,
    structuralPreparation,
    physicalPreparation,
    stiffnessPreflight,
    authorizedCaseCandidates: Object.freeze(requestedCases.map((row) => Object.freeze({
      caseId: row.caseId,
      caseRole: row.caseRole,
      loadCaseSemanticHash: row.loadCase?.semanticHash ?? null,
      physicalLoadCaseHash: row.loadCase?.physicalLoadCaseHash ?? null,
      primitiveIds: Object.freeze(uniqueAscii(row.primitiveIds ?? [])),
    })).sort((a, b) => a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : 0)),
    findings: folded.findings,
    limitations,
    summary,
    executionBoundary: {
      rawSourceParseCount: 1,
      materialAuthorityPrepared: true,
      sectionAuthorityPrepared: true,
      constraintsCompiled: true,
      mechanicalModelCompiled: true,
      loadCasesCompiled: true,
      stiffnessAssembled: true,
      factorizationHandle: 'NOT_RETAINED',
      solverRuntime: 'NOT_CREATED',
      solveAuthorized: false,
    },
    semanticHash: '',
    evidenceHash: '',
  }, INPUTXML_LINEAR_PREFEA_PREPARATION_SCHEMA, preparationIdentity, preparationEvidence);
}

export function requireInputXmlLinearPreFeaPreparation(record, diagnostics) {
  const accepted = requirePreFeaRecord(
    record,
    INPUTXML_LINEAR_PREFEA_PREPARATION_SCHEMA,
    preparationIdentity,
    preparationEvidence,
  );
  if (diagnostics !== undefined) {
    const parent = requireInputXmlLinearPreFeaDiagnostics(diagnostics);
    if (accepted.diagnosticsSemanticHash !== parent.semanticHash
      || accepted.diagnosticsEvidenceHash !== parent.evidenceHash
      || accepted.sourceBundleSemanticHash !== parent.sourceAuthority.sourceBundleSemanticHash
      || accepted.sourceBundleEvidenceHash !== parent.sourceAuthority.sourceBundleEvidenceHash) {
      throw stale('PREFEA_PREPARATION_PARENT_STALE', 'Preparation does not match the supplied diagnostics record.');
    }
  }
  if (accepted.executionBoundary.solverRuntime !== 'NOT_CREATED'
    || accepted.executionBoundary.factorizationHandle !== 'NOT_RETAINED') {
    throw stale('PREFEA_PREPARATION_RUNTIME_STATE_INVALID', 'Preparation retains prohibited runtime state.');
  }
  return accepted;
}

function sealBlockedPreparation(diagnostics, findings, reasonCode) {
  const folded = foldReadiness(findings, diagnostics.requestedCaseIds);
  const blockedFindings = folded.findings.some((row) => row.disposition === 'BLOCK')
    ? folded.findings
    : [...folded.findings, makeFinding({
      code: reasonCode,
      category: 'AUTHORIZATION',
      severity: 'ERROR',
      disposition: 'BLOCK',
      capabilityEffects: diagnostics.requestedCaseIds.map((caseId) => `PHYSICAL_CASE:${caseId}`),
      sourceFeatureIds: [],
      sourcePaths: [],
      canonicalEntityIds: [],
      physicalCaseIds: diagnostics.requestedCaseIds,
      message: 'Pre-FEA preparation is blocked.',
      technicalBasis: 'A blocking parent diagnostic prevents mechanical preparation and numerical preflight.',
      evidence: { diagnosticsSemanticHash: diagnostics.semanticHash, reasonCode },
      remediation: 'Resolve all blocking diagnostics and create a new preparation record.',
      approximationEligible: false,
      authorizationRequired: false,
    })];
  const finalFold = foldReadiness(blockedFindings, diagnostics.requestedCaseIds);
  return sealPreFeaRecord({
    schema: INPUTXML_LINEAR_PREFEA_PREPARATION_SCHEMA,
    preparationId: `IXREADY-BLOCK-${diagnostics.semanticHash.slice(0, 24)}`,
    status: 'BLOCK',
    requestedProfileId: diagnostics.requestedProfileId,
    requestedCaseIds: diagnostics.requestedCaseIds,
    diagnosticsSemanticHash: diagnostics.semanticHash,
    diagnosticsEvidenceHash: diagnostics.evidenceHash,
    sourceBundleSemanticHash: diagnostics.sourceAuthority.sourceBundleSemanticHash,
    sourceBundleEvidenceHash: diagnostics.sourceAuthority.sourceBundleEvidenceHash,
    modelSemanticHash: null,
    stiffnessStateHash: null,
    loadStateHash: null,
    sourcePreparation: null,
    structuralPreparation: null,
    physicalPreparation: null,
    stiffnessPreflight: null,
    authorizedCaseCandidates: Object.freeze([]),
    findings: finalFold.findings,
    limitations: Object.freeze([]),
    summary: Object.freeze({
      ...diagnostics.summary,
      status: 'BLOCK',
      findingCounts: finalFold.findingCounts,
      remediationSummary: Object.freeze(uniqueAscii(finalFold.findings.map((row) => row.remediation))),
    }),
    executionBoundary: {
      rawSourceParseCount: 1,
      materialAuthorityPrepared: false,
      sectionAuthorityPrepared: false,
      constraintsCompiled: false,
      mechanicalModelCompiled: false,
      loadCasesCompiled: false,
      stiffnessAssembled: false,
      factorizationHandle: 'NOT_CREATED',
      solverRuntime: 'NOT_CREATED',
      solveAuthorized: false,
      blockReasonCode: reasonCode,
    },
    semanticHash: '',
    evidenceHash: '',
  }, INPUTXML_LINEAR_PREFEA_PREPARATION_SCHEMA, preparationIdentity, preparationEvidence);
}

function preflightFindings(preflight, requestedCaseIds) {
  const rows = [];
  for (const finding of preflight.genericPreflight?.findings ?? []) {
    const disposition = finding.disposition === 'BLOCK'
      ? 'BLOCK'
      : finding.disposition === 'WARN' ? 'CONDITIONAL' : 'PASS';
    const category = classifyPreflightCategory(finding.code);
    rows.push(makeFinding({
      code: finding.code ?? 'LINEAR_STIFFNESS_PREFLIGHT_FINDING',
      category,
      severity: disposition === 'BLOCK' ? 'ERROR' : disposition === 'CONDITIONAL' ? 'WARNING' : 'INFO',
      disposition,
      capabilityEffects: requestedCaseIds.map((caseId) => `PHYSICAL_CASE:${caseId}`),
      sourceFeatureIds: finding.sourceFeatureIds ?? [],
      sourcePaths: [],
      canonicalEntityIds: uniqueAscii([
        ...(finding.componentIds ?? []), ...(finding.nodeIds ?? []), ...(finding.dofIds ?? []),
      ]),
      physicalCaseIds: requestedCaseIds,
      message: finding.message ?? finding.code ?? 'Stiffness preflight finding.',
      technicalBasis: finding.technicalBasis
        ?? 'The production stiffness preflight classified the constrained free partition.',
      evidence: finding.evidence ?? finding.data ?? {
        failureCode: finding.code ?? null,
        partitionIdentity: preflight.genericPreflight?.assembly?.partitionIdentity ?? null,
      },
      remediation: finding.remediation
        ?? 'Correct support, connectivity, formulation, or conditioning authority and rerun numerical preflight.',
      approximationEligible: false,
      authorizationRequired: disposition === 'CONDITIONAL',
    }));
  }
  if (preflight.status === 'BLOCK' && !rows.some((row) => row.disposition === 'BLOCK')) {
    rows.push(makeFinding({
      code: 'LINEAR_STIFFNESS_PREFLIGHT_BLOCKED',
      category: 'STIFFNESS',
      severity: 'ERROR',
      disposition: 'BLOCK',
      capabilityEffects: requestedCaseIds.map((caseId) => `PHYSICAL_CASE:${caseId}`),
      sourceFeatureIds: [],
      sourcePaths: [],
      canonicalEntityIds: preflight.genericPreflight?.components?.filter((row) => row.floating)
        .map((row) => row.componentId) ?? [],
      physicalCaseIds: requestedCaseIds,
      message: 'The production stiffness preflight blocked solve authorization.',
      technicalBasis: 'The assembled free stiffness partition did not satisfy the selected rank, definiteness, mechanism, or conditioning policy.',
      evidence: {
        status: preflight.status,
        summary: preflight.summary,
        factorization: preflight.genericPreflight?.factorization ?? null,
      },
      remediation: 'Resolve the retained mechanism, rank, definiteness, or conditioning finding.',
      approximationEligible: false,
      authorizationRequired: false,
    }));
  } else if (preflight.status === 'WARN' && !rows.some((row) => row.disposition === 'CONDITIONAL')) {
    rows.push(makeFinding({
      code: 'LINEAR_STIFFNESS_CONDITION_WARNING',
      category: 'CONDITIONING',
      severity: 'WARNING',
      disposition: 'CONDITIONAL',
      capabilityEffects: requestedCaseIds.map((caseId) => `PHYSICAL_CASE:${caseId}`),
      sourceFeatureIds: [],
      sourcePaths: [],
      canonicalEntityIds: [],
      physicalCaseIds: requestedCaseIds,
      message: 'Stiffness conditioning requires conditional authorization.',
      technicalBasis: 'The factorization succeeded but the condition estimate exceeded the selected warning threshold.',
      evidence: {
        status: preflight.status,
        summary: preflight.summary,
        factorization: preflight.genericPreflight?.factorization ?? null,
      },
      remediation: 'Review the conditioning evidence and either correct the model or explicitly accept the limitation.',
      approximationEligible: false,
      authorizationRequired: true,
    }));
  }
  return rows;
}

function errorFinding(error, requestedCaseIds) {
  const code = String(error?.code ?? 'PREFEA_PREPARATION_EXCEPTION');
  return makeFinding({
    code,
    category: classifyPreparationError(code),
    severity: 'ERROR',
    disposition: 'BLOCK',
    capabilityEffects: requestedCaseIds.map((caseId) => `PHYSICAL_CASE:${caseId}`),
    sourceFeatureIds: error?.data?.sourceFeatureIds ?? [],
    sourcePaths: error?.data?.sourcePaths ?? [],
    canonicalEntityIds: uniqueAscii([
      error?.data?.segmentId, error?.data?.nodeId, error?.data?.restraintId,
      ...(error?.data?.componentIds ?? []),
    ]),
    physicalCaseIds: requestedCaseIds,
    message: String(error?.message ?? 'Pre-FEA preparation failed.'),
    technicalBasis: 'An existing production authority rejected the source, mechanical compilation, load compilation, constraint set, or stiffness preflight.',
    evidence: { code, data: error?.data ?? null, name: error?.name ?? 'Error' },
    remediation: 'Correct the source authority identified by this finding and rerun preparation.',
    approximationEligible: false,
    authorizationRequired: false,
  });
}

function preparationSummary({
  status,
  diagnostics,
  folded,
  sourcePreparation,
  structuralPreparation,
  physicalPreparation,
  stiffnessPreflight,
  missingCaseIds,
  limitations,
}) {
  return Object.freeze({
    ...diagnostics.summary,
    status,
    findingCounts: folded.findingCounts,
    blockedCapabilityIds: Object.freeze(uniqueAscii([
      ...diagnostics.summary.blockedCapabilityIds,
      ...missingCaseIds.map((caseId) => `PHYSICAL_CASE:${caseId}`),
    ])),
    conditionalCapabilityIds: Object.freeze(uniqueAscii([
      ...diagnostics.summary.conditionalCapabilityIds,
      ...folded.findings.filter((row) => row.disposition === 'CONDITIONAL')
        .flatMap((row) => row.capabilityEffects),
    ])),
    authorizedCapabilityIds: diagnostics.summary.authorizedCapabilityIds,
    physicalCaseCount: physicalPreparation.summary?.physicalCaseCount ?? 0,
    requestedPhysicalCaseCount: diagnostics.requestedCaseIds.length,
    missingRequestedCaseCount: missingCaseIds.length,
    materialResolutionCount: sourcePreparation.summary?.materialResolutionCount ?? 0,
    sectionResolutionCount: sourcePreparation.summary?.sectionResolutionCount ?? 0,
    rigidAuthorityCount: sourcePreparation.summary?.rigidAuthorityCount ?? 0,
    constraintCount: structuralPreparation.summary?.constraintCount ?? 0,
    freeDofCount: stiffnessPreflight.summary?.freeDofCount ?? 0,
    constrainedDofCount: stiffnessPreflight.summary?.constrainedDofCount ?? 0,
    conditionEstimate: stiffnessPreflight.summary?.conditionEstimate ?? null,
    limitationCount: limitations.length,
    remediationSummary: Object.freeze(uniqueAscii(folded.findings
      .filter((row) => row.disposition !== 'PASS').map((row) => row.remediation))),
  });
}

function preparationIdentity(record) {
  return {
    schema: record.schema,
    preparationId: record.preparationId,
    status: record.status,
    requestedProfileId: record.requestedProfileId,
    requestedCaseIds: record.requestedCaseIds,
    diagnosticsSemanticHash: record.diagnosticsSemanticHash,
    sourceBundleSemanticHash: record.sourceBundleSemanticHash,
    modelSemanticHash: record.modelSemanticHash,
    stiffnessStateHash: record.stiffnessStateHash,
    loadStateHash: record.loadStateHash,
    sourcePreparationSemanticHash: record.sourcePreparation?.semanticHash ?? null,
    structuralPreparationSemanticHash: record.structuralPreparation?.semanticHash ?? null,
    physicalPreparationSemanticHash: record.physicalPreparation?.semanticHash ?? null,
    stiffnessPreflightSemanticHash: record.stiffnessPreflight?.semanticHash ?? null,
    authorizedCaseCandidates: record.authorizedCaseCandidates,
    findings: record.findings,
    limitations: record.limitations,
    summary: record.summary,
    executionBoundary: record.executionBoundary,
  };
}

function preparationEvidence(record) {
  return {
    diagnosticsEvidenceHash: record.diagnosticsEvidenceHash,
    sourceBundleEvidenceHash: record.sourceBundleEvidenceHash,
    sourcePreparationEvidenceHash: record.sourcePreparation?.evidenceHash ?? null,
    structuralPreparationEvidenceHash: record.structuralPreparation?.evidenceHash ?? null,
    physicalPreparationEvidenceHash: record.physicalPreparation?.evidenceHash ?? null,
    stiffnessPreflightEvidenceHash: record.stiffnessPreflight?.evidenceHash ?? null,
    findingEvidence: record.findings.map((row) => ({ findingId: row.findingId, evidence: row.evidence })),
  };
}

function classifyPreparationError(code) {
  if (/MATERIAL/u.test(code)) return 'MATERIAL';
  if (/SECTION/u.test(code)) return 'SECTION';
  if (/RIGID/u.test(code)) return 'RIGID';
  if (/RESTRAINT|CONSTRAINT/u.test(code)) return 'CONSTRAINT';
  if (/THERMAL|TEMPERATURE/u.test(code)) return 'THERMAL';
  if (/PRESSURE/u.test(code)) return 'PRESSURE';
  if (/LOAD|CASE/u.test(code)) return 'LOAD';
  if (/STIFF|RANK|PIVOT|CONDITION/u.test(code)) return 'STIFFNESS';
  return 'UNSUPPORTED_FEATURE';
}

function classifyPreflightCategory(code = '') {
  if (/FLOAT|RIGID_BODY|MECHANISM/u.test(code)) return 'MECHANISM';
  if (/CONDITION/u.test(code)) return 'CONDITIONING';
  if (/CONSTRAINT|DOF_COLLISION/u.test(code)) return 'CONSTRAINT';
  return 'STIFFNESS';
}

function stale(code, message) {
  const error = new Error(message);
  error.name = 'InputXmlLinearPreFeaStaleError';
  error.code = code;
  return error;
}
