import { getPipeDimensions } from '../../../core/geometry/pipeSchedules.js';
import {
  RESOLUTION_KINDS,
  RESOLUTION_STATUSES,
  createConfiguredResolutionSession,
} from '../../../core/empirical-piping-mechanics/configured-resolution.js';
import { deepFreeze } from '../../../core/empirical-piping-mechanics/contracts.js';
import { semanticHash } from '../../../core/empirical-piping-mechanics/identity.js';
import { resolveSectionStates } from '../../../core/empirical-piping-mechanics/section.js';
import { buildBranchScheduleIndex, resolveNominalBoreMm } from './branch-schedule-resolution.js';
import { buildSourceRecordTargets, buildTopologyPositionTargets } from './pos-topology-crosswalk.js';

export const POS_SECTION_MATERIAL_SCHEMA = 'empirical-pos-section-material-state/v1';
export const POS_SECTION_MATERIAL_RECEIPT_SCHEMA = 'empirical-pos-section-material-receipt/v1';
const SECTION_TYPE = /^(PIPE|ELBO|BEND|FLAN|VALV|GASK|OLET|REDU|TEE|COUP|CAP|INST)$/;

/** One common immutable POS state for weight, stiffness, displacement and stress. */
export function resolvePosSectionMaterialStates(input) {
  if (!input?.sourceRoot) throw new TypeError('sourceRoot is required.');
  const scheduleIndex = buildBranchScheduleIndex(input.sourceRoot);
  const session = createConfiguredResolutionSession({
    projectDataRevision: input.projectDataRevision ?? 0,
    projectDataSemanticHash: input.projectDataSemanticHash ?? null,
    defaults: input.configuredDefaults ?? [],
  });
  const targets = input.topologyXmlText
    ? buildTopologyPositionTargets(input.topologyXmlText, scheduleIndex)
    : buildSourceRecordTargets(scheduleIndex, (record) => SECTION_TYPE.test(record.type));
  const rows = targets.map((target) => resolveTarget(target, session, input.projectId ?? null));
  const resolutionReceipt = session.receipt();
  const blockedRowCount = rows.filter((row) => row.status !== 'RESOLVED').length;
  const result = {
    schema: POS_SECTION_MATERIAL_RECEIPT_SCHEMA,
    status: blockedRowCount > 0 ? 'BLOCKED_MISSING_REQUIRED_INPUT'
      : resolutionReceipt.summary.configuredDefaultApplicationCount > 0
        ? 'CALCULATED_WITH_CONFIGURED_DEFAULTS' : 'CALCULATED_SOURCE_ONLY',
    targetAuthority: input.topologyXmlText ? 'TOPOLOGY_PIPINGELEMENT_POSITIONS' : 'ENRICHED_SOURCE_RECORDS',
    topologyElementCount: input.topologyXmlText ? targets.length : null,
    sourceRecordCount: scheduleIndex.items.length,
    rows: Object.freeze(rows),
    resolvedRowCount: rows.length - blockedRowCount,
    blockedRowCount,
    branchScheduleSummary: scheduleIndex.summary,
    resolutionReceipt,
  };
  return deepFreeze({ ...result, semanticIdentity: semanticHash(result) });
}

function resolveTarget(target, session, projectId) {
  const record = target.record;
  const item = record?.item || {};
  const attrs = { ...(item.engineeringProperties || {}), ...(item.attributes || {}) };
  const enriched = item.enrichedAttributes || {};
  const entity = buildEntity(target, attrs, enriched, projectId);
  const values = {};

  values.nominalBoreMm = resolveField(session, {
    field: 'section.nominalBoreMm', entity, unit: 'mm',
    value: record ? resolveNominalBoreMm(item) : null,
    kind: RESOLUTION_KINDS.SOURCE_EXPLICIT,
    authority: 'SOURCE_NOMINAL_BORE', sourcePath: sourcePath(target, 'nominal bore'),
    missing: record ? 'SOURCE_NOMINAL_BORE_UNRESOLVED' : 'SOURCE_RECORD_UNMATCHED',
    validate: positive('Nominal bore must be positive.'),
    affected: ['SECTION_LOOKUP', 'WEIGHT', 'STIFFNESS', 'STRESS'],
  });
  values.schedule = session.resolve({
    field: 'section.schedule', entity: addScope(entity, { nominalBoreMm: read(values.nominalBoreMm) }),
    candidates: scheduleCandidates(record, target.scheduleEvidence),
    sourceMissingReason: target.scheduleEvidence?.status || (record ? 'SOURCE_SCHEDULE_UNRESOLVED' : 'SOURCE_RECORD_UNMATCHED'),
    validate: text('Schedule must be a non-empty string.'),
    affectedCalculations: ['SECTION_LOOKUP', 'WEIGHT', 'STIFFNESS', 'STRESS'],
  });
  const dn = read(values.nominalBoreMm);
  const schedule = read(values.schedule);
  const lookup = dn != null && schedule != null ? getPipeDimensions(dn, schedule) : null;
  values.dimensionsMm = resolveField(session, {
    field: 'section.dimensionsMm', entity: addScope(entity, { nominalBoreMm: dn, schedule }), unit: 'mm',
    value: lookup?.exact ? { outsideDiameterMm: lookup.od, wallThicknessMm: lookup.wt, nps: lookup.nps } : null,
    kind: RESOLUTION_KINDS.CONFIGURED_DERIVATION,
    authority: lookup?.source?.id || 'ENGINEERING_PIPE_SCHEDULE_DATASET',
    sourcePath: `getPipeDimensions(DN=${dn}, schedule=${schedule})`,
    reason: 'Exact schedule-dataset lookup from resolved nominal bore and schedule.',
    missing: lookup?.diagnostics?.map((row) => row.code).join(',') || 'PIPE_DIMENSION_LOOKUP_UNRESOLVED',
    validate: dimensions,
    affected: ['SECTION_PROPERTIES', 'WEIGHT', 'STIFFNESS', 'STRESS'],
  });

  values.materialFamily = resolveField(session, {
    field: 'material.family', entity,
    value: first([enriched.materialFamily, enriched.material, attrs.MATERIAL_FAMILY, attrs.MATERIAL, attrs.MATL]),
    kind: RESOLUTION_KINDS.SOURCE_EXPLICIT,
    authority: 'SOURCE_MATERIAL', sourcePath: sourcePath(target, 'material'),
    validate: text('Material family must be a non-empty string.'),
    affected: ['MATERIAL_PROPERTIES', 'WEIGHT', 'STIFFNESS', 'STRESS'],
  });
  const materialEntity = addScope(entity, {
    materialFamily: read(values.materialFamily),
    temperatureC: finite(first([enriched.operatingTemperatureC, attrs.OPERATING_TEMPERATURE_C, attrs.TEMPERATURE_C])),
  });
  values.elasticModulusPa = materialNumber(session, materialEntity, target,
    'material.elasticModulusPa', 'Pa', first([enriched.elasticModulusPa, attrs.ELASTIC_MODULUS_PA, attrs.MODULUS_PA]),
    'elastic modulus', ['EA', 'EI', 'THERMAL_REACTION', 'P_DELTA']);
  values.poissonsRatio = resolveField(session, {
    field: 'material.poissonsRatio', entity: materialEntity, unit: 'ratio',
    value: finite(first([enriched.poissonsRatio, attrs.POISSONS_RATIO])),
    kind: RESOLUTION_KINDS.SOURCE_EXPLICIT,
    authority: 'SOURCE_POISSONS_RATIO', sourcePath: sourcePath(target, 'Poisson ratio'),
    validate: (value) => Number(value) > 0 && Number(value) < 0.5
      ? true : 'Poisson ratio must be greater than zero and less than 0.5.',
    affected: ['SHEAR_MODULUS', 'TORSIONAL_STIFFNESS'],
  });
  values.densityKgM3 = materialNumber(session, materialEntity, target,
    'material.densityKgM3', 'kg/m3', first([enriched.materialDensityKgM3, attrs.MATERIAL_DENSITY_KG_M3]),
    'material density', ['PIPE_METAL_MASS', 'SUSTAINED_WEIGHT']);
  values.thermalExpansionPerC = materialNumber(session, materialEntity, target,
    'material.thermalExpansionPerC', '1/C', first([
      enriched.thermalExpansionPerC, enriched.meanThermalExpansionPerC, attrs.THERMAL_EXPANSION_PER_C,
    ]), 'thermal expansion', ['THERMAL_STRAIN', 'THERMAL_DISPLACEMENT', 'THERMAL_REACTION']);

  values.corrosionAllowanceMm = resolveField(session, {
    field: 'section.corrosionAllowanceMm', entity, unit: 'mm',
    value: finite(first([target.edge?.corrosionAllowanceMm, enriched.corrosionAllowanceMm, attrs.CORROSION_ALLOWANCE_MM])),
    kind: RESOLUTION_KINDS.SOURCE_EXPLICIT,
    authority: target.edge?.corrosionAllowanceMm != null ? 'TOPOLOGY_CORROSION_ALLOWANCE' : 'SOURCE_CORROSION_ALLOWANCE',
    sourcePath: sourcePath(target, 'corrosion allowance'),
    validate: nonNegative('Corrosion allowance must be zero or positive.'), affected: ['CODE_STRESS_SECTION'],
  });
  values.codeStressWallRule = resolveField(session, {
    field: 'section.codeStressWallRule', entity,
    value: first([enriched.codeStressWallRule, attrs.CODE_STRESS_WALL_RULE]),
    kind: RESOLUTION_KINDS.SOURCE_EXPLICIT,
    authority: 'SOURCE_CODE_STRESS_WALL_RULE', sourcePath: sourcePath(target, 'code stress wall rule'),
    validate: (value) => ['EXPLICIT', 'NOMINAL_MINUS_CORROSION'].includes(value)
      ? true : 'Code-stress wall rule must be EXPLICIT or NOMINAL_MINUS_CORROSION.',
    affected: ['CODE_STRESS_SECTION'],
  });
  if (read(values.codeStressWallRule) === 'EXPLICIT') {
    values.codeStressWallMm = resolveField(session, {
      field: 'section.codeStressWallMm', entity, unit: 'mm',
      value: finite(first([enriched.codeStressWallMm, attrs.CODE_STRESS_WALL_MM])),
      kind: RESOLUTION_KINDS.SOURCE_EXPLICIT,
      authority: 'SOURCE_CODE_STRESS_WALL', sourcePath: sourcePath(target, 'explicit code stress wall'),
      validate: positive('Explicit code-stress wall must be positive.'), affected: ['CODE_STRESS_SECTION'],
    });
  }

  const blocked = Object.values(values).filter((value) => value.status !== RESOLUTION_STATUSES.RESOLVED);
  const identity = identityFields(entity, target);
  if (blocked.length) return blockedRow(identity, dn, schedule, values, blocked);

  const d = values.dimensionsMm.value;
  const wallM = d.wallThicknessMm / 1000;
  const rule = values.codeStressWallRule.value;
  const sectionInput = {
    outsideDiameterM: d.outsideDiameterMm / 1000,
    nominalWallM: wallM, stiffnessWallM: wallM, weightWallM: wallM,
    corrosionAllowanceM: values.corrosionAllowanceMm.value / 1000,
    codeStressWallRule: rule,
    authority: {
      nominalWall: authority(values.dimensionsMm),
      stiffnessWall: `${authority(values.dimensionsMm)}:NOMINAL_WALL_FOR_STIFFNESS`,
      weightWall: `${authority(values.dimensionsMm)}:NOMINAL_WALL_FOR_WEIGHT`,
      codeStressWall: rule === 'EXPLICIT' ? authority(values.codeStressWallMm)
        : `${authority(values.codeStressWallRule)}:NOMINAL_MINUS_CORROSION`,
    },
  };
  if (rule === 'EXPLICIT') sectionInput.codeStressWallM = values.codeStressWallMm.value / 1000;
  let sectionStates;
  try { sectionStates = resolveSectionStates(sectionInput); }
  catch (error) {
    return freezeRow({ schema: POS_SECTION_MATERIAL_SCHEMA, status: 'BLOCKED_SECTION_INVALID', ...identity,
      nominalBoreMm: dn, schedule, sectionStates: null, material: null, resolutions: values,
      blockers: [{ field: 'section.states', status: 'BLOCKED_SECTION_INVALID', reason: String(error.message || error), diagnostics: [] }] });
  }
  const material = deepFreeze({
    family: values.materialFamily.value,
    elasticModulusPa: values.elasticModulusPa.value,
    poissonsRatio: values.poissonsRatio.value,
    densityKgM3: values.densityKgM3.value,
    thermalExpansionPerC: values.thermalExpansionPerC.value,
  });
  return freezeRow({
    schema: POS_SECTION_MATERIAL_SCHEMA, status: 'RESOLVED', ...identity,
    nominalBoreMm: dn, nps: d.nps, schedule,
    outsideDiameterMm: d.outsideDiameterMm, wallThicknessMm: d.wallThicknessMm,
    sectionStates, material,
    metalMassPerLengthKgM: sectionStates.weight.areaM2 * material.densityKgM3,
    resolutions: values, blockers: [],
  });
}

function resolveField(session, x) {
  return session.resolve({
    field: x.field, entity: x.entity, unit: x.unit,
    candidates: x.value == null || x.value === '' ? [] : [{
      kind: x.kind, value: x.value, authority: x.authority, sourcePath: x.sourcePath, reason: x.reason,
    }],
    sourceMissingReason: x.missing, validate: x.validate,
    affectedCalculations: x.affected || [],
  });
}
function materialNumber(session, entity, target, field, unit, value, label, affected) {
  return resolveField(session, { field, entity, unit, value: finite(value),
    kind: RESOLUTION_KINDS.SOURCE_EXPLICIT,
    authority: `SOURCE_${label.toUpperCase().replace(/\s+/g, '_')}`,
    sourcePath: sourcePath(target, label), validate: positive(`${label} must be positive.`), affected });
}
function scheduleCandidates(record, evidence) {
  if (!record || !evidence?.schedule) return [];
  return [{ kind: evidence.basis === 'SOURCE_EXPLICIT_SCHEDULE'
    ? RESOLUTION_KINDS.SOURCE_EXPLICIT : RESOLUTION_KINDS.SOURCE_INHERITED,
  value: evidence.schedule, authority: evidence.sourceName || evidence.basis,
  sourcePath: evidence.sourceField || evidence.sourceBranchPath || record.sourcePath, reason: evidence.basis }];
}
function buildEntity(target, attrs, enriched, projectId) {
  const e = target.edge; const r = target.record;
  const posId = e ? target.positionRef : String(first([enriched.posId, attrs.POS_ID, attrs.POSITION_ID, attrs.POS_NO, r?.name]) || target.positionRef);
  const entityId = e ? String(e.id || posId)
    : String(first([enriched.entityId, attrs.ENTITY_ID, attrs.ID, r?.sourcePath, posId]) || posId);
  return { entityId, posId,
    fromNode: e?.fromNode ?? first([attrs.FROM_NODE, attrs.FROM, enriched.fromNode]) ?? null,
    toNode: e?.toNode ?? first([attrs.TO_NODE, attrs.TO, enriched.toNode]) ?? null,
    scope: { entityId, posId, projectId: String(projectId ?? ''),
      lineId: String(e?.lineId ?? first([attrs.LINE_ID, attrs.LINE, enriched.lineId]) ?? ''),
      branchPath: r?.branchPath || 'SOURCE_RECORD_UNMATCHED',
      pipingClass: String(first([enriched.pipingClass, attrs.PIPING_CLASS, attrs.PCLS, attrs.CLASS]) ?? ''),
      componentType: e?.sourceType || r?.type || 'UNKNOWN' } };
}
function identityFields(entity, target) {
  const e = target.edge; const r = target.record;
  return { entityId: entity.entityId, posId: entity.posId,
    fromNode: entity.fromNode == null ? null : String(entity.fromNode),
    toNode: entity.toNode == null ? null : String(entity.toNode),
    branchName: r?.branchName || null, branchPath: r?.branchPath || null,
    sourcePath: r?.sourcePath || null, sourceRecordMatched: Boolean(r), sourceRecordName: r?.name || null,
    componentType: e?.sourceType || r?.type || null, componentName: e?.name || r?.name || target.positionRef,
    lineId: e?.lineId || null };
}
function blockedRow(identity, dn, schedule, values, blocked) {
  return freezeRow({ schema: POS_SECTION_MATERIAL_SCHEMA, status: blocked[0].status, ...identity,
    nominalBoreMm: dn, schedule, sectionStates: null, material: null, resolutions: values,
    blockers: blocked.map((x) => ({ field: x.field, status: x.status, reason: x.reason, diagnostics: x.diagnostics || [] })) });
}
function addScope(entity, additions) { return { ...entity,
  scope: Object.fromEntries(Object.entries({ ...entity.scope, ...additions }).filter(([, value]) => value != null && value !== '')) };
}
function freezeRow(value) { return deepFreeze({ ...value, semanticIdentity: semanticHash(value) }); }
function read(value) { return value?.status === RESOLUTION_STATUSES.RESOLVED ? value.value : null; }
function first(values) { return values.find((value) => value !== undefined && value !== null && value !== ''); }
function finite(value) { if (value == null || value === '') return null; const n = Number(value); return Number.isFinite(n) ? n : null; }
function positive(message) { return (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? true : message; }
function nonNegative(message) { return (value) => Number.isFinite(Number(value)) && Number(value) >= 0 ? true : message; }
function text(message) { return (value) => typeof value === 'string' && value.trim() ? true : message; }
function dimensions(value) { const od = Number(value?.outsideDiameterMm); const wall = Number(value?.wallThicknessMm);
  return od > 0 && wall > 0 && od > 2 * wall ? true : 'Pipe dimensions must define a positive annulus.'; }
function authority(value) { return `${value.kind}:${value.authority || value.sourcePath || 'UNSPECIFIED'}`; }
function sourcePath(target, label) { const r = target.record;
  return `${r?.sourcePath || r?.branchPath || r?.name || target.positionRef}:${label}`; }
