import {
  buildSupportLoadInput,
  calculateSupportLoads,
  DEFAULT_SUPPORT_LOAD_PROFILE,
  SUPPORT_LOAD_FORMULA_PROFILE_ID,
} from '../calc-workspace/supportLoadEngine.js';
import {
  createSolverResultContract,
  ENGINEERING_LEVEL,
} from '../core/solvers/certification/solverResultContract.js';
import { createInputField, hasOverride } from './analysis-input-evidence.js';
import { resolvePipeEntity, toSupportLoadSource } from './analysis-context.js';

export const SUPPORT_LOAD_CAPABILITY_ID = 'support-load';

const OVERRIDE_SOURCE_KEYS = Object.freeze({
  pipeOdMm: 'PIPE_OD',
  wallThicknessMm: 'WALL_THICKNESS_MM',
  unitPipeWtKgPerM: 'UNIT_PIPE_WEIGHT_KG_PER_M',
  fluidWtOpeKgPerM: 'FLUID_WT_OPE_KG_M',
  fluidWtHydKgPerM: 'FLUID_WT_HYD_KG_M',
  insulationThicknessMm: 'INSULATION_THICKNESS_MM',
  insulationDensityKgM3: 'INSULATION_DENSITY_KG_M3',
  tempExpC1: 'TEMP_EXP_C1',
  autoSpanMm: 'AUTO_SPAN_MM',
  depSpanMm: 'DEP_SPAN_MM',
  lumpWeightKg: 'COMPONENT_WEIGHT_KG',
});

const FIELD_SPECS = Object.freeze([
  ['pipeOdMm', 'Pipe outside diameter', 'mm', 'identity.pipeOdMm', 'positive'],
  ['wallThicknessMm', 'Wall thickness', 'mm', 'pipePhysical.wallThicknessMm', 'positive'],
  ['unitPipeWtKgPerM', 'Unit pipe weight', 'kg/m', 'pipePhysical.unitPipeWtKgPerM', 'positive'],
  ['fluidWtOpeKgPerM', 'Operating fluid weight', 'kg/m', 'process.fluidWtOpeKgPerM', 'non-negative'],
  ['fluidWtHydKgPerM', 'Hydrotest fluid weight', 'kg/m', 'process.fluidWtHydKgPerM', 'non-negative'],
  ['insulationThicknessMm', 'Insulation thickness', 'mm', 'pipePhysical.insulationThicknessMm', 'non-negative'],
  ['insulationDensityKgM3', 'Insulation density', 'kg/m³', 'pipePhysical.insulationDensityKgM3', 'positive'],
  ['tempExpC1', 'Operating temperature', '°C', 'process.tempExpC1', ''],
  ['autoSpanMm', 'Automatic support span', 'mm', 'spans.autoSpanMm', 'positive'],
  ['depSpanMm', 'Dependent support span', 'mm', 'spans.depSpanMm', 'positive'],
  ['lumpWeightKg', 'Concentrated component weight', 'kg', 'pipePhysical.lumpWeightKg', 'non-negative'],
]);

export const supportLoadCapability = Object.freeze({
  id: SUPPORT_LOAD_CAPABILITY_ID,
  label: 'Support load screening',
  description: 'Calculates vertical, guide, and line-stop screening loads from explicit pipe data.',
  engineeringLevel: ENGINEERING_LEVEL.BENCHMARKED_SCREENING,
  manifest: Object.freeze({
    solverId: 'workspace-support-load-screening',
    solverVersion: '1.0.0',
    methodId: SUPPORT_LOAD_FORMULA_PROFILE_ID,
    methodVersion: '1',
    codeBasis: ['Visible project screening profile ACCESS_TEMP_WALL_WEIGHTED_V1'],
    assumptions: [
      'Distributed pipe, fluid, and insulation weights act over the resolved support span.',
      'Concentrated component weight is applied as a lump load when explicitly available.',
    ],
    limitations: [
      'Screening loads are not a global pipe-stress restraint solution.',
      'Friction, gaps, nonlinear restraint behavior, wind, seismic, slug, surge, and relief loads are excluded.',
    ],
  }),

  applicability(context) {
    const pipeEntity = resolvePipeEntity(context);
    return pipeEntity && isStraightPipe(pipeEntity)
      ? { applicable: true, reason: '' }
      : { applicable: false, reason: 'Support-load screening requires a selected straight pipe or a support linked unambiguously to one straight pipe.' };
  },

  evaluate(context) {
    return supportReadiness(prepareSupportLoad(context));
  },

  inspect(context) {
    const prepared = prepareSupportLoad(context);
    const readiness = supportReadiness(prepared);
    if (!prepared.input) return { fields: [], readiness };
    return {
      fields: FIELD_SPECS.map(([key, label, unit, path, validation]) => inputField(
        context,
        prepared.input,
        { key, label, unit, path, validation },
      )),
      readiness,
    };
  },

  execute(context) {
    const prepared = prepareSupportLoad(context);
    if (!prepared.pipeEntity || !prepared.input) {
      throw new Error('Support-load execution requires a linked pipe entity.');
    }
    const result = calculateSupportLoads(prepared.input, '');
    const status = result.status.calculated ? 'CALCULATED' : 'BLOCKED';
    return createSolverResultContract({
      moduleId: 'analysis-workspace-support-load',
      methodId: SUPPORT_LOAD_FORMULA_PROFILE_ID,
      formulaIds: [
        'SUPPORT_LOAD_VERTICAL_WEIGHTED',
        'SUPPORT_LOAD_GUIDE_SCREENING',
        'SUPPORT_LOAD_LINE_STOP_SCREENING',
      ],
      engineeringLevel: ENGINEERING_LEVEL.BENCHMARKED_SCREENING,
      status,
      input: prepared.input,
      results: result,
      warnings: result.status.missing.map((field) => `Missing input: ${field}`),
      meta: {
        requestedTargetId: context.targetId,
        sourcePipeId: prepared.pipeEntity.entityId,
        formulaProfileId: DEFAULT_SUPPORT_LOAD_PROFILE.profileId,
        analysisSessionId: context.analysisSession?.sessionId || '',
      },
      summary: {
        sourcePipeId: prepared.pipeEntity.entityId,
        calculated: result.status.calculated,
        blocked: result.status.blocked,
        missingCount: result.status.missing.length,
      },
    });
  },
});

function prepareSupportLoad(context) {
  const pipeEntity = resolvePipeEntity(context);
  if (!pipeEntity) return { pipeEntity: null, input: null };
  const source = applyOverrides(toSupportLoadSource(pipeEntity), context.analysisSession?.overrides || {});
  return {
    pipeEntity,
    input: buildSupportLoadInput(source, DEFAULT_SUPPORT_LOAD_PROFILE),
  };
}

function supportReadiness(prepared) {
  if (!prepared.pipeEntity) {
    return {
      enabled: false,
      reason: 'No unambiguous pipe is linked to this selection.',
      missing: ['linkedPipe'],
    };
  }
  const readiness = prepared.input.readiness;
  const enabled = readiness.readyForOpeVertical
    || readiness.readyForHydVertical
    || readiness.readyForGuide
    || readiness.readyForLineStop;
  return {
    enabled,
    reason: enabled ? '' : `Support-load inputs are incomplete: ${readiness.missing.join(', ')}.`,
    missing: readiness.missing,
  };
}

function applyOverrides(source, overrides) {
  const sourceAttributes = { ...(source.sourceAttributes || {}) };
  Object.entries(OVERRIDE_SOURCE_KEYS).forEach(([key, sourceKey]) => {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) sourceAttributes[sourceKey] = overrides[key];
  });
  return { ...source, sourceAttributes };
}

function inputField(context, input, spec) {
  const value = valueAtPath(input, spec.path);
  const overridden = hasOverride(context, spec.key);
  const derived = !overridden && isDerivedInput(input, spec.path);
  const required = spec.key === 'lumpWeightKg'
    ? input.pipePhysical.componentWeightRequired === true
    : true;
  return createInputField({
    key: spec.key,
    label: spec.label,
    unit: spec.unit,
    value,
    required,
    source: overridden ? 'override' : value == null ? 'missing' : derived ? 'derived' : 'source',
    sourcePath: overridden ? `analysisSession.overrides.${spec.key}` : spec.path,
    validation: spec.validation,
  });
}

function isDerivedInput(input, path) {
  if (path === 'spans.autoSpanMm' || path === 'spans.depSpanMm') return true;
  return (input.audit || []).some((row) => row.source === 'DETERMINISTIC_DERIVATION' && row.field === path);
}

function isStraightPipe(entity) {
  return String(entity?.entityType || '').trim().toUpperCase() === 'PIPE';
}

function valueAtPath(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value) ?? null;
}
