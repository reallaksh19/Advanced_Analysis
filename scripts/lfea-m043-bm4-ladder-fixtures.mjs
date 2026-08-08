import { DOF_ORDER } from '../src/core/linear-fea-contract/conventions.js';
import { loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';

// M043: BM4 causal-order verification ladder.
//
// Earlier BM4 root-cause work (M035..M042) compared element-end forces --
// `k_local * T * u`, three transformations downstream of the solve -- and then
// reasoned backwards from individual failing rows. That surface mixes every
// upstream error together, so it cannot discriminate between a wrong load, a
// wrong stiffness and a wrong recovery, and it produced two disproven
// mechanisms in a row.
//
// This module family compares in CAUSAL ORDER instead, and is meant to be read
// top-down, stopping at the first level that disagrees:
//
//   L0  source parity (coordinates, sections, materials)   -- BLOCKED, see below
//   L2  global load balance      -> load vector + restraint set, independent of K
//   L3  nodal displacement       -> K and F jointly; the primary solve unknown
//   L4  residual retrace K*u-F   -> WHICH dof/element of K or F is wrong
//
// L1 (element stiffness vs closed form) is already covered by the standing
// B-3.x checks and is not re-implemented here. L5..L7 (per-node reactions,
// element forces, code stress) are deliberately downstream of this ladder.

export const M043_LADDER_POLICY = Object.freeze({
  schema: 'lfea-m043-bm4-ladder-policy/v1',
  // Displacement comparison: relative bar, with an absolute floor below which a
  // reference value is treated as zero rather than generating a meaningless
  // percentage. 1 micron / 1 microradian are far below any real result here.
  displacement: Object.freeze({
    targetTolerancePercent: 5,
    translationFloorMetres: 1e-6,
    rotationFloorRadians: 1e-6,
  }),
  // Global load balance. The identity is sum(R) = -sum(F): summing K*u - F over
  // every DOF gives sum(K*u) - sum(F) = sum(R), and sum(K*u) vanishes because a
  // correct element stiffness carries rigid-body modes in its null space.
  //
  // But that summation also accumulates the free-DOF algebraic residual, which
  // at BM4's conditioning (~1.7e15) is not negligible: measured leakage into the
  // reaction sum on the real model is 80.3 N (OPE UX) and 17.1 N (OPE UZ) where
  // the true applied horizontal load is exactly zero. The absolute floors below
  // are set from that measurement with ~1.9x margin, so the level reports what it
  // can actually resolve instead of raising an alarm on solver noise. Note this
  // is a strictly weaker check than the solver's own forceEquilibriumCheck,
  // which tests sum(K*u) ~ 0 and is residual-free by construction.
  loadBalance: Object.freeze({
    relativeTolerancePercent: 1,
    absoluteForceFloorNewtons: 150,
    absoluteForceFloorSource: 'M043 measurement on real BM4: accumulated free-DOF residual leakage into the reaction sum reaches 80.3 N against an exactly-zero applied horizontal load at condition ~1.7e15',
    absoluteMomentFloorNewtonMetres: 5,
    absoluteMomentFloorSource: 'M043 measurement on real BM4: RX reaction-sum delta 0.35-0.39 N*m against a ~10 N*m reference is at the same noise scale',
  }),
  // Residual retrace self-test. Feeding LFEA's own displacement vector back
  // through LFEA's own stiffness and loads must reproduce two quantities the
  // solver already reported independently.
  //
  // The reaction gate is the real integrity test, and it is exact: reproducing
  // the solver's own reaction vector requires the sign convention, the DOF
  // ordering, the row-major 12x12 layout AND the load-assembly rule to all be
  // right simultaneously. Nothing else in the retrace can be wrong if this
  // passes, so it is held at 1e-6 relative (measured: 6.2e-15).
  //
  // The free-DOF gate cannot be tighter than the solve's own algebraic residual,
  // because that residual IS the free-DOF imbalance -- K*u = F is only satisfied
  // to the precision the factorisation achieved. Rather than invent a number,
  // this reads the model's already-qualified conditioning envelope from
  // BM4_SOLVER_CONDITIONING_PROFILE.normalizedResidualWarnLimit, the same
  // authority the solver itself uses to decide CONDITIONAL versus BLOCKED.
  retraceSelfTest: Object.freeze({
    freeDofLimitSource: 'BM4_SOLVER_CONDITIONING_PROFILE.normalizedResidualWarnLimit',
    reactionRelativeLimit: 1e-6,
    reactionAbsoluteFloorNewtons: 1e-3,
  }),
  // CAESAR reports restraint reactions as force-on-support; the linear solver
  // reports force-on-structure. Established by direct measurement across all 29
  // BM4 +Y shoes (magnitudes agreed, signs opposed).
  reactionSignConvention: 'CAESAR_REPORTS_FORCE_ON_SUPPORT_LFEA_REPORTS_FORCE_ON_STRUCTURE',

  // Resolution limit of the retrace, and the reason L4 needs an error bar.
  //
  // The retrace forms K*u using an EXTERNALLY SERIALISED displacement vector, so
  // it amplifies that vector's print precision by the stiffness magnitude. Every
  // one of the 4704 displacement values in Output_BM4.xml is written to exactly
  // six decimal places, in mm and deg, so the worst-case rounding error is half
  // an ulp of that format.
  //
  // That would be harmless on a uniformly-discretised model. BM4 is not: it
  // carries CAESAR connector stubs as short as 0.0002 m, and frame stiffness
  // scales as EA/L and EI/L^3, so those elements reach |K| ~ 1.5e19 N/m. The
  // product 1.5e19 * 8.73e-9 = 1.3e11 N is pure serialisation noise, and it
  // swamps a model whose entire weight is 93.5 kN.
  //
  // Measured confirmation that this is the dominant term rather than a modelling
  // error: predicted worst-case noise 2.7e11 N against an observed worst nodal
  // residual of 2.2e11 N (SUS) -- agreement to a factor of ~1.2, while the
  // retrace's own self-test reproduces the solver's reactions to 6.2e-15. So the
  // residual is propagated input precision, not signal, and every L4 conclusion
  // must be gated on a per-DOF noise bound rather than on the residual alone.
  authorityDisplacementPrecision: Object.freeze({
    translationMetres: 0.5e-9,
    rotationRadians: 0.5e-6 * (Math.PI / 180),
    source: 'Output_BM4.xml serialises all 4704 DISPLACEMENT_REPORT values to exactly 6 decimal places in mm./deg.; half-ulp of that format',
    // A residual below its own worst-case noise bound carries no information. The
    // bound is a hard maximum (all rounding errors aligned), not a standard
    // deviation, so exceeding it by any margin already means signal.
    resolvableSignalToNoiseRatio: 1,
    // Per-element admission budget. An element is inside the retrace's domain of
    // validity only if its stiffness magnitude, multiplied by the authority's
    // displacement precision, stays below this force. Set at the same scale as
    // the L2 reaction-sum noise floor (150 N) so both levels declare comparable
    // resolving power; excludes BM4's ~1e14..1e19 N/m connector stubs and admits
    // its ordinary 1e8..1e10 N/m pipe runs.
    elementNoiseBudgetNewtons: 100,
    elementNoiseBudgetSource: 'M043: set at the same scale as the measured L2 reaction-sum noise floor; corresponds to admitting |K| up to ~1.1e10 N/m at this authority precision',
  }),
});

// CASE 19/20/21 only, matching the dispatched BM4 scope. Output_BM4.xml also
// carries a second SUS/OPE/EXP trio (2/17/40) which this ladder does not read.
export const M043_CASES = Object.freeze(['SUS', 'OPE', 'EXP']);

// L4 is an equilibrium identity on a real solve. EXP (L21 = L20 - L19) is a
// reported difference of two solves, not a solve, so the identity only applies
// to it if the load vectors are differenced too. That is derivable but out of
// scope for this delivery, and pretending otherwise would put a meaningless
// residual in the report.
export const M043_RETRACEABLE_CASES = Object.freeze(['SUS', 'OPE']);

// L0 needs an independent coordinate/section oracle. Output_BM4.xml carries
// only the same element deltas LFEA already walks to build its geometry, so
// comparing against it would be circular. The CAESAR .accdb export does carry
// absolute per-node coordinates (INPUT_NODAL_COORDINATES) and real reducer
// geometry (INPUT_REDUCERS), but it is not a committed repository fixture and
// reading it requires mdbtools, which is not and should not become a build or
// CI dependency. Declared blocked rather than approximated.
export const M043_L0_DISPOSITION = Object.freeze({
  level: 'L0',
  name: 'SOURCE_PARITY',
  status: 'BLOCKED_PENDING_COMMITTED_ABSOLUTE_COORDINATE_FIXTURE',
  reason: 'Output_BM4.xml exposes only the element deltas LFEA already consumes, so an L0 check against it is circular. An independent absolute-coordinate oracle exists in the CAESAR .accdb export but is not a committed fixture.',
});

const MILLIMETRES_TO_METRES = 1e-3;
const DEGREES_TO_RADIANS = Math.PI / 180;

// CAESAR DISPLACEMENT_REPORT field -> analysis DOF. Translations are serialised
// in mm and rotations in deg (declared on the report's own UNITS attributes);
// the linear solver works in metres and radians throughout.
const DISPLACEMENT_FIELDS = Object.freeze([
  Object.freeze({ caesarField: 'DX', dof: 'UX', scale: MILLIMETRES_TO_METRES, family: 'TRANSLATION' }),
  Object.freeze({ caesarField: 'DY', dof: 'UY', scale: MILLIMETRES_TO_METRES, family: 'TRANSLATION' }),
  Object.freeze({ caesarField: 'DZ', dof: 'UZ', scale: MILLIMETRES_TO_METRES, family: 'TRANSLATION' }),
  Object.freeze({ caesarField: 'RX', dof: 'RX', scale: DEGREES_TO_RADIANS, family: 'ROTATION' }),
  Object.freeze({ caesarField: 'RY', dof: 'RY', scale: DEGREES_TO_RADIANS, family: 'ROTATION' }),
  Object.freeze({ caesarField: 'RZ', dof: 'RZ', scale: DEGREES_TO_RADIANS, family: 'ROTATION' }),
]);

export { DISPLACEMENT_FIELDS, DOF_ORDER };

export function loadBm4LadderAuthority() {
  return loadBm4CiiOutputCases1921();
}

/**
 * CAESAR displacements for one case, converted to SI and keyed by source node.
 *
 * @returns {Map<string, Readonly<Record<string, number>>>} nodeId -> {UX..RZ} in m/rad.
 */
export function caesarDisplacementSI(cii, caseLabel) {
  const report = cii.displacement.get(caseLabel);
  if (!report) throw new Error(`M043 has no CAESAR displacement report for ${caseLabel}.`);
  const result = new Map();
  for (const [nodeId, row] of report) {
    const converted = {};
    for (const field of DISPLACEMENT_FIELDS) {
      converted[field.dof] = row[field.caesarField] * field.scale;
    }
    result.set(String(nodeId), Object.freeze(converted));
  }
  return result;
}

/**
 * Sum of CAESAR restraint reactions for one case, sign-corrected to the linear
 * solver's force-on-structure convention.
 */
export function caesarReactionSumSI(cii, caseLabel) {
  const report = cii.restraint.get(caseLabel);
  if (!report) throw new Error(`M043 has no CAESAR restraint report for ${caseLabel}.`);
  const sum = { UX: 0, UY: 0, UZ: 0, RX: 0, RY: 0, RZ: 0 };
  let rowCount = 0;
  for (const row of report.values()) {
    // Negated: see M043_LADDER_POLICY.reactionSignConvention.
    sum.UX -= row.FX; sum.UY -= row.FY; sum.UZ -= row.FZ;
    sum.RX -= row.MX; sum.RY -= row.MY; sum.RZ -= row.MZ;
    rowCount += 1;
  }
  return Object.freeze({ rowCount, sum: Object.freeze(sum) });
}

/** Sum of a solved execution's own reaction vector, by DOF. */
export function lfeaReactionSum(execution) {
  const sum = { UX: 0, UY: 0, UZ: 0, RX: 0, RY: 0, RZ: 0 };
  for (const row of execution.reactions) {
    if (sum[row.dof] === undefined) continue;
    sum[row.dof] += row.value;
  }
  return Object.freeze({ dofCount: execution.reactions.length, sum: Object.freeze(sum) });
}

/** Index an execution vector ({nodeId, dof, value}[]) for O(1) lookup. */
export function indexNodeDofVector(entries) {
  const map = new Map();
  for (const row of entries) map.set(`${row.nodeId}|${row.dof}`, row.value);
  return map;
}

/**
 * Combined absolute-or-relative comparison, shared by every level of the ladder.
 *
 * A pure relative bar is wrong for quantities that are themselves near the
 * model's numerical resolution: it turns a 0.35 N*m discrepancy on a 94 kN model
 * into a 3.5% "failure" that means nothing. A pure absolute bar is wrong for
 * large quantities. The disjunction passes a row when it is either absolutely
 * small or relatively close, which is the standard engineering criterion and
 * keeps genuinely large relative disagreements on large values -- the ones worth
 * investigating -- fully visible.
 */
export function compareValue(ours, reference, { floor, tolerancePercent }) {
  const delta = ours - reference;
  const nearZeroReference = Math.abs(reference) <= floor;
  const percentDifference = nearZeroReference ? null : (delta / Math.abs(reference)) * 100;
  const withinAbsolute = Math.abs(delta) <= floor;
  const withinRelative = percentDifference !== null && Math.abs(percentDifference) <= tolerancePercent;
  return Object.freeze({
    ours,
    reference,
    delta,
    percentDifference,
    comparisonMode: nearZeroReference ? 'ABSOLUTE_NEAR_ZERO_REFERENCE' : 'ABSOLUTE_OR_RELATIVE',
    withinAbsolute,
    withinRelative,
    passed: withinAbsolute || withinRelative,
  });
}

/**
 * Least-squares slope of ours-vs-reference through the origin, plus sign
 * agreement.
 *
 * The slope is the single most informative scalar in the whole ladder: a slope
 * near 1 with high sign agreement means the model carries the right stiffness
 * and the error is a correction on top, while a slope far from 1 means the
 * model is globally too stiff or too soft and no amount of per-node chasing
 * will explain it. Sign agreement separates "wrong magnitude" from "wrong
 * mechanism": a near-random 50% means the response is not merely mis-scaled,
 * it is being driven by different physics.
 */
export function regressionAgainstReference(rows, floor) {
  const usable = rows.filter((row) => Math.abs(row.reference) > floor);
  if (usable.length === 0) {
    return Object.freeze({ sampleCount: 0, slope: null, signAgreement: null, signAgreementCount: 0 });
  }
  const numerator = usable.reduce((total, row) => total + row.ours * row.reference, 0);
  const denominator = usable.reduce((total, row) => total + row.reference * row.reference, 0);
  const signAgreementCount = usable.filter((row) => Math.sign(row.ours) === Math.sign(row.reference)).length;
  return Object.freeze({
    sampleCount: usable.length,
    slope: denominator === 0 ? null : numerator / denominator,
    signAgreement: signAgreementCount / usable.length,
    signAgreementCount,
  });
}

/** Pass-rate rollup used by every level's summary. */
export function passRate(rows) {
  const total = rows.length;
  const passedCount = rows.filter((row) => row.passed).length;
  return Object.freeze({
    total,
    passedCount,
    passedFraction: total === 0 ? null : passedCount / total,
  });
}
