import { requirePreproductionThermalLiftoffActiveSetIntake } from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-active-set-authority.js';
import { createPreproductionThermalLiftoffBenchmarkReference } from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-benchmark-authority.js';

/**
 * Independent TL-05 reference oracle.
 *
 * Unlike TL-04, this does not iterate by release/re-contact history. It
 * exhaustively enumerates every non-empty contact subset, solves compatibility
 * once for each subset, and accepts only a unique subset satisfying the
 * governed reaction/gap/complementarity/equilibrium conditions.
 */
export function solveExhaustiveThermalLiftoffReference(input) {
  const { referenceId, scenarioClass, source, benchmarkReference } = input;
  const intake = requirePreproductionThermalLiftoffActiveSetIntake(input.intake);
  if (intake.status !== 'READY_FOR_TL04_ACTIVE_SET') throw coded('TL05_ORACLE_INTAKE_NOT_READY');
  const ids = [...intake.ordering];
  const supportById = new Map(intake.supports.map((row) => [row.supportSiteId, row]));
  const coldVector = ids.map((id) => supportById.get(id).coldGravityReactionN);
  const freeOpeningVector = ids.map((id) => supportById.get(id).freeOpeningM);
  const admissible = [];
  let evaluatedSubsetCount = 0;
  let gravityResolvableSubsetCount = 0;

  for (let mask = 1; mask < (1 << ids.length); mask += 1) {
    evaluatedSubsetCount += 1;
    const activeIds = ids.filter((_, index) => (mask & (1 << index)) !== 0);
    const activeSet = new Set(activeIds);
    const gravity = redistributeGravity(intake, activeSet);
    if (gravity === null) continue;
    gravityResolvableSubsetCount += 1;
    const gravityDeltaN = gravity.reactionsN.map((value, index) => value - coldVector[index]);
    const activeIndices = activeIds.map((id) => ids.indexOf(id));
    const rhs = activeIndices.map((rowIndex) => -(
      freeOpeningVector[rowIndex]
      + dot(intake.flexibilityMatrixMPerN[rowIndex], gravityDeltaN)
    ));
    const activeMatrix = activeIndices.map((rowIndex) => activeIndices.map((columnIndex) => (
      intake.flexibilityMatrixMPerN[rowIndex][columnIndex]
    )));
    let solvedThermal;
    try {
      solvedThermal = gaussianSolve(activeMatrix, rhs, intake.numericalControls.matrixPivotToleranceMPerN);
    } catch {
      continue;
    }
    const thermalIncrementN = ids.map(() => 0);
    activeIndices.forEach((fullIndex, localIndex) => { thermalIncrementN[fullIndex] = solvedThermal[localIndex]; });
    const totalReactionN = ids.map((id, index) => activeSet.has(id)
      ? gravity.reactionsN[index] + thermalIncrementN[index]
      : 0);
    const reactionChangeN = ids.map((_, index) => gravityDeltaN[index] + thermalIncrementN[index]);
    const hotGapM = ids.map((_, index) => freeOpeningVector[index] + dot(intake.flexibilityMatrixMPerN[index], reactionChangeN));

    const activeReactionViolationN = maxAbs(ids.map((id, index) => activeSet.has(id) ? Math.min(0, totalReactionN[index]) : 0));
    const activeGapResidualM = maxAbs(ids.map((id, index) => activeSet.has(id) ? hotGapM[index] : 0));
    const inactiveGapPenetrationM = maxAbs(ids.map((id, index) => activeSet.has(id) ? 0 : Math.min(0, hotGapM[index])));
    const complementarityResidualNM = maxAbs(ids.map((_, index) => totalReactionN[index] * hotGapM[index]));
    const thermalEquivalentForceN = sum(thermalIncrementN);
    const thermalEquivalentMomentNmm = ids.reduce((total, id, index) => total + thermalIncrementN[index] * supportById.get(id).routeChainageMm, 0);
    const totalReactionForceN = sum(totalReactionN);
    const totalReactionMomentNmm = ids.reduce((total, id, index) => total + totalReactionN[index] * supportById.get(id).routeChainageMm, 0);
    const expectedForceN = gravity.appliedForceN + thermalEquivalentForceN;
    const expectedMomentNmm = gravity.appliedMomentNmm + thermalEquivalentMomentNmm;
    const forceResidualN = totalReactionForceN - expectedForceN;
    const momentResidualNmm = totalReactionMomentNmm - expectedMomentNmm;

    const passes = activeReactionViolationN <= intake.reactionToleranceN
      && activeGapResidualM <= intake.numericalControls.gapToleranceM
      && inactiveGapPenetrationM <= intake.numericalControls.gapToleranceM
      && complementarityResidualNM <= intake.numericalControls.complementarityToleranceNM
      && Math.abs(gravity.forceResidualN) <= intake.numericalControls.forceToleranceN
      && Math.abs(gravity.momentResidualNmm) <= intake.numericalControls.momentToleranceNmm
      && Math.abs(forceResidualN) <= intake.numericalControls.forceToleranceN
      && Math.abs(momentResidualNmm) <= intake.numericalControls.momentToleranceNmm;
    if (!passes) continue;

    admissible.push({
      activeIds,
      totalReactionN,
      hotGapM,
      forceResidualN,
      momentResidualNmm,
      complementarityResidualNM,
    });
  }

  if (admissible.length === 0) throw coded('TL05_ORACLE_NO_ADMISSIBLE_CONTACT_SET');
  if (admissible.length !== 1) throw coded('TL05_ORACLE_CONTACT_SET_NONUNIQUE');
  const solved = admissible[0];
  const reference = createPreproductionThermalLiftoffBenchmarkReference({
    referenceId,
    scenarioClass,
    source,
    benchmarkReference,
    applicabilityClass: intake.applicabilityClass,
    datasetId: intake.datasetId,
    loadCaseId: intake.loadCaseId,
    intakeSemanticHash: intake.semanticHash,
    ordering: ids,
    supportResults: ids.map((id, index) => ({
      supportSiteId: id,
      state: solved.activeIds.includes(id) ? 'ACTIVE' : 'LIFTED',
      reactionN: solved.totalReactionN[index],
      gapM: solved.hotGapM[index],
    })),
    equilibrium: {
      forceResidualN: solved.forceResidualN,
      momentResidualNmm: solved.momentResidualNmm,
    },
    complementarity: { complementarityResidualNM: solved.complementarityResidualNM },
    qualification: 'QUALIFIED',
  });
  return Object.freeze({
    reference,
    evidence: Object.freeze({
      evaluatedSubsetCount,
      gravityResolvableSubsetCount,
      admissibleSubsetCount: admissible.length,
      selectedActiveSupportSiteIds: [...solved.activeIds],
      algorithm: 'EXHAUSTIVE_NONEMPTY_CONTACT_SUBSET_ENUMERATION_V1',
      candidateActiveSetAlgorithmReused: false,
    }),
  });
}

function redistributeGravity(intake, activeSet) {
  const supports = intake.supports
    .filter((row) => activeSet.has(row.supportSiteId))
    .sort((a, b) => a.routeChainageMm - b.routeChainageMm || ascii(a.supportSiteId, b.supportSiteId));
  if (supports.length === 0) return null;
  const reactions = new Map(intake.ordering.map((id) => [id, 0]));
  let appliedForceN = 0;
  let appliedMomentNmm = 0;
  for (const contribution of intake.gravityContributions) {
    const allocations = distributePoint(contribution.chainageMm, contribution.verticalForceN, supports);
    if (allocations === null) return null;
    for (const allocation of allocations) reactions.set(allocation.supportSiteId, reactions.get(allocation.supportSiteId) + allocation.verticalForceN);
    appliedForceN += contribution.verticalForceN;
    appliedMomentNmm += contribution.verticalForceN * contribution.chainageMm;
  }
  const reactionsN = intake.ordering.map((id) => reactions.get(id));
  const reactionMomentNmm = intake.ordering.reduce((total, id, index) => total + reactionsN[index] * intake.supports[index].routeChainageMm, 0);
  return {
    reactionsN,
    appliedForceN,
    appliedMomentNmm,
    forceResidualN: sum(reactionsN) - appliedForceN,
    momentResidualNmm: reactionMomentNmm - appliedMomentNmm,
  };
}

function distributePoint(chainageMm, forceN, supports) {
  const exact = supports.find((support) => support.routeChainageMm === chainageMm);
  if (exact) return [{ supportSiteId: exact.supportSiteId, verticalForceN: forceN }];
  const lower = [...supports].reverse().find((support) => support.routeChainageMm < chainageMm);
  const upper = supports.find((support) => support.routeChainageMm > chainageMm);
  if (!lower || !upper) return null;
  const span = upper.routeChainageMm - lower.routeChainageMm;
  return [
    { supportSiteId: lower.supportSiteId, verticalForceN: forceN * (upper.routeChainageMm - chainageMm) / span },
    { supportSiteId: upper.supportSiteId, verticalForceN: forceN * (chainageMm - lower.routeChainageMm) / span },
  ];
}

function gaussianSolve(matrix, rhs, pivotTolerance) {
  const n = rhs.length;
  const a = matrix.map((row, index) => [...row, rhs[index]]);
  for (let column = 0; column < n; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < n; row += 1) if (Math.abs(a[row][column]) > Math.abs(a[pivotRow][column])) pivotRow = row;
    if (Math.abs(a[pivotRow][column]) <= pivotTolerance) throw coded('TL05_ORACLE_SINGULAR_ACTIVE_MATRIX');
    if (pivotRow !== column) [a[pivotRow], a[column]] = [a[column], a[pivotRow]];
    const pivot = a[column][column];
    for (let j = column; j <= n; j += 1) a[column][j] /= pivot;
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = a[row][column];
      for (let j = column; j <= n; j += 1) a[row][j] -= factor * a[column][j];
    }
  }
  const result = a.map((row) => row[n]);
  if (result.some((value) => !Number.isFinite(value))) throw coded('TL05_ORACLE_NONFINITE_SOLUTION');
  return result;
}
function dot(a, b) { return a.reduce((total, value, index) => total + value * b[index], 0); }
function sum(values) { return values.reduce((total, value) => total + value, 0); }
function maxAbs(values) { return values.length ? Math.max(...values.map((value) => Math.abs(value))) : 0; }
function ascii(a, b) { return String(a).localeCompare(String(b), 'en', { numeric: false, sensitivity: 'variant' }); }
function coded(code) { const error = new Error(code); error.code = code; return error; }
