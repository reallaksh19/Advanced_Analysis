/**
 * Functionality: builds support-load input records from imported workspace
 * objects and evaluates the Access temperature/wall weighted formulas as pure
 * deterministic functions. Parameters: cloned workspace dataset objects and
 * optional evaluated timestamp. Outputs: per-pipe input records, calculated
 * support-load results, summary counts, and audit diagnostics. Fallback:
 * missing source data blocks only the affected calculated fields.
 */

import {
  clonePlain,
  freezeDeep,
  isPipeLikeType,
  numberMaybe,
  readObjectEndpoints,
  stringValue,
  workspaceObjects,
} from './workspaceModel.js';

export const SUPPORT_LOAD_INPUT_SCHEMA = 'support-load-input/v1';
export const SUPPORT_LOAD_RESULT_SCHEMA = 'support-load-results/v1';
export const SUPPORT_LOAD_FORMULA_PROFILE_ID = 'ACCESS_TEMP_WALL_WEIGHTED_V1';

export const DEFAULT_SUPPORT_LOAD_PROFILE = Object.freeze({
  profileId: SUPPORT_LOAD_FORMULA_PROFILE_ID,
  configSource: 'visible-editable-config',
  gravityFactor: 9.80665,
  verticalLoadFactor: 1,
  roundMajor: 100,
  roundStep: 50,
  roundMode: 'up',
  guideTemperatureMultiplier: 0.1,
  guideSpanLoadMultiplier: 0.3,
  guideWallReferenceMm: 6.3,
  guideTempDivisor: 100,
  guideDivisor: 1.23,
  guideMinimumOpeVerticalFactor: 0.3,
  lineStopScale: 1000,
  lineStopCoefficient: 0.0209,
  lineStopPi: 3.14,
  lineStopSectionDivisor: 32,
  lineStopExponent: 0.5079,
  lineStopTempDivisor: 100,
  lineStopDivisor: 1.23,
  lineStopIdExpression: 'D_MINUS_2WT',
});

const SUPPORT_LOAD_PROFILE_NUMERIC_KEYS = Object.freeze([
  'gravityFactor',
  'verticalLoadFactor',
  'roundMajor',
  'roundStep',
  'guideTemperatureMultiplier',
  'guideSpanLoadMultiplier',
  'guideWallReferenceMm',
  'guideTempDivisor',
  'guideDivisor',
  'guideMinimumOpeVerticalFactor',
  'lineStopScale',
  'lineStopCoefficient',
  'lineStopPi',
  'lineStopSectionDivisor',
  'lineStopExponent',
  'lineStopTempDivisor',
  'lineStopDivisor',
]);

export const SUPPORT_LOAD_FORMULA_TEXT = [
  'OPE_V = (PipeWt + FluidWt_OPE + InsulationWt) * SpanM * visibleGravity * visibleLoadFactor + ComponentKg * visibleGravity * visibleLoadFactor',
  'HYD uses explicit HYD density/weight only. HYD never copies OPE.',
  'Guide = max(GetRoundedNum(0.1 * 0.3 * OPE_V * (Wall / 6.3) * (TempfnC(T1) / 100) / 1.23), 0.3 * OPE_V)',
  'LineStop = GetRoundedNum(1000 * 0.0209 * ((3.14 / 32) * (Dia^4 - (Dia - 2*Wall)^4) / Dia)^0.5079 * (TempfnC(T1) / 100) / 1.23)',
  '',
  'TempfnC(T) = ASME B31.3 carbon steel Sh/Sc ratio interpolated from:',
  '  [ 0°C→1.00,  50°C→1.00, 100°C→1.00, 150°C→0.97,',
  '   200°C→0.93, 250°C→0.89, 300°C→0.85, 350°C→0.81,',
  '   400°C→0.76, 450°C→0.71, 500°C→0.63 ]',
  'Returns stress-ratio × 100 so formula divisor of 100 normalises back to ratio.',
].join('\n');

export function buildSupportLoadModel(workspace, evaluatedAt, profileOverrides) {
  const profile = normalizeSupportLoadProfile(profileOverrides);
  const objects = workspaceObjects(workspace);
  const pipeInputs = objects.filter((object) => isPipeLikeType(object?.type)).map((object) => buildSupportLoadInput(object, profile));
  const resultsByPipeId = {};
  pipeInputs.forEach((input) => {
    resultsByPipeId[input.sourceObjectId] = calculateSupportLoads(input, evaluatedAt, profile);
  });
  const calculatedCount = Object.values(resultsByPipeId).filter((result) => result.status.calculated).length;
  const blockedResults = Object.values(resultsByPipeId).filter((result) => result.status.blocked);
  return freezeDeep({
    schema: 'calculation-workspace-support-load/v1',
    evaluatedAt: stringValue(evaluatedAt),
    inputsByPipeId: Object.fromEntries(pipeInputs.map((input) => [input.sourceObjectId, input])),
    resultsByPipeId,
    summary: {
      pipes: pipeInputs.length,
      readyVertical: pipeInputs.filter((input) => input.readiness.readyForVertical).length,
      readyGuide: pipeInputs.filter((input) => input.readiness.readyForGuide).length,
      readyLineStop: pipeInputs.filter((input) => input.readiness.readyForLineStop).length,
      calculated: calculatedCount,
      blocked: pipeInputs.length - calculatedCount,
    },
    profile,
    formulaText: SUPPORT_LOAD_FORMULA_TEXT,
    logs: buildCalculationLogs(pipeInputs, resultsByPipeId, blockedResults),
  });
}

export function buildSupportLoadInput(pipe, profileLike) {
  const profile = normalizeSupportLoadProfile(profileLike);
  const sourceAttributes = pipe?.sourceAttributes || {};
  const enrichment = pipe?.attributes?.enrichment || {};
  const lineList = enrichment.lineList || {};
  const pipingClass = enrichment.pipingClass || {};
  const material = enrichment.material || {};
  const weight = enrichment.weight || {};
  const endpoints = readObjectEndpoints(pipe);
  const pipeOdMm = firstNumber(
    pipe?.pipeOdMm,
    pipe?.odMm,
    pipingClass.pipeOdMm,
    lineList.pipeOdMm,
    fieldValue(sourceAttributes, ['PIPE_OD', 'PIPEOD', 'OD_MM', 'OD', 'DIA', 'DIAMETER', 'BORE']),
  );
  const wallThicknessMm = firstNumber(
    pipingClass.wallThicknessMm,
    pipingClass.wall,
    pipe?.wallThicknessMm,
    fieldValue(sourceAttributes, ['WALL_THICK', 'WALL_THICKNESS_MM', 'WALL_THICKNESS', 'WT_MM', 'THK_MM']),
  );
  const insideDiameterMm = pipeOdMm !== null && wallThicknessMm !== null ? round3(pipeOdMm - 2 * wallThicknessMm) : null;
  const materialDensityKgM3 = firstNumber(
    material.materialDensityKgM3,
    pipe?.materialDensityKgM3,
    fieldValue(sourceAttributes, ['MATERIAL_DENSITY_KG_M3', 'DENSITY_KG_M3']),
  );
  const unitPipeWtKgPerM = resolveUnitPipeWeight(weight, pipe, sourceAttributes, pipeOdMm, insideDiameterMm, materialDensityKgM3);
  const fluidDensityOpeKgM3 = firstNumber(
    lineList.fluidDensityKgM3,
    lineList.fluidDensityOpeKgM3,
    lineList.density,
    pipe?.fluidDensityOpeKgM3,
    fieldValue(sourceAttributes, ['FLUID_DENSITY_OPE_KG_M3', 'DENSITY_MIXED', 'DENSITY']),
  );
  const fluidDensityHydKgM3 = firstNumber(
    lineList.fluidDensityHydKgM3,
    lineList.hydroFluidDensityKgM3,
    pipe?.fluidDensityHydKgM3,
    fieldValue(sourceAttributes, ['FLUID_DENSITY_HYD_KG_M3', 'HYD_DENSITY_KG_M3', 'HYDRO_DENSITY']),
  );
  const fluidWtOpeKgPerM = firstNumber(
    pipe?.fluidWtOpeKgPerM,
    fieldValue(sourceAttributes, ['FLUID_WT_OPE_KG_M', 'FLUIDWT_KG_M']),
    deriveFluidWeight(insideDiameterMm, fluidDensityOpeKgM3),
  );
  const fluidWtHydKgPerM = firstNumber(
    pipe?.fluidWtHydKgPerM,
    fieldValue(sourceAttributes, ['FLUID_WT_HYD_KG_M', 'HYD_FLUIDWT_KG_M']),
    deriveFluidWeight(insideDiameterMm, fluidDensityHydKgM3),
  );
  const autoSpanMm = firstNumber(pipe?.autoSpanMm, fieldValue(sourceAttributes, ['AUTOSPAN_MM', 'AUTO_SPAN_MM']), endpoints.lengthMm);
  const depSpanMm = firstNumber(pipe?.depSpanMm, fieldValue(sourceAttributes, ['DEP_SPAN', 'DEP_SPAN_MM', 'DEPSPAN_MM']), endpoints.lengthMm);

  // --- Component weights (valves, flanges, tees — lump-sum kg) ---
  const rigidWeightKg = firstNumber(
    weight.rigidWeightKg,
    pipe?.rigidWeightKg,
    fieldValue(sourceAttributes, ['RIGID_WEIGHT_KG', 'COMPONENT_WEIGHT_KG', 'VALVE_WEIGHT_KG']),
  );
  const componentWeightKg = firstNumber(
    weight.componentWeightKg,
    weight.bestWeightKg,
    pipe?.componentWeightKg,
    fieldValue(sourceAttributes, ['COMPONENT_WEIGHT_KG', 'INLINE_WEIGHT_KG']),
  );
  // Total concentrated lump weight for this element (prefer rigidWeightKg, fall back to componentWeightKg)
  const lumpWeightKg = firstNumber(rigidWeightKg, componentWeightKg);

  // Insulation uses explicit thickness and density only. Missing data blocks
  // the affected load case; no density default is applied.
  const insulationThicknessMm = firstNumber(
    lineList.insulationThicknessMm,
    pipe?.insulationThicknessMm,
    fieldValue(sourceAttributes, ['INSULATION_THICKNESS_MM', 'INSUL_THICK_MM', 'INSUL_THICK']),
  );
  const insulationDensityKgM3 = firstNumber(
    lineList.insulationDensityKgM3,
    pipe?.insulationDensityKgM3,
    fieldValue(sourceAttributes, ['INSULATION_DENSITY_KG_M3', 'INSUL_DENSITY']),
  );
  const insulationWtKgPerM = deriveInsulationWeight(pipeOdMm, insulationThicknessMm, insulationDensityKgM3);

  const input = {
    schema: SUPPORT_LOAD_INPUT_SCHEMA,
    sourceObjectId: stringValue(pipe?.id),
    identity: {
      componentType: stringValue(pipe?.type || pipe?.kind || sourceAttributes.TYPE).toUpperCase(),
      lineNo: stringValue(lineList.lineNo || sourceAttributes.LINE_NO || sourceAttributes.LINENO),
      branchKey: stringValue(lineList.lineKey || lineList.branchKey || pipe?.sourcePath),
      nps: firstNumber(lineList.nps, pipe?.nps, fieldValue(sourceAttributes, ['NPS', 'NS', 'NOMINAL_SIZE', 'PIPE_SIZE'])),
      pipeOdMm,
    },
    pipePhysical: {
      wallThicknessMm,
      insideDiameterMm,
      schedule: stringValue(pipingClass.schedule || sourceAttributes.SCHEDULE || sourceAttributes.SCH),
      material: stringValue(pipingClass.materialName || material.materialName || sourceAttributes.MATERIAL || sourceAttributes.MAT),
      materialCategory: stringValue(material.materialCategory || sourceAttributes.MAT_CATEGORY),
      materialDensityKgM3,
      unitPipeWtKgPerM,
      rigidWeightKg,
      componentWeightKg,
      lumpWeightKg,
      insulationThicknessMm,
      insulationDensityKgM3,
      insulationWtKgPerM,
      componentWeightRequired: componentWeightRequired(pipe),
    },
    process: {
      tempExpC1: firstNumber(lineList.temp1C, lineList.t1, sourceAttributes.TEMP_EXP_C1, sourceAttributes.TEMP_C1, sourceAttributes.T1),
      tempExpC2: firstNumber(lineList.temp2C, lineList.t2, sourceAttributes.TEMP_EXP_C2, sourceAttributes.TEMP_C2, sourceAttributes.T2),
      fluidDensityOpeKgM3,
      fluidDensityHydKgM3,
      fluidWtOpeKgPerM,
      fluidWtHydKgPerM,
    },
    spans: {
      autoSpanMm,
      depSpanMm,
      autoSpanBySupport: {},
    },
    formulaProfile: clonePlain(profile),
    audit: buildInputAudit(pipe, unitPipeWtKgPerM, insideDiameterMm, materialDensityKgM3, fluidWtOpeKgPerM, fluidWtHydKgPerM, insulationWtKgPerM, lumpWeightKg),
  };
  return freezeDeep({ ...input, readiness: supportLoadReadiness(input) });
}

export function calculateSupportLoads(input, evaluatedAt, profileLike) {
  if (!input || typeof input !== 'object') {
    return blockedResult(null, ['supportLoadInput'], evaluatedAt);
  }
  const profile = normalizeSupportLoadProfile(profileLike || input.formulaProfile);
  // Total distributed weight per metre includes pipe + fluid + insulation
  const insulWtOpe = input.pipePhysical.insulationWtKgPerM;
  const insulWtHyd = input.pipePhysical.insulationWtKgPerM;
  const pipeWt = input.pipePhysical.unitPipeWtKgPerM;
  const vertical = {
    opeVA: verticalLoad(pipeWt, input.process.fluidWtOpeKgPerM, insulWtOpe, input.spans.autoSpanMm, input.pipePhysical.lumpWeightKg, input.pipePhysical.componentWeightRequired, profile),
    hydVA: verticalLoad(pipeWt, input.process.fluidWtHydKgPerM, insulWtHyd, input.spans.autoSpanMm, input.pipePhysical.lumpWeightKg, input.pipePhysical.componentWeightRequired, profile),
    opeVDep: verticalLoad(pipeWt, input.process.fluidWtOpeKgPerM, insulWtOpe, input.spans.depSpanMm, input.pipePhysical.lumpWeightKg, input.pipePhysical.componentWeightRequired, profile),
    hydVDep: verticalLoad(pipeWt, input.process.fluidWtHydKgPerM, insulWtHyd, input.spans.depSpanMm, input.pipePhysical.lumpWeightKg, input.pipePhysical.componentWeightRequired, profile),
  };
  const guideA = guideLoad(vertical.opeVA, input, profile);
  const guideDep = guideLoad(vertical.opeVDep, input, profile);
  const lineStopH = lineStopLoad(input, profile);
  const missing = Array.from(new Set([...(input.readiness?.missing || []), ...resultMissing(vertical, guideA, guideDep, lineStopH)]));
  const hasAnyResult = [vertical.opeVA, vertical.hydVA, vertical.opeVDep, vertical.hydVDep, guideA?.guideH, guideDep?.guideH, lineStopH].some((value) => value !== null && value !== undefined);
  return freezeDeep({
    schema: SUPPORT_LOAD_RESULT_SCHEMA,
    sourceObjectId: stringValue(input.sourceObjectId),
    evaluatedAt: stringValue(evaluatedAt),
    vertical: {
      opeVA: vertical.opeVA,
      hydVA: vertical.hydVA,
      opeVDep: vertical.opeVDep,
      hydVDep: vertical.hydVDep,
      VerticalN_A: vertical.opeVA,
      VerticalN_DEP: vertical.opeVDep,
    },
    guide: {
      roundedGuideHA: guideA?.roundedGuideH ?? null,
      guideHA: guideA?.guideH ?? null,
      roundedGuideHDep: guideDep?.roundedGuideH ?? null,
      guideHDep: guideDep?.guideH ?? null,
    },
    lineStop: {
      lineStopH,
    },
    status: {
      calculated: hasAnyResult,
      blocked: !hasAnyResult,
      missing,
    },
    formulaProfile: clonePlain(profile),
  });
}

export function resultRows(supportLoadModel) {
  const inputs = supportLoadModel?.inputsByPipeId || {};
  const results = supportLoadModel?.resultsByPipeId || {};
  return Object.values(inputs).map((input) => {
    const result = results[input.sourceObjectId] || {};
    return freezeDeep({
      pipeId: input.sourceObjectId,
      lineNo: input.identity.lineNo,
      nps: input.identity.nps,
      od: input.identity.pipeOdMm,
      wall: input.pipePhysical.wallThicknessMm,
      unitPipeWtKgPerM: input.pipePhysical.unitPipeWtKgPerM,
      insulationWtKgPerM: input.pipePhysical.insulationWtKgPerM ?? null,
      lumpWeightKg: input.pipePhysical.lumpWeightKg ?? null,
      fluidWtOpeKgPerM: input.process.fluidWtOpeKgPerM,
      tempExpC1: input.process.tempExpC1,
      autoSpanMm: input.spans.autoSpanMm,
      depSpanMm: input.spans.depSpanMm,
      status: result.status?.calculated ? 'CALCULATED' : 'BLOCKED',
      missing: result.status?.missing || input.readiness.missing,
      verticalNA: result.vertical?.VerticalN_A ?? null,
      verticalNDep: result.vertical?.VerticalN_DEP ?? null,
      guideHA: result.guide?.guideHA ?? null,
      guideHDep: result.guide?.guideHDep ?? null,
      lineStopH: result.lineStop?.lineStopH ?? null,
    });
  });
}

function supportLoadReadiness(input) {
  const hasOpeSpan = input.spans.autoSpanMm !== null || input.spans.depSpanMm !== null;
  const insulationReady = input.pipePhysical.insulationWtKgPerM !== null;
  const componentReady = input.pipePhysical.componentWeightRequired !== true || input.pipePhysical.lumpWeightKg !== null;
  const readyOpe = input.pipePhysical.unitPipeWtKgPerM !== null && input.process.fluidWtOpeKgPerM !== null && insulationReady && componentReady && hasOpeSpan;
  const readyHyd = input.pipePhysical.unitPipeWtKgPerM !== null && input.process.fluidWtHydKgPerM !== null && insulationReady && componentReady && hasOpeSpan;
  const readyGuide = readyOpe && input.pipePhysical.wallThicknessMm !== null && input.process.tempExpC1 !== null;
  const readyLineStop = input.identity.pipeOdMm !== null && input.pipePhysical.wallThicknessMm !== null && input.process.tempExpC1 !== null;
  const required = [
    ['identity.pipeOdMm', input.identity.pipeOdMm !== null],
    ['pipePhysical.wallThicknessMm', input.pipePhysical.wallThicknessMm !== null],
    ['pipePhysical.unitPipeWtKgPerM', input.pipePhysical.unitPipeWtKgPerM !== null],
    ['process.tempExpC1', input.process.tempExpC1 !== null],
    ['process.fluidWtOpeKgPerM', input.process.fluidWtOpeKgPerM !== null],
    ['process.fluidWtHydKgPerM', input.process.fluidWtHydKgPerM !== null],
    ['pipePhysical.insulationWtKgPerM', insulationReady],
    ['pipePhysical.lumpWeightKg', componentReady],
    ['spans.autoSpanMm or spans.depSpanMm', hasOpeSpan],
  ];
  return freezeDeep({
    readyForVertical: readyOpe && readyHyd,
    readyForOpeVertical: readyOpe,
    readyForHydVertical: readyHyd,
    readyForGuide: readyGuide,
    readyForLineStop: readyLineStop,
    missing: required.filter(([, ok]) => !ok).map(([field]) => field),
  });
}

function resolveUnitPipeWeight(weight, pipe, sourceAttributes, pipeOdMm, insideDiameterMm, materialDensityKgM3) {
  const direct = firstNumber(
    weight.unitPipeWeightKgPerM,
    weight.unitPipeWtKgPerM,
    pipe?.unitPipeWtKgPerM,
    fieldValue(sourceAttributes, ['UNIT_PIPE_WEIGHT_KG_PER_M', 'UNIT_PIPE_WT_KG_M', 'PIPE_WT_KG_M', 'WEIGHT_KG_M']),
  );
  if (direct !== null) return direct;
  if (pipeOdMm === null || insideDiameterMm === null || materialDensityKgM3 === null) return null;
  return round3(Math.PI / 4 * (pipeOdMm ** 2 - insideDiameterMm ** 2) * 1e-6 * materialDensityKgM3);
}

function buildInputAudit(pipe, pipeWeight, insideDiameterMm, materialDensityKgM3, fluidOpe, fluidHyd, insulWt, lumpWt) {
  const audit = [{ source: 'CALCULATION_WORKSPACE', field: 'sourceObjectId', value: stringValue(pipe?.id) }];
  if (pipeWeight !== null && insideDiameterMm !== null && materialDensityKgM3 !== null) {
    audit.push({ source: 'DETERMINISTIC_DERIVATION', field: 'pipePhysical.unitPipeWtKgPerM', value: pipeWeight });
  }
  if (fluidOpe !== null && insideDiameterMm !== null) {
    audit.push({ source: 'DETERMINISTIC_DERIVATION', field: 'process.fluidWtOpeKgPerM', value: fluidOpe });
  }
  if (fluidHyd !== null && insideDiameterMm !== null) {
    audit.push({ source: 'DETERMINISTIC_DERIVATION', field: 'process.fluidWtHydKgPerM', value: fluidHyd });
  }
  if (insulWt !== null && insulWt !== undefined) {
    audit.push({ source: 'DETERMINISTIC_DERIVATION', field: 'pipePhysical.insulationWtKgPerM', value: insulWt });
  }
  if (lumpWt !== null && lumpWt !== undefined) {
    audit.push({ source: 'WEIGHT_MASTER', field: 'pipePhysical.lumpWeightKg', value: lumpWt });
  }
  return audit;
}

function deriveFluidWeight(insideDiameterMm, densityKgM3) {
  if (insideDiameterMm === null || densityKgM3 === null) return null;
  return round3(Math.PI / 4 * insideDiameterMm ** 2 * 1e-6 * densityKgM3);
}

function deriveInsulationWeight(pipeOdMm, insulationThicknessMm, insulationDensityKgM3) {
  if (pipeOdMm === null || insulationThicknessMm === null || insulationDensityKgM3 === null) return null;
  // Annular cross-section: π/4 × ((OD + 2×t)² − OD²) × density_kg/m³
  // All dimensions in mm → convert to m² via 1e-6
  const odIns = pipeOdMm + 2 * insulationThicknessMm;
  return round3(Math.PI / 4 * (odIns ** 2 - pipeOdMm ** 2) * 1e-6 * insulationDensityKgM3);
}

function verticalLoad(pipeWt, fluidWt, insulWt, spanMm, lumpKg, lumpRequired, profile) {
  if (pipeWt === null || fluidWt === null || insulWt === null || spanMm === null) return null;
  if (lumpRequired === true && lumpKg === null) return null;
  const lump = lumpKg === null ? 0 : lumpKg;
  // Distributed contribution: (pipeWt + fluidWt + insulWt) × span × g × LF
  // Lump weight contribution: lump × g × LF (lump-sum component weight)
  const distributed = (pipeWt + fluidWt + insulWt) * spanMm * profile.gravityFactor * profile.verticalLoadFactor / 1000;
  const concentrated = lump * profile.gravityFactor * profile.verticalLoadFactor;
  return round1(distributed + concentrated);
}

function guideLoad(opeVerticalN, input, profile) {
  if (opeVerticalN === null || input.pipePhysical.wallThicknessMm === null || input.process.tempExpC1 === null) return null;
  const raw = profile.guideTemperatureMultiplier
    * profile.guideSpanLoadMultiplier
    * opeVerticalN
    * (input.pipePhysical.wallThicknessMm / profile.guideWallReferenceMm)
    * (tempFnC(input.process.tempExpC1) / profile.guideTempDivisor)
    / profile.guideDivisor;
  const roundedGuideH = getRoundedNum(raw, profile.roundMajor, profile.roundStep, profile.roundMode);
  const minimum = round3(profile.guideMinimumOpeVerticalFactor * opeVerticalN);
  return freezeDeep({ roundedGuideH, guideH: round3(Math.max(roundedGuideH, minimum)), rawN: round3(raw), minimumOpeVerticalN: minimum });
}

function lineStopLoad(input, profile) {
  const dia = input.identity.pipeOdMm;
  const wall = input.pipePhysical.wallThicknessMm;
  const temp = input.process.tempExpC1;
  if (dia === null || wall === null || temp === null) return null;
  const innerExpression = profile.lineStopIdExpression === 'D_MINUS_2WT' ? dia - 2 * wall : dia - wall;
  const sectionTerm = profile.lineStopPi / profile.lineStopSectionDivisor * (dia ** 4 - innerExpression ** 4) / dia;
  const raw = profile.lineStopScale
    * profile.lineStopCoefficient
    * (sectionTerm ** profile.lineStopExponent)
    * (tempFnC(temp) / profile.lineStopTempDivisor)
    / profile.lineStopDivisor;
  return getRoundedNum(raw, profile.roundMajor, profile.roundStep, profile.roundMode);
}

function getRoundedNum(value, major, step, mode) {
  const numeric = numberMaybe(value);
  const roundStep = firstNumber(step, major);
  if (numeric === null || roundStep === null) return null;
  if (mode === 'down') return Math.floor(numeric / roundStep) * roundStep;
  if (mode === 'nearest') return Math.round(numeric / roundStep) * roundStep;
  return Math.ceil(numeric / roundStep) * roundStep;
}

// ---------------------------------------------------------------------------
// tempFnC — ASME B31.3 carbon steel hot/cold allowable stress ratio (Sh/Sc)
// ---------------------------------------------------------------------------
// The Guide and Line Stop formulas include the term (TempfnC(T1) / 100).
// This function returns the Sh/Sc ratio × 100 so that dividing by 100 in the
// formula normalises back to the dimensionless ratio.  Values are taken from
// ASME B31.3 Table A-1 for A106 Gr.B / A53 Gr.B carbon steel and linearly
// interpolated between breakpoints.  Temperatures below 0°C return 100
// (ratio = 1.00) and temperatures above 500°C return 63 (ratio = 0.63).
// ---------------------------------------------------------------------------
const TEMP_FN_BREAKPOINTS = Object.freeze([
  //  [tempC, Sh/Sc × 100]
  [0,   100],
  [50,  100],
  [100, 100],
  [150,  97],
  [200,  93],
  [250,  89],
  [300,  85],
  [350,  81],
  [400,  76],
  [450,  71],
  [500,  63],
]);

function tempFnC(value) {
  const t = numberMaybe(value);
  if (t === null) return null;
  if (t <= TEMP_FN_BREAKPOINTS[0][0]) return TEMP_FN_BREAKPOINTS[0][1];
  const last = TEMP_FN_BREAKPOINTS[TEMP_FN_BREAKPOINTS.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 1; i < TEMP_FN_BREAKPOINTS.length; i++) {
    const [t0, r0] = TEMP_FN_BREAKPOINTS[i - 1];
    const [t1, r1] = TEMP_FN_BREAKPOINTS[i];
    if (t <= t1) {
      const frac = (t - t0) / (t1 - t0);
      return round3(r0 + frac * (r1 - r0));
    }
  }
  return last[1];
}

function resultMissing(vertical, guideA, guideDep, lineStopH) {
  const missing = [];
  if (vertical.opeVA === null) missing.push('vertical.opeVA');
  if (vertical.hydVA === null) missing.push('vertical.hydVA');
  if (vertical.opeVDep === null) missing.push('vertical.opeVDep');
  if (vertical.hydVDep === null) missing.push('vertical.hydVDep');
  if (!guideA) missing.push('guide.guideHA');
  if (!guideDep) missing.push('guide.guideHDep');
  if (lineStopH === null) missing.push('lineStop.lineStopH');
  return missing;
}

function blockedResult(input, missing, evaluatedAt) {
  return freezeDeep({
    schema: SUPPORT_LOAD_RESULT_SCHEMA,
    sourceObjectId: stringValue(input?.sourceObjectId),
    evaluatedAt: stringValue(evaluatedAt),
    vertical: {},
    guide: {},
    lineStop: {},
    status: { calculated: false, blocked: true, missing },
    formulaProfile: null,
  });
}

export function normalizeSupportLoadProfile(profileLike) {
  if (!profileLike || typeof profileLike !== 'object' || Array.isArray(profileLike)) {
    throw new TypeError('Support-load profile must come from visible editable configuration.');
  }
  const source = profileLike;
  const numericProfile = Object.fromEntries(
    SUPPORT_LOAD_PROFILE_NUMERIC_KEYS.map((key) => [key, positiveNumber(source[key], key)]),
  );
  const lineStopIdExpression = stringValue(source.lineStopIdExpression);
  if (!['D_MINUS_WT', 'D_MINUS_2WT'].includes(lineStopIdExpression)) throw new TypeError('Visible support-load profile lineStopIdExpression is invalid.');
  const roundMode = stringValue(source.roundMode);
  if (!['up', 'nearest', 'down'].includes(roundMode)) throw new TypeError('Visible support-load profile roundMode is invalid.');
  return freezeDeep({
    profileId: SUPPORT_LOAD_FORMULA_PROFILE_ID,
    configSource: stringValue(source.configSource || 'visible-editable-config'),
    ...numericProfile,
    roundMode,
    lineStopIdExpression,
  });
}

function buildCalculationLogs(pipeInputs, resultsByPipeId, blockedResults) {
  const rows = [
    { level: 'info', message: `Built ${pipeInputs.length} support-load input record(s).` },
    { level: blockedResults.length ? 'warn' : 'info', message: `Calculated ${pipeInputs.length - blockedResults.length}; blocked ${blockedResults.length}.` },
  ];
  Object.values(resultsByPipeId).forEach((result) => {
    const missing = result.status?.missing || [];
    if (missing.length) rows.push({ level: 'warn', message: `${result.sourceObjectId}: missing ${missing.join(', ')}` });
    else rows.push({ level: 'info', message: `${result.sourceObjectId}: calculation ready.` });
  });
  return freezeDeep(rows);
}

function positiveNumber(value, field) {
  const parsed = numberMaybe(value);
  if (parsed !== null && parsed > 0) return parsed;
  throw new TypeError(`Visible support-load profile field ${field} must be a positive number.`);
}

function componentWeightRequired(pipe) {
  const type = stringValue(pipe?.type || pipe?.kind || pipe?.sourceAttributes?.TYPE).toUpperCase();
  return type !== '' && type !== 'PIPE';
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = numberMaybe(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function fieldValue(source, keys) {
  const entries = Object.entries(source || {});
  for (const key of keys) {
    if (source?.[key] !== undefined && stringValue(source[key])) return source[key];
    const match = entries.find(([field]) => normalizeKey(field) === normalizeKey(key));
    if (match && stringValue(match[1])) return match[1];
  }
  return undefined;
}

function normalizeKey(value) {
  return stringValue(value).toUpperCase().replace(/[^A-Z0-9.]+/g, '');
}

function round1(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

function round3(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
}
