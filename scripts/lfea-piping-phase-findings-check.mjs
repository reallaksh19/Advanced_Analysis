#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER_PATH = path.join(ROOT, 'reports/lfea-piping-phase-findings-ledger.json');
const EXPECTED_FINDINGS = Object.freeze([
  'AUD-A0-001',
  'AUD-A3-001',
  'AUD-A3-002',
  'AUD-A4-001',
  'AUD-A5-001',
  'AUD-A6-001',
  'AUD-A7-001',
  'AUD-DOC-001',
  'AUD-DOC-002',
  'AUD-L007-001',
]);
const EXPECTED_STATUSES = Object.freeze([
  'VERIFIED',
  'PARTIALLY_VERIFIED',
  'CONTRADICTED',
  'UNRESOLVED_GATE',
  'NOT_IMPLEMENTED',
  'NOT_APPLICABLE',
]);
const ROOT_KEYS = Object.freeze([
  'schema',
  'repository',
  'program',
  'sourceAuditPath',
  'allowedStatuses',
  'phases',
  'findings',
]);
const PHASE_KEYS = Object.freeze([
  'phaseId',
  'title',
  'status',
  'scope',
  'evidencePaths',
  'addressedFindingIds',
  'completedAtUtc',
]);
const FINDING_KEYS = Object.freeze([
  'findingId',
  'gate',
  'severity',
  'auditStatus',
  'currentStatus',
  'ownerPhase',
  'evidencePaths',
  'remainingCondition',
]);

const ledger = readJson(LEDGER_PATH);
requireExactKeys(ledger, ROOT_KEYS, 'LFEA_PHASE_LEDGER_KEYS_INVALID');
requireEqual(ledger.schema, 'lfea-piping-phase-findings-ledger/v1', 'LFEA_PHASE_LEDGER_SCHEMA_INVALID');
requireEqual(ledger.repository, 'reallaksh19/Advanced_Analysis', 'LFEA_PHASE_LEDGER_REPOSITORY_INVALID');
requireEqual(ledger.program, 'PRIORITY_2_LINEAR_PIPING_FEA', 'LFEA_PHASE_LEDGER_PROGRAM_INVALID');
requireEqual(
  ledger.sourceAuditPath,
  'docs/CONSOLIDATED_LFEA_PIPING_AUDIT_2026-07-31.md',
  'LFEA_PHASE_LEDGER_SOURCE_AUDIT_INVALID',
);
requireEqual(
  JSON.stringify(ledger.allowedStatuses),
  JSON.stringify(EXPECTED_STATUSES),
  'LFEA_PHASE_LEDGER_STATUS_VOCABULARY_CHANGED',
);
requireExistingPath(ledger.sourceAuditPath, 'LFEA_PHASE_LEDGER_SOURCE_AUDIT_MISSING');

requireArray(ledger.phases, 'phases');
requireArray(ledger.findings, 'findings');
if (ledger.phases.length === 0) fail('LFEA_PHASE_LEDGER_EMPTY');

const phaseIds = new Set();
const phaseById = new Map();
for (const [index, phase] of ledger.phases.entries()) {
  requireExactKeys(phase, PHASE_KEYS, `LFEA_PHASE_${index}_KEYS_INVALID`);
  requireIdentity(phase.phaseId, `phases[${index}].phaseId`);
  requireText(phase.title, `phases[${index}].title`);
  requireStatus(phase.status, `phases[${index}].status`);
  if (phase.status === 'VERIFIED' && phase.completedAtUtc === null) {
    fail('LFEA_PHASE_VERIFIED_WITHOUT_COMPLETION_TIME', { phaseId: phase.phaseId });
  }
  if (phase.completedAtUtc !== null && !isUtcTimestamp(phase.completedAtUtc)) {
    fail('LFEA_PHASE_COMPLETION_TIME_INVALID', { phaseId: phase.phaseId, value: phase.completedAtUtc });
  }
  requireUnique(phaseIds, phase.phaseId, 'LFEA_PHASE_DUPLICATE');
  requireNonEmptyTextArray(phase.scope, `phases[${index}].scope`);
  requireNonEmptyTextArray(phase.evidencePaths, `phases[${index}].evidencePaths`);
  phase.evidencePaths.forEach((entry) => requireExistingPath(entry, 'LFEA_PHASE_EVIDENCE_MISSING'));
  requireNonEmptyTextArray(phase.addressedFindingIds, `phases[${index}].addressedFindingIds`);
  requireAsciiSortedUnique(phase.addressedFindingIds, `phases[${index}].addressedFindingIds`);
  phaseById.set(phase.phaseId, phase);
}

const findingIds = [];
const findingById = new Map();
for (const [index, finding] of ledger.findings.entries()) {
  requireExactKeys(finding, FINDING_KEYS, `LFEA_FINDING_${index}_KEYS_INVALID`);
  requireIdentity(finding.findingId, `findings[${index}].findingId`);
  requireText(finding.gate, `findings[${index}].gate`);
  requireText(finding.severity, `findings[${index}].severity`);
  requireStatus(finding.auditStatus, `findings[${index}].auditStatus`);
  requireStatus(finding.currentStatus, `findings[${index}].currentStatus`);
  requireIdentity(finding.ownerPhase, `findings[${index}].ownerPhase`);
  requireNonEmptyTextArray(finding.evidencePaths, `findings[${index}].evidencePaths`);
  finding.evidencePaths.forEach((entry) => requireExistingPath(entry, 'LFEA_FINDING_EVIDENCE_MISSING'));

  if (finding.currentStatus === 'VERIFIED') {
    if (finding.remainingCondition !== null) {
      fail('LFEA_VERIFIED_FINDING_HAS_REMAINING_CONDITION', { findingId: finding.findingId });
    }
  } else {
    requireText(finding.remainingCondition, `findings[${index}].remainingCondition`);
  }

  findingIds.push(finding.findingId);
  if (findingById.has(finding.findingId)) {
    fail('LFEA_FINDING_DUPLICATE', { findingId: finding.findingId });
  }
  findingById.set(finding.findingId, finding);
}

requireEqual(
  JSON.stringify([...findingIds].sort(compareAscii)),
  JSON.stringify([...EXPECTED_FINDINGS].sort(compareAscii)),
  'LFEA_FINDING_REGISTER_DRIFT',
);

for (const phase of ledger.phases) {
  for (const findingId of phase.addressedFindingIds) {
    if (!findingById.has(findingId)) {
      fail('LFEA_PHASE_REFERENCES_UNKNOWN_FINDING', { phaseId: phase.phaseId, findingId });
    }
  }
}

for (const finding of ledger.findings) {
  const owner = phaseById.get(finding.ownerPhase);
  if (!owner) {
    fail('LFEA_FINDING_OWNER_PHASE_MISSING', {
      findingId: finding.findingId,
      ownerPhase: finding.ownerPhase,
    });
  }
  if (!owner.addressedFindingIds.includes(finding.findingId)) {
    fail('LFEA_FINDING_OWNER_PHASE_MISMATCH', {
      findingId: finding.findingId,
      ownerPhase: finding.ownerPhase,
      addressedFindingIds: owner.addressedFindingIds,
    });
  }
}

const verifiedFindings = ledger.findings
  .filter((entry) => entry.currentStatus === 'VERIFIED')
  .map((entry) => entry.findingId)
  .sort(compareAscii);
const openFindings = ledger.findings
  .filter((entry) => entry.currentStatus !== 'VERIFIED')
  .map((entry) => ({ findingId: entry.findingId, status: entry.currentStatus }))
  .sort((left, right) => compareAscii(left.findingId, right.findingId));

console.log(JSON.stringify({
  schema: ledger.schema,
  phaseCount: ledger.phases.length,
  findingCount: ledger.findings.length,
  verifiedFindings,
  openFindings,
  programDisposition: openFindings.length === 0 ? 'ELIGIBLE_FOR_RELEASE_REVIEW' : 'BLOCKED',
}));

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail('LFEA_PHASE_LEDGER_JSON_INVALID', { message: error.message });
  }
}

function requireExactKeys(value, expected, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, { reason: 'NOT_A_RECORD' });
  const actual = Object.keys(value).sort(compareAscii);
  const required = [...expected].sort(compareAscii);
  requireEqual(JSON.stringify(actual), JSON.stringify(required), code);
}

function requireArray(value, field) {
  if (!Array.isArray(value)) fail('LFEA_PHASE_LEDGER_ARRAY_REQUIRED', { field });
}

function requireNonEmptyTextArray(value, field) {
  requireArray(value, field);
  if (value.length === 0) fail('LFEA_PHASE_LEDGER_NON_EMPTY_ARRAY_REQUIRED', { field });
  value.forEach((entry, index) => requireText(entry, `${field}[${index}]`));
}

function requireAsciiSortedUnique(value, field) {
  const expected = [...new Set(value)].sort(compareAscii);
  requireEqual(JSON.stringify(value), JSON.stringify(expected), 'LFEA_PHASE_LEDGER_ORDER_INVALID', { field });
}

function requireIdentity(value, field) {
  requireText(value, field);
  if (!/^[A-Z0-9._-]+$/u.test(value)) fail('LFEA_PHASE_LEDGER_IDENTITY_INVALID', { field, value });
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') fail('LFEA_PHASE_LEDGER_TEXT_REQUIRED', { field });
}

function requireStatus(value, field) {
  if (!EXPECTED_STATUSES.includes(value)) fail('LFEA_PHASE_LEDGER_STATUS_INVALID', { field, value });
}

function requireExistingPath(relativePath, code) {
  if (typeof relativePath !== 'string' || relativePath.includes('..') || path.isAbsolute(relativePath)) {
    fail('LFEA_PHASE_LEDGER_PATH_INVALID', { relativePath });
  }
  if (!fs.existsSync(path.join(ROOT, relativePath))) fail(code, { relativePath });
}

function requireUnique(set, value, code) {
  if (set.has(value)) fail(code, { value });
  set.add(value);
}

function requireEqual(actual, expected, code, evidence = {}) {
  if (actual !== expected) fail(code, { ...evidence, actual, expected });
}

function isUtcTimestamp(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value)
    && Number.isFinite(Date.parse(value));
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code, evidence = {}) {
  const error = new Error(code);
  error.code = code;
  error.evidence = evidence;
  throw error;
}
