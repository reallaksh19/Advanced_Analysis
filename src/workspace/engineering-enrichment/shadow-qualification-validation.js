import {
  canonicalStringify,
  semanticHash,
} from '../../core/shared-piping-model/canonical-json.js';
import { isPlainRecord } from '../../core/shared-piping-model/immutable.js';
import { assertExactSelector } from './selectors.js';
import {
  ENRICHMENT_EVIDENCE_INDEX_SCHEMA,
  ENRICHMENT_PROPOSAL_HANDOFF_SCHEMA,
  ENRICHMENT_QUALIFICATION_CHECK_IDS,
  ENRICHMENT_QUALIFICATION_MANIFEST_SCHEMA,
  assertEngineeringEnrichmentEvidenceIndex as assertBaseIndex,
  assertEngineeringEnrichmentProposalHandoff as assertBaseHandoff,
  assertEngineeringEnrichmentQualificationManifest as assertBaseManifest,
  buildEnrichmentEvidenceIndex as buildBaseIndex,
  buildEnrichmentProposalHandoff as buildBaseHandoff,
  buildEnrichmentQualificationManifest as buildBaseManifest,
} from './shadow-qualification.js';

export {
  ENRICHMENT_EVIDENCE_INDEX_SCHEMA,
  ENRICHMENT_PROPOSAL_HANDOFF_SCHEMA,
  ENRICHMENT_QUALIFICATION_CHECK_IDS,
  ENRICHMENT_QUALIFICATION_MANIFEST_SCHEMA,
};

const CHECK_KEYS = Object.freeze([
  'checkId', 'status', 'sourceNodeIds', 'sourceArtifactHashes',
  'observedArtifactStatus', 'blockers',
]);
const ROLE_KEYS = Object.freeze([
  'nodeId', 'artifactKey', 'present', 'optional', 'artifactSchemas',
  'identityHashes', 'qualificationCheckIds',
]);
const PROPOSAL_INDEX_KEYS = Object.freeze([
  'proposalId', 'proposalHash', 'sourceSnapshotHash', 'sourceRowHash', 'fieldId',
  'selector', 'proposalStatus', 'resolutionDisposition', 'targetIds',
  'selectedTargetId', 'projectionDisposition', 'projectionTargetId', 'blockerCodes',
]);
const TARGET_INDEX_KEYS = Object.freeze([
  'targetId', 'proposalIds', 'fieldIds', 'resolutionDispositions',
  'projectionDispositions',
]);
const METRIC_INDEX_KEYS = Object.freeze([
  'metricKey', 'metricId', 'scopeId', 'loadCaseId', 'unit', 'baselineValue',
  'candidateValue', 'delta', 'absoluteDelta', 'relativeDelta',
]);
const BLOCKER_INDEX_KEYS = Object.freeze(['code', 'locations']);
const PROVENANCE_KEYS = Object.freeze([
  'proposalId', 'proposalHash', 'sourceSnapshotHash', 'sourceRowHash',
  'sourceFileName', 'sourceSheetName', 'sourceSha256', 'sourceRowNumber',
  'sourceRowIndex', 'policyHash',
]);
const HANDOFF_PROPOSAL_KEYS = Object.freeze([
  'proposalId', 'proposalHash', 'fieldId', 'selector', 'proposedValue', 'unit',
  'proposalStatus', 'resolutionDisposition', 'resolvedTargetId',
  'candidateDisposition', 'source', 'evidenceHashes', 'limitations',
]);
const HANDOFF_SOURCE_KEYS = Object.freeze([
  'snapshotHash', 'rowHash', 'fileName', 'sheetName', 'sha256', 'rowNumber',
  'rowIndex', 'policyHash',
]);
const HANDOFF_EVIDENCE_KEYS = Object.freeze([
  'candidateProjectionHash', 'structuralImpactHash', 'numericalImpactHash',
  'reviewPacketHash', 'bundleHash', 'graphHash', 'manifestHash', 'indexHash',
]);
const ROLE_IDS = Object.freeze([
  'BASELINE_REFERENCE', 'BASELINE_REQUEST', 'BASELINE_RESULT',
  'CANDIDATE_PROJECTION', 'CANDIDATE_REQUEST', 'CANDIDATE_RESULT',
  'ENGINE_DESCRIPTOR', 'MASTER_SNAPSHOT_SET', 'OBSERVED_AUTHORITY',
  'PORTABLE_BUNDLE', 'PROPOSAL_SET', 'REPEATED_CANDIDATE_RESULT',
  'REVIEW_PACKET', 'SHADOW_REPRODUCIBILITY_RECEIPT', 'STALENESS_REPORT',
  'STEP_1_RESOLUTION', 'STEP_2_STRUCTURAL_IMPACT',
  'STEP_3_NUMERICAL_IMPACT',
]);

export function buildEnrichmentQualificationManifest(input) {
  return assertEngineeringEnrichmentQualificationManifest(buildBaseManifest(input));
}

export function assertEngineeringEnrichmentQualificationManifest(value) {
  assertBaseManifest(value);
  value.checks.forEach((row, index) => {
    exact(row, CHECK_KEYS, `checks[${index}]`);
    sortedUniqueText(row.sourceNodeIds, `checks[${index}].sourceNodeIds`, true);
    sortedUniqueText(
      row.sourceArtifactHashes,
      `checks[${index}].sourceArtifactHashes`,
      row.status !== 'EVIDENCE_ABSENT_OPTIONAL',
    );
    if (row.status === 'EVIDENCE_ABSENT_OPTIONAL'
      && row.sourceArtifactHashes.length !== 0) {
      fail(`checks[${index}] optional absence must not carry artifact hashes.`);
    }
    if (!Array.isArray(row.blockers)
      || row.blockers.some((blocker) => !isPlainRecord(blocker))) {
      fail(`checks[${index}].blockers must contain plain records.`);
    }
    assertCanonicalRecordOrder(row.blockers, `checks[${index}].blockers`);
  });
  return value;
}

export function buildEnrichmentEvidenceIndex(input) {
  assertEngineeringEnrichmentQualificationManifest(input.qualificationManifest);
  return assertEngineeringEnrichmentEvidenceIndex(buildBaseIndex(input));
}

export function assertEngineeringEnrichmentEvidenceIndex(value) {
  assertBaseIndex(value);
  const roles = validateRows(value.byRole, ROLE_KEYS, 'nodeId', validateRole);
  if (!sameList(roles.map((row) => row.nodeId), ROLE_IDS)) {
    fail('byRole must contain the complete fixed lineage role set.');
  }
  const proposals = validateRows(
    value.byProposal,
    PROPOSAL_INDEX_KEYS,
    'proposalId',
    validateProposalIndex,
  );
  const targets = validateRows(
    value.byTarget,
    TARGET_INDEX_KEYS,
    'targetId',
    validateTargetIndex,
  );
  validateRows(value.byMetric, METRIC_INDEX_KEYS, 'metricKey', validateMetricIndex);
  validateRows(value.byBlocker, BLOCKER_INDEX_KEYS, 'code', validateBlockerIndex);
  const provenance = validateRows(
    value.byProvenance,
    PROVENANCE_KEYS,
    'proposalId',
    validateProvenance,
  );
  const proposalById = new Map(proposals.map((row) => [row.proposalId, row]));
  const provenanceById = new Map(provenance.map((row) => [row.proposalId, row]));
  if (!sameList([...proposalById.keys()], [...provenanceById.keys()])) {
    fail('proposal and provenance index identities differ.');
  }
  proposals.forEach((proposal) => {
    const source = provenanceById.get(proposal.proposalId);
    if (
      source.proposalHash !== proposal.proposalHash
      || source.sourceSnapshotHash !== proposal.sourceSnapshotHash
      || source.sourceRowHash !== proposal.sourceRowHash
    ) {
      fail(`provenance differs for proposal ${proposal.proposalId}.`);
    }
  });
  targets.forEach((target) => target.proposalIds.forEach((proposalId) => {
    if (!proposalById.has(proposalId)) {
      fail(`target ${target.targetId} references unknown proposal ${proposalId}.`);
    }
  }));
  return value;
}

export function buildEnrichmentProposalHandoff(input) {
  assertEngineeringEnrichmentQualificationManifest(input.qualificationManifest);
  assertEngineeringEnrichmentEvidenceIndex(input.evidenceIndex);
  return assertEngineeringEnrichmentProposalHandoff(buildBaseHandoff(input));
}

export function assertEngineeringEnrichmentProposalHandoff(value) {
  assertBaseHandoff(value);
  const proposals = validateRows(
    value.proposals,
    HANDOFF_PROPOSAL_KEYS,
    'proposalId',
    (row, index) => validateHandoffProposal(row, index, value),
  );
  if (proposals.length === 0) fail('handoff must contain proposals.');
  return value;
}

function validateRole(row, index) {
  text(row.artifactKey, `byRole[${index}].artifactKey`);
  boolean(row.present, `byRole[${index}].present`);
  boolean(row.optional, `byRole[${index}].optional`);
  sortedUniqueText(row.artifactSchemas, `byRole[${index}].artifactSchemas`, row.present);
  sortedUniqueText(row.identityHashes, `byRole[${index}].identityHashes`, row.present);
  sortedUniqueText(
    row.qualificationCheckIds,
    `byRole[${index}].qualificationCheckIds`,
    false,
  ).forEach((checkId) => {
    if (!ENRICHMENT_QUALIFICATION_CHECK_IDS.includes(checkId)) {
      fail(`byRole[${index}] contains unknown qualification check ${checkId}.`);
    }
  });
  if (!row.present && (row.artifactSchemas.length || row.identityHashes.length)) {
    fail(`byRole[${index}] absent role must not carry artifact evidence.`);
  }
}

function validateProposalIndex(row, index) {
  ['proposalHash', 'sourceSnapshotHash', 'sourceRowHash', 'fieldId',
    'proposalStatus', 'resolutionDisposition', 'projectionDisposition']
    .forEach((field) => text(row[field], `byProposal[${index}].${field}`));
  assertExactSelector(row.selector);
  sortedUniqueText(row.targetIds, `byProposal[${index}].targetIds`, false);
  nullableText(row.selectedTargetId, `byProposal[${index}].selectedTargetId`);
  nullableText(row.projectionTargetId, `byProposal[${index}].projectionTargetId`);
  sortedUniqueText(row.blockerCodes, `byProposal[${index}].blockerCodes`, false);
  if (row.selectedTargetId !== null && !row.targetIds.includes(row.selectedTargetId)) {
    fail(`byProposal[${index}] selected target is not in targetIds.`);
  }
}

function validateTargetIndex(row, index) {
  sortedUniqueText(row.proposalIds, `byTarget[${index}].proposalIds`, true);
  sortedUniqueText(row.fieldIds, `byTarget[${index}].fieldIds`, true);
  sortedUniqueText(
    row.resolutionDispositions,
    `byTarget[${index}].resolutionDispositions`,
    true,
  );
  sortedUniqueText(
    row.projectionDispositions,
    `byTarget[${index}].projectionDispositions`,
    true,
  );
}

function validateMetricIndex(row, index) {
  ['metricId', 'scopeId', 'loadCaseId', 'unit']
    .forEach((field) => text(row[field], `byMetric[${index}].${field}`));
  ['baselineValue', 'candidateValue', 'delta', 'absoluteDelta']
    .forEach((field) => finite(row[field], `byMetric[${index}].${field}`));
  if (row.relativeDelta !== null) finite(row.relativeDelta, `byMetric[${index}].relativeDelta`);
  const expectedKey = semanticHash({
    metricId: row.metricId,
    scopeId: row.scopeId,
    loadCaseId: row.loadCaseId,
  });
  if (row.metricKey !== expectedKey) fail(`byMetric[${index}].metricKey is invalid.`);
  if (row.delta !== normalizedZero(row.candidateValue - row.baselineValue)) {
    fail(`byMetric[${index}].delta differs from candidate minus baseline.`);
  }
  if (row.absoluteDelta !== Math.abs(row.delta)) {
    fail(`byMetric[${index}].absoluteDelta is invalid.`);
  }
}

function validateBlockerIndex(row, index) {
  sortedUniqueText(row.locations, `byBlocker[${index}].locations`, true);
}

function validateProvenance(row, index) {
  ['proposalHash', 'sourceSnapshotHash', 'sourceRowHash', 'sourceFileName',
    'sourceSheetName', 'policyHash']
    .forEach((field) => text(row[field], `byProvenance[${index}].${field}`));
  if (!/^[a-f0-9]{64}$/u.test(text(row.sourceSha256, `byProvenance[${index}].sourceSha256`))) {
    fail(`byProvenance[${index}].sourceSha256 must be lowercase SHA-256.`);
  }
  nullableNonnegativeInteger(row.sourceRowNumber, `byProvenance[${index}].sourceRowNumber`);
  nullableNonnegativeInteger(row.sourceRowIndex, `byProvenance[${index}].sourceRowIndex`);
}

function validateHandoffProposal(row, index, handoff) {
  ['proposalHash', 'fieldId', 'unit', 'proposalStatus', 'resolutionDisposition',
    'candidateDisposition']
    .forEach((field) => text(row[field], `proposals[${index}].${field}`));
  assertExactSelector(row.selector);
  finite(row.proposedValue, `proposals[${index}].proposedValue`);
  nullableText(row.resolvedTargetId, `proposals[${index}].resolvedTargetId`);
  exact(row.source, HANDOFF_SOURCE_KEYS, `proposals[${index}].source`);
  ['snapshotHash', 'rowHash', 'fileName', 'sheetName', 'policyHash']
    .forEach((field) => text(row.source[field], `proposals[${index}].source.${field}`));
  if (!/^[a-f0-9]{64}$/u.test(text(row.source.sha256, `proposals[${index}].source.sha256`))) {
    fail(`proposals[${index}].source.sha256 must be lowercase SHA-256.`);
  }
  nullableNonnegativeInteger(row.source.rowNumber, `proposals[${index}].source.rowNumber`);
  nullableNonnegativeInteger(row.source.rowIndex, `proposals[${index}].source.rowIndex`);
  exact(
    row.evidenceHashes,
    HANDOFF_EVIDENCE_KEYS,
    `proposals[${index}].evidenceHashes`,
  );
  HANDOFF_EVIDENCE_KEYS.forEach((field) => {
    text(row.evidenceHashes[field], `proposals[${index}].evidenceHashes.${field}`);
  });
  if (
    row.evidenceHashes.bundleHash !== handoff.bundleHash
    || row.evidenceHashes.graphHash !== handoff.graphHash
    || row.evidenceHashes.manifestHash !== handoff.manifestHash
    || row.evidenceHashes.indexHash !== handoff.indexHash
  ) {
    fail(`proposals[${index}] evidence identities differ from handoff.`);
  }
  sortedUniqueText(row.limitations, `proposals[${index}].limitations`, false);
}

function validateRows(rows, keys, identityKey, validator) {
  if (!Array.isArray(rows)) fail(`${identityKey} rows must be an array.`);
  rows.forEach((row, index) => {
    exact(row, keys, `${identityKey}[${index}]`);
    text(row[identityKey], `${identityKey}[${index}].${identityKey}`);
    validator(row, index);
  });
  const identities = rows.map((row) => row[identityKey]);
  if (!sameList(identities, [...new Set(identities)].sort(ascii))) {
    fail(`${identityKey} rows must be sorted and unique.`);
  }
  return rows;
}

function assertCanonicalRecordOrder(rows, label) {
  const keys = rows.map((row) => `${semanticHash(row)}\u0000${canonicalStringify(row)}`);
  if (!sameList(keys, [...keys].sort(ascii))) fail(`${label} must be canonical.`);
}

function sortedUniqueText(value, label, required) {
  if (!Array.isArray(value) || (required && value.length === 0)) {
    fail(`${label} must be ${required ? 'a non-empty ' : 'an '}array.`);
  }
  const rows = value.map((row, index) => text(row, `${label}[${index}]`));
  if (!sameList(rows, [...new Set(rows)].sort(ascii))) {
    fail(`${label} must be sorted and unique.`);
  }
  return rows;
}

function exact(value, keys, label) {
  if (!isPlainRecord(value)
    || !sameList(Object.keys(value).sort(ascii), [...keys].sort(ascii))) {
    fail(`${label} keys are invalid.`);
  }
}
function text(value, label) {
  const result = String(value ?? '').trim();
  if (!result) fail(`${label} is required.`);
  return result;
}
function nullableText(value, label) {
  if (value !== null) text(value, label);
}
function boolean(value, label) {
  if (typeof value !== 'boolean') fail(`${label} must be boolean.`);
}
function finite(value, label) {
  if (!Number.isFinite(value)) fail(`${label} must be finite.`);
}
function nullableNonnegativeInteger(value, label) {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
    fail(`${label} must be null or a non-negative safe integer.`);
  }
}
function normalizedZero(value) { return Object.is(value, -0) ? 0 : value; }
function sameList(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function fail(message, Constructor = TypeError) {
  throw new Constructor(`EngineeringEnrichmentShadowQualificationValidation: ${message}`);
}
