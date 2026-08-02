import {
  canonicalStringify,
  canonicalizeJson,
  semanticHash,
} from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../../core/shared-piping-model/immutable.js';
import {
  assertEngineeringEnrichmentProposal,
  assertEngineeringEnrichmentProposalAuthority,
} from './master-adapters.js';
import { assertMasterDataSnapshot } from './master-snapshot.js';
import { assertExactSelector, exactSelectorIdentity } from './selectors.js';

export const ENRICHMENT_TARGET_SCHEMA = 'EngineeringEnrichmentTarget.v2';
export const ENRICHMENT_RESOLUTION_SCHEMA = 'EngineeringEnrichmentResolution.v2';
export const ENRICHMENT_TARGET_KINDS = Object.freeze(['COMPONENT', 'SUPPORT']);

const TARGET_KEYS = Object.freeze(['schema', 'targetKind', 'targetId', 'selector']);
const INPUT_KEYS = Object.freeze([
  'sourceDatasetHash', 'sourceSharedModelHash', 'masterSnapshots', 'proposals',
  'targets',
]);

export function resolveExactEnrichmentProposals(input) {
  assertExactKeys(input, INPUT_KEYS, 'Enrichment resolution input');
  const sourceDatasetHash = requireSha256(input.sourceDatasetHash, 'sourceDatasetHash');
  const sourceSharedModelHash = requiredText(
    input.sourceSharedModelHash,
    'sourceSharedModelHash',
  );
  const masterSnapshots = validateSnapshots(input.masterSnapshots);
  const proposals = validateProposals(input.proposals, masterSnapshots);
  const targets = validateTargets(input.targets);
  const targetIndex = indexTargets(targets);
  const rows = proposals.map((proposal) => resolveProposal(proposal, targetIndex));
  rows.sort((left, right) => compareAscii(left.proposalId, right.proposalId));
  const summary = summarize(rows);
  const material = {
    schema: ENRICHMENT_RESOLUTION_SCHEMA,
    sourceDatasetHash,
    sourceSharedModelHash,
    masterSnapshotHashes: masterSnapshots.map((row) => row.snapshotHash).sort(compareAscii),
    proposalHashes: proposals.map((row) => row.proposalHash).sort(compareAscii),
    rows,
    summary,
    bindingCreated: false,
  };
  return deepFreeze({ ...material, resolutionHash: semanticHash(material) });
}

export function buildEnrichmentTarget(input) {
  const keys = Object.keys(input ?? {}).sort(compareAscii);
  const legacy = canonicalStringify(keys) === canonicalStringify(['selector', 'targetId']);
  if (!legacy) {
    assertExactKeys(input, ['targetKind', 'targetId', 'selector'], 'Enrichment target input');
  }
  const targetKind = requireTargetKind(legacy ? 'COMPONENT' : input.targetKind);
  return deepFreeze({
    schema: ENRICHMENT_TARGET_SCHEMA,
    targetKind,
    targetId: requiredText(input.targetId, 'targetId'),
    selector: assertExactSelector(input.selector),
  });
}

function resolveProposal(proposal, targetIndex) {
  if (proposal.status === 'BLOCKED' || !proposal.selector) {
    return resolutionRow(proposal, 'BLOCKED_PROPOSAL', [], null, proposal.blockers);
  }
  const matches = targetIndex.get(exactSelectorIdentity(proposal.selector)) || [];
  if (matches.length === 0) {
    return resolutionRow(proposal, 'NO_MATCH', [], null, [
      { code: 'NO_EXACT_TARGET_MATCH' },
    ]);
  }
  if (matches.length > 1) {
    return resolutionRow(proposal, 'AMBIGUOUS_MATCH', matches, null, [
      { code: 'MULTIPLE_EXACT_TARGETS' },
    ]);
  }
  return resolutionRow(
    proposal,
    'EXACT_MATCH_PROPOSAL_ONLY',
    matches,
    targetReference(matches[0]),
    [],
  );
}

function resolutionRow(proposal, disposition, targets, selectedTargetRef, blockers) {
  const targetRefs = targets.map(targetReference).sort(compareTargetRefs);
  return deepFreeze({
    proposalId: proposal.proposalId,
    disposition,
    targetIds: deepFreeze(targetRefs.map((row) => row.targetId)),
    targetRefs: deepFreeze(targetRefs),
    selectedTargetId: selectedTargetRef?.targetId ?? null,
    selectedTargetRef,
    bindingCreated: false,
    blockers: canonicalRecords(blockers),
  });
}

function validateSnapshots(value) {
  if (!Array.isArray(value) || value.length === 0) {
    fail('masterSnapshots must be a non-empty array.');
  }
  const snapshots = value.map(assertMasterDataSnapshot);
  assertUnique(snapshots.map((row) => row.snapshotHash), 'snapshotHash');
  return snapshots;
}

function validateProposals(value, snapshots) {
  if (!Array.isArray(value)) fail('proposals must be an array.');
  const proposals = value.map((proposal) => {
    assertEngineeringEnrichmentProposal(proposal);
    return assertEngineeringEnrichmentProposalAuthority({
      proposal,
      masterSnapshots: snapshots,
    });
  });
  assertUnique(proposals.map((row) => row.proposalId), 'proposalId');
  return proposals;
}

function validateTargets(value) {
  if (!Array.isArray(value)) fail('targets must be an array.');
  const targets = value.map((row) => {
    assertExactKeys(row, TARGET_KEYS, 'Enrichment target');
    if (row.schema !== ENRICHMENT_TARGET_SCHEMA) {
      fail(`target schema must be ${ENRICHMENT_TARGET_SCHEMA}.`);
    }
    requireTargetKind(row.targetKind);
    requiredText(row.targetId, 'target.targetId');
    assertExactSelector(row.selector);
    return row;
  });
  assertUnique(targets.map(targetIdentity), 'target identity');
  return targets;
}

function indexTargets(targets) {
  const index = new Map();
  targets.forEach((target) => {
    const key = exactSelectorIdentity(target.selector);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(target);
  });
  for (const rows of index.values()) rows.sort(compareTargets);
  return index;
}

function summarize(rows) {
  const dispositions = {};
  rows.forEach((row) => {
    dispositions[row.disposition] = (dispositions[row.disposition] || 0) + 1;
  });
  const exactMatchCount = dispositions.EXACT_MATCH_PROPOSAL_ONLY || 0;
  return deepFreeze({
    proposalCount: rows.length,
    exactMatchCount,
    unresolvedCount: rows.length - exactMatchCount,
    dispositions: canonicalizeJson(dispositions),
    status: rows.every((row) => row.disposition === 'EXACT_MATCH_PROPOSAL_ONLY')
      ? 'READY_FOR_REVIEW'
      : 'BLOCKED',
  });
}

function targetReference(target) {
  return deepFreeze({
    targetKind: requireTargetKind(target.targetKind),
    targetId: requiredText(target.targetId, 'targetId'),
  });
}
function targetIdentity(target) {
  return `${target.targetKind}\u0000${target.targetId}`;
}
function compareTargets(left, right) {
  return compareAscii(left.targetKind, right.targetKind)
    || compareAscii(left.targetId, right.targetId);
}
function compareTargetRefs(left, right) {
  return compareAscii(left.targetKind, right.targetKind)
    || compareAscii(left.targetId, right.targetId);
}
function requireTargetKind(value) {
  const kind = String(value ?? '');
  if (!ENRICHMENT_TARGET_KINDS.includes(kind)) {
    fail(`unsupported targetKind: ${kind || '<empty>'}.`, RangeError);
  }
  return kind;
}
function requireSha256(value, label) {
  const text = requiredText(value, label).toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(text)) {
    fail(`${label} must be 64 hexadecimal characters.`, RangeError);
  }
  return text;
}
function canonicalRecords(value) {
  if (!Array.isArray(value)) fail('blockers must be an array.');
  const rows = value.map((row, index) => {
    if (!isPlainRecord(row)) fail(`blockers[${index}] must be an object.`);
    return deepFreeze(canonicalizeJson(row));
  });
  rows.sort((left, right) => compareAscii(semanticHash(left), semanticHash(right))
    || compareAscii(canonicalStringify(left), canonicalStringify(right)));
  return deepFreeze(rows);
}
function assertUnique(values, label) {
  if (new Set(values).size !== values.length) fail(`duplicate ${label}.`, RangeError);
}
function assertExactKeys(value, expected, label) {
  if (!isPlainRecord(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value).sort(compareAscii);
  const wanted = [...expected].sort(compareAscii);
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${label} keys must be exactly: ${wanted.join(', ')}.`);
  }
}
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}
function compareAscii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function fail(message, Constructor = TypeError) {
  throw new Constructor(`EngineeringEnrichmentResolution: ${message}`);
}
