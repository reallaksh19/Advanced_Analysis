import {
  canonicalizeJson,
  semanticHash,
} from '../../core/shared-piping-model/canonical-json.js';
import {
  deepFreeze,
  isPlainRecord,
} from '../../core/shared-piping-model/immutable.js';
import {
  validateSharedPipingModel,
} from '../../core/shared-piping-model/shared-piping-model.js';
import {
  assertEngineeringEnrichmentProposal,
} from './master-adapters.js';
import {
  assertEngineeringEnrichmentResolution,
} from './resolution-validation.js';
import {
  buildSharedModelStructuralAuthority,
} from './structural-authority.js';

export const ENRICHMENT_CANDIDATE_PROJECTION_SCHEMA =
  'EngineeringEnrichmentCandidateProjection.v1';

const INPUT_KEYS = Object.freeze([
  'sourceSharedModel',
  'resolution',
  'proposals',
]);
const PROJECTION_KEYS = Object.freeze([
  'schema',
  'sourceDatasetHash',
  'sourceSharedModelHash',
  'sourceStructuralHash',
  'resolutionHash',
  'simulationMode',
  'rows',
  'summary',
  'bindingCreated',
  'reviewSelectionCreated',
  'approvalGranted',
  'current',
  'sealEligible',
  'calculationEligible',
  'projectionHash',
]);
const FALSE_AUTHORITY_FIELDS = Object.freeze([
  'bindingCreated',
  'reviewSelectionCreated',
  'approvalGranted',
  'current',
  'sealEligible',
  'calculationEligible',
]);

export function buildShadowCandidateProjection(input) {
  assertExactKeys(input, INPUT_KEYS, 'Candidate projection input');
  assertValidSharedModel(input.sourceSharedModel);
  const resolution = assertEngineeringEnrichmentResolution(input.resolution);
  const proposals = validateProposalSet(input.proposals, resolution);

  if (input.sourceSharedModel.semanticHash !== resolution.sourceSharedModelHash) {
    fail(
      'sourceSharedModel semantic hash differs from resolution authority.',
      RangeError,
    );
  }

  const structuralAuthority = buildSharedModelStructuralAuthority(
    input.sourceSharedModel,
  );
  const resolutionRows = new Map(
    resolution.rows.map((row) => [row.proposalId, row]),
  );
  const projectedRows = proposals.map((proposal) => projectProposal({
    proposal,
    resolutionRow: resolutionRows.get(proposal.proposalId),
    sourceSharedModel: input.sourceSharedModel,
  }));
  const rows = applySameAuthorityConflicts(projectedRows);
  rows.sort(compareProjectionRows);

  const summary = summarize(rows);
  const material = {
    schema: ENRICHMENT_CANDIDATE_PROJECTION_SCHEMA,
    sourceDatasetHash: resolution.sourceDatasetHash,
    sourceSharedModelHash: input.sourceSharedModel.semanticHash,
    sourceStructuralHash: structuralAuthority.structuralHash,
    resolutionHash: resolution.resolutionHash,
    simulationMode: 'ALL_EXACT_MATCHES_SHADOW_ONLY',
    rows,
    summary,
    bindingCreated: false,
    reviewSelectionCreated: false,
    approvalGranted: false,
    current: false,
    sealEligible: false,
    calculationEligible: false,
  };
  return deepFreeze({
    ...material,
    projectionHash: semanticHash(material),
  });
}

export function assertEngineeringEnrichmentCandidateProjection(value) {
  assertExactKeys(
    value,
    PROJECTION_KEYS,
    'Engineering enrichment candidate projection',
  );
  if (value.schema !== ENRICHMENT_CANDIDATE_PROJECTION_SCHEMA) {
    fail(`schema must be ${ENRICHMENT_CANDIDATE_PROJECTION_SCHEMA}.`);
  }
  if (value.simulationMode !== 'ALL_EXACT_MATCHES_SHADOW_ONLY') {
    fail('simulationMode is invalid.');
  }
  FALSE_AUTHORITY_FIELDS.forEach((field) => {
    if (value[field] !== false) {
      fail(`${field} must remain false.`, RangeError);
    }
  });
  if (!Array.isArray(value.rows)) fail('rows must be an array.');
  value.rows.forEach((row, index) => {
    if (!isPlainRecord(row)) fail(`rows[${index}] must be an object.`);
    if (row.bindingCreated !== false) {
      fail(`rows[${index}] created a binding.`, RangeError);
    }
  });
  const material = {
    schema: value.schema,
    sourceDatasetHash: value.sourceDatasetHash,
    sourceSharedModelHash: value.sourceSharedModelHash,
    sourceStructuralHash: value.sourceStructuralHash,
    resolutionHash: value.resolutionHash,
    simulationMode: value.simulationMode,
    rows: value.rows,
    summary: value.summary,
    bindingCreated: value.bindingCreated,
    reviewSelectionCreated: value.reviewSelectionCreated,
    approvalGranted: value.approvalGranted,
    current: value.current,
    sealEligible: value.sealEligible,
    calculationEligible: value.calculationEligible,
  };
  if (value.projectionHash !== semanticHash(material)) {
    fail('projectionHash is invalid.', RangeError);
  }
  return value;
}

function validateProposalSet(value, resolution) {
  if (!Array.isArray(value)) fail('proposals must be an array.');
  const proposals = value.map(assertEngineeringEnrichmentProposal);
  assertUnique(proposals.map((row) => row.proposalId), 'proposalId');
  const actualHashes = proposals
    .map((row) => row.proposalHash)
    .sort(compareAscii);
  const expectedHashes = [...resolution.proposalHashes].sort(compareAscii);
  if (!sameList(actualHashes, expectedHashes)) {
    fail('proposal set differs from resolution authority.', RangeError);
  }
  const resolutionIds = resolution.rows
    .map((row) => row.proposalId)
    .sort(compareAscii);
  const proposalIds = proposals
    .map((row) => row.proposalId)
    .sort(compareAscii);
  if (!sameList(proposalIds, resolutionIds)) {
    fail('proposal identities differ from resolution rows.', RangeError);
  }
  return proposals;
}

function projectProposal({ proposal, resolutionRow, sourceSharedModel }) {
  if (!resolutionRow) {
    fail(`resolution row missing for proposal ${proposal.proposalId}.`, RangeError);
  }
  if (resolutionRow.disposition !== 'EXACT_MATCH_PROPOSAL_ONLY') {
    return projectionRow({
      proposal,
      targetId: null,
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

  const targetId = requiredText(
    resolutionRow.selectedTargetId,
    `selectedTargetId for ${proposal.proposalId}`,
  );
  const componentIndex = sourceSharedModel.indexes.componentsByKey?.[targetId];
  const supportIndex = sourceSharedModel.indexes.supportsByKey?.[targetId];

  if (Number.isInteger(supportIndex) && !Number.isInteger(componentIndex)) {
    return projectionRow({
      proposal,
      targetId,
      disposition: 'BLOCKED_TARGET_IS_SUPPORT',
      blockers: [{ code: 'COMPONENT_WEIGHT_TARGET_IS_SUPPORT' }],
      existingExplicitEvidence: null,
    });
  }
  if (!Number.isInteger(componentIndex)) {
    return projectionRow({
      proposal,
      targetId,
      disposition: 'BLOCKED_TARGET_NOT_FOUND',
      blockers: [{ code: 'TARGET_NOT_IN_SHARED_MODEL' }],
      existingExplicitEvidence: null,
    });
  }

  const component = sourceSharedModel.components[componentIndex];
  const engineeringProperties = component.engineeringProperties || {};
  const hasExplicitSource = Object.prototype.hasOwnProperty.call(
    engineeringProperties,
    proposal.fieldId,
  );
  const existingExplicitEvidence = hasExplicitSource
    ? canonicalizeJson(engineeringProperties[proposal.fieldId])
    : null;
  if (hasExplicitSource) {
    return projectionRow({
      proposal,
      targetId,
      disposition: 'BLOCKED_EXPLICIT_SOURCE_PRECEDENCE',
      blockers: [{ code: 'EXPLICIT_SOURCE_HAS_PRECEDENCE' }],
      existingExplicitEvidence,
    });
  }

  return projectionRow({
    proposal,
    targetId,
    disposition: 'SHADOW_CANDIDATE_VALUE',
    blockers: [],
    existingExplicitEvidence: null,
  });
}

function projectionRow({
  proposal,
  targetId,
  disposition,
  blockers,
  existingExplicitEvidence,
}) {
  return deepFreeze({
    proposalId: proposal.proposalId,
    proposalHash: proposal.proposalHash,
    targetId,
    fieldId: proposal.fieldId,
    proposedValue: proposal.value,
    unit: proposal.unit,
    authorityLevel: proposal.authorityLevel,
    disposition,
    blockers: canonicalizeJson(blockers),
    existingExplicitEvidence,
    bindingCreated: false,
  });
}

function applySameAuthorityConflicts(rows) {
  const groups = new Map();
  rows.forEach((row, index) => {
    if (row.disposition !== 'SHADOW_CANDIDATE_VALUE') return;
    const key = `${row.targetId}\u0000${row.fieldId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  });
  const conflicts = new Map();
  for (const indexes of groups.values()) {
    if (indexes.length <= 1) continue;
    const proposalIds = indexes
      .map((index) => rows[index].proposalId)
      .sort(compareAscii);
    indexes.forEach((index) => conflicts.set(index, proposalIds));
  }
  return rows.map((row, index) => {
    const proposalIds = conflicts.get(index);
    if (!proposalIds) return row;
    return projectionRow({
      proposal: {
        proposalId: row.proposalId,
        proposalHash: row.proposalHash,
        fieldId: row.fieldId,
        value: row.proposedValue,
        unit: row.unit,
        authorityLevel: row.authorityLevel,
      },
      targetId: row.targetId,
      disposition: 'BLOCKED_SAME_AUTHORITY_CONFLICT',
      blockers: [{
        code: 'SAME_AUTHORITY_CONFLICT',
        proposalIds,
      }],
      existingExplicitEvidence: row.existingExplicitEvidence,
    });
  });
}

function summarize(rows) {
  const dispositions = {};
  rows.forEach((row) => {
    dispositions[row.disposition] = (dispositions[row.disposition] || 0) + 1;
  });
  const projectedCandidateCount =
    dispositions.SHADOW_CANDIDATE_VALUE || 0;
  const blockedCount = rows.length - projectedCandidateCount;
  return deepFreeze({
    proposalCount: rows.length,
    projectedCandidateCount,
    blockedCount,
    dispositions: canonicalizeJson(dispositions),
    status: blockedCount === 0
      ? 'READY_FOR_STRUCTURAL_IMPACT'
      : 'BLOCKED',
  });
}

function compareProjectionRows(left, right) {
  return compareAscii(String(left.targetId ?? ''), String(right.targetId ?? ''))
    || compareAscii(left.fieldId, right.fieldId)
    || compareAscii(left.proposalId, right.proposalId);
}

function assertValidSharedModel(model) {
  const validation = validateSharedPipingModel(model);
  if (!validation.ok) {
    fail(`sourceSharedModel is invalid: ${validation.errors.join(' | ')}.`);
  }
}

function assertUnique(values, label) {
  const seen = new Set();
  values.forEach((value) => {
    if (seen.has(value)) fail(`duplicate ${label}: ${value}.`, RangeError);
    seen.add(value);
  });
}

function sameList(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function assertExactKeys(value, expected, label) {
  if (!isPlainRecord(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value).sort(compareAscii);
  const wanted = [...expected].sort(compareAscii);
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${label} keys must be exactly: ${wanted.join(', ')}.`);
  }
}

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message, Constructor = TypeError) {
  throw new Constructor(`EngineeringEnrichmentCandidateProjection: ${message}`);
}
