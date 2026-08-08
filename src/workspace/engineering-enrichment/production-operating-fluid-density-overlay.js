import { requireCommonEnrichedFluidResolution } from '../../core/common-enriched-properties/fluid-register-resolution.js';
import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import { stringValue } from '../dataset-utils.js';
import {
  assertEngineeringInputSeal,
  assertEngineeringInputSealCurrentness,
} from './input-seal.js';

export const ENRICHMENT_OPERATING_FLUID_DENSITY_PROJECTION_SCHEMA =
  'EngineeringEnrichmentOperatingFluidDensityProjection.v1';
export const ENRICHMENT_PRODUCTION_OPERATING_FLUID_DENSITY_OVERLAY_SCHEMA =
  'EngineeringEnrichmentProductionOperatingFluidDensityOverlay.v1';

const PROJECTION_KEYS = Object.freeze([
  'schema', 'sourceDatasetHash', 'sourceSharedModelHash', 'sourceStructuralHash',
  'fluidResolutionHash', 'rows', 'summary', 'projectionHash',
]);
const PROJECTION_ROW_KEYS = Object.freeze([
  'proposalId', 'proposalHash', 'targetKind', 'targetId', 'fieldId',
  'proposedValue', 'unit', 'authorityLevel', 'disposition', 'blockers',
  'existingExplicitEvidence', 'bindingCreated', 'sourceEvidence',
]);
const SOURCE_EVIDENCE_KEYS = Object.freeze([
  'sourceKind', 'sourceKey', 'sourceHash', 'locator',
]);

/**
 * Package 5B deliberately does not broaden EngineeringEnrichmentCandidateProjection.v2,
 * whose builder and validator are component-centric. This adapter projects only the
 * exact approved fluid-density field from the qualified common fluid resolution into
 * a small hashable LINE candidate contract that the existing review/seal lifecycle can
 * govern by candidateProjectionHash.
 */
export function buildEnrichmentOperatingFluidDensityProjection(input) {
  exactKeys(
    input,
    ['fluidResolution', 'dataset', 'sourceStructuralHash'],
    'operating-fluid-density projection input',
  );
  const resolution = requireCommonEnrichedFluidResolution(input.fluidResolution);
  const dataset = requireDataset(input.dataset);
  const sourceStructuralHash = semanticHashText(
    input.sourceStructuralHash,
    'sourceStructuralHash',
  );
  const rows = resolution.targetRecords.map((record) => projectFluidDensityRow({
    record,
    fluidResolutionHash: resolution.semanticHash,
    sourceSharedModelHash: dataset.sharedModel.semanticHash,
  })).sort((left, right) => ascii(left.proposalId, right.proposalId));
  const summary = projectionSummary(rows);
  const material = {
    schema: ENRICHMENT_OPERATING_FLUID_DENSITY_PROJECTION_SCHEMA,
    sourceDatasetHash: dataset.sourceSha256,
    sourceSharedModelHash: dataset.sharedModel.semanticHash,
    sourceStructuralHash,
    fluidResolutionHash: resolution.semanticHash,
    rows,
    summary,
  };
  return assertEnrichmentOperatingFluidDensityProjection(deepFreeze({
    ...material,
    projectionHash: semanticHash(material),
  }));
}

export function assertEnrichmentOperatingFluidDensityProjection(value) {
  exactKeys(value, PROJECTION_KEYS, 'operating-fluid-density projection');
  if (value.schema !== ENRICHMENT_OPERATING_FLUID_DENSITY_PROJECTION_SCHEMA) {
    fail(
      'ENRICHMENT_OPERATING_FLUID_PROJECTION_SCHEMA_INVALID',
      'Unexpected operating-fluid-density projection schema.',
    );
  }
  requiredText(value.sourceDatasetHash, 'sourceDatasetHash');
  semanticHashText(value.sourceSharedModelHash, 'sourceSharedModelHash');
  semanticHashText(value.sourceStructuralHash, 'sourceStructuralHash');
  semanticHashText(value.fluidResolutionHash, 'fluidResolutionHash');
  semanticHashText(value.projectionHash, 'projectionHash');
  if (!Array.isArray(value.rows)) {
    fail(
      'ENRICHMENT_OPERATING_FLUID_PROJECTION_ROWS_INVALID',
      'Operating-fluid-density projection rows must be an array.',
    );
  }
  const proposalIds = value.rows.map((row, index) => validateProjectionRow(
    row,
    index,
    value.fluidResolutionHash,
  ));
  if (!strictlySortedUnique(proposalIds)) {
    fail(
      'ENRICHMENT_OPERATING_FLUID_PROJECTION_ORDER_INVALID',
      'Operating-fluid-density projection rows must be proposalId-sorted and unique.',
    );
  }
  if (semanticHash(value.summary) !== semanticHash(projectionSummary(value.rows))) {
    fail(
      'ENRICHMENT_OPERATING_FLUID_PROJECTION_SUMMARY_INVALID',
      'Operating-fluid-density projection summary is invalid.',
    );
  }
  const { projectionHash, ...material } = value;
  if (projectionHash !== semanticHash(material)) {
    fail(
      'ENRICHMENT_OPERATING_FLUID_PROJECTION_HASH_MISMATCH',
      'Operating-fluid-density projection hash mismatch.',
    );
  }
  return value;
}

/**
 * Package 5B production bridge for exact process/service-fluid density only.
 * Exact LINE candidates are translated directly to the existing empirical
 * lineKey resolver used by loadCalculation.operatingFluidDensitiesKgPerM3.
 *
 * Hydrotest fluid density is deliberately outside this overlay because the
 * exact process-fluid register does not establish the hydrotest medium.
 */
export function buildEnrichmentProductionOperatingFluidDensityOverlay(input) {
  exactKeys(
    input,
    ['seal', 'currentness', 'candidateProjection', 'dataset'],
    'operating-fluid-density overlay input',
  );
  const seal = assertEngineeringInputSeal(input.seal);
  const currentness = assertEngineeringInputSealCurrentness(input.currentness);
  const candidate = assertEnrichmentOperatingFluidDensityProjection(input.candidateProjection);
  const dataset = requireDataset(input.dataset);
  const blockers = [];

  if (currentness.sealHash !== seal.sealHash
      || currentness.status !== 'CURRENT'
      || currentness.current !== true
      || currentness.requiresReseal !== false) {
    blockers.push(issue(
      'ENRICHMENT_PRODUCTION_OPERATING_FLUID_SEAL_NOT_CURRENT',
      'Production operating-fluid-density consumption requires a CURRENT seal evaluation bound to the exact seal.',
    ));
  }
  if (seal.candidateProjectionHash !== candidate.projectionHash) {
    blockers.push(issue(
      'ENRICHMENT_PRODUCTION_OPERATING_FLUID_CANDIDATE_SEAL_MISMATCH',
      'Operating-fluid candidate projection does not match the sealed candidate projection identity.',
    ));
  }
  if (seal.sourceDatasetHash !== candidate.sourceDatasetHash
      || seal.sourceSharedModelHash !== candidate.sourceSharedModelHash
      || seal.sourceStructuralHash !== candidate.sourceStructuralHash) {
    blockers.push(issue(
      'ENRICHMENT_PRODUCTION_OPERATING_FLUID_SEAL_SOURCE_MISMATCH',
      'Seal and operating-fluid candidate projection source identities do not match.',
    ));
  }
  if (dataset.sourceSha256 !== seal.sourceDatasetHash
      || dataset.sharedModel.semanticHash !== seal.sourceSharedModelHash) {
    blockers.push(issue(
      'ENRICHMENT_PRODUCTION_OPERATING_FLUID_ACTIVE_SOURCE_MISMATCH',
      'Active dataset/shared-model identities differ from the sealed operating-fluid authority.',
    ));
  }
  if (candidate.summary?.status !== 'READY_FOR_STRUCTURAL_IMPACT'
      || candidate.summary?.blockedCount !== 0) {
    blockers.push(issue(
      'ENRICHMENT_PRODUCTION_OPERATING_FLUID_CANDIDATE_BLOCKED',
      'All operating-fluid candidate rows must be exact and blocker-free before production activation.',
    ));
  }

  const activePipeLineKeys = new Set(
    dataset.entities
      .filter((entity) => stringValue(entity?.entityType) === 'PIPE')
      .map((entity) => stringValue(entity?.lineKey))
      .filter(Boolean),
  );
  const bindings = [];
  const densities = new Map();
  const seenTargetIds = new Set();

  for (const row of candidate.rows) {
    if (row.disposition !== 'SHADOW_CANDIDATE_VALUE'
        || row.targetKind !== 'LINE'
        || row.fieldId !== 'fluid.densityKgM3'
        || row.unit !== 'kg/m3'
        || !positive(row.proposedValue)) {
      blockers.push(issue(
        'ENRICHMENT_PRODUCTION_OPERATING_FLUID_ROW_UNQUALIFIED',
        'Package 5B accepts only positive exact LINE fluid.densityKgM3 candidates.',
        { proposalId: row.proposalId },
      ));
      continue;
    }
    const lineKey = stringValue(row.targetId);
    if (!lineKey || !activePipeLineKeys.has(lineKey)) {
      blockers.push(issue(
        'ENRICHMENT_PRODUCTION_OPERATING_FLUID_LINE_MISSING',
        'Operating-fluid candidate target is not an active PIPE lineKey.',
        { targetId: row.targetId, proposalId: row.proposalId },
      ));
      continue;
    }
    if (seenTargetIds.has(lineKey)) {
      blockers.push(issue(
        'ENRICHMENT_PRODUCTION_OPERATING_FLUID_LINE_DUPLICATE',
        'A production operating-fluid line may have only one exact sealed density candidate.',
        { targetId: lineKey, proposalId: row.proposalId },
      ));
      continue;
    }
    seenTargetIds.add(lineKey);
    densities.set(lineKey, row.proposedValue);
    bindings.push(deepFreeze({
      proposalId: row.proposalId,
      proposalHash: row.proposalHash,
      targetId: row.targetId,
      lineKey,
      densityKgPerM3: row.proposedValue,
      unit: 'kg/m3',
    }));
  }

  bindings.sort((left, right) => ascii(left.lineKey, right.lineKey));
  const dedupedBlockers = dedupeIssues(blockers);
  const ready = dedupedBlockers.length === 0
    && bindings.length === candidate.rows.length
    && bindings.length > 0;
  const operatingFluidDensitiesKgPerM3 = ready
    ? Object.fromEntries([...densities.entries()].sort(([left], [right]) => ascii(left, right)))
    : {};

  const material = {
    schema: ENRICHMENT_PRODUCTION_OPERATING_FLUID_DENSITY_OVERLAY_SCHEMA,
    sealId: seal.sealId,
    sealHash: seal.sealHash,
    currentnessHash: currentness.currentnessHash,
    observedAuthorityHash: currentness.observedAuthorityHash,
    candidateProjectionHash: candidate.projectionHash,
    fluidResolutionHash: candidate.fluidResolutionHash,
    sourceDatasetHash: seal.sourceDatasetHash,
    sourceSharedModelHash: seal.sourceSharedModelHash,
    sourceStructuralHash: seal.sourceStructuralHash,
    activatedFieldFamilies: ['OPERATING_FLUID_DENSITIES'],
    status: ready ? 'READY_FOR_PRODUCTION_CONSUMPTION' : 'BLOCKED',
    bindings,
    operatingFluidDensitiesKgPerM3,
    blockers: dedupedBlockers,
    summary: {
      candidateCount: candidate.rows.length,
      qualifiedBindingCount: bindings.length,
      productionLineKeyCount: ready ? Object.keys(operatingFluidDensitiesKgPerM3).length : 0,
      blockedCount: dedupedBlockers.length,
    },
    policy: {
      componentWeightsActivated: false,
      operatingFluidDensitiesActivated: true,
      hydroFluidDensitiesActivated: false,
      materialDensitiesActivated: false,
      pipeSectionsActivated: false,
      supportCapabilitiesActivated: false,
      supportAvailabilityScenariosActivated: false,
      partialProductionOverlayPermitted: false,
      automaticCalculationTriggered: false,
    },
    sourceDatasetMutated: false,
    calculationExecutionPerformed: false,
  };
  return assertEnrichmentProductionOperatingFluidDensityOverlay(deepFreeze({
    ...material,
    overlayHash: semanticHash(material),
  }));
}

export function assertEnrichmentProductionOperatingFluidDensityOverlay(value) {
  exactKeys(value, [
    'schema', 'sealId', 'sealHash', 'currentnessHash', 'observedAuthorityHash',
    'candidateProjectionHash', 'fluidResolutionHash', 'sourceDatasetHash',
    'sourceSharedModelHash', 'sourceStructuralHash', 'activatedFieldFamilies',
    'status', 'bindings', 'operatingFluidDensitiesKgPerM3', 'blockers', 'summary',
    'policy', 'sourceDatasetMutated', 'calculationExecutionPerformed', 'overlayHash',
  ], 'production operating-fluid-density overlay');
  if (value.schema !== ENRICHMENT_PRODUCTION_OPERATING_FLUID_DENSITY_OVERLAY_SCHEMA) {
    fail(
      'ENRICHMENT_PRODUCTION_OPERATING_FLUID_SCHEMA_INVALID',
      'Unexpected production operating-fluid-density overlay schema.',
    );
  }
  for (const [field, item] of [
    ['sealId', value.sealId],
    ['sealHash', value.sealHash],
    ['currentnessHash', value.currentnessHash],
    ['observedAuthorityHash', value.observedAuthorityHash],
    ['candidateProjectionHash', value.candidateProjectionHash],
    ['fluidResolutionHash', value.fluidResolutionHash],
    ['sourceDatasetHash', value.sourceDatasetHash],
    ['sourceSharedModelHash', value.sourceSharedModelHash],
    ['sourceStructuralHash', value.sourceStructuralHash],
  ]) requiredText(item, field);

  if (JSON.stringify(value.activatedFieldFamilies)
      !== JSON.stringify(['OPERATING_FLUID_DENSITIES'])) {
    fail(
      'ENRICHMENT_PRODUCTION_OPERATING_FLUID_FIELD_FAMILY_INVALID',
      'Package 5B operating-fluid overlay may activate only OPERATING_FLUID_DENSITIES.',
    );
  }
  if (!['READY_FOR_PRODUCTION_CONSUMPTION', 'BLOCKED'].includes(value.status)
      || !Array.isArray(value.bindings)
      || !Array.isArray(value.blockers)) {
    fail(
      'ENRICHMENT_PRODUCTION_OPERATING_FLUID_OVERLAY_INVALID',
      'Production operating-fluid-density overlay structure is invalid.',
    );
  }
  const lineKeys = value.bindings.map((row) => row?.lineKey);
  if (!strictlySortedUnique(lineKeys)) {
    fail(
      'ENRICHMENT_PRODUCTION_OPERATING_FLUID_BINDING_ORDER_INVALID',
      'Production operating-fluid bindings must be unique and lineKey-sorted.',
    );
  }
  value.bindings.forEach(validateBinding);
  validateDensityMap(value.operatingFluidDensitiesKgPerM3);

  if (value.status === 'READY_FOR_PRODUCTION_CONSUMPTION') {
    if (value.blockers.length !== 0 || value.bindings.length === 0
        || Object.keys(value.operatingFluidDensitiesKgPerM3).length === 0) {
      fail(
        'ENRICHMENT_PRODUCTION_OPERATING_FLUID_READY_STATE_INVALID',
        'READY operating-fluid overlay must be complete and blocker-free.',
      );
    }
  } else if (Object.keys(value.operatingFluidDensitiesKgPerM3).length !== 0) {
    fail(
      'ENRICHMENT_PRODUCTION_OPERATING_FLUID_FAIL_CLOSED_INVALID',
      'BLOCKED operating-fluid overlay must publish no density map.',
    );
  }

  if (value.policy?.componentWeightsActivated !== false
      || value.policy?.operatingFluidDensitiesActivated !== true
      || value.policy?.hydroFluidDensitiesActivated !== false
      || value.policy?.materialDensitiesActivated !== false
      || value.policy?.pipeSectionsActivated !== false
      || value.policy?.supportCapabilitiesActivated !== false
      || value.policy?.supportAvailabilityScenariosActivated !== false
      || value.policy?.partialProductionOverlayPermitted !== false
      || value.policy?.automaticCalculationTriggered !== false
      || value.sourceDatasetMutated !== false
      || value.calculationExecutionPerformed !== false) {
    fail(
      'ENRICHMENT_PRODUCTION_OPERATING_FLUID_BOUNDARY_INVALID',
      'Package 5B operating-fluid overlay must remain OPE-fluid-only, fail-closed and non-executing.',
    );
  }

  const expectedSummary = {
    candidateCount: value.summary?.candidateCount,
    qualifiedBindingCount: value.bindings.length,
    productionLineKeyCount: value.status === 'READY_FOR_PRODUCTION_CONSUMPTION'
      ? Object.keys(value.operatingFluidDensitiesKgPerM3).length
      : 0,
    blockedCount: value.blockers.length,
  };
  if (!Number.isInteger(expectedSummary.candidateCount) || expectedSummary.candidateCount < 0
      || semanticHash(value.summary) !== semanticHash(expectedSummary)) {
    fail(
      'ENRICHMENT_PRODUCTION_OPERATING_FLUID_SUMMARY_INVALID',
      'Production operating-fluid-density summary is invalid.',
    );
  }
  const { overlayHash, ...material } = value;
  if (overlayHash !== semanticHash(material)) {
    fail(
      'ENRICHMENT_PRODUCTION_OPERATING_FLUID_HASH_MISMATCH',
      'Production operating-fluid-density overlay hash mismatch.',
    );
  }
  return value;
}

function projectFluidDensityRow({ record, fluidResolutionHash, sourceSharedModelHash }) {
  const lineKey = requiredText(record.lineKey, 'fluid resolution lineKey');
  const field = Array.isArray(record.fields)
    ? record.fields.find((entry) => entry?.field === 'fluid.densityKgM3')
    : null;
  const sourceEvidence = deepFreeze({
    sourceKind: field?.sourceKind ?? 'NONE',
    sourceKey: field?.sourceKey ?? null,
    sourceHash: field?.sourceHash ?? null,
    locator: field?.locator ?? null,
  });
  const blockers = [];
  if (record.sourceModelHash !== sourceSharedModelHash) {
    blockers.push({ code: 'FLUID_RESOLUTION_SHARED_MODEL_MISMATCH' });
  }
  if (!field) {
    blockers.push({ code: 'FLUID_DENSITY_FIELD_MISSING' });
  } else {
    if (field.status !== 'RESOLVED_EXACT') {
      blockers.push({ code: 'FLUID_DENSITY_NOT_EXACT', status: field.status });
    }
    if (field.approved !== true) blockers.push({ code: 'FLUID_DENSITY_NOT_APPROVED' });
    if (field.unit !== 'kg/m3') {
      blockers.push({ code: 'FLUID_DENSITY_UNIT_INVALID', unit: field.unit });
    }
    if (!positive(field.value)) blockers.push({ code: 'FLUID_DENSITY_VALUE_INVALID' });
    if (field.sourceKind !== 'FLUID_REGISTER'
        || !field.sourceKey || !field.sourceHash || !field.locator) {
      blockers.push({ code: 'FLUID_DENSITY_SOURCE_EVIDENCE_INVALID' });
    }
  }
  const canonicalBlockers = blockers.sort((left, right) => ascii(
    semanticHash(left),
    semanticHash(right),
  ));
  const proposedValue = field?.value ?? null;
  const proposalId = `FLUID_DENSITY:${lineKey}`;
  const proposalMaterial = {
    fluidResolutionHash,
    targetKind: 'LINE',
    targetId: lineKey,
    fieldId: 'fluid.densityKgM3',
    proposedValue,
    unit: 'kg/m3',
    sourceEvidence,
  };
  return deepFreeze({
    proposalId,
    proposalHash: semanticHash(proposalMaterial),
    targetKind: 'LINE',
    targetId: lineKey,
    fieldId: 'fluid.densityKgM3',
    proposedValue,
    unit: 'kg/m3',
    authorityLevel: 'AUTHORIZED_MASTER_CANDIDATE',
    disposition: canonicalBlockers.length === 0
      ? 'SHADOW_CANDIDATE_VALUE'
      : 'BLOCKED_FLUID_RESOLUTION',
    blockers: canonicalBlockers,
    existingExplicitEvidence: null,
    bindingCreated: false,
    sourceEvidence,
  });
}

function validateProjectionRow(row, index, fluidResolutionHash) {
  exactKeys(row, PROJECTION_ROW_KEYS, `operating-fluid-density projection rows[${index}]`);
  requiredText(row.proposalId, `rows[${index}].proposalId`);
  semanticHashText(row.proposalHash, `rows[${index}].proposalHash`);
  if (row.targetKind !== 'LINE'
      || !requiredText(row.targetId, `rows[${index}].targetId`)
      || row.fieldId !== 'fluid.densityKgM3'
      || row.unit !== 'kg/m3'
      || row.authorityLevel !== 'AUTHORIZED_MASTER_CANDIDATE'
      || !['SHADOW_CANDIDATE_VALUE', 'BLOCKED_FLUID_RESOLUTION'].includes(row.disposition)
      || !Array.isArray(row.blockers)
      || row.existingExplicitEvidence !== null
      || row.bindingCreated !== false) {
    fail(
      'ENRICHMENT_OPERATING_FLUID_PROJECTION_ROW_INVALID',
      `Operating-fluid-density projection rows[${index}] is invalid.`,
    );
  }
  exactKeys(row.sourceEvidence, SOURCE_EVIDENCE_KEYS, `rows[${index}].sourceEvidence`);
  if (row.disposition === 'SHADOW_CANDIDATE_VALUE') {
    if (!positive(row.proposedValue) || row.blockers.length !== 0
        || row.sourceEvidence.sourceKind !== 'FLUID_REGISTER'
        || !requiredText(row.sourceEvidence.sourceKey, 'sourceEvidence.sourceKey')
        || !requiredText(row.sourceEvidence.sourceHash, 'sourceEvidence.sourceHash')
        || !requiredText(row.sourceEvidence.locator, 'sourceEvidence.locator')) {
      fail(
        'ENRICHMENT_OPERATING_FLUID_PROJECTION_EXACT_ROW_INVALID',
        `Operating-fluid-density exact projection rows[${index}] is invalid.`,
      );
    }
  } else if (row.blockers.length === 0) {
    fail(
      'ENRICHMENT_OPERATING_FLUID_PROJECTION_BLOCKERS_REQUIRED',
      `Blocked operating-fluid-density projection rows[${index}] requires blockers.`,
    );
  }
  const expectedProposalHash = semanticHash({
    fluidResolutionHash,
    targetKind: row.targetKind,
    targetId: row.targetId,
    fieldId: row.fieldId,
    proposedValue: row.proposedValue,
    unit: row.unit,
    sourceEvidence: row.sourceEvidence,
  });
  if (row.proposalHash !== expectedProposalHash) {
    fail(
      'ENRICHMENT_OPERATING_FLUID_PROJECTION_PROPOSAL_HASH_MISMATCH',
      `Operating-fluid-density projection rows[${index}] proposal hash mismatch.`,
    );
  }
  return row.proposalId;
}

function projectionSummary(rows) {
  const dispositions = {};
  rows.forEach((row) => {
    dispositions[row.disposition] = (dispositions[row.disposition] || 0) + 1;
  });
  const projectedCandidateCount = dispositions.SHADOW_CANDIDATE_VALUE || 0;
  const blockedCount = rows.length - projectedCandidateCount;
  return deepFreeze({
    proposalCount: rows.length,
    projectedCandidateCount,
    blockedCount,
    dispositions,
    status: blockedCount === 0 ? 'READY_FOR_STRUCTURAL_IMPACT' : 'BLOCKED',
  });
}

function requireDataset(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !requiredText(value.sourceSha256, 'dataset.sourceSha256')
      || !value.sharedModel
      || !semanticHashText(value.sharedModel.semanticHash, 'dataset.sharedModel.semanticHash')
      || !Array.isArray(value.entities)) {
    fail(
      'ENRICHMENT_PRODUCTION_OPERATING_FLUID_DATASET_INVALID',
      'Active workspace dataset is invalid.',
    );
  }
  return value;
}

function validateBinding(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)
      || !positive(row.densityKgPerM3) || row.unit !== 'kg/m3') {
    fail(
      'ENRICHMENT_PRODUCTION_OPERATING_FLUID_BINDING_INVALID',
      'Production operating-fluid-density binding is invalid.',
    );
  }
  ['proposalId', 'proposalHash', 'targetId', 'lineKey']
    .forEach((field) => requiredText(row[field], field));
  if (row.targetId !== row.lineKey) {
    fail(
      'ENRICHMENT_PRODUCTION_OPERATING_FLUID_LINE_IDENTITY_INVALID',
      'Operating-fluid targetId must equal the production lineKey.',
    );
  }
}

function validateDensityMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(
      'ENRICHMENT_PRODUCTION_OPERATING_FLUID_MAP_INVALID',
      'operatingFluidDensitiesKgPerM3 must be an object map.',
    );
  }
  const keys = Object.keys(value);
  if (JSON.stringify(keys) !== JSON.stringify([...keys].sort(ascii))) {
    fail(
      'ENRICHMENT_PRODUCTION_OPERATING_FLUID_MAP_ORDER_INVALID',
      'Operating-fluid-density map keys must be canonical sorted.',
    );
  }
  keys.forEach((key) => {
    requiredText(key, 'operatingFluidDensitiesKgPerM3 key');
    if (!positive(value[key])) {
      fail(
        'ENRICHMENT_PRODUCTION_OPERATING_FLUID_DENSITY_INVALID',
        'Production operating-fluid density must be positive.',
      );
    }
  });
}

function issue(code, message, details = null) {
  return deepFreeze(details === null ? { code, message } : { code, message, ...details });
}

function dedupeIssues(values) {
  const seen = new Set();
  return values.filter((row) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => ascii(
    `${left.code}|${left.targetId || ''}|${left.proposalId || ''}`,
    `${right.code}|${right.targetId || ''}|${right.proposalId || ''}`,
  ));
}

function strictlySortedUnique(values) {
  if (!Array.isArray(values)) return false;
  for (let index = 0; index < values.length; index += 1) {
    if (!requiredText(values[index], `binding[${index}] identity`)) return false;
    if (index > 0 && ascii(values[index - 1], values[index]) >= 0) return false;
  }
  return true;
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('ENRICHMENT_PRODUCTION_OPERATING_FLUID_TYPE_INVALID', `${label} must be an object.`);
  }
  const actual = Object.keys(value).sort(ascii);
  const expected = [...keys].sort(ascii);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(
      'ENRICHMENT_PRODUCTION_OPERATING_FLUID_KEYS_INVALID',
      `${label} keys are invalid.`,
      { actual, expected },
    );
  }
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    fail(
      'ENRICHMENT_PRODUCTION_OPERATING_FLUID_TEXT_INVALID',
      `${label} must be a non-empty trimmed string.`,
    );
  }
  return value;
}

function semanticHashText(value, label) {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    fail(
      'ENRICHMENT_PRODUCTION_OPERATING_FLUID_HASH_INVALID',
      `${label} must be an FNV-1a semantic hash.`,
    );
  }
  return value;
}

function positive(value) {
  return Number.isFinite(value) && value > 0;
}

function ascii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  if (details !== null) error.details = details;
  throw error;
}
