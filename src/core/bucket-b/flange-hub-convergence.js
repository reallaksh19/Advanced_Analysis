import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { evaluateConvergence } from './convergence.js';

export const FLANGE_HUB_CONVERGENCE_POLICY = deepFreeze({
  convergencePolicyId: 'BKT-B-FLANGE-HUB-CONVERGENCE-POLICY-V1',
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
});

export function evaluateFlangeHubConvergence({ loadCaseId, levelRows, nominalStress, appliedResultant } = {}) {
  if (!Array.isArray(levelRows) || levelRows.length < 4) throw new TypeError('FH_CONVERGENCE_REQUIRES_FOUR_LEVELS');
  const ordered = [...levelRows].sort((a, b) => levelOrdinal(a.mesh.levelId) - levelOrdinal(b.mesh.levelId));
  requireLevels(ordered);
  ordered.forEach((row) => {
    if (row.result.loadCaseId !== loadCaseId || row.recovery.loadCaseId !== loadCaseId) throw new TypeError('FH_CONVERGENCE_LOAD_CASE_MISMATCH');
    if (row.mesh.quality?.accepted !== true) throw new RangeError(`FH_CONVERGENCE_MESH_QUALITY_FAILURE:${row.mesh.levelId}`);
  });
  const quantities = [];
  const add = (quantity) => quantities.push(evaluateQuantity(quantity, ordered, nominalStress, appliedResultant));

  const displacementProbes = ['P-PIPE-REMOTE', 'P-HUB-MID', 'P-FLANGE-INNER', 'P-FLANGE-MID'];
  displacementProbes.forEach((probeId) => {
    ['radial', 'axial'].forEach((component) => add({
      quantityId: `${probeId}:U_${component.toUpperCase()}`,
      quantityKind: 'GLOBAL_DISPLACEMENT',
      field: (row) => findProbe(row.recovery, probeId).displacement[component],
      h: (row) => row.mesh.globalH,
      floor: FLANGE_HUB_CONVERGENCE_POLICY.physicalFloors.displacement,
      limit: FLANGE_HUB_CONVERGENCE_POLICY.limits.GLOBAL_DISPLACEMENT,
    }));
  });
  add({
    quantityId: 'TOTAL_STRAIN_ENERGY',
    quantityKind: 'STRAIN_ENERGY',
    field: (row) => row.result.energy.strainEnergy,
    h: (row) => row.mesh.globalH,
    floor: FLANGE_HUB_CONVERGENCE_POLICY.physicalFloors.energy,
    limit: FLANGE_HUB_CONVERGENCE_POLICY.limits.STRAIN_ENERGY,
  });

  ordered[0].recovery.probes.forEach((probe) => {
    ['sigmaR', 'sigmaZ', 'sigmaTheta', 'tauRZ'].forEach((component) => {
      const values = ordered.map((row) => Math.abs(findProbe(row.recovery, probe.probeId).recoveredTensor[component]));
      const stressFloor = Math.max(1e-12, Math.abs(nominalStress) * FLANGE_HUB_CONVERGENCE_POLICY.physicalFloors.stressFractionOfNominal);
      if (Math.max(...values) <= stressFloor) return;
      add({
        quantityId: `${probe.probeId}:${component}`,
        quantityKind: 'LOCAL_STRESS',
        field: (row) => findProbe(row.recovery, probe.probeId).recoveredTensor[component],
        h: (row) => findProbe(row.recovery, probe.probeId).probeH,
        probeH: (row) => findProbe(row.recovery, probe.probeId).probeH,
        floor: stressFloor,
        limit: FLANGE_HUB_CONVERGENCE_POLICY.limits.LOCAL_STRESS,
      });
    });
  });

  ordered[0].recovery.paths.forEach((path) => {
    add({
      quantityId: `${path.pathId}:SECTION_FORCE`,
      quantityKind: 'SECTION_RESULTANT',
      field: (row) => findPath(row.recovery, path.pathId).section.membraneForceResultant,
      h: (row) => findPath(row.recovery, path.pathId).probeH,
      floor: Math.max(1e-8, Math.abs(appliedResultant) * FLANGE_HUB_CONVERGENCE_POLICY.physicalFloors.resultantFractionOfApplied),
      limit: FLANGE_HUB_CONVERGENCE_POLICY.limits.SECTION_RESULTANT,
    });
    add({
      quantityId: `${path.pathId}:SECTION_BENDING`,
      quantityKind: 'SCL_BENDING',
      field: (row) => findPath(row.recovery, path.pathId).section.bendingMomentResultant,
      h: (row) => findPath(row.recovery, path.pathId).probeH,
      probeH: (row) => findPath(row.recovery, path.pathId).probeH,
      floor: Math.max(1e-8, Math.abs(appliedResultant) * FLANGE_HUB_CONVERGENCE_POLICY.physicalFloors.resultantFractionOfApplied),
      limit: FLANGE_HUB_CONVERGENCE_POLICY.limits.SCL_BENDING,
    });
    ['sigmaX', 'sigmaY', 'sigmaZ', 'tauXY'].forEach((component) => {
      const stressFloor = Math.max(1e-12, Math.abs(nominalStress) * FLANGE_HUB_CONVERGENCE_POLICY.physicalFloors.stressFractionOfNominal);
      const membraneValues = ordered.map((row) => Math.abs(findPath(row.recovery, path.pathId).scl.membrane[component]));
      if (Math.max(...membraneValues) > stressFloor) add({
        quantityId: `${path.pathId}:MEMBRANE:${component}`,
        quantityKind: 'SCL_MEMBRANE',
        field: (row) => findPath(row.recovery, path.pathId).scl.membrane[component],
        h: (row) => findPath(row.recovery, path.pathId).probeH,
        probeH: (row) => findPath(row.recovery, path.pathId).probeH,
        floor: stressFloor,
        limit: FLANGE_HUB_CONVERGENCE_POLICY.limits.SCL_MEMBRANE,
      });
      const bendingValues = ordered.map((row) => Math.abs(findPath(row.recovery, path.pathId).scl.bending[component]));
      if (Math.max(...bendingValues) > stressFloor) add({
        quantityId: `${path.pathId}:BENDING:${component}`,
        quantityKind: 'SCL_BENDING',
        field: (row) => findPath(row.recovery, path.pathId).scl.bending[component],
        h: (row) => findPath(row.recovery, path.pathId).probeH,
        probeH: (row) => findPath(row.recovery, path.pathId).probeH,
        floor: stressFloor,
        limit: FLANGE_HUB_CONVERGENCE_POLICY.limits.SCL_BENDING,
      });
    });
  });

  const failed = quantities.filter((row) => !row.accepted);
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

function evaluateQuantity(definition, rows, nominalStress, appliedResultant) {
  const levels = rows.map((row) => ({
    level: row.mesh.levelId,
    h: definition.h(row),
    probeH: definition.probeH ? definition.probeH(row) : undefined,
    value: definition.field(row),
  }));
  const evaluation = evaluateConvergence({
    quantityKind: definition.quantityKind,
    levels,
    requireFourLevels: true,
    finestRelativeChangeLimit: definition.limit,
    boundedOscillationRelativeLimit: definition.limit,
    qualifiedTailRelativeLimit: definition.limit,
  });
  const coarse = levels.at(-2).value;
  const fine = levels.at(-1).value;
  const strictFinestChange = Math.abs(fine - coarse)
    / Math.max(Math.abs(fine), Math.abs(coarse), definition.floor);
  const accepted = evaluation.acceptedForAdjudication === true
    && strictFinestChange <= definition.limit;
  return deepFreeze({
    quantityId: definition.quantityId,
    quantityKind: definition.quantityKind,
    levels,
    registeredEvaluation: evaluation,
    strictPhysicalFloor: definition.floor,
    strictFinestChange,
    strictLimit: definition.limit,
    accepted,
    nominalStress,
    appliedResultant,
  });
}

function findProbe(recovery, probeId) { const row = recovery.probes.find((value) => value.probeId === probeId); if (!row) throw new TypeError(`FH_MISSING_PROBE:${probeId}`); return row; }
function findPath(recovery, pathId) { const row = recovery.paths.find((value) => value.pathId === pathId); if (!row) throw new TypeError(`FH_MISSING_PATH:${pathId}`); return row; }
function levelOrdinal(levelId) { const value = Number(levelId?.slice(1)); if (!Number.isInteger(value)) throw new TypeError(`FH_INVALID_LEVEL:${levelId}`); return value; }
function requireLevels(rows) { const ids = rows.map((row) => row.mesh.levelId); if (ids.join(',') !== 'M0,M1,M2,M3') throw new TypeError(`FH_LEVEL_LADDER_INVALID:${ids.join(',')}`); }
