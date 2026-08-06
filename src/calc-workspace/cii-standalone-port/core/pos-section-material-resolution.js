import { getPipeDimensions } from '../../../core/geometry/pipeSchedules.js';
import {
  RESOLUTION_KINDS,
  RESOLUTION_STATUSES,
  createConfiguredResolutionSession,
} from '../../../core/empirical-piping-mechanics/configured-resolution.js';
import {
  deepFreeze,
} from '../../../core/empirical-piping-mechanics/contracts.js';
import { semanticHash } from '../../../core/empirical-piping-mechanics/identity.js';
import { resolveSectionStates } from '../../../core/empirical-piping-mechanics/section.js';
import {
  buildBranchScheduleIndex,
  resolveNominalBoreMm,
} from './branch-schedule-resolution.js';

export const POS_SECTION_MATERIAL_SCHEMA = 'empirical-pos-section-material-state/v1';
export const POS_SECTION_MATERIAL_RECEIPT_SCHEMA = 'empirical-pos-section-material-receipt/v1';

const SECTION_BEARING_TYPE = /^(PIPE|ELBO|BEND|FLAN|VALV|GASK|OLET|REDU|TEE|COUP|CAP|INST)$/;

/**
 * Resolves one common POS section/material state for weight, stiffness,
 * displacement and stress. No calculation consumer is allowed to re-resolve
 * OD, wall, schedule, material, E, density, alpha or corrosion allowance.
 */
export function resolvePosSectionMaterialStates(input) {
  if (!input?.sourceRoot) throw new TypeError('sourceRoot is required.');
  const session = createConfiguredResolutionSession({
    projectDataRevision: input.projectDataRevision ?? 0,
    projectDataSemanticHash: input.projectDataSemanticHash ?? null,
    defaults: input.configuredDefaults ?? [],
  });
  const scheduleIndex = buildBranchScheduleIndex(input.sourceRoot);
  const rows = [];

  for (const record of scheduleIndex.items) {
    if (!isSectionBearingRecord(record)) continue;
    rows.push(resolveRecord(record, scheduleIndex.resolutions.get(record), session, input.projectId ?? null));
  }

  const resolutionReceipt = session.receipt();
  const blockedRows = rows.filter((row) => row.status !== 'RESOLVED');
  const resolvedRows = rows.filter((row) => row.status === 'RESOLVED');
  const result = {
    schema: POS_SECTION_MATERIAL_RECEIPT_SCHEMA,
    status: blockedRows.length === 0
      ? (resolutionReceipt.summary.configuredDefaultApplicationCount > 0
        ? 'CALCULATED_WITH_CONFIGURED_DEFAULTS'
        : 'CALCULATED_SOURCE_ONLY')
      : 'BLOCKED_MISSING_REQUIRED_INPUT',
    rows: Object.freeze(rows),
    resolvedRowCount: resolvedRows.length,
    blockedRowCount: blockedRows.length,
    branchScheduleSummary: scheduleIndex.summary,
    resolutionReceipt,
  };
  return deepFreeze({ ...result, semanticIdentity: semanticHash(result) });
}

function resolveRecord(record, scheduleEvidence, session, projectId) {
  const attrs = {
    ...(record.item.engineeringProperties || {}),
    ...(record.item.attributes || {}),
  };
  const enriched = record.item.enrichedAttributes || {};
  const entity = buildEntity(record, attrs, enriched, projectId);
  const resolutions = {};

  resolutions.nominalBoreMm = session.resolve({
    field: 'section.nominalBoreMm',
    entity,
    unit: 'mm',
    candidates: candidateList([
      sourceCandidate(RESOLUTION_KINDS.SOURCE_EXPLICIT, resolveNominalBoreMm(record.item), {
        authority: 'SOURCE_NOMINAL_BORE',
        sourcePath: firstSourcePath(record, 'nominal bore'),
      }),
    ]),
    validate: positiveFinite('Nominal bore must be positive.'),
    affectedCalculations: ['SECTION_LOOKUP', 'WEIGHT', 'STIFFNESS', 'STRESS'],
  });

  resolutions.schedule = session.resolve({
    field: 'section.schedule',
    entity: withScope(entity, {
      nominalBoreMm: resolvedValue(resolutions.nominalBoreMm),
    }),
    candidates: scheduleCandidates(record, scheduleEvidence),
    validate: nonEmptyString('Schedule must be a non-empty string.'),
    sourceMissingReason: scheduleEvidence?.status || 'SOURCE_SCHEDULE_UNRESOLVED',
    affectedCalculations: ['SECTION_LOOKUP', 'WEIGHT', 'STIFFNESS', 'STRESS'],
  });

  const nominalBoreMm = resolvedValue(resolutions.nominalBoreMm);
  const schedule = resolvedValue(resolutions.schedule);
  const dimensions = nominalBoreMm != null && schedule != null
    ? getPipeDimensions(nominalBoreMm, schedule)
    : null;
  const dimensionValue = dimensions?.exact
    ? { outsideDiameterMm: dimensions.od, wallThicknessMm: dimensions.wt, nps: dimensions.nps }
    : null;

  resolutions.dimensionsMm = session.resolve({
    field: 'section.dimensionsMm',
    entity: withScope(entity, { nominalBoreMm, schedule }),
    unit: 'mm',
    candidates: candidateList([
      sourceCandidate(RESOLUTION_KINDS.CONFIGURED_DERIVATION, dimensionValue, {
        authority: dimensions?.source?.id || 'ENGINEERING_PIPE_SCHEDULE_DATASET',
        sourcePath: `getPipeDimensions(DN=${nominalBoreMm}, schedule=${schedule})`,
        reason: 'Exact schedule-dataset lookup from the resolved nominal bore and schedule.',
      }),
    ]),
    validate: validDimensions,
    sourceMissingReason: dimensions?.diagnostics?.map((row) => row.code).join(',') || 'PIPE_DIMENSION_LOOKUP_UNRESOLVED',
    affectedCalculations: ['SECTION_PROPERTIES', 'WEIGHT', 'STIFFNESS', 'STRESS'],
  });

  resolutions.materialFamily = session.resolve({
    field: 'material.family',
    entity,
    candidates: candidateList([
      sourceCandidate(RESOLUTION_KINDS.SOURCE_EXPLICIT, firstDeclared([
        enriched.materialFamily,
        enriched.material,
        attrs.MATERIAL_FAMILY,
        attrs.MATERIAL,
        attrs.MATL,
      ]), {
        authority: 'SOURCE_MATERIAL',
        sourcePath: firstSourcePath(record, 'material'),
      }),
    ]),
    validate: nonEmptyString('Material family must be a non-empty string.'),
    affectedCalculations: ['MATERIAL_PROPERTIES', 'WEIGHT', 'STIFFNESS', 'STRESS'],
  });

  const materialFamily = resolvedValue(resolutions.materialFamily);
  const materialEntity = withScope(entity, {
    materialFamily,
    temperatureC: finiteOrNull(firstDeclared([
      enriched.operatingTemperatureC,
      attrs.OPERATING_TEMPERATURE_C,
      attrs.TEMPERATURE_C,
    ])),
  });

  resolutions.elasticModulusPa = session.resolve({
    field: 'material.elasticModulusPa',
    entity: materialEntity,
    unit: 'Pa',
    candidates: candidateList([
      sourceCandidate(RESOLUTION_KINDS.SOURCE_EXPLICIT, finiteOrNull(firstDeclared([
        enriched.elasticModulusPa,
        attrs.ELASTIC_MODULUS_PA,
        attrs.MODULUS_PA,
      ])), {
        authority: 'SOURCE_ELASTIC_MODULUS_PA',
        sourcePath: firstSourcePath(record, 'elastic modulus'),
      }),
    ]),
    validate: positiveFinite('Elastic modulus must be positive.'),
    affectedCalculations: ['EA', 'EI', 'THERMAL_REACTION', 'P_DELTA'],
  });

  resolutions.poissonsRatio = session.resolve({
    field: 'material.poissonsRatio',
    entity: materialEntity,
    unit: 'ratio',
    candidates: candidateList([
      sourceCandidate(RESOLUTION_KINDS.SOURCE_EXPLICIT, finiteOrNull(firstDeclared([
        enriched.poissonsRatio,
        attrs.POISSONS_RATIO,
      ])), {
        authority: 'SOURCE_POISSONS_RATIO',
        sourcePath: firstSourcePath(record, 'Poisson ratio'),
      }),
    ]),
    validate: (value) => Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) < 0.5
      ? true : 'Poisson ratio must be greater than zero and less than 0.5.',
    affectedCalculations: ['SHEAR_MODULUS', 'TORSIONAL_STIFFNESS'],
  });

  resolutions.densityKgM3 = session.resolve({
    field: 'material.densityKgM3',
    entity: materialEntity,
    unit: 'kg/m3',
    candidates: candidateList([
      sourceCandidate(RESOLUTION_KINDS.SOURCE_EXPLICIT, finiteOrNull(firstDeclared([
        enriched.materialDensityKgM3,
        attrs.MATERIAL_DENSITY_KG_M3,
      ])), {
        authority: 'SOURCE_MATERIAL_DENSITY',
        sourcePath: firstSourcePath(record, 'material density'),
      }),
    ]),
    validate: positiveFinite('Material density must be positive.'),
    affectedCalculations: ['PIPE_METAL_MASS', 'SUSTAINED_WEIGHT'],
  });

  resolutions.thermalExpansionPerC = session.resolve({
    field: 'material.thermalExpansionPerC',
    entity: materialEntity,
    unit: '1/C',
    candidates: candidateList([
      sourceCandidate(RESOLUTION_KINDS.SOURCE_EXPLICIT, finiteOrNull(firstDeclared([
        enriched.thermalExpansionPerC,
        enriched.meanThermalExpansionPerC,
        attrs.THERMAL_EXPANSION_PER_C,
      ])), {
        authority: 'SOURCE_THERMAL_EXPANSION',
        sourcePath: firstSourcePath(record, 'thermal expansion'),
      }),
    ]),
    validate: positiveFinite('Thermal expansion coefficient must be positive.'),
    affectedCalculations: ['THERMAL_STRAIN', 'THERMAL_DISPLACEMENT', 'THERMAL_REACTION'],
  });

  resolutions.corrosionAllowanceMm = session.resolve({
    field: 'section.corrosionAllowanceMm',
    entity,
    unit: 'mm',
    candidates: candidateList([
      sourceCandidate(RESOLUTION_KINDS.SOURCE_EXPLICIT, finiteOrNull(firstDeclared([
        enriched.corrosionAllowanceMm,
        attrs.CORROSION_ALLOWANCE_MM,
      ])), {
        authority: 'SOURCE_CORROSION_ALLOWANCE',
        sourcePath: firstSourcePath(record, 'corrosion allowance'),
      }),
    ]),
    validate: nonNegativeFinite('Corrosion allowance must be zero or positive.'),
    affectedCalculations: ['CODE_STRESS_SECTION'],
  });

  resolutions.codeStressWallRule = session.resolve({
    field: 'section.codeStressWallRule',
    entity,
    candidates: candidateList([
      sourceCandidate(RESOLUTION_KINDS.SOURCE_EXPLICIT, firstDeclared([
        enriched.codeStressWallRule,
        attrs.CODE_STRESS_WALL_RULE,
      ]), {
        authority: 'SOURCE_CODE_STRESS_WALL_RULE',
        sourcePath: firstSourcePath(record, 'code stress wall rule'),
      }),
    ]),
    validate: (value) => ['EXPLICIT', 'NOMINAL_MINUS_CORROSION'].includes(value)
      ? true : 'Code-stress wall rule must be EXPLICIT or NOMINAL_MINUS_CORROSION.',
    affectedCalculations: ['CODE_STRESS_SECTION'],
  });

  if (resolvedValue(resolutions.codeStressWallRule) === 'EXPLICIT') {
    resolutions.codeStressWallMm = session.resolve({
      field: 'section.codeStressWallMm',
      entity,
      unit: 'mm',
      candidates: candidateList([
        sourceCandidate(RESOLUTION_KINDS.SOURCE_EXPLICIT, finiteOrNull(firstDeclared([
          enriched.codeStressWallMm,
          attrs.CODE_STRESS_WALL_MM,
        ])), {
          authority: 'SOURCE_CODE_STRESS_WALL',
          sourcePath: firstSourcePath(record, 'explicit code stress wall'),
        }),
      ]),
      validate: positiveFinite('Explicit code-stress wall must be positive.'),
      affectedCalculations: ['CODE_STRESS_SECTION'],
    });
  }

  const blocked = Object.values(resolutions).filter((resolution) => resolution.status !== RESOLUTION_STATUSES.RESOLVED);
  if (blocked.length > 0) {
    return freezeRow({
      schema: POS_SECTION_MATERIAL_SCHEMA,
      status: blocked[0].status,
      ...identityFields(entity, record),
      nominalBoreMm,
      schedule,
      sectionStates: null,
      material: null,
      resolutions,
      blockers: blocked.map((resolution) => ({
        field: resolution.field,
        status: resolution.status,
        reason: resolution.reason,
        diagnostics: resolution.diagnostics || [],
      })),
    });
  }

  const resolvedDimensions = resolutions.dimensionsMm.value;
  const wallM = resolvedDimensions.wallThicknessMm / 1000;
  const corrosionAllowanceM = resolutions.corrosionAllowanceMm.value / 1000;
  const codeStressWallRule = resolutions.codeStressWallRule.value;
  const sectionInput = {
    outsideDiameterM: resolvedDimensions.outsideDiameterMm / 1000,
    nominalWallM: wallM,
    stiffnessWallM: wallM,
    weightWallM: wallM,
    corrosionAllowanceM,
    codeStressWallRule,
    authority: {
      nominalWall: authorityLabel(resolutions.dimensionsMm),
      stiffnessWall: `${authorityLabel(resolutions.dimensionsMm)}:NOMINAL_WALL_FOR_STIFFNESS`,
      weightWall: `${authorityLabel(resolutions.dimensionsMm)}:NOMINAL_WALL_FOR_WEIGHT`,
      codeStressWall: codeStressWallRule === 'EXPLICIT'
        ? authorityLabel(resolutions.codeStressWallMm)
        : `${authorityLabel(resolutions.codeStressWallRule)}:NOMINAL_MINUS_CORROSION`,
    },
  };
  if (codeStressWallRule === 'EXPLICIT') {
    sectionInput.codeStressWallM = resolutions.codeStressWallMm.value / 1000;
  }
  let sectionStates;
  try {
    sectionStates = resolveSectionStates(sectionInput);
  } catch (error) {
    return freezeRow({
      schema: POS_SECTION_MATERIAL_SCHEMA,
      status: 'BLOCKED_SECTION_INVALID',
      ...identityFields(entity, record),
      nominalBoreMm,
      schedule,
      sectionStates: null,
      material: null,
      resolutions,
      blockers: [{
        field: 'section.states',
        status: 'BLOCKED_SECTION_INVALID',
        reason: error instanceof Error ? error.message : String(error),
        diagnostics: [],
      }],
    });
  }
  const material = deepFreeze({
    family: materialFamily,
    elasticModulusPa: resolutions.elasticModulusPa.value,
    poissonsRatio: resolutions.poissonsRatio.value,
    densityKgM3: resolutions.densityKgM3.value,
    thermalExpansionPerC: resolutions.thermalExpansionPerC.value,
  });

  return freezeRow({
    schema: POS_SECTION_MATERIAL_SCHEMA,
    status: 'RESOLVED',
    ...identityFields(entity, record),
    nominalBoreMm,
    nps: resolvedDimensions.nps,
    schedule,
    outsideDiameterMm: resolvedDimensions.outsideDiameterMm,
    wallThicknessMm: resolvedDimensions.wallThicknessMm,
    sectionStates,
    material,
    metalMassPerLengthKgM: sectionStates.weight.areaM2 * material.densityKgM3,
    resolutions,
    blockers: [],
  });
}

function scheduleCandidates(record, evidence) {
  if (!evidence?.schedule) return [];
  const kind = evidence.basis === 'SOURCE_EXPLICIT_SCHEDULE'
    ? RESOLUTION_KINDS.SOURCE_EXPLICIT
    : RESOLUTION_KINDS.SOURCE_INHERITED;
  return [sourceCandidate(kind, evidence.schedule, {
    authority: evidence.sourceName || evidence.basis,
    sourcePath: evidence.sourceField || evidence.sourceBranchPath || record.sourcePath,
    reason: evidence.basis,
  })];
}

function buildEntity(record, attrs, enriched, projectId) {
  const posId = String(firstDeclared([
    enriched.posId,
    attrs.POS_ID,
    attrs.POSITION_ID,
    attrs.POS_NO,
    record.name,
  ]) ?? record.name);
  const entityId = String(firstDeclared([
    enriched.entityId,
    attrs.ENTITY_ID,
    attrs.ID,
    record.sourcePath,
    posId,
  ]) ?? posId);
  const fromNode = firstDeclared([attrs.FROM_NODE, attrs.FROM, enriched.fromNode]);
  const toNode = firstDeclared([attrs.TO_NODE, attrs.TO, enriched.toNode]);
  return {
    entityId,
    posId,
    fromNode: fromNode == null ? null : String(fromNode),
    toNode: toNode == null ? null : String(toNode),
    scope: {
      entityId,
      posId,
      projectId: projectId == null ? '' : String(projectId),
      lineId: String(firstDeclared([attrs.LINE_ID, attrs.LINE, enriched.lineId]) ?? ''),
      branchPath: record.branchPath,
      pipingClass: String(firstDeclared([
        enriched.pipingClass,
        attrs.PIPING_CLASS,
        attrs.PCLS,
        attrs.CLASS,
      ]) ?? ''),
      componentType: record.type,
    },
  };
}

function withScope(entity, additions) {
  return {
    ...entity,
    scope: Object.fromEntries(Object.entries({ ...entity.scope, ...additions })
      .filter(([, value]) => value !== null && value !== undefined && value !== '')),
  };
}

function identityFields(entity, record) {
  return {
    entityId: entity.entityId,
    posId: entity.posId,
    fromNode: entity.fromNode,
    toNode: entity.toNode,
    branchName: record.branchName,
    branchPath: record.branchPath,
    sourcePath: record.sourcePath,
    componentType: record.type,
    componentName: record.name,
  };
}

function freezeRow(value) {
  const result = { ...value };
  return deepFreeze({ ...result, semanticIdentity: semanticHash(result) });
}

function isSectionBearingRecord(record) {
  return SECTION_BEARING_TYPE.test(record.type) || Number.isFinite(record.nominalBoreMm);
}

function sourceCandidate(kind, value, evidence) {
  return { kind, value, ...evidence };
}

function candidateList(candidates) {
  return candidates.filter((candidate) => candidate.value !== undefined && candidate.value !== null && candidate.value !== '');
}

function resolvedValue(resolution) {
  return resolution?.status === RESOLUTION_STATUSES.RESOLVED ? resolution.value : null;
}

function firstDeclared(values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function finiteOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveFinite(message) {
  return (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? true : message;
}

function nonNegativeFinite(message) {
  return (value) => Number.isFinite(Number(value)) && Number(value) >= 0 ? true : message;
}

function nonEmptyString(message) {
  return (value) => typeof value === 'string' && value.trim() !== '' ? true : message;
}

function validDimensions(value) {
  if (!value || typeof value !== 'object') return 'Pipe dimensions must be an object.';
  const od = Number(value.outsideDiameterMm);
  const wall = Number(value.wallThicknessMm);
  if (!(od > 0) || !(wall > 0) || !(od > 2 * wall)) {
    return 'Pipe dimensions must define a positive annulus.';
  }
  return true;
}

function authorityLabel(resolution) {
  return `${resolution.kind}:${resolution.authority || resolution.sourcePath || 'UNSPECIFIED'}`;
}

function firstSourcePath(record, label) {
  return `${record.sourcePath || record.branchPath || record.name}:${label}`;
}
