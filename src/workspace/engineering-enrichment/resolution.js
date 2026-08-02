import { canonicalizeJson, semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../../core/shared-piping-model/immutable.js';
import { assertEngineeringEnrichmentProposal } from './master-adapters.js';
import { assertMasterDataSnapshot } from './master-snapshot.js';
import { assertExactSelector, exactSelectorIdentity } from './selectors.js';

export const ENRICHMENT_TARGET_SCHEMA = 'EngineeringEnrichmentTarget.v1';
export const ENRICHMENT_RESOLUTION_SCHEMA = 'EngineeringEnrichmentResolution.v1';

const TARGET_KEYS = Object.freeze(['schema', 'targetId', 'selector']);
const INPUT_KEYS = Object.freeze([
  'sourceDatasetHash',
  'sourceSharedModelHash',
  'masterSnapshots',
  'proposals',
  'targets',
]);

export function resolveExactEnrichmentProposals(input) {
  assertExactKeys(input, INPUT_KEYS, 'Enrichment resolution input');
  const sourceDatasetHash = requireSha256(input.sourceDatasetHash, 'sourceDatasetHash');
  const sourceSharedModelHash = requiredText(input.sourceSharedModelHash, 'sourceSharedModelHash');
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
  assertExactKeys(input, ['targetId', 'selector'], 'Enrichment target input');
  return deepFreeze({
    schema: ENRICHMENT_TARGET_SCHEMA,
    targetId: requiredText(input.targetId, 'targetId'),
    selector: assertExactSelector(input.selector),
  });
}

function resolveProposal(proposal, targetIndex) {
  if (proposal.status === 'BLOCKED' || !proposal.selector) {
    return deepFreeze({
      proposalId: proposal.proposalId,
      disposition: 'BLOCKED_PROPOSAL',
      targetIds: [],
      selectedTargetId: null,
      bindingCreated: false,
      blockers: proposal.blockers,
    });
  }
  const matches = targetIndex.get(exactSelectorIdentity(proposal.selector)) || [];
  if (matches.length === 0) {
    return resolutionRow(proposal, 'NO_MATCH', [], null, [{ code: 'NO_EXACT_TARGET_MATCH' }]);
  }
  if (matches.length > 1) {
    return resolutionRow(
      proposal,
      'AMBIGUOUS_MATCH',
      matches.map((row) => row.targetId),
      null,
      [{ code: 'MULTIPLE_EXACT_TARGETS' }],
    );
  }
  return resolutionRow(
    proposal,
    'EXACT_MATCH_PROPOSAL_ONLY',
    [matches[0].targetId],
    matches[0].targetId,
    [],
  );
}

function resolutionRow(proposal, disposition, targetIds, selectedTargetId, blockers) {
  return deepFreeze({
    proposalId: proposal.proposalId,
    disposition,
    targetIds: [...targetIds].sort(compareAscii),
    selectedTargetId,
    bindingCreated: false,
    blockers: canonicalizeJson(blockers),
  });
}

function validateSnapshots(value) {
  if (!Array.isArray(value) || value.length === 0) fail('masterSnapshots must be a non-empty array.');
  const snapshots = value.map(assertMasterDataSnapshot);
  assertUnique(snapshots.map((row) => row.snapshotHash), 'snapshotHash');
  return snapshots;
}

function validateProposals(value, snapshots) {
  if (!Array.isArray(value)) fail('proposals must be an array.');
  const knownSnapshots = new Set(snapshots.map((row) => row.snapshotHash));
  const proposals = value.map(assertEngineeringEnrichmentProposal);
  proposals.forEach((proposal) => {
    if (!knownSnapshots.has(proposal.sourceSnapshotHash)) {
      fail(`proposal ${proposal.proposalId} references an unknown snapshot.`, RangeError);
    }
  });
  assertUnique(proposals.map((row) => row.proposalId), 'proposalId');
  return proposals;
}

function validateTargets(value) {
  if (!Array.isArray(value)) fail('targets must be an array.');
  const targets = value.map((row) => {
    assertExactKeys(row, TARGET_KEYS, 'Enrichment target');
    if (row.schema !== ENRICHMENT_TARGET_SCHEMA) fail(`target schema must be ${ENRICHMENT_TARGET_SCHEMA}.`);
    requiredText(row.targetId, 'target.targetId');
    assertExactSelector(row.selector);
    return row;
  });
  assertUnique(targets.map((row) => row.targetId), 'targetId');
  return targets;
}

function indexTargets(targets) {
  const index = new Map();
  targets.forEach((target) => {
    const key = exactSelectorIdentity(target.selector);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(target);
  });
  for (const rows of index.values()) rows.sort((left, right) => compareAscii(left.targetId, right.targetId));
  return index;
}

function summarize(rows) {
  const counts = {};
  rows.forEach((row) => { counts[row.disposition] = (counts[row.disposition] || 0) + 1; });
  return deepFreeze({
    proposalCount: rows.length,
    exactMatchCount: counts.EXACT_MATCH_PROPOSAL_ONLY || 0,
    unresolvedCount: rows.length - (counts.EXACT_MATCH_PROPOSAL_ONLY || 0),
    dispositions: canonicalizeJson(counts),
    status: rows.every((row) => row.disposition === 'EXACT_MATCH_PROPOSAL_ONLY')
      ? 'READY_FOR_REVIEW'
      : 'BLOCKED',
  });
}

function requireSha256(value, label) {
  const text = requiredText(value, label).toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(text)) fail(`${label} must be 64 hexadecimal characters.`, RangeError);
  return text;
}

function assertUnique(values, label) {
  const seen = new Set();
  values.forEach((value) => {
    if (seen.has(value)) fail(`duplicate ${label}: ${value}.`, RangeError);
    seen.add(value);
  });
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
