import { requireCommonEnrichedMaterialResolution } from '../../core/common-enriched-properties/material-register-resolution.js';
import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import {
  RESTRAINT_QUALIFICATIONS,
  RESTRAINT_STATES,
  validateRestraintCapabilityModel,
  validateSupportAttachmentModel,
} from '../../core/support-restraints/index.js';
import { stringValue } from '../dataset-utils.js';
import {
  assertEngineeringInputSeal,
  assertEngineeringInputSealCurrentness,
} from './input-seal.js';

export const ENRICHMENT_MATERIAL_SELECTION_PROJECTION_SCHEMA =
  'EngineeringEnrichmentMaterialSelectionProjection.v1';
export const ENRICHMENT_PRODUCTION_MATERIAL_SELECTION_OVERLAY_SCHEMA =
  'EngineeringEnrichmentProductionMaterialSelectionOverlay.v1';
export const ENRICHMENT_SUPPORT_CAPABILITY_PROJECTION_SCHEMA =
  'EngineeringEnrichmentSupportCapabilityProjection.v1';
export const ENRICHMENT_PRODUCTION_SUPPORT_CAPABILITY_OVERLAY_SCHEMA =
  'EngineeringEnrichmentProductionSupportCapabilityOverlay.v1';

const MATERIAL_PROJECTION_KEYS = Object.freeze([
  'schema', 'sourceDatasetHash', 'sourceSharedModelHash', 'sourceStructuralHash',
  'materialResolutionHash', 'rows', 'summary', 'projectionHash',
]);
const MATERIAL_ROW_KEYS = Object.freeze([
  'proposalId', 'proposalHash', 'targetKind', 'targetId', 'fieldFamily',
  'referenceCode', 'densityKgPerM3', 'unit', 'authorityLevel', 'disposition',
  'blockers', 'sourceEvidence',
]);
const MATERIAL_SOURCE_KEYS = Object.freeze([
  'sourceKind', 'sourceKey', 'sourceHash', 'codeLocator', 'densityLocator',
]);
const SUPPORT_PROJECTION_KEYS = Object.freeze([
  'schema', 'sourceDatasetHash', 'sourceSharedModelHash', 'sourceStructuralHash',
  'supportSiteModelSemanticHash', 'supportAttachmentModelSemanticHash',
  'restraintCapabilityModelSemanticHash', 'rows', 'summary', 'projectionHash',
]);
const SUPPORT_ROW_KEYS = Object.freeze([
  'proposalId', 'proposalHash', 'targetKind', 'targetId', 'fieldFamily',
  'supportKey', 'sourceEntityId', 'sourceType', 'attachmentId', 'attachedComponentKey',
  'qualification', 'solverEligible', 'verticalState', 'verticalBasis', 'verticalEnabled',
  'nonGravityEvidenceHash', 'authorityLevel', 'disposition', 'blockers',
]);

/**
 * Package 5F closes the source-material identity gap left by Package 5C.
 * The exact MATERIAL_REGISTER resolution must publish both the canonical
 * material code and positive density for the same LINE target.
 */
export function buildEnrichmentMaterialSelectionProjection(input) {
  exactKeys(input, ['materialResolution', 'dataset', 'sourceStructuralHash'], 'material-selection projection input');
  const resolution = requireCommonEnrichedMaterialResolution(input.materialResolution);
  const dataset = requireDataset(input.dataset);
  const sourceStructuralHash = hashText(input.sourceStructuralHash, 'sourceStructuralHash');
  const rows = resolution.targetRecords.map((record) => materialSelectionRow({
    record,
    materialResolutionHash: resolution.semanticHash,
    sourceSharedModelHash: dataset.sharedModel.semanticHash,
  })).sort(byProposal);
  const summary = projectionSummary(rows);
  const material = {
    schema: ENRICHMENT_MATERIAL_SELECTION_PROJECTION_SCHEMA,
    sourceDatasetHash: dataset.sourceSha256,
    sourceSharedModelHash: dataset.sharedModel.semanticHash,
    sourceStructuralHash,
    materialResolutionHash: resolution.semanticHash,
    rows,
    summary,
  };
  return assertEnrichmentMaterialSelectionProjection(deepFreeze({
    ...material,
    projectionHash: semanticHash(material),
  }));
}

export function assertEnrichmentMaterialSelectionProjection(value) {
  exactKeys(value, MATERIAL_PROJECTION_KEYS, 'material-selection projection');
  if (value.schema !== ENRICHMENT_MATERIAL_SELECTION_PROJECTION_SCHEMA) {
    fail('ENRICHMENT_MATERIAL_SELECTION_PROJECTION_SCHEMA_INVALID', 'Unexpected material-selection projection schema.');
  }
  requiredText(value.sourceDatasetHash, 'sourceDatasetHash');
  hashText(value.sourceSharedModelHash, 'sourceSharedModelHash');
  hashText(value.sourceStructuralHash, 'sourceStructuralHash');
  hashText(value.materialResolutionHash, 'materialResolutionHash');
  hashText(value.projectionHash, 'projectionHash');
  if (!Array.isArray(value.rows)) fail('ENRICHMENT_MATERIAL_SELECTION_ROWS_INVALID', 'Material-selection rows must be an array.');
  const ids = value.rows.map((row, index) => validateMaterialRow(row, index, value.materialResolutionHash));
  if (!strictlySortedUnique(ids)) {
    fail('ENRICHMENT_MATERIAL_SELECTION_ORDER_INVALID', 'Material-selection rows must be proposalId-sorted and unique.');
  }
  if (semanticHash(value.summary) !== semanticHash(projectionSummary(value.rows))) {
    fail('ENRICHMENT_MATERIAL_SELECTION_SUMMARY_INVALID', 'Material-selection summary is stale.');
  }
  const { projectionHash, ...material } = value;
  if (projectionHash !== semanticHash(material)) {
    fail('ENRICHMENT_MATERIAL_SELECTION_HASH_MISMATCH', 'Material-selection projection hash mismatch.');
  }
  return value;
}

export function buildEnrichmentProductionMaterialSelectionOverlay(input) {
  return buildLineAuthorityOverlay({
    input,
    label: 'material-selection',
    projectionAssert: assertEnrichmentMaterialSelectionProjection,
    schema: ENRICHMENT_PRODUCTION_MATERIAL_SELECTION_OVERLAY_SCHEMA,
    activatedFieldFamily: 'MATERIAL_SELECTION',
    authorityProperty: 'lineMaterialAuthority',
    resolutionProperty: 'materialResolutionHash',
    readyCodePrefix: 'ENRICHMENT_PRODUCTION_MATERIAL_SELECTION',
  });
}

export function assertEnrichmentProductionMaterialSelectionOverlay(value) {
  return assertLineAuthorityOverlay({
    value,
    schema: ENRICHMENT_PRODUCTION_MATERIAL_SELECTION_OVERLAY_SCHEMA,
    activatedFieldFamily: 'MATERIAL_SELECTION',
    authorityProperty: 'lineMaterialAuthority',
    resolutionProperty: 'materialResolutionHash',
    codePrefix: 'ENRICHMENT_PRODUCTION_MATERIAL_SELECTION',
  });
}

/**
 * Projects the existing core support attachment + restraint capability chain
 * into the only support shape currently consumed by V2/V3 gravity:
 * topology.supportTypeCapabilities[type].vertical.
 *
 * GAP, SPRING, UNKNOWN, CONFLICT, unattached or otherwise non-solver-eligible
 * vertical states are retained as blockers. Package 5F does not turn nonlinear
 * contact evidence into a Boolean support capability.
 */
export function buildEnrichmentSupportCapabilityProjection(input) {
  exactKeys(
    input,
    ['attachmentModel', 'restraintCapabilityModel', 'dataset', 'supportSiteModel', 'sourceStructuralHash'],
    'support-capability projection input',
  );
  const dataset = requireDataset(input.dataset);
  const supportSiteModel = requireSupportSiteModel(input.supportSiteModel, dataset.datasetId);
  const attachmentModel = input.attachmentModel;
  const restraintModel = input.restraintCapabilityModel;
  const attachmentAudit = validateSupportAttachmentModel(attachmentModel);
  if (!attachmentAudit.ok) {
    fail('ENRICHMENT_SUPPORT_ATTACHMENT_MODEL_INVALID', 'Support capability projection requires a valid support attachment model.', { errors: attachmentAudit.errors });
  }
  const restraintAudit = validateRestraintCapabilityModel(restraintModel);
  if (!restraintAudit.ok) {
    fail('ENRICHMENT_RESTRAINT_CAPABILITY_MODEL_INVALID', 'Support capability projection requires a valid restraint capability model.', { errors: restraintAudit.errors });
  }
  if (attachmentModel.datasetId !== dataset.datasetId
      || restraintModel.datasetId !== dataset.datasetId
      || attachmentModel.sharedModelSemanticHash !== dataset.sharedModel.semanticHash
      || restraintModel.sharedModelSemanticHash !== dataset.sharedModel.semanticHash
      || restraintModel.attachmentModelSemanticHash !== attachmentModel.semanticHash) {
    fail('ENRICHMENT_SUPPORT_AUTHORITY_SOURCE_MISMATCH', 'Support attachment/restraint authority does not belong to the active dataset/shared model.');
  }

  const memberBySourceEntityId = supportSiteMemberIndex(supportSiteModel);
  const supportByKey = new Map(attachmentModel.supportProjection.supports.map((row) => [row.supportKey, row]));
  const rows = restraintModel.restraints.map((restraint) => supportCapabilityRow({
    restraint,
    support: supportByKey.get(restraint.supportKey),
    memberBySourceEntityId,
  }));
  const activeMemberIds = [...memberBySourceEntityId.keys()].sort(ascii);
  const projectedMemberIds = rows.map((row) => row.sourceEntityId).filter(Boolean).sort(ascii);
  if (JSON.stringify(activeMemberIds) !== JSON.stringify(projectedMemberIds)) {
    rows.forEach((row) => {
      row.blockers = dedupeIssues([...row.blockers, issue(
        'SUPPORT_ACTIVE_MEMBER_COVERAGE_MISMATCH',
        'Core restraint authority must cover exactly the active support-site source members.',
        { activeMemberIds, projectedMemberIds },
      )]);
      row.disposition = 'BLOCKED';
    });
  }
  addTypeConflicts(rows);
  rows.sort(byProposal);
  const summary = projectionSummary(rows);
  const sourceStructuralHash = hashText(input.sourceStructuralHash, 'sourceStructuralHash');
  const material = {
    schema: ENRICHMENT_SUPPORT_CAPABILITY_PROJECTION_SCHEMA,
    sourceDatasetHash: dataset.sourceSha256,
    sourceSharedModelHash: dataset.sharedModel.semanticHash,
    sourceStructuralHash,
    supportSiteModelSemanticHash: semanticHash(supportSiteModel),
    supportAttachmentModelSemanticHash: attachmentModel.semanticHash,
    restraintCapabilityModelSemanticHash: restraintModel.semanticHash,
    rows: rows.map((row) => deepFreeze(row)),
    summary,
  };
  return assertEnrichmentSupportCapabilityProjection(deepFreeze({
    ...material,
    projectionHash: semanticHash(material),
  }));
}

export function assertEnrichmentSupportCapabilityProjection(value) {
  exactKeys(value, SUPPORT_PROJECTION_KEYS, 'support-capability projection');
  if (value.schema !== ENRICHMENT_SUPPORT_CAPABILITY_PROJECTION_SCHEMA) {
    fail('ENRICHMENT_SUPPORT_CAPABILITY_PROJECTION_SCHEMA_INVALID', 'Unexpected support-capability projection schema.');
  }
  requiredText(value.sourceDatasetHash, 'sourceDatasetHash');
  for (const key of [
    'sourceSharedModelHash', 'sourceStructuralHash', 'supportSiteModelSemanticHash',
    'supportAttachmentModelSemanticHash', 'restraintCapabilityModelSemanticHash', 'projectionHash',
  ]) hashText(value[key], key);
  if (!Array.isArray(value.rows)) fail('ENRICHMENT_SUPPORT_CAPABILITY_ROWS_INVALID', 'Support-capability rows must be an array.');
  const ids = value.rows.map((row, index) => validateSupportRow(row, index));
  if (!strictlySortedUnique(ids)) {
    fail('ENRICHMENT_SUPPORT_CAPABILITY_ORDER_INVALID', 'Support-capability rows must be proposalId-sorted and unique.');
  }
  if (semanticHash(value.summary) !== semanticHash(projectionSummary(value.rows))) {
    fail('ENRICHMENT_SUPPORT_CAPABILITY_SUMMARY_INVALID', 'Support-capability summary is stale.');
  }
  const { projectionHash, ...material } = value;
  if (projectionHash !== semanticHash(material)) {
    fail('ENRICHMENT_SUPPORT_CAPABILITY_HASH_MISMATCH', 'Support-capability projection hash mismatch.');
  }
  return value;
}

export function buildEnrichmentProductionSupportCapabilityOverlay(input) {
  exactKeys(input, ['seal', 'currentness', 'candidateProjection', 'dataset', 'supportSiteModel'], 'support-capability overlay input');
  const seal = assertEngineeringInputSeal(input.seal);
  const currentness = assertEngineeringInputSealCurrentness(input.currentness);
  const candidate = assertEnrichmentSupportCapabilityProjection(input.candidateProjection);
  const dataset = requireDataset(input.dataset);
  const supportSiteModel = requireSupportSiteModel(input.supportSiteModel, dataset.datasetId);
  const blockers = baseOverlayBlockers({
    seal, currentness, candidate, dataset,
    label: 'support-capability', codePrefix: 'ENRICHMENT_PRODUCTION_SUPPORT_CAPABILITY',
  });
  if (semanticHash(supportSiteModel) !== candidate.supportSiteModelSemanticHash) {
    blockers.push(issue(
      'ENRICHMENT_PRODUCTION_SUPPORT_CAPABILITY_SITE_MODEL_MISMATCH',
      'Active support-site model differs from the sealed support-capability projection.',
    ));
  }
  if (candidate.summary.status !== 'READY_FOR_STRUCTURAL_IMPACT' || candidate.summary.blockedCount !== 0) {
    blockers.push(issue(
      'ENRICHMENT_PRODUCTION_SUPPORT_CAPABILITY_CANDIDATE_BLOCKED',
      'All support-capability rows must be binary, attached and blocker-free before production activation.',
    ));
  }

  const typeMap = new Map();
  const bindings = [];
  for (const row of candidate.rows) {
    if (row.disposition !== 'SHADOW_CANDIDATE_VALUE'
        || row.fieldFamily !== 'SUPPORT_CAPABILITY'
        || row.targetKind !== 'SUPPORT'
        || typeof row.verticalEnabled !== 'boolean'
        || row.solverEligible !== true
        || !['RESTRAINED', 'FREE'].includes(row.verticalState)) {
      blockers.push(issue(
        'ENRICHMENT_PRODUCTION_SUPPORT_CAPABILITY_ROW_UNQUALIFIED',
        'Production V2/V3 gravity accepts only attached binary RESTRAINED/FREE vertical capability rows.',
        { proposalId: row.proposalId },
      ));
      continue;
    }
    const current = typeMap.get(row.sourceType);
    if (current !== undefined && current !== row.verticalEnabled) {
      blockers.push(issue(
        'ENRICHMENT_PRODUCTION_SUPPORT_CAPABILITY_TYPE_CONFLICT',
        'One support sourceType resolves to conflicting vertical capabilities.',
        { sourceType: row.sourceType },
      ));
      continue;
    }
    typeMap.set(row.sourceType, row.verticalEnabled);
    bindings.push(deepFreeze({
      proposalId: row.proposalId,
      proposalHash: row.proposalHash,
      supportKey: row.supportKey,
      sourceEntityId: row.sourceEntityId,
      sourceType: row.sourceType,
      verticalEnabled: row.verticalEnabled,
      verticalState: row.verticalState,
      verticalBasis: row.verticalBasis,
      attachmentId: row.attachmentId,
      attachedComponentKey: row.attachedComponentKey,
      nonGravityEvidenceHash: row.nonGravityEvidenceHash,
    }));
  }
  bindings.sort((left, right) => ascii(left.proposalId, right.proposalId));
  const deduped = dedupeIssues(blockers);
  const ready = deduped.length === 0 && bindings.length === candidate.rows.length && bindings.length > 0;
  const supportTypeCapabilities = ready
    ? Object.fromEntries([...typeMap.entries()].sort(([left], [right]) => ascii(left, right))
      .map(([sourceType, vertical]) => [sourceType, { vertical }]))
    : {};
  const material = {
    schema: ENRICHMENT_PRODUCTION_SUPPORT_CAPABILITY_OVERLAY_SCHEMA,
    sealId: seal.sealId,
    sealHash: seal.sealHash,
    currentnessHash: currentness.currentnessHash,
    observedAuthorityHash: currentness.observedAuthorityHash,
    candidateProjectionHash: candidate.projectionHash,
    supportAttachmentModelSemanticHash: candidate.supportAttachmentModelSemanticHash,
    restraintCapabilityModelSemanticHash: candidate.restraintCapabilityModelSemanticHash,
    supportSiteModelSemanticHash: candidate.supportSiteModelSemanticHash,
    sourceDatasetHash: seal.sourceDatasetHash,
    sourceSharedModelHash: seal.sourceSharedModelHash,
    sourceStructuralHash: seal.sourceStructuralHash,
    activatedFieldFamilies: ['SUPPORT_CAPABILITIES'],
    status: ready ? 'READY_FOR_PRODUCTION_CONSUMPTION' : 'BLOCKED',
    bindings,
    supportTypeCapabilities,
    blockers: deduped,
    summary: {
      candidateCount: candidate.rows.length,
      qualifiedBindingCount: bindings.length,
      supportTypeCount: ready ? Object.keys(supportTypeCapabilities).length : 0,
      blockedCount: deduped.length,
    },
    policy: {
      supportCapabilitiesActivated: true,
      supportAvailabilityScenariosActivated: false,
      gapMechanicsActivated: false,
      springMechanicsActivated: false,
      frictionMechanicsActivated: false,
      liftOffActivated: false,
      partialProductionOverlayPermitted: false,
      automaticCalculationTriggered: false,
    },
    sourceDatasetMutated: false,
    calculationExecutionPerformed: false,
  };
  return assertEnrichmentProductionSupportCapabilityOverlay(deepFreeze({
    ...material,
    overlayHash: semanticHash(material),
  }));
}

export function assertEnrichmentProductionSupportCapabilityOverlay(value) {
  exactKeys(value, [
    'schema', 'sealId', 'sealHash', 'currentnessHash', 'observedAuthorityHash',
    'candidateProjectionHash', 'supportAttachmentModelSemanticHash',
    'restraintCapabilityModelSemanticHash', 'supportSiteModelSemanticHash',
    'sourceDatasetHash', 'sourceSharedModelHash', 'sourceStructuralHash',
    'activatedFieldFamilies', 'status', 'bindings', 'supportTypeCapabilities',
    'blockers', 'summary', 'policy', 'sourceDatasetMutated',
    'calculationExecutionPerformed', 'overlayHash',
  ], 'production support-capability overlay');
  if (value.schema !== ENRICHMENT_PRODUCTION_SUPPORT_CAPABILITY_OVERLAY_SCHEMA) {
    fail('ENRICHMENT_PRODUCTION_SUPPORT_CAPABILITY_SCHEMA_INVALID', 'Unexpected production support-capability overlay schema.');
  }
  for (const key of [
    'sealId', 'sealHash', 'currentnessHash', 'observedAuthorityHash',
    'candidateProjectionHash', 'supportAttachmentModelSemanticHash',
    'restraintCapabilityModelSemanticHash', 'supportSiteModelSemanticHash',
    'sourceDatasetHash', 'sourceSharedModelHash', 'sourceStructuralHash', 'overlayHash',
  ]) requiredText(value[key], key);
  if (JSON.stringify(value.activatedFieldFamilies) !== JSON.stringify(['SUPPORT_CAPABILITIES'])) {
    fail('ENRICHMENT_PRODUCTION_SUPPORT_CAPABILITY_FIELD_FAMILY_INVALID', 'Support overlay may activate only SUPPORT_CAPABILITIES.');
  }
  if (!['READY_FOR_PRODUCTION_CONSUMPTION', 'BLOCKED'].includes(value.status)
      || !Array.isArray(value.bindings) || !Array.isArray(value.blockers)) {
    fail('ENRICHMENT_PRODUCTION_SUPPORT_CAPABILITY_OVERLAY_INVALID', 'Support-capability overlay structure is invalid.');
  }
  const proposalIds = value.bindings.map((row) => row?.proposalId);
  if (!strictlySortedUnique(proposalIds)) {
    fail('ENRICHMENT_PRODUCTION_SUPPORT_CAPABILITY_BINDING_ORDER_INVALID', 'Support-capability bindings must be unique and proposalId-sorted.');
  }
  value.bindings.forEach((row) => {
    requiredText(row.proposalId, 'binding.proposalId');
    hashText(row.proposalHash, 'binding.proposalHash');
    requiredText(row.supportKey, 'binding.supportKey');
    requiredText(row.sourceEntityId, 'binding.sourceEntityId');
    requiredText(row.sourceType, 'binding.sourceType');
    if (typeof row.verticalEnabled !== 'boolean') fail('ENRICHMENT_PRODUCTION_SUPPORT_CAPABILITY_BINDING_INVALID', 'verticalEnabled must be Boolean.');
    if (!['RESTRAINED', 'FREE'].includes(row.verticalState)) fail('ENRICHMENT_PRODUCTION_SUPPORT_CAPABILITY_BINDING_INVALID', 'verticalState must be RESTRAINED or FREE.');
    requiredText(row.verticalBasis, 'binding.verticalBasis');
    requiredText(row.attachmentId, 'binding.attachmentId');
    requiredText(row.attachedComponentKey, 'binding.attachedComponentKey');
    hashText(row.nonGravityEvidenceHash, 'binding.nonGravityEvidenceHash');
  });
  validateCapabilityMap(value.supportTypeCapabilities);
  if (value.status === 'READY_FOR_PRODUCTION_CONSUMPTION') {
    if (value.blockers.length || value.bindings.length === 0 || Object.keys(value.supportTypeCapabilities).length === 0) {
      fail('ENRICHMENT_PRODUCTION_SUPPORT_CAPABILITY_READY_STATE_INVALID', 'READY support overlay must be complete and blocker-free.');
    }
  } else if (Object.keys(value.supportTypeCapabilities).length !== 0) {
    fail('ENRICHMENT_PRODUCTION_SUPPORT_CAPABILITY_FAIL_CLOSED_INVALID', 'BLOCKED support overlay must publish no capability map.');
  }
  if (value.policy?.supportCapabilitiesActivated !== true
      || value.policy?.supportAvailabilityScenariosActivated !== false
      || value.policy?.gapMechanicsActivated !== false
      || value.policy?.springMechanicsActivated !== false
      || value.policy?.frictionMechanicsActivated !== false
      || value.policy?.liftOffActivated !== false
      || value.policy?.partialProductionOverlayPermitted !== false
      || value.policy?.automaticCalculationTriggered !== false
      || value.sourceDatasetMutated !== false
      || value.calculationExecutionPerformed !== false) {
    fail('ENRICHMENT_PRODUCTION_SUPPORT_CAPABILITY_BOUNDARY_INVALID', 'Support capability overlay crossed the Package 5F gravity-only boundary.');
  }
  const expectedSummary = {
    candidateCount: value.summary?.candidateCount,
    qualifiedBindingCount: value.bindings.length,
    supportTypeCount: value.status === 'READY_FOR_PRODUCTION_CONSUMPTION'
      ? Object.keys(value.supportTypeCapabilities).length : 0,
    blockedCount: value.blockers.length,
  };
  if (!Number.isInteger(expectedSummary.candidateCount) || expectedSummary.candidateCount < 0
      || semanticHash(value.summary) !== semanticHash(expectedSummary)) {
    fail('ENRICHMENT_PRODUCTION_SUPPORT_CAPABILITY_SUMMARY_INVALID', 'Support-capability overlay summary is stale.');
  }
  const { overlayHash, ...material } = value;
  if (overlayHash !== semanticHash(material)) {
    fail('ENRICHMENT_PRODUCTION_SUPPORT_CAPABILITY_HASH_MISMATCH', 'Support-capability overlay hash mismatch.');
  }
  return value;
}

function materialSelectionRow({ record, materialResolutionHash, sourceSharedModelHash }) {
  const lineKey = requiredText(record.lineKey, 'material resolution lineKey');
  const code = findField(record, 'material.code');
  const density = findField(record, 'material.densityKgM3');
  const blockers = [];
  if (record.sourceModelHash !== sourceSharedModelHash) blockers.push(issue('MATERIAL_SELECTION_SHARED_MODEL_MISMATCH', 'Material resolution target belongs to a different shared model.'));
  exactApprovedField(code, 'MATERIAL_CODE', blockers);
  exactApprovedField(density, 'MATERIAL_DENSITY', blockers);
  const referenceCode = typeof code?.value === 'string' && code.value.trim() ? canonicalCode(code.value) : null;
  const densityKgPerM3 = positive(density?.value) ? density.value : null;
  if (!referenceCode) blockers.push(issue('MATERIAL_CODE_INVALID', 'Exact material code must be a non-empty string.'));
  if (!positive(densityKgPerM3)) blockers.push(issue('MATERIAL_DENSITY_INVALID', 'Exact material density must be positive.'));
  if (code && density && !sameSource(code, density)) blockers.push(issue('MATERIAL_SELECTION_SOURCE_CONFLICT', 'Material code and density must come from the same MATERIAL_REGISTER source snapshot.'));
  if (code?.sourceKind !== 'MATERIAL_REGISTER' || density?.sourceKind !== 'MATERIAL_REGISTER') {
    blockers.push(issue('MATERIAL_SELECTION_SOURCE_KIND_INVALID', 'Material selection requires MATERIAL_REGISTER provenance.'));
  }
  const sourceEvidence = deepFreeze({
    sourceKind: code?.sourceKind ?? density?.sourceKind ?? 'NONE',
    sourceKey: code?.sourceKey ?? density?.sourceKey ?? null,
    sourceHash: code?.sourceHash ?? density?.sourceHash ?? null,
    codeLocator: code?.locator ?? null,
    densityLocator: density?.locator ?? null,
  });
  const hashMaterial = {
    materialResolutionHash,
    targetKind: 'LINE',
    targetId: lineKey,
    fieldFamily: 'MATERIAL_SELECTION',
    referenceCode,
    densityKgPerM3,
    unit: 'kg/m3',
    sourceEvidence,
  };
  return deepFreeze({
    proposalId: `MATERIAL_SELECTION:${encodeURIComponent(lineKey)}`,
    proposalHash: semanticHash(hashMaterial),
    targetKind: 'LINE',
    targetId: lineKey,
    fieldFamily: 'MATERIAL_SELECTION',
    referenceCode,
    densityKgPerM3,
    unit: 'kg/m3',
    sourceEvidence,
    authorityLevel: 'AUTHORIZED_MASTER_CANDIDATE',
    disposition: blockers.length ? 'BLOCKED' : 'SHADOW_CANDIDATE_VALUE',
    blockers: dedupeIssues(blockers),
  });
}

function supportCapabilityRow({ restraint, support, memberBySourceEntityId }) {
  const blockers = [];
  if (!support) blockers.push(issue('SUPPORT_PROJECTION_RECORD_MISSING', 'Restraint supportKey is absent from the support projection.'));
  const sourceEntityId = stringValue(support?.sourceEntityId);
  if (!sourceEntityId) blockers.push(issue('SUPPORT_SOURCE_ENTITY_ID_MISSING', 'Support sourceEntityId is required for active support-site binding.'));
  const members = sourceEntityId ? (memberBySourceEntityId.get(sourceEntityId) || []) : [];
  if (members.length !== 1) blockers.push(issue(
    members.length === 0 ? 'SUPPORT_SITE_MEMBER_MISSING' : 'SUPPORT_SITE_MEMBER_AMBIGUOUS',
    'Each core support authority must bind exactly one active support-site member.',
    { sourceEntityId, count: members.length },
  ));
  const sourceType = canonicalType(members[0]?.sourceType || support?.sourceType);
  if (!sourceType) blockers.push(issue('SUPPORT_SOURCE_TYPE_MISSING', 'Active support sourceType is required.'));
  if (restraint.solverEligible !== true) blockers.push(issue('SUPPORT_RESTRAINT_NOT_SOLVER_ELIGIBLE', 'Support restraint is not attached/solver-eligible.'));
  if ([RESTRAINT_QUALIFICATIONS.BLOCKED, RESTRAINT_QUALIFICATIONS.CONFLICTED, RESTRAINT_QUALIFICATIONS.UNRESOLVED].includes(restraint.qualification)) {
    blockers.push(issue('SUPPORT_RESTRAINT_QUALIFICATION_BLOCKED', 'Support restraint qualification is not sufficient for production gravity capability.', { qualification: restraint.qualification }));
  }
  const verticalState = restraint.vertical?.state || 'UNKNOWN';
  const verticalBasis = restraint.vertical?.basis || 'UNRESOLVED';
  let verticalEnabled = null;
  if (verticalState === RESTRAINT_STATES.RESTRAINED) verticalEnabled = true;
  else if (verticalState === RESTRAINT_STATES.FREE) verticalEnabled = false;
  else blockers.push(issue(
    `SUPPORT_VERTICAL_${String(verticalState).replace(/[^A-Z0-9]+/giu, '_').toUpperCase()}_UNSUPPORTED`,
    'V2/V3 gravity cannot coerce nonlinear or unresolved vertical contact state into a Boolean capability.',
    { verticalState },
  ));
  const nonGravityEvidenceHash = semanticHash({
    supportKey: restraint.supportKey,
    gapEvidence: restraint.gapEvidence,
    stiffnessEvidence: restraint.stiffnessEvidence,
    springRateEvidence: restraint.springRateEvidence,
    frictionEvidence: restraint.frictionEvidence,
  });
  const material = {
    targetKind: 'SUPPORT',
    targetId: sourceEntityId || restraint.supportKey,
    fieldFamily: 'SUPPORT_CAPABILITY',
    supportKey: restraint.supportKey,
    sourceEntityId: sourceEntityId || '',
    sourceType: sourceType || '',
    attachmentId: restraint.attachmentId || '',
    attachedComponentKey: restraint.attachedComponentKey || '',
    qualification: restraint.qualification,
    solverEligible: restraint.solverEligible === true,
    verticalState,
    verticalBasis,
    verticalEnabled,
    nonGravityEvidenceHash,
  };
  return {
    proposalId: `SUPPORT_CAPABILITY:${encodeURIComponent(restraint.supportKey)}`,
    proposalHash: semanticHash(material),
    ...material,
    authorityLevel: 'SOURCE_CLASSIFIED_SUPPORT_CANDIDATE',
    disposition: blockers.length ? 'BLOCKED' : 'SHADOW_CANDIDATE_VALUE',
    blockers: dedupeIssues(blockers),
  };
}

function addTypeConflicts(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    if (!row.sourceType || typeof row.verticalEnabled !== 'boolean') return;
    const values = groups.get(row.sourceType) || new Set();
    values.add(row.verticalEnabled);
    groups.set(row.sourceType, values);
  });
  rows.forEach((row) => {
    if (!row.sourceType || (groups.get(row.sourceType)?.size || 0) <= 1) return;
    row.blockers = dedupeIssues([...row.blockers, issue(
      'SUPPORT_TYPE_VERTICAL_CAPABILITY_CONFLICT',
      'Supports sharing one sourceType resolve to different vertical capabilities; type-level projection would be unsafe.',
      { sourceType: row.sourceType },
    )]);
    row.disposition = 'BLOCKED';
  });
}

function buildLineAuthorityOverlay({ input, label, projectionAssert, schema, activatedFieldFamily, authorityProperty, resolutionProperty, readyCodePrefix }) {
  exactKeys(input, ['seal', 'currentness', 'candidateProjection', 'dataset'], `${label} overlay input`);
  const seal = assertEngineeringInputSeal(input.seal);
  const currentness = assertEngineeringInputSealCurrentness(input.currentness);
  const candidate = projectionAssert(input.candidateProjection);
  const dataset = requireDataset(input.dataset);
  const blockers = baseOverlayBlockers({ seal, currentness, candidate, dataset, label, codePrefix: readyCodePrefix });
  if (candidate.summary.status !== 'READY_FOR_STRUCTURAL_IMPACT' || candidate.summary.blockedCount !== 0) {
    blockers.push(issue(`${readyCodePrefix}_CANDIDATE_BLOCKED`, `All ${label} rows must be exact and blocker-free before production activation.`));
  }
  const activeLines = new Set(dataset.entities.filter((row) => stringValue(row?.entityType) === 'PIPE')
    .map((row) => stringValue(row.lineKey)).filter(Boolean));
  const bindings = [];
  const authority = new Map();
  const seen = new Set();
  for (const row of candidate.rows) {
    if (row.disposition !== 'SHADOW_CANDIDATE_VALUE' || row.targetKind !== 'LINE'
        || row.fieldFamily !== activatedFieldFamily || !row.referenceCode || !positive(row.densityKgPerM3)) {
      blockers.push(issue(`${readyCodePrefix}_ROW_UNQUALIFIED`, `Production ${label} accepts only exact LINE authority rows.`, { proposalId: row.proposalId }));
      continue;
    }
    const lineKey = stringValue(row.targetId);
    if (!lineKey || !activeLines.has(lineKey)) {
      blockers.push(issue(`${readyCodePrefix}_LINE_MISSING`, `${label} target is not an active PIPE lineKey.`, { targetId: row.targetId }));
      continue;
    }
    if (seen.has(lineKey)) {
      blockers.push(issue(`${readyCodePrefix}_LINE_DUPLICATE`, `A production line may have only one ${label} authority row.`, { lineKey }));
      continue;
    }
    seen.add(lineKey);
    const record = deepFreeze({ referenceCode: canonicalCode(row.referenceCode), densityKgPerM3: row.densityKgPerM3, unit: 'kg/m3' });
    authority.set(lineKey, record);
    bindings.push(deepFreeze({ proposalId: row.proposalId, proposalHash: row.proposalHash, lineKey, ...record }));
  }
  bindings.sort((left, right) => ascii(left.lineKey, right.lineKey));
  const deduped = dedupeIssues(blockers);
  const ready = deduped.length === 0 && bindings.length === candidate.rows.length && bindings.length > 0;
  const authorityObject = ready ? Object.fromEntries([...authority.entries()].sort(([a], [b]) => ascii(a, b))) : {};
  const material = {
    schema,
    sealId: seal.sealId,
    sealHash: seal.sealHash,
    currentnessHash: currentness.currentnessHash,
    observedAuthorityHash: currentness.observedAuthorityHash,
    candidateProjectionHash: candidate.projectionHash,
    [resolutionProperty]: candidate[resolutionProperty],
    sourceDatasetHash: seal.sourceDatasetHash,
    sourceSharedModelHash: seal.sourceSharedModelHash,
    sourceStructuralHash: seal.sourceStructuralHash,
    activatedFieldFamilies: [activatedFieldFamily],
    status: ready ? 'READY_FOR_PRODUCTION_CONSUMPTION' : 'BLOCKED',
    bindings,
    [authorityProperty]: authorityObject,
    blockers: deduped,
    summary: {
      candidateCount: candidate.rows.length,
      qualifiedBindingCount: bindings.length,
      productionLineKeyCount: ready ? Object.keys(authorityObject).length : 0,
      blockedCount: deduped.length,
    },
    policy: {
      materialSelectionActivated: activatedFieldFamily === 'MATERIAL_SELECTION',
      supportCapabilitiesActivated: false,
      supportAvailabilityScenariosActivated: false,
      partialProductionOverlayPermitted: false,
      automaticCalculationTriggered: false,
    },
    sourceDatasetMutated: false,
    calculationExecutionPerformed: false,
  };
  return assertLineAuthorityOverlay({
    value: deepFreeze({ ...material, overlayHash: semanticHash(material) }),
    schema, activatedFieldFamily, authorityProperty, resolutionProperty, codePrefix: readyCodePrefix,
  });
}

function assertLineAuthorityOverlay({ value, schema, activatedFieldFamily, authorityProperty, resolutionProperty, codePrefix }) {
  exactKeys(value, [
    'schema', 'sealId', 'sealHash', 'currentnessHash', 'observedAuthorityHash',
    'candidateProjectionHash', resolutionProperty, 'sourceDatasetHash', 'sourceSharedModelHash',
    'sourceStructuralHash', 'activatedFieldFamilies', 'status', 'bindings', authorityProperty,
    'blockers', 'summary', 'policy', 'sourceDatasetMutated', 'calculationExecutionPerformed', 'overlayHash',
  ], 'production line authority overlay');
  if (value.schema !== schema) fail(`${codePrefix}_SCHEMA_INVALID`, 'Unexpected production line-authority overlay schema.');
  for (const key of ['sealId', 'sealHash', 'currentnessHash', 'observedAuthorityHash', 'candidateProjectionHash', resolutionProperty, 'sourceDatasetHash', 'sourceSharedModelHash', 'sourceStructuralHash', 'overlayHash']) requiredText(value[key], key);
  if (JSON.stringify(value.activatedFieldFamilies) !== JSON.stringify([activatedFieldFamily])) fail(`${codePrefix}_FIELD_FAMILY_INVALID`, 'Unexpected activated field family.');
  if (!['READY_FOR_PRODUCTION_CONSUMPTION', 'BLOCKED'].includes(value.status) || !Array.isArray(value.bindings) || !Array.isArray(value.blockers)) fail(`${codePrefix}_OVERLAY_INVALID`, 'Line authority overlay structure is invalid.');
  const lineKeys = value.bindings.map((row) => row?.lineKey);
  if (!strictlySortedUnique(lineKeys)) fail(`${codePrefix}_BINDING_ORDER_INVALID`, 'Bindings must be unique and lineKey-sorted.');
  value.bindings.forEach((row) => {
    requiredText(row.proposalId, 'binding.proposalId');
    hashText(row.proposalHash, 'binding.proposalHash');
    requiredText(row.lineKey, 'binding.lineKey');
    requiredText(row.referenceCode, 'binding.referenceCode');
    if (!positive(row.densityKgPerM3) || row.unit !== 'kg/m3') fail(`${codePrefix}_BINDING_INVALID`, 'Line authority binding requires positive kg/m3 density.');
  });
  validateLineAuthorityMap(value[authorityProperty], codePrefix);
  if (value.status === 'READY_FOR_PRODUCTION_CONSUMPTION') {
    if (value.blockers.length || value.bindings.length === 0 || Object.keys(value[authorityProperty]).length === 0) fail(`${codePrefix}_READY_STATE_INVALID`, 'READY line authority must be complete and blocker-free.');
  } else if (Object.keys(value[authorityProperty]).length !== 0) fail(`${codePrefix}_FAIL_CLOSED_INVALID`, 'BLOCKED line authority must publish no map.');
  if (value.policy?.materialSelectionActivated !== (activatedFieldFamily === 'MATERIAL_SELECTION')
      || value.policy?.supportCapabilitiesActivated !== false
      || value.policy?.supportAvailabilityScenariosActivated !== false
      || value.policy?.partialProductionOverlayPermitted !== false
      || value.policy?.automaticCalculationTriggered !== false
      || value.sourceDatasetMutated !== false
      || value.calculationExecutionPerformed !== false) fail(`${codePrefix}_BOUNDARY_INVALID`, 'Line authority overlay crossed its production boundary.');
  const expectedSummary = {
    candidateCount: value.summary?.candidateCount,
    qualifiedBindingCount: value.bindings.length,
    productionLineKeyCount: value.status === 'READY_FOR_PRODUCTION_CONSUMPTION' ? Object.keys(value[authorityProperty]).length : 0,
    blockedCount: value.blockers.length,
  };
  if (!Number.isInteger(expectedSummary.candidateCount) || expectedSummary.candidateCount < 0 || semanticHash(value.summary) !== semanticHash(expectedSummary)) fail(`${codePrefix}_SUMMARY_INVALID`, 'Line authority summary is stale.');
  const { overlayHash, ...material } = value;
  if (overlayHash !== semanticHash(material)) fail(`${codePrefix}_HASH_MISMATCH`, 'Line authority overlay hash mismatch.');
  return value;
}

function baseOverlayBlockers({ seal, currentness, candidate, dataset, label, codePrefix }) {
  const blockers = [];
  if (currentness.sealHash !== seal.sealHash || currentness.status !== 'CURRENT' || currentness.current !== true || currentness.requiresReseal !== false) blockers.push(issue(`${codePrefix}_SEAL_NOT_CURRENT`, `Production ${label} consumption requires a CURRENT seal evaluation.`));
  if (seal.candidateProjectionHash !== candidate.projectionHash) blockers.push(issue(`${codePrefix}_CANDIDATE_SEAL_MISMATCH`, `${label} candidate projection does not match the sealed candidate identity.`));
  if (seal.sourceDatasetHash !== candidate.sourceDatasetHash || seal.sourceSharedModelHash !== candidate.sourceSharedModelHash || seal.sourceStructuralHash !== candidate.sourceStructuralHash) blockers.push(issue(`${codePrefix}_SEAL_SOURCE_MISMATCH`, `Seal and ${label} projection source identities do not match.`));
  if (dataset.sourceSha256 !== seal.sourceDatasetHash || dataset.sharedModel.semanticHash !== seal.sourceSharedModelHash) blockers.push(issue(`${codePrefix}_ACTIVE_SOURCE_MISMATCH`, `Active dataset/shared-model identities differ from sealed ${label} authority.`));
  return blockers;
}

function validateMaterialRow(row, index, materialResolutionHash) {
  exactKeys(row, MATERIAL_ROW_KEYS, `material-selection row ${index}`);
  requiredText(row.proposalId, `rows[${index}].proposalId`);
  hashText(row.proposalHash, `rows[${index}].proposalHash`);
  if (row.targetKind !== 'LINE' || row.fieldFamily !== 'MATERIAL_SELECTION') fail('ENRICHMENT_MATERIAL_SELECTION_ROW_KIND_INVALID', 'Material selection must target LINE / MATERIAL_SELECTION.');
  requiredText(row.targetId, `rows[${index}].targetId`);
  if (row.referenceCode !== null) requiredText(row.referenceCode, `rows[${index}].referenceCode`);
  if (row.densityKgPerM3 !== null && !positive(row.densityKgPerM3)) fail('ENRICHMENT_MATERIAL_SELECTION_DENSITY_INVALID', 'Material density must be null or positive.');
  if (row.unit !== 'kg/m3') fail('ENRICHMENT_MATERIAL_SELECTION_UNIT_INVALID', 'Material selection unit must be kg/m3.');
  if (!Array.isArray(row.blockers)) fail('ENRICHMENT_MATERIAL_SELECTION_BLOCKERS_INVALID', 'Material selection blockers must be an array.');
  exactKeys(row.sourceEvidence, MATERIAL_SOURCE_KEYS, `material-selection source ${index}`);
  const expectedHash = semanticHash({
    materialResolutionHash,
    targetKind: row.targetKind, targetId: row.targetId, fieldFamily: row.fieldFamily,
    referenceCode: row.referenceCode, densityKgPerM3: row.densityKgPerM3, unit: row.unit,
    sourceEvidence: row.sourceEvidence,
  });
  if (row.proposalHash !== expectedHash) fail('ENRICHMENT_MATERIAL_SELECTION_PROPOSAL_HASH_MISMATCH', 'Material selection proposal hash mismatch.');
  if ((row.blockers.length === 0) !== (row.disposition === 'SHADOW_CANDIDATE_VALUE')) fail('ENRICHMENT_MATERIAL_SELECTION_DISPOSITION_INVALID', 'Material selection disposition must agree with blockers.');
  return row.proposalId;
}

function validateSupportRow(row, index) {
  exactKeys(row, SUPPORT_ROW_KEYS, `support-capability row ${index}`);
  requiredText(row.proposalId, `rows[${index}].proposalId`);
  hashText(row.proposalHash, `rows[${index}].proposalHash`);
  if (row.targetKind !== 'SUPPORT' || row.fieldFamily !== 'SUPPORT_CAPABILITY') fail('ENRICHMENT_SUPPORT_CAPABILITY_ROW_KIND_INVALID', 'Support capability must target SUPPORT / SUPPORT_CAPABILITY.');
  requiredText(row.supportKey, `rows[${index}].supportKey`);
  if (row.sourceEntityId) requiredText(row.sourceEntityId, `rows[${index}].sourceEntityId`);
  if (row.sourceType) requiredText(row.sourceType, `rows[${index}].sourceType`);
  if (row.attachmentId) requiredText(row.attachmentId, `rows[${index}].attachmentId`);
  if (row.attachedComponentKey) requiredText(row.attachedComponentKey, `rows[${index}].attachedComponentKey`);
  requiredText(row.qualification, `rows[${index}].qualification`);
  if (typeof row.solverEligible !== 'boolean') fail('ENRICHMENT_SUPPORT_CAPABILITY_SOLVER_ELIGIBLE_INVALID', 'solverEligible must be Boolean.');
  requiredText(row.verticalState, `rows[${index}].verticalState`);
  requiredText(row.verticalBasis, `rows[${index}].verticalBasis`);
  if (row.verticalEnabled !== null && typeof row.verticalEnabled !== 'boolean') fail('ENRICHMENT_SUPPORT_CAPABILITY_VERTICAL_INVALID', 'verticalEnabled must be Boolean or null.');
  hashText(row.nonGravityEvidenceHash, `rows[${index}].nonGravityEvidenceHash`);
  if (!Array.isArray(row.blockers)) fail('ENRICHMENT_SUPPORT_CAPABILITY_BLOCKERS_INVALID', 'Support blockers must be an array.');
  const expectedHash = semanticHash({
    targetKind: row.targetKind, targetId: row.targetId, fieldFamily: row.fieldFamily,
    supportKey: row.supportKey, sourceEntityId: row.sourceEntityId, sourceType: row.sourceType,
    attachmentId: row.attachmentId, attachedComponentKey: row.attachedComponentKey,
    qualification: row.qualification, solverEligible: row.solverEligible,
    verticalState: row.verticalState, verticalBasis: row.verticalBasis,
    verticalEnabled: row.verticalEnabled, nonGravityEvidenceHash: row.nonGravityEvidenceHash,
  });
  if (row.proposalHash !== expectedHash) fail('ENRICHMENT_SUPPORT_CAPABILITY_PROPOSAL_HASH_MISMATCH', 'Support capability proposal hash mismatch.');
  if ((row.blockers.length === 0) !== (row.disposition === 'SHADOW_CANDIDATE_VALUE')) fail('ENRICHMENT_SUPPORT_CAPABILITY_DISPOSITION_INVALID', 'Support capability disposition must agree with blockers.');
  return row.proposalId;
}

function projectionSummary(rows) {
  const blockedCount = rows.filter((row) => row.blockers.length > 0).length;
  return deepFreeze({
    proposalCount: rows.length,
    projectedCandidateCount: rows.length - blockedCount,
    blockedCount,
    dispositions: Object.fromEntries([...new Set(rows.map((row) => row.disposition))].sort(ascii)
      .map((disposition) => [disposition, rows.filter((row) => row.disposition === disposition).length])),
    status: rows.length > 0 && blockedCount === 0 ? 'READY_FOR_STRUCTURAL_IMPACT' : 'BLOCKED',
  });
}

function exactApprovedField(field, label, blockers) {
  if (!field) return blockers.push(issue(`${label}_FIELD_MISSING`, `${label} field is missing from exact material resolution.`));
  if (field.status !== 'RESOLVED_EXACT') blockers.push(issue(`${label}_NOT_EXACT`, `${label} field is not RESOLVED_EXACT.`, { status: field.status }));
  if (field.approved !== true) blockers.push(issue(`${label}_NOT_APPROVED`, `${label} field is not approved.`));
}

function findField(record, field) {
  return Array.isArray(record?.fields) ? record.fields.find((row) => row?.field === field) : null;
}

function sameSource(left, right) {
  return left.sourceKind === right.sourceKind && left.sourceKey === right.sourceKey && left.sourceHash === right.sourceHash;
}

function supportSiteMemberIndex(model) {
  const map = new Map();
  for (const site of model.sites) for (const assembly of site.assemblies || []) for (const member of assembly.members || []) {
    const key = stringValue(member.sourceEntityId);
    if (!key) continue;
    const rows = map.get(key) || [];
    rows.push(member);
    map.set(key, rows);
  }
  return map;
}

function requireSupportSiteModel(value, datasetId) {
  if (!value || value.schema !== 'support-site-model/v1' || !Array.isArray(value.sites)) {
    fail('ENRICHMENT_SUPPORT_SITE_MODEL_INVALID', 'Expected support-site-model/v1.');
  }
  if (value.datasetId && value.datasetId !== datasetId) {
    fail('ENRICHMENT_SUPPORT_SITE_MODEL_DATASET_MISMATCH', 'Support-site model belongs to a different dataset.');
  }
  return value;
}

function requireDataset(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !requiredText(value.datasetId, 'dataset.datasetId')
      || !requiredText(value.sourceSha256, 'dataset.sourceSha256') || !value.sharedModel
      || !hashText(value.sharedModel.semanticHash, 'dataset.sharedModel.semanticHash') || !Array.isArray(value.entities)) {
    fail('ENRICHMENT_PACKAGE5F_DATASET_INVALID', 'Package 5F requires an active workspace dataset with shared model.');
  }
  return value;
}

function validateLineAuthorityMap(value, codePrefix) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${codePrefix}_AUTHORITY_MAP_INVALID`, 'Line authority map must be an object.');
  for (const [lineKey, row] of Object.entries(value)) {
    requiredText(lineKey, 'lineAuthority.lineKey');
    exactKeys(row, ['referenceCode', 'densityKgPerM3', 'unit'], `lineAuthority.${lineKey}`);
    requiredText(row.referenceCode, `lineAuthority.${lineKey}.referenceCode`);
    if (!positive(row.densityKgPerM3) || row.unit !== 'kg/m3') fail(`${codePrefix}_AUTHORITY_MAP_INVALID`, 'Line authority requires positive kg/m3 density.');
  }
}

function validateCapabilityMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('ENRICHMENT_PRODUCTION_SUPPORT_CAPABILITY_MAP_INVALID', 'supportTypeCapabilities must be an object.');
  for (const [type, capability] of Object.entries(value)) {
    requiredText(type, 'supportTypeCapabilities.type');
    exactKeys(capability, ['vertical'], `supportTypeCapabilities.${type}`);
    if (typeof capability.vertical !== 'boolean') fail('ENRICHMENT_PRODUCTION_SUPPORT_CAPABILITY_MAP_INVALID', 'supportTypeCapabilities vertical must be Boolean.');
  }
}

function canonicalCode(value) { return requiredText(value, 'referenceCode').trim().toUpperCase(); }
function canonicalType(value) { return stringValue(value).trim(); }
function positive(value) { return Number.isFinite(value) && value > 0; }
function byProposal(left, right) { return ascii(left.proposalId, right.proposalId); }
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function strictlySortedUnique(values) { return values.every((value, index) => index === 0 || ascii(values[index - 1], value) < 0); }
function hashText(value, label) { if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) fail('ENRICHMENT_PACKAGE5F_HASH_INVALID', `${label} must be an FNV-1a semantic hash.`); return value; }
function requiredText(value, label) { if (typeof value !== 'string' || !value.trim()) fail('ENRICHMENT_PACKAGE5F_TEXT_INVALID', `${label} must be a non-empty string.`); return value; }
function exactKeys(value, keys, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('ENRICHMENT_PACKAGE5F_TYPE_INVALID', `${label} must be an object.`); const actual = Object.keys(value).sort(ascii); const expected = [...keys].sort(ascii); if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('ENRICHMENT_PACKAGE5F_KEYS_INVALID', `${label} contains unexpected or missing keys.`, { actual, expected }); }
function issue(code, message, details = null) { return deepFreeze({ code, message, details }); }
function dedupeIssues(rows) { const map = new Map(); for (const row of rows) map.set(`${row.code}|${JSON.stringify(row.details)}`, row); return [...map.values()].sort((a, b) => ascii(`${a.code}|${JSON.stringify(a.details)}`, `${b.code}|${JSON.stringify(b.details)}`)); }
function fail(code, message, details = null) { const error = new Error(message); error.code = code; error.details = details; throw error; }
