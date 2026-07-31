import { exactKeys, nonEmptyString } from '../shared-analysis-contract/validation.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { compareAscii, failQualification } from './contracts.js';
import {
  ROLLBACK_EVIDENCE_KEYS,
  ROLLBACK_EVIDENCE_SCHEMA,
  canonicalSourceEvidence,
  requireArray,
  requireBoolean,
  requireCurrentHashes,
  requireExternalText,
  requireHash,
  requireHead,
  requireOptionalHashMatch,
  requireUtc,
} from './external-evidence-contracts.js';

const COMMAND_KEYS = Object.freeze(['commandId', 'commandText', 'commandHash', 'logHash']);
const MIGRATION_KEYS = Object.freeze(['classification', 'details']);
const ROLLBACK_CHECK_KEYS = Object.freeze(['checkId', 'status', 'evidenceHash']);

export function sealRollbackEvidence(source) {
  exactKeys(source, ROLLBACK_EVIDENCE_KEYS, 'rollbackEvidence');
  if (source.schema !== ROLLBACK_EVIDENCE_SCHEMA) {
    failQualification('Rollback evidence schema is invalid.', 'PIPING_ROLLBACK_EVIDENCE_INVALID');
  }
  const draft = {
    schema: source.schema,
    evidenceId: requireExternalText(source.evidenceId, 'rollbackEvidence.evidenceId'),
    qualifiedHead: requireHead(source.qualifiedHead, 'rollbackEvidence.qualifiedHead'),
    rollbackTarget: requireHead(source.rollbackTarget, 'rollbackEvidence.rollbackTarget'),
    releaseCommand: canonicalCommand(source.releaseCommand, 'rollbackEvidence.releaseCommand'),
    rollbackCommand: canonicalCommand(source.rollbackCommand, 'rollbackEvidence.rollbackCommand'),
    migrationImpact: canonicalMigrationImpact(source.migrationImpact),
    restoredApplicationPath: requireBoolean(
      source.restoredApplicationPath,
      'rollbackEvidence.restoredApplicationPath',
    ),
    preservedProjectData: requireBoolean(
      source.preservedProjectData,
      'rollbackEvidence.preservedProjectData',
    ),
    postRollbackChecks: canonicalRollbackChecks(source.postRollbackChecks),
    sourceEvidence: canonicalSourceEvidence(
      source.sourceEvidence,
      'rollbackEvidence.sourceEvidence',
    ),
    reviewer: requireExternalText(source.reviewer, 'rollbackEvidence.reviewer'),
    completedAtUtc: requireUtc(source.completedAtUtc, 'rollbackEvidence.completedAtUtc'),
    semanticHash: '',
    evidenceHash: '',
  };
  if (draft.qualifiedHead === draft.rollbackTarget) {
    failQualification('Rollback target must differ from the qualified head.', 'PIPING_ROLLBACK_TARGET_INVALID');
  }
  draft.semanticHash = semanticHash(rollbackSemanticProjection(draft));
  draft.evidenceHash = semanticHash(rollbackEvidenceProjection(draft));
  requireOptionalHashMatch(source, draft, 'PIPING_ROLLBACK_EVIDENCE_HASH_MISMATCH');
  return deepFreeze(draft);
}

export function requireRollbackEvidence(record) {
  const sealed = sealRollbackEvidence(record);
  requireCurrentHashes(record, sealed, 'PIPING_ROLLBACK_EVIDENCE_HASH_MISMATCH');
  return sealed;
}

function canonicalCommand(source, field) {
  exactKeys(source, COMMAND_KEYS, field);
  const commandText = nonEmptyString(source.commandText, `${field}.commandText`);
  const commandHash = requireHash(source.commandHash, `${field}.commandHash`);
  if (commandHash !== semanticHash({ commandText })) {
    failQualification(`${field}.commandHash is stale.`, 'PIPING_ROLLBACK_COMMAND_HASH_MISMATCH');
  }
  return deepFreeze({
    commandId: nonEmptyString(source.commandId, `${field}.commandId`),
    commandText,
    commandHash,
    logHash: requireHash(source.logHash, `${field}.logHash`),
  });
}

function canonicalMigrationImpact(source) {
  exactKeys(source, MIGRATION_KEYS, 'rollbackEvidence.migrationImpact');
  if (!['NONE', 'REVERSIBLE', 'MANUAL'].includes(source.classification)) {
    failQualification(
      'Migration-impact classification is invalid.',
      'PIPING_ROLLBACK_MIGRATION_INVALID',
    );
  }
  return deepFreeze({
    classification: source.classification,
    details: nonEmptyString(source.details, 'rollbackEvidence.migrationImpact.details'),
  });
}

function canonicalRollbackChecks(source) {
  requireArray(source, 'rollbackEvidence.postRollbackChecks');
  if (source.length === 0) {
    failQualification('Rollback checks must not be empty.', 'PIPING_ROLLBACK_CHECKS_INVALID');
  }
  const checks = source.map((row, index) => {
    exactKeys(row, ROLLBACK_CHECK_KEYS, `rollbackEvidence.postRollbackChecks[${index}]`);
    if (row.status !== 'PASS') {
      failQualification('Rollback checks must pass.', 'PIPING_ROLLBACK_CHECKS_INVALID');
    }
    return deepFreeze({
      checkId: nonEmptyString(row.checkId, `postRollbackChecks[${index}].checkId`),
      status: row.status,
      evidenceHash: requireHash(
        row.evidenceHash,
        `postRollbackChecks[${index}].evidenceHash`,
      ),
    });
  }).sort((left, right) => compareAscii(left.checkId, right.checkId));
  if (new Set(checks.map((row) => row.checkId)).size !== checks.length) {
    failQualification('Rollback check IDs must be unique.', 'PIPING_ROLLBACK_CHECKS_INVALID');
  }
  return deepFreeze(checks);
}

function rollbackSemanticProjection(record) {
  const {
    sourceEvidence: _sourceEvidence,
    reviewer: _reviewer,
    completedAtUtc: _completedAtUtc,
    semanticHash: _semanticHash,
    evidenceHash: _evidenceHash,
    ...projection
  } = record;
  return projection;
}

function rollbackEvidenceProjection(record) {
  return {
    semanticHash: record.semanticHash,
    sourceEvidence: record.sourceEvidence,
    reviewer: record.reviewer,
    completedAtUtc: record.completedAtUtc,
    commandLogs: [record.releaseCommand.logHash, record.rollbackCommand.logHash],
    checkEvidenceHashes: record.postRollbackChecks.map((row) => row.evidenceHash),
  };
}
