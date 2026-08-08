import { requireCommonEnrichedInsulationResolution } from '../../core/common-enriched-properties/insulation-register-resolution.js';
import { requireCommonEnrichedFluidResolution } from '../../core/common-enriched-properties/fluid-register-resolution.js';
import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import { stringValue } from '../dataset-utils.js';
import {
  assertEngineeringInputSeal,
  assertEngineeringInputSealCurrentness,
} from './input-seal.js';

export const ENRICHMENT_INSULATION_DENSITY_PROJECTION_SCHEMA =
  'EngineeringEnrichmentInsulationDensityProjection.v1';
export const ENRICHMENT_HYDRO_FLUID_DENSITY_PROJECTION_SCHEMA =
  'EngineeringEnrichmentHydroFluidDensityProjection.v1';
export const ENRICHMENT_PRODUCTION_INSULATION_DENSITY_OVERLAY_SCHEMA =
  'EngineeringEnrichmentProductionInsulationDensityOverlay.v1';
export const ENRICHMENT_PRODUCTION_HYDRO_FLUID_DENSITY_OVERLAY_SCHEMA =
  'EngineeringEnrichmentProductionHydroFluidDensityOverlay.v1';

const PROJECTION_KEYS = Object.freeze([
  'schema', 'sourceDatasetHash', 'sourceSharedModelHash', 'sourceStructuralHash',
  'resolutionHash', 'rows', 'summary', 'projectionHash',
]);
const PROJECTION_ROW_KEYS = Object.freeze([
  'proposalId', 'proposalHash', 'targetKind', 'targetId', 'fieldFamily',
  'referenceCode', 'densityKgPerM3', 'unit', 'authorityLevel', 'disposition',
  'blockers', 'sourceEvidence',
]);
const SOURCE_EVIDENCE_KEYS = Object.freeze([
  'sourceKind', 'sourceKey', 'sourceHash', 'codeLocator', 'densityLocator',
]);

const INSULATION_CONFIG = Object.freeze({
  label: 'insulation-density',
  projectionSchema: ENRICHMENT_INSULATION_DENSITY_PROJECTION_SCHEMA,
  overlaySchema: ENRICHMENT_PRODUCTION_INSULATION_DENSITY_OVERLAY_SCHEMA,
  fieldFamily: 'INSULATION_DENSITY',
  activatedFieldFamily: 'INSULATION_DENSITIES',
  codeField: 'insulation.code',
  densityField: 'insulation.densityKgM3',
  sourceKind: 'INSULATION_REGISTER',
  authorityProperty: 'lineInsulationAuthority',
  overlayErrorPrefix: 'ENRICHMENT_PRODUCTION_INSULATION_DENSITY',
  projectionErrorPrefix: 'ENRICHMENT_INSULATION_DENSITY_PROJECTION',
});

const HYDRO_CONFIG = Object.freeze({
  label: 'hydro-fluid-density',
  projectionSchema: ENRICHMENT_HYDRO_FLUID_DENSITY_PROJECTION_SCHEMA,
  overlaySchema: ENRICHMENT_PRODUCTION_HYDRO_FLUID_DENSITY_OVERLAY_SCHEMA,
  fieldFamily: 'HYDRO_FLUID_DENSITY',
  activatedFieldFamily: 'HYDRO_FLUID_DENSITIES',
  codeField: 'contents.hydroMediumCode',
  densityField: 'contents.hydroDensityKgM3',
  sourceKind: 'FLUID_REGISTER',
  authorityProperty: 'lineHydroFluidAuthority',
  overlayErrorPrefix: 'ENRICHMENT_PRODUCTION_HYDRO_FLUID_DENSITY',
  projectionErrorPrefix: 'ENRICHMENT_HYDRO_FLUID_DENSITY_PROJECTION',
});

/**
 * Package 5E batch projection for insulation density. The projection requires
 * both the exact insulation code and exact density from one governed
 * INSULATION_REGISTER resolution so later execution can prove that a sealed
 * pipe-section insulation selection and its density describe the same code.
 */
export function buildEnrichmentInsulationDensityProjection(input) {
  exactKeys(input, ['insulationResolution', 'dataset', 'sourceStructuralHash'], 'insulation-density projection input');
  return buildDensityProjection({
    resolution: requireCommonEnrichedInsulationResolution(input.insulationResolution),
    dataset: input.dataset,
    sourceStructuralHash: input.sourceStructuralHash,
    config: INSULATION_CONFIG,
  });
}

export function assertEnrichmentInsulationDensityProjection(value) {
  return assertDensityProjection(value, INSULATION_CONFIG);
}

/**
 * Package 5E batch projection for hydrotest/test-medium density. This is not a
 * default water assumption: the generic exact FLUID_REGISTER resolver must be
 * keyed by the governed line-list test-medium field before this projection can
 * become eligible.
 */
export function buildEnrichmentHydroFluidDensityProjection(input) {
  exactKeys(input, ['hydroFluidResolution', 'dataset', 'sourceStructuralHash'], 'hydro-fluid-density projection input');
  return buildDensityProjection({
    resolution: requireCommonEnrichedFluidResolution(input.hydroFluidResolution),
    dataset: input.dataset,
    sourceStructuralHash: input.sourceStructuralHash,
    config: HYDRO_CONFIG,
  });
}

export function assertEnrichmentHydroFluidDensityProjection(value) {
  return assertDensityProjection(value, HYDRO_CONFIG);
}

export function buildEnrichmentProductionInsulationDensityOverlay(input) {
  return buildDensityOverlay(input, INSULATION_CONFIG);
}

export function assertEnrichmentProductionInsulationDensityOverlay(value) {
  return assertDensityOverlay(value, INSULATION_CONFIG);
}

export function buildEnrichmentProductionHydroFluidDensityOverlay(input) {
  return buildDensityOverlay(input, HYDRO_CONFIG);
}

export function assertEnrichmentProductionHydroFluidDensityOverlay(value) {
  return assertDensityOverlay(value, HYDRO_CONFIG);
}

function buildDensityProjection({ resolution, dataset: datasetInput, sourceStructuralHash: structural, config }) {
  const dataset = requireDataset(datasetInput, config);
  const sourceStructuralHash = semanticHashText(structural, 'sourceStructuralHash', config);
  const rows = resolution.targetRecords.map((record) => projectDensityRow({
    record,
    resolutionHash: resolution.semanticHash,
    sourceSharedModelHash: dataset.sharedModel.semanticHash,
    config,
  })).sort((left, right) => ascii(left.proposalId, right.proposalId));
  const summary = projectionSummary(rows);
  const material = {
    schema: config.projectionSchema,
    sourceDatasetHash: dataset.sourceSha256,
    sourceSharedModelHash: dataset.sharedModel.semanticHash,
    sourceStructuralHash,
    resolutionHash: resolution.semanticHash,
    rows,
    summary,
  };
  return assertDensityProjection(deepFreeze({
    ...material,
    projectionHash: semanticHash(material),
  }), config);
}

function assertDensityProjection(value, config) {
  exactKeys(value, PROJECTION_KEYS, `${config.label} projection`, config);
  if (value.schema !== config.projectionSchema) {
    fail(`${config.projectionErrorPrefix}_SCHEMA_INVALID`, `Unexpected ${config.label} projection schema.`);
  }
  requiredText(value.sourceDatasetHash, 'sourceDatasetHash', config);
  semanticHashText(value.sourceSharedModelHash, 'sourceSharedModelHash', config);
  semanticHashText(value.sourceStructuralHash, 'sourceStructuralHash', config);
  semanticHashText(value.resolutionHash, 'resolutionHash', config);
  semanticHashText(value.projectionHash, 'projectionHash', config);
  if (!Array.isArray(value.rows)) {
    fail(`${config.projectionErrorPrefix}_ROWS_INVALID`, `${config.label} projection rows must be an array.`);
  }
  const proposalIds = value.rows.map((row, index) => validateProjectionRow(row, index, value.resolutionHash, config));
  if (!strictlySortedUnique(proposalIds, config)) {
    fail(`${config.projectionErrorPrefix}_ORDER_INVALID`, `${config.label} projection rows must be proposalId-sorted and unique.`);
  }
  if (semanticHash(value.summary) !== semanticHash(projectionSummary(value.rows))) {
    fail(`${config.projectionErrorPrefix}_SUMMARY_INVALID`, `${config.label} projection summary is invalid.`);
  }
  const { projectionHash, ...material } = value;
  if (projectionHash !== semanticHash(material)) {
    fail(`${config.projectionErrorPrefix}_HASH_MISMATCH`, `${config.label} projection hash mismatch.`);
  }
  return value;
}

function projectDensityRow({ record, resolutionHash, sourceSharedModelHash, config }) {
  const lineKey = requiredText(record.lineKey, `${config.label} resolution lineKey`, config);
  const fields = new Map((record.fields || []).map((field) => [field.field, field]));
  const codeField = fields.get(config.codeField);
  const densityField = fields.get(config.densityField);
  const blockers = [];
  if (record.sourceModelHash !== sourceSharedModelHash) {
    blockers.push({ code: `${config.fieldFamily}_SHARED_MODEL_MISMATCH` });
  }
  validateExactField(codeField, config.codeField, 'STRING', config, blockers);
  validateExactField(densityField, config.densityField, 'NUMBER', config, blockers);
  if (densityField && densityField.unit !== 'kg/m3') {
    blockers.push({ code: `${config.fieldFamily}_DENSITY_UNIT_INVALID`, unit: densityField.unit });
  }
  if (densityField && !positive(densityField.value)) {
    blockers.push({ code: `${config.fieldFamily}_DENSITY_VALUE_INVALID` });
  }
  if (codeField && densityField
      && (codeField.sourceKind !== config.sourceKind || densityField.sourceKind !== config.sourceKind
        || codeField.sourceKey !== densityField.sourceKey || codeField.sourceHash !== densityField.sourceHash)) {
    blockers.push({ code: `${config.fieldFamily}_SOURCE_COHERENCE_INVALID` });
  }
  const sourceEvidence = deepFreeze({
    sourceKind: densityField?.sourceKind ?? codeField?.sourceKind ?? 'NONE',
    sourceKey: densityField?.sourceKey ?? codeField?.sourceKey ?? null,
    sourceHash: densityField?.sourceHash ?? codeField?.sourceHash ?? null,
    codeLocator: codeField?.locator ?? null,
    densityLocator: densityField?.locator ?? null,
  });
  const canonicalBlockers = blockers.sort((left, right) => ascii(semanticHash(left), semanticHash(right)));
  const referenceCode = typeof codeField?.value === 'string' ? codeField.value.trim().toUpperCase() : null;
  const densityKgPerM3 = densityField?.value ?? null;
  const proposalId = `${config.fieldFamily}:${lineKey}`;
  const proposalMaterial = {
    resolutionHash,
    targetKind: 'LINE',
    targetId: lineKey,
    fieldFamily: config.fieldFamily,
    referenceCode,
    densityKgPerM3,
    unit: 'kg/m3',
    sourceEvidence,
  };
  return deepFreeze({
    proposalId,
    proposalHash: semanticHash(proposalMaterial),
    targetKind: 'LINE',
    targetId: lineKey,
    fieldFamily: config.fieldFamily,
    referenceCode,
    densityKgPerM3,
    unit: 'kg/m3',
    authorityLevel: 'AUTHORIZED_MASTER_CANDIDATE',
    disposition: canonicalBlockers.length === 0 ? 'SHADOW_CANDIDATE_VALUE' : `BLOCKED_${config.fieldFamily}`,
    blockers: canonicalBlockers,
    sourceEvidence,
  });
}

function validateExactField(field, fieldName, kind, config, blockers) {
  if (!field) {
    blockers.push({ code: `${config.fieldFamily}_FIELD_MISSING`, field: fieldName });
    return;
  }
  if (field.status !== 'RESOLVED_EXACT') blockers.push({ code: `${config.fieldFamily}_FIELD_NOT_EXACT`, field: fieldName, status: field.status });
  if (field.approved !== true) blockers.push({ code: `${config.fieldFamily}_FIELD_NOT_APPROVED`, field: fieldName });
  if (kind === 'STRING' && (typeof field.value !== 'string' || !field.value.trim())) {
    blockers.push({ code: `${config.fieldFamily}_CODE_INVALID`, field: fieldName });
  }
  if (kind === 'NUMBER' && !Number.isFinite(field.value)) {
    blockers.push({ code: `${config.fieldFamily}_NUMBER_INVALID`, field: fieldName });
  }
  if (field.sourceKind !== config.sourceKind || !field.sourceKey || !field.sourceHash || !field.locator) {
    blockers.push({ code: `${config.fieldFamily}_SOURCE_EVIDENCE_INVALID`, field: fieldName });
  }
}

function validateProjectionRow(row, index, resolutionHash, config) {
  exactKeys(row, PROJECTION_ROW_KEYS, `${config.label} rows[${index}]`, config);
  requiredText(row.proposalId, `rows[${index}].proposalId`, config);
  semanticHashText(row.proposalHash, `rows[${index}].proposalHash`, config);
  if (row.targetKind !== 'LINE'
      || !requiredText(row.targetId, `rows[${index}].targetId`, config)
      || row.fieldFamily !== config.fieldFamily
      || row.unit !== 'kg/m3'
      || row.authorityLevel !== 'AUTHORIZED_MASTER_CANDIDATE'
      || !['SHADOW_CANDIDATE_VALUE', `BLOCKED_${config.fieldFamily}`].includes(row.disposition)
      || !Array.isArray(row.blockers)) {
    fail(`${config.projectionErrorPrefix}_ROW_INVALID`, `${config.label} rows[${index}] is invalid.`);
  }
  exactKeys(row.sourceEvidence, SOURCE_EVIDENCE_KEYS, `rows[${index}].sourceEvidence`, config);
  if (row.disposition === 'SHADOW_CANDIDATE_VALUE') {
    if (!requiredText(row.referenceCode, `rows[${index}].referenceCode`, config)
        || row.referenceCode !== row.referenceCode.toUpperCase()
        || !positive(row.densityKgPerM3)
        || row.blockers.length !== 0
        || row.sourceEvidence.sourceKind !== config.sourceKind
        || !requiredText(row.sourceEvidence.sourceKey, 'sourceEvidence.sourceKey', config)
        || !requiredText(row.sourceEvidence.sourceHash, 'sourceEvidence.sourceHash', config)
        || !requiredText(row.sourceEvidence.codeLocator, 'sourceEvidence.codeLocator', config)
        || !requiredText(row.sourceEvidence.densityLocator, 'sourceEvidence.densityLocator', config)) {
      fail(`${config.projectionErrorPrefix}_EXACT_ROW_INVALID`, `Exact ${config.label} rows[${index}] is invalid.`);
    }
  } else if (row.blockers.length === 0) {
    fail(`${config.projectionErrorPrefix}_BLOCKERS_REQUIRED`, `Blocked ${config.label} rows[${index}] requires blockers.`);
  }
  const expectedProposalHash = semanticHash({
    resolutionHash,
    targetKind: row.targetKind,
    targetId: row.targetId,
    fieldFamily: row.fieldFamily,
    referenceCode: row.referenceCode,
    densityKgPerM3: row.densityKgPerM3,
    unit: row.unit,
    sourceEvidence: row.sourceEvidence,
  });
  if (row.proposalHash !== expectedProposalHash) {
    fail(`${config.projectionErrorPrefix}_PROPOSAL_HASH_MISMATCH`, `${config.label} rows[${index}] proposal hash mismatch.`);
  }
  return row.proposalId;
}

function buildDensityOverlay(input, config) {
  exactKeys(input, ['seal', 'currentness', 'candidateProjection', 'dataset'], `${config.label} overlay input`, config);
  const seal = assertEngineeringInputSeal(input.seal);
  const currentness = assertEngineeringInputSealCurrentness(input.currentness);
  const candidate = assertDensityProjection(input.candidateProjection, config);
  const dataset = requireDataset(input.dataset, config);
  const blockers = [];

  if (currentness.sealHash !== seal.sealHash
      || currentness.status !== 'CURRENT'
      || currentness.current !== true
      || currentness.requiresReseal !== false) {
    blockers.push(issue(`${config.overlayErrorPrefix}_SEAL_NOT_CURRENT`, `Production ${config.label} consumption requires a CURRENT seal evaluation bound to the exact seal.`));
  }
  if (seal.candidateProjectionHash !== candidate.projectionHash) {
    blockers.push(issue(`${config.overlayErrorPrefix}_CANDIDATE_SEAL_MISMATCH`, `${config.label} candidate projection does not match the sealed candidate identity.`));
  }
  if (seal.sourceDatasetHash !== candidate.sourceDatasetHash
      || seal.sourceSharedModelHash !== candidate.sourceSharedModelHash
      || seal.sourceStructuralHash !== candidate.sourceStructuralHash) {
    blockers.push(issue(`${config.overlayErrorPrefix}_SEAL_SOURCE_MISMATCH`, `Seal and ${config.label} candidate source identities do not match.`));
  }
  if (dataset.sourceSha256 !== seal.sourceDatasetHash
      || dataset.sharedModel.semanticHash !== seal.sourceSharedModelHash) {
    blockers.push(issue(`${config.overlayErrorPrefix}_ACTIVE_SOURCE_MISMATCH`, `Active dataset/shared-model identities differ from the sealed ${config.label} authority.`));
  }
  if (candidate.summary?.status !== 'READY_FOR_STRUCTURAL_IMPACT' || candidate.summary?.blockedCount !== 0) {
    blockers.push(issue(`${config.overlayErrorPrefix}_CANDIDATE_BLOCKED`, `All ${config.label} candidate rows must be exact and blocker-free before production activation.`));
  }

  const activePipeLineKeys = new Set(
    dataset.entities
      .filter((entity) => stringValue(entity?.entityType) === 'PIPE')
      .map((entity) => stringValue(entity?.lineKey))
      .filter(Boolean),
  );
  const bindings = [];
  const authority = new Map();
  const seenLineKeys = new Set();
  for (const row of candidate.rows) {
    if (row.disposition !== 'SHADOW_CANDIDATE_VALUE'
        || row.targetKind !== 'LINE'
        || row.fieldFamily !== config.fieldFamily
        || !positive(row.densityKgPerM3)
        || !requiredText(row.referenceCode, 'referenceCode', config)) {
      blockers.push(issue(`${config.overlayErrorPrefix}_ROW_UNQUALIFIED`, `Package 5E accepts only exact ${config.fieldFamily} LINE candidates.`, { proposalId: row.proposalId }));
      continue;
    }
    const lineKey = stringValue(row.targetId);
    if (!lineKey || !activePipeLineKeys.has(lineKey)) {
      blockers.push(issue(`${config.overlayErrorPrefix}_LINE_MISSING`, `${config.label} target is not an active PIPE lineKey.`, { targetId: row.targetId, proposalId: row.proposalId }));
      continue;
    }
    if (seenLineKeys.has(lineKey)) {
      blockers.push(issue(`${config.overlayErrorPrefix}_LINE_DUPLICATE`, `A production line may have only one exact sealed ${config.label} candidate.`, { targetId: lineKey, proposalId: row.proposalId }));
      continue;
    }
    seenLineKeys.add(lineKey);
    const lineAuthority = deepFreeze({
      referenceCode: row.referenceCode,
      densityKgPerM3: row.densityKgPerM3,
      unit: 'kg/m3',
    });
    authority.set(lineKey, lineAuthority);
    bindings.push(deepFreeze({
      proposalId: row.proposalId,
      proposalHash: row.proposalHash,
      targetId: row.targetId,
      lineKey,
      ...lineAuthority,
    }));
  }
  bindings.sort((left, right) => ascii(left.lineKey, right.lineKey));
  const dedupedBlockers = dedupeIssues(blockers);
  const ready = dedupedBlockers.length === 0 && bindings.length === candidate.rows.length && bindings.length > 0;
  const authorityObject = ready
    ? Object.fromEntries([...authority.entries()].sort(([left], [right]) => ascii(left, right)))
    : {};
  const material = {
    schema: config.overlaySchema,
    sealId: seal.sealId,
    sealHash: seal.sealHash,
    currentnessHash: currentness.currentnessHash,
    observedAuthorityHash: currentness.observedAuthorityHash,
    candidateProjectionHash: candidate.projectionHash,
    resolutionHash: candidate.resolutionHash,
    sourceDatasetHash: seal.sourceDatasetHash,
    sourceSharedModelHash: seal.sourceSharedModelHash,
    sourceStructuralHash: seal.sourceStructuralHash,
    activatedFieldFamilies: [config.activatedFieldFamily],
    status: ready ? 'READY_FOR_PRODUCTION_CONSUMPTION' : 'BLOCKED',
    bindings,
    [config.authorityProperty]: authorityObject,
    blockers: dedupedBlockers,
    summary: {
      candidateCount: candidate.rows.length,
      qualifiedBindingCount: bindings.length,
      productionLineKeyCount: ready ? Object.keys(authorityObject).length : 0,
      blockedCount: dedupedBlockers.length,
    },
    policy: densityPolicy(config),
    sourceDatasetMutated: false,
    calculationExecutionPerformed: false,
  };
  return assertDensityOverlay(deepFreeze({
    ...material,
    overlayHash: semanticHash(material),
  }), config);
}

function assertDensityOverlay(value, config) {
  exactKeys(value, [
    'schema', 'sealId', 'sealHash', 'currentnessHash', 'observedAuthorityHash',
    'candidateProjectionHash', 'resolutionHash', 'sourceDatasetHash',
    'sourceSharedModelHash', 'sourceStructuralHash', 'activatedFieldFamilies',
    'status', 'bindings', config.authorityProperty, 'blockers', 'summary', 'policy',
    'sourceDatasetMutated', 'calculationExecutionPerformed', 'overlayHash',
  ], `${config.label} production overlay`, config);
  if (value.schema !== config.overlaySchema) {
    fail(`${config.overlayErrorPrefix}_SCHEMA_INVALID`, `Unexpected ${config.label} production overlay schema.`);
  }
  for (const [field, item] of [
    ['sealId', value.sealId], ['sealHash', value.sealHash], ['currentnessHash', value.currentnessHash],
    ['observedAuthorityHash', value.observedAuthorityHash], ['candidateProjectionHash', value.candidateProjectionHash],
    ['resolutionHash', value.resolutionHash], ['sourceDatasetHash', value.sourceDatasetHash],
    ['sourceSharedModelHash', value.sourceSharedModelHash], ['sourceStructuralHash', value.sourceStructuralHash],
  ]) requiredText(item, field, config);
  if (JSON.stringify(value.activatedFieldFamilies) !== JSON.stringify([config.activatedFieldFamily])) {
    fail(`${config.overlayErrorPrefix}_FIELD_FAMILY_INVALID`, `${config.label} overlay may activate only ${config.activatedFieldFamily}.`);
  }
  if (!['READY_FOR_PRODUCTION_CONSUMPTION', 'BLOCKED'].includes(value.status)
      || !Array.isArray(value.bindings) || !Array.isArray(value.blockers)) {
    fail(`${config.overlayErrorPrefix}_OVERLAY_INVALID`, `${config.label} production overlay structure is invalid.`);
  }
  const lineKeys = value.bindings.map((row) => row?.lineKey);
  if (!strictlySortedUnique(lineKeys, config)) {
    fail(`${config.overlayErrorPrefix}_BINDING_ORDER_INVALID`, `${config.label} bindings must be lineKey-sorted and unique.`);
  }
  value.bindings.forEach((row) => validateBinding(row, config));
  validateAuthorityMap(value[config.authorityProperty], config);
  if (value.status === 'READY_FOR_PRODUCTION_CONSUMPTION') {
    if (value.blockers.length !== 0 || value.bindings.length === 0
        || Object.keys(value[config.authorityProperty]).length === 0) {
      fail(`${config.overlayErrorPrefix}_READY_STATE_INVALID`, `READY ${config.label} overlay must be complete and blocker-free.`);
    }
  } else if (Object.keys(value[config.authorityProperty]).length !== 0) {
    fail(`${config.overlayErrorPrefix}_FAIL_CLOSED_INVALID`, `BLOCKED ${config.label} overlay must publish no production authority map.`);
  }
  if (semanticHash(value.policy) !== semanticHash(densityPolicy(config))
      || value.sourceDatasetMutated !== false || value.calculationExecutionPerformed !== false) {
    fail(`${config.overlayErrorPrefix}_BOUNDARY_INVALID`, `${config.label} overlay crossed the Package 5E authority boundary.`);
  }
  const expectedSummary = {
    candidateCount: value.summary?.candidateCount,
    qualifiedBindingCount: value.bindings.length,
    productionLineKeyCount: value.status === 'READY_FOR_PRODUCTION_CONSUMPTION'
      ? Object.keys(value[config.authorityProperty]).length : 0,
    blockedCount: value.blockers.length,
  };
  if (!Number.isInteger(expectedSummary.candidateCount) || expectedSummary.candidateCount < 0
      || semanticHash(value.summary) !== semanticHash(expectedSummary)) {
    fail(`${config.overlayErrorPrefix}_SUMMARY_INVALID`, `${config.label} overlay summary is invalid.`);
  }
  const { overlayHash, ...material } = value;
  if (overlayHash !== semanticHash(material)) {
    fail(`${config.overlayErrorPrefix}_HASH_MISMATCH`, `${config.label} overlay hash mismatch.`);
  }
  return value;
}

function densityPolicy(config) {
  return deepFreeze({
    componentWeightsActivated: false,
    operatingFluidDensitiesActivated: false,
    hydroFluidDensitiesActivated: config === HYDRO_CONFIG,
    materialDensitiesActivated: false,
    pipeSectionsActivated: false,
    insulationDensitiesActivated: config === INSULATION_CONFIG,
    supportCapabilitiesActivated: false,
    supportAvailabilityScenariosActivated: false,
    partialProductionOverlayPermitted: false,
    automaticCalculationTriggered: false,
  });
}

function validateBinding(row, config) {
  if (!row || typeof row !== 'object' || Array.isArray(row)
      || !positive(row.densityKgPerM3) || row.unit !== 'kg/m3') {
    fail(`${config.overlayErrorPrefix}_BINDING_INVALID`, `${config.label} production binding is invalid.`);
  }
  for (const field of ['proposalId', 'proposalHash', 'targetId', 'lineKey', 'referenceCode']) {
    requiredText(row[field], field, config);
  }
  if (row.targetId !== row.lineKey) {
    fail(`${config.overlayErrorPrefix}_LINE_IDENTITY_INVALID`, `${config.label} targetId must equal production lineKey.`);
  }
}

function validateAuthorityMap(value, config) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${config.overlayErrorPrefix}_MAP_INVALID`, `${config.authorityProperty} must be an object map.`);
  }
  const keys = Object.keys(value);
  if (JSON.stringify(keys) !== JSON.stringify([...keys].sort(ascii))) {
    fail(`${config.overlayErrorPrefix}_MAP_ORDER_INVALID`, `${config.label} authority map keys must be canonical sorted.`);
  }
  for (const key of keys) {
    requiredText(key, `${config.authorityProperty} key`, config);
    const row = value[key];
    if (!row || typeof row !== 'object' || Array.isArray(row)
        || Object.keys(row).sort(ascii).join('|') !== ['densityKgPerM3', 'referenceCode', 'unit'].sort(ascii).join('|')
        || !requiredText(row.referenceCode, `${key}.referenceCode`, config)
        || !positive(row.densityKgPerM3) || row.unit !== 'kg/m3') {
      fail(`${config.overlayErrorPrefix}_MAP_VALUE_INVALID`, `${config.label} authority map value is invalid.`);
    }
  }
}

function projectionSummary(rows) {
  const dispositions = {};
  for (const row of rows) dispositions[row.disposition] = (dispositions[row.disposition] || 0) + 1;
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

function requireDataset(value, config) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !requiredText(value.sourceSha256, 'dataset.sourceSha256', config)
      || !value.sharedModel
      || !semanticHashText(value.sharedModel.semanticHash, 'dataset.sharedModel.semanticHash', config)
      || !Array.isArray(value.entities)) {
    fail(`${config.overlayErrorPrefix}_DATASET_INVALID`, 'Active workspace dataset is invalid.');
  }
  return value;
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

function strictlySortedUnique(values, config) {
  if (!Array.isArray(values)) return false;
  for (let index = 0; index < values.length; index += 1) {
    if (!requiredText(values[index], `binding[${index}] identity`, config)) return false;
    if (index > 0 && ascii(values[index - 1], values[index]) >= 0) return false;
  }
  return true;
}

function exactKeys(value, keys, label, config = INSULATION_CONFIG) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${config.overlayErrorPrefix}_TYPE_INVALID`, `${label} must be an object.`);
  }
  const actual = Object.keys(value).sort(ascii);
  const expected = [...keys].sort(ascii);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${config.overlayErrorPrefix}_KEYS_INVALID`, `${label} keys are invalid.`, { actual, expected });
  }
}

function requiredText(value, label, config = INSULATION_CONFIG) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    fail(`${config.overlayErrorPrefix}_TEXT_INVALID`, `${label} must be a non-empty trimmed string.`);
  }
  return value;
}

function semanticHashText(value, label, config = INSULATION_CONFIG) {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    fail(`${config.overlayErrorPrefix}_HASH_INVALID`, `${label} must be an FNV-1a semantic hash.`);
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
