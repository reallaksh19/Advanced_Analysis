import {
  canonicalStringify,
  canonicalizeJson,
  semanticHash,
} from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../../core/shared-piping-model/immutable.js';
import { validateSharedPipingModel } from '../../core/shared-piping-model/shared-piping-model.js';
import { assertEngineeringEnrichmentProposal } from './master-adapters.js';
import { assertEngineeringEnrichmentResolution } from './resolution-validation.js';
import { buildSharedModelStructuralAuthority } from './structural-authority.js';
import {
  ENRICHMENT_CANDIDATE_PROJECTION_SCHEMA,
  SHADOW_NONSTRUCTURAL_FIELD_REGISTRY,
} from './candidate-projection-contract.js';

export {
  ENRICHMENT_CANDIDATE_PROJECTION_SCHEMA,
  SHADOW_NONSTRUCTURAL_FIELD_REGISTRY,
} from './candidate-projection-contract.js';
export {
  assertEngineeringEnrichmentCandidateProjection,
} from './candidate-projection-validation.js';

const INPUT_KEYS = Object.freeze(['sourceSharedModel', 'resolution', 'proposals']);

export function buildShadowCandidateProjection(input) {
  exact(input, INPUT_KEYS, 'Candidate projection input');
  assertValidSharedModel(input.sourceSharedModel);
  const resolution = assertEngineeringEnrichmentResolution(input.resolution);
  const proposals = validateProposalSet(input.proposals, resolution);
  if (input.sourceSharedModel.semanticHash !== resolution.sourceSharedModelHash) {
    fail('sourceSharedModel semantic hash differs from resolution authority.', RangeError);
  }
  const structuralAuthority = buildSharedModelStructuralAuthority(input.sourceSharedModel);
  const resolutionRows = new Map(resolution.rows.map((row) => [row.proposalId, row]));
  const projected = proposals.map((proposal) => projectProposal({
    proposal,
    resolutionRow: resolutionRows.get(proposal.proposalId),
    sourceSharedModel: input.sourceSharedModel,
  }));
  const rows = applySameAuthorityConflicts(projected)
    .sort((left, right) => ascii(left.proposalId, right.proposalId));
  const summary = summarize(rows);
  const material = {
    schema: ENRICHMENT_CANDIDATE_PROJECTION_SCHEMA,
    sourceDatasetHash: resolution.sourceDatasetHash,
    sourceSharedModelHash: input.sourceSharedModel.semanticHash,
    sourceStructuralHash: structuralAuthority.structuralHash,
    resolutionHash: resolution.resolutionHash,
    simulationMode: 'ALL_EXACT_MATCHES_SHADOW_ONLY',
    rows: deepFreeze(rows),
    summary,
    bindingCreated: false,
    reviewSelectionCreated: false,
    approvalGranted: false,
    current: false,
    sealEligible: false,
    calculationEligible: false,
  };
  return deepFreeze({ ...material, projectionHash: semanticHash(material) });
}

function validateProposalSet(value, resolution) {
  if (!Array.isArray(value)) fail('proposals must be an array.');
  const proposals = value.map(assertEngineeringEnrichmentProposal);
  unique(proposals.map((row) => row.proposalId), 'proposalId');
  const hashes = proposals.map((row) => row.proposalHash).sort(ascii);
  if (!same(hashes, [...resolution.proposalHashes].sort(ascii))) {
    fail('proposal set differs from resolution authority.', RangeError);
  }
  const resolutionIds = resolution.rows.map((row) => row.proposalId).sort(ascii);
  const proposalIds = proposals.map((row) => row.proposalId).sort(ascii);
  if (!same(proposalIds, resolutionIds)) {
    fail('proposal identities differ from resolution rows.', RangeError);
  }
  return proposals;
}

function projectProposal({ proposal, resolutionRow, sourceSharedModel }) {
  if (!resolutionRow) {
    fail(`resolution row missing for proposal ${proposal.proposalId}.`, RangeError);
  }
  if (resolutionRow.disposition !== 'EXACT_MATCH_PROPOSAL_ONLY') {
    return row({
      proposal,
      targetRef: null,
      disposition: 'NOT_PROJECTED_UNRESOLVED',
      blockers: [
        ...resolutionRow.blockers,
        {
          code: 'RESOLUTION_NOT_EXACT_MATCH',
          resolutionDisposition: resolutionRow.disposition,
        },
      ],
      existingExplicitEvidence: null,
    });
  }
  const targetRef = resolutionRow.selectedTargetRef;
  if (!targetRef || targetRef.targetKind !== 'COMPONENT') {
    return row({
      proposal,
      targetRef,
      disposition: 'BLOCKED_TARGET_KIND',
      blockers: [{ code: 'COMPONENT_WEIGHT_TARGET_KIND_INVALID' }],
      existingExplicitEvidence: null,
    });
  }
  const componentIndex = sourceSharedModel.indexes.componentsByKey?.[targetRef.targetId];
  if (!Number.isInteger(componentIndex)) {
    return row({
      proposal,
      targetRef,
      disposition: 'BLOCKED_TARGET_NOT_FOUND',
      blockers: [{ code: 'TARGET_NOT_IN_SHARED_MODEL' }],
      existingExplicitEvidence: null,
    });
  }
  const properties = sourceSharedModel.components[componentIndex].engineeringProperties || {};
  const hasExplicitSource = Object.prototype.hasOwnProperty.call(
    properties,
    proposal.fieldId,
  );
  return row({
    proposal,
    targetRef,
    disposition: hasExplicitSource
      ? 'BLOCKED_EXPLICIT_SOURCE_PRECEDENCE'
      : 'SHADOW_CANDIDATE_VALUE',
    blockers: hasExplicitSource ? [{ code: 'EXPLICIT_SOURCE_HAS_PRECEDENCE' }] : [],
    existingExplicitEvidence: hasExplicitSource
      ? canonicalizeJson(properties[proposal.fieldId])
      : null,
  });
}

function row({ proposal, targetRef, disposition, blockers, existingExplicitEvidence }) {
  return deepFreeze({
    proposalId: proposal.proposalId,
    proposalHash: proposal.proposalHash,
    targetKind: targetRef?.targetKind ?? null,
    targetId: targetRef?.targetId ?? null,
    fieldId: proposal.fieldId,
    proposedValue: proposal.value,
    unit: proposal.unit,
    authorityLevel: proposal.authorityLevel,
    disposition,
    blockers: canonicalRecords(blockers),
    existingExplicitEvidence,
    bindingCreated: false,
  });
}

function applySameAuthorityConflicts(rows) {
  const groups = new Map();
  rows.forEach((value, index) => {
    if (value.disposition !== 'SHADOW_CANDIDATE_VALUE') return;
    const key = `${value.targetKind}\u0000${value.targetId}\u0000${value.fieldId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  });
  const conflicts = new Map();
  for (const indexes of groups.values()) {
    if (indexes.length <= 1) continue;
    const proposalIds = indexes.map((index) => rows[index].proposalId).sort(ascii);
    indexes.forEach((index) => conflicts.set(index, proposalIds));
  }
  return rows.map((value, index) => {
    const proposalIds = conflicts.get(index);
    if (!proposalIds) return value;
    return row({
      proposal: {
        proposalId: value.proposalId,
        proposalHash: value.proposalHash,
        fieldId: value.fieldId,
        value: value.proposedValue,
        unit: value.unit,
        authorityLevel: value.authorityLevel,
      },
      targetRef: { targetKind: value.targetKind, targetId: value.targetId },
      disposition: 'BLOCKED_SAME_AUTHORITY_CONFLICT',
      blockers: [{ code: 'SAME_AUTHORITY_CONFLICT', proposalIds }],
      existingExplicitEvidence: value.existingExplicitEvidence,
    });
  });
}

function summarize(rows) {
  const dispositions = {};
  rows.forEach((value) => {
    dispositions[value.disposition] = (dispositions[value.disposition] || 0) + 1;
  });
  const projectedCandidateCount = dispositions.SHADOW_CANDIDATE_VALUE || 0;
  const blockedCount = rows.length - projectedCandidateCount;
  return deepFreeze({
    proposalCount: rows.length,
    projectedCandidateCount,
    blockedCount,
    dispositions: canonicalizeJson(dispositions),
    status: blockedCount === 0 ? 'READY_FOR_STRUCTURAL_IMPACT' : 'BLOCKED',
  });
}
function canonicalRecords(value) {
  if (!Array.isArray(value)) fail('blockers must be an array.');
  const rows = value.map((item) => {
    if (!isPlainRecord(item)) fail('blocker must be an object.');
    return deepFreeze(canonicalizeJson(item));
  });
  rows.sort((left, right) => ascii(semanticHash(left), semanticHash(right))
    || ascii(canonicalStringify(left), canonicalStringify(right)));
  return deepFreeze(rows);
}
function assertValidSharedModel(model) {
  const validation = validateSharedPipingModel(model);
  if (!validation.ok) {
    fail(`sourceSharedModel is invalid: ${validation.errors.join(' | ')}.`);
  }
}
function unique(values, label) {
  if (new Set(values).size !== values.length) fail(`duplicate ${label}.`, RangeError);
}
function same(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}
function exact(value, keys, label) {
  if (!isPlainRecord(value)
    || !same(Object.keys(value).sort(ascii), [...keys].sort(ascii))) {
    fail(`${label} keys are invalid.`);
  }
}
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function fail(message, Constructor = TypeError) {
  throw new Constructor(`EngineeringEnrichmentCandidateProjection: ${message}`);
}
