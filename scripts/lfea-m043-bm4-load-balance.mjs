import {
  DOF_ORDER,
  M043_LADDER_POLICY,
  caesarReactionSumSI,
  compareValue,
  lfeaReactionSum,
  passRate,
} from './lfea-m043-bm4-ladder-fixtures.mjs';

// M043 L2: global load balance parity.
//
// For any converged static solve the reaction total must equal the applied load
// total. So comparing LFEA's summed reactions against CAESAR's summed reactions
// tests the LOAD VECTOR and the RESTRAINT SET while being completely
// independent of the stiffness matrix: K cancels out of a total-force balance.
//
// That independence is what makes this the cheapest useful level. It cannot be
// confused by a stiffness error, so a disagreement here is unambiguously an
// applied-load or restraint-inventory defect, and an agreement here eliminates
// the entire mass/density/length/unit error class in one comparison.
//
// A worked example of its discriminating power, from this benchmark: BM4's
// InputXML declares twelve FORCESMOMENTS point-load records which the geometry
// adapter retains but never compiles. Whether those belong in cases 19/20/21
// was argued from case-formula strings without resolution. This level settles
// it arithmetically -- every case in Output_BM4.xml reports sum(FX) = sum(FZ) =
// 0 and every weight-bearing case reports sum(FY) = -93512.43 N exactly, while
// force set F1 alone would inject FX = -3500 N, FY = +6000 N, FZ = +2500 N.
// The loads are in no case, and no element-force comparison was needed to know.

const FORCE_DOFS = new Set(['UX', 'UY', 'UZ']);

function floorFor(dof) {
  return FORCE_DOFS.has(dof)
    ? M043_LADDER_POLICY.loadBalance.absoluteForceFloorNewtons
    : M043_LADDER_POLICY.loadBalance.absoluteMomentFloorNewtonMetres;
}

/**
 * Compare summed reactions, per DOF, for one case.
 *
 * @param {Readonly<object>} analysis Solved case (`analyseM035M036Case` shape).
 * @param {Readonly<object>} cii Parsed CAESAR output authority.
 * @param {string} caseLabel 'SUS' | 'OPE' | 'EXP'.
 */
export function auditGlobalLoadBalance({ analysis, cii, caseLabel }) {
  const caesar = caesarReactionSumSI(cii, caseLabel);
  const lfea = lfeaReactionSum(analysis.execution);
  const rows = DOF_ORDER.map((dof) => Object.freeze({
    dof,
    family: FORCE_DOFS.has(dof) ? 'FORCE' : 'MOMENT',
    units: FORCE_DOFS.has(dof) ? 'N' : 'N*m',
    ...compareValue(lfea.sum[dof], caesar.sum[dof], {
      floor: floorFor(dof),
      tolerancePercent: M043_LADDER_POLICY.loadBalance.relativeTolerancePercent,
    }),
  }));
  const forceRows = rows.filter((row) => row.family === 'FORCE');
  const momentRows = rows.filter((row) => row.family === 'MOMENT');
  return Object.freeze({
    level: 'L2',
    name: 'GLOBAL_LOAD_BALANCE',
    caseLabel,
    isolates: 'APPLIED_LOAD_VECTOR_AND_RESTRAINT_SET_INDEPENDENT_OF_STIFFNESS',
    caesarRestraintRowCount: caesar.rowCount,
    lfeaReactionDofCount: lfea.dofCount,
    reactionSignConvention: M043_LADDER_POLICY.reactionSignConvention,
    rows: Object.freeze(rows),
    summary: Object.freeze({
      all: passRate(rows),
      force: passRate(forceRows),
      moment: passRate(momentRows),
    }),
    status: rows.every((row) => row.passed) ? 'MATCHED' : 'DIVERGED',
  });
}

/**
 * Cross-case invariant: any two cases whose formulas share the same
 * weight/pressure content must report the same applied-load total, and any case
 * containing no horizontal load source must report zero horizontal total.
 *
 * This is a check on the AUTHORITY, not on LFEA -- it reads CAESAR against
 * itself. It is what converts "the case formula string does not mention F" from
 * an inference into a measurement, so it is reported alongside L2 rather than
 * buried in a comment.
 */
export function auditCaesarCaseLoadInvariants(cii) {
  const rows = [];
  for (const caseLabel of ['SUS', 'OPE', 'EXP']) {
    const caesar = caesarReactionSumSI(cii, caseLabel);
    rows.push(Object.freeze({
      caseLabel,
      restraintRowCount: caesar.rowCount,
      total: caesar.sum,
      horizontalTotalMagnitude: Math.hypot(caesar.sum.UX, caesar.sum.UZ),
    }));
  }
  const sus = rows.find((row) => row.caseLabel === 'SUS');
  const ope = rows.find((row) => row.caseLabel === 'OPE');
  const forceFloor = M043_LADDER_POLICY.loadBalance.absoluteForceFloorNewtons;
  const verticalTotalsAgree = Math.abs(sus.total.UY - ope.total.UY) <= forceFloor;
  const horizontalTotalsVanish = rows.every((row) => row.horizontalTotalMagnitude <= forceFloor);
  return Object.freeze({
    level: 'L2',
    name: 'CAESAR_CASE_LOAD_INVARIANTS',
    subject: 'AUTHORITY_SELF_CONSISTENCY_NOT_LFEA',
    rows: Object.freeze(rows),
    verticalTotalsAgreeBetweenSusAndOpe: verticalTotalsAgree,
    horizontalTotalsVanishInEveryCase: horizontalTotalsVanish,
    // If SUS and OPE carry an identical vertical total and no case carries any
    // horizontal total, then no case in this authority contains an applied
    // force set beyond weight and pressure.
    appliedForceSetPresentInAnyCase: !(verticalTotalsAgree && horizontalTotalsVanish),
    interpretation: verticalTotalsAgree && horizontalTotalsVanish
      ? 'NO_APPLIED_FORCE_SET_IN_CASES_19_20_21'
      : 'APPLIED_FORCE_SET_CONTENT_PRESENT_REQUIRES_ATTRIBUTION',
  });
}
