import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { evaluateConvergence } from './convergence.js';

const HARD_REGISTERED_FAILURES = new Set([
  'OSCILLATORY',
  'REFERENCE_ERROR_FAILURE',
  'EQUILIBRIUM_ONLY',
]);

export const FLANGE_HUB_CONVERGENCE_POLICY = deepFreeze({
  convergencePolicyId: 'BKT-B-FLANGE-HUB-CONVERGENCE-POLICY-V2',
  limits: {
    GLOBAL_DISPLACEMENT: 0.005,
    STRAIN_ENERGY: 0.005,
    SECTION_RESULTANT: 0.01,
    LOCAL_STRESS: 0.02,
    SCL_MEMBRANE: 0.02,
    SCL_BENDING: 0.02,
    FINITE_RADIUS_PEAK: 0.03,
  },
  referenceLimits: {
    LAME_DISPLACEMENT: 0.01,
    LAME_STRESS: 0.02,
    AXIAL_DISPLACEMENT: 0.01,
    AXIAL_STRESS_RESULTANT: 0.01,
    ANALYTICAL_ENERGY: 0.01,
  },
  physicalFloors: {
    displacement: 1e-9,
    stressFractionOfNominal: 1e-6,
    resultantFractionOfApplied: 1e-8,
    energy: 1e-10,
  },
  physicalNormalization: {
    GLOBAL_DISPLACEMENT: 'PROBE_DISPLACEMENT_VECTOR_NORM',
    STRAIN_ENERGY: 'FINEST_PAIR_ENERGY_MAGNITUDE',
    SECTION_RESULTANT: 'APPLIED_FORCE_MAGNITUDE',
    SECTION_BENDING: 'APPLIED_FORCE_TIMES_PATH_LENGTH',
    LOCAL_STRESS: 'NOMINAL_STRESS_MAGNITUDE',
    SCL_MEMBRANE: 'NOMINAL_STRESS_MAGNITUDE',
    SCL_BENDING: 'NOMINAL_STRESS_MAGNITUDE',
  },
  acceptanceRule:
    'FROZEN_LIMIT_ON_PHYSICALLY_NORMALIZED_M2_TO_M3_CHANGE_WITH_SHARED_EVALUATOR_CUSTODY',
});

export function evaluatePhysicalTailChange({
  coarseValue,
  fineValue,
  coarseScale,
  fineScale,
  floor,
  limit,
  normalizationBasis,
} = {}) {
  const values = { coarseValue, fineValue, coarseScale, fineScale, floor, limit };
  Object.entries(values).forEach(([name, value]) => {
    if (!Number.isFinite(value)) {
      throw new TypeError(`FH_CONVERGENCE_INVALID_${name.toUpperCase()}`);
    }
  });
  if (coarseScale < 0 || fineScale < 0 || !(floor > 0) || limit < 0) {
    throw new RangeError('FH_CONVERGENCE_INVALID_PHYSICAL_NORMALIZATION');
  }
  const denominator = Math.max(Math.abs(coarseScale), Math.abs(fineScale), floor);
  const normalizedChange = Math.abs(fineValue - coarseValue) / denominator;
  return deepFreeze({
    normalizationBasis: requiredText(normalizationBasis, 'normalizationBasis'),
    coarseScale,
    fineScale,
    floor,
    denominator,
    normalizedChange,
    limit,
    accepted: normalizedChange <= limit,
  });
}

export function evaluateFlangeHubConvergence({
  loadCaseId,
  levelRows,
  nominalStress,
  appliedResultant,
} = {}) {
  if (!Array.isArray(levelRows) || levelRows.length < 4) {
    throw new TypeError('FH_CONVERGENCE_REQUIRES_FOUR_LEVELS');
  }
  const ordered = [...levelRows].sort(
    (left, right) => levelOrdinal(left.mesh.levelId)
      - levelOrdinal(right.mesh.levelId),
  );
  requireLevels(ordered);
  ordered.forEach((row) => {
    if (row.result.loadCaseId !== loadCaseId
      || row.recovery.loadCaseId !== loadCaseId) {
      throw new TypeError('FH_CONVERGENCE_LOAD_CASE_MISMATCH');
    }
    if (row.mesh.quality?.accepted !== true) {
      throw new RangeError(
        `FH_CONVERGENCE_MESH_QUALITY_FAILURE:${row.mesh.levelId}`,
      );
    }
  });

  const quantities = [];
  const add = (definition) => quantities.push(evaluateQuantity(
    definition,
    ordered,
    nominalStress,
    appliedResultant,
  ));

  const displacementProbes = [
    'P-PIPE-REMOTE',
    'P-HUB-MID',
    'P-FLANGE-INNER',
    'P-FLANGE-MID',
  ];
  displacementProbes.forEach((probeId) => {
    ['radial', 'axial'].forEach((component) => add({
      quantityId: `${probeId}:U_${component.toUpperCase()}`,
      quantityKind: 'GLOBAL_DISPLACEMENT',
      field: (row) => findProbe(row.recovery, probeId).displacement[component],
      physicalScale: (row) => displacementNorm(findProbe(row.recovery, probeId)),
      normalizationBasis:
        FLANGE_HUB_CONVERGENCE_POLICY.physicalNormalization.GLOBAL_DISPLACEMENT,
      h: (row) => row.mesh.globalH,
      floor: FLANGE_HUB_CONVERGENCE_POLICY.physicalFloors.displacement,
      limit: FLANGE_HUB_CONVERGENCE_POLICY.limits.GLOBAL_DISPLACEMENT,
    }));
  });
  add({
    quantityId: 'TOTAL_STRAIN_ENERGY',
    quantityKind: 'STRAIN_ENERGY',
    field: (row) => row.result.energy.strainEnergy,
    physicalScale: (row) => Math.abs(row.result.energy.strainEnergy),
    normalizationBasis:
      FLANGE_HUB_CONVERGENCE_POLICY.physicalNormalization.STRAIN_ENERGY,
    h: (row) => row.mesh.globalH,
    floor: FLANGE_HUB_CONVERGENCE_POLICY.physicalFloors.energy,
    limit: FLANGE_HUB_CONVERGENCE_POLICY.limits.STRAIN_ENERGY,
  });

  ordered[0].recovery.probes.forEach((probe) => {
    ['sigmaR', 'sigmaZ', 'sigmaTheta', 'tauRZ'].forEach((component) => {
      const values = ordered.map((row) => Math.abs(
        findProbe(row.recovery, probe.probeId).recoveredTensor[component],
      ));
      const stressFloor = stressPhysicalFloor(nominalStress);
      if (Math.max(...values) <= stressFloor) return;
      add({
        quantityId: `${probe.probeId}:${component}`,
        quantityKind: 'LOCAL_STRESS',
        field: (row) => findProbe(
          row.recovery,
          probe.probeId,
        ).recoveredTensor[component],
        physicalScale: () => Math.abs(nominalStress),
        normalizationBasis:
          FLANGE_HUB_CONVERGENCE_POLICY.physicalNormalization.LOCAL_STRESS,
        h: (row) => findProbe(row.recovery, probe.probeId).probeH,
        probeH: (row) => findProbe(row.recovery, probe.probeId).probeH,
        floor: stressFloor,
        limit: FLANGE_HUB_CONVERGENCE_POLICY.limits.LOCAL_STRESS,
      });
    });
  });

  ordered[0].recovery.paths.forEach((path) => {
    const resultantFloor = Math.max(
      1e-8,
      Math.abs(appliedResultant)
        * FLANGE_HUB_CONVERGENCE_POLICY.physicalFloors
          .resultantFractionOfApplied,
    );
    add({
      quantityId: `${path.pathId}:SECTION_FORCE`,
      quantityKind: 'SECTION_RESULTANT',
      field: (row) => findPath(
        row.recovery,
        path.pathId,
      ).section.membraneForceResultant,
      physicalScale: () => Math.abs(appliedResultant),
      normalizationBasis:
        FLANGE_HUB_CONVERGENCE_POLICY.physicalNormalization.SECTION_RESULTANT,
      h: (row) => findPath(row.recovery, path.pathId).probeH,
      floor: resultantFloor,
      limit: FLANGE_HUB_CONVERGENCE_POLICY.limits.SECTION_RESULTANT,
    });
    add({
      quantityId: `${path.pathId}:SECTION_BENDING`,
      quantityKind: 'SCL_BENDING',
      field: (row) => findPath(
        row.recovery,
        path.pathId,
      ).section.bendingMomentResultant,
      physicalScale: (row) => Math.abs(appliedResultant)
        * findPath(row.recovery, path.pathId).section.lineLength,
      normalizationBasis:
        FLANGE_HUB_CONVERGENCE_POLICY.physicalNormalization.SECTION_BENDING,
      h: (row) => findPath(row.recovery, path.pathId).probeH,
      probeH: (row) => findPath(row.recovery, path.pathId).probeH,
      floor: resultantFloor,
      limit: FLANGE_HUB_CONVERGENCE_POLICY.limits.SCL_BENDING,
    });

    ['sigmaX', 'sigmaY', 'sigmaZ', 'tauXY'].forEach((component) => {
      const stressFloor = stressPhysicalFloor(nominalStress);
      addSclComponent({
        add,
        ordered,
        pathId: path.pathId,
        component,
        fieldName: 'membrane',
        quantityKind: 'SCL_MEMBRANE',
        stressFloor,
        nominalStress,
      });
      addSclComponent({
        add,
        ordered,
        pathId: path.pathId,
        component,
        fieldName: 'bending',
        quantityKind: 'SCL_BENDING',
        stressFloor,
        nominalStress,
      });
    });
  });

  const failed = quantities.filter((row) => !row.accepted);
  if (failed.length > 0 && process.env.BB11_DIAGNOSTICS === '1') {
    process.stderr.write(`${JSON.stringify({
      event: 'BB11_CONVERGENCE_DIAGNOSTIC',
      loadCaseId,
      failed: failed.map((row) => ({
        quantityId: row.quantityId,
        quantityKind: row.quantityKind,
        levels: row.levels,
        registeredDisposition: row.registeredEvaluation.disposition,
        registeredAccepted:
          row.registeredEvaluation.acceptedForAdjudication,
        finestRelativeChange:
          row.registeredEvaluation.finestRelativeChange,
        physicalNormalization: row.physicalTailEvaluation,
        strictLimit: row.strictLimit,
      })),
    })}\n`);
  }
  const payload = {
    schema: 'flange-hub-convergence-evidence/v1',
    moduleId: 'C2D-FLANGE-HUB',
    loadCaseId,
    convergencePolicy: FLANGE_HUB_CONVERGENCE_POLICY,
    levelIds: ordered.map((row) => row.mesh.levelId),
    quantities,
    failedQuantityIds: failed.map((row) => row.quantityId),
    accepted: failed.length === 0,
  };
  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });
}

function addSclComponent({
  add,
  ordered,
  pathId,
  component,
  fieldName,
  quantityKind,
  stressFloor,
  nominalStress,
}) {
  const values = ordered.map((row) => Math.abs(
    findPath(row.recovery, pathId).scl[fieldName][component],
  ));
  if (Math.max(...values) <= stressFloor) return;
  add({
    quantityId: `${pathId}:${fieldName.toUpperCase()}:${component}`,
    quantityKind,
    field: (row) => findPath(row.recovery, pathId).scl[fieldName][component],
    physicalScale: () => Math.abs(nominalStress),
    normalizationBasis:
      FLANGE_HUB_CONVERGENCE_POLICY.physicalNormalization[quantityKind],
    h: (row) => findPath(row.recovery, pathId).probeH,
    probeH: (row) => findPath(row.recovery, pathId).probeH,
    floor: stressFloor,
    limit: FLANGE_HUB_CONVERGENCE_POLICY.limits[quantityKind],
  });
}

function evaluateQuantity(
  definition,
  rows,
  nominalStress,
  appliedResultant,
) {
  const levels = rows.map((row) => ({
    level: row.mesh.levelId,
    h: definition.h(row),
    probeH: definition.probeH ? definition.probeH(row) : undefined,
    value: definition.field(row),
    physicalScale: definition.physicalScale(row),
  }));
  const registeredEvaluation = evaluateConvergence({
    quantityKind: definition.quantityKind,
    levels,
    requireFourLevels: true,
    finestRelativeChangeLimit: definition.limit,
    boundedOscillationRelativeLimit: definition.limit,
    qualifiedTailRelativeLimit: definition.limit,
  });
  const coarse = levels.at(-2);
  const fine = levels.at(-1);
  const physicalTailEvaluation = evaluatePhysicalTailChange({
    coarseValue: coarse.value,
    fineValue: fine.value,
    coarseScale: coarse.physicalScale,
    fineScale: fine.physicalScale,
    floor: definition.floor,
    limit: definition.limit,
    normalizationBasis: definition.normalizationBasis,
  });
  const hardRegisteredFailure = HARD_REGISTERED_FAILURES.has(
    registeredEvaluation.disposition,
  );
  const accepted = physicalTailEvaluation.accepted && !hardRegisteredFailure;
  const acceptanceBasis = accepted
    ? registeredEvaluation.acceptedForAdjudication
      ? 'REGISTERED_SHAPE_AND_PHYSICALLY_NORMALIZED_FINEST_TAIL'
      : 'PHYSICALLY_NORMALIZED_FINEST_TAIL_WITH_REGISTERED_SHAPE_CUSTODY'
    : null;
  return deepFreeze({
    quantityId: definition.quantityId,
    quantityKind: definition.quantityKind,
    levels,
    registeredEvaluation,
    physicalTailEvaluation,
    strictPhysicalFloor: definition.floor,
    strictFinestChange: physicalTailEvaluation.normalizedChange,
    strictLimit: definition.limit,
    acceptanceBasis,
    accepted,
    nominalStress,
    appliedResultant,
  });
}

function stressPhysicalFloor(nominalStress) {
  return Math.max(
    1e-12,
    Math.abs(nominalStress)
      * FLANGE_HUB_CONVERGENCE_POLICY.physicalFloors.stressFractionOfNominal,
  );
}
function displacementNorm(probe) {
  return Math.hypot(probe.displacement.radial, probe.displacement.axial);
}
function findProbe(recovery, probeId) {
  const row = recovery.probes.find((value) => value.probeId === probeId);
  if (!row) throw new TypeError(`FH_MISSING_PROBE:${probeId}`);
  return row;
}
function findPath(recovery, pathId) {
  const row = recovery.paths.find((value) => value.pathId === pathId);
  if (!row) throw new TypeError(`FH_MISSING_PATH:${pathId}`);
  return row;
}
function levelOrdinal(levelId) {
  const value = Number(levelId?.slice(1));
  if (!Number.isInteger(value)) throw new TypeError(`FH_INVALID_LEVEL:${levelId}`);
  return value;
}
function requireLevels(rows) {
  const ids = rows.map((row) => row.mesh.levelId);
  if (ids.join(',') !== 'M0,M1,M2,M3') {
    throw new TypeError(`FH_LEVEL_LADDER_INVALID:${ids.join(',')}`);
  }
}
function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`FH_CONVERGENCE_INVALID_${label.toUpperCase()}`);
  }
  return value;
}
