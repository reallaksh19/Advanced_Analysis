/**
 * Common Non-FEA enrichment contracts.
 *
 * These contracts migrate the deterministic selector and sidecar behavior from
 * First Cut without retaining First Cut as an independent input authority.
 * Source shared-model objects are never mutated, topology is never repaired,
 * and support-availability sensitivity remains an explicit impact declaration
 * rather than removing a support from the common projection.
 */
import {
  createSharedPipingModel,
  deepFreeze,
  semanticHash,
  validateSharedPipingModel,
} from '../shared-piping-model/index.js';

export const NON_FEA_ENRICHMENT_SCHEMAS = Object.freeze({
  SIDECAR: 'non-fea-enrichment-sidecar/v1',
  RESOLUTION_LEDGER: 'non-fea-field-resolution-ledger/v1',
  ENRICHED_PROJECTION: 'non-fea-enriched-shared-model-projection/v1',
  IMPACT_PREVIEW: 'non-fea-enrichment-impact-preview/v1',
  LEGACY_MIGRATION: 'non-fea-first-cut-migration-report/v1',
  PROPOSAL: 'non-fea-enrichment-proposal/v1',
});

export const NON_FEA_SELECTOR_KINDS = Object.freeze([
  'ENTITY',
  'PIPING_CLASS_BORE',
  'COMPONENT_TYPE_BORE',
  'SUPPORT_KIND',
]);

export const NON_FEA_ENRICHMENT_AUTHORITIES = Object.freeze([
  'SOURCE_EXPLICIT',
  'SOURCE_INHERITED',
  'EXACT_APPROVED_MASTER',
  'ACCEPTED_OVERRIDE',
  'CONFIGURED_DERIVATION',
  'PROJECT_CONFIGURED_DEFAULT',
]);

const AUTHORITY_RANK = new Map(NON_FEA_ENRICHMENT_AUTHORITIES.map((value, index) => [value, index]));
const LEGACY_AUTHORITY_MAP = Object.freeze({
  EXPLICIT_SOURCE: 'SOURCE_EXPLICIT',
  AUTHORIZED_MASTER: 'EXACT_APPROVED_MASTER',
  ACCEPTED_OVERRIDE: 'ACCEPTED_OVERRIDE',
  USER_APPROVED_APPROXIMATION: 'ACCEPTED_OVERRIDE',
});
const SOURCE_MASTER_OVERRIDE_DEFAULT = Object.freeze([
  'SOURCE_EXPLICIT', 'SOURCE_INHERITED', 'EXACT_APPROVED_MASTER',
  'ACCEPTED_OVERRIDE', 'PROJECT_CONFIGURED_DEFAULT',
]);
const SOURCE_MASTER_OVERRIDE_DERIVATION = Object.freeze([
  'SOURCE_EXPLICIT', 'SOURCE_INHERITED', 'EXACT_APPROVED_MASTER',
  'ACCEPTED_OVERRIDE', 'CONFIGURED_DERIVATION',
]);
const SOURCE_MASTER_OVERRIDE_DERIVATION_DEFAULT = Object.freeze([
  ...SOURCE_MASTER_OVERRIDE_DERIVATION, 'PROJECT_CONFIGURED_DEFAULT',
]);
const SUPPORT_AUTHORITIES = Object.freeze([
  'SOURCE_EXPLICIT', 'SOURCE_INHERITED', 'EXACT_APPROVED_MASTER', 'ACCEPTED_OVERRIDE',
]);

const FIELD_DEFINITIONS = Object.freeze([
  componentField('PIPE_OUTER_DIAMETER', 'outerDiameterMm', ['outerDiameterMm'], ['model-load-foundation', 'vertical-beam-foundation']),
  componentField('PIPE_WALL_THICKNESS', 'wallThicknessMm', ['wallThicknessMm'], ['model-load-foundation', 'vertical-beam-foundation']),
  componentField('MATERIAL_DENSITY', 'materialDensityKgM3', ['materialDensityKgM3'], ['model-load-foundation', 'mass-ledger']),
  componentField('UNIT_PIPE_WEIGHT', 'unitPipeWeightKgPerM', ['unitPipeWeightKgPerM'], ['model-load-foundation', 'mass-ledger']),
  componentField('OPERATING_FLUID_DENSITY', 'fluidDensityOpeKgM3', ['fluidDensityOpeKgM3'], ['model-load-foundation', 'mass-ledger']),
  componentField('HYDRO_FLUID_DENSITY', 'fluidDensityHydKgM3', ['fluidDensityHydKgM3'], ['model-load-foundation', 'mass-ledger']),
  componentField('OPERATING_FLUID_WEIGHT', 'fluidWeightOpeKgPerM', ['fluidWeightOpeKgPerM'], ['model-load-foundation', 'mass-ledger']),
  componentField('HYDRO_FLUID_WEIGHT', 'fluidWeightHydKgPerM', ['fluidWeightHydKgPerM'], ['model-load-foundation', 'mass-ledger']),
  componentField('INSULATION_THICKNESS', 'insulationThicknessMm', ['insulationThicknessMm'], ['model-load-foundation', 'mass-ledger']),
  componentField('INSULATION_DENSITY', 'insulationDensityKgM3', ['insulationDensityKgM3'], ['model-load-foundation', 'mass-ledger']),
  componentField('INSULATION_WEIGHT', 'insulationWeightKgPerM', ['insulationWeightKgPerM'], ['model-load-foundation', 'mass-ledger']),
  componentField('COMPONENT_WEIGHT', 'componentWeightKg', ['componentWeightKg'], ['model-load-foundation', 'mass-ledger']),
  componentField('ELASTIC_MODULUS', 'elasticModulusMpa', ['elasticModulusMpa'], ['vertical-beam-foundation']),
  componentField('SECOND_MOMENT_AREA', 'secondMomentAreaMm4', ['secondMomentAreaMm4'], ['vertical-beam-foundation']),
  componentField('FLEXURAL_RIGIDITY', 'flexuralRigidityNm2', ['flexuralRigidityNm2'], ['vertical-beam-foundation']),
  supportField('SUPPORT_VERTICAL_STATE', 'verticalState', ['verticalState'], ['restraint-capability-model', 'vertical-load-path-foundation']),
  supportField('RESTRAINT_TYPE', 'supportType', ['supportType'], ['restraint-capability-model', 'vertical-load-path-foundation']),
  sensitivityField('SUPPORT_AVAILABILITY_SENSITIVITY', ['supportAvailabilitySensitivity'], ['vertical-load-path-foundation', 'vertical-beam-foundation']),
]);

const FIELD_BY_ID = new Map(FIELD_DEFINITIONS.map((row) => [row.fieldId, row]));
const FIELD_BY_LEGACY_ID = new Map(FIELD_DEFINITIONS.flatMap((row) => row.legacyFieldIds.map((id) => [id, row])));
const FIELD_AUTHORITY_RULES = new Map([
  ['PIPE_OUTER_DIAMETER', SOURCE_MASTER_OVERRIDE_DEFAULT],
  ['PIPE_WALL_THICKNESS', SOURCE_MASTER_OVERRIDE_DEFAULT],
  ['MATERIAL_DENSITY', SOURCE_MASTER_OVERRIDE_DEFAULT],
  ['UNIT_PIPE_WEIGHT', SOURCE_MASTER_OVERRIDE_DERIVATION_DEFAULT],
  ['OPERATING_FLUID_DENSITY', SOURCE_MASTER_OVERRIDE_DEFAULT],
  ['HYDRO_FLUID_DENSITY', SOURCE_MASTER_OVERRIDE_DEFAULT],
  ['OPERATING_FLUID_WEIGHT', SOURCE_MASTER_OVERRIDE_DERIVATION_DEFAULT],
  ['HYDRO_FLUID_WEIGHT', SOURCE_MASTER_OVERRIDE_DERIVATION_DEFAULT],
  ['INSULATION_THICKNESS', SOURCE_MASTER_OVERRIDE_DEFAULT],
  ['INSULATION_DENSITY', SOURCE_MASTER_OVERRIDE_DEFAULT],
  ['INSULATION_WEIGHT', SOURCE_MASTER_OVERRIDE_DERIVATION_DEFAULT],
  ['COMPONENT_WEIGHT', SOURCE_MASTER_OVERRIDE_DEFAULT],
  ['ELASTIC_MODULUS', SOURCE_MASTER_OVERRIDE_DEFAULT],
  ['SECOND_MOMENT_AREA', SOURCE_MASTER_OVERRIDE_DERIVATION],
  ['FLEXURAL_RIGIDITY', SOURCE_MASTER_OVERRIDE_DERIVATION],
  ['SUPPORT_VERTICAL_STATE', SUPPORT_AUTHORITIES],
  ['RESTRAINT_TYPE', SUPPORT_AUTHORITIES],
  ['SUPPORT_AVAILABILITY_SENSITIVITY', Object.freeze(['ACCEPTED_OVERRIDE'])],
]);

export function listNonFeaEnrichmentFields() {
  return FIELD_DEFINITIONS;
}

export function createNonFeaEnrichmentRecord(input) {
  if (!isRecord(input)) throw new TypeError('Non-FEA enrichment record must be an object.');
  const field = FIELD_BY_ID.get(requiredText(input.fieldId, 'Field ID'));
  if (!field) throw new TypeError(`Unsupported Non-FEA enrichment field: ${input.fieldId}.`);
  const selectorKind = enumValue(input.selectorKind, NON_FEA_SELECTOR_KINDS, 'Selector kind');
  const authority = enumValue(input.authority, NON_FEA_ENRICHMENT_AUTHORITIES, 'Authority');
  const allowedAuthorities = FIELD_AUTHORITY_RULES.get(field.fieldId) || [];
  if (!allowedAuthorities.includes(authority)) {
    throw new TypeError(`${authority} is not permitted for ${field.fieldId}.`);
  }
  const value = engineeringValue(input.value, 'Enrichment value');
  if (field.targetKind === 'SENSITIVITY') {
    if (selectorKind !== 'ENTITY' || value !== 'USER-DECLARED SUPPORT-UNAVAILABLE SENSITIVITY') {
      throw new TypeError('Support-availability sensitivity requires an exact ENTITY selector and the reviewed declaration.');
    }
  }
  return deepFreeze({
    recordId: requiredText(input.recordId, 'Record ID'),
    selectorKind,
    selectorKey: requiredText(input.selectorKey, 'Selector key'),
    fieldId: field.fieldId,
    value,
    unit: requiredText(input.unit, 'Unit'),
    authority,
    sourceId: requiredText(input.sourceId, 'Source ID'),
    revision: requiredText(input.revision, 'Revision'),
    evidence: input.evidence === undefined || input.evidence === null ? null : plainClone(input.evidence),
    migration: input.migration === undefined || input.migration === null ? null : plainClone(input.migration),
  });
}

export function createNonFeaEnrichmentProposal(input) {
  if (!isRecord(input)) throw new TypeError('Non-FEA enrichment proposal must be an object.');
  const record = createNonFeaEnrichmentRecord(input.record || input);
  const base = {
    schema: NON_FEA_ENRICHMENT_SCHEMAS.PROPOSAL,
    proposalId: requiredText(input.proposalId || record.recordId, 'Proposal ID'),
    state: 'PROPOSED',
    record,
    rationale: requiredText(input.rationale || 'Exact reviewed enrichment candidate.', 'Proposal rationale'),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function acceptNonFeaEnrichmentProposal(proposal, decision = {}) {
  if (!isRecord(proposal) || proposal.schema !== NON_FEA_ENRICHMENT_SCHEMAS.PROPOSAL) {
    throw new TypeError(`Expected ${NON_FEA_ENRICHMENT_SCHEMAS.PROPOSAL}.`);
  }
  return createNonFeaEnrichmentRecord({
    ...proposal.record,
    selectorKind: decision.selectorKind || proposal.record.selectorKind,
    selectorKey: decision.selectorKey || proposal.record.selectorKey,
    authority: decision.authority || proposal.record.authority,
    evidence: {
      ...(proposal.record.evidence || {}),
      acceptanceBasis: requiredText(decision.acceptanceBasis || proposal.rationale, 'Acceptance basis'),
      proposalSemanticHash: proposal.semanticHash,
    },
  });
}

export function createNonFeaEnrichmentSidecar(input) {
  if (!isRecord(input)) throw new TypeError('Non-FEA enrichment sidecar input must be an object.');
  const sourceSemanticHash = requiredText(input.sourceSemanticHash, 'Source semantic hash');
  if (!Array.isArray(input.records)) throw new TypeError('Enrichment sidecar records must be an array.');
  const records = input.records.map(createNonFeaEnrichmentRecord).sort(recordOrder);
  assertUniqueRecordIds(records);
  assertNoSameAuthoritySelectorConflicts(records);
  const base = {
    schema: NON_FEA_ENRICHMENT_SCHEMAS.SIDECAR,
    sourceSemanticHash,
    records,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function migrateFirstCutEnrichment(input) {
  if (!isRecord(input)) throw new TypeError('First Cut migration input must be an object.');
  const sourceSemanticHash = requiredText(input.sourceSemanticHash, 'Source semantic hash');
  const legacyRows = [
    ...(Array.isArray(input.masterData?.records)
      ? input.masterData.records.map((row) => ({ ...row, authorityLevel: 'AUTHORIZED_MASTER' }))
      : []),
    ...(Array.isArray(input.bindings) ? input.bindings : []),
  ];
  const blockers = [];
  const records = [];
  legacyRows.forEach((row, index) => {
    try {
      const field = FIELD_BY_LEGACY_ID.get(row.fieldId);
      if (!field) throw new TypeError(`Unsupported legacy First Cut field: ${row.fieldId}.`);
      const authority = LEGACY_AUTHORITY_MAP[row.authorityLevel];
      if (!authority) throw new TypeError(`Unsupported legacy First Cut authority: ${row.authorityLevel}.`);
      records.push(createNonFeaEnrichmentRecord({
        recordId: row.recordId,
        selectorKind: row.selectorKind,
        selectorKey: row.selectorKey,
        fieldId: field.fieldId,
        value: row.value,
        unit: row.unit,
        authority,
        sourceId: row.sourceId,
        revision: row.revision,
        evidence: {
          source: 'Migrated First Cut sidecar',
          legacyFieldId: row.fieldId,
          legacyAuthority: row.authorityLevel,
        },
        migration: {
          sourceSchema: input.masterData?.schema || 'first-cut-binding-array',
          legacyAuthority: row.authorityLevel,
          reviewRequired: row.authorityLevel === 'USER_APPROVED_APPROXIMATION',
        },
      }));
    } catch (error) {
      blockers.push(issue('LEGACY_RECORD_INVALID', `legacyRows[${index}]`, messageOf(error)));
    }
  });
  duplicateValues(records.map((row) => row.recordId))
    .forEach((id) => blockers.push(issue('DUPLICATE_RECORD_ID', id, `Duplicate migrated record ID: ${id}.`)));
  blockers.push(...legacyPrecedenceBlockers(records));
  const sorted = [...records].sort(recordOrder);
  const base = {
    schema: NON_FEA_ENRICHMENT_SCHEMAS.LEGACY_MIGRATION,
    sourceSemanticHash,
    status: blockers.length ? 'BLOCKED' : 'READY_FOR_REVIEW',
    records: sorted,
    blockers: blockers.sort(issueOrder),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function resolveNonFeaEnrichment(input) {
  if (!isRecord(input)) throw new TypeError('Non-FEA enrichment resolution input must be an object.');
  const validation = validateSharedPipingModel(input.sourceModel);
  if (!validation.ok) throw new TypeError(`Invalid source model: ${validation.errors.join(' ')}`);
  const sidecar = validateSidecar(input.sidecar);
  const blockers = [];
  if (sidecar.sourceSemanticHash !== input.sourceModel.semanticHash) {
    blockers.push(issue(
      'STALE_SIDECAR',
      'sidecar.sourceSemanticHash',
      'Accepted enrichment records are bound to a different source semantic hash.',
    ));
  }
  const applications = [];
  sidecar.records.forEach((record) => {
    const field = FIELD_BY_ID.get(record.fieldId);
    const targets = matchingTargets(input.sourceModel, record, field);
    if (!targets.length) {
      blockers.push(issue(
        'SELECTOR_NOT_MATCHED',
        record.recordId,
        `${record.selectorKind}:${record.selectorKey} did not match an exact governed entity.`,
      ));
      return;
    }
    targets.forEach((target) => applications.push(candidateFromRecord(target, field, record)));
  });
  const grouped = groupBy(applications, (row) => `${row.targetKind}|${row.targetId}|${row.fieldId}`);
  const resolutionRows = [];
  grouped.forEach((candidates, key) => {
    const representative = candidates[0];
    const field = representative.field;
    const existing = existingCandidate(representative, field, input.sourceModel.semanticHash);
    const allCandidates = existing ? [existing, ...candidates] : [...candidates];
    const conflicts = sameAuthorityConflicts(allCandidates);
    if (conflicts.length) {
      blockers.push(issue('SAME_AUTHORITY_CONFLICT', key, `Conflicting values exist at ${conflicts.join(', ')}.`));
      resolutionRows.push(resolutionRow(key, allCandidates, null, 'BLOCKED'));
      return;
    }
    const precedenceBlocker = applicationLegacyPrecedenceBlocker(allCandidates, key);
    if (precedenceBlocker) {
      blockers.push(precedenceBlocker);
      resolutionRows.push(resolutionRow(key, allCandidates, null, 'BLOCKED'));
      return;
    }
    const selected = [...allCandidates].sort(candidateOrder)[0] || null;
    resolutionRows.push(resolutionRow(key, allCandidates, selected, selected ? 'RESOLVED' : 'BLOCKED'));
  });
  const base = {
    schema: NON_FEA_ENRICHMENT_SCHEMAS.RESOLUTION_LEDGER,
    sourceSemanticHash: input.sourceModel.semanticHash,
    sidecarSemanticHash: sidecar.semanticHash,
    status: blockers.length ? 'BLOCKED' : 'READY',
    rows: resolutionRows.sort((left, right) => left.resolutionKey.localeCompare(right.resolutionKey)),
    blockers: blockers.sort(issueOrder),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function createNonFeaEnrichedProjection(input) {
  if (!isRecord(input)) throw new TypeError('Non-FEA enriched projection input must be an object.');
  const validation = validateSharedPipingModel(input.sourceModel);
  if (!validation.ok) throw new TypeError(`Invalid source model: ${validation.errors.join(' ')}`);
  const ledger = validateResolutionLedger(input.resolutionLedger);
  if (ledger.status !== 'READY') throw new TypeError('A blocked field-resolution ledger cannot create an enriched projection.');
  if (ledger.sourceSemanticHash !== input.sourceModel.semanticHash) throw new TypeError('Resolution ledger is stale against the source model.');
  const selectedRows = ledger.rows.filter((row) => row.selected && !row.selected.fromSource);
  const components = input.sourceModel.components.map((component) => enrichComponent(component, selectedRows));
  const supports = input.sourceModel.supports.map((support) => enrichSupport(support, selectedRows));
  const enrichedModel = createSharedPipingModel({
    project: input.sourceModel.project,
    units: input.sourceModel.units,
    sourceSnapshotRef: input.sourceModel.sourceSnapshotRef,
    components,
    supports,
    sourceReferences: input.sourceModel.sourceReferences,
    diagnostics: input.sourceModel.diagnostics,
  });
  const sourceTopologyHash = topologySemanticHash(input.sourceModel);
  const enrichedTopologyHash = topologySemanticHash(enrichedModel);
  if (sourceTopologyHash !== enrichedTopologyHash) {
    throw new TypeError('Enrichment attempted to change governed topology, geometry, attachment, or support membership.');
  }
  const base = {
    schema: NON_FEA_ENRICHMENT_SCHEMAS.ENRICHED_PROJECTION,
    sourceSemanticHash: input.sourceModel.semanticHash,
    resolutionLedgerSemanticHash: ledger.semanticHash,
    topologySemanticHash: sourceTopologyHash,
    enrichedModel,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash({
    schema: base.schema,
    sourceSemanticHash: base.sourceSemanticHash,
    resolutionLedgerSemanticHash: base.resolutionLedgerSemanticHash,
    topologySemanticHash: base.topologySemanticHash,
    enrichedModelSemanticHash: enrichedModel.semanticHash,
  }) });
}

export function createNonFeaEnrichmentImpactPreview(input) {
  if (!isRecord(input)) throw new TypeError('Non-FEA enrichment impact input must be an object.');
  const ledger = validateResolutionLedger(input.resolutionLedger);
  const affected = ledger.rows
    .filter((row) => row.selected && !row.selected.fromSource)
    .map((row) => ({
      targetKind: row.selected.targetKind,
      targetId: row.selected.targetId,
      fieldId: row.selected.fieldId,
      authority: row.selected.authority,
      sensitivityOnly: FIELD_BY_ID.get(row.selected.fieldId)?.targetKind === 'SENSITIVITY',
    }))
    .sort((left, right) => `${left.targetKind}|${left.targetId}|${left.fieldId}`.localeCompare(`${right.targetKind}|${right.targetId}|${right.fieldId}`));
  const invalidated = new Set();
  affected.forEach((row) => FIELD_BY_ID.get(row.fieldId)?.derivedModels.forEach((name) => invalidated.add(name)));
  const base = {
    schema: NON_FEA_ENRICHMENT_SCHEMAS.IMPACT_PREVIEW,
    sourceSemanticHash: ledger.sourceSemanticHash,
    resolutionLedgerSemanticHash: ledger.semanticHash,
    status: ledger.status,
    sourceMutation: false,
    topologyMutation: false,
    supportRemoval: false,
    affectedEntities: affected,
    invalidatedDerivedModels: [...invalidated].sort(),
    blockers: ledger.blockers,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function validateSidecar(value) {
  if (!isRecord(value) || value.schema !== NON_FEA_ENRICHMENT_SCHEMAS.SIDECAR) {
    throw new TypeError(`Expected ${NON_FEA_ENRICHMENT_SCHEMAS.SIDECAR}.`);
  }
  const rebuilt = createNonFeaEnrichmentSidecar({
    sourceSemanticHash: value.sourceSemanticHash,
    records: value.records,
  });
  if (value.semanticHash !== rebuilt.semanticHash) throw new TypeError('Enrichment sidecar semantic hash is invalid.');
  return rebuilt;
}

function validateResolutionLedger(value) {
  if (!isRecord(value) || value.schema !== NON_FEA_ENRICHMENT_SCHEMAS.RESOLUTION_LEDGER) {
    throw new TypeError(`Expected ${NON_FEA_ENRICHMENT_SCHEMAS.RESOLUTION_LEDGER}.`);
  }
  const base = {
    schema: value.schema,
    sourceSemanticHash: value.sourceSemanticHash,
    sidecarSemanticHash: value.sidecarSemanticHash,
    status: value.status,
    rows: value.rows,
    blockers: value.blockers,
  };
  if (semanticHash(base) !== value.semanticHash) throw new TypeError('Field-resolution ledger semantic hash is invalid.');
  return value;
}

function matchingTargets(model, record, field) {
  if (field.targetKind === 'COMPONENT') {
    return model.components.filter((component) => selectorMatchesComponent(record, component))
      .map((target) => ({ targetKind: 'COMPONENT', targetId: componentId(target), target }));
  }
  return model.supports.filter((support) => selectorMatchesSupport(record, support))
    .map((target) => ({ targetKind: 'SUPPORT', targetId: supportId(target), target }));
}

function selectorMatchesComponent(record, component) {
  if (record.selectorKind === 'ENTITY') return [component.componentKey, component.sourceEntityId].includes(record.selectorKey);
  if (record.selectorKind === 'PIPING_CLASS_BORE') return record.selectorKey === `${pipingClass(component)}|${bore(component)}`;
  if (record.selectorKind === 'COMPONENT_TYPE_BORE') return record.selectorKey === `${component.type}|${bore(component)}`;
  return false;
}

function selectorMatchesSupport(record, support) {
  if (record.selectorKind === 'ENTITY') return [support.supportKey, support.sourceEntityId].includes(record.selectorKey);
  if (record.selectorKind !== 'SUPPORT_KIND') return false;
  return record.selectorKey === String(firstEvidenceValue(support.supportEvidence?.supportTypes) || support.type || '').toUpperCase();
}

function candidateFromRecord(target, field, record) {
  return {
    target: target.target,
    field,
    targetKind: target.targetKind,
    targetId: target.targetId,
    fieldId: field.fieldId,
    propertyKey: field.propertyKey,
    value: record.value,
    unit: record.unit,
    authority: record.authority,
    recordId: record.recordId,
    sourceId: record.sourceId,
    revision: record.revision,
    evidence: record.evidence,
    migration: record.migration,
    fromSource: false,
  };
}

function existingCandidate(representative, field, sourceSemanticHash) {
  if (field.targetKind === 'SENSITIVITY') return null;
  const target = representative.target;
  let evidence = null;
  if (field.targetKind === 'COMPONENT') evidence = target.engineeringProperties?.[field.propertyKey];
  if (field.targetKind === 'SUPPORT' && field.propertyKey === 'verticalState') evidence = target.supportEvidence?.verticalCapabilities?.[0];
  if (field.targetKind === 'SUPPORT' && field.propertyKey === 'supportType') evidence = target.supportEvidence?.supportTypes?.[0];
  if (!isRecord(evidence) || !Object.hasOwn(evidence, 'value')) return null;
  const inherited = String(evidence.sourceKind || '').toUpperCase().includes('INHERITED');
  return {
    target,
    field,
    targetKind: representative.targetKind,
    targetId: representative.targetId,
    fieldId: field.fieldId,
    propertyKey: field.propertyKey,
    value: evidence.value,
    unit: evidence.unit || '1',
    authority: inherited ? 'SOURCE_INHERITED' : 'SOURCE_EXPLICIT',
    recordId: `source:${representative.targetId}:${field.fieldId}`,
    sourceId: evidence.sourceRoot || sourceSemanticHash,
    revision: evidence.sourcePath || 'source-model',
    evidence,
    migration: null,
    fromSource: true,
  };
}

function resolutionRow(key, candidates, selected, status) {
  return deepFreeze({
    resolutionKey: key,
    targetKind: candidates[0]?.targetKind || null,
    targetId: candidates[0]?.targetId || null,
    fieldId: candidates[0]?.fieldId || null,
    status,
    selected: selected ? publicCandidate(selected) : null,
    candidates: [...candidates].sort(candidateOrder).map(publicCandidate),
  });
}

function publicCandidate(row) {
  return deepFreeze({
    targetKind: row.targetKind,
    targetId: row.targetId,
    fieldId: row.fieldId,
    propertyKey: row.propertyKey,
    value: row.value,
    unit: row.unit,
    authority: row.authority,
    recordId: row.recordId,
    sourceId: row.sourceId,
    revision: row.revision,
    evidence: row.evidence,
    migration: row.migration,
    fromSource: row.fromSource,
  });
}

function enrichComponent(component, rows) {
  const selected = rows.filter((row) => row.selected.targetKind === 'COMPONENT' && row.selected.targetId === componentId(component));
  if (!selected.length) return component;
  const engineeringProperties = { ...(component.engineeringProperties || {}) };
  selected.forEach((row) => {
    const field = FIELD_BY_ID.get(row.fieldId);
    if (field.targetKind !== 'COMPONENT') return;
    if (engineeringProperties[field.propertyKey] === undefined || engineeringProperties[field.propertyKey] === null) {
      engineeringProperties[field.propertyKey] = enrichmentEvidence(row.selected);
    }
  });
  return { ...component, engineeringProperties };
}

function enrichSupport(support, rows) {
  const selected = rows.filter((row) => row.selected.targetKind === 'SUPPORT' && row.selected.targetId === supportId(support));
  if (!selected.length) return support;
  const supportEvidence = { ...(support.supportEvidence || {}) };
  selected.forEach((row) => {
    const field = FIELD_BY_ID.get(row.fieldId);
    if (field.targetKind === 'SENSITIVITY') return;
    if (field.propertyKey === 'verticalState' && !supportEvidence.verticalCapabilities?.length) {
      supportEvidence.verticalCapabilities = [enrichmentEvidence(row.selected)];
    }
    if (field.propertyKey === 'supportType' && !supportEvidence.supportTypes?.length) {
      supportEvidence.supportTypes = [enrichmentEvidence(row.selected)];
    }
  });
  return { ...support, supportEvidence };
}

function enrichmentEvidence(selected) {
  return {
    value: selected.value,
    unit: selected.unit,
    sourcePath: `nonFeaEnrichment.${selected.recordId}`,
    sourceRoot: selected.sourceId,
    sourceKind: selected.authority,
  };
}

function topologySemanticHash(model) {
  return semanticHash({
    project: model.project,
    units: model.units,
    sourceSnapshotRef: model.sourceSnapshotRef,
    components: model.components.map((component) => ({
      componentKey: component.componentKey,
      sourceEntityId: component.sourceEntityId,
      type: component.type,
      identity: component.identity,
      geometry: component.geometry,
      ports: component.ports,
    })),
    supports: model.supports.map((support) => ({
      supportKey: support.supportKey,
      sourceEntityId: support.sourceEntityId,
      type: support.type,
      position: support.position,
      attachment: support.attachment,
      hostComponentKey: support.hostComponentKey,
      hostPortKey: support.hostPortKey,
    })),
  });
}

function sameAuthorityConflicts(candidates) {
  const grouped = groupBy(candidates, (row) => row.authority);
  const conflicts = [];
  grouped.forEach((rows, authority) => {
    const values = new Set(rows.map((row) => semanticHash({ value: row.value, unit: row.unit })));
    if (values.size > 1) conflicts.push(authority);
  });
  return conflicts.sort();
}

function applicationLegacyPrecedenceBlocker(candidates, key) {
  const master = candidates.find((row) => row.authority === 'EXACT_APPROVED_MASTER' && row.migration?.legacyAuthority === 'AUTHORIZED_MASTER');
  const override = candidates.find((row) => row.authority === 'ACCEPTED_OVERRIDE' && row.migration?.legacyAuthority === 'ACCEPTED_OVERRIDE');
  if (!master || !override || sameValue(master, override)) return null;
  return issue(
    'LEGACY_PRECEDENCE_CHANGE_REQUIRES_DECISION',
    key,
    'Legacy First Cut preferred the accepted override, while the common authority hierarchy prefers the exact approved master.',
  );
}

function legacyPrecedenceBlockers(records) {
  const grouped = groupBy(records, selectorFieldKey);
  const blockers = [];
  grouped.forEach((rows, key) => {
    const master = rows.find((row) => row.authority === 'EXACT_APPROVED_MASTER' && row.migration?.legacyAuthority === 'AUTHORIZED_MASTER');
    const override = rows.find((row) => row.authority === 'ACCEPTED_OVERRIDE' && row.migration?.legacyAuthority === 'ACCEPTED_OVERRIDE');
    if (master && override && !sameValue(master, override)) {
      blockers.push(issue(
        'LEGACY_PRECEDENCE_CHANGE_REQUIRES_DECISION',
        key,
        'Conflicting migrated master and override values require an explicit migration decision.',
      ));
    }
  });
  return blockers;
}

function assertNoSameAuthoritySelectorConflicts(records) {
  const grouped = groupBy(records, (row) => `${row.authority}|${selectorFieldKey(row)}`);
  grouped.forEach((rows, key) => {
    const values = new Set(rows.map((row) => semanticHash({ value: row.value, unit: row.unit })));
    if (values.size > 1) throw new TypeError(`Ambiguous same-authority enrichment records for ${key}.`);
  });
}

function assertUniqueRecordIds(records) {
  const duplicates = duplicateValues(records.map((row) => row.recordId));
  if (duplicates.length) throw new TypeError(`Duplicate enrichment record IDs: ${duplicates.join(', ')}.`);
}

function componentField(fieldId, propertyKey, legacyFieldIds, derivedModels) {
  return deepFreeze({ fieldId, targetKind: 'COMPONENT', propertyKey, legacyFieldIds, derivedModels });
}
function supportField(fieldId, propertyKey, legacyFieldIds, derivedModels) {
  return deepFreeze({ fieldId, targetKind: 'SUPPORT', propertyKey, legacyFieldIds, derivedModels });
}
function sensitivityField(fieldId, legacyFieldIds, derivedModels) {
  return deepFreeze({ fieldId, targetKind: 'SENSITIVITY', propertyKey: null, legacyFieldIds, derivedModels });
}
function candidateOrder(left, right) {
  const rank = AUTHORITY_RANK.get(left.authority) - AUTHORITY_RANK.get(right.authority);
  return rank || left.recordId.localeCompare(right.recordId);
}
function recordOrder(left, right) {
  return `${selectorFieldKey(left)}|${left.authority}|${left.recordId}`.localeCompare(`${selectorFieldKey(right)}|${right.authority}|${right.recordId}`);
}
function selectorFieldKey(row) { return `${row.selectorKind}|${row.selectorKey}|${row.fieldId}`; }
function componentId(component) { return component.componentKey || component.sourceEntityId; }
function supportId(support) { return support.supportKey || support.sourceEntityId; }
function pipingClass(component) { return component.identity?.pipingClass || component.identity?.lineClass || ''; }
function bore(component) { return component.geometry?.boreMm ?? component.engineeringProperties?.nominalBoreMm?.value ?? ''; }
function firstEvidenceValue(rows) { return Array.isArray(rows) && rows.length ? rows[0]?.value : null; }
function sameValue(left, right) { return semanticHash({ value: left.value, unit: left.unit }) === semanticHash({ value: right.value, unit: right.unit }); }
function issue(code, path, message) { return deepFreeze({ code, path, message }); }
function issueOrder(left, right) { return `${left.code}|${left.path}|${left.message}`.localeCompare(`${right.code}|${right.path}|${right.message}`); }
function groupBy(rows, keyFn) {
  const result = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(row);
  });
  return result;
}
function duplicateValues(values) {
  const seen = new Set(), duplicates = new Set();
  values.forEach((value) => { if (seen.has(value)) duplicates.add(value); else seen.add(value); });
  return [...duplicates].sort();
}
function enumValue(value, allowed, label) {
  const text = requiredText(value, label);
  if (!allowed.includes(text)) throw new TypeError(`${label} must be one of: ${allowed.join(', ')}.`);
  return text;
}
function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required.`);
  return value.trim();
}
function engineeringValue(value, label) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === 'string' && value.length) return value;
  throw new TypeError(`${label} must be a finite number or non-empty string.`);
}
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function plainClone(value) { return JSON.parse(JSON.stringify(value)); }
function messageOf(error) { return error instanceof Error ? error.message : String(error); }
