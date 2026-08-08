import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../../core/shared-piping-model/immutable.js';
import {
  PREPRODUCTION_TL04_METHOD_ID,
  requirePreproductionThermalLiftoffActiveSetIntake,
} from './preproduction-thermal-liftoff-active-set-authority.js';

export const PREPRODUCTION_TL04_ACTIVE_SET_SCHEMA =
  'engineering-preproduction-thermal-liftoff-active-set/v1';
export const PREPRODUCTION_TL04_ACTIVE_SET_CURRENTNESS_SCHEMA =
  'engineering-preproduction-thermal-liftoff-active-set-currentness/v1';

const BLOCKED_STATUSES = new Set([
  'BLOCKED_NONCONVERGENT',
  'BLOCKED_RESIDUAL',
  'BLOCKED_NO_ACTIVE_SUPPORTS',
]);

/**
 * TL-04 pre-production active-set redistribution for the qualified TL-B
 * reduced-flexibility class.
 *
 * The cold contribution ledger is re-bracketed on each active support set.
 * The flexibility relation is applied to the complete reaction change from the
 * authorized all-contact cold state:
 *
 *   g = d_free + C * ((R_gravity(A) - R_cold) + DeltaR_thermal)
 *
 * Active-contact compatibility imposes g_A = 0. Inactive contacts carry zero
 * reaction and are re-added only when their solved gap penetrates beyond the
 * governed gap tolerance. No negative reaction is clamped.
 */
export function calculatePreproductionThermalLiftoffActiveSet(input) {
  exactKeys(input, ['executionId', 'executedAt', 'intake'], 'preproduction TL-04 execution input');
  const intake = requirePreproductionThermalLiftoffActiveSetIntake(input.intake);
  if (intake.status !== 'READY_FOR_TL04_ACTIVE_SET') {
    throw coded('PREPRODUCTION_TL04_INTAKE_NOT_READY');
  }
  const executionId = text(input.executionId, 'executionId');
  const executedAt = timestamp(input.executedAt, 'executedAt');
  const ids = [...intake.ordering];
  const supportById = new Map(intake.supports.map((row) => [row.supportSiteId, row]));
  const indexById = new Map(ids.map((id, index) => [id, index]));
  const coldVector = ids.map((id) => supportById.get(id).coldGravityReactionN);
  const freeOpeningVector = ids.map((id) => supportById.get(id).freeOpeningM);
  const allActive = new Set(ids);
  const coldRebracket = redistributeGravity(intake, allActive);
  const parityResiduals = ids.map((id, index) => coldRebracket.reactionsN[index] - coldVector[index]);
  const maxColdParityResidualN = maxAbs(parityResiduals);
  if (maxColdParityResidualN > intake.numericalControls.gravityParityToleranceN) {
    throw coded('PREPRODUCTION_TL04_COLD_GRAVITY_PARITY_MISMATCH', {
      maxColdParityResidualN,
      gravityParityToleranceN: intake.numericalControls.gravityParityToleranceN,
    });
  }

  let activeSet = new Set(ids);
  const visited = new Set();
  const history = [];
  const lastChanged = new Map(ids.map((id) => [id, 0]));
  let finalState = null;
  let blockedStatus = null;
  let blockers = [];

  for (let iteration = 1; iteration <= intake.numericalControls.maxIterations; iteration += 1) {
    const activeIds = ids.filter((id) => activeSet.has(id));
    const stateKey = activeIds.join('|');
    if (visited.has(stateKey)) {
      blockedStatus = 'BLOCKED_NONCONVERGENT';
      blockers = [issue('PREPRODUCTION_TL04_ACTIVE_SET_CYCLE_DETECTED', 'activeSet', 'TL-04 active set repeated before convergence.')];
      break;
    }
    visited.add(stateKey);
    if (activeIds.length === 0) {
      blockedStatus = 'BLOCKED_NO_ACTIVE_SUPPORTS';
      blockers = [issue('PREPRODUCTION_TL04_NO_ACTIVE_SUPPORTS', 'activeSet', 'TL-04 cannot continue without an active support set.')];
      break;
    }

    const gravity = redistributeGravity(intake, activeSet);
    const gravityDeltaN = gravity.reactionsN.map((value, index) => value - coldVector[index]);
    const activeIndices = activeIds.map((id) => indexById.get(id));
    const rhs = activeIndices.map((rowIndex) => -(
      freeOpeningVector[rowIndex]
      + dot(intake.flexibilityMatrixMPerN[rowIndex], gravityDeltaN)
    ));
    const activeMatrix = activeIndices.map((rowIndex) => (
      activeIndices.map((columnIndex) => intake.flexibilityMatrixMPerN[rowIndex][columnIndex])
    ));
    const solvedThermal = solveLinearSystem(
      activeMatrix,
      rhs,
      intake.numericalControls.matrixPivotToleranceMPerN,
    );
    const thermalIncrementN = ids.map(() => 0);
    activeIndices.forEach((fullIndex, localIndex) => { thermalIncrementN[fullIndex] = solvedThermal[localIndex]; });
    const totalReactionN = ids.map((id, index) => (
      activeSet.has(id) ? gravity.reactionsN[index] + thermalIncrementN[index] : 0
    ));
    const totalReactionChangeN = ids.map((id, index) => gravityDeltaN[index] + thermalIncrementN[index]);
    const hotGapM = ids.map((id, index) => (
      freeOpeningVector[index] + dot(intake.flexibilityMatrixMPerN[index], totalReactionChangeN)
    ));

    const releasedSupportSiteIds = activeIds
      .filter((id) => totalReactionN[indexById.get(id)] < -intake.reactionToleranceN)
      .sort(ascii);
    const inactiveIds = ids.filter((id) => !activeSet.has(id));
    const recontactedSupportSiteIds = inactiveIds
      .filter((id) => hotGapM[indexById.get(id)] < -intake.numericalControls.gapToleranceM)
      .sort(ascii);

    const iterationRecord = freezeHash({
      iteration,
      activeSupportSiteIds: activeIds,
      inactiveSupportSiteIds: inactiveIds,
      redistributedGravityReactionsN: vectorRows(ids, gravity.reactionsN),
      gravityRedistributionDeltaN: vectorRows(ids, gravityDeltaN),
      thermalIncrementN: vectorRows(ids, thermalIncrementN),
      trialTotalReactionN: vectorRows(ids, totalReactionN),
      solvedHotGapM: vectorRows(ids, hotGapM),
      releasedSupportSiteIds,
      recontactedSupportSiteIds,
      gravityForceResidualN: gravity.forceResidualN,
      gravityMomentResidualNmm: gravity.momentResidualNmm,
    });
    history.push(iterationRecord);
    for (const id of [...releasedSupportSiteIds, ...recontactedSupportSiteIds]) lastChanged.set(id, iteration);

    if (releasedSupportSiteIds.length === 0 && recontactedSupportSiteIds.length === 0) {
      finalState = {
        activeSet: new Set(activeSet),
        gravity,
        gravityDeltaN,
        thermalIncrementN,
        totalReactionN,
        hotGapM,
      };
      break;
    }

    const nextSet = new Set(activeSet);
    releasedSupportSiteIds.forEach((id) => nextSet.delete(id));
    recontactedSupportSiteIds.forEach((id) => nextSet.add(id));
    if (nextSet.size === 0) {
      blockedStatus = 'BLOCKED_NO_ACTIVE_SUPPORTS';
      blockers = [issue('PREPRODUCTION_TL04_NO_ACTIVE_SUPPORTS', 'activeSet', 'All unilateral contacts were released; qualified gravity re-bracketing cannot continue.')];
      break;
    }
    activeSet = nextSet;
  }

  if (!finalState && !blockedStatus) {
    blockedStatus = 'BLOCKED_NONCONVERGENT';
    blockers = [issue('PREPRODUCTION_TL04_MAX_ITERATIONS_EXCEEDED', 'activeSet', 'TL-04 did not converge within the governed iteration limit.')];
  }
  if (blockedStatus) {
    return requirePreproductionThermalLiftoffActiveSet(blockedResult({
      executionId,
      executedAt,
      intake,
      history,
      status: blockedStatus,
      blockers,
      maxColdParityResidualN,
    }));
  }

  const convergence = convergenceEvidence(intake, finalState, ids, supportById);
  if (!convergence.passed) {
    return requirePreproductionThermalLiftoffActiveSet(blockedResult({
      executionId,
      executedAt,
      intake,
      history,
      status: 'BLOCKED_RESIDUAL',
      blockers: convergence.blockers,
      maxColdParityResidualN,
      equilibrium: convergence.equilibrium,
    }));
  }

  const supportResults = ids.map((id, index) => {
    const source = supportById.get(id);
    const active = finalState.activeSet.has(id);
    return freezeHash({
      supportKey: source.supportKey,
      supportSiteId: id,
      routeChainageMm: source.routeChainageMm,
      state: active ? 'ACTIVE' : 'LIFTED',
      tl03Classification: source.tl03Classification,
      coldGravityReactionN: source.coldGravityReactionN,
      redistributedGravityReactionN: finalState.gravity.reactionsN[index],
      gravityRedistributionDeltaN: finalState.gravityDeltaN[index],
      thermalIncrementN: finalState.thermalIncrementN[index],
      solvedTotalReactionN: finalState.totalReactionN[index],
      coldGapM: source.coldGapM,
      freeOpeningM: source.freeOpeningM,
      solvedHotGapM: finalState.hotGapM[index],
      complementarityResidualNM: Math.abs(finalState.totalReactionN[index] * finalState.hotGapM[index]),
      lastStateChangeIteration: lastChanged.get(id),
      contactRowSemanticHash: source.contactRowSemanticHash,
      tl03SupportScreenSemanticHash: source.tl03SupportScreenSemanticHash,
    });
  });
  const summary = summarize(history, supportResults, maxColdParityResidualN);
  const material = {
    schema: PREPRODUCTION_TL04_ACTIVE_SET_SCHEMA,
    method: PREPRODUCTION_TL04_METHOD_ID,
    executionId,
    executedAt,
    stage: 'TL04_ACTIVE_SET_REDISTRIBUTION',
    finality: 'PREPRODUCTION_CONVERGED_TEMPLATE_SCREEN_ONLY',
    applicabilityClass: intake.applicabilityClass,
    datasetId: intake.datasetId,
    loadCaseId: intake.loadCaseId,
    coldGravityMethod: intake.coldGravityMethod,
    intakeSemanticHash: intake.semanticHash,
    sourceBindings: intake.sourceBindings,
    status: 'CONVERGED_PREPRODUCTION_SCREEN',
    initialActiveSupportSiteIds: ids,
    finalActiveSupportSiteIds: ids.filter((id) => finalState.activeSet.has(id)),
    finalLiftedSupportSiteIds: ids.filter((id) => !finalState.activeSet.has(id)),
    iterationHistory: history,
    supportResults,
    equilibrium: convergence.equilibrium,
    complementarity: convergence.complementarity,
    summary,
    blockers: [],
    policy: {
      productionCalculationConsumptionEnabled: false,
      productionMethodRegistrationPermitted: false,
      defaultUiExposurePermitted: false,
      gravitySourceRecalculated: false,
      gravityContributionRebracketingPerformed: true,
      coupledFlexibilitySolvePerformed: true,
      stiffnessSubmatrixReductionPerformed: false,
      activeSetRedistributionPerformed: true,
      recontactEvaluated: true,
      recontactPerformed: summary.recontactEventCount > 0,
      negativeReactionClamped: false,
      screenedConvergedReactionCalculated: true,
      productionFinalReactionCalculated: false,
      finalHotReactionPublicationPermitted: false,
      springMechanicsExecuted: false,
      frictionMechanicsExecuted: false,
    },
  };
  return requirePreproductionThermalLiftoffActiveSet(freezeHash(material));
}

export function requirePreproductionThermalLiftoffActiveSet(value) {
  exactKeys(value, [
    'schema', 'method', 'executionId', 'executedAt', 'stage', 'finality',
    'applicabilityClass', 'datasetId', 'loadCaseId', 'coldGravityMethod',
    'intakeSemanticHash', 'sourceBindings', 'status',
    'initialActiveSupportSiteIds', 'finalActiveSupportSiteIds',
    'finalLiftedSupportSiteIds', 'iterationHistory', 'supportResults',
    'equilibrium', 'complementarity', 'summary', 'blockers', 'policy', 'semanticHash',
  ], 'preproduction TL-04 active-set result');
  if (value.schema !== PREPRODUCTION_TL04_ACTIVE_SET_SCHEMA
      || value.method !== PREPRODUCTION_TL04_METHOD_ID
      || value.stage !== 'TL04_ACTIVE_SET_REDISTRIBUTION') {
    throw coded('PREPRODUCTION_TL04_RESULT_IDENTITY_INVALID');
  }
  text(value.executionId, 'executionId');
  timestamp(value.executedAt, 'executedAt');
  text(value.applicabilityClass, 'applicabilityClass');
  text(value.datasetId, 'datasetId');
  text(value.loadCaseId, 'loadCaseId');
  hash(value.intakeSemanticHash, 'intakeSemanticHash');
  requireSourceBindings(value.sourceBindings);
  if (!Array.isArray(value.initialActiveSupportSiteIds)
      || !Array.isArray(value.finalActiveSupportSiteIds)
      || !Array.isArray(value.finalLiftedSupportSiteIds)
      || !Array.isArray(value.iterationHistory)
      || !Array.isArray(value.supportResults)
      || !Array.isArray(value.blockers)) {
    throw new TypeError('TL-04 result arrays are invalid.');
  }
  value.iterationHistory.forEach(requireIterationRecord);
  const converged = value.status === 'CONVERGED_PREPRODUCTION_SCREEN';
  if (!converged && !BLOCKED_STATUSES.has(value.status)) {
    throw coded('PREPRODUCTION_TL04_RESULT_STATUS_INVALID');
  }
  if (converged) {
    if (value.finality !== 'PREPRODUCTION_CONVERGED_TEMPLATE_SCREEN_ONLY'
        || value.blockers.length !== 0 || value.supportResults.length === 0) {
      throw coded('PREPRODUCTION_TL04_CONVERGED_RESULT_INVALID');
    }
    const ids = value.supportResults.map(requireSupportResult);
    if (JSON.stringify(ids) !== JSON.stringify(value.initialActiveSupportSiteIds)) {
      throw coded('PREPRODUCTION_TL04_RESULT_SUPPORT_ORDER_INVALID');
    }
    const expectedActive = value.supportResults.filter((row) => row.state === 'ACTIVE').map((row) => row.supportSiteId);
    const expectedLifted = value.supportResults.filter((row) => row.state === 'LIFTED').map((row) => row.supportSiteId);
    if (JSON.stringify(expectedActive) !== JSON.stringify(value.finalActiveSupportSiteIds)
        || JSON.stringify(expectedLifted) !== JSON.stringify(value.finalLiftedSupportSiteIds)) {
      throw coded('PREPRODUCTION_TL04_RESULT_ACTIVE_SET_MISMATCH');
    }
    requireEquilibrium(value.equilibrium);
    requireComplementarity(value.complementarity);
    const expectedSummary = summarize(value.iterationHistory, value.supportResults, value.summary.maxColdParityResidualN);
    if (semanticHash(expectedSummary) !== semanticHash(value.summary)) {
      throw coded('PREPRODUCTION_TL04_RESULT_SUMMARY_INVALID');
    }
  } else {
    if (value.finality !== 'PREPRODUCTION_BLOCKED_NO_FINAL_REACTION_SET'
        || value.supportResults.length !== 0
        || value.finalActiveSupportSiteIds.length !== 0
        || value.finalLiftedSupportSiteIds.length !== 0
        || value.blockers.length === 0) {
      throw coded('PREPRODUCTION_TL04_BLOCKED_RESULT_PARTIAL_INVALID');
    }
  }
  const policy = value.policy || {};
  if (policy.productionCalculationConsumptionEnabled !== false
      || policy.productionMethodRegistrationPermitted !== false
      || policy.defaultUiExposurePermitted !== false
      || policy.gravitySourceRecalculated !== false
      || policy.gravityContributionRebracketingPerformed !== true
      || policy.coupledFlexibilitySolvePerformed !== true
      || policy.stiffnessSubmatrixReductionPerformed !== false
      || policy.activeSetRedistributionPerformed !== true
      || policy.recontactEvaluated !== true
      || policy.negativeReactionClamped !== false
      || policy.productionFinalReactionCalculated !== false
      || policy.finalHotReactionPublicationPermitted !== false
      || policy.springMechanicsExecuted !== false
      || policy.frictionMechanicsExecuted !== false
      || policy.screenedConvergedReactionCalculated !== converged) {
    throw coded('PREPRODUCTION_TL04_RESULT_POLICY_INVALID');
  }
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) throw coded('PREPRODUCTION_TL04_RESULT_HASH_MISMATCH');
  return deepFreeze(structuredClone(value));
}

export function assessPreproductionThermalLiftoffActiveSetCurrentness(resultValue, intakeValue) {
  const result = requirePreproductionThermalLiftoffActiveSet(resultValue);
  const intake = requirePreproductionThermalLiftoffActiveSetIntake(intakeValue);
  const differences = [];
  if (result.intakeSemanticHash !== intake.semanticHash) differences.push('intakeSemanticHash');
  for (const key of Object.keys(result.sourceBindings)) {
    if (result.sourceBindings[key] !== intake.sourceBindings[key]) differences.push(key);
  }
  return freezeHash({
    schema: PREPRODUCTION_TL04_ACTIVE_SET_CURRENTNESS_SCHEMA,
    resultSemanticHash: result.semanticHash,
    observedIntakeSemanticHash: intake.semanticHash,
    status: differences.length ? 'STALE_RERUN_REQUIRED' : 'CURRENT',
    differences: [...new Set(differences)].sort(ascii),
    productionCalculationConsumptionEnabled: false,
    finalHotReactionPublicationPermitted: false,
  });
}

function redistributeGravity(intake, activeSet) {
  const supports = intake.supports
    .filter((row) => activeSet.has(row.supportSiteId))
    .sort((a, b) => a.routeChainageMm - b.routeChainageMm || ascii(a.supportSiteId, b.supportSiteId));
  if (supports.length === 0) throw coded('PREPRODUCTION_TL04_GRAVITY_NO_ACTIVE_SUPPORTS');
  const reactions = new Map(intake.ordering.map((id) => [id, 0]));
  let appliedForceN = 0;
  let appliedMomentNmm = 0;
  const allocations = [];
  for (const contribution of intake.gravityContributions) {
    const point = distributePoint(contribution.chainageMm, contribution.verticalForceN, supports);
    if (!point) {
      throw coded('PREPRODUCTION_TL04_GRAVITY_REBRACKETING_UNRESOLVED', {
        contributionId: contribution.contributionId,
        chainageMm: contribution.chainageMm,
        activeSupportSiteIds: supports.map((row) => row.supportSiteId),
      });
    }
    for (const allocation of point) {
      reactions.set(allocation.supportSiteId, reactions.get(allocation.supportSiteId) + allocation.verticalForceN);
    }
    allocations.push(freezeHash({
      contributionId: contribution.contributionId,
      sourceContributionSemanticHash: contribution.sourceContributionSemanticHash,
      allocations: point,
    }));
    appliedForceN += contribution.verticalForceN;
    appliedMomentNmm += contribution.verticalForceN * contribution.chainageMm;
  }
  const reactionsN = intake.ordering.map((id) => reactions.get(id));
  const reactionMomentNmm = intake.ordering.reduce((sumValue, id, index) => (
    sumValue + reactionsN[index] * intake.supports[index].routeChainageMm
  ), 0);
  return {
    reactionsN,
    allocations,
    appliedForceN,
    appliedMomentNmm,
    reactionForceN: sum(reactionsN),
    reactionMomentNmm,
    forceResidualN: sum(reactionsN) - appliedForceN,
    momentResidualNmm: reactionMomentNmm - appliedMomentNmm,
  };
}

function distributePoint(chainageMm, forceN, supports) {
  const exact = supports.find((support) => support.routeChainageMm === chainageMm);
  if (exact) return [deepFreeze({ supportSiteId: exact.supportSiteId, routeChainageMm: exact.routeChainageMm, verticalForceN: forceN })];
  const lower = [...supports].reverse().find((support) => support.routeChainageMm < chainageMm);
  const upper = supports.find((support) => support.routeChainageMm > chainageMm);
  if (!lower || !upper) return null;
  const span = upper.routeChainageMm - lower.routeChainageMm;
  return deepFreeze([
    { supportSiteId: lower.supportSiteId, routeChainageMm: lower.routeChainageMm, verticalForceN: forceN * (upper.routeChainageMm - chainageMm) / span },
    { supportSiteId: upper.supportSiteId, routeChainageMm: upper.routeChainageMm, verticalForceN: forceN * (chainageMm - lower.routeChainageMm) / span },
  ]);
}

function solveLinearSystem(matrix, rhs, pivotTolerance) {
  const n = rhs.length;
  const a = matrix.map((row, index) => [...row, rhs[index]]);
  for (let column = 0; column < n; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(a[row][column]) > Math.abs(a[pivotRow][column])) pivotRow = row;
    }
    if (Math.abs(a[pivotRow][column]) <= pivotTolerance) {
      throw coded('PREPRODUCTION_TL04_FLEXIBILITY_MATRIX_SINGULAR', { column, pivot: a[pivotRow][column], pivotTolerance });
    }
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
  if (result.some((value) => !Number.isFinite(value))) throw coded('PREPRODUCTION_TL04_FLEXIBILITY_SOLVE_NONFINITE');
  return result;
}

function convergenceEvidence(intake, state, ids, supportById) {
  const controls = intake.numericalControls;
  const activeReactionViolationN = maxAbs(ids.map((id, index) => (
    state.activeSet.has(id) ? Math.min(0, state.totalReactionN[index]) : 0
  )));
  const inactiveGapPenetrationM = maxAbs(ids.map((id, index) => (
    state.activeSet.has(id) ? 0 : Math.min(0, state.hotGapM[index])
  )));
  const activeGapResidualM = maxAbs(ids.map((id, index) => (
    state.activeSet.has(id) ? state.hotGapM[index] : 0
  )));
  const complementarityResidualNM = maxAbs(ids.map((id, index) => state.totalReactionN[index] * state.hotGapM[index]));
  const thermalEquivalentForceN = sum(state.thermalIncrementN);
  const thermalEquivalentMomentNmm = ids.reduce((total, id, index) => (
    total + state.thermalIncrementN[index] * supportById.get(id).routeChainageMm
  ), 0);
  const totalReactionForceN = sum(state.totalReactionN);
  const totalReactionMomentNmm = ids.reduce((total, id, index) => (
    total + state.totalReactionN[index] * supportById.get(id).routeChainageMm
  ), 0);
  const expectedForceN = state.gravity.appliedForceN + thermalEquivalentForceN;
  const expectedMomentNmm = state.gravity.appliedMomentNmm + thermalEquivalentMomentNmm;
  const equilibrium = deepFreeze({
    gravityAppliedForceN: state.gravity.appliedForceN,
    gravityAppliedMomentNmm: state.gravity.appliedMomentNmm,
    redistributedGravityForceN: state.gravity.reactionForceN,
    redistributedGravityMomentNmm: state.gravity.reactionMomentNmm,
    gravityForceResidualN: state.gravity.forceResidualN,
    gravityMomentResidualNmm: state.gravity.momentResidualNmm,
    thermalEquivalentForceN,
    thermalEquivalentMomentNmm,
    totalReactionForceN,
    totalReactionMomentNmm,
    expectedForceN,
    expectedMomentNmm,
    forceResidualN: totalReactionForceN - expectedForceN,
    momentResidualNmm: totalReactionMomentNmm - expectedMomentNmm,
    forceToleranceN: controls.forceToleranceN,
    momentToleranceNmm: controls.momentToleranceNmm,
  });
  const complementarity = deepFreeze({
    activeReactionViolationN,
    reactionToleranceN: intake.reactionToleranceN,
    activeGapResidualM,
    inactiveGapPenetrationM,
    gapToleranceM: controls.gapToleranceM,
    complementarityResidualNM,
    complementarityToleranceNM: controls.complementarityToleranceNM,
  });
  const blockers = [];
  if (activeReactionViolationN > intake.reactionToleranceN) blockers.push(issue('PREPRODUCTION_TL04_ACTIVE_REACTION_RESIDUAL_FAILED', 'convergence', 'Active unilateral reaction violates governed tolerance.'));
  if (activeGapResidualM > controls.gapToleranceM) blockers.push(issue('PREPRODUCTION_TL04_ACTIVE_GAP_RESIDUAL_FAILED', 'convergence', 'Active-contact gap residual exceeds governed tolerance.'));
  if (inactiveGapPenetrationM > controls.gapToleranceM) blockers.push(issue('PREPRODUCTION_TL04_INACTIVE_GAP_RESIDUAL_FAILED', 'convergence', 'Inactive contact penetrates beyond governed tolerance.'));
  if (complementarityResidualNM > controls.complementarityToleranceNM) blockers.push(issue('PREPRODUCTION_TL04_COMPLEMENTARITY_RESIDUAL_FAILED', 'convergence', 'Complementarity residual exceeds governed tolerance.'));
  if (Math.abs(equilibrium.gravityForceResidualN) > controls.forceToleranceN
      || Math.abs(equilibrium.forceResidualN) > controls.forceToleranceN) blockers.push(issue('PREPRODUCTION_TL04_FORCE_EQUILIBRIUM_FAILED', 'convergence', 'TL-04 force equilibrium residual exceeds governed tolerance.'));
  if (Math.abs(equilibrium.gravityMomentResidualNmm) > controls.momentToleranceNmm
      || Math.abs(equilibrium.momentResidualNmm) > controls.momentToleranceNmm) blockers.push(issue('PREPRODUCTION_TL04_MOMENT_EQUILIBRIUM_FAILED', 'convergence', 'TL-04 moment equilibrium residual exceeds governed tolerance.'));
  return { passed: blockers.length === 0, blockers, equilibrium, complementarity };
}

function blockedResult({ executionId, executedAt, intake, history, status, blockers, maxColdParityResidualN, equilibrium = null }) {
  const summary = {
    iterationCount: history.length,
    releaseEventCount: history.reduce((n, row) => n + row.releasedSupportSiteIds.length, 0),
    recontactEventCount: history.reduce((n, row) => n + row.recontactedSupportSiteIds.length, 0),
    finalActiveSupportCount: 0,
    finalLiftedSupportCount: 0,
    tl03LiftoffCandidateCount: intake.summary.tl03LiftoffCandidateCount,
    tl03CandidateRecontactedCount: 0,
    maxColdParityResidualN,
  };
  return freezeHash({
    schema: PREPRODUCTION_TL04_ACTIVE_SET_SCHEMA,
    method: PREPRODUCTION_TL04_METHOD_ID,
    executionId,
    executedAt,
    stage: 'TL04_ACTIVE_SET_REDISTRIBUTION',
    finality: 'PREPRODUCTION_BLOCKED_NO_FINAL_REACTION_SET',
    applicabilityClass: intake.applicabilityClass,
    datasetId: intake.datasetId,
    loadCaseId: intake.loadCaseId,
    coldGravityMethod: intake.coldGravityMethod,
    intakeSemanticHash: intake.semanticHash,
    sourceBindings: intake.sourceBindings,
    status,
    initialActiveSupportSiteIds: [...intake.ordering],
    finalActiveSupportSiteIds: [],
    finalLiftedSupportSiteIds: [],
    iterationHistory: history,
    supportResults: [],
    equilibrium,
    complementarity: null,
    summary,
    blockers,
    policy: {
      productionCalculationConsumptionEnabled: false,
      productionMethodRegistrationPermitted: false,
      defaultUiExposurePermitted: false,
      gravitySourceRecalculated: false,
      gravityContributionRebracketingPerformed: true,
      coupledFlexibilitySolvePerformed: true,
      stiffnessSubmatrixReductionPerformed: false,
      activeSetRedistributionPerformed: true,
      recontactEvaluated: true,
      recontactPerformed: summary.recontactEventCount > 0,
      negativeReactionClamped: false,
      screenedConvergedReactionCalculated: false,
      productionFinalReactionCalculated: false,
      finalHotReactionPublicationPermitted: false,
      springMechanicsExecuted: false,
      frictionMechanicsExecuted: false,
    },
  });
}

function summarize(history, supportResults, maxColdParityResidualN = 0) {
  const tl03Liftoff = supportResults.filter((row) => row.tl03Classification === 'LIFTOFF_CANDIDATE');
  return {
    iterationCount: history.length,
    releaseEventCount: history.reduce((n, row) => n + row.releasedSupportSiteIds.length, 0),
    recontactEventCount: history.reduce((n, row) => n + row.recontactedSupportSiteIds.length, 0),
    finalActiveSupportCount: supportResults.filter((row) => row.state === 'ACTIVE').length,
    finalLiftedSupportCount: supportResults.filter((row) => row.state === 'LIFTED').length,
    tl03LiftoffCandidateCount: tl03Liftoff.length,
    tl03CandidateRecontactedCount: tl03Liftoff.filter((row) => row.state === 'ACTIVE' && row.lastStateChangeIteration > 0).length,
    maxColdParityResidualN,
  };
}

function requireSupportResult(value) {
  exactKeys(value, [
    'supportKey', 'supportSiteId', 'routeChainageMm', 'state', 'tl03Classification',
    'coldGravityReactionN', 'redistributedGravityReactionN', 'gravityRedistributionDeltaN',
    'thermalIncrementN', 'solvedTotalReactionN', 'coldGapM', 'freeOpeningM',
    'solvedHotGapM', 'complementarityResidualNM', 'lastStateChangeIteration',
    'contactRowSemanticHash', 'tl03SupportScreenSemanticHash', 'semanticHash',
  ], 'TL-04 support result');
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) throw coded('PREPRODUCTION_TL04_SUPPORT_RESULT_HASH_MISMATCH');
  const id = text(value.supportSiteId, 'supportSiteId');
  if (!['ACTIVE', 'LIFTED'].includes(value.state)) throw coded('PREPRODUCTION_TL04_SUPPORT_STATE_INVALID');
  for (const key of ['coldGravityReactionN', 'redistributedGravityReactionN', 'gravityRedistributionDeltaN', 'thermalIncrementN', 'solvedTotalReactionN', 'coldGapM', 'freeOpeningM', 'solvedHotGapM', 'complementarityResidualNM']) finite(value[key], key);
  if (value.solvedTotalReactionN !== value.redistributedGravityReactionN + value.thermalIncrementN) throw coded('PREPRODUCTION_TL04_SUPPORT_REACTION_ARITHMETIC_MISMATCH');
  if (value.state === 'LIFTED' && value.solvedTotalReactionN !== 0) throw coded('PREPRODUCTION_TL04_LIFTED_REACTION_NONZERO');
  if (!Number.isInteger(value.lastStateChangeIteration) || value.lastStateChangeIteration < 0) throw coded('PREPRODUCTION_TL04_SUPPORT_CHANGE_ITERATION_INVALID');
  hash(value.contactRowSemanticHash, 'contactRowSemanticHash');
  hash(value.tl03SupportScreenSemanticHash, 'tl03SupportScreenSemanticHash');
  return id;
}
function requireIterationRecord(value) {
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) throw coded('PREPRODUCTION_TL04_ITERATION_HASH_MISMATCH');
  if (!Number.isInteger(value.iteration) || value.iteration <= 0) throw coded('PREPRODUCTION_TL04_ITERATION_NUMBER_INVALID');
  for (const key of ['activeSupportSiteIds', 'inactiveSupportSiteIds', 'releasedSupportSiteIds', 'recontactedSupportSiteIds', 'redistributedGravityReactionsN', 'gravityRedistributionDeltaN', 'thermalIncrementN', 'trialTotalReactionN', 'solvedHotGapM']) {
    if (!Array.isArray(value[key])) throw coded('PREPRODUCTION_TL04_ITERATION_ARRAY_INVALID');
  }
  finite(value.gravityForceResidualN, 'gravityForceResidualN');
  finite(value.gravityMomentResidualNmm, 'gravityMomentResidualNmm');
}
function requireEquilibrium(value) {
  if (!isPlainRecord(value)) throw coded('PREPRODUCTION_TL04_EQUILIBRIUM_INVALID');
  for (const item of Object.values(value)) finite(item, 'equilibrium');
}
function requireComplementarity(value) {
  if (!isPlainRecord(value)) throw coded('PREPRODUCTION_TL04_COMPLEMENTARITY_INVALID');
  for (const item of Object.values(value)) finite(item, 'complementarity');
}
function requireSourceBindings(value) {
  if (!isPlainRecord(value)) throw coded('PREPRODUCTION_TL04_SOURCE_BINDINGS_INVALID');
  Object.entries(value).forEach(([key, item]) => hash(item, key));
}
function vectorRows(ids, values) { return ids.map((supportSiteId, index) => deepFreeze({ supportSiteId, value: values[index] })); }
function dot(a, b) { return a.reduce((total, value, index) => total + value * b[index], 0); }
function sum(values) { return values.reduce((total, value) => total + value, 0); }
function maxAbs(values) { return values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0); }
function issue(code, scope, message) { return deepFreeze({ code, severity: 'ERROR', scope, message, details: null }); }
function freezeHash(material) { return deepFreeze({ ...material, semanticHash: semanticHash(material) }); }
function exactKeys(value, keys, label) {
  if (!isPlainRecord(value)
      || JSON.stringify(Object.keys(value).sort(ascii)) !== JSON.stringify([...keys].sort(ascii))) {
    throw new TypeError(`${label} contains unexpected or missing keys.`);
  }
}
function text(value, label) { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be non-empty.`); return value; }
function timestamp(value, label) { const result = text(value, label); if (new Date(result).toISOString() !== result) throw new TypeError(`${label} must be canonical ISO-8601.`); return result; }
function finite(value, label) { if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`); return value; }
function hash(value, label) { if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) throw new TypeError(`${label} must be an FNV-1a hash.`); return value; }
function ascii(a, b) { return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0; }
function coded(code, details = null) { const error = new Error(code); error.code = code; error.details = details; return error; }
