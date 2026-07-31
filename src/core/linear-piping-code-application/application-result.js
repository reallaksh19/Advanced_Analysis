import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { exactKeys, nonEmptyString } from '../shared-analysis-contract/validation.js';
import { validateLinearPipingAnalysisResult } from '../linear-piping-analysis-consumer/index.js';
import {
  requireLinearPipingInterfaceRecovery,
  requireLinearPipingInterfaceSet,
} from '../linear-piping-interface/index.js';
import {
  APPLICATION_RESULT_REQUEST_SCHEMA,
  APPLICATION_RESULT_SCHEMA,
  APPLICATION_STATUSES,
  compareAscii,
  failCodeApplication,
  requireArray,
  requireHash,
} from './contracts.js';
import { requireNozzleAllowableAssessment } from './nozzle-assessment.js';
import { requireLinearPipingB31Application } from './b31-application.js';

export const APPLICATION_RESULT_INPUT_KEYS = Object.freeze([
  'schema',
  'applicationId',
  'analysisResults',
  'interfaceSet',
  'interfaceRecoveries',
  'nozzleAssessments',
  'b31Application',
]);
export const APPLICATION_RESULT_KEYS = Object.freeze([
  'schema',
  'applicationId',
  'analysisResultSemanticHashes',
  'interfaceSetSemanticHash',
  'interfaceRecoverySemanticHashes',
  'nozzleAssessmentSemanticHashes',
  'b31ApplicationSemanticHash',
  'status',
  'assessmentSummary',
  'notConfigured',
  'limitations',
  'semanticHash',
  'evidenceHash',
]);
export const ASSESSMENT_SUMMARY_KEYS = Object.freeze([
  'nozzlePassCount',
  'nozzleFailCount',
  'nozzleNotConfiguredCount',
  'codeQualifiedCount',
  'codeConditionalCount',
]);

export function sealLinearPipingQualifiedApplicationResult(input) {
  exactKeys(input, APPLICATION_RESULT_INPUT_KEYS, 'qualifiedApplicationInput');
  if (input.schema !== APPLICATION_RESULT_REQUEST_SCHEMA) {
    failCodeApplication(
      `qualifiedApplicationInput.schema must be ${APPLICATION_RESULT_REQUEST_SCHEMA}.`,
      'PIPING_APPLICATION_INPUT_INVALID',
    );
  }
  const applicationId = nonEmptyString(input.applicationId, 'qualifiedApplicationInput.applicationId');
  const analysisResults = requireArray(input.analysisResults, 'qualifiedApplicationInput.analysisResults')
    .map(validateLinearPipingAnalysisResult)
    .sort((left, right) => compareAscii(left.semanticHash, right.semanticHash));
  if (analysisResults.length === 0) {
    failCodeApplication('Qualified application result requires at least one analysis result.', 'PIPING_APPLICATION_ANALYSES_EMPTY');
  }
  requireUnique(analysisResults.map((row) => row.semanticHash), 'PIPING_APPLICATION_ANALYSIS_DUPLICATE');
  const analysisByHash = new Map(analysisResults.map((row) => [row.semanticHash, row]));
  const recoveryHashes = new Set(analysisResults.map((row) => row.recovery.semanticHash));

  const interfaceSet = requireLinearPipingInterfaceSet(input.interfaceSet);
  const interfaceRecoveries = requireArray(
    input.interfaceRecoveries,
    'qualifiedApplicationInput.interfaceRecoveries',
  ).map(requireLinearPipingInterfaceRecovery)
    .sort((left, right) => compareAscii(left.semanticHash, right.semanticHash));
  requireUnique(interfaceRecoveries.map((row) => row.semanticHash), 'PIPING_APPLICATION_INTERFACE_RECOVERY_DUPLICATE');
  for (const recovery of interfaceRecoveries) {
    if (recovery.interfaceSetSemanticHash !== interfaceSet.semanticHash
      || !analysisByHash.has(recovery.analysisResultSemanticHash)) {
      failCodeApplication(
        'Interface recovery parent chain is not contained in the application input.',
        'PIPING_APPLICATION_INTERFACE_PARENT_MISMATCH',
      );
    }
  }
  const interfaceRecoveryHashes = new Set(interfaceRecoveries.map((row) => row.semanticHash));

  const nozzleAssessments = requireArray(
    input.nozzleAssessments,
    'qualifiedApplicationInput.nozzleAssessments',
  ).map(requireNozzleAllowableAssessment)
    .sort((left, right) => compareAscii(left.interfaceId, right.interfaceId));
  requireUnique(nozzleAssessments.map((row) => row.interfaceId), 'PIPING_APPLICATION_NOZZLE_ASSESSMENT_DUPLICATE');
  for (const assessment of nozzleAssessments) {
    if (assessment.interfaceSetSemanticHash !== interfaceSet.semanticHash
      || !interfaceRecoveryHashes.has(assessment.interfaceRecoverySemanticHash)) {
      failCodeApplication(
        'Nozzle assessment parent chain is not contained in the application input.',
        'PIPING_APPLICATION_NOZZLE_PARENT_MISMATCH',
      );
    }
  }

  const b31Application = requireLinearPipingB31Application(input.b31Application);
  for (const binding of b31Application.caseBindings) {
    if (!recoveryHashes.has(binding.recoverySemanticHash)) {
      failCodeApplication(
        'B31 application references a recovery outside the sealed application analysis set.',
        'PIPING_APPLICATION_B31_PARENT_MISMATCH',
      );
    }
  }

  const configuredNozzleIds = new Set(nozzleAssessments.map((row) => row.interfaceId));
  const notConfigured = interfaceSet.interfaces
    .filter((row) => row.interfaceKind === 'NOZZLE' && !configuredNozzleIds.has(row.interfaceId))
    .map((row) => `NOZZLE_ALLOWABLE_NOT_CONFIGURED:${row.interfaceId}`)
    .sort(compareAscii);
  const assessmentSummary = deepFreeze({
    nozzlePassCount: nozzleAssessments.filter((row) => row.assessmentStatus === 'PASS').length,
    nozzleFailCount: nozzleAssessments.filter((row) => row.assessmentStatus === 'FAIL').length,
    nozzleNotConfiguredCount: notConfigured.length,
    codeQualifiedCount: b31Application.results
      .filter((row) => row.codeResult.status === 'QUALIFIED UNDER CONFIGURED PROFILE').length,
    codeConditionalCount: b31Application.results
      .filter((row) => row.codeResult.status === 'CONDITIONAL').length,
  });
  const status = analysisResults.some((row) => row.status === 'CONDITIONAL')
    || interfaceRecoveries.some((row) => row.status === 'CONDITIONAL')
    || nozzleAssessments.some((row) => row.qualificationStatus === 'CONDITIONAL')
    || b31Application.status === 'CONDITIONAL'
    || notConfigured.length > 0
    ? 'CONDITIONAL'
    : 'QUALIFIED';

  const limitations = buildLimitations(analysisResults, nozzleAssessments, b31Application, notConfigured);
  const draft = {
    schema: APPLICATION_RESULT_SCHEMA,
    applicationId,
    analysisResultSemanticHashes: analysisResults.map((row) => row.semanticHash),
    interfaceSetSemanticHash: interfaceSet.semanticHash,
    interfaceRecoverySemanticHashes: interfaceRecoveries.map((row) => row.semanticHash),
    nozzleAssessmentSemanticHashes: nozzleAssessments.map((row) => row.semanticHash),
    b31ApplicationSemanticHash: b31Application.semanticHash,
    status,
    assessmentSummary,
    notConfigured: deepFreeze(notConfigured),
    limitations,
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = semanticHash(applicationResultSemanticProjection(draft));
  draft.evidenceHash = semanticHash({
    semanticHash: draft.semanticHash,
    analysisEvidenceHashes: analysisResults.map((row) => row.evidenceHash),
    interfaceRecoveryEvidenceHashes: interfaceRecoveries.map((row) => row.evidenceHash),
    nozzleAssessmentEvidenceHashes: nozzleAssessments.map((row) => row.evidenceHash),
    b31ApplicationEvidenceHash: b31Application.evidenceHash,
  });
  return requireLinearPipingQualifiedApplicationResult(draft);
}

function buildLimitations(analysisResults, nozzleAssessments, b31Application, notConfigured) {
  const rows = [];
  for (const result of analysisResults) {
    for (const limitation of result.limitations) {
      rows.push(deepFreeze({
        sourceKind: 'ANALYSIS_RESULT',
        sourceId: result.analysisIdentity,
        sourceSemanticHash: result.semanticHash,
        limitation,
      }));
    }
  }
  for (const assessment of nozzleAssessments) {
    for (const limitation of assessment.limitations) {
      rows.push(deepFreeze({
        sourceKind: 'NOZZLE_ASSESSMENT',
        sourceId: assessment.interfaceId,
        sourceSemanticHash: assessment.semanticHash,
        limitation,
      }));
    }
  }
  for (const entry of b31Application.results) {
    for (const limitation of entry.codeResult.limitations) {
      rows.push(deepFreeze({
        sourceKind: 'B31_CODE_RESULT',
        sourceId: entry.checkId,
        sourceSemanticHash: entry.codeResult.semanticHash,
        limitation,
      }));
    }
  }
  for (const code of notConfigured) {
    rows.push(deepFreeze({
      sourceKind: 'APPLICATION_CONFIGURATION',
      sourceId: code.split(':')[1],
      sourceSemanticHash: 'fnv1a64:0000000000000000',
      limitation: deepFreeze({
        code,
        severity: 'BLOCKER',
        disclosure: 'No caller-supplied nozzle allowable profile was configured for this governed nozzle interface.',
      }),
    }));
  }
  return deepFreeze(rows.sort((left, right) => (
    compareAscii(left.sourceKind, right.sourceKind)
    || compareAscii(left.sourceId, right.sourceId)
    || compareAscii(JSON.stringify(left.limitation), JSON.stringify(right.limitation))
  )));
}

function requireUnique(values, code) {
  if (new Set(values).size !== values.length) {
    failCodeApplication('Duplicate application identity is not permitted.', code, { values });
  }
}

export function requireLinearPipingQualifiedApplicationResult(record) {
  exactKeys(record, APPLICATION_RESULT_KEYS, 'qualifiedApplicationResult');
  if (record.schema !== APPLICATION_RESULT_SCHEMA) {
    failCodeApplication('Qualified application result schema is invalid.', 'PIPING_APPLICATION_RESULT_INVALID');
  }
  nonEmptyString(record.applicationId, 'qualifiedApplicationResult.applicationId');
  requireArray(record.analysisResultSemanticHashes, 'qualifiedApplicationResult.analysisResultSemanticHashes')
    .forEach((hash, index) => requireHash(hash, `qualifiedApplicationResult.analysisResultSemanticHashes[${index}]`));
  requireHash(record.interfaceSetSemanticHash, 'qualifiedApplicationResult.interfaceSetSemanticHash');
  requireArray(record.interfaceRecoverySemanticHashes, 'qualifiedApplicationResult.interfaceRecoverySemanticHashes')
    .forEach((hash, index) => requireHash(hash, `qualifiedApplicationResult.interfaceRecoverySemanticHashes[${index}]`));
  requireArray(record.nozzleAssessmentSemanticHashes, 'qualifiedApplicationResult.nozzleAssessmentSemanticHashes')
    .forEach((hash, index) => requireHash(hash, `qualifiedApplicationResult.nozzleAssessmentSemanticHashes[${index}]`));
  requireHash(record.b31ApplicationSemanticHash, 'qualifiedApplicationResult.b31ApplicationSemanticHash');
  requireHash(record.semanticHash, 'qualifiedApplicationResult.semanticHash');
  requireHash(record.evidenceHash, 'qualifiedApplicationResult.evidenceHash');
  if (!APPLICATION_STATUSES.includes(record.status)) {
    failCodeApplication('Qualified application status is invalid.', 'PIPING_APPLICATION_RESULT_INVALID');
  }
  exactKeys(record.assessmentSummary, ASSESSMENT_SUMMARY_KEYS, 'qualifiedApplicationResult.assessmentSummary');
  requireArray(record.notConfigured, 'qualifiedApplicationResult.notConfigured');
  requireArray(record.limitations, 'qualifiedApplicationResult.limitations');
  if (record.semanticHash !== semanticHash(applicationResultSemanticProjection(record))) {
    failCodeApplication('Qualified application result semantic hash is stale.', 'PIPING_APPLICATION_RESULT_HASH_MISMATCH');
  }
  return deepFreeze({ ...record });
}

export function applicationResultSemanticProjection(record) {
  const { semanticHash: _semanticHash, evidenceHash: _evidenceHash, ...projection } = record;
  return projection;
}
