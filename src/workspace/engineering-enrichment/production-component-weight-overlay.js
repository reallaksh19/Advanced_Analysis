import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import { stringValue } from '../dataset-utils.js';
import {
  assertEngineeringEnrichmentCandidateProjection,
} from './candidate-projection-validation.js';
import {
  assertEngineeringInputSeal,
  assertEngineeringInputSealCurrentness,
} from './input-seal.js';

export const ENRICHMENT_PRODUCTION_COMPONENT_WEIGHT_OVERLAY_SCHEMA =
  'EngineeringEnrichmentProductionComponentWeightOverlay.v1';

/**
 * Package 5A production bridge for the first activated enrichment family only:
 * component weights. The bridge translates exact sealed component identity into
 * the existing empirical resolver key (catalog key, else source entity ID).
 *
 * Any incomplete/ambiguous/conflicting mapping blocks the whole overlay. No
 * partial component-weight map is published for production consumption.
 */
export function buildEnrichmentProductionComponentWeightOverlay(input) {
  exactKeys(input, ['seal', 'currentness', 'candidateProjection', 'dataset'], 'component-weight overlay input');
  const seal = assertEngineeringInputSeal(input.seal);
  const currentness = assertEngineeringInputSealCurrentness(input.currentness);
  const candidate = assertEngineeringEnrichmentCandidateProjection(input.candidateProjection);
  const dataset = requireDataset(input.dataset);
  const blockers = [];

  if (currentness.sealHash !== seal.sealHash || currentness.status !== 'CURRENT'
      || currentness.current !== true || currentness.requiresReseal !== false) {
    blockers.push(issue(
      'ENRICHMENT_PRODUCTION_SEAL_NOT_CURRENT',
      'Production component-weight consumption requires a CURRENT seal evaluation bound to the exact seal.',
    ));
  }
  if (seal.candidateProjectionHash !== candidate.projectionHash) {
    blockers.push(issue(
      'ENRICHMENT_PRODUCTION_CANDIDATE_SEAL_MISMATCH',
      'Candidate projection does not match the sealed candidate projection identity.',
    ));
  }
  if (seal.sourceDatasetHash !== candidate.sourceDatasetHash
      || seal.sourceSharedModelHash !== candidate.sourceSharedModelHash) {
    blockers.push(issue(
      'ENRICHMENT_PRODUCTION_SEAL_SOURCE_MISMATCH',
      'Seal and candidate projection source identities do not match.',
    ));
  }
  if (dataset.sourceSha256 !== seal.sourceDatasetHash
      || dataset.sharedModel.semanticHash !== seal.sourceSharedModelHash) {
    blockers.push(issue(
      'ENRICHMENT_PRODUCTION_ACTIVE_SOURCE_MISMATCH',
      'Active dataset/shared-model identities differ from the sealed source authority.',
    ));
  }
  if (candidate.summary?.status !== 'READY_FOR_STRUCTURAL_IMPACT'
      || candidate.summary?.blockedCount !== 0) {
    blockers.push(issue(
      'ENRICHMENT_PRODUCTION_CANDIDATE_BLOCKED',
      'All component-weight candidate rows must be exact and blocker-free before production activation.',
    ));
  }

  const sharedByKey = uniqueIndex(
    dataset.sharedModel.components,
    (row) => stringValue(row?.componentKey),
    'ENRICHMENT_PRODUCTION_SHARED_COMPONENT_IDENTITY_DUPLICATE',
    blockers,
  );
  const qualifiedBindings = [];
  const weights = new Map();

  for (const row of candidate.rows) {
    if (row.disposition !== 'SHADOW_CANDIDATE_VALUE'
        || row.targetKind !== 'COMPONENT'
        || row.fieldId !== 'componentWeightKg'
        || row.unit !== 'kg'
        || !positive(row.proposedValue)) {
      blockers.push(issue(
        'ENRICHMENT_PRODUCTION_COMPONENT_WEIGHT_ROW_UNQUALIFIED',
        'Package 5A accepts only positive exact componentWeightKg shadow candidates.',
        { proposalId: row.proposalId },
      ));
      continue;
    }
    const shared = sharedByKey.get(row.targetId) || null;
    if (!shared) {
      blockers.push(issue(
        'ENRICHMENT_PRODUCTION_COMPONENT_TARGET_MISSING',
        'Candidate target is not present in the active shared model.',
        { targetId: row.targetId, proposalId: row.proposalId },
      ));
      continue;
    }
    const entityMatches = dataset.entities.filter((entity) => (
      stringValue(entity?.entityId) === row.targetId
      || (stringValue(shared.sourceEntityId)
        && stringValue(entity?.sourceEntityId) === stringValue(shared.sourceEntityId))
    ));
    const exactMatches = dedupeBy(entityMatches, (entity) => stringValue(entity?.entityId));
    if (exactMatches.length !== 1) {
      blockers.push(issue(
        'ENRICHMENT_PRODUCTION_COMPONENT_ENTITY_AMBIGUOUS',
        'Candidate component must resolve to exactly one active workspace entity.',
        {
          targetId: row.targetId,
          proposalId: row.proposalId,
          candidateEntityIds: exactMatches.map((entity) => stringValue(entity?.entityId)).sort(ascii),
        },
      ));
      continue;
    }
    const entity = exactMatches[0];
    const attributes = entity?.properties?.attributes || {};
    const catalogKey = stringValue(attributes.CATALOG_KEY);
    const sourceEntityId = stringValue(entity?.sourceEntityId);
    const resolverKey = catalogKey || sourceEntityId;
    if (!resolverKey) {
      blockers.push(issue(
        'ENRICHMENT_PRODUCTION_COMPONENT_RESOLVER_KEY_MISSING',
        'Production component-mass resolver key is unavailable for the exact component.',
        { targetId: row.targetId, entityId: stringValue(entity?.entityId), proposalId: row.proposalId },
      ));
      continue;
    }
    if (weights.has(resolverKey) && weights.get(resolverKey) !== row.proposedValue) {
      blockers.push(issue(
        'ENRICHMENT_PRODUCTION_COMPONENT_WEIGHT_KEY_CONFLICT',
        'Two exact components collapse onto one production resolver key with different sealed weights.',
        {
          resolverKey,
          existingWeightKg: weights.get(resolverKey),
          conflictingWeightKg: row.proposedValue,
          proposalId: row.proposalId,
        },
      ));
      continue;
    }
    weights.set(resolverKey, row.proposedValue);
    qualifiedBindings.push(deepFreeze({
      proposalId: row.proposalId,
      proposalHash: row.proposalHash,
      targetId: row.targetId,
      entityId: stringValue(entity.entityId),
      sourceEntityId,
      resolverKey,
      resolverKeyBasis: catalogKey ? 'CATALOG_KEY' : 'SOURCE_ENTITY_ID',
      weightKg: row.proposedValue,
      unit: 'kg',
    }));
  }

  qualifiedBindings.sort((left, right) => ascii(left.targetId, right.targetId));
  const dedupedBlockers = dedupeIssues(blockers);
  const ready = dedupedBlockers.length === 0
    && qualifiedBindings.length === candidate.rows.length
    && qualifiedBindings.length > 0;
  const componentWeightsKg = ready
    ? Object.fromEntries([...weights.entries()].sort(([left], [right]) => ascii(left, right)))
    : {};
  const material = {
    schema: ENRICHMENT_PRODUCTION_COMPONENT_WEIGHT_OVERLAY_SCHEMA,
    sealId: seal.sealId,
    sealHash: seal.sealHash,
    currentnessHash: currentness.currentnessHash,
    candidateProjectionHash: candidate.projectionHash,
    sourceDatasetHash: seal.sourceDatasetHash,
    sourceSharedModelHash: seal.sourceSharedModelHash,
    activatedFieldFamilies: ['COMPONENT_WEIGHTS'],
    status: ready ? 'READY_FOR_PRODUCTION_CONSUMPTION' : 'BLOCKED',
    bindings: qualifiedBindings,
    componentWeightsKg,
    blockers: dedupedBlockers,
    summary: {
      candidateCount: candidate.rows.length,
      qualifiedBindingCount: qualifiedBindings.length,
      productionResolverKeyCount: ready ? Object.keys(componentWeightsKg).length : 0,
      blockedCount: dedupedBlockers.length,
    },
    policy: {
      componentWeightsActivated: true,
      fluidDensitiesActivated: false,
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
  return assertEnrichmentProductionComponentWeightOverlay(deepFreeze({
    ...material,
    overlayHash: semanticHash(material),
  }));
}

export function assertEnrichmentProductionComponentWeightOverlay(value) {
  exactKeys(value, [
    'schema', 'sealId', 'sealHash', 'currentnessHash', 'candidateProjectionHash',
    'sourceDatasetHash', 'sourceSharedModelHash', 'activatedFieldFamilies', 'status',
    'bindings', 'componentWeightsKg', 'blockers', 'summary', 'policy',
    'sourceDatasetMutated', 'calculationExecutionPerformed', 'overlayHash',
  ], 'production component-weight overlay');
  if (value.schema !== ENRICHMENT_PRODUCTION_COMPONENT_WEIGHT_OVERLAY_SCHEMA) {
    fail('ENRICHMENT_PRODUCTION_OVERLAY_SCHEMA_INVALID', 'Unexpected production component-weight overlay schema.');
  }
  for (const [field, item] of [
    ['sealId', value.sealId],
    ['sealHash', value.sealHash],
    ['currentnessHash', value.currentnessHash],
    ['candidateProjectionHash', value.candidateProjectionHash],
    ['sourceDatasetHash', value.sourceDatasetHash],
    ['sourceSharedModelHash', value.sourceSharedModelHash],
  ]) requiredText(item, field);
  if (JSON.stringify(value.activatedFieldFamilies) !== JSON.stringify(['COMPONENT_WEIGHTS'])) {
    fail('ENRICHMENT_PRODUCTION_FIELD_FAMILY_INVALID', 'Package 5A may activate only COMPONENT_WEIGHTS.');
  }
  if (!['READY_FOR_PRODUCTION_CONSUMPTION', 'BLOCKED'].includes(value.status)
      || !Array.isArray(value.bindings)
      || !Array.isArray(value.blockers)) {
    fail('ENRICHMENT_PRODUCTION_OVERLAY_INVALID', 'Production component-weight overlay structure is invalid.');
  }
  const targetIds = value.bindings.map((row) => row?.targetId);
  if (!strictlySortedUnique(targetIds)) {
    fail('ENRICHMENT_PRODUCTION_BINDING_ORDER_INVALID', 'Production component bindings must be unique and target-sorted.');
  }
  value.bindings.forEach(validateBinding);
  validateWeightMap(value.componentWeightsKg);
  if (value.status === 'READY_FOR_PRODUCTION_CONSUMPTION') {
    if (value.blockers.length !== 0 || value.bindings.length === 0
        || Object.keys(value.componentWeightsKg).length === 0) {
      fail('ENRICHMENT_PRODUCTION_READY_STATE_INVALID', 'READY production overlay must be complete and blocker-free.');
    }
  } else if (Object.keys(value.componentWeightsKg).length !== 0) {
    fail('ENRICHMENT_PRODUCTION_FAIL_CLOSED_INVALID', 'BLOCKED production overlay must publish no component weight map.');
  }
  if (value.policy?.componentWeightsActivated !== true
      || value.policy?.fluidDensitiesActivated !== false
      || value.policy?.materialDensitiesActivated !== false
      || value.policy?.pipeSectionsActivated !== false
      || value.policy?.supportCapabilitiesActivated !== false
      || value.policy?.supportAvailabilityScenariosActivated !== false
      || value.policy?.partialProductionOverlayPermitted !== false
      || value.policy?.automaticCalculationTriggered !== false
      || value.sourceDatasetMutated !== false
      || value.calculationExecutionPerformed !== false) {
    fail(
      'ENRICHMENT_PRODUCTION_BOUNDARY_INVALID',
      'Package 5A must remain component-weight-only, fail-closed and non-executing.',
    );
  }
  const expectedSummary = {
    candidateCount: value.summary?.candidateCount,
    qualifiedBindingCount: value.bindings.length,
    productionResolverKeyCount: value.status === 'READY_FOR_PRODUCTION_CONSUMPTION'
      ? Object.keys(value.componentWeightsKg).length
      : 0,
    blockedCount: value.blockers.length,
  };
  if (!Number.isInteger(expectedSummary.candidateCount) || expectedSummary.candidateCount < 0
      || semanticHash(value.summary) !== semanticHash(expectedSummary)) {
    fail('ENRICHMENT_PRODUCTION_SUMMARY_INVALID', 'Production component-weight summary is invalid.');
  }
  const { overlayHash, ...material } = value;
  if (overlayHash !== semanticHash(material)) {
    fail('ENRICHMENT_PRODUCTION_OVERLAY_HASH_MISMATCH', 'Production component-weight overlay hash mismatch.');
  }
  return value;
}

function requireDataset(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !requiredText(value.sourceSha256, 'dataset.sourceSha256')
      || !value.sharedModel || !requiredText(value.sharedModel.semanticHash, 'dataset.sharedModel.semanticHash')
      || !Array.isArray(value.sharedModel.components) || !Array.isArray(value.entities)) {
    fail('ENRICHMENT_PRODUCTION_DATASET_INVALID', 'Active workspace dataset is invalid.');
  }
  return value;
}

function validateBinding(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)
      || !positive(row.weightKg) || row.unit !== 'kg'
      || !['CATALOG_KEY', 'SOURCE_ENTITY_ID'].includes(row.resolverKeyBasis)) {
    fail('ENRICHMENT_PRODUCTION_BINDING_INVALID', 'Production component-weight binding is invalid.');
  }
  ['proposalId', 'proposalHash', 'targetId', 'entityId', 'resolverKey'].forEach((field) => requiredText(row[field], field));
  if (row.resolverKeyBasis === 'SOURCE_ENTITY_ID') requiredText(row.sourceEntityId, 'sourceEntityId');
}

function validateWeightMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('ENRICHMENT_PRODUCTION_WEIGHT_MAP_INVALID', 'componentWeightsKg must be an object map.');
  }
  const keys = Object.keys(value);
  if (JSON.stringify(keys) !== JSON.stringify([...keys].sort(ascii))) {
    fail('ENRICHMENT_PRODUCTION_WEIGHT_MAP_ORDER_INVALID', 'componentWeightsKg keys must be canonical sorted.');
  }
  keys.forEach((key) => {
    requiredText(key, 'componentWeightsKg key');
    if (!positive(value[key])) fail('ENRICHMENT_PRODUCTION_WEIGHT_INVALID', 'Production component weight must be positive.');
  });
}

function uniqueIndex(values, keyOf, duplicateCode, blockers) {
  const result = new Map();
  for (const value of values || []) {
    const key = keyOf(value);
    if (!key) continue;
    if (result.has(key)) {
      blockers.push(issue(duplicateCode, 'Active source contains duplicate exact component identity.', { key }));
      continue;
    }
    result.set(key, value);
  }
  return result;
}

function dedupeBy(values, keyOf) {
  const seen = new Set();
  return (values || []).filter((value) => {
    const key = keyOf(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
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
  }).sort((left, right) => ascii(`${left.code}|${left.targetId || ''}|${left.proposalId || ''}`, `${right.code}|${right.targetId || ''}|${right.proposalId || ''}`));
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('ENRICHMENT_PRODUCTION_TYPE_INVALID', `${label} must be an object.`);
  }
  const actual = Object.keys(value).sort(ascii);
  const expected = [...keys].sort(ascii);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail('ENRICHMENT_PRODUCTION_KEYS_INVALID', `${label} keys are invalid.`);
  }
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    fail('ENRICHMENT_PRODUCTION_TEXT_INVALID', `${label} must be a non-empty trimmed string.`);
  }
  return value;
}

function positive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function strictlySortedUnique(values) {
  return values.length === new Set(values).size
    && values.every((value, index) => index === 0 || ascii(values[index - 1], value) < 0);
}

function ascii(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
