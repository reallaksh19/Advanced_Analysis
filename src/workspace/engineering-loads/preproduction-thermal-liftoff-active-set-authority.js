import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord, stringValue } from '../../core/shared-piping-model/immutable.js';
import { requireAuthorizedEmpiricalLoadExecutionV8 } from './authorized-empirical-load-execution-v8.js';
import { requirePreproductionSupportContactAuthority } from './preproduction-support-contact-authority.js';
import { requirePreproductionThermalLiftoffPrerequisiteAuthority } from './preproduction-thermal-liftoff-prerequisite-authority.js';
import { requirePreproductionThermalLiftoffStiffnessEvidence } from './preproduction-thermal-liftoff-mechanics-authority.js';
import { requirePreproductionThermalLiftoffLocalScreen } from './preproduction-thermal-liftoff-local-screen.js';

export const PREPRODUCTION_TL04_NUMERICAL_AUTHORITY_SCHEMA =
  'engineering-preproduction-thermal-liftoff-active-set-numerical-authority/v1';
export const PREPRODUCTION_TL04_ACTIVE_SET_INTAKE_SCHEMA =
  'engineering-preproduction-thermal-liftoff-active-set-intake/v1';
export const PREPRODUCTION_TL04_METHOD_ID = 'THERMAL_LIFTOFF_ACTIVE_SET_V1';

const NUMERICAL_SOURCE_KINDS = new Set([
  'BENCHMARK_QUALIFIED',
  'APPROVED_ENGINEERING_DATA',
  'MEASURED_TEST',
]);

export function createPreproductionThermalLiftoffActiveSetNumericalAuthority(input) {
  exactKeys(input, [
    'authorityId', 'gapToleranceM', 'complementarityToleranceNM',
    'gravityParityToleranceN', 'forceToleranceN', 'momentToleranceNmm',
    'matrixPivotToleranceMPerN', 'matrixSymmetryToleranceMPerN',
    'maxIterations', 'source', 'benchmarkReference', 'qualification',
  ], 'TL-04 numerical authority input');
  const source = sourceIdentity(input.source, 'TL-04 numerical source');
  const blockers = [];
  if (input.qualification !== 'QUALIFIED' || !NUMERICAL_SOURCE_KINDS.has(source.sourceKind)) {
    blockers.push(issue(
      'PREPRODUCTION_TL04_NUMERICAL_AUTHORITY_UNQUALIFIED',
      'numericalAuthority',
      'TL-04 numerical controls require explicit qualified source custody.',
    ));
  }
  const material = {
    schema: PREPRODUCTION_TL04_NUMERICAL_AUTHORITY_SCHEMA,
    authorityId: text(input.authorityId, 'authorityId'),
    gapToleranceM: nonnegative(input.gapToleranceM, 'gapToleranceM'),
    complementarityToleranceNM: nonnegative(input.complementarityToleranceNM, 'complementarityToleranceNM'),
    gravityParityToleranceN: nonnegative(input.gravityParityToleranceN, 'gravityParityToleranceN'),
    forceToleranceN: nonnegative(input.forceToleranceN, 'forceToleranceN'),
    momentToleranceNmm: nonnegative(input.momentToleranceNmm, 'momentToleranceNmm'),
    matrixPivotToleranceMPerN: positive(input.matrixPivotToleranceMPerN, 'matrixPivotToleranceMPerN'),
    matrixSymmetryToleranceMPerN: nonnegative(input.matrixSymmetryToleranceMPerN, 'matrixSymmetryToleranceMPerN'),
    maxIterations: positiveInteger(input.maxIterations, 'maxIterations'),
    source,
    benchmarkReference: benchmark(input.benchmarkReference),
    qualification: blockers.length ? 'UNRESOLVED' : 'QUALIFIED',
    blockers: uniqueIssues(blockers),
    policy: {
      defaultTolerancePermitted: false,
      solverInternalToleranceAutomaticallyPromotable: false,
      productionCalculationConsumptionEnabled: false,
      productionMethodRegistrationPermitted: false,
    },
  };
  return freezeHash(material);
}

export function requirePreproductionThermalLiftoffActiveSetNumericalAuthority(value) {
  if (value?.schema !== PREPRODUCTION_TL04_NUMERICAL_AUTHORITY_SCHEMA) {
    throw coded('PREPRODUCTION_TL04_NUMERICAL_SCHEMA_INVALID');
  }
  const normalized = createPreproductionThermalLiftoffActiveSetNumericalAuthority({
    authorityId: value.authorityId,
    gapToleranceM: value.gapToleranceM,
    complementarityToleranceNM: value.complementarityToleranceNM,
    gravityParityToleranceN: value.gravityParityToleranceN,
    forceToleranceN: value.forceToleranceN,
    momentToleranceNmm: value.momentToleranceNmm,
    matrixPivotToleranceMPerN: value.matrixPivotToleranceMPerN,
    matrixSymmetryToleranceMPerN: value.matrixSymmetryToleranceMPerN,
    maxIterations: value.maxIterations,
    source: value.source,
    benchmarkReference: value.benchmarkReference,
    qualification: value.qualification,
  });
  if (normalized.semanticHash !== value.semanticHash) {
    throw coded('PREPRODUCTION_TL04_NUMERICAL_HASH_MISMATCH');
  }
  return normalized;
}

/**
 * Reconciles TL-03 evidence with a qualified reduced vertical flexibility
 * matrix and explicit TL-04 numerical controls. This is still an intake gate:
 * no gravity re-bracketing, matrix solve, contact release or re-contact occurs
 * here.
 *
 * V1 deliberately admits only a narrow TL-B class: one route, all cold support
 * sites represented as qualified unilateral rests, no springs/friction, and a
 * REDUCED_VERTICAL_FLEXIBILITY_MATRIX_EVIDENCE operator covering every site.
 * Generic stiffness-submatrix deletion is not authorized by this contract.
 */
export function buildPreproductionThermalLiftoffActiveSetIntake(input) {
  exactKeys(input, [
    'coldGravityExecution', 'contactAuthority', 'prerequisiteAuthority',
    'localScreen', 'flexibilityEvidence', 'numericalAuthority',
  ], 'preproduction TL-04 active-set intake input');
  const cold = requireAuthorizedEmpiricalLoadExecutionV8(input.coldGravityExecution);
  const contact = requirePreproductionSupportContactAuthority(input.contactAuthority);
  const prerequisite = requirePreproductionThermalLiftoffPrerequisiteAuthority(input.prerequisiteAuthority);
  const localScreen = requirePreproductionThermalLiftoffLocalScreen(input.localScreen);
  const flexibility = requirePreproductionThermalLiftoffStiffnessEvidence(input.flexibilityEvidence);
  const numerical = requirePreproductionThermalLiftoffActiveSetNumericalAuthority(input.numericalAuthority);
  const blockers = [];

  if (cold.status !== 'CALCULATED'
      || cold.distribution?.status !== 'CALCULATED'
      || cold.distribution?.freshness?.status !== 'CURRENT') {
    blockers.push(issue('PREPRODUCTION_TL04_COLD_GRAVITY_NOT_CURRENT', 'authority', 'TL-04 requires a current calculated V8 cold-gravity receipt.'));
  }
  if (contact.status !== 'READY_FOR_PREPRODUCTION_CONTACT_AUTHORITY') {
    blockers.push(issue('PREPRODUCTION_TL04_CONTACT_AUTHORITY_BLOCKED', 'authority', 'Current support/contact authority is not ready.'));
  }
  if (prerequisite.status !== 'READY_FOR_TL03_PREREQUISITE_BRIDGE') {
    blockers.push(issue('PREPRODUCTION_TL04_PREREQUISITE_AUTHORITY_BLOCKED', 'authority', 'Current TL-01/TL-02/tolerance prerequisite authority is not ready.'));
  }
  if (localScreen.status !== 'SCREEN_COMPLETE'
      || localScreen.stage !== 'TL03_LOCAL_SCREEN_ONLY'
      || localScreen.finality !== 'NON_FINAL_NO_REDISTRIBUTION') {
    blockers.push(issue('PREPRODUCTION_TL04_TL03_SCREEN_INVALID', 'authority', 'TL-04 requires the exact non-final TL-03 screen result.'));
  }
  if (numerical.qualification !== 'QUALIFIED') {
    blockers.push(issue('PREPRODUCTION_TL04_NUMERICAL_AUTHORITY_BLOCKED', 'authority', 'Explicit qualified TL-04 numerical controls are required.'));
  }
  if (cold.datasetId !== contact.datasetId
      || cold.datasetId !== prerequisite.datasetId
      || cold.datasetId !== localScreen.datasetId) {
    blockers.push(issue('PREPRODUCTION_TL04_DATASET_MISMATCH', 'authority', 'TL-04 authority inputs must belong to one dataset.'));
  }
  if (cold.executedMethod !== localScreen.coldGravityMethod
      || cold.distribution?.method !== cold.executedMethod
      || cold.distribution?.sourceAxisBasis !== 'Z_UP'
      || cold.distribution?.verticalForceConvention !== 'positive reaction opposes source-axis gravity') {
    blockers.push(issue('PREPRODUCTION_TL04_COLD_GRAVITY_METHOD_OR_SIGN_MISMATCH', 'authority', 'Cold gravity method/sign identity differs from TL-03 custody.'));
  }
  if (prerequisite.loadCaseId !== localScreen.loadCaseId) {
    blockers.push(issue('PREPRODUCTION_TL04_LOAD_CASE_MISMATCH', 'authority', 'TL-04 must use the exact governed TL-03 displacement/gravity load case.'));
  }
  const sourceBindingsMatch = localScreen.sourceBindings?.coldGravityExecutionSemanticHash === cold.semanticHash
    && localScreen.sourceBindings?.coldGravityDistributionSemanticHash === cold.distributionSemanticHash
    && localScreen.sourceBindings?.contactAuthoritySemanticHash === contact.semanticHash
    && localScreen.sourceBindings?.prerequisiteAuthoritySemanticHash === prerequisite.semanticHash;
  if (!sourceBindingsMatch) {
    blockers.push(issue('PREPRODUCTION_TL04_TL03_SOURCE_BINDING_STALE', 'authority', 'TL-03 result is not bound to the exact current cold/contact/prerequisite authority set.'));
  }
  if (prerequisite.contactAuthoritySemanticHash !== contact.semanticHash) {
    blockers.push(issue('PREPRODUCTION_TL04_CONTACT_BINDING_STALE', 'authority', 'Prerequisite authority is not bound to the exact current contact authority.'));
  }
  if (localScreen.unscreenedColdSupportSiteIds.length !== 0) {
    blockers.push(issue(
      'PREPRODUCTION_TL04_V1_COMPLETE_CONTACT_COVERAGE_REQUIRED',
      'authority',
      'TL-04 V1 qualifies only the narrow class where every cold support participates in the coupled unilateral-contact model.',
      { unscreenedColdSupportSiteIds: localScreen.unscreenedColdSupportSiteIds },
    ));
  }

  if (flexibility.qualification !== 'QUALIFIED'
      || flexibility.representation !== 'REDUCED_VERTICAL_FLEXIBILITY_MATRIX_EVIDENCE'
      || flexibility.units !== 'M_PER_N'
      || flexibility.data?.kind !== 'MATRIX') {
    blockers.push(issue(
      'PREPRODUCTION_TL04_FLEXIBILITY_AUTHORITY_REQUIRED',
      'authority',
      'TL-04 V1 requires qualified reduced vertical flexibility evidence in M_PER_N.',
    ));
  }
  if (!prerequisite.retainedInfluenceEvidenceSemanticHashes.includes(flexibility.semanticHash)) {
    blockers.push(issue(
      'PREPRODUCTION_TL04_FLEXIBILITY_NOT_RETAINED_BY_PREREQUISITE_AUTHORITY',
      'authority',
      'Coupled flexibility evidence must be retained by the exact current prerequisite authority.',
    ));
  }
  if (flexibility.applicability?.contactAuthoritySemanticHash !== contact.semanticHash) {
    blockers.push(issue('PREPRODUCTION_TL04_FLEXIBILITY_APPLICABILITY_STALE', 'authority', 'Flexibility evidence is not bound to the exact current contact authority.'));
  }

  const contactReady = contact.rows
    .filter((row) => row.tl03Status === 'READY_FOR_TL03_CONTACT_INTAKE')
    .sort(bySite);
  const screenRows = [...localScreen.supportScreens].sort(bySite);
  const prerequisiteRows = [...prerequisite.rows].sort(bySite);
  const screenIds = screenRows.map((row) => row.supportSiteId);
  const contactIds = contactReady.map((row) => row.supportSiteId);
  const prerequisiteIds = prerequisiteRows.map((row) => row.supportSiteId);
  if (!sameSet(screenIds, contactIds) || !sameSet(screenIds, prerequisiteIds)) {
    blockers.push(issue('PREPRODUCTION_TL04_SUPPORT_COVERAGE_MISMATCH', 'authority', 'TL-04 support coverage must match TL-03, contact and prerequisite authority exactly.'));
  }
  if (!sameSet(screenIds, flexibility.ordering)) {
    blockers.push(issue('PREPRODUCTION_TL04_FLEXIBILITY_ORDERING_COVERAGE_MISMATCH', 'authority', 'Flexibility ordering must cover exactly every TL-04 support site.'));
  }

  const contactBySite = uniqueMap(contactReady, 'supportSiteId', blockers, 'PREPRODUCTION_TL04_CONTACT_SITE_AMBIGUOUS');
  const prereqBySite = uniqueMap(prerequisiteRows, 'supportSiteId', blockers, 'PREPRODUCTION_TL04_PREREQUISITE_SITE_AMBIGUOUS');
  const screenBySite = uniqueMap(screenRows, 'supportSiteId', blockers, 'PREPRODUCTION_TL04_SCREEN_SITE_AMBIGUOUS');
  const routes = new Set();
  const supports = [];
  for (const supportSiteId of flexibility.ordering) {
    const c = contactBySite.get(supportSiteId);
    const p = prereqBySite.get(supportSiteId);
    const s = screenBySite.get(supportSiteId);
    if (!c || !p || !s) continue;
    routes.add(c.routeId);
    const rowBlockers = [];
    if (c.capability !== 'UNILATERAL_REST'
        || c.verticalContactDirection !== 'GLOBAL_Z_PLUS'
        || c.tensileReactionPermitted !== false
        || c.initialState !== 'CONTACTING'
        || c.gapConvention !== 'POSITIVE_OPEN_PIPE_TO_SUPPORT') {
      rowBlockers.push(issue('PREPRODUCTION_TL04_V1_SUPPORT_CLASS_UNQUALIFIED', supportSiteId, 'TL-04 V1 admits only initially contacting unilateral +Z rests.'));
    }
    if (p.status !== 'QUALIFIED'
        || p.contactRowSemanticHash !== c.semanticHash
        || p.routeChainageMm !== c.routeChainageMm
        || s.contactRowSemanticHash !== c.semanticHash
        || s.prerequisiteRowSemanticHash !== p.semanticHash) {
      rowBlockers.push(issue('PREPRODUCTION_TL04_SUPPORT_BINDING_STALE', supportSiteId, 'TL-04 support row custody is stale or inconsistent.'));
    }
    if (!Number.isFinite(c.routeChainageMm)
        || !Number.isFinite(c.coldGapM) || c.coldGapM < 0
        || !Number.isFinite(s.coldGravityReactionN) || s.coldGravityReactionN < 0
        || !Number.isFinite(p.usedUpwardRelativeDisplacementM)) {
      rowBlockers.push(issue('PREPRODUCTION_TL04_SUPPORT_NUMERICAL_AUTHORITY_INVALID', supportSiteId, 'TL-04 support numerical authority is incomplete.'));
    }
    blockers.push(...rowBlockers);
    if (rowBlockers.length) continue;
    supports.push(freezeHash({
      supportKey: c.supportKey,
      supportSiteId,
      routeId: c.routeId,
      routeChainageMm: c.routeChainageMm,
      coldGravityReactionN: s.coldGravityReactionN,
      coldGapM: c.coldGapM,
      usedUpwardRelativeDisplacementM: p.usedUpwardRelativeDisplacementM,
      freeOpeningM: c.coldGapM + p.usedUpwardRelativeDisplacementM,
      tl03Classification: s.classification,
      contactRowSemanticHash: c.semanticHash,
      prerequisiteRowSemanticHash: p.semanticHash,
      tl03SupportScreenSemanticHash: s.semanticHash,
      displacementSemanticHash: p.displacementSemanticHash,
    }));
  }
  if (routes.size !== 1) {
    blockers.push(issue(
      'PREPRODUCTION_TL04_V1_SINGLE_ROUTE_CLASS_REQUIRED',
      'authority',
      'TL-04 V1 qualifies one reduced single-route TL-B template at a time.',
      { routeIds: [...routes].sort(ascii) },
    ));
  }

  const matrix = flexibility.data?.values || [];
  if (!matrixShape(matrix, flexibility.ordering.length)) {
    blockers.push(issue('PREPRODUCTION_TL04_FLEXIBILITY_MATRIX_SHAPE_INVALID', 'authority', 'Flexibility matrix shape must match exact support ordering.'));
  } else {
    for (let i = 0; i < matrix.length; i += 1) {
      if (!(matrix[i][i] > 0)) {
        blockers.push(issue('PREPRODUCTION_TL04_FLEXIBILITY_DIAGONAL_INVALID', flexibility.ordering[i], 'Flexibility diagonal must be positive.'));
      }
      for (let j = i + 1; j < matrix.length; j += 1) {
        if (Math.abs(matrix[i][j] - matrix[j][i]) > numerical.matrixSymmetryToleranceMPerN) {
          blockers.push(issue('PREPRODUCTION_TL04_FLEXIBILITY_MATRIX_ASYMMETRIC', `${flexibility.ordering[i]}|${flexibility.ordering[j]}`, 'Flexibility matrix symmetry exceeds governed tolerance.'));
        }
      }
    }
  }

  const targetCases = cold.distribution.loadCases.filter((row) => row.loadCaseId === localScreen.loadCaseId && row.status === 'CALCULATED');
  if (targetCases.length !== 1) {
    blockers.push(issue('PREPRODUCTION_TL04_COLD_GRAVITY_CASE_MISMATCH', localScreen.loadCaseId, 'TL-04 requires exactly one calculated cold gravity case matching TL-03.'));
  }
  const targetCase = targetCases.length === 1 ? targetCases[0] : null;
  const rawContributions = targetCase?.contributionLedger || [];
  if (!Array.isArray(rawContributions) || rawContributions.length === 0) {
    blockers.push(issue('PREPRODUCTION_TL04_GRAVITY_LEDGER_REQUIRED', 'authority', 'TL-04 gravity re-bracketing requires the immutable contribution ledger from the cold receipt.'));
  }
  const gravityContributions = [];
  const contributionIds = new Set();
  for (const row of Array.isArray(rawContributions) ? rawContributions : []) {
    const rowBlockers = [];
    let contributionId = null;
    let routeId = null;
    try {
      contributionId = text(row?.contributionId, 'contributionId');
      routeId = text(row?.routeId, 'routeId');
    } catch {
      rowBlockers.push(issue('PREPRODUCTION_TL04_GRAVITY_CONTRIBUTION_IDENTITY_INVALID', 'gravityLedger', 'Gravity contribution identity/route is invalid.'));
    }
    if (contributionId && contributionIds.has(contributionId)) {
      rowBlockers.push(issue('PREPRODUCTION_TL04_GRAVITY_CONTRIBUTION_DUPLICATE', contributionId, 'Gravity contribution IDs must be unique.'));
    }
    if (contributionId) contributionIds.add(contributionId);
    if (!Number.isFinite(row?.verticalForceN) || row.verticalForceN < 0 || !Number.isFinite(row?.chainageMm)) {
      rowBlockers.push(issue('PREPRODUCTION_TL04_GRAVITY_CONTRIBUTION_NUMERICAL_INVALID', contributionId || 'gravityLedger', 'Gravity contribution force/chainage must be finite and non-negative in the governed reaction convention.'));
    }
    if (routes.size === 1 && routeId && !routes.has(routeId)) {
      rowBlockers.push(issue('PREPRODUCTION_TL04_GRAVITY_CONTRIBUTION_ROUTE_MISMATCH', contributionId || 'gravityLedger', 'Gravity contribution lies outside the qualified TL-04 route.'));
    }
    blockers.push(...rowBlockers);
    if (rowBlockers.length) continue;
    gravityContributions.push(freezeHash({
      contributionId,
      routeId,
      verticalForceN: row.verticalForceN,
      chainageMm: row.chainageMm,
      sourceContributionSemanticHash: semanticHash(row),
    }));
  }
  gravityContributions.sort((a, b) => ascii(a.contributionId, b.contributionId));

  const finalBlockers = uniqueIssues(blockers);
  const ready = finalBlockers.length === 0
    && supports.length === flexibility.ordering.length
    && gravityContributions.length === rawContributions.length
    && rawContributions.length > 0;
  const sourceBindings = {
    coldGravityExecutionSemanticHash: cold.semanticHash,
    coldGravityDistributionSemanticHash: cold.distributionSemanticHash,
    contactAuthoritySemanticHash: contact.semanticHash,
    prerequisiteAuthoritySemanticHash: prerequisite.semanticHash,
    localScreenSemanticHash: localScreen.semanticHash,
    flexibilityEvidenceSemanticHash: flexibility.semanticHash,
    numericalAuthoritySemanticHash: numerical.semanticHash,
  };
  const material = {
    schema: PREPRODUCTION_TL04_ACTIVE_SET_INTAKE_SCHEMA,
    method: PREPRODUCTION_TL04_METHOD_ID,
    applicabilityClass: 'TL-B_REDUCED_FLEXIBILITY_SINGLE_ROUTE_V1',
    datasetId: cold.datasetId,
    loadCaseId: localScreen.loadCaseId,
    coldGravityMethod: cold.executedMethod,
    routeId: ready ? [...routes][0] : null,
    reactionToleranceN: localScreen.reactionToleranceN,
    sourceBindings,
    status: ready ? 'READY_FOR_TL04_ACTIVE_SET' : 'BLOCKED',
    ordering: ready ? [...flexibility.ordering] : [],
    supports: ready ? supports : [],
    gravityContributions: ready ? gravityContributions : [],
    flexibilityMatrixMPerN: ready ? matrix.map((row) => [...row]) : [],
    numericalControls: {
      gapToleranceM: numerical.gapToleranceM,
      complementarityToleranceNM: numerical.complementarityToleranceNM,
      gravityParityToleranceN: numerical.gravityParityToleranceN,
      forceToleranceN: numerical.forceToleranceN,
      momentToleranceNmm: numerical.momentToleranceNmm,
      matrixPivotToleranceMPerN: numerical.matrixPivotToleranceMPerN,
      maxIterations: numerical.maxIterations,
    },
    blockers: finalBlockers,
    summary: {
      supportCount: ready ? supports.length : 0,
      contributionCount: ready ? gravityContributions.length : 0,
      tl03LiftoffCandidateCount: ready ? supports.filter((row) => row.tl03Classification === 'LIFTOFF_CANDIDATE').length : 0,
      blockerCount: finalBlockers.length,
    },
    policy: {
      productionCalculationConsumptionEnabled: false,
      productionMethodRegistrationPermitted: false,
      defaultUiExposurePermitted: false,
      gravitySourceRecalculationPermitted: false,
      gravityContributionRebracketingPermitted: ready,
      coupledFlexibilitySolvePermitted: ready,
      stiffnessSubmatrixReductionPermitted: false,
      activeSetExecutionPermitted: ready,
      recontactEvaluationPermitted: ready,
      negativeReactionClampingPermitted: false,
      springMechanicsExecuted: false,
      frictionMechanicsExecuted: false,
      finalHotReactionPublicationPermitted: false,
    },
  };
  return requirePreproductionThermalLiftoffActiveSetIntake(freezeHash(material));
}

export function requirePreproductionThermalLiftoffActiveSetIntake(value) {
  if (value?.schema !== PREPRODUCTION_TL04_ACTIVE_SET_INTAKE_SCHEMA) {
    throw coded('PREPRODUCTION_TL04_INTAKE_SCHEMA_INVALID');
  }
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) throw coded('PREPRODUCTION_TL04_INTAKE_HASH_MISMATCH');
  if (value.method !== PREPRODUCTION_TL04_METHOD_ID
      || value.applicabilityClass !== 'TL-B_REDUCED_FLEXIBILITY_SINGLE_ROUTE_V1'
      || !['READY_FOR_TL04_ACTIVE_SET', 'BLOCKED'].includes(value.status)) {
    throw coded('PREPRODUCTION_TL04_INTAKE_IDENTITY_INVALID');
  }
  text(value.datasetId, 'datasetId');
  text(value.loadCaseId, 'loadCaseId');
  if (!['CHAINAGE_TRIBUTARY_SPAN_V2', 'CHAINAGE_TRIBUTARY_SPAN_V3_COG'].includes(value.coldGravityMethod)) {
    throw coded('PREPRODUCTION_TL04_INTAKE_GRAVITY_METHOD_INVALID');
  }
  nonnegative(value.reactionToleranceN, 'reactionToleranceN');
  requireSourceBindings(value.sourceBindings);
  requireNumericalControls(value.numericalControls);
  if (!Array.isArray(value.ordering) || !Array.isArray(value.supports)
      || !Array.isArray(value.gravityContributions) || !Array.isArray(value.flexibilityMatrixMPerN)
      || !Array.isArray(value.blockers)) {
    throw new TypeError('TL-04 intake arrays are invalid.');
  }
  if (value.status === 'BLOCKED') {
    if (value.ordering.length || value.supports.length || value.gravityContributions.length || value.flexibilityMatrixMPerN.length) {
      throw coded('PREPRODUCTION_TL04_BLOCKED_INTAKE_PARTIAL_INVALID');
    }
  } else {
    text(value.routeId, 'routeId');
    if (value.blockers.length) throw coded('PREPRODUCTION_TL04_READY_INTAKE_BLOCKED');
    if (!strictlyUnique(value.ordering) || value.ordering.length === 0) {
      throw coded('PREPRODUCTION_TL04_INTAKE_ORDERING_INVALID');
    }
    const supportIds = value.supports.map(requireIntakeSupport);
    if (JSON.stringify(supportIds) !== JSON.stringify(value.ordering)) {
      throw coded('PREPRODUCTION_TL04_INTAKE_SUPPORT_ORDER_MISMATCH');
    }
    if (!matrixShape(value.flexibilityMatrixMPerN, value.ordering.length)) {
      throw coded('PREPRODUCTION_TL04_INTAKE_MATRIX_SHAPE_INVALID');
    }
    for (const contribution of value.gravityContributions) requireGravityContribution(contribution, value.routeId);
  }
  const expectedSummary = {
    supportCount: value.status === 'READY_FOR_TL04_ACTIVE_SET' ? value.supports.length : 0,
    contributionCount: value.status === 'READY_FOR_TL04_ACTIVE_SET' ? value.gravityContributions.length : 0,
    tl03LiftoffCandidateCount: value.status === 'READY_FOR_TL04_ACTIVE_SET'
      ? value.supports.filter((row) => row.tl03Classification === 'LIFTOFF_CANDIDATE').length : 0,
    blockerCount: value.blockers.length,
  };
  if (semanticHash(expectedSummary) !== semanticHash(value.summary)) {
    throw coded('PREPRODUCTION_TL04_INTAKE_SUMMARY_INVALID');
  }
  const policy = value.policy || {};
  const ready = value.status === 'READY_FOR_TL04_ACTIVE_SET';
  if (policy.productionCalculationConsumptionEnabled !== false
      || policy.productionMethodRegistrationPermitted !== false
      || policy.defaultUiExposurePermitted !== false
      || policy.gravitySourceRecalculationPermitted !== false
      || policy.gravityContributionRebracketingPermitted !== ready
      || policy.coupledFlexibilitySolvePermitted !== ready
      || policy.stiffnessSubmatrixReductionPermitted !== false
      || policy.activeSetExecutionPermitted !== ready
      || policy.recontactEvaluationPermitted !== ready
      || policy.negativeReactionClampingPermitted !== false
      || policy.springMechanicsExecuted !== false
      || policy.frictionMechanicsExecuted !== false
      || policy.finalHotReactionPublicationPermitted !== false) {
    throw coded('PREPRODUCTION_TL04_INTAKE_POLICY_INVALID');
  }
  return deepFreeze(structuredClone(value));
}

function requireIntakeSupport(value) {
  exactKeys(value, [
    'supportKey', 'supportSiteId', 'routeId', 'routeChainageMm',
    'coldGravityReactionN', 'coldGapM', 'usedUpwardRelativeDisplacementM',
    'freeOpeningM', 'tl03Classification', 'contactRowSemanticHash',
    'prerequisiteRowSemanticHash', 'tl03SupportScreenSemanticHash',
    'displacementSemanticHash', 'semanticHash',
  ], 'TL-04 intake support');
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) throw coded('PREPRODUCTION_TL04_INTAKE_SUPPORT_HASH_MISMATCH');
  text(value.supportKey, 'supportKey');
  const supportSiteId = text(value.supportSiteId, 'supportSiteId');
  text(value.routeId, 'routeId');
  finite(value.routeChainageMm, 'routeChainageMm');
  nonnegative(value.coldGravityReactionN, 'coldGravityReactionN');
  nonnegative(value.coldGapM, 'coldGapM');
  finite(value.usedUpwardRelativeDisplacementM, 'usedUpwardRelativeDisplacementM');
  finite(value.freeOpeningM, 'freeOpeningM');
  if (value.freeOpeningM !== value.coldGapM + value.usedUpwardRelativeDisplacementM) {
    throw coded('PREPRODUCTION_TL04_FREE_OPENING_ARITHMETIC_MISMATCH');
  }
  if (!['CONTACT_RETAINED_CANDIDATE', 'LIFTOFF_CANDIDATE'].includes(value.tl03Classification)) {
    throw coded('PREPRODUCTION_TL04_TL03_CLASSIFICATION_INVALID');
  }
  for (const key of ['contactRowSemanticHash', 'prerequisiteRowSemanticHash', 'tl03SupportScreenSemanticHash', 'displacementSemanticHash']) {
    hash(value[key], key);
  }
  return supportSiteId;
}

function requireGravityContribution(value, routeId) {
  exactKeys(value, ['contributionId', 'routeId', 'verticalForceN', 'chainageMm', 'sourceContributionSemanticHash', 'semanticHash'], 'TL-04 gravity contribution');
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) throw coded('PREPRODUCTION_TL04_GRAVITY_CONTRIBUTION_HASH_MISMATCH');
  text(value.contributionId, 'contributionId');
  if (text(value.routeId, 'routeId') !== routeId) throw coded('PREPRODUCTION_TL04_GRAVITY_CONTRIBUTION_ROUTE_MISMATCH');
  nonnegative(value.verticalForceN, 'verticalForceN');
  finite(value.chainageMm, 'chainageMm');
  hash(value.sourceContributionSemanticHash, 'sourceContributionSemanticHash');
}

function requireNumericalControls(value) {
  exactKeys(value, [
    'gapToleranceM', 'complementarityToleranceNM', 'gravityParityToleranceN',
    'forceToleranceN', 'momentToleranceNmm', 'matrixPivotToleranceMPerN',
    'maxIterations',
  ], 'TL-04 numerical controls');
  nonnegative(value.gapToleranceM, 'gapToleranceM');
  nonnegative(value.complementarityToleranceNM, 'complementarityToleranceNM');
  nonnegative(value.gravityParityToleranceN, 'gravityParityToleranceN');
  nonnegative(value.forceToleranceN, 'forceToleranceN');
  nonnegative(value.momentToleranceNmm, 'momentToleranceNmm');
  positive(value.matrixPivotToleranceMPerN, 'matrixPivotToleranceMPerN');
  positiveInteger(value.maxIterations, 'maxIterations');
}

function requireSourceBindings(value) {
  exactKeys(value, [
    'coldGravityExecutionSemanticHash', 'coldGravityDistributionSemanticHash',
    'contactAuthoritySemanticHash', 'prerequisiteAuthoritySemanticHash',
    'localScreenSemanticHash', 'flexibilityEvidenceSemanticHash',
    'numericalAuthoritySemanticHash',
  ], 'TL-04 source bindings');
  Object.entries(value).forEach(([key, item]) => hash(item, key));
}
function matrixShape(value, size) {
  return Array.isArray(value) && value.length === size
    && value.every((row) => Array.isArray(row) && row.length === size && row.every(Number.isFinite));
}
function uniqueMap(rows, key, blockers, code) {
  const map = new Map();
  for (const row of rows) {
    if (map.has(row[key])) blockers.push(issue(code, row[key], 'Authority rows must be unique by exact support identity.'));
    else map.set(row[key], row);
  }
  return map;
}
function bySite(a, b) { return ascii(a.supportSiteId, b.supportSiteId); }
function sameSet(a, b) { return JSON.stringify([...a].sort(ascii)) === JSON.stringify([...b].sort(ascii)); }
function strictlyUnique(values) { return new Set(values).size === values.length && values.every((value) => typeof value === 'string' && value.length > 0); }
function sourceIdentity(value, label) {
  exactKeys(value, ['sourceId', 'sourceRevision', 'sourceSemanticHash', 'sourceKind'], label);
  return deepFreeze({
    sourceId: text(value.sourceId, 'sourceId'),
    sourceRevision: text(value.sourceRevision, 'sourceRevision'),
    sourceSemanticHash: hash(value.sourceSemanticHash, 'sourceSemanticHash'),
    sourceKind: text(value.sourceKind, 'sourceKind'),
  });
}
function benchmark(value) {
  exactKeys(value, ['benchmarkId', 'benchmarkRevision', 'benchmarkSemanticHash'], 'benchmarkReference');
  return deepFreeze({
    benchmarkId: text(value.benchmarkId, 'benchmarkId'),
    benchmarkRevision: text(value.benchmarkRevision, 'benchmarkRevision'),
    benchmarkSemanticHash: hash(value.benchmarkSemanticHash, 'benchmarkSemanticHash'),
  });
}
function issue(code, scope, message, details = null) { return deepFreeze({ code, severity: 'ERROR', scope, message, details }); }
function uniqueIssues(values) {
  const map = new Map();
  for (const row of values) map.set(`${row.code}|${row.scope}`, row);
  return [...map.values()].sort((a, b) => ascii(`${a.code}|${a.scope}`, `${b.code}|${b.scope}`));
}
function freezeHash(material) { return deepFreeze({ ...material, semanticHash: semanticHash(material) }); }
function exactKeys(value, keys, label) {
  if (!isPlainRecord(value)
      || JSON.stringify(Object.keys(value).sort(ascii)) !== JSON.stringify([...keys].sort(ascii))) {
    throw new TypeError(`${label} contains unexpected or missing keys.`);
  }
}
function text(value, label) { const result = stringValue(value); if (!result) throw new TypeError(`${label} must be non-empty.`); return result; }
function finite(value, label) { if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`); return value; }
function nonnegative(value, label) { const result = finite(value, label); if (result < 0) throw new TypeError(`${label} must be non-negative.`); return result; }
function positive(value, label) { const result = finite(value, label); if (result <= 0) throw new TypeError(`${label} must be positive.`); return result; }
function positiveInteger(value, label) { if (!Number.isInteger(value) || value <= 0) throw new TypeError(`${label} must be a positive integer.`); return value; }
function hash(value, label) { if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) throw new TypeError(`${label} must be an FNV-1a hash.`); return value; }
function ascii(a, b) { return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0; }
function coded(code) { const error = new Error(code); error.code = code; return error; }
