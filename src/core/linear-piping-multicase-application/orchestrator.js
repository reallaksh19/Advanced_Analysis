import { deepFreeze } from '../shared-piping-model/immutable.js';
import {
  requireLinearPipingInputXmlAnalysisContext,
} from '../linear-piping-analysis-consumer/index.js';
import {
  compileLinearPipingInterfaceSet,
  createLinearPipingInterfaceEnvelope,
  recoverLinearPipingInterfaceLoads,
  requireLinearPipingInterfaceEnvelope,
  requireLinearPipingInterfaceRecovery,
  requireLinearPipingInterfaceSet,
} from '../linear-piping-interface/index.js';
import {
  APPLICATION_RESULT_REQUEST_SCHEMA,
  B31_APPLICATION_REQUEST_SCHEMA,
  compileLinearPipingB31Application,
  compileNozzleAllowableAssessment,
  requireLinearPipingB31Application,
  requireLinearPipingQualifiedApplicationResult,
  requireNozzleAllowableAssessment,
  requireNozzleAllowableProfile,
  sealLinearPipingQualifiedApplicationResult,
} from '../linear-piping-code-application/index.js';
import {
  MULTICASE_APPLICATION_INPUT_KEYS,
  MULTICASE_APPLICATION_KEYS,
  MULTICASE_APPLICATION_REQUEST_SCHEMA,
  MULTICASE_APPLICATION_SCHEMA,
  MULTICASE_B31_AUTHORITY_KEYS,
  MULTICASE_CASE_INPUT_KEYS,
  MULTICASE_INTERFACE_AUTHORITY_KEYS,
  MULTICASE_NOZZLE_ENVELOPE_KEYS,
  compareAscii,
  failMulticaseApplication,
  freezeClone,
  hashEvidenceProjection,
  hashSemanticProjection,
  requireArray,
  requireExactKeys,
  requireHash,
  requireText,
  requireUnique,
} from './contracts.js';

export function compileLinearPipingMulticaseApplication(input) {
  requireExactKeys(input, MULTICASE_APPLICATION_INPUT_KEYS, 'multicaseApplicationInput');
  if (input.schema !== MULTICASE_APPLICATION_REQUEST_SCHEMA) {
    failMulticaseApplication(
      `multicaseApplicationInput.schema must be ${MULTICASE_APPLICATION_REQUEST_SCHEMA}.`,
      'PIPING_MULTICASE_INPUT_INVALID',
    );
  }
  const applicationId = requireText(
    input.applicationId,
    'multicaseApplicationInput.applicationId',
  );
  const cases = canonicalCases(input.cases, 'multicaseApplicationInput.cases');
  requireCommonCaseAuthority(cases);

  requireExactKeys(
    input.interfaceAuthority,
    MULTICASE_INTERFACE_AUTHORITY_KEYS,
    'multicaseApplicationInput.interfaceAuthority',
  );
  const compilation = cases[0].inputXmlAnalysisContext.sourceAnalysisContext.compilation;
  const interfaceSet = compileLinearPipingInterfaceSet({
    compilation,
    supportAttachmentModel: input.interfaceAuthority.supportAttachmentModel,
    restraintCapabilityModel: input.interfaceAuthority.restraintCapabilityModel,
    definitions: input.interfaceAuthority.definitions,
    profile: input.interfaceAuthority.profile,
  });

  const interfaceRecoveries = cases.map((entry) => {
    const sourceContext = entry.inputXmlAnalysisContext.sourceAnalysisContext;
    return recoverLinearPipingInterfaceLoads({
      interfaceSet,
      analysisResult: sourceContext.analysisResult,
      loadCase: sourceContext.loadCase,
    });
  }).sort(compareRecoveries);

  const interfaceEnvelope = createLinearPipingInterfaceEnvelope({
    envelopeId: `${applicationId}:INTERFACE-ENVELOPE`,
    recoveries: interfaceRecoveries,
  });

  const nozzleAllowableProfiles = canonicalProfiles(
    input.nozzleAllowableProfiles,
    'multicaseApplicationInput.nozzleAllowableProfiles',
  );
  const nozzleCaseAssessments = compileNozzleCaseAssessments(
    interfaceSet,
    interfaceRecoveries,
    nozzleAllowableProfiles,
  );
  const nozzleGoverningAssessments = governingAssessments(
    nozzleAllowableProfiles,
    nozzleCaseAssessments,
  );
  const nozzleEnvelope = buildNozzleEnvelope(
    nozzleAllowableProfiles,
    nozzleCaseAssessments,
    nozzleGoverningAssessments,
  );

  requireExactKeys(
    input.b31Authority,
    MULTICASE_B31_AUTHORITY_KEYS,
    'multicaseApplicationInput.b31Authority',
  );
  const b31Application = compileLinearPipingB31Application({
    schema: B31_APPLICATION_REQUEST_SCHEMA,
    applicationId: input.b31Authority.applicationId,
    codeProfile: input.b31Authority.codeProfile,
    editionDataset: input.b31Authority.editionDataset,
    cases: cases.map((entry) => ({
      caseId: entry.caseId,
      loadCase: entry.inputXmlAnalysisContext.sourceAnalysisContext.loadCase,
      recovery: entry.inputXmlAnalysisContext.sourceAnalysisContext.analysisResult.recovery,
    })),
    checks: input.b31Authority.checks,
  });

  const applicationResult = sealLinearPipingQualifiedApplicationResult({
    schema: APPLICATION_RESULT_REQUEST_SCHEMA,
    applicationId,
    analysisResults: cases.map((entry) => (
      entry.inputXmlAnalysisContext.sourceAnalysisContext.analysisResult
    )),
    interfaceSet,
    interfaceRecoveries,
    nozzleAssessments: nozzleGoverningAssessments,
    b31Application,
  });

  const draft = {
    schema: MULTICASE_APPLICATION_SCHEMA,
    applicationId,
    cases,
    interfaceSet,
    interfaceRecoveries,
    interfaceEnvelope,
    nozzleAllowableProfiles,
    nozzleCaseAssessments,
    nozzleGoverningAssessments,
    nozzleEnvelope,
    b31Application,
    applicationResult,
    status: applicationResult.status,
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = hashSemanticProjection(draft);
  draft.evidenceHash = hashEvidenceProjection(draft);
  return requireLinearPipingMulticaseApplication(draft);
}

export function requireLinearPipingMulticaseApplication(record) {
  requireExactKeys(record, MULTICASE_APPLICATION_KEYS, 'multicaseApplication');
  if (record.schema !== MULTICASE_APPLICATION_SCHEMA) {
    failMulticaseApplication(
      'Multicase application schema is unsupported.',
      'PIPING_MULTICASE_RESULT_INVALID',
    );
  }
  requireText(record.applicationId, 'multicaseApplication.applicationId');
  const cases = canonicalCases(record.cases, 'multicaseApplication.cases');
  requireCommonCaseAuthority(cases);
  const interfaceSet = requireLinearPipingInterfaceSet(record.interfaceSet);
  requireInterfaceSetCurrent(interfaceSet, cases[0]);

  const interfaceRecoveries = requireArray(
    record.interfaceRecoveries,
    'multicaseApplication.interfaceRecoveries',
  ).map(requireLinearPipingInterfaceRecovery).sort(compareRecoveries);
  requireRecoveryCoverage(cases, interfaceSet, interfaceRecoveries);

  const interfaceEnvelope = requireLinearPipingInterfaceEnvelope(record.interfaceEnvelope);
  requireInterfaceEnvelopeCoverage(interfaceSet, interfaceRecoveries, interfaceEnvelope);

  const nozzleAllowableProfiles = canonicalProfiles(
    record.nozzleAllowableProfiles,
    'multicaseApplication.nozzleAllowableProfiles',
  );
  const nozzleCaseAssessments = requireArray(
    record.nozzleCaseAssessments,
    'multicaseApplication.nozzleCaseAssessments',
  ).map(requireNozzleAllowableAssessment).sort(compareAssessments);
  requireNozzleCaseCoverage(
    interfaceSet,
    interfaceRecoveries,
    nozzleAllowableProfiles,
    nozzleCaseAssessments,
  );

  const nozzleGoverningAssessments = requireArray(
    record.nozzleGoverningAssessments,
    'multicaseApplication.nozzleGoverningAssessments',
  ).map(requireNozzleAllowableAssessment).sort(compareAssessments);
  const expectedGoverning = governingAssessments(
    nozzleAllowableProfiles,
    nozzleCaseAssessments,
  );
  requireSameHashes(
    nozzleGoverningAssessments,
    expectedGoverning,
    'PIPING_MULTICASE_NOZZLE_GOVERNING_MISMATCH',
  );

  const expectedNozzleEnvelope = buildNozzleEnvelope(
    nozzleAllowableProfiles,
    nozzleCaseAssessments,
    nozzleGoverningAssessments,
  );
  requireNozzleEnvelope(record.nozzleEnvelope, expectedNozzleEnvelope);

  const b31Application = requireLinearPipingB31Application(record.b31Application);
  requireB31CaseCoverage(cases, b31Application);
  const applicationResult = requireLinearPipingQualifiedApplicationResult(record.applicationResult);
  requireApplicationParents(
    cases,
    interfaceSet,
    interfaceRecoveries,
    nozzleGoverningAssessments,
    b31Application,
    applicationResult,
  );

  if (record.status !== applicationResult.status) {
    failMulticaseApplication(
      'Multicase status does not match the sealed application result.',
      'PIPING_MULTICASE_STATUS_MISMATCH',
    );
  }
  requireHash(record.semanticHash, 'multicaseApplication.semanticHash');
  requireHash(record.evidenceHash, 'multicaseApplication.evidenceHash');
  const accepted = {
    ...record,
    cases,
    interfaceSet,
    interfaceRecoveries,
    interfaceEnvelope,
    nozzleAllowableProfiles,
    nozzleCaseAssessments,
    nozzleGoverningAssessments,
    nozzleEnvelope: expectedNozzleEnvelope,
    b31Application,
    applicationResult,
  };
  if (record.semanticHash !== hashSemanticProjection(accepted)
    || record.evidenceHash !== hashEvidenceProjection(accepted)) {
    failMulticaseApplication(
      'Multicase application hashes are stale.',
      'PIPING_MULTICASE_HASH_MISMATCH',
    );
  }
  return deepFreeze(accepted);
}

function canonicalCases(value, field) {
  const cases = requireArray(value, field).map((entry, index) => {
    requireExactKeys(entry, MULTICASE_CASE_INPUT_KEYS, `${field}[${index}]`);
    return deepFreeze({
      caseId: requireText(entry.caseId, `${field}[${index}].caseId`),
      inputXmlAnalysisContext: requireLinearPipingInputXmlAnalysisContext(
        entry.inputXmlAnalysisContext,
      ),
    });
  }).sort((left, right) => compareAscii(left.caseId, right.caseId));
  if (cases.length === 0) {
    failMulticaseApplication(
      'Multicase application requires at least one retained InputXML context.',
      'PIPING_MULTICASE_CASES_EMPTY',
    );
  }
  requireUnique(cases.map((row) => row.caseId), 'PIPING_MULTICASE_CASE_ID_DUPLICATE', 'caseId');
  requireUnique(
    cases.map((row) => row.inputXmlAnalysisContext.sourceAnalysisContext.loadCase.loadCaseId),
    'PIPING_MULTICASE_LOAD_CASE_ID_DUPLICATE',
    'loadCaseId',
  );
  requireUnique(
    cases.map((row) => row.inputXmlAnalysisContext.sourceAnalysisContext.loadCase.physicalLoadCaseHash),
    'PIPING_MULTICASE_PHYSICAL_CASE_DUPLICATE',
    'physicalLoadCaseHash',
  );
  requireUnique(
    cases.map((row) => row.inputXmlAnalysisContext.sourceAnalysisContext.analysisResult.semanticHash),
    'PIPING_MULTICASE_ANALYSIS_DUPLICATE',
    'analysisResultSemanticHash',
  );
  return deepFreeze(cases);
}

function requireCommonCaseAuthority(cases) {
  const first = authorityOf(cases[0]);
  for (const entry of cases.slice(1)) {
    const current = authorityOf(entry);
    for (const field of Object.keys(first)) {
      if (current[field] !== first[field]) {
        failMulticaseApplication(
          `Multicase contexts do not share one ${field}.`,
          'PIPING_MULTICASE_AUTHORITY_MISMATCH',
          { field, expected: first[field], actual: current[field], caseId: entry.caseId },
        );
      }
    }
  }
}

function authorityOf(entry) {
  const context = entry.inputXmlAnalysisContext;
  const compilation = context.sourceAnalysisContext.compilation;
  return {
    sourceSemanticHash: context.inputXmlSource.semanticHash,
    inputXmlContentHash: context.inputXmlSource.contentHash,
    conditionedTopologyHash: context.conditionedTopologyHash,
    compilationSemanticHash: compilation.semanticHash,
    mechanicalModelSemanticHash: compilation.mechanicalModelSemanticHash,
    stiffnessStateHash: compilation.stiffnessStateHash,
  };
}

function canonicalProfiles(value, field) {
  const profiles = requireArray(value, field)
    .map(requireNozzleAllowableProfile)
    .sort((left, right) => compareAscii(left.interfaceId, right.interfaceId));
  requireUnique(
    profiles.map((row) => row.interfaceId),
    'PIPING_MULTICASE_NOZZLE_PROFILE_DUPLICATE',
    'nozzle interfaceId',
  );
  return deepFreeze(profiles);
}

function compileNozzleCaseAssessments(interfaceSet, recoveries, profiles) {
  return deepFreeze(profiles.flatMap((profile) => recoveries.map((interfaceRecovery) => (
    compileNozzleAllowableAssessment({ interfaceSet, interfaceRecovery, allowableProfile: profile })
  ))).sort(compareAssessments));
}

function governingAssessments(profiles, assessments) {
  return deepFreeze(profiles.map((profile) => assessments
    .filter((row) => row.interfaceId === profile.interfaceId)
    .sort(compareGoverningAssessments)[0])
    .filter(Boolean)
    .sort(compareAssessments));
}

function buildNozzleEnvelope(profiles, assessments, governing) {
  const governingByInterface = new Map(governing.map((row) => [row.interfaceId, row]));
  return deepFreeze(profiles.map((profile) => {
    const rows = assessments
      .filter((row) => row.interfaceId === profile.interfaceId)
      .sort(compareAssessments);
    const selected = governingByInterface.get(profile.interfaceId);
    if (!selected || rows.length === 0) {
      failMulticaseApplication(
        `Nozzle profile ${profile.interfaceId} has no case assessment.`,
        'PIPING_MULTICASE_NOZZLE_ASSESSMENT_MISSING',
      );
    }
    return deepFreeze({
      interfaceId: profile.interfaceId,
      profileSemanticHash: profile.semanticHash,
      governingLoadCaseId: selected.loadCaseId,
      governingAssessmentSemanticHash: selected.semanticHash,
      utilization: selected.utilization,
      assessmentStatus: selected.assessmentStatus,
      caseAssessmentSemanticHashes: rows.map((row) => row.semanticHash),
    });
  }).sort((left, right) => compareAscii(left.interfaceId, right.interfaceId)));
}

function requireInterfaceSetCurrent(interfaceSet, firstCase) {
  const compilation = firstCase.inputXmlAnalysisContext.sourceAnalysisContext.compilation;
  if (interfaceSet.mechanicalModelSemanticHash !== compilation.mechanicalModelSemanticHash
    || interfaceSet.stiffnessStateHash !== compilation.stiffnessStateHash) {
    failMulticaseApplication(
      'Interface set is stale against the retained multicase compilation.',
      'PIPING_MULTICASE_INTERFACE_SET_STALE',
    );
  }
}

function requireRecoveryCoverage(cases, interfaceSet, recoveries) {
  if (recoveries.length !== cases.length) {
    failMulticaseApplication(
      'Every retained case requires exactly one interface recovery.',
      'PIPING_MULTICASE_INTERFACE_RECOVERY_COVERAGE_INVALID',
    );
  }
  const byAnalysis = new Map(recoveries.map((row) => [row.analysisResultSemanticHash, row]));
  for (const entry of cases) {
    const sourceContext = entry.inputXmlAnalysisContext.sourceAnalysisContext;
    const recovery = byAnalysis.get(sourceContext.analysisResult.semanticHash);
    if (!recovery
      || recovery.interfaceSetSemanticHash !== interfaceSet.semanticHash
      || recovery.physicalLoadCaseHash !== sourceContext.loadCase.physicalLoadCaseHash) {
      failMulticaseApplication(
        `Interface recovery coverage is invalid for ${entry.caseId}.`,
        'PIPING_MULTICASE_INTERFACE_RECOVERY_PARENT_MISMATCH',
      );
    }
  }
}

function requireInterfaceEnvelopeCoverage(interfaceSet, recoveries, envelope) {
  const expected = recoveries.map((row) => row.semanticHash).sort(compareAscii);
  if (envelope.interfaceSetSemanticHash !== interfaceSet.semanticHash
    || JSON.stringify(envelope.recoverySemanticHashes) !== JSON.stringify(expected)) {
    failMulticaseApplication(
      'Interface envelope does not cover the multicase recovery set.',
      'PIPING_MULTICASE_INTERFACE_ENVELOPE_MISMATCH',
    );
  }
}

function requireNozzleCaseCoverage(interfaceSet, recoveries, profiles, assessments) {
  const profileByHash = new Map(profiles.map((row) => [row.semanticHash, row]));
  const recoveryByHash = new Map(recoveries.map((row) => [row.semanticHash, row]));
  const expectedPairs = profiles.flatMap((profile) => recoveries.map((recovery) => (
    `${profile.interfaceId}:${recovery.semanticHash}`
  ))).sort(compareAscii);
  const actualPairs = assessments.map((assessment) => {
    const profile = profileByHash.get(assessment.profileSemanticHash);
    const recovery = recoveryByHash.get(assessment.interfaceRecoverySemanticHash);
    if (!profile || !recovery
      || assessment.interfaceSetSemanticHash !== interfaceSet.semanticHash
      || assessment.interfaceId !== profile.interfaceId
      || assessment.loadCaseId !== recovery.loadCaseId) {
      failMulticaseApplication(
        'Nozzle case assessment parent chain is invalid.',
        'PIPING_MULTICASE_NOZZLE_PARENT_MISMATCH',
      );
    }
    return `${assessment.interfaceId}:${assessment.interfaceRecoverySemanticHash}`;
  }).sort(compareAscii);
  if (JSON.stringify(actualPairs) !== JSON.stringify(expectedPairs)) {
    failMulticaseApplication(
      'Nozzle case assessments do not cover every configured profile and case.',
      'PIPING_MULTICASE_NOZZLE_COVERAGE_INVALID',
    );
  }
}

function requireNozzleEnvelope(actual, expected) {
  const rows = requireArray(actual, 'multicaseApplication.nozzleEnvelope');
  rows.forEach((row, index) => {
    requireExactKeys(row, MULTICASE_NOZZLE_ENVELOPE_KEYS, `multicaseApplication.nozzleEnvelope[${index}]`);
  });
  if (JSON.stringify(rows) !== JSON.stringify(expected)) {
    failMulticaseApplication(
      'Nozzle envelope is stale against the retained case assessments.',
      'PIPING_MULTICASE_NOZZLE_ENVELOPE_MISMATCH',
    );
  }
}

function requireB31CaseCoverage(cases, b31Application) {
  const expected = cases.map((entry) => {
    const sourceContext = entry.inputXmlAnalysisContext.sourceAnalysisContext;
    return {
      caseId: entry.caseId,
      physicalLoadCaseHash: sourceContext.loadCase.physicalLoadCaseHash,
      recoverySemanticHash: sourceContext.analysisResult.recovery.semanticHash,
    };
  }).sort((left, right) => compareAscii(left.caseId, right.caseId));
  const actual = b31Application.caseBindings.map((row) => ({
    caseId: row.caseId,
    physicalLoadCaseHash: row.physicalLoadCaseHash,
    recoverySemanticHash: row.recoverySemanticHash,
  })).sort((left, right) => compareAscii(left.caseId, right.caseId));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failMulticaseApplication(
      'B31 application case bindings do not match the retained InputXML contexts.',
      'PIPING_MULTICASE_B31_CASE_MISMATCH',
    );
  }
}

function requireApplicationParents(
  cases,
  interfaceSet,
  recoveries,
  governingAssessments,
  b31Application,
  applicationResult,
) {
  const expectedAnalysis = cases.map((entry) => (
    entry.inputXmlAnalysisContext.sourceAnalysisContext.analysisResult.semanticHash
  )).sort(compareAscii);
  const expectedRecoveries = recoveries.map((row) => row.semanticHash).sort(compareAscii);
  const expectedNozzles = governingAssessments.map((row) => row.semanticHash).sort(compareAscii);
  if (JSON.stringify(applicationResult.analysisResultSemanticHashes) !== JSON.stringify(expectedAnalysis)
    || applicationResult.interfaceSetSemanticHash !== interfaceSet.semanticHash
    || JSON.stringify(applicationResult.interfaceRecoverySemanticHashes) !== JSON.stringify(expectedRecoveries)
    || JSON.stringify(applicationResult.nozzleAssessmentSemanticHashes) !== JSON.stringify(expectedNozzles)
    || applicationResult.b31ApplicationSemanticHash !== b31Application.semanticHash) {
    failMulticaseApplication(
      'Sealed application result does not retain the complete multicase parent set.',
      'PIPING_MULTICASE_APPLICATION_PARENT_MISMATCH',
    );
  }
}

function requireSameHashes(actual, expected, code) {
  const actualHashes = actual.map((row) => row.semanticHash).sort(compareAscii);
  const expectedHashes = expected.map((row) => row.semanticHash).sort(compareAscii);
  if (JSON.stringify(actualHashes) !== JSON.stringify(expectedHashes)) {
    failMulticaseApplication('Governing assessment selection is stale.', code);
  }
}

function compareRecoveries(left, right) {
  return compareAscii(left.loadCaseId, right.loadCaseId)
    || compareAscii(left.semanticHash, right.semanticHash);
}

function compareAssessments(left, right) {
  return compareAscii(left.interfaceId, right.interfaceId)
    || compareAscii(left.loadCaseId, right.loadCaseId)
    || compareAscii(left.semanticHash, right.semanticHash);
}

function compareGoverningAssessments(left, right) {
  return right.utilization - left.utilization
    || compareAscii(left.loadCaseId, right.loadCaseId)
    || compareAscii(left.semanticHash, right.semanticHash);
}
