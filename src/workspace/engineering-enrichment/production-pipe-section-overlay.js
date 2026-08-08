import { requireCommonEnrichedPipingClassResolution } from '../../core/common-enriched-properties/piping-class-resolution.js';
import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import { stringValue } from '../dataset-utils.js';
import {
  assertEngineeringInputSeal,
  assertEngineeringInputSealCurrentness,
} from './input-seal.js';

export const ENRICHMENT_PIPE_SECTION_PROJECTION_SCHEMA =
  'EngineeringEnrichmentPipeSectionProjection.v1';
export const ENRICHMENT_PRODUCTION_PIPE_SECTION_OVERLAY_SCHEMA =
  'EngineeringEnrichmentProductionPipeSectionOverlay.v1';

const SECTION_FIELDS = Object.freeze([
  'section.insulationCode',
  'section.insulationThicknessMm',
  'section.materialCode',
  'section.outsideDiameterMm',
  'section.wallThicknessMm',
]);
const PROJECTION_KEYS = Object.freeze([
  'schema', 'sourceDatasetHash', 'sourceSharedModelHash', 'sourceStructuralHash',
  'pipingClassResolutionHash', 'rows', 'summary', 'projectionHash',
]);
const PROJECTION_ROW_KEYS = Object.freeze([
  'proposalId', 'proposalHash', 'targetKind', 'targetId', 'fieldFamily',
  'proposedSection', 'authorityLevel', 'disposition', 'blockers',
  'bindingCreated', 'sourceEvidence',
]);
const SECTION_KEYS = Object.freeze([
  'outsideDiameterMm', 'wallThicknessMm', 'materialCode',
  'insulationCode', 'insulationThicknessMm',
]);
const SOURCE_EVIDENCE_KEYS = Object.freeze([
  'sourceKind', 'sourceKey', 'sourceHash', 'locators',
]);

/**
 * Package 5D projects one complete line pipe-section tuple from the already
 * qualified exact PIPING_CLASS resolver. The tuple is atomic: production never
 * mixes sealed dimensions with baseline dimensions on the same line.
 *
 * materialCode and insulationCode are retained in the tuple as source-backed
 * identity guards. Authorized execution is responsible for proving those codes
 * have not changed relative to the previously authorized material/insulation
 * selection. Package 5D cuts over dimensions only.
 */
export function buildEnrichmentPipeSectionProjection(input) {
  exactKeys(
    input,
    ['pipingClassResolution', 'dataset', 'sourceStructuralHash'],
    'pipe-section projection input',
  );
  const resolution = requireCommonEnrichedPipingClassResolution(input.pipingClassResolution);
  const dataset = requireDataset(input.dataset);
  const sourceStructuralHash = semanticHashText(
    input.sourceStructuralHash,
    'sourceStructuralHash',
  );
  const rows = resolution.targetRecords.map((record) => projectSectionRow({
    record,
    pipingClassResolutionHash: resolution.semanticHash,
    sourceSharedModelHash: dataset.sharedModel.semanticHash,
  })).sort((left, right) => ascii(left.proposalId, right.proposalId));
  const summary = projectionSummary(rows);
  const material = {
    schema: ENRICHMENT_PIPE_SECTION_PROJECTION_SCHEMA,
    sourceDatasetHash: dataset.sourceSha256,
    sourceSharedModelHash: dataset.sharedModel.semanticHash,
    sourceStructuralHash,
    pipingClassResolutionHash: resolution.semanticHash,
    rows,
    summary,
  };
  return assertEnrichmentPipeSectionProjection(deepFreeze({
    ...material,
    projectionHash: semanticHash(material),
  }));
}

export function assertEnrichmentPipeSectionProjection(value) {
  exactKeys(value, PROJECTION_KEYS, 'pipe-section projection');
  if (value.schema !== ENRICHMENT_PIPE_SECTION_PROJECTION_SCHEMA) {
    fail('ENRICHMENT_PIPE_SECTION_PROJECTION_SCHEMA_INVALID', 'Unexpected pipe-section projection schema.');
  }
  requiredText(value.sourceDatasetHash, 'sourceDatasetHash');
  semanticHashText(value.sourceSharedModelHash, 'sourceSharedModelHash');
  semanticHashText(value.sourceStructuralHash, 'sourceStructuralHash');
  semanticHashText(value.pipingClassResolutionHash, 'pipingClassResolutionHash');
  semanticHashText(value.projectionHash, 'projectionHash');
  if (!Array.isArray(value.rows)) {
    fail('ENRICHMENT_PIPE_SECTION_PROJECTION_ROWS_INVALID', 'Pipe-section projection rows must be an array.');
  }
  const proposalIds = value.rows.map((row, index) => validateProjectionRow(
    row,
    index,
    value.pipingClassResolutionHash,
  ));
  if (!strictlySortedUnique(proposalIds)) {
    fail('ENRICHMENT_PIPE_SECTION_PROJECTION_ORDER_INVALID', 'Pipe-section projection rows must be proposalId-sorted and unique.');
  }
  if (semanticHash(value.summary) !== semanticHash(projectionSummary(value.rows))) {
    fail('ENRICHMENT_PIPE_SECTION_PROJECTION_SUMMARY_INVALID', 'Pipe-section projection summary is invalid.');
  }
  const { projectionHash, ...material } = value;
  if (projectionHash !== semanticHash(material)) {
    fail('ENRICHMENT_PIPE_SECTION_PROJECTION_HASH_MISMATCH', 'Pipe-section projection hash mismatch.');
  }
  return value;
}

export function buildEnrichmentProductionPipeSectionOverlay(input) {
  exactKeys(
    input,
    ['seal', 'currentness', 'candidateProjection', 'dataset'],
    'pipe-section overlay input',
  );
  const seal = assertEngineeringInputSeal(input.seal);
  const currentness = assertEngineeringInputSealCurrentness(input.currentness);
  const candidate = assertEnrichmentPipeSectionProjection(input.candidateProjection);
  const dataset = requireDataset(input.dataset);
  const blockers = [];

  if (currentness.sealHash !== seal.sealHash
      || currentness.status !== 'CURRENT'
      || currentness.current !== true
      || currentness.requiresReseal !== false) {
    blockers.push(issue(
      'ENRICHMENT_PRODUCTION_PIPE_SECTION_SEAL_NOT_CURRENT',
      'Production pipe-section consumption requires a CURRENT evaluation bound to the exact seal.',
    ));
  }
  if (seal.candidateProjectionHash !== candidate.projectionHash) {
    blockers.push(issue(
      'ENRICHMENT_PRODUCTION_PIPE_SECTION_CANDIDATE_SEAL_MISMATCH',
      'Pipe-section candidate projection does not match the sealed candidate projection identity.',
    ));
  }
  if (seal.sourceDatasetHash !== candidate.sourceDatasetHash
      || seal.sourceSharedModelHash !== candidate.sourceSharedModelHash
      || seal.sourceStructuralHash !== candidate.sourceStructuralHash) {
    blockers.push(issue(
      'ENRICHMENT_PRODUCTION_PIPE_SECTION_SEAL_SOURCE_MISMATCH',
      'Seal and pipe-section candidate projection source identities do not match.',
    ));
  }
  if (dataset.sourceSha256 !== seal.sourceDatasetHash
      || dataset.sharedModel.semanticHash !== seal.sourceSharedModelHash) {
    blockers.push(issue(
      'ENRICHMENT_PRODUCTION_PIPE_SECTION_ACTIVE_SOURCE_MISMATCH',
      'Active dataset/shared-model identities differ from the sealed pipe-section authority.',
    ));
  }
  if (candidate.summary?.status !== 'READY_FOR_STRUCTURAL_IMPACT'
      || candidate.summary?.blockedCount !== 0) {
    blockers.push(issue(
      'ENRICHMENT_PRODUCTION_PIPE_SECTION_CANDIDATE_BLOCKED',
      'All pipe-section candidate rows must be exact and blocker-free before production activation.',
    ));
  }

  const activePipeLineKeys = new Set(
    dataset.entities
      .filter((entity) => stringValue(entity?.entityType) === 'PIPE')
      .map((entity) => stringValue(entity?.lineKey))
      .filter(Boolean),
  );
  const bindings = [];
  const sections = new Map();
  const seenLineKeys = new Set();

  for (const row of candidate.rows) {
    if (row.disposition !== 'SHADOW_CANDIDATE_VALUE'
        || row.targetKind !== 'LINE'
        || row.fieldFamily !== 'PIPE_SECTION') {
      blockers.push(issue(
        'ENRICHMENT_PRODUCTION_PIPE_SECTION_ROW_UNQUALIFIED',
        'Package 5D accepts only exact LINE PIPE_SECTION candidates.',
        { proposalId: row.proposalId },
      ));
      continue;
    }
    const lineKey = stringValue(row.targetId);
    if (!lineKey || !activePipeLineKeys.has(lineKey)) {
      blockers.push(issue(
        'ENRICHMENT_PRODUCTION_PIPE_SECTION_LINE_MISSING',
        'Pipe-section candidate target is not an active PIPE lineKey.',
        { targetId: row.targetId, proposalId: row.proposalId },
      ));
      continue;
    }
    if (seenLineKeys.has(lineKey)) {
      blockers.push(issue(
        'ENRICHMENT_PRODUCTION_PIPE_SECTION_LINE_DUPLICATE',
        'A production pipe line may have only one exact sealed section candidate.',
        { targetId: lineKey, proposalId: row.proposalId },
      ));
      continue;
    }
    let section;
    try {
      section = requireSection(row.proposedSection, `candidate ${row.proposalId}`);
    } catch (error) {
      blockers.push(issue(
        'ENRICHMENT_PRODUCTION_PIPE_SECTION_GEOMETRY_INVALID',
        'Pipe-section geometry is not physically admissible for Package 5D.',
        { proposalId: row.proposalId, reason: error?.code ?? 'INVALID_SECTION' },
      ));
      continue;
    }
    seenLineKeys.add(lineKey);
    sections.set(lineKey, section);
    bindings.push(deepFreeze({
      proposalId: row.proposalId,
      proposalHash: row.proposalHash,
      targetId: row.targetId,
      lineKey,
      section,
    }));
  }

  bindings.sort((left, right) => ascii(left.lineKey, right.lineKey));
  const dedupedBlockers = dedupeIssues(blockers);
  const ready = dedupedBlockers.length === 0
    && bindings.length === candidate.rows.length
    && bindings.length > 0;
  const pipeSectionProperties = ready
    ? Object.fromEntries([...sections.entries()].sort(([left], [right]) => ascii(left, right)))
    : {};

  const material = {
    schema: ENRICHMENT_PRODUCTION_PIPE_SECTION_OVERLAY_SCHEMA,
    sealId: seal.sealId,
    sealHash: seal.sealHash,
    currentnessHash: currentness.currentnessHash,
    observedAuthorityHash: currentness.observedAuthorityHash,
    candidateProjectionHash: candidate.projectionHash,
    pipingClassResolutionHash: candidate.pipingClassResolutionHash,
    sourceDatasetHash: seal.sourceDatasetHash,
    sourceSharedModelHash: seal.sourceSharedModelHash,
    sourceStructuralHash: seal.sourceStructuralHash,
    activatedFieldFamilies: ['PIPE_SECTIONS'],
    status: ready ? 'READY_FOR_PRODUCTION_CONSUMPTION' : 'BLOCKED',
    bindings,
    pipeSectionProperties,
    blockers: dedupedBlockers,
    summary: {
      candidateCount: candidate.rows.length,
      qualifiedBindingCount: bindings.length,
      productionLineKeyCount: ready ? Object.keys(pipeSectionProperties).length : 0,
      blockedCount: dedupedBlockers.length,
    },
    policy: {
      componentWeightsActivated: false,
      operatingFluidDensitiesActivated: false,
      hydroFluidDensitiesActivated: false,
      materialDensitiesActivated: false,
      pipeSectionsActivated: true,
      insulationDensitiesActivated: false,
      supportCapabilitiesActivated: false,
      supportAvailabilityScenariosActivated: false,
      materialCodeChangePermitted: false,
      insulationCodeChangePermitted: false,
      partialProductionOverlayPermitted: false,
      automaticCalculationTriggered: false,
    },
    sourceDatasetMutated: false,
    calculationExecutionPerformed: false,
  };
  return assertEnrichmentProductionPipeSectionOverlay(deepFreeze({
    ...material,
    overlayHash: semanticHash(material),
  }));
}

export function assertEnrichmentProductionPipeSectionOverlay(value) {
  exactKeys(value, [
    'schema', 'sealId', 'sealHash', 'currentnessHash', 'observedAuthorityHash',
    'candidateProjectionHash', 'pipingClassResolutionHash', 'sourceDatasetHash',
    'sourceSharedModelHash', 'sourceStructuralHash', 'activatedFieldFamilies',
    'status', 'bindings', 'pipeSectionProperties', 'blockers', 'summary', 'policy',
    'sourceDatasetMutated', 'calculationExecutionPerformed', 'overlayHash',
  ], 'production pipe-section overlay');
  if (value.schema !== ENRICHMENT_PRODUCTION_PIPE_SECTION_OVERLAY_SCHEMA) {
    fail('ENRICHMENT_PRODUCTION_PIPE_SECTION_SCHEMA_INVALID', 'Unexpected production pipe-section overlay schema.');
  }
  for (const [field, item] of [
    ['sealId', value.sealId],
    ['sealHash', value.sealHash],
    ['currentnessHash', value.currentnessHash],
    ['observedAuthorityHash', value.observedAuthorityHash],
    ['candidateProjectionHash', value.candidateProjectionHash],
    ['pipingClassResolutionHash', value.pipingClassResolutionHash],
    ['sourceDatasetHash', value.sourceDatasetHash],
    ['sourceSharedModelHash', value.sourceSharedModelHash],
    ['sourceStructuralHash', value.sourceStructuralHash],
  ]) requiredText(item, field);
  if (JSON.stringify(value.activatedFieldFamilies) !== JSON.stringify(['PIPE_SECTIONS'])) {
    fail('ENRICHMENT_PRODUCTION_PIPE_SECTION_FIELD_FAMILY_INVALID', 'Package 5D pipe-section overlay may activate only PIPE_SECTIONS.');
  }
  if (!['READY_FOR_PRODUCTION_CONSUMPTION', 'BLOCKED'].includes(value.status)
      || !Array.isArray(value.bindings) || !Array.isArray(value.blockers)) {
    fail('ENRICHMENT_PRODUCTION_PIPE_SECTION_OVERLAY_INVALID', 'Production pipe-section overlay structure is invalid.');
  }
  const lineKeys = value.bindings.map((row) => row?.lineKey);
  if (!strictlySortedUnique(lineKeys)) {
    fail('ENRICHMENT_PRODUCTION_PIPE_SECTION_BINDING_ORDER_INVALID', 'Production pipe-section bindings must be unique and lineKey-sorted.');
  }
  value.bindings.forEach(validateBinding);
  validateSectionMap(value.pipeSectionProperties);
  if (value.status === 'READY_FOR_PRODUCTION_CONSUMPTION') {
    if (value.blockers.length !== 0 || value.bindings.length === 0
        || Object.keys(value.pipeSectionProperties).length === 0) {
      fail('ENRICHMENT_PRODUCTION_PIPE_SECTION_READY_STATE_INVALID', 'READY pipe-section overlay must be complete and blocker-free.');
    }
  } else if (Object.keys(value.pipeSectionProperties).length !== 0) {
    fail('ENRICHMENT_PRODUCTION_PIPE_SECTION_FAIL_CLOSED_INVALID', 'BLOCKED pipe-section overlay must publish no section map.');
  }
  if (value.policy?.componentWeightsActivated !== false
      || value.policy?.operatingFluidDensitiesActivated !== false
      || value.policy?.hydroFluidDensitiesActivated !== false
      || value.policy?.materialDensitiesActivated !== false
      || value.policy?.pipeSectionsActivated !== true
      || value.policy?.insulationDensitiesActivated !== false
      || value.policy?.supportCapabilitiesActivated !== false
      || value.policy?.supportAvailabilityScenariosActivated !== false
      || value.policy?.materialCodeChangePermitted !== false
      || value.policy?.insulationCodeChangePermitted !== false
      || value.policy?.partialProductionOverlayPermitted !== false
      || value.policy?.automaticCalculationTriggered !== false
      || value.sourceDatasetMutated !== false
      || value.calculationExecutionPerformed !== false) {
    fail('ENRICHMENT_PRODUCTION_PIPE_SECTION_BOUNDARY_INVALID', 'Package 5D pipe-section overlay must remain dimension-only, fail-closed and non-executing.');
  }
  const expectedSummary = {
    candidateCount: value.summary?.candidateCount,
    qualifiedBindingCount: value.bindings.length,
    productionLineKeyCount: value.status === 'READY_FOR_PRODUCTION_CONSUMPTION'
      ? Object.keys(value.pipeSectionProperties).length : 0,
    blockedCount: value.blockers.length,
  };
  if (!Number.isInteger(expectedSummary.candidateCount) || expectedSummary.candidateCount < 0
      || semanticHash(value.summary) !== semanticHash(expectedSummary)) {
    fail('ENRICHMENT_PRODUCTION_PIPE_SECTION_SUMMARY_INVALID', 'Production pipe-section summary is invalid.');
  }
  const { overlayHash, ...material } = value;
  if (overlayHash !== semanticHash(material)) {
    fail('ENRICHMENT_PRODUCTION_PIPE_SECTION_HASH_MISMATCH', 'Production pipe-section overlay hash mismatch.');
  }
  return value;
}

function projectSectionRow({ record, pipingClassResolutionHash, sourceSharedModelHash }) {
  const lineKey = requiredText(record.lineKey, 'piping-class resolution lineKey');
  const fields = new Map((record.fields || []).map((entry) => [entry.field, entry]));
  const blockers = [];
  if (record.sourceModelHash !== sourceSharedModelHash) {
    blockers.push({ code: 'PIPE_SECTION_RESOLUTION_SHARED_MODEL_MISMATCH' });
  }
  const expected = [
    ['section.outsideDiameterMm', 'mm', 'NUMBER'],
    ['section.wallThicknessMm', 'mm', 'NUMBER'],
    ['section.materialCode', null, 'STRING'],
    ['section.insulationCode', null, 'STRING'],
    ['section.insulationThicknessMm', 'mm', 'NUMBER'],
  ];
  const locators = {};
  const values = {};
  let commonEvidence = null;
  for (const [fieldName, unit, kind] of expected) {
    const field = fields.get(fieldName);
    if (!field) {
      blockers.push({ code: 'PIPE_SECTION_FIELD_MISSING', field: fieldName });
      continue;
    }
    if (field.status !== 'RESOLVED_EXACT') {
      blockers.push({ code: 'PIPE_SECTION_FIELD_NOT_EXACT', field: fieldName, status: field.status });
    }
    if (field.approved !== true) blockers.push({ code: 'PIPE_SECTION_FIELD_NOT_APPROVED', field: fieldName });
    if (field.unit !== unit) blockers.push({ code: 'PIPE_SECTION_FIELD_UNIT_INVALID', field: fieldName, unit: field.unit });
    if (!matchesKind(field.value, kind)) blockers.push({ code: 'PIPE_SECTION_FIELD_VALUE_INVALID', field: fieldName });
    if (field.sourceKind !== 'PIPING_CLASS' || !field.sourceKey || !field.sourceHash || !field.locator) {
      blockers.push({ code: 'PIPE_SECTION_SOURCE_EVIDENCE_INVALID', field: fieldName });
    } else {
      const identity = `${field.sourceKind}|${field.sourceKey}|${field.sourceHash}`;
      if (commonEvidence === null) commonEvidence = identity;
      else if (identity !== commonEvidence) blockers.push({ code: 'PIPE_SECTION_SOURCE_EVIDENCE_CONFLICT', field: fieldName });
      locators[sectionKey(fieldName)] = field.locator;
    }
    values[sectionKey(fieldName)] = field.value ?? null;
  }
  const proposedSection = normalizeProposedSection(values);
  if (!sectionGeometryValid(proposedSection)) blockers.push({ code: 'PIPE_SECTION_GEOMETRY_INVALID' });
  const first = expected.map(([name]) => fields.get(name)).find(Boolean);
  const sourceEvidence = deepFreeze({
    sourceKind: first?.sourceKind ?? 'NONE',
    sourceKey: first?.sourceKey ?? null,
    sourceHash: first?.sourceHash ?? null,
    locators: Object.fromEntries(Object.entries(locators).sort(([left], [right]) => ascii(left, right))),
  });
  const canonicalBlockers = blockers.sort((left, right) => ascii(semanticHash(left), semanticHash(right)));
  const proposalId = `PIPE_SECTION:${lineKey}`;
  const proposalMaterial = {
    pipingClassResolutionHash,
    targetKind: 'LINE',
    targetId: lineKey,
    fieldFamily: 'PIPE_SECTION',
    proposedSection,
    sourceEvidence,
  };
  return deepFreeze({
    proposalId,
    proposalHash: semanticHash(proposalMaterial),
    targetKind: 'LINE',
    targetId: lineKey,
    fieldFamily: 'PIPE_SECTION',
    proposedSection,
    authorityLevel: 'AUTHORIZED_MASTER_CANDIDATE',
    disposition: canonicalBlockers.length === 0
      ? 'SHADOW_CANDIDATE_VALUE'
      : 'BLOCKED_PIPE_SECTION_RESOLUTION',
    blockers: canonicalBlockers,
    bindingCreated: false,
    sourceEvidence,
  });
}

function validateProjectionRow(row, index, pipingClassResolutionHash) {
  exactKeys(row, PROJECTION_ROW_KEYS, `pipe-section projection rows[${index}]`);
  requiredText(row.proposalId, `rows[${index}].proposalId`);
  semanticHashText(row.proposalHash, `rows[${index}].proposalHash`);
  if (row.targetKind !== 'LINE'
      || !requiredText(row.targetId, `rows[${index}].targetId`)
      || row.fieldFamily !== 'PIPE_SECTION'
      || row.authorityLevel !== 'AUTHORIZED_MASTER_CANDIDATE'
      || !['SHADOW_CANDIDATE_VALUE', 'BLOCKED_PIPE_SECTION_RESOLUTION'].includes(row.disposition)
      || !Array.isArray(row.blockers)
      || row.bindingCreated !== false) {
    fail('ENRICHMENT_PIPE_SECTION_PROJECTION_ROW_INVALID', `Pipe-section projection rows[${index}] is invalid.`);
  }
  exactKeys(row.sourceEvidence, SOURCE_EVIDENCE_KEYS, `rows[${index}].sourceEvidence`);
  requireLocatorMap(row.sourceEvidence.locators, `rows[${index}].sourceEvidence.locators`);
  if (row.disposition === 'SHADOW_CANDIDATE_VALUE') {
    requireSection(row.proposedSection, `rows[${index}].proposedSection`);
    if (row.blockers.length !== 0
        || row.sourceEvidence.sourceKind !== 'PIPING_CLASS'
        || !requiredText(row.sourceEvidence.sourceKey, 'sourceEvidence.sourceKey')
        || !requiredText(row.sourceEvidence.sourceHash, 'sourceEvidence.sourceHash')
        || Object.keys(row.sourceEvidence.locators).length !== SECTION_FIELDS.length) {
      fail('ENRICHMENT_PIPE_SECTION_PROJECTION_EXACT_ROW_INVALID', `Pipe-section exact projection rows[${index}] is invalid.`);
    }
  } else if (row.blockers.length === 0) {
    fail('ENRICHMENT_PIPE_SECTION_PROJECTION_BLOCKERS_REQUIRED', `Blocked pipe-section projection rows[${index}] requires blockers.`);
  }
  const expectedProposalHash = semanticHash({
    pipingClassResolutionHash,
    targetKind: row.targetKind,
    targetId: row.targetId,
    fieldFamily: row.fieldFamily,
    proposedSection: row.proposedSection,
    sourceEvidence: row.sourceEvidence,
  });
  if (row.proposalHash !== expectedProposalHash) {
    fail('ENRICHMENT_PIPE_SECTION_PROJECTION_PROPOSAL_HASH_MISMATCH', `Pipe-section projection rows[${index}] proposal hash mismatch.`);
  }
  return row.proposalId;
}

function normalizeProposedSection(values) {
  return deepFreeze({
    outsideDiameterMm: values.outsideDiameterMm ?? null,
    wallThicknessMm: values.wallThicknessMm ?? null,
    materialCode: values.materialCode ?? null,
    insulationCode: values.insulationCode ?? null,
    insulationThicknessMm: values.insulationThicknessMm ?? null,
  });
}

function requireSection(value, label) {
  exactKeys(value, SECTION_KEYS, label);
  const result = {
    outsideDiameterMm: positiveNumber(value.outsideDiameterMm, `${label}.outsideDiameterMm`),
    wallThicknessMm: positiveNumber(value.wallThicknessMm, `${label}.wallThicknessMm`),
    materialCode: requiredText(value.materialCode, `${label}.materialCode`),
    insulationCode: requiredText(value.insulationCode, `${label}.insulationCode`),
    insulationThicknessMm: nonnegativeNumber(value.insulationThicknessMm, `${label}.insulationThicknessMm`),
  };
  if (!sectionGeometryValid(result)) {
    fail('ENRICHMENT_PRODUCTION_PIPE_SECTION_GEOMETRY_INVALID', `${label} has a non-positive inside diameter.`);
  }
  return deepFreeze(result);
}

function sectionGeometryValid(section) {
  return positive(section?.outsideDiameterMm)
    && positive(section?.wallThicknessMm)
    && section.wallThicknessMm * 2 < section.outsideDiameterMm
    && Number.isFinite(section?.insulationThicknessMm)
    && section.insulationThicknessMm >= 0
    && typeof section?.materialCode === 'string' && section.materialCode.trim().length > 0
    && typeof section?.insulationCode === 'string' && section.insulationCode.trim().length > 0;
}

function validateBinding(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    fail('ENRICHMENT_PRODUCTION_PIPE_SECTION_BINDING_INVALID', 'Production pipe-section binding is invalid.');
  }
  ['proposalId', 'proposalHash', 'targetId', 'lineKey'].forEach((field) => requiredText(row[field], field));
  if (row.targetId !== row.lineKey) {
    fail('ENRICHMENT_PRODUCTION_PIPE_SECTION_LINE_IDENTITY_INVALID', 'Pipe-section targetId must equal the production lineKey.');
  }
  requireSection(row.section, `binding ${row.lineKey}.section`);
}

function validateSectionMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('ENRICHMENT_PRODUCTION_PIPE_SECTION_MAP_INVALID', 'pipeSectionProperties must be an object map.');
  }
  const keys = Object.keys(value);
  if (JSON.stringify(keys) !== JSON.stringify([...keys].sort(ascii))) {
    fail('ENRICHMENT_PRODUCTION_PIPE_SECTION_MAP_ORDER_INVALID', 'Pipe-section map keys must be canonical sorted.');
  }
  keys.forEach((key) => {
    requiredText(key, 'pipeSectionProperties key');
    requireSection(value[key], `pipeSectionProperties.${key}`);
  });
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

function sectionKey(fieldName) {
  return fieldName.slice('section.'.length);
}

function matchesKind(value, kind) {
  if (kind === 'NUMBER') return Number.isFinite(value);
  if (kind === 'STRING') return typeof value === 'string' && value.trim().length > 0;
  return false;
}

function requireLocatorMap(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('ENRICHMENT_PIPE_SECTION_SOURCE_EVIDENCE_INVALID', `${label} must be an object.`);
  }
  const keys = Object.keys(value);
  if (JSON.stringify(keys) !== JSON.stringify([...keys].sort(ascii))) {
    fail('ENRICHMENT_PIPE_SECTION_SOURCE_EVIDENCE_INVALID', `${label} keys must be canonical sorted.`);
  }
  keys.forEach((key) => requiredText(value[key], `${label}.${key}`));
  return value;
}

function requireDataset(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !requiredText(value.sourceSha256, 'dataset.sourceSha256')
      || !value.sharedModel
      || !semanticHashText(value.sharedModel.semanticHash, 'dataset.sharedModel.semanticHash')
      || !Array.isArray(value.entities)) {
    fail('ENRICHMENT_PRODUCTION_PIPE_SECTION_DATASET_INVALID', 'Active workspace dataset is invalid.');
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
    fail('ENRICHMENT_PRODUCTION_PIPE_SECTION_TYPE_INVALID', `${label} must be an object.`);
  }
  const actual = Object.keys(value).sort(ascii);
  const expected = [...keys].sort(ascii);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail('ENRICHMENT_PRODUCTION_PIPE_SECTION_KEYS_INVALID', `${label} keys are invalid.`, { actual, expected });
  }
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    fail('ENRICHMENT_PRODUCTION_PIPE_SECTION_TEXT_INVALID', `${label} must be a non-empty trimmed string.`);
  }
  return value;
}

function semanticHashText(value, label) {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    fail('ENRICHMENT_PRODUCTION_PIPE_SECTION_HASH_INVALID', `${label} must be an FNV-1a semantic hash.`);
  }
  return value;
}

function positiveNumber(value, label) {
  if (!positive(value)) fail('ENRICHMENT_PRODUCTION_PIPE_SECTION_NUMBER_INVALID', `${label} must be positive.`);
  return value;
}

function nonnegativeNumber(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    fail('ENRICHMENT_PRODUCTION_PIPE_SECTION_NUMBER_INVALID', `${label} must be a non-negative finite number.`);
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
